# save.ps1 -- copies this computer's setup (VS Code, R, Claude Code, git, keyboard) into
# the folder "VS Code setup", so that INSTALL.cmd can put it on another computer.
#
# Run by SAVE.cmd (double-click), and by Claude Code in the background at the
# start of every chat (SessionStart hook in ~/.claude/settings.json, -Quiet).
# It only writes inside the setup folder; the computer's own files are never
# changed. Files that did not change are skipped.
#
# Not saved here because they are used straight from the setup folder:
# R\Rprofile.R, R\watch.R, the Enter add-on (VS Code\local.r-pipe-indent-0.1.0),
# the startup screen (VS Code\local.startup-screen-0.1.0) and Word Page
# (VS Code\local.word-page-0.1.0).
#
# Two computers (18 Nov 2026). Both computers save into this one folder, so SAVE
# never throws away what the other computer saved:
#   - A file is copied only when it is newer on this computer than in the folder
#     (robocopy /XO). A setting changed later on the other computer stays.
#   - Nothing is deleted from the folder. A slash command, memory note or
#     picture removed on one computer stays here. Delete it here by hand too.
#   - packages.txt and extensions.txt are added to, not replaced. To drop a
#     package or add-on for good, take its line out by hand.
#   - computers.txt keeps one line per computer: its user folder, R and Python.
#     INSTALL changes the paths of every computer in it to the new computer's
#     paths, so files saved by different computers all work.
# To bring this computer up to date with the other one: SAVE.cmd, then INSTALL.cmd.

param([switch]$Quiet)

$setup      = Split-Path -Parent $PSScriptRoot      # the folder "VS Code setup"
$userHome   = $env:USERPROFILE
$vscodeUser = Join-Path $env:APPDATA 'Code\User'
$claude     = Join-Path $userHome '.claude'
$changed    = 0                                     # files or folders that changed


# Copy some files from one folder to another. Only files that are newer here
# than in the folder (/XO): the other computer may have saved a newer one.
# robocopy exit codes: 0 = nothing to do, 1 = copied, 2 = extra files there, 8+ = error.
function Copy-Files($from, $to, $files) {
    if (-not (Test-Path -LiteralPath $from)) { return }
    robocopy $from $to $files /XO /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Warning "could not copy $files from $from" }
    elseif ($LASTEXITCODE -band 1) { $script:changed++ }
}

# Copy a whole folder, with its subfolders. Only files that are newer here (/XO),
# and nothing is removed there: files only the other computer has must stay (18 Nov 2026).
function Copy-Folder($from, $to, $skip = @()) {
    if (-not (Test-Path -LiteralPath $from)) { return }
    $options = @('/E', '/XO', '/NJH', '/NJS', '/NFL', '/NDL', '/NP', '/R:1', '/W:1')
    if ($skip.Count -gt 0) {
        $options += '/XF'
        $options += $skip
    }
    robocopy $from $to @options | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Warning "could not copy folder $from" }
    elseif ($LASTEXITCODE -band 1) { $script:changed++ }
}

# Is version $a the same as version $b, or newer? Odd versions count as newer.
function Test-SameOrNewer($a, $b) {
    try { return ([version]$a -ge [version]$b) } catch { return $true }
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
        'local.word-page'          = 'VS Code\local.word-page-0.1.0 (INSTALL runs its build.ps1)'
    }

    # The list as it is in the folder: the other computer may have add-ons that
    # this one does not have, or a newer version (18 Nov 2026)
    $listFile = "$setup\VS Code\extensions.txt"
    $market = [ordered]@{}
    $own    = [ordered]@{}
    if (Test-Path -LiteralPath $listFile) {
        foreach ($line in Get-Content -LiteralPath $listFile) {
            if ($line -match '^#\s+(local\.\S+)\s+(\S+)') {
                $own[$matches[1]] = @{ version = $matches[2]; line = $line }
            } elseif ($line -and $line -notlike '#*') {
                $parts = -split $line
                $market[$parts[0]] = @{ version = $parts[1]; line = $line }
            }
        }
    }

    # This computer's add-ons replace a line only when they are the same version or newer
    foreach ($addon in $addons) {
        $id = $addon.identifier.id
        if ($id -like 'local.*') {
            $from = $ownAddons[$id]
            if (-not $from) { $from = 'own add-on, not yet in this setup folder' }
            $line = ('#   {0,-30} {1,-8} {2}' -f $id, $addon.version, $from)
            if (-not $own.Contains($id) -or (Test-SameOrNewer $addon.version $own[$id].version)) {
                $own[$id] = @{ version = $addon.version; line = $line }
            }
            continue
        }
        $pinned = ''
        if ($addon.metadata.pinned) { $pinned = 'pinned' }
        $line = ('{0,-36} {1,-12} {2}' -f $id, $addon.version, $pinned).TrimEnd()
        if (-not $market.Contains($id) -or (Test-SameOrNewer $addon.version $market[$id].version)) {
            $market[$id] = @{ version = $addon.version; line = $line }
        }
    }

    $lines = @(
        '# Every VS Code add-on on these computers. Written by save.ps1.',
        '# Add-ons from the Marketplace: id, version, pinned. INSTALL installs them.',
        '# Pinned add-ons are installed at this exact version and do not update by themselves.'
    )
    $lines += @($market.Keys | Sort-Object | ForEach-Object { $market[$_].line })
    $lines += @(
        '#',
        '# Own add-ons (not on the Marketplace): id, version, where it comes from.',
        '# They are # lines, so INSTALL does not look for them on the Marketplace.'
    )
    $lines += @($own.Keys | Sort-Object | ForEach-Object { $own[$_].line })
    Write-IfChanged $listFile (($lines -join "`r`n") + "`r`n")
}


# --- R: .lintr and the list of installed packages ---
Copy-Files $userHome "$setup\R" @('.lintr')

$rLibraries = Join-Path $env:LOCALAPPDATA 'R\win-library'
$library = Get-ChildItem -LiteralPath $rLibraries -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } |
    Select-Object -Last 1
if ($library) {
    $packages = @(Get-ChildItem -LiteralPath $library.FullName -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'DESCRIPTION') } |
        ForEach-Object { $_.Name })

    # Add to the list, never take out (18 Nov 2026). The other computer may have
    # packages this one has not, and the UiO computer keeps most of its packages
    # in R's own library, which is not looked at here.
    $listFile = "$setup\R\packages.txt"
    if (Test-Path -LiteralPath $listFile) {
        $packages += @(Get-Content -LiteralPath $listFile | Where-Object { $_ })
    }
    $packages = @($packages | Sort-Object -Unique)
    Write-IfChanged $listFile (($packages -join "`r`n") + "`r`n")
}


# --- git: name, e-mail and GitHub login helper ---
Copy-Files $userHome "$setup\git" @('.gitconfig')


# --- The startup screen's pictures (18 Nov 2026) ---
Copy-Folder "$userHome\Pictures\VS Code startup" "$setup\VS Code\startup-pictures"


# --- Keyboard: the Logitech MX Keys helper, F1/F2 screen brightness and F6/F7 backlight (18 Nov 2026) ---
# Its logon launcher (Startup folder) is not saved: install.ps1 writes it with that computer's Python.
Copy-Files "$userHome\Tools\mxkeys" "$setup\Keyboard" @('hidpp.py', 'mxkeys_backlight.py', 'screens.py')


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
# Python: "python" can be only the Microsoft Store stub (WindowsApps), as on
# the UiO computer. Then the real one comes from py, as install.ps1 finds it (18 Nov 2026)
$python = $null
$found = Get-Command python -ErrorAction SilentlyContinue
if ($found -and $found.Source -notlike '*WindowsApps*') { $python = $found.Source }
if (-not $python -and (Get-Command py -ErrorAction SilentlyContinue)) {
    $python = & py -3 -c "import sys; print(sys.executable)" 2>$null
}

$info = Join-Path $setup 'saved-from.txt'

# Every computer that saves here, with its own paths (computers.txt, 18 Nov 2026).
# INSTALL changes the paths of each of them to the new computer's paths, because
# the files in this folder can come from different computers.
$computersFile = Join-Path $setup 'computers.txt'
$computers = [ordered]@{}
if (Test-Path -LiteralPath $computersFile) {
    foreach ($line in Get-Content -LiteralPath $computersFile) {
        if ($line -and $line -notlike '#*') {
            $computers[($line -split '\s*\|\s*')[0]] = $line
        }
    }
}
if ($computers.Count -eq 0 -and (Test-Path -LiteralPath $info)) {
    # The first time: the computer that saved last before computers.txt existed
    $saved = @{}
    foreach ($line in [IO.File]::ReadAllLines($info)) {
        $name, $value = $line -split ':\s+', 2
        $saved[$name] = $value
    }
    if ($saved['Computer'] -and $saved['Computer'] -ne $env:COMPUTERNAME) {
        $computers[$saved['Computer']] = @($saved['Computer'], $saved['Home folder'], $saved['R folder'], $saved['Python']) -join ' | '
    }
}
$computers[$env:COMPUTERNAME] = @($env:COMPUTERNAME, $userHome, $rFolder.FullName, $python) -join ' | '
$computerLines = @(
    '# Every computer that saved into this folder: name | user folder | R | Python.',
    '# Written by save.ps1, read by install.ps1 and publish.ps1 (18 Nov 2026).'
)
$computerLines += @($computers.Values)
Write-IfChanged $computersFile (($computerLines -join "`r`n") + "`r`n")

if ($changed -gt 0 -or -not (Test-Path -LiteralPath $info)) {
    $text = @(
        "Last change saved: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "Computer:          $env:COMPUTERNAME",
        "Home folder:       $userHome",
        "Setup folder:      $setup",
        "R folder:          $($rFolder.FullName)",
        "Python:            $python"
    ) -join "`r`n"
    [IO.File]::WriteAllText($info, $text + "`r`n", (New-Object Text.UTF8Encoding $false))
}

if (-not $Quiet) {
    Write-Host "Saved into $setup"
    Write-Host "$changed file(s) or folder(s) had changed since the last save."
}
