'use strict';
// Test: the black boxes in the Claude Code chat (code blocks, tool output) fit inside a narrow
// side panel. Uses the REAL webview\index.css and the real class names of every installed
// Claude Code version, renders them in headless Edge at side-panel width (300 px) in three
// page layouts (plain, flex, grid), and measures each box: its right edge stays inside the
// panel and nothing is hidden to the side. As a control the same page with our block taken
// out must fail, so the test can see the problem. Last, it lists the open VS Code windows
// that started before the patch (those still show the old boxes until Reload Window).
//
// Run (PowerShell):
//   $env:ELECTRON_RUN_AS_NODE = 1
//   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" "$HOME\.claude\tools\chat-opener\test-wrap.js" | Out-String
// Ends with "ALL PASS" or "FAILED: ..."; a picture of the patched page is saved in
// %TEMP%\claude-wrap-test\patched.png.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const wrap = require(path.join(__dirname, 'extension', 'wrap-code.js'));
const OUT = path.join(os.tmpdir(), 'claude-wrap-test');
const LOG = path.join(os.homedir(), '.claude', 'chat-opener', 'log.txt');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const failures = [];
function check(ok, what) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

// Real class names (with build hash) from the add-on's index.js.
function classNames(js) {
  const pick = (key) => {
    const m = new RegExp(`${key}:"(${key}_[A-Za-z0-9_-]+)"`).exec(js);
    return m ? m[1] : null;
  };
  const md = /root:"(root_[A-Za-z0-9_-]+)"[^}]*codeBlockWrapper:"(codeBlockWrapper_[A-Za-z0-9_-]+)"/.exec(js);
  return {
    root: md && md[1],
    codeBlockWrapper: md && md[2],
    toolResult: pick('toolResult'),
    previewPane: pick('previewPane'),
    previewBody: pick('previewBody'),
  };
}

const LONG_R = 'x &lt;- read_csv(file) %&gt;% filter(year == 2026, kommune_class == 5) %&gt;% mutate(share = pop_20_39 / pop_total)';
const LONG_PATH = 'C:\\Users\\someone\\.vscode\\extensions\\anthropic.claude-code-2.1.319-win32-x64\\webview\\index.css';
const ARROWS = '0301 Oslo       \u2192 county "03" \u2192 Southern Norway\n5001 Trondheim  \u2192 county "50" \u2192 Northern Norway   (50 is in north_counties)';

function page(cssUrl, c) {
  const codeBox = `<div class="${c.codeBlockWrapper}"><button>copy</button><pre><code>${LONG_R}\n${LONG_PATH}\n${ARROWS}</code></pre></div>`;
  const message = `<span class="${c.root}"><p>A reply with a code box:</p>${codeBox}<p>text after</p></span>`;
  const tool = `<div class="${c.toolResult}">${LONG_PATH}  ${LONG_R}</div>`;
  const layouts = {
    plain: (inner) => `<div>${inner}</div>`,
    flex: (inner) => `<div style="display:flex"><div>${inner}</div></div>`,
    grid: (inner) => `<div style="display:grid;grid-template-columns:16px 1fr"><span></span><div>${inner}</div></div>`,
  };
  let body = '';
  for (const [name, wrapIn] of Object.entries(layouts)) {
    body += `<div class="panel" data-layout="${name}">${wrapIn(message)}${wrapIn(tool)}</div>`;
  }
  const preview = `<div class="panel" data-layout="preview"><div class="${c.previewPane}"><div class="${c.previewBody}">` +
    `<span class="${c.root}"><div class="${c.codeBlockWrapper}"><pre><code>+-----+-----+\n| map | key |\n+-----+-----+</code></pre></div></span></div></div></div>`;
  // The measuring script; the result goes between markers the script text itself does not contain.
  const script = `
    const out = [];
    for (const panel of document.querySelectorAll('.panel')) {
      const edge = panel.getBoundingClientRect().right;
      const layout = panel.dataset.layout;
      const boxes = [['code block', panel.querySelector('.${c.codeBlockWrapper} pre')],
                     ['tool output', panel.querySelector('.${c.toolResult}')]];
      for (const [kind, el] of boxes) {
        if (!el) continue;
        if (layout === 'preview') {
          out.push({ layout, kind, ok: getComputedStyle(el).whiteSpace === 'pre', why: 'keeps its drawn layout' });
          continue;
        }
        const r = el.getBoundingClientRect();
        const inside = r.right <= edge + 0.5;
        const nothingHidden = el.scrollWidth <= el.clientWidth + 1;
        out.push({ layout, kind, ok: inside && nothingHidden,
          why: 'right edge ' + Math.round(r.right) + ' of panel ' + Math.round(edge) + ', content ' + el.scrollWidth + ' in ' + el.clientWidth });
      }
    }
    const res = document.createElement('div');
    res.textContent = '@@' + '@' + JSON.stringify(out) + '#' + '##';
    document.body.appendChild(res);`;
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssUrl}">
<style>body{margin:0;background:#1e1e1e;color:#ccc;font:13px sans-serif;--app-code-background:#000}
.panel{width:300px;flex:none;overflow:hidden;border-right:3px solid red;margin-bottom:12px}</style></head>
<body><main style="display:block;width:320px">${body}${preview}</main><script>${script}</script></body></html>`;
}

function edge(args) {
  return execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${path.join(OUT, 'edge-profile')}`, ...args],
  { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
}

function measure(htmlFile) {
  const dom = edge(['--dump-dom', `file:///${htmlFile.replace(/\\/g, '/')}`]);
  const m = /@@@(.*?)###/s.exec(dom);
  if (!m) throw new Error('Edge gave no result');
  return JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

function testVersion(name) {
  console.log(`\n${name}`);
  const dir = path.join(wrap.extensionsFolder(), name, 'webview');
  const cssFile = path.join(dir, 'index.css');
  const css = fs.readFileSync(cssFile, 'utf8');
  const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');

  check(css.endsWith(wrap.BLOCK), 'our CSS block (v2) is at the end of index.css');
  const c = classNames(js);
  check(Boolean(c.root && c.codeBlockWrapper && c.toolResult && c.previewPane && c.previewBody),
    `index.js still has the class names (${Object.values(c).join(', ')})`);
  // Markdown maps pre to a component (pre:({children:y})=>m(v9n,...)); that component must
  // draw the wrapper div around a pre. The short names change with every build.
  const comp = /pre:\(\{children:[\w$]+\}\)=>[\w$]+\(([\w$]+),/.exec(js);
  const body = comp ? js.slice(js.indexOf(`function ${comp[1]}(`), js.indexOf(`function ${comp[1]}(`) + 400) : '';
  check(body.includes('.codeBlockWrapper') && body.includes('"pre"'), 'code blocks are still drawn inside that wrapper');
  if (!c.root || !c.codeBlockWrapper || !c.toolResult) return;

  fs.mkdirSync(OUT, { recursive: true });
  const unpatchedCss = path.join(OUT, `${name}-unpatched.css`);
  fs.writeFileSync(unpatchedCss, wrap.stripOurs(css));
  const toUrl = (f) => `file:///${f.replace(/\\/g, '/')}`;
  const patchedHtml = path.join(OUT, 'patched.html');
  const unpatchedHtml = path.join(OUT, 'unpatched.html');
  fs.writeFileSync(patchedHtml, page(toUrl(cssFile), c));
  fs.writeFileSync(unpatchedHtml, page(toUrl(unpatchedCss), c));

  for (const r of measure(patchedHtml)) check(r.ok, `patched: ${r.kind}, ${r.layout} layout: ${r.why}`);
  const control = measure(unpatchedHtml).filter((r) => r.layout !== 'preview');
  check(control.some((r) => !r.ok), `control: without our block the boxes do run off (${control.filter((r) => !r.ok).length} of ${control.length})`);
  edge(['--window-size=340,1100', `--screenshot=${path.join(OUT, 'patched.png')}`, toUrl(patchedHtml)]);
}

// Open windows (opener processes still running) that started before index.css was patched.
function windowsToReload(cssTimes) {
  let lines = [];
  try { lines = fs.readFileSync(LOG, 'utf8').split('\n'); } catch { return []; }
  const started = new Map();
  for (const line of lines) {
    const m = /^(\S+) \[(\d+)\] activated for (.*)$/.exec(line);
    if (m) started.set(Number(m[2]), { time: Date.parse(m[1]), folder: m[3] || '(no folder)' });
  }
  // A logged process still counts as that window only if a Code process with that number
  // started at the logged time (Windows reuses process numbers).
  const running = new Map();
  try {
    const ids = [...started.keys()].join(',');
    const ps = `Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'Code' } | ` +
      `ForEach-Object { "$($_.Id) $($_.StartTime.ToUniversalTime().ToString('o'))" }; exit 0`;
    const text = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30000 });
    for (const line of text.split(/\r?\n/)) {
      const m = /^(\d+) (\S+)$/.exec(line.trim());
      if (m) running.set(Number(m[1]), Date.parse(m[2]));
    }
  } catch { /* no list: report nothing rather than guess */ }
  const newest = Math.max(...cssTimes);
  const stale = [];
  for (const [pid, w] of started) {
    const start = running.get(pid);
    const sameWindow = start !== undefined && Math.abs(start - w.time) < 10 * 60000;
    if (sameWindow && w.time < newest) stale.push(`${w.folder} (started ${new Date(w.time).toLocaleTimeString()})`);
  }
  return stale;
}

// apply() on fake Claude Code folders (run in a child process whose home is a temp folder):
// replaces our old block, leaves nothing else changed, does nothing the second time, and
// reports a version whose classes are gone.
function unitTest() {
  const ext = wrap.extensionsFolder();
  const ORIG = 'body{margin:0}\n.codeBlockWrapper_ab pre{white-space:pre}\n.toolResult_cd{white-space:pre}\n';
  const OLD = '\n/* patched by local.claude-chat-opener: code blocks wrap to the panel width */\n' +
    '[class*="codeBlockWrapper_"] pre{white-space:pre-wrap!important;overflow-wrap:anywhere;overflow-x:hidden!important}\n';
  const files = {
    'anthropic.claude-code-9.0.0': ORIG + OLD,
    'anthropic.claude-code-9.1.0': ORIG,
    'anthropic.claude-code-9.2.0': 'body{margin:0}\n',
  };
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(ext, name, 'webview'), { recursive: true });
    fs.writeFileSync(path.join(ext, name, 'webview', 'index.css'), text);
  }
  const read = (name) => fs.readFileSync(path.join(ext, name, 'webview', 'index.css'), 'utf8');
  const problems = [];
  const patched = wrap.apply(() => {}, problems);
  check(patched.join() === 'anthropic.claude-code-9.0.0,anthropic.claude-code-9.1.0', 'unit: patches the old-block and the unpatched version');
  check(read('anthropic.claude-code-9.0.0') === ORIG + wrap.BLOCK, 'unit: old block replaced, rest of the file unchanged');
  check(read('anthropic.claude-code-9.1.0') === ORIG + wrap.BLOCK, 'unit: block added to an unpatched file');
  check(read('anthropic.claude-code-9.2.0') === 'body{margin:0}\n', 'unit: a file without the classes is left alone');
  check(problems.length === 1 && problems[0].includes('9.2.0'), 'unit: that version is reported as a problem');
  check(wrap.apply().length === 0 && read('anthropic.claude-code-9.0.0') === ORIG + wrap.BLOCK, 'unit: a second run changes nothing');
}

if (process.env.WRAP_TEST_UNIT) {
  try { unitTest(); } catch (e) { check(false, `unit: ${e.message}`); }
  process.exitCode = failures.length ? 1 : 0;
  return;
}

{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-wrap-unit-'));
  try {
    const text = execFileSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 60000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WRAP_TEST_UNIT: '1', USERPROFILE: home, HOME: home } });
    process.stdout.write(text);
  } catch (e) {
    process.stdout.write(String(e.stdout || ''));
    failures.push('unit tests (see above)');
  }
  fs.rmSync(home, { recursive: true, force: true });
  const src = fs.readFileSync(path.join(__dirname, 'extension', 'extension.js'), 'utf8');
  let parses = true;
  try { new (require('vm').Script)(`(function (exports, require, module) {\n${src}\n})`); } catch { parses = false; }
  check(parses, 'extension.js parses');
}

const versions = wrap.claudeCodeFolders();
check(versions.length > 0, `Claude Code is installed (${versions.join(', ')})`);
check(Boolean(EDGE), 'Edge found for the render test');
if (EDGE) {
  for (const name of versions) {
    try { testVersion(name); } catch (e) { check(false, `${name}: ${e.message}`); }
  }
}
const cssTimes = versions.map((n) => fs.statSync(path.join(wrap.extensionsFolder(), n, 'webview', 'index.css')).mtimeMs);
const stale = cssTimes.length ? windowsToReload(cssTimes) : [];
console.log('');
if (stale.length) {
  console.log('RELOAD NEEDED in these open windows (Ctrl+Shift+P, "Reload Window"):');
  for (const w of stale) console.log(`  ${w}`);
} else {
  console.log('Every open window started after the patch.');
}
console.log(failures.length ? `\nFAILED: ${failures.length}\n  ${failures.join('\n  ')}` : '\nALL PASS');
process.exitCode = failures.length ? 1 : 0;
