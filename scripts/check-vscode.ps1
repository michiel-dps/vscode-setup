# Is every VS Code window run by the REAL VS Code? (13 Nov 2026)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-vscode.ps1          look only
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-vscode.ps1 -Fix     look and repair
#
# Why: on 12 and 13 Nov 2026 Claude would not open in a new window (the H26 folder). That
# window was run by a test copy of VS Code (the Word Page bench, in %TEMP%) with his own
# settings. Windows has two places that say which program starts VS Code, and the copy had
# written itself into both:
#   1. the vscode:// links   (registry, HKCU\Software\Classes\vscode\shell\open\command)
#   2. the taskbar list of recent folders (right-click on the VS Code icon)
# Run this first when a window behaves strangely: Claude does not open, a chat is empty,
# the window looks older than the others.
param([switch]$Fix)

$real  = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
$wrong = 0

# 1. the vscode:// links
$key = 'HKCU:\Software\Classes\vscode\shell\open\command'
if (-not (Test-Path $key)) {
    "OK     no vscode:// link yet (VS Code makes it at its next start)"
} else {
    $now = (Get-ItemProperty $key).'(default)'
    if ($now -match [regex]::Escape($real)) {
        "OK     vscode:// links start the real VS Code"
    } else {
        $wrong = $wrong + 1
        "WRONG  vscode:// links start another program: $now"
        if ($Fix) {
            Set-ItemProperty $key -Name '(default)' -Value "`"$real`" --open-url -- `"%1`""
            "       repaired: they start the real VS Code again"
        }
    }
}

# 2. the taskbar list of recent folders of the real VS Code
#    (the file name is Windows' code for the name "Microsoft.VisualStudioCode")
$list = "$env:APPDATA\Microsoft\Windows\Recent\CustomDestinations\1ced32d74a95c7bc.customDestinations-ms"
if (-not (Test-Path -LiteralPath $list)) {
    "OK     no taskbar list yet (VS Code makes it when a folder is opened)"
} else {
    $bytes = [IO.File]::ReadAllBytes($list)
    $text  = [Text.Encoding]::Unicode.GetString($bytes) + [Text.Encoding]::ASCII.GetString($bytes)
    $programs = @([regex]::Matches($text, '[A-Za-z]:\\[^\x00-\x1f"<>|*?]{1,200}?\\Code\.exe', 'IgnoreCase') |
        ForEach-Object { $_.Value } |
        Sort-Object -Unique)
    $others = @($programs | Where-Object { $_ -ne $real })
    if ($others.Count -eq 0) {
        "OK     the taskbar list starts the real VS Code"
    } else {
        $wrong = $wrong + 1
        "WRONG  the taskbar list starts another program: " + ($others -join ', ')
        if ($Fix) {
            Remove-Item -LiteralPath $list -Force
            "       repaired: list removed, VS Code writes a new one when a folder is opened"
        }
    }
}

# 3. a copy of VS Code that runs with his own settings right now
#    (a test copy is fine as long as it has its own --user-data-dir)
$all  = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'")
$ids  = @($all | ForEach-Object { $_.ProcessId })
$main = @($all | Where-Object { $ids -notcontains $_.ParentProcessId })
$bad  = @($main | Where-Object { $_.ExecutablePath -ne $real -and $_.CommandLine -notmatch '--user-data-dir' })
if ($bad.Count -eq 0) {
    "OK     no copy of VS Code runs with your own settings"
} else {
    $wrong = $wrong + 1
    foreach ($process in $bad) {
        "WRONG  a copy of VS Code runs with your own settings: $($process.ExecutablePath) (process $($process.ProcessId))"
    }
    "       close that window, then open the folder again from the real VS Code (File > Open Recent)"
}

if ($wrong -eq 0) { "All fine." }
elseif ($Fix)     { "$wrong thing(s) were wrong. Run once more to see that all is fine." }
else              { "$wrong thing(s) wrong. Run again with -Fix to repair." }
