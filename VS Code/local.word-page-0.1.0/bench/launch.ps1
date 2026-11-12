# Test bench for the Word Page add-on: a second, private VS Code that runs off-screen,
# with its own settings and its own copies of the Quarto add-on and this add-on.
# Nothing of the real setup is touched. Made for Claude: it cannot see the screen,
# so it drives this copy through the debugging port and takes screenshots (cdp.py).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1                 start, then open sample.qmd
#   ... launch.ps1 -File refs.bib        start, then open another file of the test folder
#   ... launch.ps1 -Open other.qmd       open a file of the test folder in the running window
#   ... launch.ps1 -MoveOnly -Width 760  resize the running window (narrow editor)
#   ... launch.ps1 -Stop                 close it
#   ... launch.ps1 -Fresh                throw the bench away first (after a VS Code or Quarto update)
#   ... launch.ps1 -Claude               also with the Claude Code add-on and the real keybindings.json, to test
#                                        Ctrl+Numpad5 (highlighted text to the Claude chat box). It uses the real
#                                        Claude login and the real clipboard: send no message there.
# Then, with python:  cdp.py shot out.png | cdp.py webview js\layout.js | cdp.py key F8 ctrl,shift | ...
#
# RULE (asked 11 Nov 2026): a test window must never take the keyboard from the real VS Code
# window, and it is closed when the test is done (launch.ps1 -Stop). On 11 Nov a start took
# the keyboard for a moment (and once gave two windows). Since then the bench runs on its own
# Windows desktop, "WordPageBench" (CreateProcess with STARTUPINFO.lpDesktop): a second,
# invisible desktop of the same login. A window there is never on the screen and cannot take
# the keyboard of the real desktop. Everything that touches the bench window (start, -Open,
# -MoveOnly) is started on that desktop. The desktop is gone when the bench is stopped.
# The script prints the window that has the keyboard before and after, as a check.
#
# The first run copies VS Code (about 1 GB) to %TEMP%\word-page-bench; that takes a minute.
#
# Things that cost time on 11 Nov 2026:
# - While an update of VS Code waits for a restart, no second VS Code starts from the real
#   install (it waits 30 s for the lock "vscode-updating" and quits). So the bench runs a
#   COPY of VS Code with another lock name (win32MutexName in product.json).
# - This script runs in a shell inside VS Code. That shell has ELECTRON_RUN_AS_NODE=1 and
#   VSCODE_* variables, with which Code.exe starts as plain node: they are cleared first.
# - Quarto asks once "You are activating Quarto visual markdown editing mode" in a window
#   that nobody sees here; QUARTO_VISUAL_EDITOR_CONFIRMED=true answers it.
# - Do not pipe this script's output (| Out-Null): the pipe stays open until VS Code closes.
# - "editor: visual" opens a .qmd as a page only when the file is opened AFTER start-up
#   (not the file given on the command line), and never for .md. So files are opened
#   through VS Code's command line once the window is there. Quick Open (Ctrl+P) only
#   finds files that this copy has opened before.
param(
    [string]$File = "sample.qmd",
    [string]$Open = "",
    [switch]$Stop, [switch]$MoveOnly, [switch]$Fresh, [switch]$Claude,
    [switch]$OnBenchDesktop,          # set by this script itself: this run is already on the bench desktop
    [int]$Width = 1400, [int]$Height = 950,
    [string]$Work = (Join-Path $env:TEMP 'word-page-bench')
)

$addon   = Split-Path $PSScriptRoot -Parent                       # ...\local.word-page-0.1.0
$install = "$env:LOCALAPPDATA\Programs\Microsoft VS Code"
$realExt = "$env:USERPROFILE\.vscode\extensions"
$code    = "$Work\vscode\Code.exe"
$utf8    = New-Object System.Text.UTF8Encoding($false)
$desktop = 'WordPageBench'                                        # the bench's own Windows desktop

# Start a program on the bench desktop (made when it is not there yet). A window on that
# desktop is never on the screen and cannot take the keyboard of the real desktop.
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class BenchDesktop {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO {
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr security);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcess(string app, StringBuilder commandLine, IntPtr pa, IntPtr ta, bool inherit, uint flags,
                                     IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    // The handle is kept open until this PowerShell ends, so the desktop is still there
    // when the new program looks for it; after that the running bench keeps it alive.
    static IntPtr handle = IntPtr.Zero;

    // waitMs > 0: wait that long for the program to end. Returns its process id.
    public static int Start(string desktop, string commandLine, string dir, bool noConsole, int waitMs) {
        if (handle == IntPtr.Zero) {
            handle = CreateDesktop(desktop, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);   // GENERIC_ALL
            if (handle == IntPtr.Zero) { throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
        }
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        si.lpDesktop = "WinSta0\\" + desktop;
        PROCESS_INFORMATION pi;
        uint flags = noConsole ? 0x08000000u : 0u;                                                   // CREATE_NO_WINDOW
        if (!CreateProcess(null, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, dir, ref si, out pi)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        if (waitMs > 0) { WaitForSingleObject(pi.hProcess, (uint)waitMs); }
        CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
        return pi.dwProcessId;
    }
}
"@ -ErrorAction SilentlyContinue

function Start-OnBench([string]$commandLine, [bool]$noConsole = $true, [int]$waitMs = 0) {
    [BenchDesktop]::Start($desktop, $commandLine, $Work, $noConsole, $waitMs) | Out-Null
}

# this script again, on the bench desktop (for the steps that touch the bench window)
function Invoke-OnBench([string]$arguments, [int]$waitMs) {
    $out = "$Work\on-bench.out"
    Remove-Item -LiteralPath $out -ErrorAction SilentlyContinue
    $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"& '$PSCommandPath' -OnBenchDesktop -Work '$Work' $arguments *> '$out'`""
    Start-OnBench $command $true $waitMs
    if (Test-Path -LiteralPath $out) { Get-Content -LiteralPath $out }
}

function Get-TestPids {
    @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" |
        Where-Object { $_.CommandLine -match [regex]::Escape("$Work\data") } |
        ForEach-Object { $_.ProcessId })
}

Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class WinMove {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);

    // Every visible window with a title that belongs to one of these programs gets this
    // size, in the top left corner. Returns the titles. It looks at the windows of the
    // desktop this PowerShell runs on. (Get-Process's "main window" was a window without a
    // title on the bench desktop, and sizing that one did nothing.)
    public static string[] Size(int[] pids, int width, int height) {
        List<string> titles = new List<string>();
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (Array.IndexOf(pids, (int)pid) < 0 || !IsWindowVisible(h)) { return true; }
            StringBuilder text = new StringBuilder(300);
            GetWindowText(h, text, 300);
            if (text.Length == 0) { return true; }
            ShowWindow(h, 1);                                      // normal size (not maximised)
            SetWindowPos(h, IntPtr.Zero, 0, 0, width, height, 0x0004);
            titles.Add(text.ToString());
            return true;
        }, IntPtr.Zero);
        return titles.ToArray();
    }
}
"@ -ErrorAction SilentlyContinue

function Move-TestWindow {
    # Runs ON the bench desktop (a window can only be reached from its own desktop):
    # wait for the window, then give it its size.
    foreach ($i in 1..70) {
        $mine = Get-TestPids
        if ($mine.Count -eq 0) { "the bench VS Code is not running"; return }
        $titles = [WinMove]::Size([int[]]$mine, $Width, $Height)
        if ($titles.Count -gt 0) {
            foreach ($title in $titles) { "window '" + $title + "' is " + $Width + " x " + $Height + " on the desktop " + $desktop }
            return
        }
        Start-Sleep -Seconds 1
    }
    "no window after 70 s"
}

function Clear-EditorVariables {
    foreach ($n in @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(VSCODE_|ELECTRON_)' } | ForEach-Object { $_.Name })) {
        [Environment]::SetEnvironmentVariable($n, $null, "Process")
    }
}

# At start-up every VS Code on Windows makes itself the program for vscode:// links
# (HKCU\Software\Classes\vscode). The bench copy did that too, and from then on a vscode://
# link (Claude Code uses them) started the bench copy with his own settings: on 12 Nov 2026
# Claude would not open in his H26 window. So the link goes back to the real VS Code after
# every start and every stop of the bench.
function Restore-UrlHandler {
    $command = "HKCU:\Software\Classes\vscode\shell\open\command"
    if (-not (Test-Path $command)) { return }
    $now = (Get-ItemProperty $command).'(default)'
    if ($now -match [regex]::Escape($Work)) {
        Set-ItemProperty $command -Name "(default)" -Value "`"$install\Code.exe`" --open-url -- `"%1`""
        "vscode:// links point to the real VS Code again"
    }
}

# open a file of the test folder in the running bench window (as a user would: after start-up)
function Open-InBench($name) {
    Clear-EditorVariables
    $cli = "$Work\vscode\bin\code.cmd"
    # cmd /c takes the first and the last quote off, so the whole command sits in one more pair
    $command = "cmd.exe /c `"`"$cli`" --user-data-dir `"$Work\data`" --extensions-dir `"$Work\ext`" --reuse-window `"$Work\ws\$name`"`""
    Start-OnBench $command $true 30000
    "opened $name"
}

if ($MoveOnly) {
    if ($OnBenchDesktop) { Move-TestWindow } else { Invoke-OnBench "-MoveOnly -Width $Width -Height $Height" 90000 }
    return
}
if ($Open) { Open-InBench $Open; return }

foreach ($id in Get-TestPids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
if ($Stop) { Restore-UrlHandler; "stopped"; return }
Start-Sleep -Milliseconds 800
if ($Fresh -and (Test-Path -LiteralPath $Work)) { Remove-Item -LiteralPath $Work -Recurse -Force }

# --- prepare the bench (first run only) ---
if (-not (Test-Path -LiteralPath $code)) {
    "copying VS Code to $Work\vscode (about 1 GB, once) ..."
    # the folder with this version's files is named in bin\code.cmd
    $version = ([regex]::Match((Get-Content "$install\bin\code.cmd" -Raw), '\.\.\\([0-9a-f]+)\\resources')).Groups[1].Value
    if (-not $version) { throw "cannot read the version folder from $install\bin\code.cmd" }
    New-Item -ItemType Directory -Force "$Work\vscode" | Out-Null
    Copy-Item "$install\Code.exe" $code
    robocopy "$install\$version" "$Work\vscode\$version" /E /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
    robocopy "$install\bin" "$Work\vscode\bin" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    $product = "$Work\vscode\$version\resources\app\product.json"
    $text = [regex]::Replace([IO.File]::ReadAllText($product), '"win32MutexName"\s*:\s*"[^"]*"', '"win32MutexName": "vscodewordpagebench"')
    [IO.File]::WriteAllText($product, $text, $utf8)
}
if (-not (Test-Path -LiteralPath "$Work\ext")) {
    New-Item -ItemType Directory -Force "$Work\ext" | Out-Null
    $quarto = Get-ChildItem $realExt -Directory -Filter 'quarto.quarto-*' | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $quarto) { throw 'the Quarto add-on is not installed' }
    robocopy $quarto.FullName "$Work\ext\$($quarto.Name)" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    # the colour themes too, so the bench looks like the real VS Code
    Get-ChildItem $realExt -Directory -Filter '*theme*' | ForEach-Object {
        robocopy $_.FullName "$Work\ext\$($_.Name)" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    }
}
# Windows clears old files out of %TEMP% now and then. On 12 Nov 2026 three files of the Quarto
# copy were gone (out\lsp\resources\abbreviations, parser.lua, sourcepos.lua) and the page said
# "Unexpected Error Loading Editor ... pandoc_markdown_to_ast failed". So put back what is
# missing at every start. /XO leaves the files that the add-on has patched as they are (newer).
$quartoNow = Get-ChildItem $realExt -Directory -Filter 'quarto.quarto-*' | Sort-Object LastWriteTime | Select-Object -Last 1
if ($quartoNow) { robocopy $quartoNow.FullName "$Work\ext\$($quartoNow.Name)" /E /XO /NFL /NDL /NJH /NJS /NP | Out-Null }
if ($Claude -and -not (Get-ChildItem "$Work\ext" -Directory -Filter 'anthropic.claude-code-*')) {
    $claudeAddon = Get-ChildItem $realExt -Directory -Filter 'anthropic.claude-code-*' | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $claudeAddon) { throw 'the Claude Code add-on is not installed' }
    "copying the Claude Code add-on to $Work\ext (about 340 MB, once) ..."
    robocopy $claudeAddon.FullName "$Work\ext\$($claudeAddon.Name)" /E /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
    # VS Code keeps a list of the add-ons it found; without the list it looks through the folder again
    Remove-Item -LiteralPath "$Work\ext\extensions.json" -ErrorAction SilentlyContinue
}
if (-not (Test-Path -LiteralPath "$Work\data\User\settings.json")) {
    New-Item -ItemType Directory -Force "$Work\data\User" | Out-Null
    # the same colour theme as the real VS Code, so the dark case is tested
    $theme = 'Default Dark Modern'
    $real = "$env:APPDATA\Code\User\settings.json"
    if (Test-Path -LiteralPath $real) {
        $m = [regex]::Match([IO.File]::ReadAllText($real), '"workbench\.colorTheme"\s*:\s*"([^"]+)"')
        if ($m.Success) { $theme = $m.Groups[1].Value }
    }
    $settings = @"
{
  "workbench.colorTheme": "$theme",
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "extensions.ignoreRecommendations": true,
  "window.restoreWindows": "none",
  "window.dialogStyle": "custom",
  "chat.disableAIFeatures": true,
  "claudeCode.preferredLocation": "sidebar",
  "claudeCode.hideOnboarding": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden"
}
"@
    [IO.File]::WriteAllText("$Work\data\User\settings.json", $settings, $utf8)
}
if ($Claude) {
    # the same keys as the real VS Code (keys of add-ons that are not in the bench do nothing)
    Copy-Item -LiteralPath "$env:APPDATA\Code\User\keybindings.json" -Destination "$Work\data\User\keybindings.json" -Force
}
if (-not (Test-Path -LiteralPath "$Work\ws")) {
    New-Item -ItemType Directory -Force "$Work\ws" | Out-Null
    robocopy "$PSScriptRoot\sample" "$Work\ws" /E /NFL /NDL /NJH /NJS /NP | Out-Null
}

# this add-on, as it is in the setup folder now (bench\ itself is not part of the add-on)
$package = Get-Content -LiteralPath "$addon\package.json" -Raw | ConvertFrom-Json
$target  = "$Work\ext\$($package.publisher).$($package.name)-$($package.version)"
robocopy $addon $target /E /XD bench /XF *.vsix build.ps1 /NFL /NDL /NJH /NJS /NP | Out-Null

# --- start ---
Clear-EditorVariables
$env:QUARTO_VISUAL_EDITOR_CONFIRMED = "true"

# The folder comes FIRST. At the end, VS Code read it as the value of the option before it
# (--disable-backgrounding-occluded-windows), and the window had no folder open. Without a
# folder, the page shows no pictures from outside the document's own folder (11 Nov 2026).
$codeArgs = @(
    "`"$Work\ws`"",
    "--user-data-dir=`"$Work\data`"", "--extensions-dir=`"$Work\ext`"",
    "--remote-debugging-port=9333", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes",
    "--disable-updates", "--new-window",
    "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows"
)
$keyboardBefore = [BenchDesktop]::GetForegroundWindow()
Start-OnBench ("`"$code`" " + ($codeArgs -join ' ')) $false 0
Start-Sleep -Seconds 1
Invoke-OnBench "-MoveOnly -Width $Width -Height $Height" 90000
Start-Sleep -Seconds 10          # let the add-ons start, then open the file as a user would
Open-InBench $File
Restore-UrlHandler
if ([BenchDesktop]::GetForegroundWindow() -eq $keyboardBefore) {
    "keyboard check: the same window has the keyboard as before the start"
} else {
    "keyboard check: ANOTHER window has the keyboard now than before the start (he may have switched himself; the bench is on its own desktop)"
}
"bench folder: $Work   (debugging port 9333; give the page about 8 s to load)"
