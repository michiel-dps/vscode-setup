"""Keep the laptop awake while Claude Code works, also when it is locked.

Started by two hooks in ~/.claude/settings.json (SessionStart and
UserPromptSubmit): `python -I awake.py`. That starts a small keeper in the
background (pythonw, no window) and returns at once.

The keeper asks Windows not to sleep (SetThreadExecutionState with
ES_SYSTEM_REQUIRED, the same request a video player or a download makes).
The screen may still turn off and the laptop stays locked; only sleep and
hibernate after "no mouse or keyboard" are held off. Closing the lid and the
power button still work as always.

It lets go by itself once Claude has written nothing for IDLE_MINUTES: no
chat transcript (~/.claude/projects/**/*.jsonl, subagents included) has
changed. Windows' own sleep timer then counts again from zero.

Only one keeper runs at a time (a lock file); a second one exits at once.
Log: %LOCALAPPDATA%/claude-awake/log.txt

Test options: awake.py keep --idle <minutes> --check <seconds> --folder <dir>
"""

import ctypes
import msvcrt
import os
import subprocess
import sys
import time

IDLE_MINUTES = 30        # let go after this long without anything from Claude
CHECK_SECONDS = 60       # how often the keeper looks

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001

STATE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "claude-awake")
LOG_FILE = os.path.join(STATE_DIR, "log.txt")
LOCK_FILE = os.path.join(STATE_DIR, "keeper.lock")
PROJECTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")


def log(text):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S") + "  " + text + "\n")
    except OSError:
        pass


def newest_change(folder):
    """Time of the most recent change to any .jsonl file under folder."""
    newest = 0.0
    for root, _dirs, files in os.walk(folder):
        for name in files:
            if name.endswith(".jsonl"):
                try:
                    newest = max(newest, os.path.getmtime(os.path.join(root, name)))
                except OSError:
                    pass
    return newest


def start_keeper():
    """Called by the hooks: start the keeper in the background, return at once."""
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    if not os.path.exists(pythonw):
        pythonw = sys.executable
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(
        [pythonw, "-I", os.path.abspath(__file__), "keep"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,      # never hold the hook's output open
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
    )


def option(name, default):
    if name in sys.argv:
        return sys.argv[sys.argv.index(name) + 1]
    return default


def keep():
    idle = float(option("--idle", IDLE_MINUTES)) * 60
    check = float(option("--check", CHECK_SECONDS))
    folder = option("--folder", PROJECTS)

    os.makedirs(STATE_DIR, exist_ok=True)
    lock = open(LOCK_FILE, "a+")
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return                          # a keeper is already running

    kernel32 = ctypes.windll.kernel32
    kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
    log("awake: Claude is working, the laptop will not sleep")
    try:
        while True:
            quiet = time.time() - newest_change(folder)
            if quiet > idle:
                break
            kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
            time.sleep(check)
    finally:
        kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        log("released: nothing from Claude for %d minutes, normal sleep again" % round(idle / 60))


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "keep":
            keep()
        else:
            start_keeper()              # prints nothing: hook output would go to Claude
    except Exception as error:          # a hook must never block Claude
        log("ERR " + repr(error))
    sys.exit(0)
