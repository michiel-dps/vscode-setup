# Sets the next picture from the favourites folder as the Windows lock screen.
# The show's background helper runs this each time you unlock, so every lock
# shows a different favourite. Add or remove .jpg files in the folder to change the set.

# the Pictures folder of whoever is signed in, so this works on every PC
$folder = Join-Path $env:USERPROFILE "Pictures\Elden Wallpaper\lock screen favourites"
$memory = Join-Path $PSScriptRoot "last-lock-picture.txt"

$pictures = @(Get-ChildItem $folder -Filter "*.jpg" | Sort-Object Name)
if ($pictures.Count -eq 0) { exit }

$last = ""
if (Test-Path $memory) { $last = (Get-Content $memory -Raw).Trim() }
$index = 0
foreach ($i in 0..($pictures.Count - 1)) {
  if ($pictures[$i].Name -eq $last) { $index = ($i + 1) % $pictures.Count }
}
$next = $pictures[$index]

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$forResult = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$forAction = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]

$getFile = $forResult.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @([Windows.Storage.StorageFile]::GetFileFromPathAsync($next.FullName)))
$getFile.Wait()
$setPicture = $forAction.Invoke($null, @([Windows.System.UserProfile.LockScreen]::SetImageFileAsync($getFile.Result)))
$setPicture.Wait()

Set-Content -Path $memory -Value $next.Name -Encoding utf8
