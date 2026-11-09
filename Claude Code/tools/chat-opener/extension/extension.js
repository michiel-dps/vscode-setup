'use strict';
// Claude Chat Opener: opens a Claude Code chat as an editor tab when /chats asks for it.
// /chats drops ~/.claude/chat-opener/open-<id>.json ({session, cwd, title, time}); the window
// whose workspace matches cwd claims it, runs handler.js on it and writes done-<id>.json.
// handler.js is loaded fresh for every request, from ~/.claude/tools/chat-opener/extension/
// when that exists, so it can be changed without restarting VS Code.
// At start and then once a minute it also runs wrap-code.js (same place first): the black
// code boxes in the Claude chat wrap to the panel width, also after Claude Code updated itself.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.claude', 'chat-opener');
const LOG = path.join(DIR, 'log.txt');
const SOURCE_HANDLER = path.join(os.homedir(), '.claude', 'tools', 'chat-opener', 'extension', 'handler.js');
const SOURCE_WRAP = path.join(os.homedir(), '.claude', 'tools', 'chat-opener', 'extension', 'wrap-code.js');

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

// Runs at start and once a minute. A Claude Code version that is downloaded while VS Code
// runs gets patched before it is shown. Reload is only asked for when the version this
// window is showing right now had to be patched (its chat panel has the old stylesheet).
// A problem (Claude Code renamed its box classes) is logged once and shown once per window.
const wrapSeen = new Set();
function logOnce(msg) {
  if (wrapSeen.has(msg)) return;
  wrapSeen.add(msg);
  log(msg);
}
let wrapWarned = false;

function wrapCodeBlocks() {
  try {
    const file = fs.existsSync(SOURCE_WRAP) ? SOURCE_WRAP : path.join(__dirname, 'wrap-code.js');
    delete require.cache[require.resolve(file)];
    const problems = [];
    const patched = require(file).apply(logOnce, problems);
    if (problems.length > 0 && !wrapWarned) {
      wrapWarned = true;
      vscode.window.showWarningMessage('Claude Code changed how it draws its black code boxes, so they may run off the panel again. ' +
        'Ask Claude: "run test-wrap.js in .claude/tools/chat-opener and fix the box wrapping".');
    }
    if (patched.length === 0) return;
    const claude = vscode.extensions.getExtension('anthropic.claude-code');
    const shown = claude ? path.basename(claude.extensionPath).toLowerCase() : '';
    if (!patched.some((name) => name.toLowerCase() === shown)) return;
    const msg = 'Claude Code was updated. Reload Window so its black code boxes wrap to the panel width again.';
    vscode.window.showInformationMessage(msg, 'Reload Window').then((pick) => {
      if (pick) vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
  } catch (e) {
    log(`wrap-code failed: ${e}`);
  }
}

function activate(context) {
  fs.mkdirSync(DIR, { recursive: true });
  wrapCodeBlocks();
  const timer = setInterval(poll, 400);
  const wrapTimer = setInterval(wrapCodeBlocks, 60000);
  context.subscriptions.push({ dispose: () => { clearInterval(timer); clearInterval(wrapTimer); } });
  log(`activated for ${(vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath).join('; ')}`);
}

function deactivate() {}

module.exports = { activate, deactivate };
