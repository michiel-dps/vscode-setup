# Guide for Claude: help someone install this setup

This repository is a VS Code + R + Claude Code setup for Windows that makes
VS Code work like RStudio and shows Claude's edits red/green with Keep / Undo.
Someone has opened it in their own VS Code and asked you to install or import
it. Walk them through it as a clear, friendly installation process. The
person may not know VS Code, R or PowerShell well: plain words, short steps.
Nothing is installed or changed until they have said yes to it.

The installer is `scripts\install.ps1`. Run it with:
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 <options>`

## Step 1. Welcome and check

- Say in three or four lines what the setup is and that they choose what to
  install, see every download first, and that every file it replaces is
  backed up first (to `C:\Users\<them>\setup-backup-<date>`).
- Check that this is Windows. On macOS or Linux, say that the installer is
  for Windows only, and stop.
- Run `install.ps1 -Plan`. It changes nothing. It lists every part: what it
  does, what it downloads, which programs it needs (there or MISSING) and
  which of their files it would replace.

## Step 2. Let them choose the parts

Show the parts as a short table (part, what you get, download, replaces),
made from the plan's output. Then ask which parts they want. Use the
question tool with several answers allowed, if you have it, so they can
tick the parts. Parts:

| Part | What it is |
|---|---|
| `addons` | VS Code add-ons from the Marketplace (Claude Code, R, Quarto, Python, PDF viewer, a dark theme, ...) |
| `enter` | Enter keeps R pipes indented, Ctrl+Enter refuses unfinished R code, Claude's edits red/green with Keep / Undo |
| `settings` | VS Code colours, editor settings and RStudio keys. **Replaces their own settings and keys** |
| `r` | R like RStudio: startup file, viewer tabs that follow changes, about 300 R packages, fixes to the R add-on |
| `wordpage` | Write a paper like in Word in Quarto's visual editor |
| `git` | git name, e-mail and GitHub login helper |
| `claude` | Claude Code rules (CLAUDE.md), hooks, slash commands, keep-awake helper |

Point out, before they choose:

- `settings` replaces their VS Code settings and keybindings. The old files
  go to the backup folder, but if they already have a setup they like, they
  may want to skip it.
- `claude` installs a `CLAUDE.md` with the setup owner's own rules for
  Claude (R code style, how to answer). Offer to show it first. They may want
  to skip it or change it afterwards.
- `r` and `wordpage` need the add-ons from `addons` (`reditorsupport.r`,
  `tomoki1207.pdf`, `quarto.quarto`). If they pick `r` or `wordpage` without
  `addons`, say so and ask again.
- Ask whether they want every add-on. If not, show the list from the plan
  and note the ones to leave out (for `-SkipAddons`).
- For `git`: ask for the name and e-mail they want in git (`-GitName`,
  `-GitEmail`). Without them, the installer skips that part.

## Step 3. Downloads: say exactly what comes, ask once more

Run `install.ps1 -Plan -Parts <their parts>` again. Then list, in one short
block, everything that will be downloaded:

- each missing program, with its size and its `winget` line (VS Code, R,
  Git, GitHub CLI, Python)
- the VS Code add-ons by name
- the number of R packages, from CRAN, and the time (10 to 20 minutes the
  first time)

Ask for a clear yes. Install missing programs one at a time with their
`winget` line, after that yes, and check that each one worked. If `winget`
is not there, give the program's download page instead.

## Step 4. Install

Run `install.ps1 -Parts <parts>` (with `-SkipAddons`, `-GitName`,
`-GitEmail` when needed). Say what is happening while it runs, in plain
words. If it stops, read its message, explain it in one line and offer the
fix.

## Step 5. Finish

- Show the by-hand steps the installer printed at the end, as a numbered
  list (restart VS Code, sign in to Claude Code, and so on).
- Say where the backup is and how to undo: copy the files from the backup
  folder back.
- Point to `VSCode as RStudio.md` for how everything works, and to
  `/personalsettings` (once the `claude` part is in) for later changes.

## Rules

- Never install a program, add-on or package that they have not said yes to.
- Never delete their files. The installer backs up what it replaces; do not
  work around that.
- Names in the files are placeholders (`<you>`, `<Dropbox>`, `<name>`,
  `<project>`, `<co-author>`, see `PLACEHOLDERS.md`). The installer changes
  `<you>` and the setup folder's own path to theirs. Leave the rest alone.
- Test first if they are unsure: `install.ps1 -Parts <parts> -TestRoot
  <empty folder>` puts every file under that folder and runs no programs.
