# SessionStart hook: has VS Code a version the setup check has not passed yet? (20 Nov 2026)
#
# He asked on 20 Nov 2026 that every personal setting is checked after every new
# VS Code version. This hook only compares two version numbers (fast, no window):
#   - the newest VS Code installed in %LOCALAPPDATA%\Programs\Microsoft VS Code
#   - the last version scripts\check-update.ps1 passed (checked.txt next to this file)
# When they differ, it tells Claude to run check-update.ps1 first and report.
# Prints nothing when all is fine. Note section 12 of "VSCode as RStudio.md".

import json
import os
from pathlib import Path

home = Path.home()
vscode = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "Microsoft VS Code"
checked_file = home / ".claude" / "vscode-check" / "checked.txt"
setup = home / "<Dropbox>" / "<name>" / "VS Code setup"
script = setup / "scripts" / "check-update.ps1"


def installed_version():
    folders = [p for p in vscode.iterdir() if (p / "resources" / "app" / "package.json").exists()]
    if not folders:
        return None
    newest = max(folders, key=lambda p: p.stat().st_mtime)
    info = json.loads((newest / "resources" / "app" / "package.json").read_text(encoding="utf-8"))
    return info.get("version")


try:
    now = installed_version()
except OSError:
    now = None

checked = checked_file.read_text(encoding="ascii").strip() if checked_file.exists() else "none"

if now and now != checked:
    message = (
        f"VS Code is now version {now}, and the setup check has not passed on it yet "
        f"(last passed: {checked}). the user wants every personal setting checked after every "
        f"new VS Code version. Before anything else this chat, run "
        f"powershell -NoProfile -ExecutionPolicy Bypass -File \"{script}\" "
        f"(about 2 minutes), tell him the result in a few lines, and fix every WRONG "
        f"through /personalsettings. Then run it again until it says ALL FINE."
    )
    output = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": message,
        }
    }
    print(json.dumps(output))
