'use strict';
// What Chat Opener does with one request. extension.js reloads this file for every request,
// so edits to ~/.claude/tools/chat-opener/extension/handler.js apply without restarting VS Code.
//
// Claude Code shows a chat in the side panel instead of a tab when the side panel holds it
// (shows it, or showed it last). Then the side panel's Claude view is closed to free the chat,
// the chat is opened as a tab, and the side panel comes back with a new empty conversation.
// Closing that view stops whatever runs in it, so this is skipped while a chat is mid-turn.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SIDEBAR_VIEW_IDS = ['claudeVSCodeSidebarSecondary', 'claudeVSCodeSidebar'];
const STALE_TURN_MS = 15 * 60000;
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function claudeTabs() {
  const tabs = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputWebview && /claudeVSCodePanel/.test(tab.input.viewType)) tabs.push(tab);
    }
  }
  return tabs;
}

function activeClaudeLabel() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  return tab && tab.input instanceof vscode.TabInputWebview && /claudeVSCodePanel/.test(tab.input.viewType) ? tab.label : undefined;
}

function sameTitle(label, title) {
  const a = String(label || '').trim().toLowerCase();
  const b = String(title || '').trim().toLowerCase();
  if (!a || !b) return false;
  const n = Math.min(a.length, b.length, 30);
  return a.replace(/[.…]+$/, '').slice(0, n) === b.slice(0, n);
}

// Asks Claude Code to open the chat, then watches the tabs to see whether a tab got it.
async function tryOpenInTab(session, title) {
  const beforeCount = claudeTabs().length;
  const beforeActive = activeClaudeLabel();
  await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', session);
  for (let waited = 0; waited < 4000; waited += 250) {
    await sleep(250);
    const tabs = claudeTabs();
    if (tabs.length > beforeCount) return true;
    const active = activeClaudeLabel();
    if (active !== undefined && active !== beforeActive) return true;
    if (title && tabs.some((t) => t.isActive && sameTitle(t.label, title))) return true;
  }
  return false;
}

// True when the chat's last conversation entry shows a turn still going: a prompt or tool result
// waiting for Claude, or a Claude message that called a tool (running, or waiting for permission).
// Opening a chat only appends bookkeeping lines, so those are skipped. A turn left unfinished for
// STALE_TURN_MS is treated as abandoned.
function midTurn(file) {
  let text;
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return false; }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    if ((e.type !== 'user' && e.type !== 'assistant') || !e.message || e.isMeta || e.isSidechain) continue;
    if (Date.now() - Date.parse(e.timestamp) > STALE_TURN_MS) return false;
    const content = Array.isArray(e.message && e.message.content) ? e.message.content : [];
    if (e.type === 'assistant') return e.message.stop_reason === 'tool_use' || content.some((c) => c.type === 'tool_use');
    const said = typeof e.message.content === 'string' ? e.message.content : content.map((c) => c.text || '').join('');
    return !said.startsWith('[Request interrupted');
  }
  return false;
}

// Chats in the same project folder that are mid-turn, apart from the newest one (the chat that is
// running /chats right now). Closing the side panel's Claude view would stop any of them running there.
function busyChats(session) {
  const projects = path.join(os.homedir(), '.claude', 'projects');
  try {
    for (const dir of fs.readdirSync(projects)) {
      const folder = path.join(projects, dir);
      if (!fs.existsSync(path.join(folder, `${session}.jsonl`))) continue;
      const chats = fs.readdirSync(folder)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => ({ id: f.slice(0, -6), file: path.join(folder, f), mtime: fs.statSync(path.join(folder, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      return chats.filter((c, i) => (i > 0 || c.id === session) && midTurn(c.file)).map((c) => c.id);
    }
  } catch { /* fall through */ }
  return [];
}

// Claude Code only sends a chat to the side panel when its preferred location is "sidebar",
// so set that for the duration of the call and put the old value back. No session means a
// new empty conversation.
async function showInSidebar(session) {
  const cfg = vscode.workspace.getConfiguration('claudeCode');
  const info = cfg.inspect('preferredLocation') || {};
  const target = info.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
    : info.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const previous = target === vscode.ConfigurationTarget.WorkspaceFolder ? info.workspaceFolderValue
    : target === vscode.ConfigurationTarget.Workspace ? info.workspaceValue
    : info.globalValue;
  await cfg.update('preferredLocation', 'sidebar', target);
  try {
    await vscode.commands.executeCommand('claude-vscode.editor.open', session, undefined, undefined, undefined, undefined,
      { programmatic: 'honor-preferred-location' });
  } finally {
    await cfg.update('preferredLocation', previous, target);
  }
}

async function openInTab(session, title, log) {
  if (await tryOpenInTab(session, title)) {
    log(`${session}: opened in a tab`);
    return { ok: true, where: 'tab', message: 'Opened as a tab in the main editor area.' };
  }

  // Not in a tab, so Claude Code showed it in the side panel.
  const busy = busyChats(session);
  if (busy.length) {
    log(`${session}: side panel holds it, but these chats are mid-turn: ${busy.join(', ')}; left it there`);
    return { ok: false, where: 'sidebar', message: 'The side panel had this chat, and another chat in this folder is still working, so the side panel was left alone to avoid stopping it. The chat is shown in the side panel.' };
  }

  const removed = [];
  for (const id of SIDEBAR_VIEW_IDS) {
    try {
      await vscode.commands.executeCommand(`${id}.removeView`);
      removed.push(id);
    } catch { /* this layout has no such view */ }
  }
  log(`${session}: side panel held it; closed views [${removed.join(', ')}]`);
  await sleep(1000);

  const opened = await tryOpenInTab(session, title);

  // Bring the side panel back with a new empty conversation. Reopening it plainly would restore
  // its last chat, which is the one just opened as a tab.
  if (removed.length) {
    try {
      await showInSidebar(undefined);
    } catch (e) {
      log(`${session}: reopening the side panel with a new conversation failed: ${e}`);
      for (const id of removed) await vscode.commands.executeCommand(`${id}.focus`).then(undefined, () => {});
    }
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }

  log(`${session}: after freeing the side panel, opened in a tab: ${opened}`);
  return opened
    ? { ok: true, where: 'tab', message: 'The side panel had this chat; it was freed and the chat opened as a tab in the main editor area. The side panel now has a new empty conversation.' }
    : { ok: false, where: 'unknown', message: 'Freed the side panel, but no tab appeared for the chat.' };
}

async function handle(req, { log }) {
  if (!SESSION_RE.test(req.session || '')) return { ok: false, where: 'error', message: 'invalid session id' };
  if (req.action === 'sidebar') { // for testing: put a chat in the side panel
    await showInSidebar(req.session);
    return { ok: true, where: 'sidebar', message: 'Shown in the side panel.' };
  }
  return openInTab(req.session, req.title, log);
}

module.exports = { handle };
