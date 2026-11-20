// WindowKeeper.exe (20 Nov 2026, note section 6, point 9)
// Keeps every VS Code window drawing.
//
// Why: on 20 Nov 2026 a Ctrl+click on c2_draws opened the R data viewer in the
// floating VS Code window on the right screen, and that whole window stopped
// drawing: plain grey, no title bar, no tabs. VS Code itself was fine. A small
// change of the window's size made it draw again at once.
//
// What it does: it looks at each VS Code window (a picture of the window, the same
// way scripts\check-vscode.ps1 does). A window with at most two colours draws
// nothing. Such a window gets its size changed by a few pixels and back, which
// makes it draw again. It looks
//   - 1.5 and 5 seconds after a VS Code window changes its title (a new tab is
//     active, for example after a Ctrl+click on a data frame) or appears,
//   - after every unlock of Windows and every change of the screens,
//   - and every 30 seconds anyway.
// Every repair is written to log.txt next to the program.
//
// WindowKeeper.exe               run (started at login by the shortcut "VS Code window keeper")
// WindowKeeper.exe --quit        stop the running one
// WindowKeeper.exe --check       look once, write what it sees to log.txt, repair, stop
// WindowKeeper.exe --any-process also watch windows of other programs whose title ends in
//                                "Visual Studio Code" (only for testing)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Keeper
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr data);
    delegate bool EnumProc(IntPtr window, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Box box);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint which);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first, uint last, IntPtr module, EventProc proc, uint process, uint thread, uint flags);
    delegate void EventProc(IntPtr hook, uint what, IntPtr window, int objectId, int childId, uint thread, uint time);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [StructLayout(LayoutKind.Sequential)]
    struct Box { public int Left, Top, Right, Bottom; }

    const uint NoZOrder = 0x4, NoActivate = 0x10, NoMove = 0x2;
    const uint ShowEvent = 0x8002, NameChangeEvent = 0x800C;
    const uint OutOfContext = 0x0;

    static readonly string Folder = AppDomain.CurrentDomain.BaseDirectory;
    static bool anyProcess;
    static bool locked;
    static DateTime nextLook = DateTime.MaxValue;
    static DateTime secondLook = DateTime.MaxValue;
    static DateTime nextRound = DateTime.MinValue;
    static readonly Dictionary<IntPtr, DateTime> givenUp = new Dictionary<IntPtr, DateTime>();
    static EventProc eventProc;   // kept here so it is not thrown away while Windows still calls it

    static void Log(string text)
    {
        try
        {
            string file = Path.Combine(Folder, "log.txt");
            if (File.Exists(file) && new FileInfo(file).Length > 500000)
            {
                string[] lines = File.ReadAllLines(file);
                var keep = new List<string>();
                for (int i = Math.Max(0, lines.Length - 1000); i < lines.Length; i++) keep.Add(lines[i]);
                File.WriteAllLines(file, keep.ToArray());
            }
            File.AppendAllText(file, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + Environment.NewLine);
        }
        catch { }
    }

    static string TitleOf(IntPtr window)
    {
        var text = new StringBuilder(512);
        GetWindowText(window, text, 512);
        return text.ToString();
    }

    static bool IsVsCode(IntPtr window)
    {
        if (!IsWindowVisible(window) || IsIconic(window)) return false;
        if (!TitleOf(window).EndsWith("Visual Studio Code")) return false;
        if (anyProcess) return true;
        uint id;
        GetWindowThreadProcessId(window, out id);
        try { return Process.GetProcessById((int)id).ProcessName.Equals("Code", StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    static List<IntPtr> VsCodeWindows()
    {
        var found = new List<IntPtr>();
        EnumWindows((window, data) => { if (IsVsCode(window)) found.Add(window); return true; }, IntPtr.Zero);
        return found;
    }

    // how many colours a picture of the window has (2 or less: it draws nothing)
    static int Colours(IntPtr window)
    {
        Box box;
        GetWindowRect(window, out box);
        int width = box.Right - box.Left, height = box.Bottom - box.Top;
        if (width < 200 || height < 200) return 99;
        using (var picture = new Bitmap(width, height))
        {
            using (var canvas = Graphics.FromImage(picture))
            {
                IntPtr dc = canvas.GetHdc();
                PrintWindow(window, dc, 2);   // 2 = the full content, also when covered
                canvas.ReleaseHdc(dc);
            }
            var seen = new HashSet<int>();
            for (int x = 20; x < width - 20; x += 40)
                for (int y = 20; y < height - 20; y += 20)
                    seen.Add(picture.GetPixel(x, y).ToArgb());
            return seen.Count;
        }
    }

    // a few pixels narrower and back: the window builds its picture again
    static void Nudge(IntPtr window)
    {
        Box box;
        GetWindowRect(window, out box);
        int width = box.Right - box.Left, height = box.Bottom - box.Top;
        SetWindowPos(window, IntPtr.Zero, 0, 0, width - 8, height, NoMove | NoZOrder | NoActivate);
        Thread.Sleep(250);
        SetWindowPos(window, IntPtr.Zero, 0, 0, width, height, NoMove | NoZOrder | NoActivate);
    }

    // looks at every VS Code window and repairs the ones that draw nothing
    static void LookAll(string why)
    {
        nextRound = DateTime.Now.AddSeconds(30);
        if (locked) return;
        foreach (IntPtr window in VsCodeWindows())
        {
            DateTime until;
            if (givenUp.TryGetValue(window, out until) && DateTime.Now < until) continue;
            if (Colours(window) > 2) continue;
            // a window that is just opening is grey for a moment: look again after a second
            Thread.Sleep(1000);
            if (!IsVsCode(window) || Colours(window) > 2) continue;
            string title = TitleOf(window);
            bool fixedIt = false;
            for (int attempt = 1; attempt <= 2 && !fixedIt; attempt++)
            {
                Nudge(window);
                Thread.Sleep(800);
                fixedIt = Colours(window) > 2;
            }
            if (fixedIt)
            {
                Log("drew nothing, repaired (" + why + "): " + title);
            }
            else
            {
                givenUp[window] = DateTime.Now.AddMinutes(10);
                Log("drew nothing and a size change did not help (" + why + "): " + title +
                    ". Run scripts\\check-vscode.ps1 -Fix (it closes an empty floating window)");
            }
        }
    }

    // a VS Code window got a new title or appeared: look soon, and once more a bit later
    static void OnWindowEvent(IntPtr hook, uint what, IntPtr window, int objectId, int childId, uint thread, uint time)
    {
        if (objectId != 0 || childId != 0 || window == IntPtr.Zero) return;
        if (GetAncestor(window, 2) != window) return;   // only whole windows, not parts inside them
        if (!IsVsCode(window)) return;
        Soon();
    }

    static void Soon()
    {
        nextLook = DateTime.Now.AddSeconds(1.5);
        secondLook = DateTime.Now.AddSeconds(5);
    }

    static void OnTick(object sender, EventArgs e)
    {
        DateTime now = DateTime.Now;
        if (now >= nextLook) { nextLook = DateTime.MaxValue; LookAll("new tab or window"); }
        else if (now >= secondLook) { secondLook = DateTime.MaxValue; LookAll("new tab or window, second look"); }
        else if (now >= nextRound) LookAll("every 30 s");
    }

    [STAThread]
    static void Main(string[] args)
    {
        bool perScreen = false;
        try { perScreen = SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        if (!perScreen) SetProcessDPIAware();

        anyProcess = Array.IndexOf(args, "--any-process") >= 0;

        if (Array.IndexOf(args, "--quit") >= 0)
        {
            try { using (var quit = EventWaitHandle.OpenExisting("VsWindowKeeper-quit")) quit.Set(); } catch { }
            return;
        }
        if (Array.IndexOf(args, "--check") >= 0)
        {
            foreach (IntPtr window in VsCodeWindows()) Log("check: " + Colours(window) + " colours: " + TitleOf(window));
            LookAll("check");
            return;
        }

        bool first;
        using (var only = new Mutex(true, "VsWindowKeeper", out first))
        {
            if (!first) return;
            using (var quit = new EventWaitHandle(false, EventResetMode.AutoReset, "VsWindowKeeper-quit"))
            {
                Log("started" + (anyProcess ? " (test: any program)" : ""));
                eventProc = OnWindowEvent;
                SetWinEventHook(ShowEvent, ShowEvent, IntPtr.Zero, eventProc, 0, 0, OutOfContext);
                SetWinEventHook(NameChangeEvent, NameChangeEvent, IntPtr.Zero, eventProc, 0, 0, OutOfContext);
                SystemEvents.SessionSwitch += (s, e) =>
                {
                    if (e.Reason == SessionSwitchReason.SessionLock) locked = true;
                    if (e.Reason == SessionSwitchReason.SessionUnlock) { locked = false; Soon(); }
                };
                SystemEvents.DisplaySettingsChanged += (s, e) => Soon();

                var timer = new System.Windows.Forms.Timer();
                timer.Interval = 250;
                timer.Tick += OnTick;
                timer.Tick += (s, e) => { if (quit.WaitOne(0)) Application.ExitThread(); };
                timer.Start();
                Application.Run();
                Log("stopped");
            }
        }
    }
}
