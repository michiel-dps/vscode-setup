# Does every part of the setup still work on the VS Code that is installed now? (20 Nov 2026)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-update.ps1
#
# Why: he asked on 20 Nov 2026 that every personal setting is checked after every new
# VS Code version. A SessionStart hook (~/.claude/vscode-check/vscode-check.py) tells
# Claude at the start of a chat when VS Code has a version this script has not passed
# yet. Claude then runs this script and reports. Note section 12.
#
# What it does, in this order:
#   1. check-update.js: commands, "when" words and settings in keybindings.json and
#      settings.json, the API proposals and commands the own add-ons use, argv.json
#   2. the patches on the R add-on, the PDF viewer and Color Highlight (each script says
#      "already in place", or puts a lost patch back)
#   3. the own tests: Enter add-on, Word Page, Claude chat boxes and brackets, watch.R
#   4. check-vscode.ps1: every window run by the real VS Code, no empty window
# Only when nothing is WRONG does it write the version into
# ~/.claude/vscode-check/checked.txt, so the reminder comes back until all is fine.

$setup  = Split-Path -Parent $PSScriptRoot
$code   = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
$perl   = "C:\Program Files\Git\usr\bin\perl.exe"
$state  = "$env:USERPROFILE\.claude\vscode-check"
$wrong  = 0

function Show-Part($title) {
    ""
    "== $title"
}

# runs a test and counts it WRONG when its last lines do not say it passed
function Test-Lines($lines, $passWord) {
    $tail = @($lines | Select-Object -Last 3)
    $tail
    if (-not ($tail -match $passWord)) {
        $script:wrong = $script:wrong + 1
        "WRONG  this test did not pass"
    }
}

$env:ELECTRON_RUN_AS_NODE = 1

Show-Part "1. VS Code, keys, settings, API proposals"
$lines = @(& $code "$PSScriptRoot\check-update.js" 2>&1 | ForEach-Object { "$_" })
$lines
$version = ($lines | Where-Object { $_ -match '^VS Code (\S+)' } | Select-Object -First 1) -replace '^VS Code (\S+).*', '$1'
$count = ($lines | Where-Object { $_ -match '^WRONG: (\d+)' }) -replace '^WRONG: ', ''
if ($count -eq $null -or $count -eq '') { $count = 1 }
$wrong = $wrong + [int]$count

Show-Part "2. patches on add-ons"
& $perl "$setup\VS Code\patch-r-extension.pl" 2>&1 | ForEach-Object { "$_" }
& $perl "$setup\VS Code\patch-pdf-viewer.pl" 2>&1 | ForEach-Object { "$_" }
powershell -NoProfile -ExecutionPolicy Bypass -File "$setup\VS Code\patch-color-highlight.ps1" 2>&1 | ForEach-Object { "$_" }
"-- VS Code itself: the yellow box on the side panel tabs (Claude Code, Chat)"
$lines = @(powershell -NoProfile -ExecutionPolicy Bypass -File "$setup\VS Code\patch-vscode-tabs.ps1" 2>&1 | ForEach-Object { "$_" })
$lines
$wrong = $wrong + @($lines | Where-Object { $_ -match '^WRONG' }).Count

Show-Part "3. own tests"
"-- Enter add-on"
Test-Lines @(& $code "$setup\VS Code\local.r-pipe-indent-0.1.0\test.js" 2>&1 | ForEach-Object { "$_" }) ' 0 failed'
"-- Word Page"
Test-Lines @(& $code "$setup\VS Code\local.word-page-0.1.0\test.js" 2>&1 | ForEach-Object { "$_" }) ' 0 failed'
"-- Claude chat: code boxes wrap"
Test-Lines @(& $code "$env:USERPROFILE\.claude\tools\chat-opener\test-wrap.js" 2>&1 | ForEach-Object { "$_" }) 'ALL PASS'
"-- Claude chat: brackets"
Test-Lines @(& $code "$env:USERPROFILE\.claude\tools\chat-opener\test-brackets.js" 2>&1 | ForEach-Object { "$_" }) 'ALL PASS'
"-- watch.R"
$here = Get-Location
Set-Location "$setup\R"
$rscript = Get-ChildItem 'C:\Program Files\R' -Directory -Filter 'R-*' | Sort-Object Name | Select-Object -Last 1
Test-Lines @(& "$($rscript.FullName)\bin\Rscript.exe" watch-test.R 2>&1 | ForEach-Object { "$_" }) 'ALL OK'
Set-Location $here
Remove-Item Env:\ELECTRON_RUN_AS_NODE

Show-Part "4. windows"
$lines = @(powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-vscode.ps1" 2>&1 | ForEach-Object { "$_" })
$lines
$wrong = $wrong + @($lines | Where-Object { $_ -match '^WRONG' }).Count

""
if ($wrong -eq 0) {
    New-Item -ItemType Directory -Force $state | Out-Null
    Set-Content -Path "$state\checked.txt" -Value $version -Encoding ascii
    "ALL FINE on VS Code $version (saved in $state\checked.txt)"
} else {
    "$wrong thing(s) WRONG on VS Code $version. Fix them, then run this again."
}
