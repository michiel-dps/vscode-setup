# VS Code setup

Everything that makes VS Code, R and Claude Code work the way the user wants,
in one folder. Dropbox brings it to every laptop.

**"Personal settings"** means this setup: this folder and its anonymous copy
on GitHub. In Claude Code, **/personalsettings** asks about, checks or
changes anything in it (for example `/personalsettings turn off line numbers`).

## On a new laptop

1. Install Dropbox, sign in, and wait until this folder is there.
2. Double-click **INSTALL.cmd**.
   - If a program is missing (VS Code, R, Git, GitHub CLI, Python), it shows
     one line per program. Paste each line into PowerShell, then
     double-click INSTALL.cmd again.
   - The first time, installing the R packages takes 10 to 20 minutes.
3. Do the five steps it shows at the end (sign in to Claude, and so on).

INSTALL never throws anything away: every file it replaces is first copied
to `C:\Users\<you>\setup-backup-<date>`.

## Keeping this folder up to date

**SAVE.cmd** copies this laptop's setup into this folder. Double-click it
after you change a setting yourself. Claude runs it after it changes the
setup.

Change the real files on the laptop, not the copies here: SAVE overwrites
the copies.

Change these four in this folder instead (SAVE leaves them alone):

- `R\watch.R` and `R\Rprofile.R`: R uses them straight from here.
- `VS Code\local.r-pipe-indent-0.1.0`: the Enter add-on. Afterwards copy it
  to the laptop (note, section 5).
- `VS Code\local.startup-screen-0.1.0`: the startup screen. Personal: it is
  left out of the GitHub copy. Afterwards run its `build.ps1` (note,
  section 5b).

## On GitHub (anonymous copy)

This folder is not a git repo itself. `scripts\publish.ps1` makes an
anonymous copy in `C:\Users\<you>\vscode-setup-github` and pushes it to the
private GitHub repo **vscode-setup**:

- Claude's memory is left out; names, paths and e-mail become placeholders
  (`<you>`, `<Dropbox>`, `<name>`, `<project>`, `<co-author>`).
- It stops without pushing if any personal word is still in the copy.
- This folder is never changed by it, so the setup keeps working.

Ask Claude to "publish the setup", or run
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish.ps1`.

## What is in it

- `R` : watch.R, the R startup file, .lintr, the list of R packages
- `VS Code` : settings (with all colours), keybindings, the list of every
  add-on (`extensions.txt`: the Marketplace ones, with the idleFingers theme,
  and the own ones), the Enter add-on, the startup screen, the fix for the
  R add-on
- `Claude Code` : Claude's rules (CLAUDE.md), settings and hooks,
  /chats /handoff /takeon, Claude's memory
- `git` : name, e-mail, GitHub login
- `scripts` : the programs behind INSTALL and SAVE
- `saved-from.txt` : when, and from which laptop, SAVE last saved a change
- `VSCode as RStudio.md` : the full description of the setup
