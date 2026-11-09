'use strict';
// Code blocks in the Claude Code chat wrap to the width of the panel instead of scrolling
// sideways. The Claude Code add-on has no setting for this: its webview/index.css gives
// code blocks white-space:pre. apply() adds one CSS rule at the end of that file, in every
// installed Claude Code version that does not have it yet. Claude Code updates itself often
// (a new folder with a fresh index.css), so the chat opener runs this at every VS Code start
// and offers Reload Window when it had to patch.
//
// By hand (prints "patched: ..." or "already in place"):
//   $env:ELECTRON_RUN_AS_NODE = 1
//   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" wrap-code.js | Out-String
// Undo: delete the last two lines of webview\index.css (from the MARK comment on).

const fs = require('fs');
const path = require('path');
const os = require('os');

const MARK = '/* patched by local.claude-chat-opener: code blocks wrap to the panel width */';
const RULE = '[class*="codeBlockWrapper_"] pre{white-space:pre-wrap!important;' +
  'overflow-wrap:anywhere;overflow-x:hidden!important}';

function apply(log = () => {}) {
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  const patched = [];
  let names;
  try { names = fs.readdirSync(ext); } catch { return patched; }
  for (const name of names) {
    if (!/^anthropic\.claude-code-\d/.test(name)) continue;
    const css = path.join(ext, name, 'webview', 'index.css');
    try {
      const text = fs.readFileSync(css, 'utf8');
      if (text.includes(MARK)) continue;
      if (!text.includes('codeBlockWrapper_')) {
        log(`wrap-code: ${name}: class codeBlockWrapper_ not found, the add-on changed; patch by hand`);
        continue;
      }
      fs.appendFileSync(css, `\n${MARK}\n${RULE}\n`);
      patched.push(name);
      log(`wrap-code: ${name}: patched`);
    } catch (e) {
      log(`wrap-code: ${name}: ${e}`);
    }
  }
  return patched;
}

module.exports = { apply };

if (require.main === module) {
  const patched = apply(console.log);
  console.log(patched.length ? `patched: ${patched.join(', ')}` : 'already in place');
}
