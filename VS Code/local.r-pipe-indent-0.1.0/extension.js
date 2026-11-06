const vscode = require("vscode");

// RStudio-like Enter in R files.
//
//   x <- pwt %>%⏎                    -> statement indent + 1 level
//   filter(...) %>%⏎                 -> same
//   p <- ggplot(d, aes(x)) +⏎        -> same (any operator at the end of a line)
//   cor(a, b,⏎                       -> lined up under `a` (first argument)
//   mutate(a = 1, |) %>%⏎            -> under `a`; the ") %>%" moves down with the cursor
//   pivot_longer(a, |b = 1)⏎         -> "b = 1)" moves to a new line under `a` (a split argument list)
//   pivot_wider(⏎                    -> indent of that line + 1 level
//   select(...)⏎   (last line of a   -> back to the statement's indent
//                   multi-line statement)
//   anything else                    -> VS Code's default Enter
//
// Strings and comments are blanked out (keeping positions) before looking at
// brackets, so a "(" inside "text" does not count. Comment-only lines inside
// a statement (a comment above a pipe step) belong to the statement. Curly
// braces are left to VS Code: `{⏎` and `{⏎}` behave as in any language.
//
// Ctrl+Enter (runStatement): a selection is widened to whole statements, and
// an unfinished statement (unclosed bracket or quote, trailing %>%) is not
// sent: R would wait at a "+" prompt and swallow everything that follows.
//
// Ctrl+Shift+M (insertPipe): " %>%", without doubling a space already typed.
//
// Claude's edits (near the end of this file): shown in VS Code's own chat edit
// view, with Keep / Undo, through our own chat session type "claude-edits".

const PIPE_END = /(%>%|\|>)\s*$/;
// a line that cannot end a statement: ends in an operator, comma or open ( [
// (the same set the R extension uses for its own statement detection)
const CONT_END = /(%[^%\s]*%|<<-|->>|<-|->|\|\||[-+*/^=&|~,(\[!$:?<>])\s*$/;
const OPEN = { "(": ")", "[": "]", "{": "}" };
const CLOSE = { ")": "(", "]": "[", "}": "{" };

// Walk a line: string contents and comments become spaces (positions kept).
// Returns the blanked text and the quote still open at the end of the line.
function scan(text) {
  const out = text.split("");
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") { out[i] = " "; if (i + 1 < text.length) out[i + 1] = " "; i++; continue; }
      if (c === quote) { quote = null; continue; }
      out[i] = " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "#") { for (let j = i; j < text.length; j++) out[j] = " "; break; }
  }
  return { text: out.join(""), quote };
}

function blank(text) { return scan(text).text; }
function unterminatedQuote(text) { return scan(text).quote; }
function isBlank(text) { return text.trim() === ""; }
function isComment(text) { return /^\s*#/.test(text); }

// net number of ( and [ opened on a line (braces ignored)
function parenDelta(text) {
  let d = 0;
  for (const c of blank(text)) {
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
  }
  return d;
}

function indentOf(text) {
  return text.match(/^\s*/)[0];
}

function continues(prevBlanked) {
  return prevBlanked.trim() !== "" && (CONT_END.test(prevBlanked) || PIPE_END.test(prevBlanked));
}

// Nearest code line above `line`: comment-only lines are skipped, a blank line
// ends the search (a blank line separates statements). -1 if there is none.
function codeLineAbove(doc, line) {
  for (let i = line - 1; i >= 0; i--) {
    const t = doc.lineAt(i).text;
    if (isBlank(t)) return -1;
    if (!isComment(t)) return i;
  }
  return -1;
}

// Bracket depth ( [ at the end of `line`, counted from the nearest line above
// that does not continue into the next. Positive = still open.
function depthFrom(doc, line) {
  let depth = 0;
  let i = line;
  let guard = 0;
  while (i >= 0 && guard++ < 500) {
    depth += parenDelta(doc.lineAt(i).text);
    const k = codeLineAbove(doc, i);
    if (k < 0) break;
    if (!continues(blank(doc.lineAt(k).text)) && depth >= 0) break;
    i = k;
  }
  return depth;
}

// First line of the statement that `line` belongs to.
function statementStart(doc, line) {
  let start = line;
  let guard = 0;
  while (guard++ < 500) {
    const k = codeLineAbove(doc, start);
    if (k < 0) break;
    if (continues(blank(doc.lineAt(k).text)) || depthFrom(doc, k) > 0) start = k;
    else break;
  }
  return start;
}

// Brackets still open at the cursor, scanning from the statement's first line.
function openBrackets(doc, startLine, pos) {
  const stack = [];
  for (let i = startLine; i <= pos.line; i++) {
    let text = doc.lineAt(i).text;
    if (i === pos.line) text = text.slice(0, pos.character);
    const b = blank(text);
    for (let j = 0; j < b.length; j++) {
      const c = b[j];
      if (OPEN[c]) stack.push({ ch: c, line: i, col: j });
      else if (CLOSE[c] && stack.length && stack[stack.length - 1].ch === CLOSE[c]) stack.pop();
    }
  }
  return stack;
}

// Last code line at or above `line` (a selection may end on a comment line).
function codeLineAtOrAbove(doc, start, line) {
  let i = line;
  while (i > start && isComment(doc.lineAt(i).text)) i--;
  return i;
}

// Last line of the statement that `line` belongs to: keep going while the last
// code line ends in an operator or pipe, or a bracket opened in the statement
// is still open. Comment lines in between belong to the statement; a blank
// line or the end of the file stops the search.
function statementEnd(doc, line) {
  const start = statementStart(doc, line);
  let end = line;
  let guard = 0;
  while (guard++ < 500) {
    const code = codeLineAtOrAbove(doc, start, end);
    const cur = blank(doc.lineAt(code).text);
    const endPos = new vscode.Position(code, doc.lineAt(code).text.length);
    const open = openBrackets(doc, start, endPos).length > 0;
    if (!continues(cur) && !open) break;
    let next = end + 1;
    while (next < doc.lineCount && isComment(doc.lineAt(next).text)) next++;
    if (next >= doc.lineCount || isBlank(doc.lineAt(next).text)) break;
    end = next;
  }
  return end;
}

// Why the lines first..last cannot be run as they are; null when they can.
function unfinished(doc, first, last) {
  for (let i = first; i <= last; i++) {
    const q = unterminatedQuote(doc.lineAt(i).text);
    if (q) return "The quote " + q + " on line " + (i + 1) + " is never closed.";
  }
  const endPos = new vscode.Position(last, doc.lineAt(last).text.length);
  const open = openBrackets(doc, first, endPos);
  if (open.length) {
    const b = open[open.length - 1];
    return "The bracket " + b.ch + " on line " + (b.line + 1) + " is never closed.";
  }
  const code = codeLineAtOrAbove(doc, first, last);
  const tail = blank(doc.lineAt(code).text);
  const m = tail.match(PIPE_END) || tail.match(CONT_END);
  if (m && tail.trim() !== "") return "Line " + (code + 1) + " ends with " + m[1] + " and nothing follows it.";
  return null;
}

function unit(editor) {
  const o = editor.options;
  if (o.insertSpaces === false) return "\t";
  const n = typeof o.tabSize === "number" ? o.tabSize : 4;
  return " ".repeat(n);
}

// Text after the cursor that is only closing brackets, maybe followed by the
// operator that continues the line: ")", ") %>%", ")) + ". It moves down with
// the cursor without changing the indent rule, as in RStudio.
const CLOSERS = /^[)\]}][\s)\]}]*(%[^%\s]*%|\|>|[-+*/^&|~])?\s*$/;

async function onEnter() {
  const editor = vscode.window.activeTextEditor;
  const fallback = async () => { await vscode.commands.executeCommand("default:type", { text: "\n" }); return "default"; };
  if (!editor) return fallback();
  const doc = editor.document;
  const pos = editor.selection.active;
  const lineText = doc.lineAt(pos.line).text;
  const before = lineText.slice(0, pos.character);
  const after = lineText.slice(pos.character);
  const rest = after.replace(/^\s+/, "");                // what moves to the new line (its leading spaces go)
  const movesCode = rest !== "" && !CLOSERS.test(rest);  // real code after the cursor: a split argument list

  const code = blank(before);
  if (code.trim() === "") return fallback();
  const startLine = statementStart(doc, pos.line);
  const base = indentOf(doc.lineAt(startLine).text);
  const step = unit(editor);

  let indent = null;
  const open = openBrackets(doc, startLine, pos);
  if (open.length) {
    // 1. inside open brackets: under the first argument, or one level in when
    //    nothing stands between the bracket and the cursor
    const top = open[open.length - 1];
    if (top.ch === "{") return fallback();        // blocks: VS Code puts } on its own line
    const topLine = doc.lineAt(top.line).text;
    const upTo = top.line === pos.line ? pos.character : topLine.length;
    const afterBracket = blank(topLine).slice(top.col + 1, upTo).trim();
    indent = afterBracket === "" ? indentOf(topLine) + step : " ".repeat(top.col + 1);
  } else if (PIPE_END.test(code) || CONT_END.test(code)) {
    // 2. line ends in a pipe or another operator: one level in from the statement start
    indent = base + step;
  } else if (pos.line > startLine && !movesCode) {
    // 3. last line of a multi-line statement: back to the statement's indent
    indent = base;
  }
  if (indent === null) return fallback();

  // new line + indent; the spaces in front of the moved text are dropped
  const cut = new vscode.Range(pos, new vscode.Position(pos.line, pos.character + (after.length - rest.length)));
  const ok = await editor.edit((eb) => eb.replace(cut, "\n" + indent));
  if (!ok) return "edit failed";
  const p = new vscode.Position(pos.line + 1, indent.length);
  editor.selection = new vscode.Selection(p, p);
  return "indent " + indent.length;
}

// one line per Enter in %TEMP%\r-pipe-indent.log, so a wrong indent can be diagnosed
function log(msg) {
  try {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.env.TEMP || process.env.TMP || ".", "r-pipe-indent.log");
    fs.appendFileSync(file, new Date().toISOString() + " " + msg + "\n");
  } catch (e) { /* ignore */ }
}

function where(editor) {
  if (!editor) return "";
  const pos = editor.selection.active;
  return "line " + (pos.line + 1) + " col " + pos.character + " | " + JSON.stringify(editor.document.lineAt(pos.line).text);
}

async function onEnterLogged() {
  const editor = vscode.window.activeTextEditor;
  const w = where(editor);
  try {
    const r = await onEnter();
    log("ok   " + w + " -> " + r);
    return r;
  } catch (e) {
    log("ERR  " + w + " | " + (e && e.stack ? e.stack : e));
    return vscode.commands.executeCommand("default:type", { text: "\n" });
  }
}

// Ctrl+Enter. The R extension sends a selection exactly as selected, so a
// selection that starts on the 2nd line of a pipe sends a pipe without its
// first line ("object x not found"). Widen the selection to whole statements
// first. With or without a selection, refuse an unfinished statement: R would
// wait at a "+" prompt, and every later Ctrl+Enter would vanish into it.
async function runStatement() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const sel = editor.selection;
  let first, last;
  if (sel.isEmpty) {
    const t = doc.lineAt(sel.active.line).text;
    if (isBlank(t) || isComment(t)) return vscode.commands.executeCommand("r.runSelection");
    first = statementStart(doc, sel.active.line);
    last = statementEnd(doc, sel.active.line);
  } else {
    first = statementStart(doc, sel.start.line);
    let lastLine = sel.end.line;
    if (sel.end.character === 0 && lastLine > sel.start.line) lastLine--;   // selection ends at column 0: that line is not selected
    last = statementEnd(doc, lastLine);
    editor.selection = new vscode.Selection(first, 0, last, doc.lineAt(last).text.length);
    log("run  lines " + (first + 1) + "-" + (last + 1) + " (selection was " + (sel.start.line + 1) + "-" + (sel.end.line + 1) + ")");
  }
  const problem = unfinished(doc, first, last);
  if (problem) {
    log("stop lines " + (first + 1) + "-" + (last + 1) + ": " + problem);
    const choice = await vscode.window.showWarningMessage(
      problem + " Nothing was sent to R. (If the R terminal shows a + prompt, click in it and press Esc.)",
      "Send anyway");
    if (choice !== "Send anyway") return;
  }
  await vscode.commands.executeCommand("r.runSelection");
  if (!sel.isEmpty) {
    const next = Math.min(last + 1, doc.lineCount - 1);
    const p = new vscode.Position(next, 0);
    editor.selection = new vscode.Selection(p, p);
  }
}

async function runStatementLogged() {
  try {
    return await runStatement();
  } catch (e) {
    log("ERR  run " + where(vscode.window.activeTextEditor) + " | " + (e && e.stack ? e.stack : e));
    return vscode.commands.executeCommand("r.runSelection");
  }
}

// Ctrl+Shift+M, RStudio's pipe shortcut: " %>%", or "%>%" right after a space.
async function insertPipe() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await editor.edit((eb) => {
    for (const sel of editor.selections) {
      const before = editor.document.lineAt(sel.start.line).text.slice(0, sel.start.character);
      const text = (before === "" || /\s$/.test(before)) ? "%>%" : " %>%";
      eb.replace(sel, text);
    }
  });
}

// ---- Claude's edits shown like VS Code's own chat edits (since 5 Nov 2026) ----
// Claude Code writes its edits straight to disk. Its hooks (review.py in
// ~/.claude/review) tell this extension just before and just after each edit
// of an R script. In between, a request in our own chat session (type
// "claude-edits", never shown in a chat window) wraps the edit in
// stream.externalEdit(). VS Code's own chat edit view then shows it, exactly
// as for Copilot: old lines red (not in the file), new lines green, Keep /
// Undo per change, and "Keep / Undo / 1 of N" with arrows at the bottom of
// the editor. Needs the API proposals chatSessionsProvider and
// chatParticipantAdditions (argv.json: "enable-proposed-api").
//
// Files in SIGNALS (%LOCALAPPDATA%\claude-edits):
//   window-<pid>.json  this window listens, for these folders (renewed every 5 s)
//   <id>.start         hook: Claude is about to edit a file ({ file, session })
//   <id>.claimed       this window took the job (the other windows leave it)
//   <id>.ready         VS Code took its snapshot: the hook lets Claude write
//   <id>.done          hook: the edit is finished (or failed, or the turn ended)

const fs = require("fs");
const os = require("os");
const path = require("path");

const SIGNALS = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "claude-edits");
const JOB_TIMEOUT_MS = 5 * 60 * 1000;   // an edit still open after this is closed anyway
const NEXT_JOB_WAIT_MS = 1500;          // edits that follow quickly share one chat request
const HANDLER_WAIT_MS = 6000;           // chat request not started by then: give up on it (normal: < 1 s)
const SESSION = "claude-edits:/edits";  // our own chat session (type "claude-edits", package.json)
const PAUSE_MS = 2 * 60 * 1000;         // after such a failure, hooks skip this window this long

const edits = {
  jobs: new Map(),       // id -> job, claimed and not finished yet
  queue: [],             // jobs waiting for the chat request to pick them up
  opening: false,        // a chat request was sent; its handler has not started yet
  active: 0,             // chat requests (handlers) running now: 0 or 1
  wake: null,            // wakes the running chat request when a new job comes in
  watchdog: null,
  pausedUntil: 0,        // the chat did not work: leave Claude's edits alone until then
};

function signal(name) { return path.join(SIGNALS, name); }
function touch(name) { try { fs.writeFileSync(signal(name), ""); } catch (e) { /* ignore */ } }
function remove(name) { try { fs.unlinkSync(signal(name)); } catch (e) { /* ignore */ } }

// Tell the hooks that this window listens, and for which folders.
function writeHeartbeat() {
  const folders = (vscode.workspace.workspaceFolders || [])
    .filter((f) => f.uri.scheme === "file")
    .map((f) => f.uri.fsPath);
  try {
    fs.mkdirSync(SIGNALS, { recursive: true });
    const paused = Date.now() < edits.pausedUntil;
    fs.writeFileSync(signal("window-" + process.pid + ".json"), JSON.stringify({ pid: process.pid, folders, paused }));
  } catch (e) { log("ERR  edits heartbeat " + e); }
}

// Leftovers from crashed windows or old jobs.
function cleanOldSignals() {
  let names = [];
  try { names = fs.readdirSync(SIGNALS); } catch (e) { return; }
  const now = Date.now();
  for (const name of names) {
    try {
      const age = now - fs.statSync(signal(name)).mtimeMs;
      const limit = name.startsWith("window-") ? 60 * 1000 : 60 * 60 * 1000;
      if (name === "demo.json") continue;       // waits for the window that has its file
      if (age > limit && name !== "window-" + process.pid + ".json") remove(name);
    } catch (e) { /* ignore */ }
  }
}

function finishJob(job, why) {
  if (job.closed) return;
  job.closed = true;
  clearTimeout(job.timer);
  edits.jobs.delete(job.id);
  const i = edits.queue.indexOf(job);
  if (i >= 0) edits.queue.splice(i, 1);
  touch(job.id + ".ready");                 // never leave a hook waiting
  job.resolve();
  log("edits " + why + " " + path.basename(job.uri.fsPath));
  setTimeout(() => ["claimed", "ready", "done"].forEach((s) => remove(job.id + "." + s)), 3000);
}

// Look for new jobs and finished edits.
function scanSignals() {
  let names;
  try { names = fs.readdirSync(SIGNALS); } catch (e) { return; }
  for (const name of names) {
    if (name.endsWith(".start")) claimJob(name.slice(0, -".start".length));
    if (name.endsWith(".done")) {
      const job = edits.jobs.get(name.slice(0, -".done".length));
      if (job) finishJob(job, "done");
    }
  }
}

function claimJob(id) {
  if (edits.jobs.has(id) || Date.now() < edits.pausedUntil) return;
  let info;
  try { info = JSON.parse(fs.readFileSync(signal(id + ".start"), "utf8")); } catch (e) { return; }
  const uri = vscode.Uri.file(info.file);
  if (!vscode.workspace.getWorkspaceFolder(uri)) return;           // a file of another window
  try { fs.renameSync(signal(id + ".start"), signal(id + ".claimed")); } catch (e) { return; }   // another window was first
  // Claude edits one file at a time: an older open edit of the same chat is over
  for (const old of [...edits.jobs.values()]) if (old.session === info.session) finishJob(old, "next edit started");
  const job = { id, uri, session: info.session, closed: false };
  job.finished = new Promise((resolve) => { job.resolve = resolve; });
  job.timer = setTimeout(() => finishJob(job, "timed out"), JOB_TIMEOUT_MS);
  edits.jobs.set(id, job);
  edits.queue.push(job);
  log("edits start " + info.file);
  if (edits.wake) edits.wake();
  else if (!edits.opening && edits.active === 0) openRequest(job);
}

// Send a request with the file name to our own chat session SESSION. That
// session is not shown in any chat window, so the chat panel (and whatever
// chat it shows, e.g. a Copilot CLI session) and the cursor stay as they are.
// The file is NOT opened (since 6 Nov 2026: opening it made the editor jump to
// Claude's file on every edit); VS Code shows the red/green and Keep / Undo
// when the user opens the file himself. The command exists because package.json
// declares the chat session type "claude-edits" with canDelegate; it returns
// only when the request is finished, so it is not awaited here.
function openRequest(first) {
  edits.opening = true;
  clearTimeout(edits.watchdog);
  edits.watchdog = setTimeout(() => {
    if (!edits.opening) return;
    log("ERR  edits: the chat request did not start (Copilot signed in? argv.json proposals?); pausing 2 minutes");
    edits.opening = false;
    edits.pausedUntil = Date.now() + PAUSE_MS;   // hooks skip this window meanwhile: no waiting
    writeHeartbeat();
    [...edits.queue].forEach((job) => finishJob(job, "not shown"));
  }, HANDLER_WAIT_MS);
  (async () => {
    const uri = first.uri;
    await vscode.commands.executeCommand("workbench.action.chat.openSessionWithPrompt.claude-edits", {
      resource: vscode.Uri.parse(SESSION),
      prompt: path.basename(uri.fsPath),
    });
  })().catch((e) => log("ERR  edits send " + (e && e.stack ? e.stack : e)));
}

// The next job, or null when none comes in within NEXT_JOB_WAIT_MS.
function nextJob(token) {
  if (edits.queue.length) return Promise.resolve(edits.queue.shift());
  return new Promise((resolve) => {
    const timer = setTimeout(() => { edits.wake = null; resolve(null); }, NEXT_JOB_WAIT_MS);
    edits.wake = () => { clearTimeout(timer); edits.wake = null; resolve(edits.queue.shift() || null); };
    if (token.isCancellationRequested) edits.wake();
  });
}

// A request in our chat session: wraps every edit in externalEdit, so VS Code
// records it as a chat edit with Keep / Undo.
async function editsHandler(request, context, stream, token) {
  edits.opening = false;
  clearTimeout(edits.watchdog);
  if (edits.active > 0) {                  // a second request while one runs: that one takes the jobs
    stream.markdown("No changes.");
    return {};
  }
  edits.active++;
  const names = [];
  const cancel = token.onCancellationRequested(() => {
    [...edits.jobs.values()].forEach((job) => finishJob(job, "stopped in the chat"));
  });
  try {
    for (;;) {
      const job = await nextJob(token);
      if (!job) break;
      if (job.closed) continue;
      const name = path.basename(job.uri.fsPath);
      if (!names.includes(name)) names.push(name);
      try {
        await stream.externalEdit([job.uri], async () => {
          touch(job.id + ".ready");
          log("edits snapshot " + name);
          if (job.demoText !== undefined) {         // the one-time demo writes its own edit
            fs.writeFileSync(job.uri.fsPath, job.demoText);
            await new Promise((resolve) => setTimeout(resolve, 300));
            finishJob(job, "demo shown");
          }
          await job.finished;
        });
        // After Keep or Undo, VS Code marks the file "accepted" and hides any
        // later outside edit of it. An empty chat edit marks it "modified"
        // again, as Copilot's own edits do. Needs the API proposal
        // chatParticipantAdditions (argv.json: "enable-proposed-api").
        try {
          stream.textEdit(job.uri, true);
        } catch (e) {
          if (!edits.warnedProposal) log("ERR  edits: textEdit not allowed (argv.json enable-proposed-api missing?): " + e.message);
          edits.warnedProposal = true;
        }
        // The file is not opened here either: no jump to Claude's file
      } catch (e) {
        log("ERR  edits externalEdit " + (e && e.stack ? e.stack : e));
        finishJob(job, "failed");
      }
    }
  } finally {
    cancel.dispose();
    edits.active--;
    edits.wake = null;
  }
  stream.markdown(names.length
    ? "Claude changed " + names.map((n) => "`" + n + "`").join(", ") + "."
    : "No changes.");
  if (edits.queue.length && !edits.opening) openRequest(edits.queue[0]);   // jobs that came in just now
  return {};
}

// One-time demo (set up by Claude on 5 Nov 2026): SIGNALS\demo.json
// { file, text } is shown as if Claude had just written `text` to `file`, in
// the window that has the file open, once Copilot's chat is ready. The file
// is deleted on the way, so the demo runs only once.
async function runDemoOnce() {
  let demo;
  try { demo = JSON.parse(fs.readFileSync(signal("demo.json"), "utf8")); } catch (e) { return; }
  const uri = vscode.Uri.file(demo.file);
  if (!vscode.workspace.getWorkspaceFolder(uri)) return;          // another window's file
  try { fs.renameSync(signal("demo.json"), signal("demo.claimed")); } catch (e) { return; }
  for (let i = 0; i < 90; i++) {                                    // Copilot's models, up to 1.5 minutes
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    if (models.length) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const job = { id: "demo", uri, session: "demo", closed: false, demoText: demo.text };
  job.finished = new Promise((resolve) => { job.resolve = resolve; });
  job.timer = setTimeout(() => finishJob(job, "timed out"), JOB_TIMEOUT_MS);
  edits.jobs.set(job.id, job);
  edits.queue.push(job);
  log("edits demo " + demo.file);
  if (edits.wake) edits.wake();
  else if (!edits.opening && edits.active === 0) openRequest(job);
}

// ---- Keep / Undo on one change: stay where you are (6 Nov 2026) ----
// After Keep or Undo on one change, VS Code (1.145) always moves the cursor to
// the next change and scrolls it to the middle (built in: acceptNearestChange
// calls next(); no setting). Our chat participant hears of every Keep / Undo
// on its edits (onDidPerformAction, kind "chatEditingHunkAction", proposal
// chatParticipantAdditions). Then we put the cursor and the scroll position
// back as they were just before the click. The jump to the NEXT FILE after the
// last change of a file is off in settings.json
// ("chat.editing.revealNextChangeOnResolve": false).
const STAY_OLDER_MS = 150;     // view states younger than this at Keep time can be VS Code's jump
const STAY_DELAY_MS = 100;     // wait for VS Code's jump to finish, then put the view back
const viewHistory = new Map(); // file -> [{ time, selections, top }], newest last

// Remember where the cursor and the top of the screen are, for every change of either
function recordView(editor) {
  if (!editor || editor.document.uri.scheme !== "file") return;
  const key = editor.document.uri.toString();
  const list = viewHistory.get(key) || [];
  list.push({
    time: Date.now(),
    selections: editor.selections,
    top: editor.visibleRanges.length ? editor.visibleRanges[0].start.line : undefined,
  });
  while (list.length > 20) list.shift();
  viewHistory.set(key, list);
}

function stayAfterKeep(event) {
  const action = event && event.action;
  if (!action || action.kind !== "chatEditingHunkAction" || !action.uri) return;
  const key = action.uri.toString();
  const before = Date.now() - STAY_OLDER_MS;
  const old = [...(viewHistory.get(key) || [])].reverse().find((s) => s.time < before);
  if (!old) return;
  setTimeout(() => {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === key);
    if (!editor) return;
    editor.selections = old.selections;
    if (old.top !== undefined) {
      const line = Math.min(old.top, editor.document.lineCount - 1);
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
    }
    log("stay after " + (action.outcome === 1 ? "keep" : "undo") + ": back to line " + (old.top + 1));
  }, STAY_DELAY_MS);
}

function activateClaudeEdits(context) {
  if (!vscode.chat || !vscode.chat.createChatParticipant) return;   // VS Code without chat, or the offline test
  // the participant id must equal the chat session type in package.json
  const participant = vscode.chat.createChatParticipant("claude-edits", editsHandler);
  try {
    context.subscriptions.push(vscode.chat.registerChatSessionContentProvider("claude-edits", {
      provideChatSessionContent: async () => ({ history: [] }),
    }, participant));
  } catch (e) {                                                       // API proposal not allowed
    participant.dispose();
    log("ERR  edits off: add \"enable-proposed-api\": [\"local.r-pipe-indent\"] to argv.json and restart VS Code (" + e.message + ")");
    return;                                                           // no heartbeat: hooks never wait
  }
  const claude = vscode.extensions.getExtension("anthropic.claude-code");
  if (claude) participant.iconPath = vscode.Uri.file(path.join(claude.extensionPath, "resources", "claude-logo.svg"));
  context.subscriptions.push(participant);
  // Keep / Undo on one change: stay where you are (see stayAfterKeep)
  if (participant.onDidPerformAction) {
    context.subscriptions.push(participant.onDidPerformAction(stayAfterKeep));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((e) => recordView(e.textEditor)));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorVisibleRanges((e) => recordView(e.textEditor)));
    vscode.window.visibleTextEditors.forEach(recordView);
  } else {
    log("ERR  stay after keep: onDidPerformAction missing (argv.json enable-proposed-api?)");
  }
  fs.mkdirSync(SIGNALS, { recursive: true });
  cleanOldSignals();
  writeHeartbeat();
  const beat = setInterval(writeHeartbeat, 5000);
  const scan = setInterval(scanSignals, 500);
  let watcher = null;
  try { watcher = fs.watch(SIGNALS, () => scanSignals()); } catch (e) { log("ERR  edits watch " + e); }
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(writeHeartbeat));
  context.subscriptions.push({
    dispose() {
      clearInterval(beat);
      clearInterval(scan);
      if (watcher) watcher.close();
      remove("window-" + process.pid + ".json");
    },
  });
  scanSignals();
  setTimeout(() => runDemoOnce().catch((e) => log("ERR  edits demo " + (e && e.stack ? e.stack : e))), 3000);
}

// Peek box button "Keep, stay here". VS Code's own + (git.stageChange) moves the
// box on to the next change afterwards; closing the box first keeps the view still.
async function stageChangeStay(uri, changes, index) {
  if (!uri || !changes) return;
  try {
    await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
    await vscode.commands.executeCommand("closeQuickDiff");
    await vscode.commands.executeCommand("git.stageChange", uri, changes, index);
    log("stage-stay change " + (index + 1) + " of " + changes.length);
  } catch (e) {
    log("ERR  stage-stay " + (e && e.stack ? e.stack : e));
  }
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand("rPipeIndent.stageChangeStay", stageChangeStay));
  context.subscriptions.push(vscode.commands.registerCommand("rPipeIndent.enter", onEnterLogged));
  context.subscriptions.push(vscode.commands.registerCommand("rPipeIndent.runStatement", runStatementLogged));
  context.subscriptions.push(vscode.commands.registerCommand("rPipeIndent.insertPipe", insertPipe));
  try { activateClaudeEdits(context); } catch (e) { log("ERR  edits " + (e && e.stack ? e.stack : e)); }
  log("activated 0.5.0");
}

function deactivate() {}

module.exports = { activate, deactivate, _test: { blank, unterminatedQuote, statementStart, statementEnd, unfinished } };
