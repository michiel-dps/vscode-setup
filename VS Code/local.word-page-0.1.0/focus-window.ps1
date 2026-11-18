# focus-window.ps1 -- brings a VS Code window to the front (18 Nov 2026).
#
# VS Code can make a chat tab in a floating window the active tab, but it does not
# bring that window to the front, so the keyboard stays in the main window
# (Ctrl+Numpad1 then pasted into the R script). The Word Page add-on starts this
# script once and keeps it running. It reads one line per request on stdin:
#   <start of a window title>
# and answers one line on stdout:
#   SAME     the window in front already has that title
#   OK       brought to the front
#   FAILED   found, but Windows did not let it come to the front
#   NONE     no visible VS Code window with that title
# A floating window's title is "<its active tab> - <folder> - Visual Studio Code".

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class FocusWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int how);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

  static string Title(IntPtr h) {
    var s = new StringBuilder(512);
    GetWindowText(h, s, 512);
    return s.ToString();
  }

  public static string Focus(string start) {
    IntPtr front = GetForegroundWindow();
    if (Title(front).StartsWith(start)) return "SAME";
    IntPtr target = IntPtr.Zero;
    EnumWindows((h, l) => {
      string t = Title(h);
      if (h != front && IsWindowVisible(h) && t.StartsWith(start) && t.EndsWith(" - Visual Studio Code")) {
        target = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    if (target == IntPtr.Zero) return "NONE";
    if (IsIconic(target)) ShowWindow(target, 9);
    // Windows only lets the program in front hand over the front: borrow its input queue
    uint frontThread = GetWindowThreadProcessId(front, IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = frontThread != 0 && frontThread != me && AttachThreadInput(me, frontThread, true);
    BringWindowToTop(target);
    SetForegroundWindow(target);
    if (attached) AttachThreadInput(me, frontThread, false);
    return GetForegroundWindow() == target ? "OK" : "FAILED";
  }
}
"@

[Console]::Out.WriteLine("READY")
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $answer = [FocusWindow]::Focus($line)
  } catch {
    $answer = "ERROR " + $_.Exception.Message
  }
  [Console]::Out.WriteLine($answer)
}
