---
description: List past Claude Code chats for this folder and open one in a new tab
---
1. Find the session files for the current project in ~/.claude/projects/ (the folder whose name matches the current working directory path with special characters replaced by dashes; match case-insensitively, the drive letter can be `c--` or `C--`). Each .jsonl file is one chat; the filename is the session ID. Skip the current session (usually the most recently modified file).
2. Sort by file last-modified time, newest first, and take max 15.
3. Get each chat's title from the .jsonl file (one JSON object per line, read as UTF-8). Title lines look like this:
   - `{"type":"ai-title","aiTitle":"Clean the survey data",...}`: the automatic title, present in almost every chat and repeated many times
   - `{"type":"agent-name","agentName":"...",...}`: a name the user set
   - Older or other versions may also use `{"type":"custom-title","customTitle":"..."}` (user-set) or `{"type":"summary","summary":"..."}` (automatic).
   Use the last occurrence in the file. Prefer a user-set name (`agentName` / `customTitle`) over an automatic one (`aiTitle` / `summary`). Ignore `"type":"frame-link"` lines; their `title` is an artifact's title, not the chat's.
   If a chat has no title, fall back to its first real user message (the first `"type":"user"` line with text, skipping `isMeta` / `isCompactSummary` lines and text inside `<system-reminder>`, `<ide_selection>` and similar tags), shortened to ~80 characters.
4. Ask me which chat to open with the AskUserQuestion tool, so I get a clickable menu instead of a text list. One option per chat: label "<number>. <title>", description "Last active <date>" (last-modified, local time, e.g. "13 Oct 18:09"). The menu holds at most 4 options, so if there are more than 4 chats, first show the full numbered list (number, title, date) as text, put the 4 newest in the menu, and I'll type the number of any other chat in the "Other" box.
5. Open the chosen chat as a tab in the main editor area, from the project folder (the current working directory):
   - Windows, PowerShell tool: & powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\tools\chat-opener\open-chat.ps1" -Session <ID> -Title "<title>"
   - Windows, Bash tool: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w ~/.claude/tools/chat-opener/open-chat.ps1)" -Session <ID> -Title "<title>"
   - Mac: open "vscode://anthropic.claude-code/open?session=<ID>"
   - Linux: env -u ELECTRON_RUN_AS_NODE xdg-open "vscode://anthropic.claude-code/open?session=<ID>"
   On Windows the script hands the request to the "Claude Chat Opener" VS Code add-on (source in ~/.claude/tools/chat-opener/), which opens the chat as a tab. If the Claude side panel holds that chat, the add-on frees it and leaves the side panel with a new empty conversation, unless another chat is still working. The script prints where the chat ended up.
6. Tell me in one plain sentence where the chat opened. No technical details.
