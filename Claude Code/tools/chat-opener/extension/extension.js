'use strict';
// Claude Chat Opener: opens a Claude Code chat as an editor tab when /chats asks for it.
// /chats drops ~/.claude/chat-opener/open-<id>.json ({session, cwd, title, time}); the window
// whose workspace matches cwd claims it, runs handler.js on it and writes done-<id>.json.
// handler.js is loaded fresh for every request, from ~/.claude/tools/chat-opener/extension/
// when that exists, so it can be changed without restarting VS Code.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.claude', 'chat-opener');
const LOG = path.join(DIR, 'log.txt');
const SOURCE_HANDLER = path.join(os.homedir(), '.claude', 'tools', 'chat-opener', 'extension', 'handler.js');

let busy = false;

function log(msg) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 200000) fs.writeFileSync(LOG, '');
    fs.appendFileSync(LOG, `${new Date().toISOString()} [${process.pid}] ${msg}\n`);
  } catch { /* logging must never break opening */ }
}

function loadHandler() {
  const file = fs.existsSync(SOURCE_HANDLER) ? SOURCE_HANDLER : path.join(__dirname, 'handler.js');
  delete require.cache[require.resolve(file)];
  return require(file);
}

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function isForThisWindow(cwd) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!cwd) return folders.length > 0;
  const c = norm(cwd);
  return folders.some((f) => {
    const w = norm(f.uri.fsPath);
    return c === w || c.startsWith(w + '/');
  });
}

async function poll() {
  if (busy) return;
  let names;
  try { names = fs.readdirSync(DIR); } catch { return; }
  for (const name of names) {
    const m = /^open-([\w-]+)\.json$/.exec(name);
    if (!m) continue;
    const reqPath = path.join(DIR, name);
    let req;
    try { req = JSON.parse(fs.readFileSync(reqPath, 'utf8')); } catch { continue; }
    if (Date.now() - (req.time || 0) > 60000) { try { fs.unlinkSync(reqPath); } catch { /* gone */ } continue; }
    if (!isForThisWindow(req.cwd)) continue;
    const claimed = path.join(DIR, `claimed-${m[1]}-${process.pid}.json`);
    try { fs.renameSync(reqPath, claimed); } catch { continue; } // another window claimed it
    busy = true;
    let result;
    try {
      result = await loadHandler().handle(req, { log });
    } catch (e) {
      result = { ok: false, where: 'error', message: String(e) };
      log(`${req.session}: error ${e && e.stack || e}`);
    } finally {
      busy = false;
    }
    try { fs.writeFileSync(path.join(DIR, `done-${m[1]}.json`), JSON.stringify(result)); } catch (e) { log(`write result failed: ${e}`); }
    try { fs.unlinkSync(claimed); } catch { /* gone */ }
  }
}

function activate(context) {
  fs.mkdirSync(DIR, { recursive: true });
  const timer = setInterval(poll, 400);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  log(`activated for ${(vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath).join('; ')}`);
}

function deactivate() {}

module.exports = { activate, deactivate };
