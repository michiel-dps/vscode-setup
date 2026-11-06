"""review.py: make Claude's edits to R scripts show up as red/green changes in VS Code.

Two things happen around every Edit/Write of an R script (.R, .Rmd, .qmd):

1. VS Code's chat edit view (since 5 Nov 2026). Just before the edit, this
   script tells the Enter extension (local.r-pipe-indent, v0.5.0+) that Claude
   is about to edit the file, and waits (at most 10 s) until VS Code has taken
   a snapshot. Just after the edit it says "done". VS Code then shows the
   change exactly as it shows Copilot's edits: old lines red, new lines green,
   Keep / Undo per change, "1 of N" at the bottom of the editor (the
   extension's own chat session "claude-edits"; the chat panel is not
   touched). This only
   happens when a VS Code window with the extension has the file's folder
   open (it leaves a window-<pid>.json in %LOCALAPPDATA%\\claude-edits);
   otherwise nothing waits.

2. Git staging. Just before the edit the file is STAGED (git add), so the
   gutter marks only what Claude changed afterwards (Ctrl+Numpad2 opens the
   git peek with Revert Change / Stage Change). Needs a one-time VS Code
   setting: right-click a line number -> Diff Decorations -> untick
   "Git Local Changes (Index)".

Claude Code runs this from hooks in ~/.claude/settings.json:
  pre    (PreToolUse, Edit|Write|MultiEdit)          : stage + "about to edit"
  post   (PostToolUse, Edit|Write|MultiEdit)         : "done"
  failed (PostToolUseFailure, Edit|Write|MultiEdit)  : "done" (nothing changed)
  stop   (Stop)                                      : "done" for anything still open
By hand:
  stage <file>  : the same staging as pre, for one file
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EXTS = {".r", ".rmd", ".qmd"}
SKIP = ("appdata\\local\\temp", "\\.claude\\")   # Claude's own scratch files: never
SIGNALS = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "claude-edits"
ALIVE_SECONDS = 20    # a window-<pid>.json older than this belongs to a closed window
CLAIM_SECONDS = 2     # a window must take the job this fast, or Claude writes without it
WAIT_SECONDS = 10     # longest wait for VS Code's snapshot before Claude may write


def wanted(file):
    if not file:
        return False
    low = str(file).lower().replace("/", "\\")
    return Path(file).suffix.lower() in EXTS and not any(s in low for s in SKIP)


def read_hook_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def stage(file):
    file = Path(file)
    if not file.exists():
        return
    folder = file.parent
    inside = subprocess.run(
        ["git", "-C", str(folder), "rev-parse", "--is-inside-work-tree"],
        capture_output=True, text=True,
    )
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        return
    subprocess.run(["git", "-C", str(folder), "add", "--", str(file)], capture_output=True)


# --- VS Code's chat edit view --------------------------------------------------

def job_id(data):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(data.get("tool_use_id") or ""))


def same_or_inside(file, folder):
    file = os.path.normcase(os.path.abspath(file))
    folder = os.path.normcase(os.path.abspath(folder)).rstrip("\\")
    return file.startswith(folder + "\\")


def window_listens_for(file):
    """True when an open VS Code window with the extension has this file's folder open."""
    now = time.time()
    for beat in SIGNALS.glob("window-*.json"):
        try:
            if now - beat.stat().st_mtime > ALIVE_SECONDS:
                continue
            window = json.loads(beat.read_text(encoding="utf8"))
        except Exception:
            continue
        if window.get("paused"):   # its chat did not work just now
            continue
        if any(same_or_inside(file, folder) for folder in window.get("folders", [])):
            return True
    return False


def show_in_vscode(data, file):
    """Tell VS Code that Claude is about to edit `file`; wait for its snapshot."""
    jid = job_id(data)
    if not jid or not window_listens_for(file):
        return
    start = SIGNALS / (jid + ".start")
    ready = SIGNALS / (jid + ".ready")
    temp = SIGNALS / (jid + ".tmp")
    temp.write_text(json.dumps({"file": str(file), "session": data.get("session_id", "")}), encoding="utf8")
    os.replace(temp, start)
    claimed = SIGNALS / (jid + ".claimed")
    began = time.time()
    while time.time() < began + WAIT_SECONDS:
        if ready.exists():
            return
        if time.time() > began + CLAIM_SECONDS and not claimed.exists():
            break   # no window took it: the edit goes ahead without the chat view
        time.sleep(0.05)
    try:
        start.unlink()
    except OSError:
        pass


def done_in_vscode(data):
    """The edit is over (done or failed): VS Code may show it."""
    jid = job_id(data)
    if not jid:
        return
    try:
        (SIGNALS / (jid + ".start")).unlink()   # never taken by a window: nothing to finish
    except OSError:
        pass
    if (SIGNALS / (jid + ".claimed")).exists():
        (SIGNALS / (jid + ".done")).write_text("", encoding="utf8")


def stop_in_vscode(data):
    """Claude's turn ended: finish every edit of this chat that is still open."""
    session = data.get("session_id", "")
    for claimed in SIGNALS.glob("*.claimed"):
        try:
            info = json.loads(claimed.read_text(encoding="utf8"))
        except Exception:
            continue
        if info.get("session", "") == session:
            claimed.with_suffix(".done").write_text("", encoding="utf8")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what in ("pre", "post", "failed", "stop"):
        data = read_hook_input()
        f = data.get("tool_input", {}).get("file_path")
        try:
            if what == "pre" and wanted(f):
                stage(f)
                show_in_vscode(data, f)
            elif what in ("post", "failed") and wanted(f):
                done_in_vscode(data)
            elif what == "stop" and SIGNALS.exists():
                stop_in_vscode(data)
        except Exception:
            pass   # a hook must never block Claude's edit
    elif what == "stage" and len(sys.argv) > 2:
        stage(sys.argv[2])
    else:
        print(__doc__)
