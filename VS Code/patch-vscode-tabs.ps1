# The yellow tab box on the side panel tabs (Claude Code, Chat) in VS Code 1.147 and later (20 Nov 2026)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File patch-vscode-tabs.ps1
#
# Why: VS Code 1.147 made "connected" tabs the default (setting
# workbench.experimental.modernUIEditorTabStyle). Those tabs take the colour of the
# panel under them and ignore modernTab.activeBackground, so the soft yellow box
# (#FFD16640 in settings.json) was gone from the Claude Code tab. He wanted it back
# there, and the terminal and editor tabs to stay as clean as they are now.
# VS Code has no colour for "side panel tabs only", so this adds one CSS rule at the end
# of VS Code's own stylesheet. The colour still comes from settings.json.
#
# - Patches every installed VS Code version folder that does not have it yet. An older
#   block of ours is replaced, not added twice.
# - A VS Code update brings a fresh stylesheet without it. check-update.ps1 runs this
#   script again, so the tab is yellow after the next Reload Window.
# - VS Code then says once that the installation "appears to be corrupt": click
#   "Don't Show Again". It only means its own file was changed.
# - Takes effect in a window after Ctrl+Shift+P > Reload Window.
# - Undo: delete our block at the end of workbench.desktop.main.css (from the
#   "patch-side-tabs" comment on), or let VS Code update.
# Note section 3, "Active tab box".

$marker = '/*patch-side-tabs-1*/'
$anyVersion = '/*patch-side-tabs'
$block = @'

/*patch-side-tabs-1*/
.modern-ui.modern-ui-connected-editor-tabs.monaco-workbench :is(.part.sidebar,.part.auxiliarybar)>:is(.title,.header-or-footer)>.composite-bar-container>.composite-bar>.monaco-action-bar .action-item.checked{--modern-ui-tab-active-background:var(--vscode-modernTab-activeBackground)!important}
.modern-ui.modern-ui-connected-editor-tabs.monaco-workbench :is(.part.sidebar,.part.auxiliarybar)>:is(.title,.header-or-footer)>.composite-bar-container>.composite-bar>.monaco-action-bar .action-item.checked>.active-item-indicator{background-color:var(--vscode-modernTab-activeBackground)!important}
'@

$vscode = "$env:LOCALAPPDATA\Programs\Microsoft VS Code"
$noBom = New-Object System.Text.UTF8Encoding $false
$files = @(Get-ChildItem -Path $vscode -Directory | ForEach-Object {
    Join-Path $_.FullName 'resources\app\out\vs\workbench\workbench.desktop.main.css'
} | Where-Object { Test-Path -LiteralPath $_ })

if ($files.Count -eq 0) {
    Write-Output "WRONG  no VS Code stylesheet found in $vscode"
    exit 1
}

foreach ($file in $files) {
    $css = [IO.File]::ReadAllText($file, $noBom)
    $folder = $file.Substring($vscode.Length + 1).Split('\')[0]     # the version folder, e.g. 8a14f0cc1b
    if ($css.Contains($marker)) {
        Write-Output "side panel tab box: already in place ($folder)"
        continue
    }
    $at = $css.IndexOf($anyVersion)
    if ($at -ge 0) {
        $css = $css.Substring(0, $at).TrimEnd()
    }
    if (-not $css.Contains('modern-ui-connected-editor-tabs')) {
        Write-Output "NOTE   side panel tab box: this VS Code ($folder) has no connected tabs, nothing to do"
        continue
    }
    [IO.File]::WriteAllText($file, $css + $block, $noBom)
    Write-Output "side panel tab box: patched ($folder). Reload Window to see it"
}
