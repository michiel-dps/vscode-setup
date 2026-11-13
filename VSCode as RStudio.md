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
| `VS Code\extensions.txt` | every VS Code add-on on the laptop, written by SAVE from `%USERPROFILE%\.vscode\extensions\extensions.json`. Marketplace add-ons first (id, version; `pinned` = installed at that exact version), which INSTALL installs. Then, since 10 Nov 2026, the own add-ons as `#` lines (id, version, where it comes from), so INSTALL skips them there: `local.r-pipe-indent` (INSTALL copies it), `local.claude-chat-opener` (INSTALL runs its `build.ps1`), `local.startup-screen` (personal: run its `build.ps1` by hand, section 5b), `local.word-page` (INSTALL runs its `build.ps1`, section 5c). Check against VS Code itself: `code --list-extensions --show-versions` |
| `VS Code\patch-r-extension.pl` | five fixes to the R extension: data viewer columns sized to content, the column-name popup after `, ` instead of right after the comma, a knitted PDF opening in the editor to the right, a new plot bringing the R Plot tab to the front, and Ctrl+wheel zoom on plots like a PDF (run again after every R extension update, section 6) |
| `VS Code\patch-pdf-viewer.pl` | two fixes to the PDF viewer add-on `tomoki1207.pdf` (10 Nov 2026; zoom version 3 on 11 Nov 2026): Ctrl+wheel and touchpad pinch zoom smoothly in on the spot under the mouse (a pinch follows the fingers, the wheel glides); and a clean reload after each knit (run again after every update of that add-on, section 6b) |
| `VS Code\local.r-pipe-indent-0.1.0\` | the Enter-indents-like-RStudio extension (v0.5.0); Ctrl+Enter runs whole statements and refuses unfinished ones; Ctrl+Shift+M types `%>%`; shows Claude Code's edits in VS Code's own chat edit view (Keep / Undo; Keep selects the kept lines), section 5 |
| `VS Code\local.startup-screen-0.1.0\` | the startup screen (6 Nov 2026): a short loading screen with a picture, a tip and the loading steps when VS Code starts; personal, left out of the GitHub copy; section 5b |
| `VS Code\local.word-page-0.1.0\` | Word Page (11 Nov 2026): write like in Word or Google Docs inside VS Code. Quarto's visual editor as a white page with black text under any colour theme, "Word Page: New Document", citations from a `.bib` file and from Zotero; the file underneath is markdown (`.qmd`). Since 11 Nov 2026 the page looks like the PDF of a paper (LaTeX font, A4 margins, PDF heading sizes; setting `wordPage.look`). Its `bench\` is a test VS Code for Claude on its own, invisible Windows desktop; section 5c |
| `Claude Code\` | copies of `C:\Users\<you>\.claude\`: `CLAUDE.md` (rules for every Claude window), `settings.json` (hooks), `review\review.py`, `awake\awake.py` (laptop stays awake while Claude works, section 9), `commands\` (/chats, /handoff, /takeon), `tools\chat-opener\` (the /chats add-on, which also makes code blocks in the Claude chat wrap, section 9), `memory\` (one folder per project) |
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
    { "key": "ctrl+numpad5", "command": "claude-vscode.sidebar.open" },
    { "key": "ctrl+numpad5", "command": "runCommands",
      "args": { "commands": [
        "claude-vscode.sidebar.open",
        "claude-vscode.insertAtMention" ] },
      "when": "editorTextFocus && editorHasSelection" },
    { "key": "ctrl+numpad5", "command": "wordPage.selectionToClaude",
      "when": "activeCustomEditorId == 'quarto.visualEditor' && !sideBarFocus && !auxiliaryBarFocus && !panelFocus" },
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
| Ctrl+Numpad5 | jump to the **Claude Code** chat box in the side panel (opens it if closed). With lines highlighted in a file, it also types a reference to them into the message, e.g. `@code/04_maps.R#12-20` (file from the project folder, first-last line), so Claude reads exactly those lines; without a highlight it only jumps. Two entries for the same key: the plain one first, then one with `"when": "editorTextFocus && editorHasSelection"` that runs `claude-vscode.sidebar.open` and then `claude-vscode.insertAtMention` (the Claude add-on's own Alt+K command); the later entry wins when its `when` is true. The order inside matters: side panel first, because the add-on types the reference into every Claude chat that is visible at that moment (read in its code, version 2.1.322), so a Claude tab that is open next to the code gets the reference too; delete it there. A highlight on a Word Page is not an editor selection, so there a third entry (`"when": "activeCustomEditorId == 'quarto.visualEditor' ..."`, keyboard on the page) runs the Word Page add-on's own command, which does the same job in another way: section 5c, "Highlighted text to Claude". NumLock must be on (added 11 Nov 2026) |
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
    this laptop (2560x1600) about 25 frames per second.
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
  saved for personal use only; they are not in this folder. The helper shows
  .jpg, .png and .bmp (not .webp). A picture fills the screen, unless that
  would blow it up more than 1.35 times its real size (blurry): then it is
  shown across the full width, with a soft blurred copy of it above and
  below (6 Nov 2026, for the key art, 1920x650, on the 2560x1600 screen).
- **How often**: at every start, every Reload Window and every new VS Code
  window (since 6 Nov 2026; before that at most once every 10 minutes). Setting
  `startupScreen.minutesBetween`: 0 (the default) = every start; a number =
  at most once in that many minutes. Not when the add-on is installed or
  switched on while VS Code is already running.
- **See it now**: Ctrl+Shift+P → "Startup screen: play now".
- **Off**: setting `"startupScreen.enabled": false`.
- **Personal**: publish.ps1 leaves the add-on folder out of the GitHub copy
  (`$leaveOut`). INSTALL does not install it: on a new laptop run its
  `build.ps1` and put pictures in the picture folder.
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
- **Page ends**: a dashed line across the page with "page 7" in the right
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
runs `pdfpages.py` (Python with **PyMuPDF**; on another laptop: `pip install
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
  pages". On hover a dashed line and a tag say what made it; a click opens
  the code. The pictures are PNG files (150 dpi) in `word-page-pdf\` next to
  Quarto's `index.js`, named after the PDF and its build time; those of an
  older build are taken away.
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

While you type, an outside change cannot be taken without losing what was
typed: the page keeps your text and writes it back over the file, and a red
bar at the top says so. Tested in the bench with autosave as on this laptop:
an edit on disk while the page had the focus (but no typing) is shown on the
page and stays in the file.

**A Claude chat and you in the same file at the same time (13 Nov 2026,
asked: "the chat realises this and retries later").** Three parts:

1. The add-on notes when you last typed in each `.qmd`/`.md` file
   (`typing.js`, section 6 of `extension.js`): every change of the document
   made inside VS Code (on the page, Quarto writes what you type into the
   document every 2 seconds) goes into `%LOCALAPPDATA%\word-page\typing.json`
   (file name in lower case → time in ms, at most one write per 250 ms, marks
   older than 10 minutes dropped). A change that comes from the disk (a Claude
   edit) leaves the document not dirty, so it does not count.
2. Before every Claude Edit/Write of a `.qmd`/`.md` file, `review.py pre`
   waits until you have not typed in that file for 5 seconds (checked twice a
   second, at most 90 s; the hook's `timeout` is 150 s). The chat box then
   says "Claude waited N s: you were typing in draft.qmd". Still typing after
   90 s: the edit is refused and the chat is told to try again in a minute. A
   Write is also refused when you typed into the file while it waited (its
   text would wipe out yours). This wait comes before VS Code's snapshot for
   the red/green view (section 9), so the snapshot has your typing.
3. When you typed in the file in the last 2 minutes, `review.py pre` keeps a
   copy of the file (`%LOCALAPPDATA%\word-page\before-<id>.txt`), and
   `review.py post` waits 3 seconds and checks whether the old text is back
   where Claude changed it, with the 40 letters around it (the page writes
   Claude's new text in its own markdown, so a missing new text proves
   nothing). Old text back = the page wrote over the edit: the chat is told
   to read the file again and make the same edit again.

The 5 seconds are needed because the add-on only sees typing when Quarto
writes it (up to 2 s late) and the page refuses outside changes for 2.5 s
after a keystroke. Part 3 catches the rest (you start typing again in the
second the edit lands). Log lines in `%TEMP%\word-page.log` start with
`claude:` ("waited 7 s until the user stopped typing in draft.qmd", "the page
wrote its own text over Claude's edit ..."). Offline checks: 6 in `test.js`
(typing marks); 41 for the hook were run on 13 Nov 2026 with a made-up file
outside the project (wait, refuse after the longest wait, Write refused,
lost or kept for change / insertion / removal / MultiEdit / Write, the whole
hook as Claude Code runs it, R scripts not held up).

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
- A `.qmd` whose header has `editor: visual` opens as a page by itself.
  Quarto does that only for files opened after it has started, so the add-on
  does it for the first `.qmd` of a session. A `.md` never opens as a page by
  itself: right-click it, `Word Page: Open as Page`.
- **Ctrl+Shift+F4** switches between the page and the plain markdown text.
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
  grey line), `wordPage.pageEnds` (on: the PDF's page ends),
  `wordPage.fromPdf` (on: citations and pictures from the PDF),
  `wordPage.python` (`"python"`: the Python with PyMuPDF that reads the PDF).
  After a change: close the document tab and open it again.
  In the Word look, font and size of the text are Quarto's:
  `quarto.visualEditor.fontFamily`, `quarto.visualEditor.fontSize`; the PDF
  look does not use them.

```yaml
---
title: "Draft"
editor: visual
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
- Spell check on the page is British English since 12 Nov 2026:
  `"quarto.visualEditor.spellingDictionary": "en_GB"` in settings.json. The
  default is American and marked "neighbours" as wrong. Quarto has en_AU,
  en_CA, en_GB, en_US, es_ES, fr_FR, de_DE and ru_RU: no Norwegian.
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
`test.js` (90 offline checks of `patch.js`, `mention.js` and `typing.js`),
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
- A Claude chat that is open as a tab does not get the reference (unlike the
  key in a normal file): it goes to the side panel only.
- One line per key press in `%TEMP%\word-page.log` (what was found, what was
  pasted, how long the copy and the panel took). Read that first when it
  "does nothing".

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
that itself after every start and every `-Stop` (`Restore-UrlHandler`). If
Claude or a `vscode://` link ever opens a strange VS Code again: check that
registry value first. The other
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
- Five things in the R extension are changed by editing its code
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
     `, ` (comma space) instead. The popups after `(`, `[`, `$` and `@`
     are unchanged; so is the language server (its popups come after `.`
     and `::`, and while typing a word).
  3. Knit: a knitted PDF opens in the editor to the right of the `.Rmd`,
     the cursor stays in the `.Rmd` (10 Nov 2026, section 6b). The R
     extension knows the output path only after knitting, so this is the
     one place where "open it beside" can go; `openOutputFile` would open
     it in the same editor window as the `.Rmd`.
  4. Plots (11 Nov 2026): a new plot (`print(p)`, `plot(x)`) brings the
     **R Plot** tab to the front in its editor window (the second one, setting
     `r.session.viewers.viewColumn` → `plot`, default `Two`), also when a PDF
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
memory), into `Claude Code\` here; INSTALL puts it back on a new laptop.

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

### The laptop stays awake while Claude works, also when locked (11 Nov 2026)

Lock the laptop (Win+L) while Claude is busy and walk away: it no longer
falls asleep after 15 minutes (10 on battery), so Claude keeps working. The
screen still turns off (after 5 / 3 minutes) and the laptop stays locked.
Closing the lid or pressing the power button still puts it to sleep, as
before. This laptop has classic sleep (S3, `powercfg /a`), where such a
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
timer counts again from zero: so after Claude finishes, the laptop sleeps
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
"my laptop goes to sleep" reads this section before changing anything.
The power plans themselves are left alone (decided 11 Nov 2026). Earlier
that day another chat had set sleep and hibernate to "never" when plugged in,
in the plan **Legion Performance Mode** (Fn+Q). the user chose this hook
instead, so that change was undone: back to 15 min sleep and 3 h hibernate
when plugged in, the same as the other three plans (Quiet, Balance, Windows
Balanced). Performance mode on battery was already "never sleep" before that
and was not touched. Without Claude working (for example a long R script on
its own), a locked laptop still sleeps after 15 min.

**Long R runs use the cores (11 Nov 2026, his idea).** One R process uses one
CPU core; this laptop has 8 cores (16 threads). A rule in `~/.claude/CLAUDE.md`
("Long R runs: use the cores") tells Claude to split a run of more than a few
minutes into about 6 `Rscript` processes side by side (2 cores stay free),
e.g. one per group of figure versions, instead of one long run. Background:
the map versions of 11 Nov took 20 to 40 minutes as one or two processes,
with the CPU at 30% and RAM not the limit.

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

0. For a `.qmd` or `.md` file, `review.py pre` first waits until the user has
   not typed in it for 5 seconds, and `post` checks afterwards that the Word
   Page did not write over the edit (section 5c, "A Claude chat and you in
   the same file", 13 Nov 2026).
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
