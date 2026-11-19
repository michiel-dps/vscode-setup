param(
  [string]$Dir,
  [string]$Out,
  [double]$Advance = 0,
  [string]$Extra = "",
  [int]$Budget = 2500,
  [int]$W = 3840,
  [int]$H = 1080
)
# Draws one frame of the moving wallpaper with Edge (no window) and saves it.
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$url = "file:///" + ($Dir -replace '\\', '/') + "/wallpaper.html?s=shadow&w=$W&h=$H&advance=$Advance$Extra"
$tag = [IO.Path]::GetFileNameWithoutExtension($Out)
$prof = "$env:TEMP\claude\edge-shot-$tag"
$raw = "$env:TEMP\claude\raw-shot-$tag.png"
$log = "$env:TEMP\claude\log-shot-$tag.txt"
& $edge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --user-data-dir="$prof" --force-device-scale-factor=1 --window-size="$($W + 200),$($H + 200)" --virtual-time-budget=$Budget --enable-logging=stderr --v=0 --screenshot="$raw" $url 2> $log | Out-Null
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($raw)
$outBitmap = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($outBitmap)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $W, $H), (New-Object System.Drawing.Rectangle 0, 0, $W, $H), [System.Drawing.GraphicsUnit]::Pixel)
$outBitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$outBitmap.Dispose()
$img.Dispose()
Select-String -Path $log -Pattern "CONSOLE|Uncaught|ERROR: 0" | Select-Object -First 8 | ForEach-Object { $_.Line }
"saved $Out"
