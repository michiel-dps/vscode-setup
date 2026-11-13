# Builds and installs the Word Page add-on. Run after any change here, then Reload Window:
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
# 1. Runs test.js (the offline checks for patch.js) with VS Code's own node. Stops when one fails.
# 2. Packs the add-on into %TEMP%\word-page.vsix (a zip with forward-slash entry names) and installs it.
#    VS Code switches a newly installed add-on on by itself in the windows that are open.
# -NoInstall: only the checks and the packing. The folder bench\ is the test bench; it is not packed.
param(
    [string]$Code = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
    [switch]$NoInstall
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkg = Get-Content -LiteralPath "$root\package.json" -Raw | ConvertFrom-Json
$vsix = Join-Path $env:TEMP 'word-page.vsix'   # not in this folder: the folder is copied to GitHub
$files = @('package.json', 'extension.js', 'patch.js', 'mention.js', 'typing.js', 'test.js', 'pdfpages.py',
           'inject/word-page.template.js', 'inject/word-page.css', 'inject/light-theme.json',
           'inject/pdf-look.css', 'inject/fonts/README.txt')
# the fonts of the PDF look
$files += Get-ChildItem -LiteralPath "$root\inject\fonts" -Filter '*.otf' | Sort-Object Name | ForEach-Object { "inject/fonts/$($_.Name)" }

# --- 1. The checks ---
$exe = Join-Path (Split-Path (Split-Path $Code)) 'Code.exe'
$old = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = '1'
$out = Join-Path $env:TEMP 'word-page-test.out'
$run = Start-Process $exe -ArgumentList "`"$root\test.js`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out
$env:ELECTRON_RUN_AS_NODE = $old
Get-Content -LiteralPath $out | Write-Host
if ($run.ExitCode -ne 0) { throw 'A check in test.js failed (see the lines above). Nothing was installed.' }

# --- 2. The add-on ---
$contentTypes = @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".css" ContentType="text/css"/><Default Extension=".otf" ContentType="font/otf"/><Default Extension=".txt" ContentType="text/plain"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>
'@
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($pkg.name)" Version="$($pkg.version)" Publisher="$($pkg.publisher)"/>
    <DisplayName>$($pkg.displayName)</DisplayName>
    <Description xml:space="preserve">$($pkg.description)</Description>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($pkg.engines.vscode)"/></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
"@

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $vsix) { Remove-Item -LiteralPath $vsix }
$zip = [System.IO.Compression.ZipFile]::Open($vsix, 'Create')
try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  foreach ($e in @(@('[Content_Types].xml', $contentTypes), @('extension.vsixmanifest', $manifest))) {
    $w = New-Object System.IO.StreamWriter(($zip.CreateEntry($e[0])).Open(), $utf8); $w.Write($e[1]); $w.Close()
  }
  foreach ($name in $files) {
    $from = Join-Path $root ($name.Replace('/', '\'))
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $from, "extension/$name") | Out-Null
  }
} finally { $zip.Dispose() }
Write-Host "packed $vsix"

if (-not $NoInstall) {
  & $Code --install-extension $vsix --force
  Write-Host 'Installed. If the commands "Word Page: ..." are not there yet: Reload Window (Ctrl+Shift+P, Reload Window).'
}
