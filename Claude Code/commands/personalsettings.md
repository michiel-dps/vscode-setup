---
description: Ask about, check or change the user's personal settings (VS Code, the RStudio-like R setup, Claude Code, git)
argument-hint: what to ask, check or change
---

"Personal settings" means the user's whole working setup:

- VS Code: settings.json, keybindings.json, the add-ons, the Enter add-on (local.r-pipe-indent), the patches for the R add-on and the PDF viewer
- the RStudio-like R setup: watch.R, Rprofile.R, .lintr, the list of R packages
- Claude Code: ~/.claude/CLAUDE.md, settings.json and its hooks (review.py), the slash commands (this one too), memory
- git: .gitconfig

The master copy is the folder `C:\Users\<you>\<Dropbox>\<name>\VS Code setup` (in Dropbox). Its `README.md` says what is where. `VSCode as RStudio.md` there explains how everything works and why: section 5 the Enter add-on, 6 the R add-on gotchas, 9 Claude Code. An anonymous copy of the folder is in his private GitHub repo vscode-setup, made by `scripts/publish.ps1`.

His request: $ARGUMENTS

## A question or a check

How does X work, why does Y happen, is Z switched on: read the relevant section of the note and the real file on the laptop, then answer short. For editor trouble, read `%TEMP%\r-pipe-indent.log` first. Change nothing.

## A change

1. Find where the file really lives: `scripts/save.ps1` lists each laptop location and its copy in the folder. Change the real file on the laptop, not the copy (SAVE overwrites the copies). Changed in the folder itself instead: `R\watch.R`, `R\Rprofile.R` and the Enter add-on `VS Code\local.r-pipe-indent-0.1.0`. After an add-on change, run its `test.js` (note, section 5), then copy `extension.js` to `~/.vscode/extensions/local.r-pipe-indent-0.1.0/`.
2. Make a small, focused change. If it is not obvious, say first what and why. Never break the working setup: real paths stay real.
3. Update `VSCode as RStudio.md` in the same turn.
4. Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<folder>\scripts\save.ps1"`.
5. Update the GitHub copy: run `<folder>\scripts\publish.ps1 -Message "<what changed>"`, with the commit message ending in the Co-Authored-By line. It stops when a personal word is still in the copy (a name, the user name, an e-mail, health, a project or a co-author). Then add a swap for that word to `$swaps` in publish.ps1. Never weaken the check, and never push the folder itself (it is not a git repo, on purpose).
6. Tell him in one line what to reload (Reload Window, a fresh R terminal with Ctrl+Alt+R, or a full VS Code restart after an argv.json change) and how to see that it works.
7. Only his own copy is kept up to date: the setup folder and its GitHub copy. Never offer to update or refresh another person's copy of the setup (decided 9 Nov 2026).
