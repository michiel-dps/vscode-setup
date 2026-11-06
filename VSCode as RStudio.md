# VS Code set up to behave like RStudio (R)

The user's setup, as it works on 4 Nov 2026. Keep this file updated whenever
the setup changes. Everything needed to rebuild it is in this Dropbox folder
(`<name>\VS Code setup`, called `R setup` until 4 Nov 2026), so it
travels to every PC. `README.md` says how: `INSTALL.cmd` puts it on a new
laptop, `SAVE.cmd` copies this laptop's setup into the folder.

| File | What it is |
|---|---|
| `VSCode as RStudio.md` | this note |
| `R\watch.R` | viewer tabs refresh by themselves when the object they show changes: tables and values (a number, a text, a vector, a list) alike, since 2 Nov 2026 |
| `R\watch-test.R` | 30 offline checks for `watch.R`; run after every change to it or R extension update (section 6) |
| `R\Rprofile.R` | loads `watch.R` in every VS Code R terminal (section 2) |
| `R\.lintr` | no warnings about trailing spaces / indentation / commented code / "use |> instead of %>%" (copy of `C:\Users\<you>\.lintr`) |
| `R\packages.txt` | the R packages on the laptop (written by SAVE, installed by INSTALL) |
| `VS Code\settings.json`, `keybindings.json` | copies of `%APPDATA%\Code\User\` (sections 3 and 4) |
| `VS Code\extensions.txt` | the VS Code add-ons; `pinned` = installed at that exact version |
| `VS Code\patch-r-extension.pl` | two fixes to the R extension: data viewer columns sized to content, and the column-name popup after `, ` instead of right after the comma (run again after every R extension update, section 6) |
| `VS Code\local.r-pipe-indent-0.1.0\` | the Enter-indents-like-RStudio extension (v0.5.0); Ctrl+Enter runs whole statements and refuses unfinished ones; Ctrl+Shift+M types `%>%`; shows Claude Code's edits in VS Code's own chat edit view (Keep / Undo), section 5 |
| `VS Code\local.startup-screen-0.1.0\` | the startup screen (6 Nov 2026): a short loading screen with a picture, a tip and the loading steps when VS Code starts; personal, left out of the GitHub copy; section 5b |
| `Claude Code\` | copies of `C:\Users\<you>\.claude\`: `CLAUDE.md` (rules for every Claude window), `settings.json` (hooks), `review\review.py`, `commands\` (/chats, /handoff, /takeon), `tools\chat-opener\`, `memory\` (one folder per project) |
| `git\.gitconfig` | name, e-mail, GitHub login through `gh` |

Since 30 Oct 2026 nothing is per project any more: a new R folder works
without copying anything into it. `%APPDATA%` = `C:\Users\<you>\AppData\Roaming`.

---

## 1. New PC checklist

See `README.md`: install the programs, double-click `INSTALL.cmd`, then do
the five clicks it prints. INSTALL does sections 2 to 6 below by itself.

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
"[r]": { "editor.inlineSuggest.enabled": false },
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
| `acceptSuggestionOnEnter` left at `on` | Enter on a completion popup accepts it and stays on the line, as in RStudio. `smart` was tried on 1 Nov 2026 and reverted on 2 Nov: with `smart`, a popup that only repeats the word already typed makes Enter insert a new line, which felt like the editor jumping away |
| `enablePersistentSessions: false` | restart gives a fresh R terminal that attaches to the Workspace panel (a restored old terminal never does) |

Colours: all of them are in this settings.json, so SAVE and INSTALL carry
them to every laptop. The theme itself is the add-on `gerane.theme-idlefingers`
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

## 4. Keybindings (`%APPDATA%\Code\User\keybindings.json`)

```json
[
    { "key": "ctrl+alt+r",   "command": "r.createRTerm" },
    { "key": "ctrl+m",       "command": "-editor.action.toggleTabFocusMode" },
    { "key": "ctrl+shift+m", "command": "rPipeIndent.insertPipe",
      "when": "editorTextFocus && editorLangId == r && !editorReadonly" },
    { "key": "ctrl+enter",   "command": "rPipeIndent.runStatement",
      "when": "editorTextFocus && editorLangId == r && !editorReadonly" },
    { "key": "ctrl+numpad7", "command": "runCommands",
      "args": { "commands": [
        "workbench.action.focusSecondEditorGroup",
        "claude-vscode.primaryEditor.open" ] } },
    { "key": "ctrl+numpad8", "command": "workbench.action.chat.open" }
]
```

| Key | Does |
|---|---|
| Ctrl+Alt+R | new R terminal |
| Ctrl+Shift+M | types ` %>%` (RStudio's pipe shortcut); right after a space just `%>%`, so no double spaces |
| Ctrl+M | disabled (it toggled "Tab moves focus" by accident) |
| Ctrl+Enter | run the statement at the cursor, or the selection widened to whole statements; refuses an unfinished statement with a yellow warning (section 5) |
| Ctrl+Numpad7 | new **Claude Code** chat as a tab in its own column on the right (runs on the Claude subscription): it first focuses the second editor group (VS Code makes one on the right if there is only one), then runs `claude-vscode.primaryEditor.open`, which opens in that active group (or in a column that already holds only Claude tabs) and, unlike `claude-vscode.editor.open`, does not switch `claudeCode.preferredLocation` from sidebar to panel. Changed 4 Nov 2026: it first opened VS Code's own Claude harness ("Claude copilot"), but that chat cannot send anything here: Copilot Free (`copilot token sku: free_limited_copilot`) offers it no Claude models, and Anthropic does not allow claude.ai subscription logins in Agent SDK products (Agent SDK overview page), so it would need an Anthropic API key or a paid Copilot plan. Old notes on that harness, kept for later: it first focuses the second editor group (VS Code makes one on the right if there is only one), then opens the chat there; if that column already shows a Claude chat, the new one replaces it in place (the old one stays in the sessions list). Layout: Claude Code in the left side bar, code + Claude chat in the middle, Copilot chat ("Chat"; VS Code cannot rename a view) in the right side bar. VS Code has only one chat view, which is why the Claude chat is an editor tab and not a second side bar. Session type `agent-host-claude` (VS Code's Agent Host; the same command as picking "Claude" in the chat's session-type menu). Needed `"chat.agentHost.claudeAgent.enabled": true` in settings.json; **removed again 5 Nov 2026**: with it on, the Copilot chat panel opened this Claude chat type (which cannot send) and the old Copilot chats dropped out of the sessions list. Do not turn it back on (the old name `github.copilot.chat.claudeAgent.enabled` no longer exists in VS Code 1.144). Who pays depends on the model picked in that chat: models from your own Anthropic login (VS Code tags them `anthropic`, "native") bill your Claude account; the others go through Copilot. While signed in to GitHub, Copilot is the default. Native models only appear after VS Code has downloaded the Claude Agent SDK (agenthost.log said "SDK not downloaded yet" on 4 Nov). Added 4 Nov 2026 |
| Ctrl+Numpad8 | jump to the Copilot chat box in the side window (opens it if closed); NumLock must be on (added 4 Nov 2026) |

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
x <- d %>%⏎                → one level in
    # keep only USA⏎       → comment line inside the statement: VS Code's Enter (same level)
    filter(a) %>%⏎         → same level (the comment above no longer confuses it, since 1 Nov 2026)
    select(b)⏎             → back to the statement's indent
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

When VS Code starts, or after Reload Window, a tab "Loading" shows for about
six seconds and then closes itself:

- one picture, slowly zooming out, with embers drifting up;
- bottom left: a tip with one of your own shortcuts (a random tip each start,
  never the same one twice in a row, like the picture);
- bottom right: the loading steps with a small gold ring. The step "Calling
  the R add-on" waits, at most 3 s, until the R extension really runs.

A click or any key skips it.

- **Pictures**: every .jpg, .png or .webp in
  `C:\Users\<you>\Pictures\VS Code startup` (a different one each start). Add
  or delete pictures there; nothing else to do. Another folder: setting
  `startupScreen.pictureFolder`. No pictures: a dark background with embers.
  The 6 pictures there on 6 Nov 2026 are official images from the game's
  media gallery (https://en.bandainamcoent.eu/elden-ring/elden-ring/media),
  saved for personal use only; they are not in this folder. The rider in
  light has its bottom strip cut off, because the game's name was printed
  there and the tip ran over it.
- **How often**: at most once every 10 minutes (setting
  `startupScreen.minutesBetween`, 0 = every start), so several Reload Windows
  in a row do not replay it. Not when the add-on is installed or switched on
  while VS Code is already running.
- **See it now**: Ctrl+Shift+P → "Startup screen: play now".
- **Off**: setting `"startupScreen.enabled": false`.
- **Personal**: publish.ps1 leaves the add-on folder out of the GitHub copy
  (`$leaveOut`). INSTALL does not install it: on a new laptop run its
  `build.ps1` and put pictures in the picture folder.
- **After a change** to `extension.js` or `screen.html`: run `build.ps1` in
  the add-on folder (it packs `startup-screen.vsix` and installs it with
  `code --install-extension`), then Reload Window.
- **Log**: `%TEMP%\startup-screen.log`, one line per start: `show <picture>,
  tip N`, or `skip: <why>`.

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
  a restart. Kill it, Ctrl+Alt+R.
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
- Two things in the R extension are changed by editing its code
  (`VS Code\patch-r-extension.pl` in this folder; the original is kept next
  to it as `extension.js.orig`). The R extension overwrites both when it
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
     `, ` (comma space) instead. The popups after `(`, `[`, `$` and `@`
     are unchanged; so is the language server (its popups come after `.`
     and `::`, and while typing a word).
- Picking a function from the autocomplete popup inserts `f()` as a snippet;
  the Enter extension works inside it too (its activation rule must NOT
  contain `!inSnippetMode`).
- Each VS Code window has its own R terminal and Workspace panel. Working in
  two windows (two projects) is fine; one R session per window.

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
memory), into `Claude Code\` here; INSTALL puts it back on a new laptop.

**/personalsettings** (6 Nov 2026, `~/.claude/commands/personalsettings.md`):
"personal settings" means this whole setup. The command answers questions
about it, checks it, or changes it with fixed steps: change the real file
(save.ps1 says where it lives), update this note, run save.ps1, then
publish.ps1 for the anonymous GitHub copy (README, "On GitHub").

### Claude's edits in the chat edit view, like Copilot's (5 Nov 2026)

What you see: section 5. How it works, around every Edit/Write of an R
script (hooks in `~/.claude/settings.json`, script `~/.claude/review/review.py`):

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
- The whole file as one diff: Source Control (Ctrl+Shift+G), click the file.
  `diffEditor.renderSideBySide: false` makes that view inline too.
- Hooks are read when a session starts: new hooks need a new chat.
- Why not the extension's own Accept/Reject diff: its prompt blocks the chat
  box. Why not `code --diff` from Claude: Claude's shell cannot reach the
  screen.
