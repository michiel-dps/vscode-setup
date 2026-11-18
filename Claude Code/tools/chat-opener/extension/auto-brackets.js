'use strict'
// Brackets in the Claude chat box like in a code editor (18 Nov 2026): ( types (), and )
// steps over a ) that is already there. The Claude Code add-on has no setting for this.
// apply() puts auto-brackets-page.js at the end of webview/index.js in every installed Claude
// Code version, and replaces an older block of ours. wrap-code.js calls it, so it runs at
// every VS Code start and then once a minute, like the code box wrapping.
//
// Test (real key presses in headless Edge): ..\test-brackets.js
// Undo: delete our block at the end of webview\index.js (from the "auto-brackets by" comment on).

const fs = require('fs')
const path = require('path')
const os = require('os')

const PREFIX = '/* auto-brackets by local.claude-chat-opener'
const MARK = `${PREFIX} v2: ( [ { type () [] {} in the chat box, ) ] } step over */`
// what our script looks for in index.js: the chat box is an editable div with role textbox
const NEEDS = ['contentEditable:"plaintext-only"', 'role:"textbox"']

function block() {
  const page = fs.readFileSync(path.join(__dirname, 'auto-brackets-page.js'), 'utf8')
  return `\n${MARK}\n${page}`
}

function extensionsFolder() {
  return path.join(os.homedir(), '.vscode', 'extensions')
}

function claudeCodeFolders() {
  let names = []
  try {
    names = fs.readdirSync(extensionsFolder())
  } catch {
    return []
  }
  return names.filter((name) => /^anthropic\.claude-code-\d/.test(name))
}

// index.js without any block of ours (old or current), our block is always at the end
function stripOurs(text) {
  const at = text.indexOf(`\n${PREFIX}`)
  return at >= 0 ? text.slice(0, at) : text
}

// Returns the versions it patched, puts what it could not do in `problems`.
function apply(log = () => {}, problems = []) {
  const patched = []
  const ours = block()
  for (const name of claudeCodeFolders()) {
    const js = path.join(extensionsFolder(), name, 'webview', 'index.js')
    // no index.js: not a whole Claude Code folder (or a test folder), wrap-code reports changes
    if (!fs.existsSync(js)) continue
    try {
      const text = fs.readFileSync(js, 'utf8')
      if (text.endsWith(ours)) continue
      const base = stripOurs(text)
      const missing = NEEDS.filter((piece) => !base.includes(piece))
      if (missing.length > 0) {
        const problem = `${name}: chat box not found (${missing.join(', ')}), the add-on changed. Brackets not patched`
        problems.push(problem)
        log(`auto-brackets: ${problem}`)
        continue
      }
      fs.writeFileSync(js, base + ours)
      patched.push(name)
      log(`auto-brackets: ${name}: patched`)
    } catch (e) {
      problems.push(`${name}: ${e}`)
      log(`auto-brackets: ${name}: ${e}`)
    }
  }
  return patched
}

module.exports = { apply, stripOurs, block, claudeCodeFolders, extensionsFolder, PREFIX }

if (require.main === module) {
  const patched = apply(console.log)
  console.log(patched.length ? `patched: ${patched.join(', ')}` : 'already in place')
}
