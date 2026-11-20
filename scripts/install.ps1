# install.ps1 -- puts the setup from this folder onto this computer.
#
#   addons    VS Code add-ons from the Marketplace (extensions.txt)
#   enter     the Enter add-on (own): R pipes, Ctrl+Enter check, Claude's edits red/green
#   settings  VS Code settings (colours, editor) and keybindings (RStudio keys)
#   r         R startup file (watch.R), .lintr, all R packages, fixes to the R add-on and PDF viewer
#   wordpage  the Word Page add-on (own): write like in Word in Quarto's visual editor
#   git       name, e-mail, GitHub login helper (.gitconfig)
#   claude    Claude Code: rules (CLAUDE.md), settings and hooks, slash commands,
#             chat opener, keep-awake helper
#   memory    Claude's memory notes (not in the GitHub copy)
#   keyboard  Logitech MX Keys helper: F1/F2 dim external screens (DDC/CI), F6/F7 backlight
#
# Run by INSTALL.cmd (double-click): every part. Safe to run again: add-ons and
# packages that are already there are skipped. Every file it replaces is first
# copied to C:\Users\<you>\setup-backup-<date>. Paths inside the files (user
# folder, Dropbox folder, R, Python) are changed to this computer's paths, also
# the <you>/<Dropbox>/<name> placeholders of the GitHub copy.
#
#   install.ps1 -Plan                  show every part: what it does, what it downloads,
#                                      which files it replaces; changes nothing
#   install.ps1 -Parts settings,r      only these parts (names above)
#   install.ps1 -SkipAddons a.b,c.d    leave these Marketplace add-ons out
#   install.ps1 -GitName "<your name>" -GitEmail "<your e-mail>"
#                                      the name and e-mail for git (needed with the GitHub copy)
#   install.ps1 -TestRoot <empty folder>
#                                      test: files go under that folder; programs are listed, not run
#
# A guided install with Claude: CLAUDE.md at the top of the GitHub copy (its
# source is scripts\github-CLAUDE.md) tells Claude how to walk someone through it.

param(
    [string]$TestRoot = '',
    [switch]$Plan,
    [string[]]$Parts = @(),
    [string[]]$SkipAddons = @(),
    [string]$GitName = '',
    [string]$GitEmail = ''
)

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

# "-Parts a,b" arrives as one text through powershell -File: split it
function Split-List($list) {
    return @($list | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToLower() })
}
$allParts   = @('addons', 'enter', 'settings', 'r', 'wordpage', 'git', 'claude', 'memory', 'keyboard')
$Parts      = Split-List $Parts
$SkipAddons = Split-List $SkipAddons
if ($Parts.Count -eq 0) { $Parts = $allParts }
$unknown = @($Parts | Where-Object { $allParts -notcontains $_ })
if ($unknown.Count -gt 0) {
    Write-Host "Unknown part(s): $($unknown -join ', '). The parts are: $($allParts -join ', ')" -ForegroundColor Red
    exit 1
}
function Want($part) { return $Parts -contains $part }


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


# --- 2. Programs this computer needs ---
# A program installed a moment ago (winget) is not yet on the PATH of a window
# that was already open, such as VS Code with Claude in it. Read the PATH again
# from Windows, so the next run finds the program without a restart.
$windowsPath = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine'),
    [Environment]::GetEnvironmentVariable('Path', 'User'),
    $env:Path
) | Where-Object { $_ }
$env:Path = $windowsPath -join [IO.Path]::PathSeparator

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

# Each program: is it there, how to get it, about how big, which parts need it
$programs = [ordered]@{
    'VS Code'    = @{ have = [bool]$code;    get = 'winget install -e --id Microsoft.VisualStudioCode'; size = 'about 100 MB'; parts = @('addons', 'enter', 'settings', 'r', 'wordpage', 'claude') }
    'R'          = @{ have = [bool]$rFolder; get = 'winget install -e --id RProject.R';                 size = 'about 90 MB';  parts = @('r') }
    'Git'        = @{ have = [bool]$git;     get = 'winget install -e --id Git.Git';                    size = 'about 65 MB';  parts = @('r', 'git') }
    'GitHub CLI' = @{ have = [bool]$gh;      get = 'winget install -e --id GitHub.cli';                 size = 'about 15 MB';  parts = @('git') }
    'Python'     = @{ have = [bool]$python;  get = 'winget install -e --id Python.Python.3.12';         size = 'about 30 MB';  parts = @('wordpage', 'claude', 'keyboard') }
}
function Needed($program) { return @($programs[$program].parts | Where-Object { Want $_ }).Count -gt 0 }


# --- 3. -Plan: show what each chosen part does, downloads and replaces; change nothing ---
if ($Plan) {
    $addonLines = @(Get-Content -LiteralPath "$setup\VS Code\extensions.txt" | Where-Object { $_ -and $_ -notlike '#*' })
    $packageCount = @(Get-Content -LiteralPath "$setup\R\packages.txt" | Where-Object { $_ }).Count
    $gitPlaceholder = ([IO.File]::ReadAllText("$setup\git\.gitconfig") -match 'Your Name|you@example\.com')
    function Replaces($files) {
        $there = @($files | Where-Object { Test-Path -LiteralPath $_ })
        if ($there.Count -eq 0) { return 'nothing (these files are new on this computer)' }
        return ($there -join ', ') + ' (a copy goes to the backup folder first)'
    }
    $info = [ordered]@{
        addons   = @{ title = 'VS Code add-ons from the Marketplace'
                      does = 'installs the add-ons below (the ones already there are skipped)'
                      downloads = (($addonLines | ForEach-Object { '      - ' + ((-split $_)[0]) + $(if ($SkipAddons -contains ((-split $_)[0]).ToLower()) { '   (skipped)' } else { '' }) }) -join "`n")
                      files = @() }
        enter    = @{ title = 'Enter add-on (own, no download)'
                      does = 'Enter keeps R pipes indented, Ctrl+Enter refuses an unfinished R statement, Claude''s edits show red/green with Keep / Undo (needs VS Code''s built-in Copilot chat, signed in to GitHub). Adds one line to argv.json.'
                      downloads = 'nothing'
                      files = @((Join-Path $userHome '.vscode\argv.json')) }
        settings = @{ title = 'VS Code settings and keybindings'
                      does = 'the idleFingers colours, editor settings like RStudio, RStudio keys (Ctrl+Enter, Ctrl+Shift+M, ...). Replaces your own settings and keys.'
                      downloads = 'nothing'
                      files = @((Join-Path $vscodeUser 'settings.json'), (Join-Path $vscodeUser 'keybindings.json')) }
        r        = @{ title = 'R like RStudio'
                      does = 'R startup file watch.R (viewer tabs follow changes), .lintr, sets R_PROFILE_USER, fixes five things in the R add-on and the PDF viewer (needs the add-ons reditorsupport.r and tomoki1207.pdf)'
                      downloads = "$packageCount R packages from CRAN (only the missing ones; the first time 10 to 20 minutes)"
                      files = @((Join-Path $userHome '.lintr')) }
        wordpage = @{ title = 'Word Page add-on (own, no download)'
                      does = 'a white page like in Word in Quarto''s visual editor, with PDF page ends and own spelling suggestions (needs the add-on quarto.quarto)'
                      downloads = 'nothing'
                      files = @() }
        git      = @{ title = 'git settings'
                      does = $(if ($gitPlaceholder) { 'name, e-mail and the GitHub login helper. Give your own name and e-mail (-GitName, -GitEmail), otherwise this part is skipped.' } else { 'name, e-mail and the GitHub login helper' })
                      downloads = 'nothing'
                      files = @((Join-Path $userHome '.gitconfig')) }
        claude   = @{ title = 'Claude Code setup'
                      does = 'CLAUDE.md (the setup owner''s rules for Claude: R style, how to answer; read it first, you may want your own), settings.json with hooks (Claude''s R edits shown red/green in VS Code; keeps the computer awake while Claude works), slash commands /chats /handoff /takeon /personalsettings, the chat opener add-on'
                      downloads = 'nothing'
                      files = @((Join-Path $claude 'CLAUDE.md'), (Join-Path $claude 'settings.json')) }
        memory   = @{ title = 'Claude''s memory notes'
                      does = $(if (Test-Path -LiteralPath "$setup\Claude Code\memory") { 'copies the notes; newer notes on this computer are kept' } else { 'not in this copy: nothing to do' })
                      downloads = 'nothing'
                      files = @() }
        keyboard = @{ title = 'Logitech MX Keys helper (only useful with that keyboard)'
                      does = 'a small Python program that starts at every logon: F1/F2 dim and brighten external screens over the cable (DDC/CI), F6/F7 keep the key backlight always on or normal. Leave it out with Logitech Options+.'
                      downloads = 'the Python package hidapi, if it is not there yet (under 1 MB)'
                      files = @((Join-Path $appData 'Microsoft\Windows\Start Menu\Programs\Startup\MX Keys Backlight Always On.vbs')) }
    }
    Write-Host ''
    Write-Host 'PLAN: nothing is changed. Parts:' -ForegroundColor Cyan
    foreach ($part in $Parts) {
        $p = $info[$part]
        $needs = @($programs.Keys | Where-Object { $programs[$_].parts -contains $part })
        $needText = if ($needs.Count -eq 0) { 'no programs' } else { ($needs | ForEach-Object { if ($programs[$_].have) { "$_ (there)" } else { "$_ (MISSING)" } }) -join ', ' }
        Write-Host ''
        Write-Host "[$part] $($p.title)" -ForegroundColor Cyan
        Write-Host "   does:      $($p.does)"
        if ($p.downloads -like "*`n*") { Write-Host "   downloads:"; Write-Host $p.downloads } else { Write-Host "   downloads: $($p.downloads)" }
        Write-Host "   needs:     $needText"
        if ($p.files.Count -gt 0) { Write-Host "   replaces:  $(Replaces $p.files)" }
    }
    Write-Host ''
    Write-Host 'Programs to download first (each with its own line, in PowerShell):' -ForegroundColor Cyan
    $any = $false
    foreach ($name in $programs.Keys) {
        if ((Needed $name) -and -not $programs[$name].have) {
            Write-Host "   $name ($($programs[$name].size)):  $($programs[$name].get)"
            $any = $true
        }
    }
    if (-not $any) { Write-Host '   none: every program these parts need is already there' }
    Write-Host ''
    Write-Host "Backup folder for replaced files: $backup"
    exit 0
}


# --- 4. Missing programs: only the ones the chosen parts need ---
Say 'Programs'
$missing = @()
foreach ($name in $programs.Keys) {
    if ((Needed $name) -and -not $programs[$name].have) { $missing += "$($programs[$name].get)      ($name, $($programs[$name].size))" }
}
if ($missing.Count -gt 0 -and -not $testing) {
    Write-Host 'Some programs are missing. Paste these lines into PowerShell, one at a time:' -ForegroundColor Yellow
    foreach ($line in $missing) { Write-Host "   $line" }
    Write-Host 'Then run the install again.' -ForegroundColor Yellow
    exit 1
}
if ($code)    { Write-Host "   VS Code: $code" }
if ($rFolder) { Write-Host "   R:       $($rFolder.FullName)" }
if ($python)  { Write-Host "   Python:  $python" }
Write-Host "   Parts:   $($Parts -join ', ')"
if (Get-Process -Name Code -ErrorAction SilentlyContinue) {
    Write-Host '   VS Code is open: close every VS Code window when this is done, then start it again.' -ForegroundColor Yellow
}


# --- 5. Old paths in the saved files -> this computer's paths ---
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
Add-Swap $saved['Setup folder'] $setup          # the setup folder itself (a GitHub copy can be anywhere)
Add-Swap $oldDropbox           $newDropbox
Add-Swap $saved['Home folder'] $userHome
Add-Swap $saved['R folder']    $rFolder.FullName
Add-Swap $saved['Python']      $python

# Every computer that saved here (computers.txt, written by save.ps1 since 18 Nov 2026).
# The files in this folder can come from different computers, so the paths of
# each computer become this computer's paths, not only those of the last one.
$computersFile = Join-Path $setup 'computers.txt'
if (Test-Path -LiteralPath $computersFile) {
    foreach ($line in [IO.File]::ReadAllLines($computersFile)) {
        if (-not $line -or $line.StartsWith('#')) { continue }
        $otherName, $otherHome, $otherR, $otherPython = $line -split '\s*\|\s*'
        Add-Swap $otherHome $userHome
        Add-Swap $otherR $rFolder.FullName
        Add-Swap $otherPython $python
    }
}

# Longest path first, so the Dropbox folder wins over the home folder it is in
$pattern = ($swap.Keys | Sort-Object Length -Descending | ForEach-Object { [regex]::Escape($_) }) -join '|'

function Fix-Paths($text) {
    if (-not $pattern) { return $text }
    $ignoreCase = [Text.RegularExpressions.RegexOptions]::IgnoreCase
    return [regex]::Replace($text, $pattern, { param($match) $swap[$match.Value] }, $ignoreCase)
}

# Put one file in place: fix its paths, back up the old file, write it
function Install-File($from, $to, $text = $null) {
    if ($null -eq $text) { $text = Fix-Paths ([IO.File]::ReadAllText($from)) }
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


# --- 6. VS Code ---
if (Want 'addons') {
    Say 'VS Code add-ons (the ones already there are skipped)'
    $lines = Get-Content -LiteralPath "$setup\VS Code\extensions.txt" | Where-Object { $_ -and $_ -notlike '#*' }
    foreach ($line in $lines) {
        $id, $version, $pinned = -split $line
        if ($SkipAddons -contains $id.ToLower()) { Write-Host "   skipped: $id"; continue }
        if ($pinned -eq 'pinned') {
            Run "code --install-extension $id@$version (pinned)" { & $code --install-extension "$id@$version" --force }
        } else {
            Run "code --install-extension $id" { & $code --install-extension $id }
        }
    }
}

if (Want 'enter') {
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
}

if (Want 'settings') {
    Say 'VS Code settings and keybindings'
    Install-File "$setup\VS Code\settings.json"    (Join-Path $vscodeUser 'settings.json')
    Install-File "$setup\VS Code\keybindings.json" (Join-Path $vscodeUser 'keybindings.json')
}


# --- 7. R ---
if (Want 'r') {
    Say 'R'
    Install-File "$setup\R\.lintr" (Join-Path $userHome '.lintr')

    $rprofile = Join-Path $setup 'R\Rprofile.R'
    Run "R_PROFILE_USER = $rprofile" { [Environment]::SetEnvironmentVariable('R_PROFILE_USER', $rprofile, 'User') }

    $rscript = Join-Path "$($rFolder.FullName)" 'bin\Rscript.exe'
    Run 'install the R packages this computer does not have yet' {
        & $rscript --vanilla "$setup\scripts\install-packages.R" "$setup\R\packages.txt"
    }
    Run 'five fixes to the R add-on (data viewer, column-name popup, knit PDF, plot to front, plot zoom)' { & $perl "$setup\VS Code\patch-r-extension.pl" }
    Run 'PDF viewer: smooth zoom at the mouse, clean reload after a knit' { & $perl "$setup\VS Code\patch-pdf-viewer.pl" }
}

if (Want 'wordpage') {
    Say 'Word Page add-on'
    # The Quarto program. Without it Quarto's visual editor has no pandoc and a .qmd page
    # loads slowly or not at all (found 20 Nov 2026 on the work computer). The zip needs no
    # admin rights, and the Quarto add-on looks in %LOCALAPPDATA%\Programs\Quarto by itself.
    $quartoHome = Join-Path $env:LOCALAPPDATA 'Programs\Quarto'
    if (Test-Path (Join-Path $quartoHome 'bin\quarto.exe')) {
        Write-Host "   Quarto program already in $quartoHome"
    } else {
        Run 'Quarto program 1.11.9 (gives the visual editor its pandoc)' {
            $zip = Join-Path $env:TEMP 'quarto-win.zip'
            Invoke-WebRequest 'https://github.com/quarto-dev/quarto-cli/releases/download/v1.11.9/quarto-1.11.9-win.zip' -OutFile $zip
            Expand-Archive -Path $zip -DestinationPath $quartoHome
            Remove-Item $zip
        }
    }
    Run 'Word Page add-on (write like in Word: a white page in the Quarto visual editor)' {
        & powershell -NoProfile -ExecutionPolicy Bypass -File "$setup\VS Code\local.word-page-0.1.0\build.ps1"
    }
}


# --- 8. git ---
if (Want 'git') {
    Say 'git'
    $text = Fix-Paths ([IO.File]::ReadAllText("$setup\git\.gitconfig"))
    if ($GitName)  { $text = $text -replace '(?m)^(\s*name\s*=\s*).*$',  "`${1}$GitName" }
    if ($GitEmail) { $text = $text -replace '(?m)^(\s*email\s*=\s*).*$', "`${1}$GitEmail" }
    if ($text -match 'Your Name|you@example\.com') {
        Write-Host '   skipped: .gitconfig still has "Your Name" / you@example.com. Run again with -GitName and -GitEmail.' -ForegroundColor Yellow
    } else {
        Install-File "$setup\git\.gitconfig" (Join-Path $userHome '.gitconfig') $text
    }
    # A computer whose home folder is a network drive (the UiO computer: M:) makes git look
    # for .gitconfig there. Point git at the real one in two ways (18 Nov 2026):
    # the user variable GIT_CONFIG_GLOBAL (programs started after this see it), and a
    # pointer file on the network drive (also for programs that were already open).
    $gitHome = "$env:HOMEDRIVE$env:HOMEPATH".TrimEnd('\')
    $realGitconfig = (Join-Path $userHome '.gitconfig') -replace '\\', '/'
    if ($gitHome -and ($gitHome -ne $env:USERPROFILE.TrimEnd('\'))) {
        Run "GIT_CONFIG_GLOBAL = $realGitconfig" {
            [Environment]::SetEnvironmentVariable('GIT_CONFIG_GLOBAL', (Join-Path $userHome '.gitconfig'), 'User')
        }
        $pointer = Join-Path "$gitHome\" '.gitconfig'
        if (-not (Test-Path -LiteralPath $pointer)) {
            Run "pointer file $pointer" {
                $lines = "# Pointer only. The home folder is on a network drive, so git without`n" +
                    "# GIT_CONFIG_GLOBAL reads this file. The real settings are in:`n" +
                    "[include]`n`tpath = $realGitconfig`n"
                [IO.File]::WriteAllText($pointer, $lines, (New-Object System.Text.UTF8Encoding $false))
            }
        }
    }
}


# --- 9. Claude Code ---
if (Want 'claude') {
    Say 'Claude Code'
    Install-File   "$setup\Claude Code\CLAUDE.md"     (Join-Path $claude 'CLAUDE.md')
    Install-File   "$setup\Claude Code\settings.json" (Join-Path $claude 'settings.json')
    Install-Folder "$setup\Claude Code\review"   (Join-Path $claude 'review')
    Install-Folder "$setup\Claude Code\awake"    (Join-Path $claude 'awake')
    Install-Folder "$setup\Claude Code\vscode-check" (Join-Path $claude 'vscode-check')
    Install-Folder "$setup\Claude Code\commands" (Join-Path $claude 'commands')
    Install-Folder "$setup\Claude Code\tools"    (Join-Path $claude 'tools')

    $build = Join-Path $claude 'tools\chat-opener\build.ps1'
    Run 'install the chat opener add-on (for /chats)' { & powershell -NoProfile -ExecutionPolicy Bypass -File $build }
}

# Claude's memory. Each folder is named after a project's path, with - for
# every character that is not a letter or digit. All projects are in Dropbox,
# so only the Dropbox part of the name can differ between computers.
# Memory files that are newer on this computer are kept (robocopy /XO).
if ((Want 'memory') -and (Test-Path -LiteralPath "$setup\Claude Code\memory")) {
    Say "Claude's memory"
    $oldStart = $oldDropbox -replace '[^A-Za-z0-9]', '-'
    $newStart = $newDropbox -replace '[^A-Za-z0-9]', '-'
    foreach ($project in Get-ChildItem -LiteralPath "$setup\Claude Code\memory" -Directory) {
        $name = $project.Name
        if ($name -like "$oldStart*") { $name = $newStart + $name.Substring($oldStart.Length) }
        $to = Join-Path $claude "projects\$name\memory"
        robocopy $project.FullName $to /E /XO /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
        Write-Host "   $to"
    }
}


# --- 9b. Keyboard: the Logitech MX Keys helper (18 Nov 2026, note section 10) ---
if (Want 'keyboard') {
    Say 'Keyboard helper (Logitech MX Keys)'
    $tools = Join-Path $userHome 'Tools\mxkeys'
    Install-Folder "$setup\Keyboard" $tools

    # The helper runs Python with -I, which does not see packages installed with --user
    Run 'Python package hidapi (talks to the keyboard)' {
        & $python -I -c "import hid" 2>$null
        if ($LASTEXITCODE -ne 0) { & $python -m pip install --quiet hidapi }
    }

    # The logon launcher, with this computer's Python (pythonw: no window)
    $pythonw  = Join-Path (Split-Path $python) 'pythonw.exe'
    $launcher = Join-Path $appData 'Microsoft\Windows\Start Menu\Programs\Startup\MX Keys Backlight Always On.vbs'
    $script   = Join-Path $tools 'mxkeys_backlight.py'
    $text = @(
        "' Starts the MX Keys helper hidden at logon: F1/F2 screen brightness, F6/F7 backlight.",
        "' Written by install.ps1 of the setup folder (note section 10).",
        'Set sh = CreateObject("WScript.Shell")',
        "sh.Run """"""$pythonw"""" -I """"$script"""" watch"", 0, False"
    ) -join "`r`n"
    Install-File $null $launcher ($text + "`r`n")

    # Start it now (again), so the new files are used without a logon
    Run 'start the keyboard helper' {
        Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
            Where-Object { $_.CommandLine -match 'mxkeys_backlight' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Start-Process wscript.exe -ArgumentList "`"$launcher`""
    }
}


# --- 10. What is left to do by hand (only for the chosen parts) ---
Say 'Done. Now do these by hand, once:'
$steps = @('Close every VS Code window and start VS Code again.')
if (Want 'claude')   { $steps += 'Sign in to Claude Code (the Claude panel in VS Code).' }
if (Want 'git')      { $steps += 'For pushing to GitHub, run once in PowerShell:  gh auth login' }
if (Want 'enter')    { $steps += 'Right-click a line number in any file > Diff Decorations > untick "Git Local Changes (Index)".' }
if (Want 'claude')   { $steps += 'Ctrl+Shift+P > "Workspaces: Manage Workspace Trust" > Add Folder > the folder with your projects.' }
if (Want 'r')        { $steps += 'Ctrl+Alt+R opens an R terminal. If it asks to install "sess", say yes. It should print: Viewer tabs now follow changes (watch.R).' }
if (Want 'keyboard') { $steps += 'Press F1 on the MX Keys: external screens get darker (F2 brighter). If F1 opens a menu instead, press Fn+Esc once.' }
for ($i = 0; $i -lt $steps.Count; $i++) { Write-Host ("   {0}. {1}" -f ($i + 1), $steps[$i]) }
if (Test-Path -LiteralPath $backup) {
    Write-Host ''
    Write-Host "Files that were replaced are kept in $backup"
}
