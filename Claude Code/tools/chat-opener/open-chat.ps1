# Asks the Claude Chat Opener add-on in VS Code to open a Claude Code chat as an editor tab.
# Falls back to the vscode:// link when no VS Code window answers.
param(
  [Parameter(Mandatory = $true)][string]$Session,
  [string]$Title = '',
  [string]$Cwd = (Get-Location).Path,
  [string]$Action = '',
  [int]$TimeoutSec = 20
)
$dir = Join-Path $env:USERPROFILE '.claude\chat-opener'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$id = [guid]::NewGuid().ToString('N')
$req = @{ session = $Session; title = $Title; cwd = $Cwd; action = $Action; time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
$utf8 = New-Object System.Text.UTF8Encoding $false
$request = Join-Path $dir "open-$id.json"
[System.IO.File]::WriteAllText("$request.tmp", $req, $utf8)
Move-Item -LiteralPath "$request.tmp" -Destination $request

$result = Join-Path $dir "done-$id.json"
$start = Get-Date
while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
  if (Test-Path -LiteralPath $result) {
    Start-Sleep -Milliseconds 100
    $r = [System.IO.File]::ReadAllText($result, $utf8) | ConvertFrom-Json
    Remove-Item -LiteralPath $result -ErrorAction SilentlyContinue
    "$($r.where): $($r.message)"
    exit 0
  }
  # Still unclaimed after 3 seconds means no VS Code window with the add-on has this folder open.
  if (((Get-Date) - $start).TotalSeconds -gt 3 -and (Test-Path -LiteralPath $request)) { break }
  Start-Sleep -Milliseconds 200
}

Remove-Item -LiteralPath $request -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process "vscode://anthropic.claude-code/open?session=$Session"
"fallback: The add-on didn't answer, so the chat was opened with the vscode:// link (it may land in the side panel)."
