# Makes Ctrl+Alt+S work after every restart:
# puts a shortcut in your Startup folder that starts the small background
# waiter (EldenShow.exe --resident) when you sign in. Your account only, no admin.
# Undo: delete "Elden Show key" from the Startup folder
# (Win+R, type shell:startup, Enter).

$shell = New-Object -ComObject WScript.Shell
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) "Elden Show key.lnk"
$s = $shell.CreateShortcut($startup)
$s.TargetPath = "$PSScriptRoot\EldenShow.exe"
$s.Arguments = "--resident"
$s.WorkingDirectory = $PSScriptRoot
$s.Description = "Waits for Ctrl+Alt+S to start the Elden wallpaper show"
$s.Save()

Start-Process "$PSScriptRoot\EldenShow.exe" -ArgumentList "--resident"
Write-Host "Done. Ctrl+Alt+S now works after every restart."
