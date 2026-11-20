# install.ps1: puts the VS Code window keeper on this PC (20 Nov 2026, note section 6, point 9).
# It repairs a VS Code window that stopped drawing (plain grey, no title bar, no tabs).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<setup folder>\VS Code\window-keeper\install.ps1"
#
# For your account only, no admin, nothing downloaded:
#   1. builds WindowKeeper.exe from WindowKeeper.cs with the C# compiler that comes with Windows,
#      into C:\Users\<you>\AppData\Local\VsWindowKeeper
#   2. puts the shortcut "VS Code window keeper" in the Startup folder (starts it at every login)
#   3. starts it now (a running one is stopped first)
# Safe to run again.
#
#   -To <empty folder>   test: build there, start nothing

param([string]$To = '')

$dir = Join-Path $env:LOCALAPPDATA 'VsWindowKeeper'
if ($To -ne '') { $dir = $To }
$exe = Join-Path $dir 'WindowKeeper.exe'

# stop the running one, so its program file can be replaced
if ($To -eq '' -and (Test-Path -LiteralPath $exe)) {
    & $exe --quit
    $waited = 0
    while ((Get-Process WindowKeeper -ErrorAction SilentlyContinue) -and $waited -lt 20) {
        Start-Sleep -Milliseconds 500
        $waited = $waited + 1
    }
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$PSScriptRoot\WindowKeeper.cs"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exe)) {
    Write-Host 'The window keeper could not be built. Nothing was started.' -ForegroundColor Red
    exit 1
}
if ($To -ne '') {
    Write-Host "Test build in $dir : built, nothing started."
    exit 0
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'VS Code window keeper.lnk'))
$link.TargetPath = $exe
$link.WorkingDirectory = $dir
$link.Description = 'Repairs a VS Code window that stopped drawing (plain grey)'
$link.Save()

Start-Process $exe
Write-Host 'Done. The VS Code window keeper runs now and at every login.'
