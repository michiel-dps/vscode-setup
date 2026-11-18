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
# the window looks older than the others, a window is empty grey or black (check 4).
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

# 4. a VS Code window that shows nothing (18 Nov 2026)
#    A floating window (a tab dragged out, or Claude's "Open in New Window") can come back
#    empty after Reload Window: a grey or black area without menus or tabs. Its tabs cannot
#    be reached, and the R data viewer landed in it. The window is drawn into a picture
#    (this works also when the screen is locked or covered) and an empty window has at most
#    two colours. It is drawn twice, 3 seconds apart, so a window that is just opening is not
#    counted. -Fix closes it only when another window of the same VS Code still shows content.
#    Claude chats that were in it stay saved: /chats opens them again.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public struct VsRect { public int Left, Top, Right, Bottom; }
public class VsWindows {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out VsRect r);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
    public static List<IntPtr> Visible() {
        var found = new List<IntPtr>();
        EnumWindows((h, l) => { if (IsWindowVisible(h) && !IsIconic(h)) found.Add(h); return true; }, IntPtr.Zero);
        return found;
    }
}
"@

function Get-WindowTitle($handle) {
    $text = New-Object System.Text.StringBuilder 512
    [VsWindows]::GetWindowText($handle, $text, 512) | Out-Null
    return $text.ToString()
}

function Test-WindowEmpty($handle) {
    $box = New-Object VsRect
    [VsWindows]::GetWindowRect($handle, [ref]$box) | Out-Null
    $width  = $box.Right - $box.Left
    $height = $box.Bottom - $box.Top
    if ($width -lt 200 -or $height -lt 200) { return $false }
    $picture = New-Object System.Drawing.Bitmap $width, $height
    $canvas  = [System.Drawing.Graphics]::FromImage($picture)
    $dc      = $canvas.GetHdc()
    [VsWindows]::PrintWindow($handle, $dc, 2) | Out-Null
    $canvas.ReleaseHdc($dc)
    $colours = @{}
    for ($x = 20; $x -lt $width - 20; $x = $x + 40) {
        for ($y = 20; $y -lt $height - 20; $y = $y + 20) {
            $colours[$picture.GetPixel($x, $y).ToArgb()] = 1
        }
    }
    $canvas.Dispose()
    $picture.Dispose()
    return ($colours.Count -le 2)
}

$realIds = @($all | Where-Object { $_.ExecutablePath -eq $real } | ForEach-Object { $_.ProcessId })
$windows = @([VsWindows]::Visible() | Where-Object {
    $owner = [uint32]0
    [VsWindows]::GetWindowThreadProcessId($_, [ref]$owner) | Out-Null
    ($realIds -contains $owner) -and ((Get-WindowTitle $_) -match 'Visual Studio Code$')
})
$empty = @($windows | Where-Object { Test-WindowEmpty $_ })
if ($empty.Count -gt 0) {
    Start-Sleep -Seconds 3
    $empty = @($empty | Where-Object { Test-WindowEmpty $_ })
}
if ($empty.Count -eq 0) {
    "OK     every VS Code window shows its content"
} else {
    $wrong = $wrong + 1
    foreach ($handle in $empty) {
        "WRONG  a VS Code window shows nothing: $(Get-WindowTitle $handle)"
    }
    if ($Fix) {
        if ($windows.Count -gt $empty.Count) {
            foreach ($handle in $empty) {
                $answer = [IntPtr]::Zero
                [VsWindows]::SendMessageTimeout($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero, 2, 5000, [ref]$answer) | Out-Null
            }
            "       repaired: the empty window is closed. Chats that were in it: /chats opens them again"
        } else {
            "       not closed, it is your only window: click in it and press Ctrl+R (Reload Window)"
        }
    }
}

if ($wrong -eq 0) { "All fine." }
elseif ($Fix)     { "$wrong thing(s) were wrong. Run once more to see that all is fine." }
else              { "$wrong thing(s) wrong. Run again with -Fix to repair." }
