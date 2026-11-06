# Packages extension\ into chat-opener.vsix (a zip with forward-slash entry names) and installs it.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkg = Get-Content -LiteralPath "$root\extension\package.json" -Raw | ConvertFrom-Json
$vsix = "$root\chat-opener.vsix"

$contentTypes = @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>
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
  foreach ($f in Get-ChildItem -LiteralPath "$root\extension" -File) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, "extension/$($f.Name)") | Out-Null
  }
} finally { $zip.Dispose() }

& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension $vsix --force
