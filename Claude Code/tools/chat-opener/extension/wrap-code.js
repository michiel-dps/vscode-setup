'use strict';
// The black boxes in the Claude Code chat (code blocks and tool output) wrap to the width of
// the panel instead of running off its right edge. The Claude Code add-on has no setting for
// this: its webview/index.css gives those boxes white-space:pre. apply() puts our CSS block at
// the end of that file, in every installed Claude Code version, and replaces an older block
// of ours. Claude Code updates itself often (a new folder with a fresh index.css), so the chat
// opener runs this at every VS Code start and then once a minute: a new version is patched as
// soon as it is downloaded, before VS Code shows it.
//
// Test (real index.css in headless Edge, at panel width): ..\test-wrap.js
// By hand (prints "patched: ..." or "already in place"):
//   $env:ELECTRON_RUN_AS_NODE = 1
//   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" wrap-code.js | Out-String
// Undo: delete our block at the end of webview\index.css (from the "patched by" comment on).

const fs = require('fs');
const path = require('path');
const os = require('os');

const PREFIX = '/* patched by local.claude-chat-opener';
const MARK = `${PREFIX} v2: black code boxes wrap to the panel width */`;
// The class names our rules need in index.css (the part before the build hash).
const CLASSES = ['codeBlockWrapper_', 'toolResult_'];
const RULES = [
  // code blocks in Claude's replies
  '[class*="codeBlockWrapper_"] pre{white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow-x:hidden!important}',
  // tool output (Bash results and so on, when opened)
  '[class*="toolResult_"]{white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow-x:hidden!important}',
  // except the preview boxes of a question: they hold drawn layouts, and that box scrolls itself
  '[class*="previewBody_"] [class*="codeBlockWrapper_"] pre{white-space:pre!important;overflow-wrap:normal!important;overflow-x:visible!important}',
].join('\n');
const BLOCK = `\n${MARK}\n${RULES}\n`;

function extensionsFolder() {
  return path.join(os.homedir(), '.vscode', 'extensions');
}

function claudeCodeFolders() {
  let names;
  try { names = fs.readdirSync(extensionsFolder()); } catch { return []; }
  return names.filter((name) => /^anthropic\.claude-code-\d/.test(name));
}

// index.css without any block of ours (old or current); our block is always at the end.
function stripOurs(text) {
  const at = text.indexOf(`\n${PREFIX}`);
  return at >= 0 ? text.slice(0, at) : text;
}

// Returns the versions it patched; puts what it could not do in `problems`.
function apply(log = () => {}, problems = []) {
  const patched = [];
  for (const name of claudeCodeFolders()) {
    const css = path.join(extensionsFolder(), name, 'webview', 'index.css');
    try {
      const text = fs.readFileSync(css, 'utf8');
      const base = stripOurs(text);
      const missing = CLASSES.filter((c) => !base.includes(`.${c}`));
      if (missing.length > 0) {
        const problem = `${name}: class ${missing.join(', ')} not found, the add-on changed; patch by hand`;
        problems.push(problem);
        log(`wrap-code: ${problem}`);
        if (missing.length === CLASSES.length) continue;
      }
      if (text.endsWith(BLOCK)) continue;
      fs.writeFileSync(css, base + BLOCK);
      patched.push(name);
      log(`wrap-code: ${name}: patched`);
    } catch (e) {
      problems.push(`${name}: ${e}`);
      log(`wrap-code: ${name}: ${e}`);
    }
  }
  return patched;
}

module.exports = { apply, stripOurs, claudeCodeFolders, extensionsFolder, BLOCK, CLASSES };

if (require.main === module) {
  const patched = apply(console.log);
  console.log(patched.length ? `patched: ${patched.join(', ')}` : 'already in place');
}
