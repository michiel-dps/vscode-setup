// EldenShow.exe
// Shows the moving wallpaper as one picture across all screens.
// The moment the mouse or keyboard is touched, Windows is locked (the real
// Windows lock, same as Win+L). The show stays up until the lock screen is there.
// Important: until that touch the PC is NOT locked.
// While the show is up the screen stays on and the computer does not sleep.
// After 15 minutes without a touch the show locks Windows itself.
//
// EldenShow.exe             -> start the show now
// EldenShow.exe --resident  -> wait in the background for Ctrl+Alt+S with the
//                              moving picture loaded and paused, so the show
//                              appears at once and complete (started at login)
// EldenShow.exe --quit      -> stop the background waiter
// EldenShow.exe --test 6 picture.png -> load hidden for 4 seconds, show for 6
//                              seconds, save two pictures of the screens
//                              (0.25 s after showing and at the end), never lock
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

static class Files
{
    public static readonly string Folder = AppDomain.CurrentDomain.BaseDirectory;
    public const string Scene = "shadow";

    public static void Log(string text)
    {
        try { File.AppendAllText(Path.Combine(Folder, "log.txt"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + Environment.NewLine); }
        catch { }
    }

    public static Image Still()
    {
        try { return Image.FromFile(Path.Combine(Folder, "stills", Scene + ".jpg")); }
        catch { return null; }
    }
}

// The show window. It is made once, loads the moving picture while hidden,
// and is then shown and hidden again each time.
class ShowForm : Form
{
    [DllImport("user32.dll")]
    static extern bool LockWorkStation();
    [DllImport("user32.dll")]
    static extern bool GetLastInputInfo(ref LastInput info);

    [DllImport("kernel32.dll")]
    static extern uint SetThreadExecutionState(uint state);

    // for "every screen is covered" (added 20 Nov 2026 after the right screen stayed visible)
    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")]
    static extern IntPtr GetAncestor(IntPtr window, uint which);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")]
    static extern bool GetWindowRect(IntPtr window, out WindowRect rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int size);

    [StructLayout(LayoutKind.Sequential)]
    struct WindowRect { public int Left, Top, Right, Bottom; }

    static readonly IntPtr OnTopOfAll = new IntPtr(-1);
    const uint NoActivate = 0x10, ShowIt = 0x40, NoMove = 0x2, NoSize = 0x1;
    const uint RootWindow = 2;

    [StructLayout(LayoutKind.Sequential)]
    struct LastInput { public uint Size; public uint Time; }

    const uint KeepAsSet = 0x80000000, ScreenOn = 0x2, NoSleep = 0x1;

    const double GraceSeconds = 1.5;   // time to let go of the mouse after starting
    const double MinutesPerPicture = 1;
    const double MinutesBeforeLock = 15;   // the show locks Windows itself after this long

    readonly WebView2 view = new WebView2();
    readonly PictureBox cover = new PictureBox();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly int testSeconds;
    readonly string testPicture;
    public bool CloseWhenDone;

    bool showing;
    bool earlySaved;
    bool reported;
    DateTime shownAt;
    DateTime closeAt = DateTime.MinValue;
    uint baseline;
    bool armed;
    int ticks;
    int fixes;

    public ShowForm(Image still, int testSeconds, string testPicture)
    {
        this.testSeconds = testSeconds;
        this.testPicture = testPicture;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = SystemInformation.VirtualScreen;   // all screens together
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.Black;

        // the still picture covers the first instant, until the moving one is drawn
        cover.Dock = DockStyle.Fill;
        cover.SizeMode = PictureBoxSizeMode.StretchImage;
        cover.Image = still;
        cover.BackColor = Color.Black;
        view.Dock = DockStyle.Fill;
        view.DefaultBackgroundColor = Color.Black;
        Controls.Add(cover);
        Controls.Add(view);
        cover.BringToFront();

        timer.Interval = 50;
        timer.Tick += OnTick;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.DisplaySettingsChanged += OnScreensChanged;
    }

    // puts the window over all screens as they are NOW, above every other window.
    // Done straight through Windows: the WinForms Bounds can think the size is right
    // while the real window is smaller (a screen that woke up late, a dock, a lid)
    void CoverAllScreens()
    {
        Rectangle all = SystemInformation.VirtualScreen;
        SetWindowPos(Handle, OnTopOfAll, all.X, all.Y, all.Width, all.Height, NoActivate | ShowIt);
    }

    // a screen was added, removed, woke up or changed size while the show is up
    void OnScreensChanged(object sender, EventArgs e)
    {
        if (!IsHandleCreated) return;
        BeginInvoke((Action)(() =>
        {
            if (!showing) return;
            CoverAllScreens();
            Files.Log("screens changed while showing: now " + Describe());
        }));
    }

    static string Describe()
    {
        Rectangle all = SystemInformation.VirtualScreen;
        return Screen.AllScreens.Length + " screens, " + all.Width + "x" + all.Height + " at " + all.X + "," + all.Y;
    }

    // true when the show is the top window in the middle and near every corner of every screen.
    // If not, it puts itself back on top and over all screens, and logs what was in the way
    bool CheckCovered()
    {
        Rectangle all = SystemInformation.VirtualScreen;
        WindowRect real;
        GetWindowRect(Handle, out real);
        bool sizeOk = real.Left <= all.Left && real.Top <= all.Top && real.Right >= all.Right && real.Bottom >= all.Bottom;
        string problem = sizeOk ? null : "window " + real.Left + "," + real.Top + " to " + real.Right + "," + real.Bottom + " but screens are " + Describe();
        if (sizeOk)
        {
            foreach (Screen screen in Screen.AllScreens)
            {
                Rectangle b = screen.Bounds;
                Point[] spots = {
                    new Point(b.X + b.Width / 2, b.Y + b.Height / 2),
                    new Point(b.Left + 8, b.Top + 8), new Point(b.Right - 9, b.Top + 8),
                    new Point(b.Left + 8, b.Bottom - 9), new Point(b.Right - 9, b.Bottom - 9)
                };
                foreach (Point spot in spots)
                {
                    IntPtr top = GetAncestor(WindowFromPoint(spot), RootWindow);
                    if (top == Handle) continue;
                    problem = screen.DeviceName + " at " + spot.X + "," + spot.Y + " shows " + WhoIs(top);
                    break;
                }
                if (problem != null) break;
            }
        }
        if (problem == null) return true;
        CoverAllScreens();
        fixes++;
        if (fixes <= 3) Files.Log("NOT COVERED, fixed: " + problem);
        return false;
    }

    static string WhoIs(IntPtr window)
    {
        if (window == IntPtr.Zero) return "nothing (no window)";
        var name = new System.Text.StringBuilder(256);
        GetClassName(window, name, 256);
        uint id;
        GetWindowThreadProcessId(window, out id);
        string program = "?";
        try { program = System.Diagnostics.Process.GetProcessById((int)id).ProcessName; } catch { }
        return program + " (" + name + ")";
    }

    static uint LastInputTime()
    {
        var info = new LastInput();
        info.Size = (uint)Marshal.SizeOf(typeof(LastInput));
        GetLastInputInfo(ref info);
        return info.Time;
    }

    // loads the moving picture, also while the window is still hidden
    public async Task Prepare()
    {
        try
        {
            IntPtr window = Handle;
            view.CreateControl();
            string data = Path.Combine(Files.Folder, "webview-data");
            var env = await CoreWebView2Environment.CreateAsync(null, data, null);
            await view.EnsureCoreWebView2Async(env);
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.WebMessageReceived += OnPageReady;
            view.CoreWebView2.ProcessFailed += OnPageFailed;
            await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("document.documentElement.style.cursor = 'none'");
            string page = new Uri(Path.Combine(Files.Folder, "wallpaper", "wallpaper.html")).AbsoluteUri;
            string minutes = MinutesPerPicture.ToString(System.Globalization.CultureInfo.InvariantCulture);
            view.CoreWebView2.Navigate(page + "?s=rotate&every=" + minutes + "&first=" + Files.Scene + "&clock=1");
            Files.Log("moving picture loaded in the background");
        }
        catch (Exception ex)
        {
            Files.Log("page error: " + ex.Message);
        }
    }

    // puts the show on the screens
    public void Present()
    {
        if (showing) return;
        showing = true;
        armed = false;
        earlySaved = false;
        reported = false;
        closeAt = DateTime.MinValue;
        ticks = 0;
        fixes = 0;
        cover.Visible = true;
        cover.BringToFront();
        Bounds = SystemInformation.VirtualScreen;
        Cursor.Hide();
        shownAt = DateTime.Now;
        // Windows would turn the screen off after 10 minutes (3 on battery): not while the show is up
        SetThreadExecutionState(KeepAsSet | ScreenOn | NoSleep);
        Show();
        CoverAllScreens();
        Activate();
        Files.Log("shown on " + Describe());
        // ask the page for a fresh "ready" every time: after a lock and unlock it can spend
        // its message while the show is hidden, and then the still picture (no clock) stayed up
        try { if (view.CoreWebView2 != null) { var asked = view.CoreWebView2.ExecuteScriptAsync("announce = true"); } }
        catch (Exception ex) { Files.Log("ask page error: " + ex.Message); }
        timer.Start();
    }

    // the page has drawn a frame on screen: take the still picture away
    void OnPageReady(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!showing) return;
        cover.Visible = false;
        if (!reported)
        {
            reported = true;
            Files.Log("complete on screen after " + (int)(DateTime.Now - shownAt).TotalMilliseconds + " ms");
        }
    }

    // the hidden Edge behind the moving picture crashed or hung (can happen after a day of
    // sleeping and waking): show the still picture, never a white or empty page, and reload
    void OnPageFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
    {
        Files.Log("moving picture failed: " + e.ProcessFailedKind);
        cover.Visible = true;
        cover.BringToFront();
        try { if (e.ProcessFailedKind != CoreWebView2ProcessFailedKind.BrowserProcessExited) view.CoreWebView2.Reload(); }
        catch (Exception ex) { Files.Log("reload error: " + ex.Message); }
    }

    void OnTick(object sender, EventArgs e)
    {
        double seconds = (DateTime.Now - shownAt).TotalSeconds;
        // every 0.25 s: is every screen still covered? If not, cover it again at once
        ticks++;
        if (closeAt == DateTime.MinValue && ticks % 5 == 1) CheckCovered();
        if (!reported && seconds >= 2)
        {
            reported = true;
            Files.Log("moving picture did not report after 2 s: only the still picture (no clock) is up");
        }
        if (testSeconds > 0)
        {
            if (!earlySaved && seconds >= 0.25) { earlySaved = true; SaveScreens(testPicture.Replace(".png", "-early.png")); }
            if (seconds >= testSeconds) { SaveScreens(testPicture); Conclude(); }
            return;
        }
        // after asking Windows to lock, the show stays up until the lock screen is there
        if (closeAt != DateTime.MinValue)
        {
            if (DateTime.Now >= closeAt) Conclude();
            return;
        }
        // nobody touched it for 15 minutes: lock now
        if (seconds >= MinutesBeforeLock * 60)
        {
            bool locked = LockWorkStation();
            Files.Log("locked after " + MinutesBeforeLock + " minutes: " + locked);
            closeAt = DateTime.Now.AddSeconds(locked ? 6 : 0);
            return;
        }
        if (!armed)
        {
            if (seconds >= GraceSeconds) { baseline = LastInputTime(); armed = true; }
            return;
        }
        if (LastInputTime() != baseline)
        {
            bool ok = LockWorkStation();
            Files.Log("locked on input: " + ok);
            // normally the lock screen ends the show (below), this is only a fallback
            closeAt = DateTime.Now.AddSeconds(ok ? 6 : 0);
        }
    }

    // the lock screen is up (after a touch, Win+L, or the 15 minute rule): now the show can go
    void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        if (e.Reason != SessionSwitchReason.SessionLock || !IsHandleCreated) return;
        BeginInvoke((Action)(() => { if (showing) closeAt = DateTime.Now.AddMilliseconds(400); }));
    }

    void Conclude()
    {
        if (!showing) return;
        showing = false;
        timer.Stop();
        SetThreadExecutionState(KeepAsSet);   // the screen may go off and the computer may sleep again
        Cursor.Show();
        if (CloseWhenDone) Close();
        else Hide();   // stays loaded and paused for the next time
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        timer.Stop();
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SystemEvents.DisplaySettingsChanged -= OnScreensChanged;
        base.OnFormClosed(e);
        if (CloseWhenDone) Application.ExitThread();
    }

    void SaveScreens(string file)
    {
        try
        {
            Rectangle all = SystemInformation.VirtualScreen;
            using (var bmp = new Bitmap(all.Width, all.Height))
            {
                using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(all.Location, Point.Empty, all.Size);
                bmp.Save(file, ImageFormat.Png);
            }
        }
        catch (Exception ex) { Files.Log("picture error: " + ex.Message); }
    }
}

// waits in the background for Ctrl+Alt+S (never visible itself)
class Resident : Form
{
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")]
    static extern bool UnregisterHotKey(IntPtr window, int id);

    const int HotkeyMessage = 0x0312;
    const uint Alt = 0x1, Control = 0x2, NoRepeat = 0x4000;

    readonly EventWaitHandle showSignal;
    readonly EventWaitHandle quitSignal;
    readonly ShowForm show;

    public Resident(EventWaitHandle showSignal, EventWaitHandle quitSignal)
    {
        this.showSignal = showSignal;
        this.quitSignal = quitSignal;
        ShowInTaskbar = false;
        IntPtr handle = Handle;   // makes the hidden window that receives the key
        bool ok = RegisterHotKey(handle, 1, Control | Alt | NoRepeat, (uint)Keys.S);
        Files.Log("waiting for Ctrl+Alt+S: " + (ok ? "yes" : "NO, the key is taken (error " + Marshal.GetLastWin32Error() + ")"));
        show = new ShowForm(Files.Still(), 0, null);
        Task loading = show.Prepare();
        var listener = new Thread(Listen);
        listener.IsBackground = true;
        listener.Start();
        SystemEvents.SessionSwitch += OnSessionSwitch;
    }

    // after every unlock: put the next favourite picture on the lock screen
    void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        if (e.Reason != SessionSwitchReason.SessionUnlock) return;
        try
        {
            string script = Path.Combine(Files.Folder, "next-lock-picture.ps1");
            if (!File.Exists(script)) return;
            var start = new System.Diagnostics.ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
            start.CreateNoWindow = true;
            start.UseShellExecute = false;
            System.Diagnostics.Process.Start(start);
        }
        catch (Exception ex) { Files.Log("lock picture error: " + ex.Message); }
    }

    protected override void SetVisibleCore(bool value)
    {
        base.SetVisibleCore(false);
    }

    void Listen()
    {
        var signals = new WaitHandle[] { showSignal, quitSignal };
        while (true)
        {
            int which = WaitHandle.WaitAny(signals);
            if (which == 0) BeginInvoke((Action)show.Present);
            else { BeginInvoke((Action)Application.Exit); return; }
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == HotkeyMessage) show.Present();
        base.WndProc(ref m);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        UnregisterHotKey(Handle, 1);
        base.OnFormClosed(e);
    }
}

static class Program
{
    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    const string ShowName = "EldenShow-show";
    const string QuitName = "EldenShow-quit";

    static bool Signal(string name)
    {
        try
        {
            using (var signal = EventWaitHandle.OpenExisting(name)) signal.Set();
            return true;
        }
        catch { return false; }
    }

    [STAThread]
    static void Main(string[] args)
    {
        // real pixels on every screen, also when the two screens have a different zoom
        // (Windows 10 1703 and later), else the older "same zoom everywhere" mode
        bool perScreen = false;
        try { perScreen = SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        if (!perScreen) SetProcessDPIAware();
        Application.EnableVisualStyles();
        string mode = args.Length > 0 ? args[0] : "";

        if (mode == "--quit") { Signal(QuitName); return; }

        if (mode == "--resident")
        {
            bool first;
            using (var only = new Mutex(true, "EldenShow-resident", out first))
            {
                if (!first) return;
                using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, ShowName))
                using (var quit = new EventWaitHandle(false, EventResetMode.AutoReset, QuitName))
                {
                    Application.Run(new Resident(show, quit));
                }
            }
            return;
        }

        if (mode == "--test" && args.Length >= 3)
        {
            // like the background waiter: load hidden first, then show
            var form = new ShowForm(Files.Still(), int.Parse(args[1]), args[2]);
            form.CloseWhenDone = true;
            Task loading = form.Prepare();
            var wait = new System.Windows.Forms.Timer();
            wait.Interval = 4000;
            wait.Tick += (s, e) => { wait.Stop(); form.Present(); };
            wait.Start();
            Application.Run();
            return;
        }

        // plain start: ask the background waiter, or show it ourselves
        if (Signal(ShowName)) return;
        bool alone;
        using (var one = new Mutex(true, "EldenShow-one-at-a-time", out alone))
        {
            if (!alone) return;
            var form = new ShowForm(Files.Still(), 0, null);
            form.CloseWhenDone = true;
            Task loading = form.Prepare();
            form.Present();
            Application.Run();
        }
    }
}
