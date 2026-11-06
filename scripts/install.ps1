# install.ps1 -- puts the setup from this folder onto this laptop.
#
#   VS Code:     add-ons, settings, keybindings, the Enter add-on, R add-on fixes
#   R:           startup file (watch.R), .lintr, all R packages
#   git:         name, e-mail, GitHub login helper
#   Claude Code: rules (CLAUDE.md), settings and hooks, slash commands,
#                chat opener, memory
#
# Run by INSTALL.cmd (double-click). Safe to run again: add-ons and packages
# that are already there are skipped. Every file it replaces is first copied
# to C:\Users\<you>\setup-backup-<date>. Paths inside the files (user folder,
# Dropbox folder, R, Python) are changed to this laptop's paths.
#
# Test without changing this laptop:
#   install.ps1 -TestRoot <empty folder>
# Files then go under that folder; programs are listed but not run.

param([string]$TestRoot = '')

$setup   = Split-Path -Parent $PSScriptRoot        # the folder "VS Code setup"
$testing = $TestRoot -ne ''
if ($testing) {
    $userHome = Join-Path $TestRoot 'home'
    $appData  = Join-Path $userHome 'AppData\Roaming'
} else {
    $userHome = $env:USERPROFILE
    $appData  = $env:APPDATA
}
$vscodeUser = Join-Path $appData 'Code\User'
$extensions = Join-Path $userHome '.vscode\extensions'
$claude     = Join-Path $userHome '.claude'
$backup     = Join-Path $userHome ('setup-backup-' + (Get-Date -Format 'yyyy-MM-dd-HHmm'))
$utf8       = New-Object Text.UTF8Encoding $false


function Say($text) {
    Write-Host ''
    Write-Host "== $text" -ForegroundColor Cyan
}

# Run a program; when testing, only show what would run
function Run($what, [scriptblock]$action) {
    if ($testing) { Write-Host "   (test, not run) $what"; return }
    Write-Host "   $what"
    & $action
}

# Copy a file that is about to be replaced into the backup folder.
# Gives $false when that fails; the file is then left alone.
function Backup-File($file) {
    $relative = $file -replace ':', ''
    if ($file.StartsWith($userHome)) { $relative = $file.Substring($userHome.Length).TrimStart('\') }
    $safe = Join-Path $backup $relative
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path $safe) -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $file -Destination $safe -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Host "   NOT replaced, backup failed: $file" -ForegroundColor Red
        return $false
    }
}


# --- 1. Where the setup was saved from (saved-from.txt, written by save.ps1) ---
$saved = @{}
foreach ($line in [IO.File]::ReadAllLines((Join-Path $setup 'saved-from.txt'))) {
    $name, $value = $line -split ':\s+', 2
    $saved[$name] = $value
}
Write-Host "Setup saved on $($saved['Last change saved']) from computer $($saved['Computer'])."


# --- 2. Programs this laptop needs ---
Say 'Programs'
$code = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'
if (-not (Test-Path -LiteralPath $code)) {
    $found = Get-Command code.cmd -ErrorAction SilentlyContinue
    $code = if ($found) { $found.Source } else { $null }
}
$rFolder = Get-ChildItem 'C:\Program Files\R' -Directory -Filter 'R-*' -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace '^R-', '') } |
    Select-Object -Last 1
$git  = Get-Command git -ErrorAction SilentlyContinue
$gh   = Get-Command gh -ErrorAction SilentlyContinue
$perl = 'C:\Program Files\Git\usr\bin\perl.exe'     # comes with Git

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $python = & py -3 -c "import sys; print(sys.executable)" 2>$null
}
if (-not $python) {
    $found = Get-Command python -ErrorAction SilentlyContinue
    if ($found -and $found.Source -notlike '*WindowsApps*') { $python = $found.Source }
}

$missing = @()
if (-not $code)    { $missing += 'winget install -e --id Microsoft.VisualStudioCode' }
if (-not $rFolder) { $missing += 'winget install -e --id RProject.R' }
if (-not $git)     { $missing += 'winget install -e --id Git.Git' }
if (-not $gh)      { $missing += 'winget install -e --id GitHub.cli' }
if (-not $python)  { $missing += 'winget install -e --id Python.Python.3.12' }

if ($missing.Count -gt 0 -and -not $testing) {
    Write-Host 'Some programs are missing. Paste these lines into PowerShell, one at a time:' -ForegroundColor Yellow
    foreach ($line in $missing) { Write-Host "   $line" }
    Write-Host 'Then double-click INSTALL.cmd again.' -ForegroundColor Yellow
    exit 1
}
Write-Host "   VS Code: $code"
Write-Host "   R:       $($rFolder.FullName)"
Write-Host "   Python:  $python"
if (Get-Process -Name Code -ErrorAction SilentlyContinue) {
    Write-Host '   VS Code is open: close every VS Code window when this is done, then start it again.' -ForegroundColor Yellow
}


# --- 3. Old paths in the saved files -> this laptop's paths ---
# Each path in three spellings: C:\a\b, C:/a/b and C:\\a\\b (inside .json).
$swap = @{}
function Add-Swap($old, $new) {
    if (-not $old -or -not $new) { return }
    $swap[$old] = $new
    $swap[$old.Replace('\', '/')]  = $new.Replace('\', '/')
    $swap[$old.Replace('\', '\\')] = $new.Replace('\', '\\')
}
$oldDropbox = Split-Path (Split-Path $saved['Setup folder'])    # two levels above the setup folder
$newDropbox = Split-Path (Split-Path $setup)
Add-Swap $oldDropbox           $newDropbox
Add-Swap $saved['Home folder'] $userHome
Add-Swap $saved['R folder']    $rFolder.FullName
Add-Swap $saved['Python']      $python

# Longest path first, so the Dropbox folder wins over the home folder it is in
$pattern = ($swap.Keys | Sort-Object Length -Descending | ForEach-Object { [regex]::Escape($_) }) -join '|'

function Fix-Paths($text) {
    if (-not $pattern) { return $text }
    $ignoreCase = [Text.RegularExpressions.RegexOptions]::IgnoreCase
    return [regex]::Replace($text, $pattern, { param($match) $swap[$match.Value] }, $ignoreCase)
}

# Put one file in place: fix its paths, back up the old file, write it
function Install-File($from, $to) {
    $text = Fix-Paths ([IO.File]::ReadAllText($from))
    if (Test-Path -LiteralPath $to) {
        if ([IO.File]::ReadAllText($to) -ceq $text) { return }     # already the same
        if (-not (Backup-File $to)) { return }
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    [IO.File]::WriteAllText($to, $text, $utf8)
    Write-Host "   $to"
}

# Put every file of a folder in place
function Install-Folder($from, $to) {
    foreach ($file in Get-ChildItem -LiteralPath $from -Recurse -File) {
        $relative = $file.FullName.Substring($from.Length).TrimStart('\')
        Install-File $file.FullName (Join-Path $to $relative)
    }
}


# --- 4. VS Code ---
Say 'VS Code add-ons (the ones already there are skipped)'
$lines = Get-Content -LiteralPath "$setup\VS Code\extensions.txt" | Where-Object { $_ -and $_ -notlike '#*' }
foreach ($line in $lines) {
    $id, $version, $pinned = -split $line
    if ($pinned -eq 'pinned') {
        Run "code --install-extension $id@$version (pinned)" { & $code --install-extension "$id@$version" --force }
    } else {
        Run "code --install-extension $id" { & $code --install-extension $id }
    }
}

Say 'Enter add-on (local.r-pipe-indent)'
$addon = 'local.r-pipe-indent-0.1.0'
Install-Folder "$setup\VS Code\$addon" (Join-Path $extensions $addon)

# Add it to VS Code's list of add-ons (extensions.json), once
$registry = Join-Path $extensions 'extensions.json'
$list = @()
if (Test-Path -LiteralPath $registry) {
    $list = [IO.File]::ReadAllText($registry) | ConvertFrom-Json
    $list = @($list)
}
if (-not ($list | Where-Object { $_.identifier.id -eq 'local.r-pipe-indent' })) {
    $package = [IO.File]::ReadAllText("$setup\VS Code\$addon\package.json") | ConvertFrom-Json
    $path = (Join-Path $extensions $addon).Replace('\', '/')
    $path = '/' + $path.Substring(0, 1).ToLower() + $path.Substring(1)      # /c:/Users/...
    $list += [pscustomobject]@{
        identifier       = [pscustomobject]@{ id = 'local.r-pipe-indent' }
        version          = $package.version
        location         = [pscustomobject]@{ '$mid' = 1; path = $path; scheme = 'file' }
        relativeLocation = $addon
    }
    $safe = $true
    if (Test-Path -LiteralPath $registry) { $safe = Backup-File $registry }
    if ($safe) {
        New-Item -ItemType Directory -Force -Path $extensions | Out-Null
        [IO.File]::WriteAllText($registry, (ConvertTo-Json -InputObject $list -Depth 20 -Compress), $utf8)
        Write-Host "   added to $registry"
    }
}

# The add-on shows Claude's edits in VS Code's chat edit view; after Keep/Undo
# that needs an API proposal, allowed in argv.json (5 Nov 2026, note section 5)
$argv = Join-Path $userHome '.vscode\argv.json'
$allow = '"enable-proposed-api": ["local.r-pipe-indent"]'
if (-not (Test-Path -LiteralPath $argv)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $argv) | Out-Null
    [IO.File]::WriteAllText($argv, "{`r`n`t$allow`r`n}`r`n", $utf8)
    Write-Host "   made $argv"
} elseif (-not ([IO.File]::ReadAllText($argv) -match 'enable-proposed-api')) {
    if (Backup-File $argv) {
        $text = [IO.File]::ReadAllText($argv)
        $at = $text.IndexOf('{')
        $comma = if ($text.Substring($at + 1) -match '"') { ',' } else { '' }
        $text = $text.Substring(0, $at + 1) + "`r`n`t$allow$comma" + $text.Substring($at + 1)
        [IO.File]::WriteAllText($argv, $text, $utf8)
        Write-Host "   added to $argv"
    }
}

Say 'VS Code settings and keybindings'
Install-File "$setup\VS Code\settings.json"    (Join-Path $vscodeUser 'settings.json')
Install-File "$setup\VS Code\keybindings.json" (Join-Path $vscodeUser 'keybindings.json')


# --- 5. R ---
Say 'R'
Install-File "$setup\R\.lintr" (Join-Path $userHome '.lintr')

$rprofile = Join-Path $setup 'R\Rprofile.R'
Run "R_PROFILE_USER = $rprofile" { [Environment]::SetEnvironmentVariable('R_PROFILE_USER', $rprofile, 'User') }

$rscript = Join-Path "$($rFolder.FullName)" 'bin\Rscript.exe'
Run 'install the R packages this laptop does not have yet' {
    & $rscript --vanilla "$setup\scripts\install-packages.R" "$setup\R\packages.txt"
}
Run 'two fixes to the R add-on (data viewer, column-name popup)' { & $perl "$setup\VS Code\patch-r-extension.pl" }


# --- 6. git ---
Say 'git'
Install-File "$setup\git\.gitconfig" (Join-Path $userHome '.gitconfig')


# --- 7. Claude Code ---
Say 'Claude Code'
Install-File   "$setup\Claude Code\CLAUDE.md"     (Join-Path $claude 'CLAUDE.md')
Install-File   "$setup\Claude Code\settings.json" (Join-Path $claude 'settings.json')
Install-Folder "$setup\Claude Code\review"   (Join-Path $claude 'review')
Install-Folder "$setup\Claude Code\commands" (Join-Path $claude 'commands')
Install-Folder "$setup\Claude Code\tools"    (Join-Path $claude 'tools')

$build = Join-Path $claude 'tools\chat-opener\build.ps1'
Run 'install the chat opener add-on (for /chats)' { & powershell -NoProfile -ExecutionPolicy Bypass -File $build }

# Claude's memory. Each folder is named after a project's path, with - for
# every character that is not a letter or digit. All projects are in Dropbox,
# so only the Dropbox part of the name can differ between laptops.
# Memory files that are newer on this laptop are kept (robocopy /XO).
$oldStart = $oldDropbox -replace '[^A-Za-z0-9]', '-'
$newStart = $newDropbox -replace '[^A-Za-z0-9]', '-'
foreach ($project in Get-ChildItem -LiteralPath "$setup\Claude Code\memory" -Directory) {
    $name = $project.Name
    if ($name -like "$oldStart*") { $name = $newStart + $name.Substring($oldStart.Length) }
    $to = Join-Path $claude "projects\$name\memory"
    robocopy $project.FullName $to /E /XO /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
    Write-Host "   $to"
}


# --- 8. What is left to do by hand ---
Say 'Done. Now do these by hand, once:'
Write-Host '   1. Close every VS Code window and start VS Code again.'
Write-Host '   2. Sign in to Claude Code (the Claude panel in VS Code).'
Write-Host '      For pushing to GitHub, run once in PowerShell:  gh auth login'
Write-Host '   3. Right-click a line number in any file > Diff Decorations >'
Write-Host '      untick "Git Local Changes (Index)".'
Write-Host '   4. Ctrl+Shift+P > "Workspaces: Manage Workspace Trust" > Add Folder >'
Write-Host '      the <name> folder in Dropbox.'
Write-Host '   5. Ctrl+Alt+R opens an R terminal. If it asks to install "sess", say yes.'
Write-Host '      It should print: Viewer tabs now follow changes (watch.R).'
if (Test-Path -LiteralPath $backup) {
    Write-Host ''
    Write-Host "Files that were replaced are kept in $backup"
}
