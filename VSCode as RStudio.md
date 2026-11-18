# VS Code set up to behave like RStudio (R)

The user's setup, as it works on 4 Nov 2026. Keep this file updated whenever
the setup changes. Everything needed to rebuild it is in this Dropbox folder
(`<name>\VS Code setup`, called `R setup` until 4 Nov 2026), so it
travels to every PC. `README.md` says how: `INSTALL.cmd` puts it on a new
computer, `SAVE.cmd` copies this computer's setup into the folder.

| File | What it is |
|---|---|
| `VSCode as RStudio.md` | this note |
| `R\watch.R` | viewer tabs refresh by themselves when the object they show changes: tables and values (a number, a text, a vector, a list) alike, since 2 Nov 2026 |
| `R\watch-test.R` | 30 offline checks for `watch.R`; run after every change to it or R extension update (section 6) |
| `R\Rprofile.R` | loads `watch.R` and `terminal-log.R` in every VS Code R terminal (section 2) |
| `R\terminal-log.R` | copies everything the R terminal shows (output, warnings, errors, commands) to `%TEMP%\r-terminal.log` for Claude (section 2) |
| `R\.lintr` | no warnings about trailing spaces / indentation / commented code / "use |> instead of %>%" (copy of `C:\Users\<you>\.lintr`) |
| `R\packages.txt` | the R packages on the computer (written by SAVE, installed by INSTALL) |
| `VS Code\settings.json`, `keybindings.json` | copies of `%APPDATA%\Code\User\` (sections 3 and 4) |
| `VS Code\extensions.txt` | every VS Code add-on on the computer, written by SAVE from `%USERPROFILE%\.vscode\extensions\extensions.json`. Marketplace add-ons first (id, version; `pinned` = installed at that exact version), which INSTALL installs. Then, since 10 Nov 2026, the own add-ons as `#` lines (id, version, where it comes from), so INSTALL skips them there: `local.r-pipe-indent` (INSTALL copies it), `local.claude-chat-opener` (INSTALL runs its `build.ps1`), `local.startup-screen` (personal: run its `build.ps1` by hand, section 5b), `local.word-page` (INSTALL runs its `build.ps1`, section 5c). Check against VS Code itself: `code --list-extensions --show-versions` |
| `VS Code\patch-r-extension.pl` | six fixes to the R extension: data viewer columns sized to content, the column-name popup after `, ` (and after `= `, `== `, `%in% `, since 18 Nov 2026) instead of right after the comma, a knitted PDF opening in the editor to the right, a new plot bringing the R Plot tab to the front, Ctrl+wheel zoom on plots like a PDF, and Ctrl+click on a table or value opening it in the data viewer (18 Nov 2026, with the Enter add-on) (run again after every R extension update, section 6) |
| `VS Code\patch-pdf-viewer.pl` | two fixes to the PDF viewer add-on `tomoki1207.pdf` (10 Nov 2026; zoom version 3 on 11 Nov 2026): Ctrl+wheel and touchpad pinch zoom smoothly in on the spot under the mouse (a pinch follows the fingers, the wheel glides); and a clean reload after each knit (run again after every update of that add-on, section 6b) |
| `VS Code\local.r-pipe-indent-0.1.0\` | the Enter-indents-like-RStudio extension (v0.5.5); Ctrl+Enter runs whole statements and refuses unfinished ones; Ctrl+Shift+M types `%>%`; a stop button for R (18 Nov 2026); Ctrl+click on a table or value opens it in the data viewer, a plot in the R Plot tab (18 Nov 2026, with fix 6 of `patch-r-extension.pl`, section 6); shows Claude Code's edits in VS Code's own chat edit view (Keep / Undo; Keep selects the kept lines), section 5 |
| `VS Code\local.startup-screen-0.1.0\` | the startup screen (6 Nov 2026): a short loading screen with a picture, a tip and the loading steps when VS Code starts; personal, left out of the GitHub copy; section 5b |
| `VS Code\local.word-page-0.1.0\` | Word Page (11 Nov 2026): write like in Word or Google Docs inside VS Code. Quarto's visual editor as a white page with black text under any colour theme, "Word Page: New Document", citations from a `.bib` file and from Zotero; the file underneath is markdown (`.qmd`). Since 11 Nov 2026 the page looks like the PDF of a paper (LaTeX font, A4 margins, PDF heading sizes; setting `wordPage.look`). Its `bench\` is a test VS Code for Claude on its own, invisible Windows desktop; section 5c |
| `Claude Code\` | copies of `C:\Users\<you>\.claude\`: `CLAUDE.md` (rules for every Claude window), `settings.json` (hooks), `review\review.py`, `awake\awake.py` (computer stays awake while Claude works, section 9), `commands\` (/chats, /handoff, /takeon), `tools\chat-opener\` (the /chats add-on, which also makes code blocks in the Claude chat wrap, section 9), `memory\` (one folder per project) |
| `git\.gitconfig` | name, e-mail, GitHub login through `gh` |

Since 30 Oct 2026 nothing is per project any more: a new R folder works
without copying anything into it. `%APPDATA%` = `C:\Users\<you>\AppData\Roaming`.

---

## 1. New PC checklist

See `README.md`: install the programs, double-click `INSTALL.cmd`, then do
the five clicks it prints. INSTALL does sections 2 to 6 below by itself.

**Choosing parts, and a guided install for someone else** (16 Nov 2026).
`scripts\install.ps1` has eight parts: `addons`, `enter`, `settings`, `r`,
`wordpage`, `git`, `claude`, `memory`. INSTALL.cmd installs all of them, as
before. `-Plan` shows each part (what it does, what it downloads, which
programs it needs and whether they are there, which files it replaces) and
changes nothing. `-Parts a,b` installs only those. It asks only for the
programs those parts need. `-SkipAddons` leaves Marketplace add-ons out.
`-GitName`/`-GitEmail` fill in git's name and e-mail; with the GitHub copy's
"Your Name" still in `.gitconfig`, the git part is skipped. The installer
also swaps the setup folder's own path, so a GitHub copy works from any
folder, and the `<you>` placeholder becomes the user folder. The GitHub copy
gets a `CLAUDE.md` at the top (source: `scripts\github-CLAUDE.md`, copied
there by publish.ps1). When someone opens the copy in VS Code and asks Claude
Code to install it, Claude follows that guide:
- welcome
- `-Plan`
- a table of the parts, ticked with the question tool
- warnings: `settings` replaces their own settings, `CLAUDE.md` holds the
  owner's rules, `r` and `wordpage` need the add-ons
- every download listed with its size, and a clear yes
- missing programs installed one at a time with winget
- `-Parts ...`
- the steps left to do by hand, and how to undo from the backup folder

Tested 16 Nov with `-TestRoot`, from this folder and from the GitHub copy.

**Paste the link and say "install"** (18 Nov 2026). On a new PC: install VS
Code and the Claude Code add-on, sign in to Claude, paste the link of the
GitHub copy into the Claude chat and say "install". Three things make that
work:
- The guide now starts with "Before step 1". Claude first looks for this
  Dropbox folder (`C:\Users\<you>\*Dropbox*\*\VS Code setup\scripts\publish.ps1`,
  a file only the real folder has). Found: it is your own PC, and Claude
  installs from this folder: every part, with the memory notes and your git
  name, and the startup screen after a yes. Not found: Claude installs the
  anonymous copy.
- The copy goes into a folder that stays (`C:\Users\<you>\vscode-setup`),
  never a temp or Downloads folder: R keeps using `R\Rprofile.R` and
  `R\watch.R` from it.
- install.ps1 reads the PATH again from Windows when it starts. A program
  that winget installed a moment ago is found without a restart of VS Code.

Tested 18 Nov: `-TestRoot` from this folder (9 memory folders, the real git
name) and from the GitHub copy, `-Plan` under a bare PATH (every program
found), and Word Page's `build.ps1 -NoInstall` from the copy (169 checks
pass). All 314 R packages in `R\packages.txt` are on CRAN.

publish.ps1 also swaps this machine's own name, which is a plain word since
17 Nov 2026 (`$computerSwaps` there says which). Before that fix its check
stopped every publish after 16 Nov.

**Two computers (18 Nov 2026, asked: "make save safe for two computers").** The
old computer and the UiO computer (<work-computer>, user <you>) both save into this
folder. Before, SAVE copied every file over the folder's copy, so the last
computer to save won, and it removed files that only the other computer had.
Now:
- SAVE copies a file only when it is newer on this computer than in the folder
  (robocopy `/XO`). The newest change wins, per file. If both computers change
  the same file between two saves, the older change is lost. So bring a
  computer up to date before you change something on it: SAVE.cmd, then
  INSTALL.cmd.
- SAVE deletes nothing in the folder (`/E` instead of `/MIR`). A slash
  command, memory note or picture removed on one computer stays here. Delete
  it here by hand too.
- `R\packages.txt` and `VS Code\extensions.txt` are added to, not replaced.
  An add-on line is replaced only by the same or a newer version. To drop a
  package or add-on for good, take its line out by hand. Needed because the
  UiO computer has about 870 packages in R's own library and only 19 in the
  user library that SAVE reads: the list would have shrunk from 314 to 19.
- `computers.txt` (new, written by SAVE) has one line per computer: name, user
  folder, R folder, Python. INSTALL changes the paths of every computer in it
  to the new computer's paths, so a folder with files from both computers
  installs cleanly. publish.ps1 swaps every user name in it for `<you>` and
  leaves the file out of the GitHub copy.
- SAVE records the real Python. On the UiO computer `python` is only the
  Microsoft Store stub, so SAVE then asks `py`, as INSTALL does.
- publish.ps1 first fetches GitHub's latest, so either computer can publish.
  It also leaves out `__pycache__` folders.

Tested 18 Nov on a copy of this folder with file times kept: the 314
packages stayed, the add-on list merged, and a newer file from the other
computer was kept. INSTALL `-TestRoot` from a folder with files from both
computers left no old user folder or Python path. Then the real SAVE, and
`publish.ps1 -DryRun` (87 files, no personal words).

**The UiO computer (<work-computer>).** Its home drive is the network drive `M:`
(`HOMEDRIVE`), so git looked for `.gitconfig` there. Fixed with the user
variable `GIT_CONFIG_GLOBAL` = `C:\Users\<you>\.gitconfig` (publish.ps1
sets it too when it is missing). That variable only reaches programs started
after it was set: VS Code, open since the morning, still read `M:\` and a
commit from the Source Control panel failed with "Author identity unknown"
(18 Nov 2026, 14:39). Second fix the same day: `M:\.gitconfig` is a pointer
file with only `[include] path = C:/Users/<you>/.gitconfig`, so git finds
the name and e-mail in every program, also one that was already open, with
or without the variable. `install.ps1` (part git) now does both on a
computer whose home folder is not the user folder. Machine policy is RemoteSigned: a `.ps1`
on `M:` does not run, even with `-ExecutionPolicy Bypass`. Scripts in this
Dropbox folder on `C:` run fine. gh is not signed in there. GitHub sign-in
for git goes through Git Credential Manager instead (signed in once on
18 Nov 2026 with `& "C:\Program Files\Git\ucrt64\bin\git-credential-manager.exe"
github login`, kept in Windows Credential Manager), so publish.ps1 runs from
any terminal and from Claude's shell. Before that only VS Code's own terminal
could push (it lends git VS Code's GitHub sign-in), and Claude's push failed
with "could not read Username ... terminal prompts disabled". The catch was
`.gitconfig`: `gh auth setup-git` (done on the home computer) writes
`helper =` (empty, which switches off all other helpers) and then gh for
github.com, so git never asked Credential Manager. Since 18 Nov 2026
`.gitconfig` lists `helper = manager` after gh: on the home computer gh
answers first, on the UiO computer gh has no login and Credential Manager
answers. If a push fails again with that message, check
`git credential-manager github list` (it should show the GitHub user) and
`git config --show-origin --get-all credential.https://github.com.helper`.

## 2. Startup file: watch.R in every R terminal

R reads the file named in the Windows user variable `R_PROFILE_USER` at
start. The VS Code R extension passes it on (it runs it first, then attaches
its own session helper). INSTALL sets it to `R\Rprofile.R` in this folder.
By hand, once, in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("R_PROFILE_USER", "C:\Users\<you>\<Dropbox>\<name>\VS Code setup\R\Rprofile.R", "User")
```

`Rprofile.R` only acts inside a VS Code R terminal (in Rscript / batch runs
it does nothing) and sources `watch.R` from its own folder. It must be UTF-8
**without** byte-order mark: `Set-Content -Encoding utf8` adds one, and then
every `Rscript` run dies with "1:1: unexpected input". Done on this PC on
30 Oct 2026; moved to `VS Code setup\R` on 4 Nov 2026.

**Terminal log for Claude** (18 Nov 2026, his wish: "you need to be looking at
my R terminal when I'm running code"). Claude cannot read the R terminal, so
`Rprofile.R` also sources `R\terminal-log.R`, which copies everything the
terminal shows to `%TEMP%\r-terminal.log`:
- normal output, through `sink(..., split = TRUE)` (still shown on screen)
- errors, through `options(error = ...)`, as `!!!! hh:mm:ss Error in ...`
- warnings and messages, through `globalCallingHandlers()`, as `Warning:` / `Message:`
- after each command that worked: `---- hh:mm:ss ran: <the command>`
- each new R terminal: `==== <date time> fresh R terminal started`

The file is emptied when it passes 2 MB. Two connections to the same file (one
for the screen copy, one for the notes): a note written through the sink
connection would also show on screen. `globalCallingHandlers()` only works at
startup, not inside `tryCatch()` or a task callback ("should not be called with
handlers on the stack"). The R add-on sources the profile with a plain
`source()` (its `R\profile.R`, read in 3.2.2), so that works. Tested in an
interactive `Rterm --ess` with a test TEMP. On "check" Claude reads the end of
this log and also runs the exercise's lines in a fresh `Rscript`. Needs a fresh
R terminal (Ctrl+Alt+R) to take effect.

Then close and reopen VS Code. Every new R terminal prints
"Viewer tabs now follow changes (watch.R)." Check with `watched()`.

Until that is done, `source("C:/Users/<you>/<Dropbox>/<name>/VS Code setup/R/watch.R")`
once per R terminal does the same (the study units source their own copy,
`study/watch.R`, at the top of every unit).

Data files: save as **UTF-8**. A Latin-1 csv (ô, ç, æøå) crashes the data
viewer ("invalid multibyte string"). Convert once with
`iconv -f WINDOWS-1252 -t UTF-8 file.csv > out.csv`.

## 3. User settings (`%APPDATA%\Code\User\settings.json`)

```json
"r.consolePath":    "C:\\Program Files\\R\\R-4.5.1\\bin\\R.exe",
"r.executablePath": "C:\\Program Files\\R\\R-4.5.1\\bin\\R.exe",
"r.bracketedPaste": true,
"r.sessionWatcher": true,
"r.plot.backend": "httpgd",

"editor.autoClosingOvertype": "always",
"editor.autoClosingDelete": "always",
"editor.parameterHints.enabled": false,
"editor.fontLigatures": false,
"editor.bracketPairColorization.enabled": false,
"editor.inlayHints.enabled": "offUnlessPressed",
"editor.minimap.enabled": false,
"[r]": {
    "editor.inlineSuggest.enabled": false,
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "editor.detectIndentation": false
},
"terminal.integrated.enablePersistentSessions": false,
"files.autoSave": "afterDelay",
"files.autoSaveDelay": 100
```

| Setting | RStudio behaviour it restores |
|---|---|
| `autoClosingOvertype: always` | typing `)` in front of an existing `)` steps over it |
| `autoClosingDelete: always` | Backspace on `(` also removes its `)` |
| `parameterHints.enabled: false` | no big black popup when typing `select(` |
| `fontLigatures: false` | plain characters (no merged `<-` glyphs) |
| `minimap.enabled: false` | no small copy of the script down the right edge (turned off 4 Nov 2026, in every file type) |
| `[r] inlineSuggest: false` | no grey AI "ghost text" while typing R (other languages keep it) |
| `[r] tabSize: 2`, `insertSpaces: true`, `detectIndentation: false` | 2 spaces per indent level in every R file, as RStudio's defaults (Tools → Global Options → Code: tab width 2, insert spaces, auto-detect off, checked in RStudio's preference list on 18 Nov 2026). Before that VS Code used its own 4. Tab, Enter after `%>%` and the Enter add-on (section 5) all take their width from here. Files written before 18 Nov 2026 are still in 4 spaces: new lines in them now come out at 2, so convert such a file before working in it (Claude asks first, see the R code style in `CLAUDE.md`). The full list of RStudio layouts (pipe, ggplot, long call, braces, function definition) is in that same `CLAUDE.md` section |
| `acceptSuggestionOnEnter` left at `on` | Enter on a completion popup accepts it and stays on the line, as in RStudio. `smart` was tried on 1 Nov 2026 and reverted on 2 Nov: with `smart`, a popup that only repeats the word already typed makes Enter insert a new line, which felt like the editor jumping away |
| `enablePersistentSessions: false` | restart gives a fresh R terminal that attaches to the Workspace panel (a restored old terminal never does) |

**Everything comes back after a restart** (13 Nov 2026, his wish: "all the
conversations and windows that I had open are open still"). Read in VS Code's
own code (1.146) and the Claude Code add-on's (2.1.323):

| What | Comes back? | Why |
|---|---|---|
| Every VS Code window | yes, at a plain start | `"window.restoreWindows": "all"` (VS Code's default). A plain start (Start menu, taskbar icon, after a reboot) reopens every window of the last session. Opening one folder (taskbar list, Open Folder, a `vscode://` link) opens only that folder. Was `preserve` from 13 Nov 2026, which reopened all windows also when he opened one folder; he did not want that (16 Nov 2026), so back to `all` |
| Editor tabs in each window | yes | VS Code default |
| Claude Code chats opened **as tabs** (Ctrl+Numpad7) | yes, with the conversation | the add-on restores its tabs (`registerWebviewPanelSerializer("claudeVSCodePanel")`); `claudeCode.continueAfterReload` (default on) even finishes a step that was cut off |
| The Claude Code chat **in the side bar** | no, it opens empty | the add-on starts the side bar without a session. The old chat is in its list of past conversations (or `/chats`). A chat you want back after a restart: open it as a tab |
| Data viewer and R Plot tabs, also in a floating window | yes, as a stand-in tab with a short note, in the same place (since 18 Nov 2026) | fix 8 of `patch-r-extension.pl` (section 6). Before, the R extension could not bring them back, and a floating window with only those tabs came back empty or not at all. The next Ctrl+click on that name, or the next plot, replaces the stand-in in that place (fix 7) |
| The R terminal | a fresh one starts by itself (since 18 Nov 2026) | the Enter add-on (v0.5.6) runs `r.createRTerm` at every start of the add-ons in a window with an `.R`, `.Rmd` or `.qmd` file open, and first closes an old "R Interactive" terminal (a leftover that can no longer reach the Workspace panel). The R objects are gone, as after an RStudio restart: run the script again. Log line `fresh R: started` |
| The Tutor tab (built-in browser, Ctrl+Numpad3) | yes, same web address | the browser tab is saved like any editor tab (its URL) |
| The Tutor's login and progress | yes | `"workbench.browser.dataStorage": "global"`: one store for the built-in browser, kept across restarts and folders (the default `default` means the same on this computer, but VS Code turns it into a throw-away store in a folder it does not trust; set explicitly so it stays). Progress is also saved to his claude.ai account by the page itself |

**Restart Extension Host instead of Reload Window** (18 Nov 2026, his wish:
"I don't want to lose my external windows on a reload"). After a change to an
add-on or a patch, Ctrl+Shift+P → **Developer: Restart Extension Host** loads
the new code and leaves every window as it is, floating ones too: only the
add-ons restart. Claude Code chats in tabs come back by themselves, the R
terminal restarts fresh (row above). Reload Window is only needed for a
change VS Code itself reads at window start (`settings.json` mostly applies
at once, `argv.json` needs a full restart).

Closing tip: close VS Code with **File → Exit**. A window closed on its own
with its X before the last one is not part of the session that gets restored.

Colours: all of them are in this settings.json, so SAVE and INSTALL carry
them to every computer. The theme itself is the add-on `gerane.theme-idlefingers`
(in `extensions.txt`). Every rule sits under `[idleFingers]`, so it only works
with that theme.

R code (`editor.tokenColorCustomizations` → `[idleFingers]` → `textMateRules`):

| What | Colour |
|---|---|
| all other code text | white `#FFFFFF` |
| function names (`mutate`, `function`) | light blue `#A7C7E7` |
| round and square brackets `( )` `[ ]` | orchid `#DA70D6` |
| curly braces `{ }` | lavender `#C3B1E1` |
| numbers | pale yellow `#F6E3A1` |

Window (`workbench.colorCustomizations` → `[idleFingers]`): status bar dark
grey `#323232` with white text (also while debugging and with no folder open),
the remote button bottom left `#3B3B3B`, and the yellow tab box below.

Theme: italics off for all code (easier to read). Under
`editor.tokenColorCustomizations` → `[<theme name>]` → `textMateRules`, a rule
with `"scope": ["comment","variable","entity","support","storage","keyword","string","meta"]`
and `"settings": {"fontStyle": ""}`.

Active tab box (5 Nov 2026): `workbench.colorCustomizations` → `[idleFingers]` →
`"modernTab.activeBackground": "#FFD16640"`.
This is the soft yellow box behind every selected tab: side window names
("CLAUDE CODE", "CHAT"), editor tabs, the bottom panel (Terminal, Output), the
selected icon in the left bar, the Settings tabs. `#FFD166` is a clean golden
yellow; the last two digits are its strength: `40` = 25% (30% `4D` popped out
too much), so the grey shows through. The lower the strength, the darker the
box and the easier the text on it is to read (at 30%: white 6.9:1, git's
"modified" file-name colour 4.0:1).
History (5 Nov 2026): `#D7BA7D` (inline code text colour in the Claude Code
chat) at full strength with dark text was too bright and hid white icons; at
35% (`#D7BA7D59`) it was readable but a bit muddy khaki. Grey editor tabs
(`modernEditorTab.activeBackground` `#37373D`) were tried and dropped: he
wants the yellow on all tabs. Do not confuse it with `sideBar.background`, which
colours the whole side window, chat included (tried and undone the same day).

Line between split editors (10 Nov 2026): same block,
`"editorGroup.border": "#FFD16640"`: the thin line between the left and right
editor windows, so he can find it quickly. Exactly the tab-box value, strength
included, so the grey shows through the same way and the line has the same soft
gold as the tabs and the "CLAUDE CODE" box. Full strength (`#FFD166`) was tried
first the same day: too bright, "not the same shade as my tabs". He confirmed
`#FFD16640` ("good like this", 10 Nov 2026): keep it. It is only the
line between editor groups, not the edge of the side windows or the bottom panel.

## 4. Keybindings (`%APPDATA%\Code\User\keybindings.json`)

```json
[
    { "key": "ctrl+alt+r",   "command": "r.createRTerm" },
    { "key": "ctrl+m",       "command": "-editor.action.toggleTabFocusMode" },
    { "key": "ctrl+shift+m", "command": "rPipeIndent.insertPipe",
      "when": "editorTextFocus && editorLangId == r && !editorReadonly" },
    { "key": "ctrl+enter",   "command": "rPipeIndent.runStatement",
      "when": "editorTextFocus && editorLangId == r && !editorReadonly" },
    { "key": "ctrl+numpad4", "command": "claude-vscode.primaryEditor.open" },
    { "key": "ctrl+numpad4", "command": "chatOpener.newChatHere",
      "when": "chatOpener.ready" },
    { "key": "ctrl+numpad5", "command": "claude-vscode.sidebar.open" },
    { "key": "ctrl+numpad5", "command": "wordPage.editorSelectionToClaude",
      "when": "editorTextFocus && editorHasSelection" },
    { "key": "ctrl+numpad5", "command": "wordPage.selectionToClaude",
      "when": "activeCustomEditorId == 'quarto.visualEditor' && !sideBarFocus && !auxiliaryBarFocus && !panelFocus" },
    { "key": "ctrl+numpad5", "command": "wordPage.browserToClaude",
      "when": "activeEditor == 'workbench.editor.browser' && !sideBarFocus && !auxiliaryBarFocus && !panelFocus" },
    { "key": "ctrl+numpad5", "command": "wordPage.chatSelectionToClaude",
      "when": "activeWebviewPanelId == 'claudeVSCodePanel' && !sideBarFocus && !auxiliaryBarFocus && !panelFocus" },
    { "key": "ctrl+numpad5", "command": "wordPage.chatSelectionToClaude",
      "when": "focusedView == 'claudeVSCodeSidebar' || focusedView == 'claudeVSCodeSidebarSecondary'" },
    // Ctrl+Numpad1: the same six, each with "args": { "target": "tab" }, the
    // first one being "wordPage.toClaudeTab" (18 Nov 2026)
    { "key": "ctrl+numpad1", "command": "wordPage.toClaudeTab" },
    { "key": "ctrl+numpad1", "command": "wordPage.editorSelectionToClaude",
      "args": { "target": "tab" }, "when": "editorTextFocus && editorHasSelection" },
    // ... selectionToClaude, browserToClaude, chatSelectionToClaude (twice) as above
    { "key": "ctrl+numpad9", "command": "quarto.editInSourceMode",
      "when": "activeCustomEditorId == 'quarto.visualEditor'" },
    { "key": "ctrl+numpad9", "command": "quarto.editInVisualMode",
      "when": "editorTextFocus && editorLangId == quarto" },
    { "key": "ctrl+numpad7", "command": "runCommands",
      "args": { "commands": [
        "workbench.action.focusSecondEditorGroup",
        "claude-vscode.primaryEditor.open" ] } },
    { "key": "ctrl+numpad8", "command": "workbench.action.chat.open" },
    { "key": "ctrl+numpad3", "command": "workbench.action.browser.open",
      "args": { "url": "https://claude.ai/artifact/<id of the Tutor>",
                "reuseUrlFilter": "<the same url>", "openToSide": true } }
]
```

| Key | Does |
|---|---|
| Ctrl+Alt+R | new R terminal |
| Ctrl+Shift+M | types ` %>%` (RStudio's pipe shortcut); right after a space just `%>%`, so no double spaces |
| Ctrl+M | disabled (it toggled "Tab moves focus" by accident) |
| Ctrl+Enter | run the statement at the cursor, or the selection widened to whole statements; refuses an unfinished statement with a yellow warning (section 5) |
| (stop button) | the square at the top right of an R file and in the terminal panel: Ctrl+C to R, stops a running command (section 5, 18 Nov 2026) |
| Ctrl+Numpad4 | new **Claude Code** chat as a tab in the editor window that has the keyboard (his wish, 18 Nov 2026). Runs `chatOpener.newChatHere` of the chat opener add-on (section 9), which calls `claude-vscode.editor.open` with column `Active` and `fullEditor = true`. Until 18 Nov 2026 the key ran Claude's own `claude-vscode.primaryEditor.open`, but that one prefers **any** editor window holding only Claude tabs (its function `Rse`, read in 2.1.327: first this window if it has only Claude tabs, then any window with only Claude tabs, then this window), so once a column or a floating window full of chats existed, every new chat landed there. The old entry stays first in keybindings.json, the new one has `"when": "chatOpener.ready"` (set by the add-on when it starts), so the key never goes dead while a window still runs the old add-on. NumLock must be on |
| Ctrl+Numpad9 | a `.qmd`: Word Page ↔ plain text, both ways (section 5c; 16 Nov 2026, on Ctrl+Numpad1 until 18 Nov 2026, when that key went to the Claude chat tab). In the text you see Claude's edits red/green with Keep / Undo |
| Ctrl+Numpad1 | like Ctrl+Numpad5, but into a **Claude chat in an editor tab**, never the side panel (18 Nov 2026, his wish). Everything Ctrl+Numpad5 takes along comes along: highlighted lines in a file (`@file#12-20 `), a highlight on the Word Page, in the macro Tutor, in the side panel or in a chat tab (as a quote). Nothing highlighted: the keyboard only goes to that chat box. Which tab, in this order: (1) a chat tab in front in **another** editor window than the one with the keyboard, (2) a chat tab in front in this editor window (the keyboard is in it), (3) a chat tab behind another tab in another editor window, brought to the front, (4) one behind the file in this window, brought to the front, (5) none: a new chat tab in another editor window (or a new window beside), with the reference already in its box. Several in one step: the one used last. Section 5c, "Highlighted text to a Claude chat tab". The macro Tutor itself only copies its text on Ctrl+Numpad5 (its page code, H26 Macro project): there Ctrl+Numpad1 only goes to the tab. NumLock must be on |
| Ctrl+Numpad5 | jump to the **Claude Code** chat box in the side panel (opens it if closed), **only ever the side panel** (since 18 Nov 2026). With lines highlighted in a file, it also types a reference to them into the message, e.g. `@code/04_maps.R#12-20 ` (file from the project folder, first-last line), so Claude reads exactly those lines. Without a highlight it only jumps. Two entries for the same key: the plain one first, then one with `"when": "editorTextFocus && editorHasSelection"` that runs `wordPage.editorSelectionToClaude`. The later entry wins when its `when` is true. Until 18 Nov 2026 that entry ran the Claude add-on's own `claude-vscode.insertAtMention`, but that one types the reference into **every** Claude chat that is visible at that moment (its function `G6`, read in version 2.1.327), so a Claude tab next to the code, or next to the `.qmd`, got it too (he noticed it in the `.qmd`). The Word Page command writes the reference itself (the same text, `@file#lines `) over the clipboard into the side panel only, puts the clipboard back, and undoes the paste should it ever land in the file. A highlight in a Claude chat **tab**: an entry with `"when": "activeWebviewPanelId == 'claudeVSCodePanel' ..."` quotes it into the side panel (18 Nov 2026). A highlight on a Word Page is not an editor selection, so there a third entry (`"when": "activeCustomEditorId == 'quarto.visualEditor' ..."`, keyboard on the page) runs the Word Page add-on's own command, which does the same job in another way: section 5c, "Highlighted text to Claude". A highlight in the macro Tutor (VS Code's built-in browser, Ctrl+Numpad3) is not an editor selection either: a fourth entry (`"when": "activeEditor == 'workbench.editor.browser' ..."`) runs `wordPage.browserToClaude`, which pastes the highlighted piece, where it sits and its card into the chat box, ending "My question: " (section 5c, "Highlighted text in the built-in browser", 14 Nov 2026). A highlight inside the Claude side panel itself (a piece of an answer): a fifth entry (`"when": "focusedView == 'claudeVSCodeSidebar' || ..."`) runs `wordPage.chatSelectionToClaude`, which puts the piece back into the chat box as a quote (`> ...`) for a follow-up question (section 5c, "Highlighted text in the Claude panel", 14 Nov 2026). NumLock must be on (added 11 Nov 2026) |
| Ctrl+Numpad7 | new **Claude Code** chat as a tab in its own column on the right (runs on the Claude subscription): it first focuses the second editor group (VS Code makes one on the right if there is only one), then runs `claude-vscode.primaryEditor.open`, which opens in that active group (or in a column that already holds only Claude tabs) and, unlike `claude-vscode.editor.open`, does not switch `claudeCode.preferredLocation` from sidebar to panel. Changed 4 Nov 2026: it first opened VS Code's own Claude harness ("Claude copilot"), but that chat cannot send anything here: Copilot Free (`copilot token sku: free_limited_copilot`) offers it no Claude models, and Anthropic does not allow claude.ai subscription logins in Agent SDK products (Agent SDK overview page), so it would need an Anthropic API key or a paid Copilot plan. Old notes on that harness, kept for later: it first focuses the second editor group (VS Code makes one on the right if there is only one), then opens the chat there; if that column already shows a Claude chat, the new one replaces it in place (the old one stays in the sessions list). Layout: Claude Code in the left side bar, code + Claude chat in the middle, Copilot chat ("Chat"; VS Code cannot rename a view) in the right side bar. VS Code has only one chat view, which is why the Claude chat is an editor tab and not a second side bar. Session type `agent-host-claude` (VS Code's Agent Host; the same command as picking "Claude" in the chat's session-type menu). Needed `"chat.agentHost.claudeAgent.enabled": true` in settings.json; **removed again 5 Nov 2026**: with it on, the Copilot chat panel opened this Claude chat type (which cannot send) and the old Copilot chats dropped out of the sessions list. Do not turn it back on (the old name `github.copilot.chat.claudeAgent.enabled` no longer exists in VS Code 1.144). Who pays depends on the model picked in that chat: models from your own Anthropic login (VS Code tags them `anthropic`, "native") bill your Claude account; the others go through Copilot. While signed in to GitHub, Copilot is the default. Native models only appear after VS Code has downloaded the Claude Agent SDK (agenthost.log said "SDK not downloaded yet" on 4 Nov). Added 4 Nov 2026 |
| Ctrl+Numpad8 | jump to the Copilot chat box in the side window (opens it if closed); NumLock must be on (added 4 Nov 2026) |
| Ctrl+Numpad3 | open the macro Tutor (the study page for the macro exam, online on claude.ai) as a tab inside VS Code, in a column to the side, so it sits next to the Claude chat. Progress is saved to his account; Claude grading and "Ask Claude about this" work. It runs VS Code's own built-in browser (`workbench.action.browser.open`, in VS Code since 1.109; no add-on). `reuseUrlFilter` makes a second press jump to the tab that is already open instead of opening another one; `openToSide` puts it in the side column and locks that column (VS Code's own behaviour: files you open go to the other column). After Claude republishes the page: Ctrl+R in that tab. He asked for this on 13 Nov 2026 ("get it to my editor window") because switching between VS Code and claude.ai was a hassle; the default key Ctrl+Alt+/ did not open anything for him. The command id and its arguments were read from VS Code's own code (1.146), they are not in the documentation. Works, also the claude.ai login inside it (he confirmed 13 Nov 2026). NumLock must be on. A second key, Ctrl+Numpad9, opened the local copy `Study tool/ECON4310 Tutor.html` (no Claude, progress only in that browser); removed the same day at his request, Numpad3 is better (added 13 Nov 2026) |

## 5. Enter indents like RStudio (local extension)

INSTALL copies `VS Code\local.r-pipe-indent-0.1.0\` (files `package.json`,
`extension.js`, `test.js`) to `C:\Users\<you>\.vscode\extensions\` and adds
this entry to `C:\Users\<you>\.vscode\extensions\extensions.json`:

```json
{"identifier":{"id":"local.r-pipe-indent"},"version":"0.5.0",
 "location":{"$mid":1,"path":"/c:/Users/<you>/.vscode/extensions/local.r-pipe-indent-0.1.0","scheme":"file"},
 "relativeLocation":"local.r-pipe-indent-0.1.0"}
```

Restart VS Code. Behaviour:

```
x <- d %>%⏎                → one level in (a level = 2 spaces, `editor.tabSize` of R files, section 3, since 18 Nov 2026)
  # keep only USA⏎         → comment line inside the statement: VS Code's Enter (same level)
  filter(a) %>%⏎           → same level (the comment above no longer confuses it, since 1 Nov 2026)
  select(b)⏎               → back to the statement's indent
p <- ggplot(d) +⏎          → one level in (any operator at the end of a line, since 1 Nov 2026)
cor(a, b,⏎                 → under a (first argument)
mutate(a = 1, |) %>%⏎      → under a; the ") %>%" after the cursor moves down (since 2 Nov 2026)
pivot_longer(a, |b = 1)⏎   → "b = 1)" moves to a new line under a: splitting an argument list re-indents the moved part (since 2 Nov 2026)
pivot_wider(⏎              → one level in
f <- function(x) {⏎        → VS Code's own Enter: `{⏎}` puts the } on its own line
```

Ctrl+Enter (since 1 Nov 2026, v0.3.0) goes through the extension with or without
a selection:

- A selection is first widened to whole statements, then sent, then the cursor
  moves to the next line. Without this, the R extension sends a selection
  exactly as selected, and a selection that starts on the 2nd line of a pipe
  sends the pipe without its first line ("object x not found" for a column
  name). Comment lines inside the statement are included.
- Without a selection the R extension's own whole-statement detection runs,
  unchanged.
- In both cases an unfinished statement is NOT sent: an unclosed `(` `[` `{`,
  an unclosed quote, or a last line that ends in `%>%` or `+`. A yellow
  warning names the line ("The bracket ( on line 141 is never closed."), with
  a "Send anyway" button. Without this guard R waits at a `+` prompt and every
  later Ctrl+Enter disappears into it, with nothing on screen. If the terminal
  already shows `+`: click in it, Esc.

**Stop button (18 Nov 2026, v0.5.2, asked: "a button for the R terminal that
stops the terminal from running, like a stop button").** A square stop icon
(`$(debug-stop)`) in the toolbar of the terminal panel only, with the tooltip
"Stop R" (since 18 Nov 2026, asked: no "send Ctrl+C" text in the tooltip, and
no button at the top of the code tabs). A click sends Ctrl+C to the R terminal (the
one called "R Interactive", else the open terminal), as pressing Ctrl+C in it
would: R stops the running command and shows `>` again. Command
`rPipeIndent.stopR`. Log: `stop sent Ctrl+C to R Interactive`. It does not
close the terminal or empty the Workspace.

**The Claude logo at the top right of a code tab** is not ours: the Claude
Code add-on puts it there (command `claude-vscode.editor.openLast`, "Claude
Code: Open"). Read in version 2.1.327: because `claudeCode.preferredLocation`
is `sidebar`, a click opens or shows the Claude chat in the side panel, the
same chat that is already there. It does not start a new chat and does not
open a tab. With the setting on `panel` it would open a Claude tab instead.

**Since 18 Nov 2026 a second Claude logo does what Ctrl+Numpad4 does** (asked:
"make that claude icon work like our ctrl 4"). The chat-opener add-on
(`~/.claude/tools/chat-opener`) puts its own Claude logo in the same place
(`editor/title`, command `chatOpener.newChatHere`, tooltip "New Claude chat
here (Ctrl+NumPad4)"): a click opens a new Claude chat tab in that editor
window. The logo file `claude-logo.svg` is copied from the Claude add-on, and
`build.ps1` now packs `.svg` files too. The Claude add-on's own logo cannot be
changed or removed from outside (an update would undo it), so it is hidden by
hand once: right-click either logo → untick "Claude Code: Open". VS Code
remembers that per profile, so on a new computer do it again. To show it again:
right-click the tab bar's buttons → tick it.

The binding is in `keybindings.json` (user keybindings win over extension ones)
and in the extension's package.json. The log gets a line
`run  lines a-b (selection was c-d)` or `stop lines a-b: <reason>`.

Ctrl+Shift+M types ` %>%`, or just `%>%` when the cursor already follows a
space (the old `type` binding doubled the space: `emissions  %>%`).

**Claude's edits in VS Code's own chat edit view** (v0.5.0, 5 Nov 2026).
Claude Code's edits to R scripts (.R, .Rmd, .qmd) look exactly like
Copilot's: old lines red (not in the file), new lines green, Keep / Undo next
to each change, and a bar at the bottom of the editor (Keep / Undo for the
file, "1 of N", arrows; Alt+F5 = next chat edit while that bar is there). It
is VS Code's own view; the extension only hands Claude's edit to it. The
chat panel is not used or changed (it may show a Copilot CLI session; that
stays as it is). How (details in section 9): Claude's hooks (`review.py`)
leave signal files in `%LOCALAPPDATA%\claude-edits\`; the extension sends a
request to its own chat session type `claude-edits` (declared in
package.json, never shown in a chat window) and wraps the edit in VS Code's
`externalEdit`. It does **not** open the file (since 6 Nov 2026: opening it
made the editor jump to Claude's file on every edit, even with
`preserveFocus`). Claude works in the background; the red/green and Keep /
Undo are there when you open the file yourself. Needs, once:
- `"enable-proposed-api": ["local.r-pipe-indent"]` in
  `C:\Users\<you>\.vscode\argv.json` (full VS Code restart after changing
  it): the session type uses the API proposals `chatSessionsProvider` and
  `chatParticipantAdditions`. INSTALL adds that line.
- Copilot signed in (VS Code only runs chat requests when chat is set up).

**Keep / Undo stays where you are** (6 Nov 2026). VS Code itself always jumps
to the next change after Keep or Undo on one change (built in, no setting).
The extension hears each Keep / Undo on Claude's edits (`onDidPerformAction`,
`chatEditingHunkAction`) and 0.1 s later puts the cursor and the scroll
position back where they were before the click. The log gets `stay after
keep: back to line N`. The jump to the next *file* after the last change of
a file is off in settings.json: `"chat.editing.revealNextChangeOnResolve":
false`. Copilot's own edits still jump (only Claude's edits are ours).

**Keep selects the kept lines** (10 Nov 2026). After Keep on one change the
lines you just kept are selected (blue), so you see at once where the change
was; the screen still does not scroll. Undo still puts the cursor back where
it was. A Keep of a deleted-lines change puts the cursor where the lines were.
How: VS Code keeps a hidden copy of the file as it was before Claude's edits
(scheme `chat-editing-text-model`, its query names the session
`claude-edits`). Extensions see it as a normal text document (checked in the
VS Code 1.145 code: every model that is not too large is synced). Keep on one
change copies that change into the hidden copy, so the lines that changed
there are the kept lines; the extension finds the same lines in the file
(longest run of equal lines, so changes still waiting above do not shift it)
and selects them. If the lines cannot be found for sure, it falls back to
"stay where you are". The Keep event itself only gives line counts, not where.
Careful: typing replaces a selection; Esc or an arrow key drops it first.
Ctrl+Enter on it runs the kept code. Log: `keep: sees VS Code's copy of
<file> before Claude's edits` (once per file, after a reload or Claude's
first edit) and `keep: selected lines a-b`. Tests: `test.js`, section "Keep
on one change".

**Keep / Undo come back after Reload Window** (6 Nov 2026). VS Code saves
every chat edit session when the window closes
(`%APPDATA%\Code\User\workspaceStorage\<workspace>\chatEditingSessions\<SHA-1
of "claude-edits:/edits">\state.json`) and reads it back when that chat
session is loaded again (checked in the VS Code 1.145.2 code). Our session
was only loaded by Claude's next edit, so after a reload the Keep / Undo of
edits not yet reviewed stayed away until then (6 Nov: three files looked
"unchanged"; the edits were in them all along). Now the extension sends one
empty request as soon as chat is ready (a few seconds after the reload, up
to 1.5 minutes while Copilot starts), and they come back. Also after a full
restart. The log gets `edits restore: loading the saved edits for Keep /
Undo`. Safety: for an edit not yet reviewed, VS Code puts its saved text
back into the file, and auto save would then save it. So just before the
session is first loaded, each saved edit whose file changed since (typed in,
also unsaved, or changed by git) is marked kept: no Keep / Undo for that
file, but no work lost (log: `edits restore: <file> changed since, left as
it is`). Without this, typing in such a file after a reload and then a
Claude edit put the older text back.

**A fresh edit history when the saved one is too big** (16 Nov 2026, v0.5.1).
The add-on uses one session for all of Claude's edits, so VS Code's saved
history of it only grew: on 16 Nov it held 1,232 steps and 790 file copies
(36 MB, collected since 5 Nov). Loading the session rebuilds all of it in the
window's memory. That took more than 20 minutes, and the window crashed
twice (`%APPDATA%\Code\logs\<date>\main.log`: `renderer process gone
(reason: oom)`). Found with a one-minute memory sample of the window: nearly
all new memory came from VS Code's `restoreState` of the chat edit session.
Now, when the window starts and before the session can load, the add-on
moves the saved history aside to `chatEditingSessions-old` next to it (only
the last one is kept) when no edit waits for Keep / Undo, or when it has more
than 200 steps or 10 MB of copies (`MAX_SAVED_STEPS`, `MAX_SAVED_BYTES`).
Files are never touched. In the too-big case, edits still waiting lose their
Keep / Undo, but their text stays in the file. Log: `edits fresh: saved
history moved aside (... steps, ... MB, ... edits waiting ...)`. Tests:
`test.js`, the end of section "saved edits after a reload". **VS Code
crashed?** Look for `reason: oom` in main.log first.

**The real cause of the crashes: VS Code's edit statistics** (16 Nov 2026,
the same evening). The window still ran out of memory after that fix
(14:42, 17:26, 20:28, 20:36, five times that day). A memory watch on the
window (allocation sampling through VS Code's own debugger, 34 minutes)
caught it: the window grew from 131 to 945 MB, and about 860 MB of that was
full copies of a document's text, made by `getValue()` after every change
of an open document, in VS Code's built-in "edit telemetry" (the observable
workspace with its edit-source tracker: which edits are AI, which typed).
It only runs while `telemetry.editStats.enabled` is on (an experiment, on by
default) and telemetry is "all". The paper on the Word Page changes all the
time (Quarto saves it every few seconds while you type, plus suggestions and
Claude's edits), so the copies piled up. Now `"telemetry.editStats.enabled":
false` in settings.json (section 3). It works at once, without a reload:
the window went back to 131 MB. The Keep / Undo history fix above stays
(it was real, but smaller).

Side effect: because the session type has `canDelegate` (needed for the
command that sends to it), VS Code may list "Claude's edits" among the chat
session types (new-chat menu); ignore it.

The log gets `edits start <file>` / `edits snapshot` / `edits done`; `ERR
edits: the chat request did not start` means no request could be sent (the
window then leaves Claude's edits alone for 2 minutes, so they are not
slowed down); `ERR edits off` means the argv.json line is missing. One-time demo: a `demo.json` in the signal folder is shown as
if Claude made that edit, once, at the next start (used for
`code/test_code/03_analysis_demo.R`).

Debug log: `%TEMP%\r-pipe-indent.log` (one line per Enter, run and stop; an
Enter line ends in `-> indent N` or `-> default` = handed to VS Code's Enter).
Offline test (82 checks, no VS Code needed), from the extension folder.
Code.exe is a window program: pipe its output (`| Out-String`), or
PowerShell returns before the test has printed everything:

```powershell
$env:ELECTRON_RUN_AS_NODE = 1
& "C:\Users\<you>\AppData\Local\Programs\Microsoft VS Code\Code.exe" test.js | Out-String
```

After changing `extension.js`: run the test, copy the folder to
`C:\Users\<you>\.vscode\extensions\`, Reload Window.

## 5b. Startup screen (own add-on, personal, 6 Nov 2026)

When VS Code starts, or after Reload Window, a loading screen covers the whole
screen for about six seconds and then closes itself:

- one picture, slowly zooming out, with embers drifting up;
- bottom left: a tip with one of your own shortcuts (a random tip each start,
  never the same one twice in a row, like the picture);
- bottom right: the loading steps with a small gold ring. The step "Calling
  the R add-on" waits, at most 3 s, until the R extension really runs.

A click or any key stops it at once and goes to VS Code.

- **Instant, through the helper** (6 Nov 2026): an add-on starts too late (VS
  Code first opens its window, then its add-ons), so a small helper program
  outside VS Code shows the screen: `%LOCALAPPDATA%\startup-screen\startup-screen-helper.exe`,
  made by `build.ps1` from `helper.cs` with the C# compiler that comes with
  Windows, started with Windows by the shortcut "Startup screen helper" in the
  Startup folder (`shell:startup`).
  - It waits without using the CPU for VS Code's new log folder
    (`%APPDATA%\Code\logs\<time>`, made about 0.5 s after VS Code starts,
    before its window), checks once that VS Code itself is opening (not its
    command-line tool), and covers the screen 0.2 s later: black first, then
    the picture fades in. It draws with WPF on the graphics card, on top of
    everything (also of VS Code's window, which opens a moment later). On
    this computer (2560x1600) about 25 frames per second.
  - The steps are real: the add-on leaves small files in
    `%LOCALAPPDATA%\startup-screen`: `signal-vscode` when VS Code's add-ons
    run, `signal-r` when the R add-on runs. Each step stays at least 1 s; at
    most 10 s for VS Code, 6 s for R, 25 s in all.
  - A click (or a key, if the screen has the keyboard) stops it at once, no
    fade, and brings VS Code's window to the front. The add-on then does not
    ask for it again: the helper writes `last-show` at every screen, and a
    screen in the last minute counts for this start.
  - A second VS Code window, or "Startup screen: play now": the add-on leaves
    `request-show` and the helper shows it. The helper writes `helper-alive`
    every 5 s and `showing` while the screen is up; the add-on reads them.
  - **One screen per start** (16 Nov 2026): every window VS Code reopens runs
    the add-on, so after a reboot (VS Code opened before the helper had
    started) three windows gave three screens in a row. Now a screen in the
    last minute (`lastShown` in `state.json`, shared by all windows) counts
    for every window; the log says "skip: another window of this start
    showed the screen". "Startup screen: play now" is not affected.
  - Waiting: about 23 MB of memory, no CPU; up to about 100 MB after a screen.
  - Without the helper (it does not run): the add-on shows the screen
    itself, a few seconds later: Microsoft Edge in kiosk mode (whole screen,
    own profile in `%LOCALAPPDATA%\startup-screen\edge-profile`, page from a
    small web server on 127.0.0.1), or with `startupScreen.fullScreen` off an
    editor tab. If a window ever stays: Alt+F4.
  - Stop the helper for good: delete the Startup shortcut and end
    `startup-screen-helper.exe` in Task Manager.
- **Pictures**: every .jpg, .png or .webp in
  `C:\Users\<you>\Pictures\VS Code startup` (a different one each start). Add
  or delete pictures there; nothing else to do. Another folder: setting
  `startupScreen.pictureFolder`. No pictures: a dark background with embers.
  The 5 pictures there on 6 Nov 2026 are official images from the game's
  media gallery (https://en.bandainamcoent.eu/elden-ring/elden-ring/media),
  saved for personal use only. Since 18 Nov 2026 save.ps1 copies them into
  `VS Code\startup-pictures` here, and publish.ps1 puts them in the GitHub
  copy (private repo), byte for byte. On a new computer: copy that folder to
  `Pictures\VS Code startup`. The add-on itself stays out of the GitHub
  copy. The helper shows
  .jpg, .png and .bmp (not .webp). A picture fills the screen, unless that
  would blow it up more than 1.35 times its real size (blurry): then it is
  shown across the full width, with a soft blurred copy of it above and
  below (6 Nov 2026, for the key art, 1920x650, on the 2560x1600 screen).
- **How often**: at every start and every new VS Code window (since 6 Nov
  2026; before that at most once every 10 minutes). **Not after Reload Window**
  (16 Nov 2026, asked: "dont run the start up screen animation when i reload
  a window"): a reload keeps the window's log folder
  (`%APPDATA%\Code\logs\<start>\window<n>`), a new start or window makes a
  fresh one, so the add-on skips the screen when that folder is older than
  30 s (`isReload`, log: "skip: Reload Window"). The helper itself only
  reacts to a new start (a new log folder), so it never showed one on a
  reload by itself. Setting
  `startupScreen.minutesBetween`: 0 (the default) = every start; a number =
  at most once in that many minutes. Not when the add-on is installed or
  switched on while VS Code is already running.
- **See it now**: Ctrl+Shift+P → "Startup screen: play now".
- **Off**: setting `"startupScreen.enabled": false`.
- **Personal**: publish.ps1 leaves the add-on folder out of the GitHub copy
  (`$leaveOut`), its pictures go in (18 Nov 2026). INSTALL does not install
  it: on a new computer run its `build.ps1` and copy `VS Code\startup-pictures`
  to the picture folder.
- **Files**: `helper.cs` (the helper), `extension.js` (the add-on),
  `screen-core.js` + `screen.html` (the add-on's own screen), `tips.txt` (the
  tips, one per line, read by both).
- **No C# add-on needed**: `build.ps1` builds `helper.cs` with the C# compiler
  that comes with Windows (`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`),
  so VS Code needs no C# add-on and no .NET SDK. Opening `helper.cs` makes VS
  Code offer "C# Dev Kit": say no. It was installed on 6 Nov 2026 (with
  `ms-dotnettools.csharp` and `ms-dotnettools.vscode-dotnet-runtime`) and
  removed the same day, because its only effect was the message "The .NET SDK
  cannot be located ... .NET debugging will not be enabled".
- **After a change**: run `build.ps1` in the add-on folder. It stops the
  helper, packs `startup-screen.vsix` and installs it with
  `code --install-extension`, builds the helper, makes the Startup shortcut
  and starts the helper again. Then Reload Window. Check the helper's look
  without showing anything: `startup-screen-helper.exe --snapshot out.png
  <picture> 1920 1080 4.5 "Calling the R add-on"`.
- **Log**: `%TEMP%\startup-screen.log`: `helper: started (graphics tier 2)`,
  `helper: show <picture>, tip N`, `helper: closed (N frames in S s)`,
  `add-on: the helper shows the screen; reported in`; without the helper
  `show <picture>, tip N, full screen` and `full screen: closed`.

## 5c. Word Page: write like in Word inside VS Code (own add-on, 11 Nov 2026)

For writing text (a paper, an essay) in something that looks like Word or
Google Docs, without leaving VS Code: a white page with black text, a toolbar,
headings, lists, tables, footnotes, formulas and citations. The file underneath
is markdown (`.qmd`), so Claude can move the text into an `.Rmd` paper as it is.

**What it is made of.** The editor is not ours: it is the *visual editor* of the
Quarto add-on (`quarto.quarto`, needs the Quarto program, both installed). An
agent compared the Word-like add-ons on the Marketplace on 11 Nov 2026 (read
their pages and code, installed none): Quarto's is the only one that both
writes real pandoc markdown and has citations from a `.bib` file and Zotero
built in. Two things were missing, and the own add-on `local.word-page` adds
them:

1. **A white page under a dark theme.** Quarto's editor takes every colour from
   the VS Code theme, and has no setting for another look (none among its
   `quarto.visualEditor.*` settings). The add-on puts two blocks into Quarto's files
   `assets\www\editor\index.js` (at the top) and `style.css` (at the end),
   between `word-page:start` and `word-page:end` marks; nothing else in those
   files changes, and "take out" gives the files back byte for byte. The script
   block gives the editor the colours of VS Code's Light Modern theme (889
   colours; fonts and sizes stay your own settings), puts them back whenever
   VS Code sends its theme again, and switches off the "dark mode" yes/no that
   VS Code sends with the preferences (without that, formulas are drawn white
   on white). The style block makes the page: grey desk, white sheet 820 px
   wide with margins and a shadow, smaller margins in a narrow editor.
2. **It comes back by itself.** A Quarto update brings new files without the
   blocks. The add-on checks at every start of VS Code and when an add-on is
   installed or updated, and puts the blocks back (it reads only the first
   50 KB of the 10 MB file to check).

**The PDF look (11 Nov 2026, asked: "look pdf like but still me being able to
edit it").** With the setting `wordPage.look` on `"pdf"` (the default) the page
is drawn like the PDF that R Markdown makes of a paper (`pdf_document`: LaTeX,
A4, 11 pt, margins 2.5 cm), and you still type on it as before:

- the PDF's own font, Latin Modern (text, italic, bold, the headings, code);
- an A4 page with margins of 2.5 cm, text straight on both sides;
- the same text size, line distance and room between paragraphs;
- `#` as a section heading and `##` as a subsection heading, in the PDF's
  sizes and with the PDF's room above and below;
- a figure in the middle of the page; a caption of one line in the middle, a
  longer one filling the lines; tables with a line above, under the header
  row and below, no boxes; code in a line without a box;
- citations and links in the text font, dark blue.

The numbers were measured in the term paper's PDF (page 595.28 pt wide, text
from 70.9 to 524.4 pt, text 10.91 pt on lines 13.55 pt apart, 19.5 pt from
paragraph to paragraph, section heading 14.35 pt with 40.4 pt above and
30.3 pt below, subsection heading 11.96 pt with 35.2 and 26.6). On the page
they come out the same to within half a point (`bench\js\gaps.js` measures
the page). The style rules are `inject\pdf-look.css`; every size in it is
counted in "one point of the PDF on the screen", so the whole page follows
`wordPage.pageWidth`: **a wider page is the same page, zoomed in** (820 gives
text of 15 px, 1000 gives 18 px). In an editor that is too narrow for the
page, the margins shrink first (down to 24 px) and the text keeps its size;
only below that the text shrinks, never under 12.5 px.

**Zoom (18 Nov 2026, asked: "make me able to zoom in and out").** On the page
(PDF look), **Ctrl+wheel or a touchpad pinch zooms in and out** on the spot
under the mouse, from 50% to 300%, live, no reopening. A small label at the
bottom right shows the zoom for 1.5 s, a click on it gives 100% again. Near
100% it snaps to 100%. Wider than the editor, the editor scrolls sideways.
The zoom is remembered in the page (localStorage `wp-zoom`). How: the script
block sets `--wp-zoom` on the page, and `pdf-look.css` multiplies the page,
the text column and `--wp-pt` by it, so everything stays measured in PDF
points and the page ends and landscape sheets still fit. A timer of 16 ms
(not `requestAnimationFrame`, which never fires on the invisible bench
desktop) bundles the wheel steps. Ctrl+= and Ctrl+- are not used: VS Code
takes those keys from the page and zooms the whole window. The Word look has
no zoom (use `wordPage.pageWidth` there). Tested on the bench: 100% to 157%
and back to 52%, page 820 to 1286 px wide.

**Even closer to the PDF (12 Nov 2026, asked: "want the visual version of the
.qmd to be exactly how the eventual pdf will look, just that I am able to edit
it").** Four more things, all in the PDF look:

- **Numbered headings**: 1, 1.1, 1.1.1 with the room of one letter after the
  number, as `number-sections: true` gives them. A heading with
  `{.unnumbered}` gets no number and is not counted. Style rules only (CSS
  counters); the number cannot be clicked or typed over.
- **The title block**: the header at the top (YAML) is drawn as page 1 of the
  PDF: title, subtitle, the names side by side, the date (`date: today` with
  `date-format`) and the abstract, in the PDF's fonts (Latin Modern 17 and 12
  for the title part). Measured: every line within 0.2 pt of the PDF
  (`bench\js\title.js`). **Click on it to change the header**: the box opens
  as code; click in the text and it folds back.
- **Paragraphs as in the PDF** when the header says `indent: true` (the term
  paper: `draft_header.tex` sets `\parindent` 1.25 cm and `\parskip` 0pt;
  asked the same evening through another Claude session): the first line
  1.25 cm in, no room between paragraphs, no indent right after a heading,
  and the room around headings, lists and the title block as LaTeX gives it
  without `\parskip` (measured in the PDF; on the page within 0.5 pt). The
  script block reads `indent: true` from the header and gives the page the
  class `wp-indent`; without it the page keeps room between paragraphs. The
  1.25 cm itself is written in `pdf-look.css` (the page cannot read
  `draft_header.tex`).
- **Folded code**: R chunks, raw LaTeX (`\afterpage{`, `\input{...}`) and a
  second header further down (`nocite`) are one thin grey line, for example
  "R code: Table 3 is made here (click to see the code)" or "LaTeX:
  \afterpage{". A click opens the box; arrow keys into it open it too.
- **Page ends** (switched off since 16 Nov 2026 at his request:
  `"wordPage.pageEnds": false` in settings.json; set it to true to get them
  back): a dashed line across the page with "page 7" in the right
  margin where each page of the PDF next to the document starts
  (`draft.qmd` -> `draft.pdf`), and at the top right "page ends: draft.pdf,
  built 15:51". After Ctrl+Shift+K the lines move by themselves within a few
  seconds. They are as right as the last build: text typed since then is
  not counted until the next build. A page that starts with a figure, a
  table made by R or LaTeX, or the reference list gets no line (that is not
  text on the page); a page on its side (a map) is skipped.

How the folding works. Quarto's code boxes tell the editor to leave
everything inside them alone (`ignoreMutation`, checked in Quarto's
`index.js`), so the script block puts its "face" (the title block or the grey
line) *inside* the box, and it never becomes part of the document (checked in
the bench: typed, saved, no face text in the file). The code is folded to a
height of 0, not hidden, so the arrow keys still reach it. A box opens only
when you put the cursor there (click or key); when the editor puts the cursor
in the header by itself (it does that when a document opens), the cursor is
taken out again, so typing never goes into hidden code.

How the page ends work. The add-on watches `*.pdf` in the workspace. When the
PDF of an open page changes, it waits 1.5 s (Quarto writes it in steps) and
runs `pdfpages.py` (Python with **PyMuPDF**; on another computer: `pip install
pymupdf`; setting `wordPage.python`), which gives the first 12 lines of every
page. The add-on writes them into `word-page-pdf.css` next to Quarto's
`index.js` (base64 JSON in a CSS variable: Quarto's page may load style
sheets from its own folder, but no other files, `default-src 'none'` in its
page header). The page reads that file every 3 seconds, looks for the first
lines of each page in its own text (letters and digits only, so quotes,
dashes and hyphenated words still match; code boxes and figure captions left
out), and draws the lines as a picture behind the text. The log
`%TEMP%\word-page.log` has a line per read (`pdf: read draft.pdf, 35 pages,
26 citation keys, 26 tables and figures, 3 pages of references (9194 ms)`) or
why it failed.

**From the PDF itself (12 Nov 2026 evening, asked: "I am still not seeing the
file exactly as the pdf would look like ... try and make it more look like
draft.pdf").** Setting `wordPage.fromPdf` (on). The same read of the PDF also
gives:

- **Citations as the PDF prints them**: `[@Hoydahl_2023, p. 4]` is shown as
  "(Høydahl, 2023, p. 4)", `@Key` in the text as "Høydahl (2023)", with the
  author and year exactly as the PDF has them (also "Lånekassen, n.d.-b",
  "Søholt & Holm"). `pdfpages.py` reads them from the links of the
  citations (`link-citations: true`; pandoc writes `&` in a link name as
  `ux26`). The text in the file stays `[@key]`: style rules in a style
  block of the script make `[`, the key and `]` invisible and show `(`,
  "Høydahl, 2023" and `)` in their place, found by their place on the page
  (`:nth-child`), so nothing in the editor is changed. **Put the cursor in a
  citation and it shows its `@key` again**, to change it. After every change
  on the page the places are checked at once, before the screen is drawn,
  so a rule never lands on another citation. A key that is not in the PDF
  yet (cited after the last build) stays `@key`.
- **Pictures of what R and LaTeX make**, cut out of the PDF at the size of
  the PDF and in the place of the box that makes them: the tables (Table 1
  to 4, A1 to A8), the figure made in R (Figure 7), Figure 1 beside the
  text (LaTeX `wrapfigure`; the text runs around it as in the PDF) and the
  reference list (in the place of the `nocite` header under "References").
  Which box makes what is read from its code: `caption = "**Table 3.**..."`
  in a chunk, `#| fig-cap: !expr name` (the caption kept in a variable by
  another chunk), `\caption{\textbf{Figure 1.} ...}` in raw LaTeX. A table
  that runs over many pages shows its first page and "goes on for 2 more
  pages". A table ends at its last rule when running text, a heading or a
  bullet point comes after it (bullets since 16 Nov 2026, asked: "I don't
  see Table 1": Table 1 had only bullets under it, was taken as going on
  to the next page, and its picture took in the bullets of two pages; Table
  2 took in four bullets). On hover a dashed line and a tag say what made it; a click opens
  the code. The pictures are PNG files (150 dpi) in `word-page-pdf\` next to
  Quarto's `index.js`, named after the PDF and its build time; those of an
  older build are taken away.
- **Tables made by an include line** (16 Nov 2026, asked: "I still don't see
  the tables"): `first_draft.qmd` makes a table with
  `{{< include ../output/tables/x.md >}}` and a caption line
  `: **Table 1.** ...` under it. Quarto's page shows those two lines as a
  definition list (`dl.pm-definition-list`: the include line is the term,
  the caption its description), not as a box, so the code-box route above
  never saw them. `drawIncludes` in `word-page.template.js` hides the two
  lines with style rules (as for the citations, found by `:nth-child`, the
  last step named `dl.pm-definition-list` so a rule can hit nothing else,
  checked after every change) and shows the PDF picture of that table in
  their place (`::before`, a second page part as `::after`). Also inside
  `::: landscape` (Tables A5, A6). **Cursor in the list** (arrow keys): the
  two lines show again, to change them. Tested in the bench on a copy of
  first_draft.qmd: Tables 1, 2, 3, A2, A5, A6, A7.
- **Table captions you can type in** (17 Nov 2026, asked: "let me easily edit
  the text around the figures and tables ... it works for figures but not
  for tables"). `pdfpages.py` now also writes `cap` in the first part of a
  table: how many points at the top of the picture are its caption (from the
  caption block down to 3 pt above the first rule or row). `drawIncludes`
  then hides only the include line (dt). The caption (dd) stays as normal,
  editable text, and the picture shows under it without its caption strip
  (`background-position` shifted up by `cap`, the list made a flex column so
  the `::before` picture comes after the dd). The settings at the end of a
  caption (`{tbl-colwidths="..."}`) are greyed with the CSS highlight
  `wp-table-settings` (searched in the whole caption text, because the
  spelling marks split it into pieces). Both lines show again only with the
  cursor in the include line. A PDF built before this has no `cap`: then it
  works as before (both lines hidden). Code boxes with a caption in R keep
  the whole picture. Tested in the bench: typing in the Table 1 caption
  reached the file, the picture and the grey stayed. Needs Reload Window;
  the pictures are cut again when the page opens or the PDF is rebuilt.
- Everything here is **as of the last build** (Ctrl+Shift+K): a table
  changed in R shows the old picture until the PDF is built again.
- **The look of the PDF itself** (12 Nov 2026 night, asked: "the qmd file in
  visual mode is not the same as the pdf"; a test copy of the paper builds
  with Times New Roman 12 pt). `pdfpages.py` measures the PDF (`style`):
  font and size of the text, line distance, paragraph indent, each heading
  level (font, size, bold or italic, room above and below, room after the
  number), caption size, the colour of the citations, the font of code. The
  script block turns that into style rules; the room around a heading is
  worked out from the fonts' own ascent and descent on this screen, so
  the gaps match the PDF (measured on the Times copy: section to subsection
  23.0 pt, PDF 22.9; subsection to text 18.7, PDF 18.7; lines 14.47 apart,
  PDF 14.45). A font other than Latin Modern is taken as installed in
  Windows (Times New Roman, Consolas). The title block is then a picture of
  page 1 of the PDF (title to abstract), at its place. Without a PDF the
  page keeps the look measured on 11 Nov.
- **Formulas** (same night): Quarto draws a formula as an inline-block, which
  took over the 1.25 cm indent of its paragraph (white before every formula
  in a line), and a display equation is a MathJax picture without a size of
  its own, so it was 300 px wide and cut off with its number (1) on top of
  it. Now: no indent inside a paragraph or for a paragraph that is a display
  equation, and display equations as wide as the column, the number at the
  right edge as in LaTeX.
- **Page ends, made surer** (same night): the running head and page number of
  a page are left out, a line of one or two words only counts where a heading
  starts with it ("3 Methods" without its number), of all first lines of a
  page the one found first counts, and no further than about two pages of
  text on (a table cell on top of page 5 had put page 5 at "Results", and
  pages 6 to 12 were lost).

**Changes made to the file outside the page (12 Nov 2026, found when another
Claude session edited `draft.qmd` while it was open as a page).** How the page
saves: when something changes on the page, Quarto writes the page's whole
markdown into the document every 2 seconds, and `files.autoSave` (afterDelay,
100 ms) saves it. So yes, the page saves by itself. But Quarto's page takes a
change made to the file by another program only when neither the editor nor
the page has the focus (`applyExternalEdit` in Quarto's `index.js`), and it
does not try again: the page kept the old text, and the next keystroke wrote
that old text over the file. Now the script block takes such a change itself
when nothing was typed on the page for 2.5 seconds (Quarto has then written
everything typed into the file): for that one message the editor has no focus,
and the cursor and scroll place are put back. Quarto asks two things (does the
page have the keyboard, and is the editor `document.activeElement`); the
second stays "yes" while the keyboard is in the Claude chat box after
Ctrl+Numpad5, and the first version of this fix let Quarto decide then, which
dropped an edit at 17:29 UTC (found by the session that edits `draft.qmd`).
Both are now made "no". Only keys that change text count as typing (not
Ctrl+Numpad5 or the arrow keys).

Red lintr mark on the last ```` ``` ```` line of a chunk before a closing
`:::` (found the same night by the session that edits `draft.qmd`): not the R
add-on but Quarto's cell diagnostics. Quarto copies the R chunks into a hidden
`.vdoc.<id>.r` file for the R language server, and its cutting takes the
closing fence along when `:::` follows without a blank line (the page always
writes it so). A `.lintr` exclusion cannot reach that file; the fix is
`"quarto.cells.diagnostics.enabled": false` in the project's
`.vscode/settings.json`.

The 12 Nov way above is now only the fallback, for when Quarto's code has
changed and the hooks below do not fit (log line `sync: hooks ... NOT in
place`). Without the hooks there is no red bar any more either.

**A Claude chat and you in the same file at the same time (13 Nov 2026,
asked: "make sure that I don't get situations where changes disappear, also
turn off that warning bar").** Built and stress-tested the same day. The red
bar is gone: it came mostly from Quarto's own saves (every save comes back to
the page as "the file changed"), and what it warned about can no longer
happen. Six parts:

1. **Hooks in Quarto's code** (`patch.js`, `addSyncHooks`): four short pieces
   of added text in Quarto's `index.js`, each between `/*wp+*/` and `/*wp-*/`
   so `strip()` gives the file back byte for byte. They hand three moments to
   the script block: the page has started (`started`), VS Code passes on a
   change of the file (`external`), Quarto asks for the page's text to write
   it into the file (`markdown`); and the fourth asks `changedSince` right
   before the page swaps its text. When Quarto's code changed and one piece
   does not fit exactly once, none goes in (`SYNC = false`), the 12 Nov way
   works, and the log says so. After a Quarto update the page tab must be
   closed and opened once (the add-on says so).
2. **The page merges instead of choosing** (`merge.js`, a three-way merge:
   paragraph by paragraph, word by word inside a paragraph both changed,
   and where both changed the same words your typing wins. Until 16 Nov
   2026 it went letter by letter: typing "in a similar" while Claude
   changed ": after" to ". After" two words further on came out as "in
   into e sa similair Afme direction.ter 2024ion." Tests: `test.js`,
   "merge: typing and a Claude edit two words apart").
   The script block keeps `file` (what the file holds) and `base` (the file
   text the page's text stands on). When Quarto asks for the text, the page
   gives its own text merged with what changed in the file, so your typing
   and the chat's change both stay. Only where both changed the very same
   letters does your text win (the chat is then told, part 6). Quarto's own
   write coming back is recognised and ignored. A write is only noted as done
   at the very end, after a last check that no chat is writing and that the
   file did not change meanwhile (noting it earlier lost letters in the bench).
3. **The page shows a chat's change when you pause** (3 s without typing,
   1.5 s until 16 Nov 2026):
   Quarto's `setMarkdown` reads the new text and swaps it in. Right before
   the swap the hook asks `changedSince`: did anything on the page change
   since the swap began? Then it is called off, nothing changes, and it is
   tried again at the next pause. Question and swap run without a break, so
   no keystroke can get lost. (First tried: holding keys pressed during the
   swap and typing them again afterwards; that lost 5 of 264 words.) The
   cursor goes back to the same words, the match nearest to where it was.
   **Working in the page while a chat edits it** (16 Nov 2026, asked: "when
   you were editing my cursor was going around in the qmd file and i was
   unable to work on it at the same time"). Ten edits in a row gave ten
   swaps, each after a 1.5 s pause, and `putCaret` took the first place in
   the whole paper with the same 40 letters around the cursor (or with only
   half of them), so the cursor could land in another paragraph each time.
   Now: a swap waits until no change from outside came for 2 s
   (`SETTLE_OUTSIDE`) and no chat holds the file (`chatWriting`), so a burst
   of edits is one swap; it needs 3 s without typing (`QUIET_APPLY`); and
   `caretPlace` also notes where in the page's text the cursor is, so
   `putCaret` takes the match nearest to it (`nearest`), or that same spot
   when the words are gone. Bench test: cursor in a paragraph whose words
   also stand in an earlier paragraph, five edits 0.5 s apart above it: one
   swap, cursor at the same letter of the same paragraph.
4. **The hold** (`word-page-hold.css` next to Quarto's `index.js`): just
   before a chat writes a `.qmd`, `review.py` writes a time a few seconds
   ahead into that file in each Quarto folder the add-on registered
   (`%LOCALAPPDATA%\word-page\quarto\<pid>.json`), one `holds\<id>.hold` per
   edit. The page reads it (a style sheet: the only kind of file it may load)
   before it hands its text over, and again right before; while it holds a
   future time, the page hands nothing over. The hook waits 0.6 s and until
   no write came for 0.35 s, so a write already on its way is saved first.
   Without this, the chat's write and VS Code's save could cross ("Failed to
   save: the content of the file is newer", and VS Code saved nothing more).
5. **The wait** (`typing.js`, section 6 of `extension.js`, `review.py pre`):
   the add-on notes when the document of each `.qmd`/`.md` last changed in
   VS Code (`%LOCALAPPDATA%\word-page\typing\<sha1>.json`, one small file per
   document so two VS Code windows never overwrite each other's marks, at
   most every 100 ms). The hook waits until you have not typed in that file
   for 5 seconds (at most 90 s, then the edit is refused and the chat tries
   again later; the hook `timeout` is 150 s). The chat box says "Claude
   waited N s: you were typing in draft.qmd". A Write is refused when you
   typed into the file while it waited.
6. **Safety nets.** (a) `review.py post` (when you typed in the last 2
   minutes) waits 4 s and checks whether the old text is back where the chat
   changed it (with 40, 20 or 8 letters around it); then the chat is told
   "probably lost ... Read the file again. If your change is not there, make
   it again". (b) The add-on (section 7 of `extension.js`) catches two rare
   cases of a program that writes the file without hooks (a script, Dropbox):
   a change read from disk that the page's next write leaves out is merged
   back in ("keep:"); and when VS Code could not save ("the content of the
   file is newer", unsaved for more than 1.5 s), it merges what VS Code has,
   what is on disk and what was last saved, writes it in one step and lets
   VS Code read it back ("heal:"). Both read the file twice 0.2 s apart (a
   program can be halfway through writing it), refuse a result more than 10%
   shorter or a text cut off at the end, and count only a real read from
   disk or a real save (Quarto slips its newest text in at the last moment
   of a save; taking that for a change from disk doubled words).

**Stress test, 13 Nov 2026** (bench, a second VS Code on its own invisible
desktop, the real Quarto page, the real hooks; scripts in that session's
scratchpad): a typist typing numbered words into the page with typos and
corrections, in bursts with pauses of 0.3 to 8 s, often right next to the
chat's edits, sometimes clicking away from the page; two fake Claude chats
editing the same file through the real hooks, as Claude Code's Edit tool does
(re-read, retry, redo when told); a monitor reading the file 20 times a
second. Six rounds: no typing; bursts; pauses of 4.3-6.5 s (right around the
5 s wait); clicking away; 100 s of non-stop typing (the chat refused once
after 90 s, then done); and another program writing the file without hooks.
Ten full runs, each finding a fault that was fixed (doubled words from a
diff placing the same typed words at a different spot, which `slideLeft` in
`merge.js` now moves to one place; Quarto's last-moment save text taken for
a change from disk; a hold that came a moment too late; keys typed during a
swap; a write noted before its last check). Run 9: 313 typed words and 76
chat edits, every word in the file exactly once, every chat edit in, nothing
missing even for a moment, the file whole, page and file the same (one
round's page lagged only because the bench's Quarto copy lost a file, see
below). Run 10, all six rounds clean: 312 typed words and 76 edits (68 by the
two chats, 8 by the program without hooks), none missing, none twice, no typo
left, nothing gone even for a moment, no "content is newer", no repair
needed, the file whole and the page the same as the file. Debugging: with `window.wordPageDebug = true` on the page (bench)
the page keeps its last 150 merge steps; with the environment variable
`WORD_PAGE_DEBUG=1` the add-on writes its repairs to
`%TEMP%\word-page-debug.jsonl`. Log lines in `%TEMP%\word-page.log`:
`claude:` (waits, refusals, "probably lost"), `keep:`, `heal:`, `sync:`.

Bench lessons: the bench restores the tabs of its last session at start-up,
before the add-on has put its new code into Quarto, so the page then runs the
previous version: clear `data\User\workspaceStorage` (and `data\Backups`)
before starting it after a change. Windows emptied `out\lsp\resources\
abbreviations` (an empty file) in the bench's Quarto copy in %TEMP% during a
run; then the page could not read new text (`pandoc_markdown_to_ast failed`)
and stayed behind until the file was put back.

Claude's side: `~/.claude/CLAUDE.md` says to change a `.qmd` only with the
Edit/Write tools, never with a script: a script write has no wait and no
hold (only the safety nets of part 6b).

What it still cannot copy, so the real PDF still differs:

- **Words are not broken at the end of a line** (VS Code has no
  word-breaking lists; checked in the bench). A line in front of a long word
  that cannot be broken, such as a file path, gets wide gaps. So a paragraph
  can be a line longer than in the PDF (the abstract: 10 lines, the PDF 9).
- Boxes that make nothing in the PDF (the setup chunk, `\afterpage{`) are
  still a grey line, which takes a little room the PDF does not have; the
  page ends are tied to the text, so they stay right.
- A page that ends in the middle of a paragraph is a dashed line, not a gap
  (the editor cannot split a paragraph). A page that starts with a new
  paragraph or heading does get a gap: grey room with "page 11" in it, as the
  desk between two sheets (12 Nov 2026 evening, asked: "leave a bit of space
  between page ends"; style rules by the place of the paragraph, checked
  after every change like the citations).
- **Pages turned 90 degrees** (`::: landscape`, same evening, asked: "figures
  are not shown in their true size", "some pages can be turned 90 degrees"):
  a sheet of A4 lying on its side at the scale of the page (841.89 x 595.28
  points) with the PDF's landscape margins, so a map is 765 points wide as
  in the PDF (it was 654: the sheet shrank to the window), and grey room
  around it, so it looks like a page of its own. In a window narrower than
  that sheet the editor scrolls sideways (or make the editor wider: Ctrl+B
  hides the side bar). The figures on upright pages were already at their
  PDF size (measured: Figure 5 452.3 points on the page, 453.5 in the PDF).
  **Scrolled sideways, the sheet stays put** (16 Nov 2026, asked: "if i
  scroll to the right to see the whole of figure 7 it keeps jumping me
  back"): `placeSideways` in the script block measured where the text starts
  as seen on screen, so with the editor (`.body`) scrolled sideways every
  change on the page (a redraw of the suggestion lines while scrolling is
  enough, through the MutationObserver) moved the sheet right by the scrolled
  amount and the map's left edge came back into view. It now adds
  `body.scrollLeft`. Bench test: scrolled 300 px, one change on the page, the
  sheet stayed at the same place (before the fix it moved 300 px).
- No ligatures (fi, fl drawn as one letter): the editor switches them off.

The fonts are eight files in `inject\fonts` (copied unchanged from TinyTeX,
free under the GUST Font License; `README.txt` there). `patch.js` writes them
into the style block as `data:` addresses, so nothing is installed in Windows
and no font file is added to Quarto's folder; Quarto's page allows fonts from
`data:` addresses (`font-src data:` in its page header). The style block is
1.2 MB with them. The script block only adds the class `pdf-look` to the
page; all PDF rules ask for that class, so `"word"` gives exactly the old
page (the rules and fonts are then not even written into Quarto's file).

**Using it.**

- New document: Ctrl+Shift+P, `Word Page: New Document` (also: right-click a
  folder in the Explorer, or File > New File...). It asks for a name, makes
  `<name>.qmd` in the folder of the open file with the header below, and opens
  it as a page. A `.bib` file in that folder becomes its list of sources.
- **Every `.qmd` opens as a page by itself** (16 Nov 2026):
  `"workbench.editorAssociations"` has `"*.qmd": "quarto.visualEditor"` in
  settings.json. A `.md` never opens as a page by itself: right-click it,
  `Word Page: Open as Page`.
- **Ctrl+Numpad9** (Ctrl+Numpad1 until 18 Nov 2026) switches between the page and the plain markdown text, both
  ways (Quarto's `quarto.editInSourceMode` on the page,
  `quarto.editInVisualMode` in the text; keybindings.json, 16 Nov 2026). His
  Ctrl+Shift+F4 did nothing (probably the computer's F4 needs Fn).
- **No `editor: visual` in the header any more** (16 Nov 2026, "it kicks me
  back to the visual editor every time"). With that line Quarto reopens the
  page whenever a text tab of the file opens, except right after its own
  switch. But it forgets that switch after 0.1 s (`onDidChangeActiveTextEditor`,
  100 ms debounce, deletes `visualEditorPendingSwitchToSource`), while its tab
  check first reads the file (`await fs.readFile`): when the read is slower,
  the page comes back. Read in Quarto 1.139's `out/main.js`. Removed from
  `paper/first_draft.qmd`; `Word Page: New Document` no longer writes it;
  the editor association above opens the page instead. The line changes only
  the editor, never the PDF. `paper/draft.qmd` still has it.
- Older text (12 Nov 2026), from when the header had `editor: visual`:
  **The plain text of a page** (12 Nov 2026, asked: "the text editor
  function doesn't work anymore for the quarto file"): Quarto opens a `.qmd`
  whose header says `editor: visual` as a page every time, also after
  "Reopen Editor With > Text Editor" or "Open With > Text Editor" (it closes
  the text tab and opens the page again; that is Quarto, not this add-on).
  Only Quarto's own switch is let through. So: Ctrl+Shift+F4 on the page,
  or **right-click the file or its tab > `Word Page: Open as Plain Text`**
  (also Ctrl+Shift+P). That command uses Quarto's switch; it asks once and
  waits 3 seconds before it asks again, because asking while Quarto is
  still busy closes the new text again (found in the bench). The log has a
  line per try (`text: try 1 for draft.qmd ...`).
- **Reload a page** (16 Nov 2026, asked after a re-run figure still showed
  the broken picture): a page keeps every picture it loaded when it opened.
  The round arrow in the page's tab bar (also right-click the tab, or
  Ctrl+Shift+P > `Word Page: Reload Page (new pictures)`) saves the page,
  closes it and opens it again in the same place, so every picture is read
  from disk again. Log: `reload: <file> opened again`.
- Citing: type `@` and the first letters of an author (a list comes up), or
  Insert > Citation (Ctrl+Shift+F8). The dialog shows the document's `.bib`
  file, **your Zotero library** (read straight from `C:\Users\<you>\Zotero`,
  Zotero does not have to be open, Better BibTeX is not used), and a search
  by DOI, in Crossref and in PubMed. A source picked from Zotero is added to
  the `.bib` file by itself. A source added in Zotero shows up here after
  Zotero has saved its database (closing Zotero does that).
- Footnote: Ctrl+Shift+F7. Table, picture, formula: the Insert menu.
- Settings: `wordPage.enabled` (off = the editor follows the theme again),
  `wordPage.look` (`"pdf"` = the page as a paper's PDF, `"word"` = the
  Word-like page of before), `wordPage.pageWidth` (820; in the PDF look this
  is the zoom), `wordPage.foldCode` (on: header as title block, code as a
  grey line), `wordPage.pageEnds` (on: the PDF's page ends; off in his
  settings since 16 Nov 2026),
  `wordPage.fromPdf` (on: citations and pictures from the PDF),
  `wordPage.python` (`"python"`: the Python with PyMuPDF that reads the PDF).
  After a change: close the document tab and open it again.
  In the Word look, font and size of the text are Quarto's:
  `quarto.visualEditor.fontFamily`, `quarto.visualEditor.fontSize`; the PDF
  look does not use them.

```yaml
---
title: "Draft"
bibliography: references.bib
---
```

**The real PDF beside the page (12 Nov 2026, asked: "need to see the page
endings").** The page cannot show where a page ends: LaTeX decides that when
it builds the PDF. So the answer is the real PDF next to the page, as in
Overleaf. With `format: pdf` in the header of the `.qmd`:

- **Ctrl+Shift+K on the page** builds the PDF and shows it in a tab to the
  right ("Quarto Preview"), with a terminal under it that shows the build.
  Press it again after a change (about 30 seconds for the term paper). It is
  Quarto's own command; also Ctrl+Shift+P, `Quarto: Preview`. The PDF is
  saved next to the `.qmd`. It is the same key as for an `.Rmd` (section 7).
- Checked in the bench on 12 Nov 2026 with the term paper's draft: the key
  builds the PDF from the page and the tab shows "1 of 25". (A first test
  opened the Link dialog instead: the bench sent the key as "k", and the page
  editor takes Ctrl+Shift+"k" for Ctrl+K. A real keyboard sends "K";
  `cdp.py key k ctrl,shift` now does too.)

A `.qmd` that is both a page and a PDF, things to know (all checked by
saving from the page in the bench and comparing the file):

- Saving from the page keeps code chunks, raw LaTeX blocks
  (```` ```{=latex} ````), `::: landscape` blocks and a second header block
  further down (for example `nocite`). It only writes list bullets its own
  way.
- A table typed in the text: the page **drops `{tbl-colwidths=...}`** from
  its caption when it saves, and sets the dashes under the header row from
  the column widths on the page. So the widths of such a table are set by
  dragging its columns on the page. For a table that a code chunk prints,
  `tbl-colwidths` in the caption does work (the page never touches it).
- R code in a line (`` `r x` ``) is shown as code on the page, also inside a
  table cell: keep it short (one variable).
- The header is drawn as the PDF's title block (since 12 Nov 2026; click it
  to edit). LaTeX settings can still live in a file of their own:
  `include-in-header: draft_header.tex`.
- **A map on a sheet of its own (12 Nov 2026, asked: "the numbers are not
  readable, it is all too small").** A `::: landscape` block is a page lying
  on its side in the PDF. On the page it is now a wide sheet of its own too:
  as wide as an A4 page on its side, or as wide as the window when that is
  narrower, with the picture across the whole sheet. The rule is in
  `inject\pdf-look.css` (`.pm-div.landscape`, width `--wp-land`); the page
  gives a `:::` block its name as a class, which is how the rule finds it.
  In the PDF of the term paper the landscape pages have 1.2 cm margins, so a
  map is 27 cm wide (`draft_header.tex`: `\newgeometry` before a landscape
  page, `\restoregeometry` after it, and three lines that set the page
  height back; without those the next page ran to the bottom edge of the
  paper).
- Pandoc cuts a table in two at the end of a page. `draft_header.tex` of the
  term paper has a one-line rule against that (`\keeptogether{5cm}`: new page
  when less than 5 cm is left). The LaTeX package `needspace` is not used for
  it: in front of a table it reserved too much room and left half-empty
  pages. A test on 12 Nov 2026 did make Quarto install `needspace` into
  TinyTeX (one small package; it is unused).

**Things to know.**

- The first time ever, Quarto asks "You are activating Quarto visual markdown
  editing mode": click **Use Visual Mode**. Once.
- The page rewrites the markdown in pandoc's own tidy style when it saves
  (`*text*`, table columns lined up). Fine for a writing document. Do not open
  `README.md`, `CLAUDE.md` or a memory file as a page.
- A file opened as a page shows as changed (the dot on the tab) right away
  when its markdown was not yet in that tidy style.
- It is for `.qmd` and `.md`. An `.Rmd` cannot be opened as a page (Quarto
  does not allow it): write in a `.qmd`, Claude moves the text into the `.Rmd`.
- **Claude's suggestions, like Grammarly** (16 Nov 2026, asked: "me having a
  window open with you and if I'm on some text you can come with proposals
  like Grammarly does ... make sure it works properly in the Quarto visual
  editor"). What you see: when a document opens as a page, Claude reads
  the text that is already there in the background, paragraph by paragraph
  (`wordPage.assistantReadAll`, on since 16 Nov 2026, asked: "existing text
  can also just be checked"); the answers are kept on the computer (see
  below), so after a restart
  only changed paragraphs are read again. After you stop typing for about
  4 seconds, the paragraph you changed goes to Claude first; about 5 seconds later coloured lines
  appear under words on the page (red = correctness, blue = clarity and
  conciseness, green = word choice). Click the words: a card with the new
  words, a short reason, **Accept** and **Decline**. The button "Claude n" at
  the top right opens the list of all of them (folded when the editor is
  narrow). The status bar shows "Claude n" / "Claude reading"; a click there
  gives: let Claude read the whole document (asks first, uses your Claude
  usage), turn it off/on (`wordPage.assistant`), forget and read again.
  - How: `assistant.js` (add-on side) notes the changed paragraphs of the
    documents open as a page, and after the pause runs the Claude Code
    program of this computer without a window (`claude -p`, your subscription,
    model `wordPage.assistantModel` = sonnet, effort low, no tools, no MCP,
    no session saved, `--setting-sources project` from the empty folder
    `%LOCALAPPDATA%\word-page\assistant`, so your hooks do not run; your
    global CLAUDE.md is still read, cached). The answer is a fixed JSON form
    (`--json-schema`): exact old words, new words, kind, reason. Only
    suggestions whose old words are plain text found once in the paragraph
    are kept. They go to the page in `word-page-assistant.css` next to
    Quarto's index.js (like the page ends); `inject/assistant.js` reads it
    every 2 s and draws in a layer of its own on top of the page, never in
    Quarto's editor. Accept selects the old words and types the new ones
    (`execCommand("insertText")`), so Quarto takes it as typing: Ctrl+Z undoes
    it, the file is saved as always. After an Accept the other suggestions
    of that paragraph stay on the page at once (saved with `carried`), and
    the new text is still sent to Claude after the pause, so what the Accept
    brought in is checked too (16 Nov 2026, asked "make sure it rechecks"
    after an Accept had typed "30--39"; `results.answered()` = a real answer,
    `has()` = also the carried ones). Decline is remembered by the page
    (localStorage) twice: the pair of old and new words, and since 16 Nov
    2026 also the old words alone (`wp-assistant-declined-words`), because
    on every recheck Claude came back with other new words for the same
    old words ("Finally we ask ourselves, does" got four different
    proposals, "i just declined this proposal dont show it again"). A later
    proposal is hidden when its old words are the same as declined ones,
    or mostly overlap them (the shorter inside the longer and at least 60%
    of its length, so a small spelling fix inside a declined sentence
    still shows). Each paragraph text is asked about once.
  - **Real dashes** (16 Nov 2026): "--" is Markdown for a dash, but typed on
    the page it stays two hyphens. SYSTEM asks for – and — (never "--" or
    "---"), and `prepare` turns "--"/"---" in the new words into – and —
    anyway (unless the old words had "--" themselves). Tests: `test.js`,
    "real en dash".
  - **The text around it** (16 Nov 2026, after a rewrite that read badly with
    the sentence after it: "you always need to take into consideration how
    your changes affect the sentences around them"). Claude gets the
    paragraph to check between the paragraph before and the one after it
    (`messageFor` in `assistant.js`), as context only: suggestions stay
    inside the paragraph to check, and the instructions say every change
    must fit the sentences around it (no broken links, no colon or "they"
    left pointing at nothing). A saved answer is not asked again when only
    a neighbour changes. Tests: `test.js`, "paragraph before and after".
  - **Sources and references** (16 Nov 2026, asked: "also if I mess up typing
    sources or inline references"). Every request also gets the document's
    sources (the `.bib` file(s) of its header, one line each: key | author
    year | title) and its outline (numbered sections as the PDF numbers
    them, figures, tables). Claude then flags (purple, "Source"): a key not
    in the list (with the right key), broken citation syntax, "(source)",
    "(datum)" and hand-typed references (with a `[@key]` when one source
    clearly fits, else a remark with only Decline), and references to a
    section, figure or table that does not exist. Accept of new words with a
    citation: typing cannot make one (Quarto keeps typed `[@key]` as text,
    `\[\@key\]` in the file; tried 16 Nov, also one letter at a time and as
    a paste), so the page builds it as Quarto's Insert > Citation does: text
    with the marks `cite` (the whole `[...]`) and `cite_id` (each `@key`),
    put in by Quarto's own editor in one step (Ctrl+Z undoes it). That
    editor comes from the hook in Quarto's `setMarkdown`, which now also
    hands over `this` (`changedSince(this.state, this)`, kept as
    `sync.core`). `window.wordPageAssistLog` says why such an Accept did not
    happen. Saved answers carry a version (`ANSWER_VERSION`), so answers of
    an older version are asked again.
  - **Notation** (16 Nov 2026, asked: "yit ... propose the proper way to type
    it so that it shows as the outcome of the model"): the outline also
    holds the document's equations (`$$ ... $$`), and a symbol typed as
    plain letters in the text (yit, Ti, a lone i or t) gets a suggestion to
    write it as inline maths the way the equations do (`$y_{it}$`, `$T_i$`,
    `$i$`), kind "Notation" (teal). Accept builds real inline maths as
    Quarto's maths button does: the text `$...$` with the mark `math` of type
    `InlineMath`, put in by Quarto's editor like a citation (both are
    "rich" suggestions; tested in the bench: the file then has `$y_{it}$`).
  - **Claude's edits** (16 Nov 2026, asked: "underline the rows you added or
    changed, with a little window like the suggestions that shows what you
    changed, and a switch to turn it off or on"). A change of a `.qmd`/`.md`
    that comes from the disk (a Claude edit: the file already has the new
    text when VS Code sees it) is compared with the text before:
    `changesBetween` in assistant.js, lines first (empty lines left out,
    each new line paired with the old line most like it, at least 40% the
    same words), then word by word; each run of changed words is one mark
    (at least 8 letters, else the words around it are taken in). The marks
    are kept 7 days in `globalStorage\local.word-page\assistant-edits.json`
    and shown while their new words are in the document: a light amber
    background with an amber line, card "Claude edits · 3 min ago"
    with the old words struck through → the new words, a green **Accept**
    (Claude's words stay, the mark goes, remembered by the page) and a white
    **Decline** (puts the old words back on the page, so Ctrl+Z gives
    Claude's words back; not offered for bold, code or a key alone inside a
    citation). Tested in the bench: three marks for a word change, a new
    paragraph and a shortened sentence, the old Undo (now Decline) changed
    page and file back, the switch and the old Keep (now Accept) work.
  - **A Decline stays declined** (16 Nov 2026, "i just declined a claude
    edit proposal ... and now it came back"). The keep check in
    `extension.js` (a page write that lacks a change just read from disk
    gets that change merged back) took the Decline for such a missed
    change and put Claude's words back. Now `onlyDeclined` in
    `assistant.js` first asks: does the page have the rest of the change,
    with only some of its marks back to their old words? Then it is a
    Decline and is left alone (log: "keep: ... put old words back with
    Decline, left as it is"). When every mark of a change is declined, it
    cannot be told from a missed change, so it is merged back as before:
    then use Ctrl+Z, or ask Claude. Tests: `test.js`, "keep: a Decline".
    **18 Nov 2026** (asked: "claude edits or grammarly proposals I had
    already declined or accepted came back"): when the page's text is
    exactly the text from before Claude's change, it is now also left alone
    (log: "keep: ... put all old words back (Decline or Ctrl+Z); left as it
    is"). A page that missed the change writes nothing until you type, and
    then its text has your typing in it, so it is never exactly the old text.
    Found at the same time: since 17 Nov 00:28 the line break before
    `const savingSince` in `extension.js` was gone, so `savingSince` did not
    exist and every change from the page stopped with "ReferenceError:
    savingSince is not defined" (1,142 times in exthost.log). The whole keep
    check was off. Fixed, and checked on the bench: no error after typing.
  - **The same buttons on every card** (16 Nov 2026, asked: Claude's edits had
    a green Undo and a white Keep, the suggestions a green Accept and a white
    Dismiss, "which is confusing"). Now every card has a green **Accept** =
    what Claude proposes or did stays, and a white **Decline** = it goes.
    Each button says what a click does in `data-do`: "apply" puts the card's
    words in the text (Accept of a suggestion, Decline of an edit), "close"
    only takes the mark away (Decline of a suggestion, Accept of an edit).
    The colour comes from the class `wp-green`, not from what the button does.
  - **Accept all in this chapter** (16 Nov 2026, asked: "accept all claude
    edit in chapter 2"). The card of a Claude edit gets a third, green button
    "Accept all n in this chapter" when its chapter has 2 or more Claude
    edits shown. A chapter = from a `#` heading (`h1.pm-heading` on the
    page) to the next one (`chapterOf`, `editsInChapter`, `acceptChapter` in
    `inject/assistant.js`). It does an Accept on each: the marks go, the text
    stays. Tested in the bench: 4 marks in chapter 1 accepted, the mark in
    chapter 2 stayed.
  - **Accept all in a selection** (16 Nov 2026, asked: "if I select a part
    of the text i can get a button saying accept all in selected area").
    Select text on the page: when the selection touches Claude edits, a
    green button "Accept all n Claude edits in selection" shows under it
    (`editsInSelection`, `showSelectionButton`; it follows `selectionchange`
    and every redraw). Only Claude edits: the marks go, the text stays.
    Grammarly suggestions are not touched (accepting those would change the
    text). Tested in the bench: one paragraph selected, its mark went, the
    mark of the next paragraph stayed.
  - **Declined stays declined** (16 Nov 2026, asked: "dont want to see the
    same proposal again if i declined it once"). A suggestion's id holds the
    whole paragraph, so after any other change in that paragraph (also an
    Accept, which makes Claude read it again) the same proposal came back
    with a new id. Decline now also remembers the change itself, old words
    → new words in lower case (`changeKey`, localStorage
    `wp-assistant-declined`, the last 2000), and that change is hidden in
    every paragraph from then on. Claude edits are not affected. Not tried
    in the bench (needs real suggestions from Claude); same storage as the
    per-card Decline.
    Same evening, asked again ("still getting grammarly suggestions i
    already turned down a minute ago"), the saved answers showed why: Claude
    flip-flops (after "come from" → "comes from" was accepted it proposed
    "comes from" → "come from"), it repeats a proposal with other
    punctuation, and declines made before the memory existed were kept by
    id only. Now `changeKey` ignores punctuation, an Accept also remembers
    the way back (`blockWayBack`), and a suggestion declined the old way is
    added to the memory when it shows again (`assistFind`). Checked: the
    page's storage survives closing and opening the page (bench: same
    origin, value still there). Offline check of the keys on his real
    examples: flip-flop blocked, comma ignored, other changes not blocked.
  - **Decisions are no longer lost between pages** (18 Nov 2026, asked:
    proposals "already declined or accepted ... came back"). All of
    Quarto's pages share one localStorage (VS Code gives a custom editor
    one fixed origin, the same in every window). Each page read the lists
    once when it opened and then wrote its own whole copy back, so with two
    pages open (two tabs, two windows, a page reopened with Ctrl+Numpad9)
    the page that wrote last wiped the other's decisions. Now
    `addToStored` reads what is stored, adds the new item and writes the
    union, and a page takes in another page's decisions at once (the
    `storage` event). The lists keep the last 5000. **An Accept is
    remembered for good too** (`dismiss`): before, it was hidden for 6 s
    only, and when the add-on's list still had it after that, it came back.
    Bench, two pages open: a decision stored by page A was still there
    after an Accept on page B (with the old code it was wiped).
  - **A click on a line no longer throws you out** (16 Nov 2026, asked: "if i
    click on the grammarly stuff it sometimes clicks me out of it and moves
    my cursor to another place"). The card was chosen at the click (button
    up). When the words were in or next to a citation, the button going down
    had already put the cursor in the citation, which turned "(Author, 2020)"
    into "[@key]" (`drawCites`), so the text jumped, the click missed the
    words, the card closed and the cursor sat in other text. Now the card is
    chosen when the button goes down (`markAt`, `pressed`), and on words that
    touch a citation, maths or a table line (`touchesJumpy`) the cursor stays
    where it was (the button-down is stopped before the editor sees it). On
    plain words the cursor goes there as always. A drag that starts on a line
    opens no card. Bench test with real mouse clicks: on a mark over a
    citation the card opened and the cursor stayed, on plain words the card
    opened and the cursor went to the word, the editor kept the keyboard.
  - **Source check notes in grey** (16 Nov 2026, asked: "change the font of
    the source check text, it is getting hard to distinguish the notes from
    the real text made by me"). Every "(SOURCE CHECK: ...)" up to its own
    closing bracket (never past the end of its paragraph) is drawn in grey
    letters on a light grey background, through the browser's highlight
    feature (`CSS.highlights`, `::highlight(wp-source-check)`, in
    `inject/assistant.js`, `highlightSourceChecks`). The text in the file
    and on the page is unchanged, the PDF prints the notes as normal text.
  - **The switches** at the top right of the page (16 Nov 2026, asked), under
    each other: **Grammarly** (the suggestions) and **Claude edits** (Claude's
    edits, named so on 16 Nov), each with its count; green = shown in the
    text, red = hidden (Claude keeps reading). The page remembers both. Names
    and the layout (one under the other) as he asked.
  - The answers live in the add-on's own folder of this VS Code
    (`globalStorage\local.word-page\assistant-answers.json`; a test copy of
    VS Code has its own), and every save takes in what other VS Code windows
    wrote, so windows do not wipe each other's answers.
  - Not sent: the header, headings, code, maths, tables and their captions,
    paragraphs under 6 words, and changes that come from the disk (Claude's
    edits: the file on disk already has the new text; typed text is saved
    0.1 s later, `files.autoSave`).
  - Tested in the bench (Quarto 1.139, 16 Nov 2026) on a test file and on a
    copy of first_draft.qmd: lines in the right place (justified PDF look,
    across a line break, next to page ends and citations), card, Accept from
    the card and from the list (file on disk changed, citations untouched),
    Ctrl+Z, Decline (then still called Dismiss). Finding the words again after each keystroke takes
    about 5 ms on the whole paper. Log lines `assistant: ...` in
    `%TEMP%\word-page.log` (times in UTC).
- **Spelling: Claude, not Quarto** (16 Nov 2026, asked: "january should be
  January, aging should be ageing ... turn off the spell checker and let
  Claude take over"). `"quarto.visualEditor.spelling": false` in
  settings.json switches Quarto's own spell check (thin red lines, its
  dictionary) off; Claude's suggestions (above) check every word, capital
  letters and British spelling, kind "Spelling" (red), each word on its own,
  Norwegian names and terms left alone. Saved answers from before were
  asked again (`ANSWER_VERSION` 3).
  Earlier the same day, for Quarto's spell check, the add-on had a
  right-click fix and its own suggestion ranker (`inject/spell.js` with a
  list of 50,000 English words, 90% right first time against Quarto's 78%
  on Wikipedia's list of common misspellings); both were taken out when
  Quarto's spell check went off. To turn Quarto's spell check back on: set
  `quarto.visualEditor.spelling` to true (British: `spellingDictionary`
  `en_GB`; Quarto has no Norwegian).
- No word count in this editor. The length of a paper is read from the PDF
  (Ctrl+Shift+K).
- What works on the page, checked in the bench on 12 Nov 2026 with the term
  paper: Ctrl+Numpad5 from a paragraph, a table cell, a caption, a heading
  and a list item (right lines every time); the formula; Find and Replace
  (Ctrl+F); the outline (the button with three lines, top left); Insert
  Citation (Ctrl+Shift+F8) with the `.bib` file and Zotero; `@` and the
  first letters of an author gives the list of keys. Not checked: running a
  code chunk from the page.
- After a change to the add-on the open page keeps its old look: close the tab
  and open it again.

**Files** (`VS Code\local.word-page-0.1.0\`): `extension.js` (the commands, the
first-`.qmd` rule, when to patch, watching the PDF), `patch.js` (finds Quarto,
puts the blocks in or takes them out, writes `word-page-pdf.css`; no VS Code in
it), `inject\` (the script block with the title block, folding and page ends,
the style block `word-page.css`, the PDF look `pdf-look.css` with its
`fonts\`, the 889 colours), `pdfpages.py` (from a PDF: the first lines of
every page, the citations as printed, pictures of the tables, figures and
reference list), `mention.js` (finds the lines of a highlighted text
in the `.qmd` file and builds the reference for Claude; no VS Code in it),
`typing.js` (writes the typing marks the Claude hooks read, 13 Nov 2026),
`merge.js` (the three-way merge; patch.js copies it into the script block),
`test.js` (118 offline checks of `patch.js`, `mention.js`, `typing.js` and
`merge.js`, among them 3000 random merges and 2000 random typing bursts),
`build.ps1` (runs the checks, packs, installs; VS Code switches a newly
installed add-on on in the open windows by itself; a changed add-on needs
Reload Window).

**Highlighted text to Claude: Ctrl+Numpad5 on a page** (11 Nov 2026).
Highlight text on the page, press Ctrl+Numpad5: the Claude side panel takes
the keyboard and its chat box gets a reference such as
`@paper/draft.qmd#23-25 "Norway forgives part of ... in rural municipalities."`:
the file, the lines of the highlighted text in the `.qmd` file, and the text
itself as a short quote (all of it up to 60 characters, else its first and
last four words). Claude then reads those lines. Nothing highlighted: the key
only goes to the chat box, as before. In a normal file the same key does this
through the Claude add-on itself (section 4).

How it works. VS Code cannot see what is highlighted on a page, and the
Claude add-on has no command that takes a text, so the text travels over the
clipboard (`selectionToClaude` in `extension.js`):

1. The command copies what is highlighted (`editor.action.clipboardCopyAction`).
   For that one copy, the script block on the page puts the highlighted text
   on the clipboard together with the 300 characters before and after it.
   It knows the copy is ours because Ctrl+Numpad5 was pressed on the page in
   the last 3 seconds (the key is named in `inject\word-page.template.js`:
   `CLAUDE_KEY`; change it there too if the key ever moves).
2. `mention.js` looks the text up in the file by its letters and digits only,
   because the page shows it without the markdown marks (`**bold**`, a link
   address, a footnote). The characters around it tell two equal pieces apart
   (the word "scheme" five times in the paper). A link, footnote or formula
   inside the highlight: it finds the start and walks to the end. No sure
   place: the reference comes without line numbers, never with a guess.
3. The command goes to the Claude panel, waits 0.15 s for the chat box to
   take the keyboard, and pastes the reference
   (`editor.action.clipboardPasteAction`).
4. The clipboard is put back as it was.

Things to know.

- The clipboard is only touched when something is highlighted. It is put
  back as text: a copied picture or file is lost then. With Windows'
  clipboard history on (Win+V), the reference shows up in that list.
- The first time in a VS Code window, with the Claude panel closed, the
  reference comes after 3 seconds: the chat box may have to start first, and
  the add-on cannot see whether it has (measured in the bench: a chat box
  that was never open does not take the keyboard by itself). With the panel
  open, and every later time, it is there at once.
- A file with unsaved changes is saved first (Claude reads the file on disk,
  so the line numbers must be those). With autosave on, nothing to notice.
- Should the paste ever land on the page instead of in the chat box, the
  script block stops it: a paste that starts with `@`, within 10 seconds
  after the key, does nothing on the page.
- The message "close this document tab and open it again" means the page was
  opened before the add-on had put its script block in (after a Quarto
  update, or right after a change to the add-on).
- A Claude chat that is open as a tab does not get the reference: it goes to
  the side panel only (since 18 Nov 2026 also from a normal file). For a chat
  tab, press Ctrl+Numpad1 instead (below).
- One line per key press in `%TEMP%\word-page.log` (what was found, what was
  pasted, how long the copy and the panel took). Read that first when it
  "does nothing".

**Highlighted text in the built-in browser: Ctrl+Numpad5 in the macro Tutor**
(14 Nov 2026, his wish: "highlight something in the exam tutor, press Ctrl 5,
go to the side panel"; it replaces the Tutor's button "Send to Claude chat
(VS Code)", which copied and left the pasting to him). Highlight text in the
Tutor tab (Ctrl+Numpad3), press Ctrl+Numpad5: the Claude side panel takes the
keyboard and its chat box gets "I selected this in my ECON4310 Exam Tutor
(where) ... the piece ... its card ... My question: ", so he types his question
straight after it.

How it works. VS Code cannot copy out of its built-in browser (its copy
command only works on VS Code's own window), so the page does the copy:

1. The browser tab passes Ctrl+key presses on to VS Code (its
   `preload-browserView.js`, in every frame, also inside claude.ai's frame),
   but the page sees the key first. The Tutor's keydown handler
   (`Study tool/build/tutor/engine_ask.js`, H26 project) puts the text on the
   clipboard at once, after a first line `[to Claude chat]`.
2. `wordPage.browserToClaude` (Word Page add-on, `extension.js`, part 4b)
   waits up to 0.4 s for a clipboard that starts with that line, writes it
   back without the line, and pastes it into the chat box the same way as the
   Word Page does (`pasteInChatBox`: the 3-second wait the first time, 0.15 s
   before the paste).
3. Nothing highlighted, or another web page: nothing comes, and the key only
   goes to the chat box (after 0.4 s).

Unlike on the Word Page, the clipboard is not put back: it keeps the pasted
text (the page cannot read the old clipboard). One line per press in
`%TEMP%\word-page.log` (`browser: pasted ... characters` or `browser: nothing
came from the page`). A Tutor tab opened before 14 Nov 2026: Ctrl+R in it
first. Another web page can take part by putting text after the same first
line on the clipboard when Ctrl+Numpad5 is pressed.

**Highlighted text in the Claude panel: Ctrl+Numpad5 in the side panel**
(14 Nov 2026, his wish: "select stuff in the side window, Ctrl 5, and ask
further about that"). Highlight a piece of an answer in the Claude side
panel, press Ctrl+Numpad5: the piece comes into the chat box as a quote
(each line starts with `> `, then an empty line), with the cursor after it.

How it works (`wordPage.chatSelectionToClaude`, `extension.js` part 4c). The
key only reaches this command while the panel has the keyboard
(`focusedView` is the Claude view: `claudeVSCodeSidebar` in the left side bar,
`claudeVSCodeSidebarSecondary` in the right one). VS Code's copy command
copies from a webview panel that has the keyboard (its "webview" copy
handler). To tell "nothing highlighted" apart, the clipboard first gets a
probe text: still the probe after 0.4 s = nothing copied, and the key only
goes to the chat box, as before. Otherwise the quote is pasted with
`pasteInChatBox` and the clipboard is put back as it was (text only). Since
18 Nov 2026 a highlight in a Claude chat **tab** works too (keybinding
`activeWebviewPanelId == 'claudeVSCodePanel'`): Ctrl+Numpad5 quotes it into
the side panel, Ctrl+Numpad1 into a chat tab. Log lines start with `chat:` in
`%TEMP%\word-page.log`.

**Highlighted text to a Claude chat tab: Ctrl+Numpad1** (18 Nov 2026, his
wish: "a shortcut that moves focus to a Claude chat in one of the editor
windows, with all the info about what is selected, as Ctrl+Numpad5 does for
the side window. It can never go into the side window"). Every Ctrl+Numpad5
entry in keybindings.json has a Ctrl+Numpad1 twin with `"args": { "target":
"tab" }`, the plain one being `wordPage.toClaudeTab`. The commands read that
argument (`targetOf`): `"tab"` goes through `goToChatTab`, which never opens
the side panel. In `extension.js` part 4: `pickChatTab` chooses the tab in
this order: a chat tab in front in another editor window than the one with
the keyboard, then one in front in this window, then one behind another tab
in another window, then one behind the file in this window. Several in one
step: the one that had the keyboard last (`chatTabUsed`, kept from the tab
events). A chat tab is a webview tab whose view type contains
`claudeVSCodePanel`. `focusTab` gives its editor window the keyboard and
brings it to the front (`workbench.action.focus<N>EditorGroup`, then
`openEditorAtIndex`, as the Claude add-on does for a tab it reopens), and
the chat box then has the keyboard: paste after 0.15 s. No chat tab at all:
`claude-vscode.editor.open` with the text as its 2nd argument (Claude puts it
into the new chat box with `setInputText` once the box has started, it is
**not sent**) and the 5th argument `true`. Without that 5th argument the
command also switches Claude's preferred place from side panel to tab
(`setPreferredLocation("panel")`), as Ctrl+Numpad7's note says. The new tab
goes into another editor window, or into a new one beside. Log lines in
`%TEMP%\word-page.log`: `editor:` (a file), `tab:` (no highlight), and the
usual `claude:`, `browser:`, `chat:` with the tab they went to. Checked in the
bench on 18 Nov 2026 (11 cases: tab in front in the other window, hidden in
the other window, hidden in this window, two tabs, no tab, no highlight, side
panel open beside, quote from the side panel to a tab and from a tab to the
side panel, Ctrl+Numpad5 with a tab visible now only in the side panel).
**Not checked in the bench: the Word Page.** On the UiO computer the bench's
Quarto finds no Quarto program (CLI), so it opens no page. The page path
uses the same code as the checked ones, and the page script reacts to both
keys (`CLAUDE_KEYS` in `inject\word-page.template.js`). A page opened before
the update: close the tab and open it again. One bench run also showed the
quote from the side panel go only to the tab, without the text, when the key
came at once after a click from a chat tab into the side panel (VS Code had
not yet noted where the keyboard was). The second try worked.

**Test bench for Claude** (`bench\`). Claude cannot see the screen, so it
tests in a second VS Code that nobody sees: `bench\launch.ps1` copies VS
Code, Quarto and this add-on to `%TEMP%\word-page-bench` (1 GB, once), starts
it with its own settings and opens a sample paper; `bench\cdp.py` (plain
Python) takes screenshots, clicks, types and reads the page through the
debugging port. That is how the look, the Insert menu, the Zotero dialog,
typing a heading, `@` completion and saving were checked on 11 Nov 2026.
With `-Claude` the bench also gets the Claude Code add-on and the real
`keybindings.json`; `cdp.py key Numpad5 ctrl` presses the key and
`cdp.py claude file.js` reads the Claude chat box. That is how Ctrl+Numpad5
on a page was checked (16 cases: panel open, closed, never opened; a word
that is there twice; a highlight over two paragraphs; normal copy and paste).
**Rule (11 Nov 2026): a test window never takes the keyboard from your own
VS Code window, and is closed when the test is done.** A start on the normal
desktop did take it for a moment. Since the evening of 11 Nov 2026 the bench
therefore runs on **its own Windows desktop**, "WordPageBench": a second,
invisible desktop of the same login (`CreateDesktop`, and `CreateProcess`
with that desktop's name). A window there is never on the screen and cannot
take the keyboard of the real desktop; the desktop is gone when the bench is
stopped (`launch.ps1 -Stop`). Everything that touches the bench window is
started on that desktop: the start, `-Open` and `-MoveOnly` (sizing: the
script runs itself again there, because a window can only be reached from
its own desktop). The script prints whether the same window has the keyboard
before and after a start; in five starts it never changed. `-AllowFocus` is
gone. Two more things found that evening: the folder must come **first** on
VS Code's command line (at the end it was read as the value of the option
before it, the window had no folder open, and the page then shows no
pictures from outside the document's own folder); and the window to size is
looked up by its title (the "main window" that PowerShell reports was one
without a title). **12 Nov 2026: the bench took over `vscode://` links.** At
start-up every VS Code on Windows makes itself the program for `vscode://`
links (`HKCU\Software\Classes\vscode\shell\open\command`). The bench copy did
that too, so from then on a `vscode://` link, which Claude Code uses, started
the bench copy with his own settings, and Claude would not open in his H26
window. Fixed by pointing the link back at
`%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`. `launch.ps1` now does
that itself after every start and every `-Stop` (`Restore-UrlHandler`).
**13 Nov 2026: that fix did not hold, Claude again would not open in the H26
window.** The bench copy had also written itself into the **taskbar list of
recent folders** (right-click on the VS Code icon; Windows keeps that list
per program name, `win32AppUserModelId`, and the copy had the same name as
the real VS Code). A click on "H26-Data Science" in that list started the
copy (1.145.2) with your own settings next to the real VS Code (1.146.0),
and that copy wrote the list and the `vscode://` link again. Fixed at the
root: the copy now has its **own names** in its `product.json`
(`urlProtocol` = `vscode-wordpagebench`, `win32AppUserModelId` =
`WordPageBench.VSCode`, next to its own lock name), set by `launch.ps1` at
every start, so it can no longer take the link or the list. The wrong list
(`%APPDATA%\Microsoft\Windows\Recent\CustomDestinations\1ced32d74a95c7bc.customDestinations-ms`)
was removed; the real VS Code writes a new one when a folder is opened.
`launch.ps1` also removes that list at every start and `-Stop` when it names
the bench copy (`Restore-TaskbarList`). **If a window ever behaves strangely
again (Claude does not open, empty logs), run `scripts\check-vscode.ps1`
first** (`-Fix` repairs). It checks four things: the `vscode://` links
start the real VS Code, the taskbar list starts the real VS Code, no
copy of VS Code runs with your own settings (a copy without its own
`--user-data-dir`), and (since 18 Nov 2026) no VS Code window is empty. For
the last one it draws each window into a picture (works also on a locked
screen) and an empty window has at most two colours. `-Fix` closes an empty
window only when another VS Code window still shows content; Claude chats
that were in it stay saved and `/chats` opens them again. Cause that day: a
floating window (Claude chats dragged out or "Open in New Window") came
back empty after Reload Window, a VS Code fault. Section 6, point 7 of the
R extension list says why the data viewer had landed in it. The rule for every test copy of VS Code, also a future
one: its own `--user-data-dir` and its own names in `product.json`. This is
also written in `~/.claude/CLAUDE.md` and in `/personalsettings`.
**16 Nov 2026: he had to sign in to GitHub in VS Code again and again.**
VS Code keeps logins (GitHub, Copilot) in `~\.vscode-shared\sharedStorage\state.vscdb`,
a folder named by `sharedDataFolderName` in `product.json`, the same for
every copy even with its own `--user-data-dir`. The bench copy has its own
encryption key (`Local State` in its own data folder), could not read his
GitHub login there and dropped it (the store had no `github.auth` left; the
bench last ran on 13 Nov, and from then on every start said "Got 0
sessions"). Fixed: `launch.ps1` also gives the copy its own
`sharedDataFolderName` = `.vscode-wordpagebench-shared` (the existing copy in
`%TEMP%\word-page-bench` was changed the same day). His login after the
sign-in of 16 Nov: `secret://...github.auth` in the real store. The other
traps are written at the top of `launch.ps1` (a waiting VS Code update blocks
a second VS Code, hence the copy; Quarto's one-time question; Quick Open only
finds files opened before). For the page look there are three more probes in
`bench\js`: `nodes.js` (which tags and classes the page is built of),
`theme.js` (the rules Quarto writes itself, how a picture gets its width,
whether words can be broken) and `gaps.js` (the page measured in PDF points).
Since 12 Nov 2026 also `divs.js` (the `:::` blocks on the page and their
classes), and in `cdp.py`: `dblclick x y` (selects a word), `drag x1 y1 x2 y2`
(selects the text in between) and `typekeys "text"` (one real key press per
letter, so the `@` list of citations opens). `bench\gen.py` makes `inject\light-theme.json`
again from a dump of the theme colours (`bench\js\dumpvars.js`, taken in the
bench under a light theme). If the page look breaks after a Quarto update
(they renamed a box): `bench\js\layout.js` prints the boxes and their rules;
the style block uses `#editor`, `.ProseMirror > .body`, `.pm-content` and
`.fui-Toolbar`.

## 6. R extension (reditorsupport.r) gotchas

- The R extension is **pinned** since 1 Nov 2026 (`"pinned": true` in
  `C:\Users\<you>\.vscode\extensions\extensions.json`; same as Extensions view
  → gear on R → Auto Update off). Every self-update broke the Workspace panel
  until `sess` was reinstalled and undid the data viewer patch, in the middle
  of a study session. Update it by hand between units: Extensions view → R →
  Update, then say yes to the `sess` prompt in a new R terminal, run
  `perl patch-r-extension.pl`, Reload Window.
- "Nothing runs any more": Ctrl+Enter now refuses unfinished statements
  (section 5), so this should be rare. If it still happens, the R terminal
  shows `+` instead of `>` from an earlier unfinished statement: click in it,
  Esc, run again.
- After the extension updates itself, the Workspace panel can stay empty: it
  needs its helper package `sess` reinstalled in
  `%APPDATA%\Code\User\globalStorage\reditorsupport.r\sess\...`. It asks for
  consent in the R terminal; say yes. If no prompt appears, run in the R
  terminal: `source(file.path(dirname(Sys.getenv("VSCODE_R_SESS_ATTACH_HELPER")), "profile.R"))`
  and read the message.
- "Failed to connect to IPC endpoint" = the terminal is a leftover from before
  a restart. Kill it, Ctrl+Alt+R. Since 18 Nov 2026 the Enter add-on closes
  such a leftover and starts a fresh R terminal by itself (section 3, the
  table "Everything comes back after a restart").
- "object x not found" for a column name, right after Ctrl+Enter: look at the
  line after the `>` prompt. If it starts mid-pipe (`filter(...)`), only part
  of the statement was sent: a selection that did not start at the first
  line. Fixed by the Enter extension (section 5); if it still happens, the
  extension did not load: Reload Window, then check the log.
- "R Interactive" panel in the sidebar = experimental, Windows unsupported.
  Ignore it (right-click → Hide).
- The data viewer is a snapshot. `watch.R` (section 2) makes it live: every
  open viewer tab refreshes after the next command in which the object it
  shows changed. Since 2 Nov 2026 that includes value previews (a number,
  a text, a vector, a list opened from the Workspace panel), not only
  tables. If the object changes kind, the tab follows as far as it can: a
  table tab whose object became a value shows the value as a one-column
  table; a value tab whose object became a table shows a one-line note and
  the table opens in its own tab (close the old one). Functions are not
  followed. `watched()` lists the open tabs. After changing `watch.R`: run
  `watch-test.R` (`R\` in this folder, see its header), then re-source
  `watch.R` in the running R terminal (Ctrl+Enter on the `source(...)`
  line of the unit, or Ctrl+Alt+R for a new terminal).
- Eight things in the R extension are changed by editing its code
  (`VS Code\patch-r-extension.pl` in this folder; the originals are kept next
  to them as `extension.js.orig` and `webviews\httpgd\index.js.orig`). The R
  extension overwrites them when it
  updates itself (the folder `reditorsupport.r-x.y.z` gets a new version
  number): run the script again, Reload Window. It reports each fix as
  "applied" or "already in place"; "code not found" means the extension
  code changed and that fix needs redoing by hand.
  1. The data viewer stretches columns to fit the window (long text cut
     off). Patched: every new viewer tab opens with columns sized to
     content; the two toolbar buttons in the tab still switch per table.
  2. The session completion popup with column names (inside a pipe, e.g.
     `rename(look = lookout, |)`) came right after the comma, so the space
     he types next closed it again. Patched 2 Nov 2026: it comes after
     `, ` (comma space) instead. Since 18 Nov 2026 also after `= `, `== `,
     `< `, `> `, `& `, `| ` and `%in% `, so `mutate(x = |)` and
     `filter(year == |)` list the columns of the data frame the pipe starts
     from (the R extension finds that name itself, also on a new line inside
     `mutate(`, and in `ggplot(aes(x = |))` after a pipe. Tested offline on
     18 Nov 2026). It needs a running R terminal that knows the data frame
     (run the line that makes it first). The popups after `(`, `[`, `$` and `@`
     are unchanged; so is the language server (its popups come after `.`
     and `::`, and while typing a word).
  3. Knit: a knitted PDF opens in the editor to the right of the `.Rmd`,
     the cursor stays in the `.Rmd` (10 Nov 2026, section 6b). The R
     extension knows the output path only after knitting, so this is the
     one place where "open it beside" can go; `openOutputFile` would open
     it in the same editor window as the `.Rmd`.
  4. Plots (11 Nov 2026): a new plot (`print(p)`, `plot(x)`) brings the
     **R Plot** tab to the front in its editor window (the one beside the
     script, setting `r.session.viewers.viewColumn` → `plot` = `Beside` since
     18 Nov 2026, see point 7), also when a PDF
     or a data tab was in front there. The cursor stays in the script. The R
     extension itself only did this when the tab was closed: an open tab
     behind another one got the new plot without coming forward. Only a plot
     id httpgd did not have before counts, so a redraw after resizing the
     window does not pull the tab forward.
  5. Plots (11 Nov 2026): **Ctrl+wheel or a touchpad pinch zooms the plot**
     7.5% per step around the spot under the mouse, as in the PDF viewer
     (section 6b) and VS Code's PNG preview. Zoomed in, the wheel (or a
     sideways touchpad swipe) or dragging with the mouse moves the plot; a
     double-click zooms back out; a new plot starts unzoomed. It is a separate
     block at the end of `webviews\httpgd\index.js` (the plot tab's own page),
     so it only depends on the box `#largePlot` there. The plot is an SVG: while
     zooming it is only stretched (instant), 250 ms after the last step it is
     drawn sharp once, which matters for the big maps. This zoom is not the
     toolbar's magnifier buttons: those redraw the plot in R with bigger text.
     21 checks in headless Edge on 11 Nov 2026 (step size, spot under the
     mouse kept, edges, pan, double-click, new plot, drag bar under the plot
     still works); the original code fails 11 of them. A plot tab reads the
     patched page when it opens: close the R Plot tab and plot again.
  6. **Ctrl+click on a name opens it in the data viewer** (18 Nov 2026), when
     the name is an object in R's global environment (a table, a value, a
     list, a function: everything the Workspace panel lists). It runs the
     panel's own eye-button command (`r.workspaceViewer.view`), so it is the
     same `View(get("rent", ...), title = "rent")` line in the R terminal and
     the same place: the editor group that already shows a data or plot tab,
     in any window, or else the one beside the script (point 7), made if it
     is not open, and an open tab of that
     object comes to the front. `watch.R` keeps the tab live as before. Other
     names (`filter`, `mutate`, a column after `$`, `dplyr::n`, words in a
     string or comment) keep Go to Definition from the language server.
     **A plot object** (class `gg`/`ggplot`, `recordedplot`, `trellis`,
     `patchwork`, `tmap`, or an `htmlwidget` such as leaflet or plotly) is
     not sent to `View()` but printed: `print(p)` goes to the R terminal
     (command `r.runCommand`) and the plot shows in the R Plot tab, which fix 4
     brings to the front (a widget shows in the viewer tab). The class comes
     from the R session's workspace data (`sess`, `get_workspace_data`).
     Added the same day, add-on v0.5.5, log line `plot p (Ctrl+click)`.
     Ctrl+hover still underlines the name, but no longer shows where it was
     made. How: the patch makes the R extension ask the Enter add-on (section
     5, command `rPipeIndent.ctrlClick`, v0.5.4) before its language server
     answers a definition request. VS Code asks twice, on Ctrl+hover and on
     the click. Only the click moves the cursor first, so a request within
     800 ms of a mouse click on the same name counts as the click: the add-on
     opens the viewer and answers "nothing" (VS Code then stays put, no
     message). Needs a running R terminal that knows the object (run the line
     that makes it first); without one, Ctrl+click works as before. The log
     gets a `view rent (Ctrl+click)` line, or an `ERR  view` / `ERR  ctrlClick`
     line. 19 offline checks in the add-on's `test.js`.
  7. **A new R tab joins the R tabs already open, else it opens beside the
     script** (18 Nov 2026). A new data viewer tab, R Plot tab or widget tab
     (leaflet, plotly) opens in the editor group that already shows one of
     those tabs, in any window, also a floating one on the other screen. A
     group with the same kind of tab wins (a plot goes to the plot tab's
     group before the data tab's group). An R tab in the script's own group
     does not count, so the script is never covered. The patch adds one
     function, `__rPreviewColumn`, at the top of `extension.js` and calls it
     where the R extension makes those four tabs (9 offline checks with a
     fake `vscode` module, 18 Nov 2026). An open tab of the same object still
     comes forward where it is, as before. Asked for after a Ctrl+click on
     `wwbi` opened in the main window while the floating window already
     showed a data tab. With no R tab open anywhere, the setting decides:
     `settings.json` sets `r.session.viewers.viewColumn` to
     `Beside` for `plot`, `view`, `viewer` and `helpPanel` (`browser` and
     `pageViewer` stay `Active`, the R extension's default). The default `Two`
     means "the second editor group", and VS Code counts the groups of a
     floating window too: with one group in the main window, group 2 was the
     floating window on the right screen. That day a Reload Window brought a
     floating window with two Claude chats back empty (grey, no tabs), and a
     Ctrl+click on `wwbi` put the data viewer in it, out of reach. `Beside`
     is worked out from the script's own group, so it is always in the main
     window. A script that is itself in the second group gets its viewer in a
     third group. An empty window is found by check 4 of
     `scripts\check-vscode.ps1` (section 5c, "Test bench for Claude").
  8. **Data viewer and R Plot tabs keep their place over a restart** (18 Nov
     2026). The R extension has no serializer for them, so VS Code dropped
     them at Reload Window, and a floating window holding only those tabs
     came back empty or not at all. The patch registers one for `dataview`
     and `RPlot` at the top of `extension.js` (`__rHolders`): such a tab comes
     back as a stand-in with its name and a note ("Run your script, then
     Ctrl+click wwbi again: it opens here"). The R session is new, so there is
     nothing to show yet. Point 7 counts the stand-in as an R tab, so the
     next data tab of that name, or the next plot, opens in its group and the
     stand-in closes 0.3 s later. A stand-in of another name stays until you
     close it. 11 offline checks with a fake `vscode` module, 18 Nov 2026.
- **The plot fits the R Plot tab** (18 Nov 2026, his wish: "automatically
  adjust to how big the editor window is"). `settings.json` sets
  `"r.plot.defaults.fullWindowMode": true`. The plot then fills the whole tab,
  width and height, and httpgd redraws it at the new size 100 ms after the
  tab changes size (dragging the edge between editor groups, moving the tab
  to the other screen). Without it only the width followed the tab: the
  height stayed where the drag bar under the plot had put it. Full window
  mode hides the drag bar and the strip of small earlier plots. The
  toolbar's full window button switches back for that tab, and the arrows
  in the toolbar still step through earlier plots. The setting is read when
  the plot viewer starts, so it applies from the next R terminal. The zoom of
  fix 5 works in both modes (it only needs `#largePlot`).
- Picking a function from the autocomplete popup inserts `f()` as a snippet;
  the Enter extension works inside it too (its activation rule must NOT
  contain `!inSnippetMode`).
- Each VS Code window has its own R terminal and Workspace panel. Working in
  two windows (two projects) is fine; one R session per window.

## 6b. Knit an R Markdown file to HTML (Ctrl+Shift+K), 10 Nov 2026

Ctrl+Shift+K (or the Knit button at the top right of an `.Rmd`) knits, as in
RStudio. Nothing in the settings needs changing; these are the things that
made "it doesn't make an HTML" on 10 Nov 2026:

- It runs in a **separate background R process**, not in the R terminal.
  What is loaded in the R terminal does not count: the file must load
  everything itself. `Rprofile.R` does not load `watch.R` there (not
  interactive).
- Progress: the Output panel, channel "R Markdown", opens by itself and shows
  one line per chunk (`2/32 [setup]`). A slow chunk shows **no progress**
  while it runs. A setup chunk that sources the whole pipeline sat on
  `2/32 [setup]` for 6 minutes (mostly drawing maps). That is not stuck:
  wait for `Output created: ...`. Pressing Ctrl+Shift+K again does nothing
  while it runs. **Cancel** in the "Knitting ..." box at the bottom right
  stops it (`terminating R process`, exit code 1). For a quick build, make
  the setup chunk read the saved results instead of rerunning the pipeline.
- An error shows in the same channel: the R error, then
  `Quitting from paper.Rmd:38-64 [setup]` (the chunk and its lines). The
  error is often in a script that the chunk sources, e.g. a renamed file or
  object. A saved copy of the channel, for Claude:
  `%APPDATA%\Code\logs\<newest>\window*\exthost\output_logging_*\*-R Markdown.log`.
- Where the HTML goes: **next to the `.Rmd`**, and VS Code does not open it
  (`r.rmarkdown.knit.openOutputFile` would open the HTML source in an editor,
  not the page, so it stays off). To send it to another folder, put this
  line in the file's YAML header; the R extension and RStudio both use it:
  `knit: (function(input, ...) rmarkdown::render(input, output_dir = "../../output", ...))`.
  The `...` passes on the format when you pick "Knit Rmd To All Formats"
  from Ctrl+Shift+P.
- **PDF, Overleaf style** (10 Nov 2026): when the first format in the YAML
  is `pdf_document`, Ctrl+Shift+K saves, knits and opens the PDF in the
  editor to the right (patch 3, section 6), with the cursor still in the
  `.Rmd`. The PDF viewer is the add-on `tomoki1207.pdf`; an open PDF tab
  reloads by itself when the file changes. The term paper
  (`paper_claude.Rmd`) has the `knit:` line above, so its PDF goes to
  `output/paper_claude.pdf`, about 25 seconds. No PDF appears: an error in
  the "R Markdown" channel, or the R extension updated and patch 3 must be
  run again. After a patch, the window must be reloaded once (Ctrl+Shift+P,
  Reload Window): the R extension reads its code only when the window starts.
  On 10 Nov 2026 the knit worked but no PDF opened for exactly this reason.
- **Zooming in the PDF** (version 3, 11 Nov 2026; versions 1 and 2 were
  10 Nov): Ctrl+wheel or a touchpad pinch. That is
  `VS Code\patch-pdf-viewer.pl`.
  - A **pinch follows the fingers** exactly. The **mouse wheel** zooms 7.5%
    per notch and glides there instead of jumping. The spot under the mouse
    stays under the mouse.
  - While zooming, the pages on screen are only moved and stretched (a bit
    blurry, but done by the graphics card): nothing is laid out and no page
    is drawn. 250 ms after the last movement the real zoom is set once and
    the pages are drawn sharp. Every page is shown where it will be then,
    so nothing jumps when it turns sharp: at most 2.4 px in 19 test cases
    (edges of the document, the landscape page, a one-page PDF, a fast
    spin of the wheel, scrolling during a zoom).
  - Why version 3: version 2 counted every small pinch event as a full 7.5%
    step, so one pinch ran to the maximum zoom. It also laid out all pages
    on every step and let pages be drawn in between. Same test for both (a
    pinch of 60 small steps in and 60 out, headless Chrome, one screen
    frame = 6 ms): version 2 had 11-13 frames over 20 ms and freezes of
    50-150 ms; version 3 has 0-1 and no freeze.
  - Still there: drawing a heavy map page sharp freezes the viewer for
    about 0.5 s (pages 4 and 7 of `test_mapfigures.pdf`); the add-on draws
    on the same thread as everything else. That now happens only after the
    zoom has stopped. Zoom again during it and the first frame can hang
    about 0.15 s; then the drawing is paused until the zoom stops again.
  - The mouse wheel zooms far too fast: the mouse sends many small steps
    (a smooth-scrolling wheel) and they are taken for a pinch. A step
    smaller than `SMOOTH_ZOOM_FINE` (30) counts as a pinch; the constants
    are at the top of the patched block in `lib\web\viewer.js` (and in the
    `.pl`).
  - Pages side by side, wrapped or horizontal scrolling (the viewer's Tools
    menu): the zoom is as smooth, but the pages can shift up to about 75 px
    when they turn sharp (the viewer centres them again).
  - Tested in headless Chrome only, with made-up wheel events; not yet
    measured inside VS Code with the real touchpad.
  - A PDF tab reads the patched code when it opens: close the tab and open
    it again. Old behaviour back after an add-on update: run
    `perl patch-pdf-viewer.pl` again. It always starts from the originals,
    kept as `lib\web\viewer.js.orig` and `lib\main.js.orig` in the add-on
    folder.
  - The add-on's own zoom, for the record: 33% per mouse notch, drifting
    away from the mouse (it first jumped back to an old scroll position),
    every page redrawn on every step, and no Ctrl+wheel for 1 second after
    normal scrolling.
- **After a knit the PDF stays where you were** (same page, spot and zoom;
  second fix in `patch-pdf-viewer.pl`, `lib\main.js`). The add-on reloads a
  changed PDF itself, but it kept the old pages and the old copy of the PDF:
  26 more pages inside the viewer after every knit (156 after 5), memory
  growing, and after the first knit page jumps went wrong (a clicked
  citation or cross-reference, the page number box: 887 px off in a test)
  and the position after a knit was lost (3300 px off). With the fix: always
  26 pages, flat memory, jumps right, position kept to 1 px.
- Testing the viewer without VS Code: Claude copies `lib\` to its
  scratchpad, serves it with a small Python web server and runs test pages
  in headless Chrome that send their results back (`--dump-dom` with
  `--virtual-time-budget` gives wrong timings: use real time). For the
  zoom: send `WheelEvent`s with `ctrlKey` (deltaY 1-5 = pinch, 100 = one
  wheel notch), time the screen frames, and compare each page's place in
  the last stretched frame with the first sharp one. In
  PowerShell `-match` ignores case, so a check for "END" also matched
  "pagerENDered": use `-cmatch`.
- `[WARNING] Deprecated: --mathjax` in the output is harmless (pandoc is
  newer than rmarkdown expects).
- Ctrl+Shift+V = R Markdown preview in a VS Code tab. It knits too, so it
  takes just as long.

## 7. Daily workflow

1. Open the project **folder** (File > Open Folder), not a single file.
2. Ctrl+Alt+R → R terminal.
3. Ctrl+Enter on the `library(...)` line (and `source("study/watch.R")` in the units).
4. Ctrl+Enter anywhere in a pipeline runs the whole pipeline.
5. Click a table or a value in the Workspace panel to view it; it stays up to date.
6. A yellow warning after Ctrl+Enter = a bracket or quote is not closed.
   Nothing was sent; fix the line it names and run again.

## 8. Any folder, any project

Everything above is user-level, so a new folder gets it without copying
anything: settings and keybindings (`%APPDATA%\Code\User`), the Enter
extension (`C:\Users\<you>\.vscode\extensions`), `.lintr` in the home folder,
and `watch.R` through the Windows user variable `R_PROFILE_USER`. The only
thing that can still switch R off in a new folder is VS Code's **Workspace
Trust**: a folder opened for the first time shows a "Restricted Mode" banner,
and in Restricted Mode the R extension does not start R ("R execution ...
require a trusted workspace"). Click **Trust** in the banner, or once and for
all: Ctrl+Shift+P → "Workspaces: Manage Workspace Trust" → Trusted Folders →
Add Folder → `C:\Users\<you>\<Dropbox>\<name>`. Every
folder under it is then trusted. The Enter extension itself declares
`capabilities.untrustedWorkspaces.supported: true` (since 1 Nov 2026), so
Enter, Ctrl+Enter and Ctrl+Shift+M work even before you click Trust.

Opening a single file instead of a folder works too (the keybindings and the
extension are not tied to a folder), but the R terminal then starts in that
file's folder and the Workspace panel only appears after Ctrl+Alt+R.

## 9. Claude Code

The rules (code style, how to answer, where to look when the editor
misbehaves) sit in `C:\Users\<you>\.claude\CLAUDE.md`, which Claude reads in
every project and every window. SAVE copies it, with the rest of
`.claude` (settings and hooks, review.py, slash commands, chat opener,
memory), into `Claude Code\` here; INSTALL puts it back on a new computer.

**/personalsettings** (6 Nov 2026, `~/.claude/commands/personalsettings.md`):
"personal settings" means this whole setup. The command answers questions
about it, checks it, or changes it with fixed steps: change the real file
(save.ps1 says where it lives), update this note, run save.ps1, then
publish.ps1 for the anonymous GitHub copy (README, "On GitHub"). Only this
copy and the GitHub copy are kept up to date; Claude does not offer to update
anyone else's copy (9 Nov 2026).

**Explaining code with pictures** (9 Nov 2026): when you ask how a block of
code works, Claude draws it. It writes a small R script in its scratch folder
that makes a PNG from your own data: one panel per step or setting, each with
a title naming the function and short labels on the picture. It checks the
picture, then sends a link that opens it in a VS Code tab, with one short
block of text per panel. **The picture (or PDF) goes inside the open project
before the link is sent** (term paper: `code/test_code/<topic>/`), linked
relative to the workspace folder: a link to Claude's scratch folder in
`AppData\Local\Temp` does not open when clicked (12 Nov 2026; rule in
`CLAUDE.md`). Your scripts are not touched. The rule is one line under
"Replies about R" in `CLAUDE.md`; the examples that worked (the biggest-circle
centre of a municipality, the number boxes on the maps) are in Claude's memory
(`explain-simply.md`).

**No "How is Claude doing this session?" question** (9 Nov 2026):
`~/.claude/settings.json` → `"env": { "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY": "1" }`.
Claude Code then never offers the survey, neither in the VS Code chat panel nor in
the terminal (checked in the code of version 2.1.319). Takes effect in a new chat
or after Reload Window. Undo: delete the `env` block.

### The computer stays awake while Claude works, also when locked (11 Nov 2026)

Lock the computer (Win+L) while Claude is busy and walk away: it no longer
falls asleep after 15 minutes (10 on battery), so Claude keeps working. The
screen still turns off (after 5 / 3 minutes) and the computer stays locked.
Closing the lid or pressing the power button still puts it to sleep, as
before. This computer has classic sleep (S3, `powercfg /a`), where such a
request reliably holds off idle sleep and hibernate.

How: two hooks in `~/.claude/settings.json`, **SessionStart** and
**UserPromptSubmit**, run `~/.claude/awake/awake.py`. It starts a small
keeper in the background (`pythonw`, no window, about 0.15 s, prints
nothing; a hook's output would go to Claude) and returns. The keeper asks
Windows not to sleep (`SetThreadExecutionState`, `ES_SYSTEM_REQUIRED`, the
request a video player or a download makes; no admin rights needed). It
looks once a minute whether Claude still writes: any chat transcript
(`~/.claude/projects/**/*.jsonl`, also subagents) changed in the last 30
minutes. After 30 quiet minutes it lets go and stops, and Windows' own sleep
timer counts again from zero: so after Claude finishes, the computer sleeps
about 45 minutes later. The next message to Claude starts it again. Only one
keeper runs (lock file `%LOCALAPPDATA%\claude-awake\keeper.lock`), also with
several Claude chats open. Log: `%LOCALAPPDATA%\claude-awake\log.txt` (`awake:` /
`released:` lines). The 30 minutes is `IDLE_MINUTES` at the top of
`awake.py`.

Test (11 Nov 2026, 7 checks, all pass): Windows' "system required" flag
(read with `CallNtPowerInformation`) is off before, on while the keeper runs,
off again once the transcript stays quiet longer than the idle time; a second
keeper exits at once; the hook call returns in 0.14 s with no output.
`powercfg /requests` would also show it, but needs admin rights.

Hooks are read when a chat starts: works from the next new chat or after
Reload Window. Off: delete the two hooks from `settings.json`.

This counts as personal settings (11 Nov 2026): `CLAUDE.md` and
`/personalsettings` now name "Windows sleep and power", so a chat asked
"my computer goes to sleep" reads this section before changing anything.
The power plans themselves are left alone (decided 11 Nov 2026). Earlier
that day another chat had set sleep and hibernate to "never" when plugged in,
in the plan **Legion Performance Mode** (Fn+Q). the user chose this hook
instead, so that change was undone: back to 15 min sleep and 3 h hibernate
when plugged in, the same as the other three plans (Quiet, Balance, Windows
Balanced). Performance mode on battery was already "never sleep" before that
and was not touched. Without Claude working (for example a long R script on
its own), a locked computer still sleeps after 15 min.

**Long R runs use the cores (11 Nov 2026, his idea).** One R process uses one
CPU core; this computer has 8 cores (16 threads). A rule in `~/.claude/CLAUDE.md`
("Long R runs: use the cores") tells Claude to split a run of more than a few
minutes into about 6 `Rscript` processes side by side (2 cores stay free),
e.g. one per group of figure versions, instead of one long run. Background:
the map versions of 11 Nov took 20 to 40 minutes as one or two processes,
with the CPU at 30% and RAM not the limit.

**No semicolons (16 Nov 2026, his wish).** A section in `~/.claude/CLAUDE.md`
("No semicolons (every project)") tells Claude never to write a `;` in
anything for him: chat answers, papers, notes, code comments, strings and
setup files. A full stop, a comma or "and" instead. The only exception is
syntax that needs it, like the separator in `[@A; @B]`. It started on 12 Nov
as a rule for his term paper scripts and paper only.

### Black code boxes in the Claude chat wrap to the panel width (9 Nov 2026)

The black boxes in the Claude chat (code blocks in replies, and tool output
when opened) used to run off the right edge of the side panel when a line was
longer than the panel. The Claude Code add-on has no setting for this: its
`webview\index.css` gives those boxes `white-space:pre`, and in a flex or grid
layout one long line makes the whole message wider than the panel. Fix: our
CSS block at the end of that file, so long lines wrap to the next line inside
the box (a long path breaks where it must):

```css
/* patched by local.claude-chat-opener v2: black code boxes wrap to the panel width */
[class*="codeBlockWrapper_"] pre{white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow-x:hidden!important}
[class*="toolResult_"]{white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow-x:hidden!important}
[class*="previewBody_"] [class*="codeBlockWrapper_"] pre{white-space:pre!important;overflow-wrap:normal!important;overflow-x:visible!important}
```

The last rule keeps the preview boxes of a Claude question as they are: they
hold drawn layouts and scroll on their own. The selectors use only the part
of the class name before the build hash (`codeBlockWrapper_-a7MRw`), so they
survive a normal Claude Code update.

**Ctrl+Numpad4 also lives in the chat opener add-on** (command
`chatOpener.newChatHere`, 18 Nov 2026): a new Claude chat tab in the editor
window that has the keyboard. Why not Claude's own command: see the Ctrl+Numpad4
row in section 4. Log line `new chat tab in the active editor window`.

**Kept in place by the chat opener add-on** (`~/.claude/tools/chat-opener`,
v0.3.0, the one behind /chats): `extension\wrap-code.js` runs at every
VS Code start **and once a minute**. Claude Code updates itself every few
days into a new folder `anthropic.claude-code-x.y.z` with a fresh
`index.css`; the minute check patches it as soon as it is downloaded, so it
is already wrapped when VS Code first shows it. An older block of ours is
replaced, not added twice. Only when the version a window is showing right
now had to be patched does a message ask for **Reload Window**. If Claude
Code ever renames its box classes, a yellow warning says so once per window
(log line `class ... not found`): then ask Claude to run the test below and
fix the selectors. Log: `~/.claude/chat-opener/log.txt` (times in UTC).

**The chat panel reads the stylesheet only when its window starts.** A patch
made by hand (or by Claude) shows no message, so every open window needs
Reload Window (Ctrl+Shift+P → "Reload Window"). That is why the boxes still
ran off on 9 Nov 2026: the first patch went in at 13:00, but the windows had
started at 12:29 and 12:45.

**Test** (`~/.claude/tools/chat-opener/test-wrap.js`, 22 checks, ends with
"ALL PASS"): runs `apply()` on fake Claude Code folders (old block replaced,
second run changes nothing, renamed class reported), checks that our block
and the real class names are in the installed `index.css`/`index.js`, then
renders the **real** `index.css` in headless Edge at side-panel width
(300 px) in three page layouts and measures every box: right edge inside the
panel, nothing hidden to the side. Control: the same page without our block
must fail (it does: 6 of 6 boxes run off). Last it lists the open windows
that started before the patch ("RELOAD NEEDED in ..."). Picture of the
patched page: `%TEMP%\claude-wrap-test\patched.png`.

```powershell
$env:ELECTRON_RUN_AS_NODE = 1
$code = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
& $code "$HOME\.claude\tools\chat-opener\test-wrap.js" | Out-String              # the test
& $code "$HOME\.claude\tools\chat-opener\extension\wrap-code.js" | Out-String    # patch now by hand
```

The opener loads `wrap-code.js` from `~/.claude/tools/chat-opener/extension/`
fresh at every check, so a change there needs no rebuild; a change to its
`extension.js` does: run `build.ps1` there, then Reload Window. Undo: delete
our block at the end of `index.css` (from the "patched by" comment on, or
let Claude Code update) and take `wrapCodeBlocks()` out of the opener.

### Claude's edits in the chat edit view, like Copilot's (5 Nov 2026)

What you see: section 5. How it works, around every Edit/Write of an R
script (hooks in `~/.claude/settings.json`, script `~/.claude/review/review.py`):

**Which files:** `.R`, `.Rmd`, `.qmd` and, since 17 Nov 2026, `.bib` (asked:
"I want it also for the .bib files", for the paper's references.bib), the
list `EXTS` near the top of review.py. Other file types get no red/green.
Tested with a test .bib in `code/test_code/bib_edit_test/`: the log shows
`edits start`, `snapshot`, `done` for it.

**On a `.qmd` (16 Nov 2026):** the red/green and Keep / Undo work for `.qmd`
too, but only in the plain text view: the Word Page (Quarto's visual editor,
a web page) cannot draw them. **Ctrl+Numpad9** switches between the Word
Page and the text view (Quarto's own key). Red/green on the Word Page itself
is wanted, planned after the hand-in of 17 Nov 2026.

0. For a `.qmd` or `.md` file, `review.py pre` first waits until the user has
   not typed in it for 5 seconds, then holds the open Word Pages for the
   moment of the write (`word-page-hold.css`), and `post` releases them and
   checks afterwards that the edit stayed (section 5c, "A Claude chat and you
   in the same file", 13 Nov 2026).
1. **PreToolUse** (`review.py pre`): stage the file in git (below), then, if
   a VS Code window with the extension has the file's folder open (its
   `window-<pid>.json` in `%LOCALAPPDATA%\claude-edits\` is fresh and not
   `"paused"`), write `<id>.start` and wait until the window has taken it
   (`.claimed`, at most 2 s) and VS Code has taken its snapshot (`.ready`, at
   most 10 s). Normally 0.2-0.5 s.
2. Claude writes the file.
3. **PostToolUse** / **PostToolUseFailure** (`post` / `failed`): write
   `<id>.done`; VS Code compares with its snapshot and shows the change.
   **Stop** (`stop`, end of Claude's turn) finishes anything still open.

The extension sends the request with
`workbench.action.chat.openSessionWithPrompt.claude-edits` to the session
`claude-edits:/edits` and never opens the edited file (the two
`showTextDocument` calls were removed on 6 Nov 2026: the tab jumped to
Claude's file on every edit): no chat window, no change of focus, the Copilot chat
panel untouched (first tried: sending `@claude-edits` in the chat panel; that
would have gone into his Copilot CLI session there, so it was dropped). Edits
that follow within 1.5 s share one request. After each edit an empty chat
edit (`stream.textEdit(uri, true)`) marks the file "modified" again: without
it VS Code (1.145) hides an outside edit of a file you already pressed Keep
or Undo on. Tested 5 Nov 2026 in a separate test VS Code (own profile,
window off-screen, screenshots via the remote-debugging port) with real
Claude edits through the real hooks: change, removal, addition, 4 edits in a
row ("1 of 4"), per-change and per-file Keep/Undo (checked on disk), new
file, edit after Keep and after Undo, file closed + chat panel hidden, failed
edit, end of turn, file outside the window's folders, the one-time demo, and
chat not signed in (edit goes ahead after 6 s, window pauses 2 minutes).

### Seeing Claude's edits as red/green lines (set up 3 Nov 2026)

Claude's edits go straight into the file (no prompts: the project's
`.claude/settings.local.json` allows every tool). The review is VS Code's own
git view, which needs nothing from Claude:

- Just before Claude edits an R script, the file is staged in git
  (`git add`). A hook in `~/.claude/settings.json` runs
  `~/.claude/review/review.py` for that. So the left gutter marks only what
  Claude changed: blue bar = changed lines, green bar = new lines, red
  triangle = deleted lines.
- **One-time setting (4 Nov 2026).** VS Code draws two layers of marks:
  "Git Local Changes (Working Tree)" = Claude's change, and "Git Local
  Changes (Index)" = everything you changed yourself since the last commit.
  The second layer buries the first. Hide it once: **right-click on a line
  number** (the digits, not the coloured bar) → **Diff Decorations** →
  untick **Git Local Changes (Index)**. VS Code remembers this for all
  projects. If the marks ever show your own work again, this tick is back on.
  With it unticked, the box that opens on a click shows only "Git Local
  Changes (Working Tree)", without a dropdown to switch layers. VS Code
  stores the untick in `%APPDATA%\Code\User\globalStorage\state.vscdb`, key
  `workbench.scm.quickDiffProviders.hidden` =
  `["git.secondaryQuickDiffProvider"]` (checked in VS Code 1.145 code,
  5 Nov 2026). Claude wrote that key directly on 5 Nov 2026; a running VS
  Code only reads it after a full restart, so untick by hand for instant
  effect.
- Click a mark, or press **Ctrl+Numpad2** (Show Next Change, cursor in the
  code): a box opens under that change with the old lines in red and the new
  lines in green, one change at a time. **Revert Change** = no, undoes that
  one change; **Stage Change** = yes, keeps it. Both make the mark disappear.
  Doing nothing also keeps it. VS Code's own **+** (Stage Change) then jumps
  the box to the next change (built in, no setting). The **✓ Keep this
  change, stay here** button next to it (added 5 Nov 2026, from the Enter
  extension, command `rPipeIndent.stageChangeStay`) closes the box first and
  then stages, so the view stays where it was. VS Code's own key, Alt+F3, does not work on
  this PC: the NVIDIA app takes it for Game Filters. Alt+F5 (Go to Next
  Change) only moves the cursor.
- **Keep / Undo in the chat edit view also clears these marks** (18 Nov
  2026, Enter add-on v0.5.3, asked: "I saw changes being proposed, or the
  red and green lines, that I had already accepted before"). The two layers
  did not know of each other: a Keep in the chat edit view never reached
  git, so the gutter and Ctrl+Numpad2 still showed the kept change as new
  until the next Claude edit of that file or a commit. Now every Keep or
  Undo (one change or a whole file) runs `git add` on that file 0.8 s later
  (`stageAfterReview`). Log: `git: staged 01_analysis.R after Keep`. The
  gutter then marks only what changed after your last decision. Outside a
  git folder nothing happens. Offline check: a throwaway git folder, one
  Keep, gutter diff empty afterwards.
- **Keep / Undo can still come back after a crash.** VS Code saves the chat
  edit view's state (which changes are kept) about once a minute and when
  it closes normally. When the window crashes (it ran out of memory twice
  on 16 Nov 2026) the Keeps of the last minute are lost, and those changes
  show red/green again after the restart. Keep them again. A git commit is
  not the cause: it does not touch the chat edit view.
- The whole file as one diff: Source Control (Ctrl+Shift+G), click the file.
  `diffEditor.renderSideBySide: false` makes that view inline too.
- Hooks are read when a session starts: new hooks need a new chat.
- Why not the extension's own Accept/Reject diff: its prompt blocks the chat
  box. Why not `code --diff` from Claude: Claude's shell cannot reach the
  screen.
