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

3. the user typing in the same .qmd or .md file (since 13 Nov 2026). When a
   Claude edit reaches the file while he types on the Word Page, the page
   keeps its own text and writes it back over the file: the edit is lost
   (the red bar on the page). So before the edit this script waits until he
   has not typed in that file for 5 seconds (at most 90 s; after that the
   edit is refused and Claude is told to try again later). It knows when he
   last typed from %LOCALAPPDATA%\\word-page\\typing.json, written by the
   Word Page add-on (typing.js). When he typed in the last 2 minutes, the
   hook after the edit waits 3 seconds and checks that the page kept the
   edit; when the old text is back, Claude is told to read the file again
   and make the same edit again. This comes before 1, so VS Code's snapshot
   already has what he typed while Claude waited.

Claude Code runs this from hooks in ~/.claude/settings.json:
  pre    (PreToolUse, Edit|Write|MultiEdit)          : wait for typing + stage + "about to edit"
  post   (PostToolUse, Edit|Write|MultiEdit)         : "done" + did the page keep it
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


# --- the user typing in the same file on the Word Page (13 Nov 2026) --------------

WORD_PAGE = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "word-page"
TYPING_MARKS = WORD_PAGE / "typing.json"   # written by the Word Page add-on (typing.js)
TYPING_EXTS = {".qmd", ".md"}
QUIET_SECONDS = 5      # he must have stopped typing this long before Claude writes
LONGEST_WAIT = 90      # still typing after this: the edit is refused, Claude tries later
ACTIVE_SECONDS = 120   # typed this recently: after the edit, check that the page kept it
CHECK_SECONDS = 3      # the page writes its own text back within this time, if at all
AROUND = 40            # letters before and after Claude's change that must match
LOG = Path(tempfile.gettempdir()) / "word-page.log"   # the Word Page add-on's log


def typing_watched(file):
    if not file:
        return False
    low = str(file).lower().replace("/", "\\")
    return Path(file).suffix.lower() in TYPING_EXTS and not any(s in low for s in SKIP)


def log(text):
    try:
        stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
        with open(LOG, "a", encoding="utf8") as out:
            out.write(stamp + "  " + text + "\n")
    except OSError:
        pass


def last_typed(file):
    """When the user last typed in `file` in VS Code (seconds since 1970), or 0.

    The add-on puts a new typing.json in place several times a second while he
    types; a read at that very moment can fail, so it is tried again (a failed
    read must not look like "he stopped typing"). A file that stays unreadable
    for half a second is broken, not being replaced: then it holds nothing up.
    """
    key = os.path.normcase(os.path.abspath(file))
    for attempt in range(10):
        if not TYPING_MARKS.exists():
            return 0
        try:
            marks = json.loads(TYPING_MARKS.read_text(encoding="utf8"))
            return marks.get(key, 0) / 1000
        except Exception:
            time.sleep(0.05)
    return 0


def changed_at(file):
    try:
        return os.stat(file).st_mtime
    except OSError:
        return 0


def wait_until_quiet(data, file):
    """Before Claude's edit: wait until the user has stopped typing in `file`.

    Returns (message, seconds waited). A message means the edit must not happen
    now: the hook refuses it, and Claude reads the message.
    """
    name = Path(file).name
    began = time.time()
    file_time = changed_at(file)
    while time.time() - last_typed(file) < QUIET_SECONDS:
        if time.time() - began > LONGEST_WAIT:
            log("claude: the user kept typing in %s for %d s; the edit was refused, "
                "Claude tries again later" % (name, LONGEST_WAIT))
            return ("the user has been typing in %s on the Word Page for %d seconds, so your "
                    "edit was not made (the page would have written his text over it). Do "
                    "other work first, or try the same edit again in a minute. Read the file "
                    "again before the edit." % (name, LONGEST_WAIT)), 0
        time.sleep(0.5)
    waited = time.time() - began
    if waited < 0.1:
        return None, 0
    log("claude: waited %.0f s until the user stopped typing in %s" % (waited, name))
    if data.get("tool_name") == "Write" and changed_at(file) != file_time:
        return ("the user typed in %s while your Write waited for him to stop, so your text is "
                "out of date and would wipe out what he typed. Read the file again and make "
                "your change on the new text (an Edit is safer than a Write here)." % name), waited
    return None, waited


def before_copy(data):
    return WORD_PAGE / ("before-" + job_id(data) + ".txt")


def keep_before(data, file):
    """Just before the edit: when the user typed in the file lately, keep a copy of it,
    so the hook after the edit can see whether the page kept the edit."""
    if not job_id(data) or time.time() - last_typed(file) > ACTIVE_SECONDS:
        return
    try:
        text = Path(file).read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    WORD_PAGE.mkdir(parents=True, exist_ok=True)
    before_copy(data).write_text(text, encoding="utf8")
    for old in WORD_PAGE.glob("before-*.txt"):   # copies left by edits that never finished
        try:
            if time.time() - old.stat().st_mtime > 3600:
                old.unlink()
        except OSError:
            pass


def drop_before(data):
    if job_id(data):
        try:
            before_copy(data).unlink()
        except OSError:
            pass


def plain(text):
    return (text or "").replace("\r\n", "\n")


def edit_lost(before, now, tool, tool_input):
    """True when `now` (the file a moment after Claude's edit) has the old text back
    where Claude changed it: the page wrote its own text over the edit.

    Only the old text WITH the letters around it counts as proof: the page may write
    Claude's new text a little differently (its own markdown), so a missing new text
    proves nothing.
    """
    if tool == "Write":
        after = plain(tool_input.get("content"))
        if now == after:
            return False
        before_lines = set(before.split("\n"))
        after_lines = set(after.split("\n"))
        now_lines = set(now.split("\n"))
        removed = [line for line in before_lines if line.strip() and line not in after_lines]
        if removed:   # at least half of the lines Claude took out are back
            return 2 * sum(line in now_lines for line in removed) >= len(removed)
        added = [line for line in after_lines if line.strip() and line not in before_lines]
        return bool(added) and not any(line in now_lines for line in added)
    edits = tool_input.get("edits") or [tool_input]
    after = before
    for edit in edits:
        old, new = plain(edit.get("old_string")), plain(edit.get("new_string"))
        if not old or old not in after:
            return False   # Claude Code matched it some other way: no check
        after = after.replace(old, new) if edit.get("replace_all") else after.replace(old, new, 1)
    if now == after:
        return False
    for edit in edits:
        old = plain(edit.get("old_string"))
        place = before.find(old)
        old_around = before[max(0, place - AROUND):place + len(old) + AROUND]
        if old_around in after:
            continue   # that text is still there after a good edit too: no proof
        if old_around in now:
            return True
    return False


def check_page_kept_it(data, file):
    """After Claude's edit: wait a moment, then check that the page did not write its
    own text back over the edit. Returns a message for Claude, or None."""
    copy = before_copy(data)
    if not job_id(data) or not copy.exists():
        return None   # he did not type in this file lately
    try:
        before = plain(copy.read_text(encoding="utf8"))
    finally:
        drop_before(data)
    time.sleep(CHECK_SECONDS)
    try:
        now = plain(Path(file).read_text(encoding="utf8"))
    except (OSError, UnicodeDecodeError):
        return None
    if not edit_lost(before, now, data.get("tool_name"), data.get("tool_input", {})):
        return None
    name = Path(file).name
    log("claude: the page wrote its own text over Claude's edit of %s (the user was typing); "
        "Claude was told to make it again" % name)
    return ("Your edit of %s was lost: the user was typing on the Word Page at that moment, and "
            "the page wrote its own text back over the file (what he typed is safe). Read the "
            "file again and make the same edit again." % name)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what in ("pre", "post", "failed", "stop"):
        data = read_hook_input()
        f = data.get("tool_input", {}).get("file_path")
        refuse = None    # a message for Claude: the edit must not happen now / was lost
        try:
            if what == "pre":
                if typing_watched(f):   # first wait, so VS Code's snapshot has what he typed
                    refuse, waited = wait_until_quiet(data, f)
                    if waited and not refuse:
                        print(json.dumps({"systemMessage": "Claude waited %.0f s: you were typing in %s."
                                          % (waited, Path(f).name)}))
                if not refuse and wanted(f):
                    stage(f)
                    show_in_vscode(data, f)
                if not refuse and typing_watched(f):
                    keep_before(data, f)
            elif what == "post":
                if wanted(f):
                    done_in_vscode(data)
                if typing_watched(f):
                    refuse = check_page_kept_it(data, f)
            elif what == "failed":
                if wanted(f):
                    done_in_vscode(data)
                if typing_watched(f):
                    drop_before(data)
            elif what == "stop" and SIGNALS.exists():
                stop_in_vscode(data)
        except Exception:
            pass   # a hook must never block Claude's edit by accident
        if refuse:
            print(refuse, file=sys.stderr)
            sys.exit(2)   # pre: the edit is not made; post: Claude reads why
    elif what == "stage" and len(sys.argv) > 2:
        stage(sys.argv[2])
    else:
        print(__doc__)
