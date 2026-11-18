'use strict'
// Test: brackets in the Claude chat box (extension\auto-brackets-page.js). Real key presses
// (Chrome DevTools protocol, Input.dispatchKeyEvent) in headless Edge, on an editable div like
// Claude Code's chat box (contenteditable plaintext-only, role textbox). Also checks that every
// installed Claude Code version has our block at the end of webview\index.js.
//
// Run (PowerShell):
//   $env:ELECTRON_RUN_AS_NODE = 1
//   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" "$HOME\.claude\tools\chat-opener\test-brackets.js" | Out-String
// Ends with "ALL PASS" or "FAILED: ...".

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const brackets = require(path.join(__dirname, 'extension', 'auto-brackets.js'))

const OUT = path.join(os.tmpdir(), 'claude-brackets-test')
const PORT = 9347
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))

const failures = []
function check(ok, what) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failures.push(what)
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

function testPage() {
  const page = fs.readFileSync(path.join(__dirname, 'extension', 'auto-brackets-page.js'), 'utf8')
  return `<!doctype html><html><body>
<div id="box" contenteditable="plaintext-only" role="textbox" style="width:400px;height:60px;border:1px solid"></div>
<script>window.inputs = 0
document.getElementById('box').addEventListener('input', () => { window.inputs = window.inputs + 1 })</script>
<script>${page}</script></body></html>`
}

async function connect() {
  for (let i = 0; i < 50; i = i + 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const tab = list.find((t) => t.type === 'page')
      if (tab) return new WebSocket(tab.webSocketDebuggerUrl)
    } catch { /* Edge not up yet */ }
    await wait(200)
  }
  throw new Error('Edge did not open its debugging port')
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true })
  const html = path.join(OUT, 'box.html')
  fs.writeFileSync(html, testPage())
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(OUT, 'edge-profile')}`, 'about:blank'], { stdio: 'ignore' })
  try {
    const socket = await connect()
    await new Promise((done) => socket.addEventListener('open', done))
    let id = 0
    const waiting = new Map()
    socket.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg.result)
        waiting.delete(msg.id)
      }
    })
    const send = (method, params = {}) => new Promise((done) => {
      id = id + 1
      waiting.set(id, done)
      socket.send(JSON.stringify({ id, method, params }))
    })
    const js = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value

    await send('Page.navigate', { url: `file:///${html.replace(/\\/g, '/')}` })
    await wait(1000)

    // set the box text and the cursor (or a selection from start to end)
    const setBox = (text, start, end = start) => js(`(() => {
      const box = document.getElementById('box')
      box.focus()
      box.textContent = ${JSON.stringify(text)}
      const r = document.createRange()
      const node = box.firstChild || box
      r.setStart(node, ${start})
      r.setEnd(node, ${end})
      getSelection().removeAllRanges()
      getSelection().addRange(r)
      window.inputs = 0
    })()`)
    // the box text with | where the cursor is
    const state = () => js(`(() => {
      const box = document.getElementById('box')
      const r = getSelection().getRangeAt(0)
      const before = document.createRange()
      before.selectNodeContents(box)
      before.setEnd(r.startContainer, r.startOffset)
      const at = before.toString().length
      return box.textContent.slice(0, at) + '|' + box.textContent.slice(at)
    })()`)
    const key = async (k, extra = {}) => {
      const text = k.length === 1 ? k : undefined
      const codes = { Backspace: 8 }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text, windowsVirtualKeyCode: codes[k], ...extra })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: codes[k], ...extra })
    }
    const type = async (keys) => {
      for (const k of keys) await key(k)
    }

    await setBox('', 0)
    await type(['m', 'e', 'a', 'n', '('])
    check(await state() === 'mean(|)', `( types () with the cursor inside: ${await state()}`)
    check(await js('window.inputs') >= 5, 'the chat box gets its normal input event')
    await type(['x'])
    check(await state() === 'mean(x|)', `typing inside: ${await state()}`)
    await type([')'])
    check(await state() === 'mean(x)|', `) before a ) steps over it: ${await state()}`)
    await type([')'])
    check(await state() === 'mean(x))|', `) with no ) after it types one: ${await state()}`)

    await setBox('mean(x)', 7)
    await type(['('])
    check(await state() === 'mean(x)(|)', `( at the end: ${await state()}`)

    await setBox('abc', 0)
    await type(['('])
    check(await state() === '(|abc', `( before a word types only ( (like VS Code): ${await state()}`)

    await setBox('mean x', 5, 6)
    await type(['('])
    check(await state() === 'mean (x)|', `( on a selection puts ( ) around it: ${await state()}`)

    await setBox('f', 1)
    await type(['('])
    await key('Backspace')
    check(await state() === 'f|', `Backspace between ( and ) deletes both: ${await state()}`)

    await setBox('f(a)', 2)
    await key('Backspace')
    check(await state() === 'f|a)', `Backspace after ( with text after deletes only (: ${await state()}`)

    await setBox('df', 2)
    await type(['[', 'x'])
    check(await state() === 'df[x|]', `[ types [] with the cursor inside: ${await state()}`)
    await type([']'])
    check(await state() === 'df[x]|', `] before a ] steps over it: ${await state()}`)

    await setBox('f', 1)
    await type(['{', 'x'])
    check(await state() === 'f{x|}', `{ types {} with the cursor inside: ${await state()}`)
    await type(['}'])
    check(await state() === 'f{x}|', `} before a } steps over it: ${await state()}`)

    await setBox('mean(x', 6)
    await type(['['])
    check(await state() === 'mean(x[|]', `[ at the end: ${await state()}`)
    await type([')'])
    check(await state() === 'mean(x[)|]', `) before a ] types a ) (no step over a different bracket): ${await state()}`)

    await setBox('a', 1)
    await type(['{'])
    await key('Backspace')
    check(await state() === 'a|', `Backspace between { and } deletes both: ${await state()}`)

    await setBox('a b', 2, 3)
    await type(['['])
    check(await state() === 'a [b]|', `[ on a selection puts [ ] around it: ${await state()}`)

    await setBox('', 0)
    await type(['('])
    await js("document.execCommand('undo')")
    check(await state() === '|', `Ctrl+Z (undo) takes the () away in one step: ${await state()}`)

    socket.close()
  } finally {
    edge.kill()
  }
}

async function main() {
  check(Boolean(EDGE), 'Edge found')
  if (EDGE) {
    try {
      await run()
    } catch (e) {
      check(false, `key test: ${e.message}`)
    }
  }
  const ours = brackets.block()
  try {
    new (require('vm').Script)(ours)
    check(true, 'our block parses as JavaScript')
  } catch (e) {
    check(false, `our block parses as JavaScript: ${e.message}`)
  }
  for (const name of brackets.claudeCodeFolders()) {
    const file = path.join(brackets.extensionsFolder(), name, 'webview', 'index.js')
    check(fs.readFileSync(file, 'utf8').endsWith(ours), `${name}: our block is at the end of webview\\index.js`)
  }
  console.log(failures.length ? `\nFAILED: ${failures.length}\n  ${failures.join('\n  ')}` : '\nALL PASS')
  process.exitCode = failures.length ? 1 : 0
}

main()
