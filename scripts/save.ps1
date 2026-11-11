# save.ps1 -- copies this laptop's setup (VS Code, R, Claude Code, git) into
# the folder "VS Code setup", so that INSTALL.cmd can put it on another laptop.
#
# Run by SAVE.cmd (double-click), and by Claude Code in the background at the
# start of every chat (SessionStart hook in ~/.claude/settings.json, -Quiet).
# It only writes inside the setup folder; the laptop's own files are never
# changed. Files that did not change are skipped.
#
# Not saved here because they are used straight from the setup folder:
# R\Rprofile.R, R\watch.R, the Enter add-on (VS Code\local.r-pipe-indent-0.1.0)
# and the startup screen (VS Code\local.startup-screen-0.1.0).

param([switch]$Quiet)

$setup      = Split-Path -Parent $PSScriptRoot      # the folder "VS Code setup"
$userHome   = $env:USERPROFILE
$vscodeUser = Join-Path $env:APPDATA 'Code\User'
$claude     = Join-Path $userHome '.claude'
$changed    = 0                                     # files or folders that changed


# Copy some files from one folder to another (robocopy skips unchanged files).
# robocopy exit codes: 0 = nothing to do, 1 = copied, 2 = removed, 8+ = error.
function Copy-Files($from, $to, $files) {
    if (-not (Test-Path -LiteralPath $from)) { return }
    robocopy $from $to $files /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Warning "could not copy $files from $from" }
    elseif ($LASTEXITCODE -band 3) { $script:changed++ }
}

# Make folder $to an exact copy of folder $from (files gone in $from are removed).
function Copy-Folder($from, $to, $skip = @()) {
    if (-not (Test-Path -LiteralPath $from)) { return }
    $options = @('/MIR', '/NJH', '/NJS', '/NFL', '/NDL', '/NP', '/R:1', '/W:1')
    if ($skip.Count -gt 0) { $options += '/XF'; $options += $skip }
    robocopy $from $to @options | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Warning "could not copy folder $from" }
    elseif ($LASTEXITCODE -band 3) { $script:changed++ }
}

# Write a text file, but only when its content is new.
function Write-IfChanged($file, $text) {
    if ((Test-Path -LiteralPath $file) -and ([IO.File]::ReadAllText($file) -ceq $text)) { return }
    [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding $false))
    $script:changed++
}


# --- VS Code: settings, keybindings and the list of add-ons ---
Copy-Files $vscodeUser "$setup\VS Code" @('settings.json', 'keybindings.json')

$registry = Join-Path $userHome '.vscode\extensions\extensions.json'
if (Test-Path -LiteralPath $registry) {
    $addons = [IO.File]::ReadAllText($registry) | ConvertFrom-Json

    # Where each own add-on (not on the Marketplace) comes from, and how it is installed
    $ownAddons = @{
        'local.r-pipe-indent'      = 'VS Code\local.r-pipe-indent-0.1.0 (INSTALL copies it)'
        'local.claude-chat-opener' = '..\Claude Code\tools\chat-opener (INSTALL runs its build.ps1)'
        'local.startup-screen'     = 'VS Code\local.startup-screen-0.1.0 (personal: run its build.ps1 by hand)'
    }

    $lines = @(
        '# Every VS Code add-on on this laptop. Written by save.ps1.',
        '# Add-ons from the Marketplace: id, version, pinned. INSTALL installs them.',
        '# Pinned add-ons are installed at this exact version and do not update by themselves.'
    )
    $ownLines = @(
        '#',
        '# Own add-ons (not on the Marketplace): id, version, where it comes from.',
        '# They are # lines, so INSTALL does not look for them on the Marketplace.'
    )
    foreach ($addon in ($addons | Sort-Object { $_.identifier.id })) {
        $id = $addon.identifier.id
        if ($id -like 'local.*') {
            $from = $ownAddons[$id]
            if (-not $from) { $from = 'own add-on, not yet in this setup folder' }
            $ownLines += ('#   {0,-30} {1,-8} {2}' -f $id, $addon.version, $from)
            continue
        }
        $pinned = ''
        if ($addon.metadata.pinned) { $pinned = 'pinned' }
        $lines += ('{0,-36} {1,-12} {2}' -f $id, $addon.version, $pinned).TrimEnd()
    }
    $lines += $ownLines
    Write-IfChanged "$setup\VS Code\extensions.txt" (($lines -join "`r`n") + "`r`n")
}


# --- R: .lintr and the list of installed packages ---
Copy-Files $userHome "$setup\R" @('.lintr')

$rLibraries = Join-Path $env:LOCALAPPDATA 'R\win-library'
$library = Get-ChildItem -LiteralPath $rLibraries -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } |
    Select-Object -Last 1
if ($library) {
    $packages = Get-ChildItem -LiteralPath $library.FullName -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'DESCRIPTION') } |
        ForEach-Object { $_.Name } |
        Sort-Object
    Write-IfChanged "$setup\R\packages.txt" (($packages -join "`r`n") + "`r`n")
}


# --- git: name, e-mail and GitHub login helper ---
Copy-Files $userHome "$setup\git" @('.gitconfig')


# --- Claude Code: rules, settings, hook script, slash commands, chat opener ---
Copy-Files  $claude "$setup\Claude Code" @('CLAUDE.md', 'settings.json')
Copy-Files  "$claude\review" "$setup\Claude Code\review" @('review.py')
Copy-Files  "$claude\awake" "$setup\Claude Code\awake" @('awake.py')
Copy-Folder "$claude\commands" "$setup\Claude Code\commands"
Copy-Folder "$claude\tools\chat-opener" "$setup\Claude Code\tools\chat-opener" @('chat-opener.vsix')

# Claude's memory: one folder per project, named after the project's path
$projects = Get-ChildItem -LiteralPath "$claude\projects" -Directory -ErrorAction SilentlyContinue
foreach ($project in $projects) {
    $memory = Join-Path $project.FullName 'memory'
    if (Test-Path -LiteralPath $memory) {
        Copy-Folder $memory "$setup\Claude Code\memory\$($project.Name)"
    }
}


# --- Where and when this was saved (INSTALL.cmd reads the folder lines) ---
$rFolder = Get-ChildItem 'C:\Program Files\R' -Directory -Filter 'R-*' -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace '^R-', '') } |
    Select-Object -Last 1
$python = Get-Command python -ErrorAction SilentlyContinue

$info = Join-Path $setup 'saved-from.txt'
if ($changed -gt 0 -or -not (Test-Path -LiteralPath $info)) {
    $text = @(
        "Last change saved: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "Computer:          $env:COMPUTERNAME",
        "Home folder:       $userHome",
        "Setup folder:      $setup",
        "R folder:          $($rFolder.FullName)",
        "Python:            $($python.Source)"
    ) -join "`r`n"
    [IO.File]::WriteAllText($info, $text + "`r`n", (New-Object Text.UTF8Encoding $false))
}

if (-not $Quiet) {
    Write-Host "Saved into $setup"
    Write-Host "$changed file(s) or folder(s) had changed since the last save."
}
