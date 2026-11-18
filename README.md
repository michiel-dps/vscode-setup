# VS Code setup

Everything that makes VS Code, R and Claude Code work the way the user wants,
in one folder, including the computer staying awake while Claude works.
Dropbox brings it to every computer.

**"Personal settings"** means this setup: this folder and its anonymous copy
on GitHub. In Claude Code, **/personalsettings** asks about, checks or
changes anything in it (for example `/personalsettings turn off line numbers`).

## On a new computer

1. Install Dropbox, sign in, and wait until this folder is there.
2. Double-click **INSTALL.cmd**.
   - If a program is missing (VS Code, R, Git, GitHub CLI, Python), it shows
     one line per program. Paste each line into PowerShell, then
     double-click INSTALL.cmd again.
   - The first time, installing the R packages takes 10 to 20 minutes.
3. Do the five steps it shows at the end (sign in to Claude, and so on).

**Or let Claude do it** (18 Nov 2026): on the new computer, install VS Code
and the Claude Code add-on and sign in to Claude. Paste the link of the
GitHub copy into the Claude chat and say "install".

- With this Dropbox folder on the computer, Claude installs from it:
  everything, with the memory notes and the startup screen.
- Without it, Claude installs the anonymous GitHub copy: no memory notes, no
  startup screen, placeholders for names.

INSTALL never throws anything away: every file it replaces is first copied
to `C:\Users\<you>\setup-backup-<date>`.

Only some parts, or first a look: `scripts\install.ps1 -Plan` shows every
part (what it does, what it downloads, which files it replaces) and changes
nothing. `-Parts settings,r` installs only those parts (the list is at the
top of install.ps1).

## Someone else installing it (from the GitHub copy)

They open the copy in VS Code, or paste its link into the Claude chat, and
ask Claude Code to install the setup. Claude reads `CLAUDE.md` at the top
of the copy first and follows it (its source here is
`scripts\github-CLAUDE.md`): it puts the copy in a folder that stays
(`C:\Users\<you>\vscode-setup`), shows the parts, lets them tick what they
want, lists every program, add-on and package that will be downloaded, asks
for a yes, then installs and lists the steps left to do by hand.

## Keeping this folder up to date

**SAVE.cmd** copies this computer's setup into this folder. Double-click it
after you change a setting yourself. Claude runs it after it changes the
setup.

Change the real files on the computer, not the copies here: SAVE overwrites
the copies.

Change these four in this folder instead (SAVE leaves them alone):

- `R\watch.R` and `R\Rprofile.R`: R uses them straight from here.
- `VS Code\local.r-pipe-indent-0.1.0`: the Enter add-on. Afterwards copy it
  to the computer (note, section 5).
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
- `scripts` : the programs behind INSTALL and SAVE, and `check-vscode.ps1`:
  run it when Claude does not open in a window (it checks that every window
  is run by the real VS Code, not by a test copy; `-Fix` repairs)
- `saved-from.txt` : when, and from which computer, SAVE last saved a change
- `VSCode as RStudio.md` : the full description of the setup
