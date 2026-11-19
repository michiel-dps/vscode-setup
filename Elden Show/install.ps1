# install.ps1: puts the Elden Show on this PC (the moving Land of Shadow picture
# across two screens, started with Ctrl+Alt+S).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<setup folder>\Elden Show\install.ps1"
#
# What it does, for your account only (no admin):
#   1. copies the show to C:\Users\<you>\AppData\Local\EldenShow
#   2. unpacks the picture data (wallpaper\data\shadow.js.gz) and the three program
#      parts from Microsoft (*.dll.gz)
#   3. builds EldenShow.exe with the C# compiler that comes with Windows
#   4. puts the lock screen pictures in Pictures\Elden Wallpaper\lock screen favourites
#      (only when that folder has no pictures yet)
#   5. makes Ctrl+Alt+S work after every restart (a shortcut in the Startup folder)
#      and starts the background waiter now
# Safe to run again. Needs Windows 10 or 11 (the WebView2 part of Edge).
#
#   -To <empty folder>   test: install there, build, check, and start nothing

param([string]$To = '')

$here    = $PSScriptRoot
$testing = $To -ne ''
$dir     = Join-Path $env:LOCALAPPDATA 'EldenShow'
if ($testing) { $dir = $To }

# 1. stop a waiter that is running, then copy
$exe = Join-Path $dir 'EldenShow.exe'
if (-not $testing -and (Test-Path -LiteralPath $exe)) {
    & $exe --quit
    $waited = 0
    while ((Get-Process EldenShow -ErrorAction SilentlyContinue) -and $waited -lt 20) {
        Start-Sleep -Milliseconds 500
        $waited = $waited + 1
    }
}
New-Item -ItemType Directory -Force -Path "$dir\wallpaper\data", "$dir\stills" | Out-Null
Copy-Item "$here\EldenShow.cs", "$here\start-at-login.ps1", "$here\next-lock-picture.ps1" -Destination $dir -Force
Copy-Item "$here\wallpaper\*.html", "$here\wallpaper\*.js" -Destination "$dir\wallpaper" -Force
Copy-Item "$here\stills\*.jpg" -Destination "$dir\stills" -Force

# 2. unpack the picture data and the three program parts from Microsoft (WebView2)
function Expand-Packed($packedFile, $toFolder) {
    $name   = [IO.Path]::GetFileNameWithoutExtension($packedFile)   # shadow.js.gz gives shadow.js
    $packed = [IO.File]::OpenRead($packedFile)
    $unzip  = New-Object IO.Compression.GZipStream $packed, ([IO.Compression.CompressionMode]::Decompress)
    $plain  = [IO.File]::Create((Join-Path $toFolder $name))
    $unzip.CopyTo($plain)
    $plain.Close()
    $unzip.Close()
    $packed.Close()
}
Expand-Packed "$here\wallpaper\data\shadow.js.gz" "$dir\wallpaper\data"
foreach ($part in @(Get-ChildItem -Path "$here\*.dll.gz")) {
    Expand-Packed $part.FullName $dir
}

# 3. build the program
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$exe" "/r:$dir\Microsoft.Web.WebView2.Core.dll" "/r:$dir\Microsoft.Web.WebView2.WinForms.dll" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$dir\EldenShow.cs"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exe)) {
    Write-Host 'The program could not be built. Nothing was started.' -ForegroundColor Red
    exit 1
}

if ($testing) {
    Write-Host "Test install in $dir : built, nothing started."
    exit 0
}

# 4. the lock screen pictures (never over pictures that are already there)
$favourites = Join-Path $env:USERPROFILE 'Pictures\Elden Wallpaper\lock screen favourites'
New-Item -ItemType Directory -Force -Path $favourites | Out-Null
if (-not (Get-ChildItem $favourites -Filter '*.jpg')) {
    Copy-Item "$here\lock screen favourites\*.jpg" -Destination $favourites -Force
}

# 5. Ctrl+Alt+S after every restart, and now
& "$dir\start-at-login.ps1"
Write-Host 'Done. Press Ctrl+Alt+S for the show. The first touch of mouse or keyboard locks Windows.'
