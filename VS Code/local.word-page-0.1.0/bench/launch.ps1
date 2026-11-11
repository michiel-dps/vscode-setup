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
#   ... launch.ps1 -AllowFocus           needed to start or to use -Open: see the rule below
# Then, with python:  cdp.py shot out.png | cdp.py webview js\layout.js | cdp.py key F8 ctrl,shift | ...
#
# RULE (asked 11 Nov 2026): a test window must never take the keyboard from the real VS Code
# window, and it is closed when the test is done (launch.ps1 -Stop). Starting the bench, and
# -Open, DO take the keyboard for a moment (on 11 Nov a start also gave two windows). So the
# script refuses both unless -AllowFocus is given: only after he said that it is fine now.
# To do before the next real use: start the bench on its own Windows desktop (CreateProcess
# with STARTUPINFO.lpDesktop, e.g. "WordPageBench"), where a window cannot take the keyboard
# of the real desktop; size the window through the debugging port (Browser.setWindowBounds)
# instead of Move-TestWindow; check with GetForegroundWindow before and after that nothing moved.
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
    [switch]$Stop, [switch]$MoveOnly, [switch]$Fresh, [switch]$Claude, [switch]$AllowFocus,
    [int]$Width = 1400, [int]$Height = 950,
    [string]$Work = (Join-Path $env:TEMP 'word-page-bench')
)

if (-not ($Stop -or $MoveOnly -or $AllowFocus)) {
    "refused: starting the bench (or -Open) takes the keyboard from the real VS Code window for a moment."
    "Read the RULE at the top of this script. Add -AllowFocus only when he said it is fine now."
    exit 1
}

$addon   = Split-Path $PSScriptRoot -Parent                       # ...\local.word-page-0.1.0
$install = "$env:LOCALAPPDATA\Programs\Microsoft VS Code"
$realExt = "$env:USERPROFILE\.vscode\extensions"
$code    = "$Work\vscode\Code.exe"
$utf8    = New-Object System.Text.UTF8Encoding($false)

function Get-TestPids {
    @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" |
        Where-Object { $_.CommandLine -match [regex]::Escape("$Work\data") } |
        ForEach-Object { $_.ProcessId })
}

Add-Type @"
using System; using System.Runtime.InteropServices;
public static class WinMove {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@ -ErrorAction SilentlyContinue

function Move-TestWindow {
    # wait for the window, then move it off-screen without giving it the keyboard
    foreach ($i in 1..70) {
        $mine = Get-TestPids
        if ($mine.Count -eq 0) { "the bench VS Code is not running"; return }
        $win = Get-Process Code -ErrorAction SilentlyContinue | Where-Object { $mine -contains $_.Id -and $_.MainWindowHandle -ne 0 }
        if ($win) {
            foreach ($q in $win) {
                [WinMove]::ShowWindow($q.MainWindowHandle, 4) | Out-Null
                [WinMove]::SetWindowPos($q.MainWindowHandle, [IntPtr]::Zero, -6000, 100, $Width, $Height, 0x0014) | Out-Null
                "window '" + $q.MainWindowTitle + "' is off-screen (" + $Width + " x " + $Height + ")"
            }
            return
        }
        Start-Sleep -Seconds 1
    }
    "no window after 70 s; see $Work\code.out"
}

function Clear-EditorVariables {
    foreach ($n in @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(VSCODE_|ELECTRON_)' } | ForEach-Object { $_.Name })) {
        [Environment]::SetEnvironmentVariable($n, $null, "Process")
    }
}

# open a file of the test folder in the running bench window (as a user would: after start-up)
function Open-InBench($name) {
    Clear-EditorVariables
    $cli = "$Work\vscode\bin\code.cmd"
    & $cli --user-data-dir "$Work\data" --extensions-dir "$Work\ext" --reuse-window "$Work\ws\$name" 2>$null | Out-Null
    "opened $name"
}

if ($MoveOnly) { Move-TestWindow; return }
if ($Open) { Open-InBench $Open; return }

foreach ($id in Get-TestPids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
if ($Stop) { "stopped"; return }
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

$codeArgs = @(
    "--user-data-dir=`"$Work\data`"", "--extensions-dir=`"$Work\ext`"",
    "--remote-debugging-port=9333", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes",
    "--disable-updates", "--new-window",
    "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "`"$Work\ws`""
)
$null = Start-Process $code -ArgumentList $codeArgs -PassThru -RedirectStandardOutput "$Work\code.out" -RedirectStandardError "$Work\code.err"
Start-Sleep -Seconds 1
Move-TestWindow
Start-Sleep -Seconds 10          # let the add-ons start, then open the file as a user would
Open-InBench $File
"bench folder: $Work   (debugging port 9333; give the page about 8 s to load)"
