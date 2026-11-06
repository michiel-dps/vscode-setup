// Offline test for extension.js (no VS Code needed). Run with VS Code's own node:
//   set ELECTRON_RUN_AS_NODE=1
//   "C:\Users\<you>\AppData\Local\Programs\Microsoft VS Code\Code.exe" test.js
// An optional argument names another extension.js to test.

const path = require("path");
const Module = require("module");

// ---- a small stand-in for the vscode module --------------------------------
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range {
  constructor(a, b, c, d) {
    if (typeof a === "number") { this.start = new Position(a, b); this.end = new Position(c, d); }
    else { this.start = a; this.end = b; }
  }
  get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
}
class Selection extends Range {
  constructor(a, b, c, d) { super(a, b, c, d); this.anchor = this.start; this.active = this.end; }
}
const state = { registered: {}, commands: [], warnings: [], answer: undefined, inserted: null, replaced: [], sent: null };
const vscode = {
  Position, Range, Selection,
  window: {
    activeTextEditor: null,
    showWarningMessage: async (msg) => { state.warnings.push(msg); return state.answer; },
  },
  commands: {
    registerCommand: (id, fn) => { state.registered[id] = fn; return { dispose() {} }; },
    executeCommand: async (cmd) => {
      state.commands.push(cmd);
      if (cmd === "r.runSelection") {            // what the R extension would see
        const s = vscode.window.activeTextEditor.selection;
        state.sent = s.isEmpty ? "cursor" : (s.start.line + 1) + "-" + (s.end.line + 1);
      }
    },
  },
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === "vscode" ? vscode : load.call(this, request, ...rest); };

const extPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "extension.js");
const ext = require(extPath);
ext.activate({ subscriptions: [] });

function editorFor(lines, sel) {
  const doc = { lineCount: lines.length, lineAt: (i) => ({ text: lines[i] }) };
  return {
    document: doc, options: { insertSpaces: true, tabSize: 4 },
    selection: sel, selections: [sel],
    edit: async (f) => { f({ insert: (pos, s) => { state.inserted = s; }, replace: (r, s) => { state.replaced.push(s); state.replacedRange = r; } }); return true; },
  };
}
function reset() { state.commands = []; state.warnings = []; state.answer = undefined; state.inserted = null; state.replaced = []; state.sent = null; }

let passed = 0, failed = 0;
function check(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) passed++; else failed++;
  console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "\n        got      " + JSON.stringify(got) + "\n        expected " + JSON.stringify(exp)));
}

// Enter at (line, col); col defaults to the end of the line. Result: the inserted
// text with newline shown as N and each space as a dot, or DEFAULT (VS Code's Enter).
async function enter(lines, line, col) {
  reset();
  const c = col === undefined ? lines[line].length : col;
  vscode.window.activeTextEditor = editorFor(lines, new Selection(line, c, line, c));
  await state.registered["rPipeIndent.enter"]();
  if (state.commands.includes("default:type")) return "DEFAULT";
  const text = state.inserted !== null ? state.inserted : state.replaced[0];
  return text.replace(/\n/g, "N").replace(/ /g, ".");
}
const sp = (n) => "N" + ".".repeat(n);

// Ctrl+Enter with the given selection. Result: "SENT <lines>", "STOP <message>",
// or "SENT(anyway) <lines>" when the warning was answered with "Send anyway".
async function run(lines, sel, answer) {
  reset();
  state.answer = answer;
  const editor = editorFor(lines, sel);
  vscode.window.activeTextEditor = editor;
  await state.registered["rPipeIndent.runStatement"]();
  const warned = state.warnings.length > 0;
  if (state.sent) return (warned ? "SENT(anyway) " : "SENT ") + state.sent;
  return "STOP " + (state.warnings[0] || "").split(" Nothing was sent")[0];
}

async function pipe(lineText, col) {
  reset();
  vscode.window.activeTextEditor = editorFor([lineText], new Selection(0, col, 0, col));
  await state.registered["rPipeIndent.insertPipe"]();
  return state.replaced[0];
}

(async () => {
  const A = [
    "x <- d %>%",                        // 0
    "    # keep only USA",               // 1  comment inside the pipe
    "    filter(code == \"USA\") %>%",   // 2
    "    select(a)",                     // 3
    "",                                  // 4
    "# 3.2a cumulative emissions",       // 5  comment above a statement
    "ans <- d %>%",                      // 6
    "    mutate(b = 1)",                 // 7
    "p <- ggplot(d, aes(x = year)) +",   // 8  operator, not a pipe
    "    geom_line() +",                 // 9
    "    labs(x = \"Year\")",            // 10
    "f <- function(x) {",                // 11 braces: VS Code's own Enter
    "    y <- x %>%",                    // 12
    "        g()",                       // 13
    "    y",                             // 14
    "}",                                 // 15
    "ans_3_2b <- c(d1 %>%",              // 16 pipe inside brackets: under d1
    "              filter(a) %>%",       // 17
    "              pull(b),",            // 18
    "              n_na)",               // 19
    "cor(a, b,",                         // 20
    "    use = \"all\")",                // 21
    "pivot_wider(",                      // 22
    "    names_from = year)",            // 23
    "x <- c(\"a(\", 'b(',   # comment (", // 24 brackets inside strings and comments do not count
    "       \"c\")",                     // 25
    "    z <- a %>%",                    // 26 statement that starts indented
    "        b()",                       // 27
  ];
  console.log("--- Enter");
  const expEnter = {
    0: sp(4), 1: "DEFAULT", 2: sp(4), 3: sp(0), 5: "DEFAULT", 6: sp(4), 7: sp(0),
    8: sp(4), 9: sp(4), 10: sp(0), 11: "DEFAULT", 12: sp(8), 13: sp(4), 14: "DEFAULT", 15: "DEFAULT",
    16: sp(14), 17: sp(14), 18: sp(14), 19: sp(0), 20: sp(4), 21: sp(0), 22: sp(4), 23: sp(0),
    24: sp(7), 25: sp(0), 26: sp(8), 27: sp(4),
  };
  for (const i of Object.keys(expEnter)) check("Enter at end of line " + i + ": " + A[i].trim(), await enter(A, +i), expEnter[i]);
  check("Enter between { and }", await enter(["f <- function(x) {}"], 0, 18), "DEFAULT");
  check("Enter before auto-closed ) on first arg line", await enter(["d1 <- d2 %>%", "    select(year, code,)"], 1, 22), sp(11));
  check("Enter before auto-closed ) on a later arg line", await enter(["d1 <- d2 %>%", "    select(year, code,", "           country)"], 2, 18), sp(11));
  check("Enter before ) %>% inside a call (the user, 2 Nov)", await enter(["ans <- co2_cont %>%", "    mutate(co2_bn = co2 / 1e9, ) %>%"], 1, 31), sp(11));
  check("Enter before )) + inside aes()", await enter(["ans <- d %>%", "    ggplot(aes(x = year, y = co2)) + "], 1, 32), sp(15));
  check("Enter before ) %>% select(a): moves down under a", await enter(["    mutate(a = 1, ) %>% select(a)"], 0, 18), sp(11));
  check("Enter before a bare %>% (no bracket): default", await enter(["x <- d %>%", "    filter(a) %>%"], 1, 13), "DEFAULT");
  check("Enter with a comment after the cursor: default", await enter(["x <- c(1, 2)   # trailing"], 0, 12), "DEFAULT");
  // splitting a line: the code after the cursor moves to the new line
  const J = ["jury <- esc %>%", "    pivot_longer(-(contestant:televote_score), names_to = \"awarding\")"];
  check("Enter in the middle of an argument list (the user, 2 Nov)", await enter(J, 1, 47), sp(17));
  {
    reset();
    const editor = editorFor(J, new Selection(1, 46, 1, 46));   // cursor before the space
    vscode.window.activeTextEditor = editor;
    await state.registered["rPipeIndent.enter"]();
    check("the space in front of the moved text is dropped", state.replacedRange.end.character - state.replacedRange.start.character, 1);
    check("cursor lands at the indent on the new line", [editor.selection.active.line, editor.selection.active.character], [2, 17]);
  }
  // the user's lines of 2 Nov 2026, exactly as typed
  check("unit-03 line 553: before ) + after size = 3,", await enter(["    geom_text(aes(label = contestant), size = 3,) + "], 0, 48), sp(14));
  check("unit-03 line 548: before ) after sum(...),", await enter(["    summarise(n_top = sum(score == 12),)"], 0, 39), sp(14));
  const G = [
    "ans_3_10a <- n_top %>%",                                  // 0
    "    ggplot(aes(x = jury_score, y = n_top)) + ",           // 1
    "    geom_text(aes(label = contestant), size = 3,",        // 2
    "              check_overlap = TRUE) + ",                  // 3
    "    labs(x = \"Jury Scores\", y = \"Number of 12-points\")", // 4
    "",                                                        // 5
    "n_top <- jury %>%",                                       // 6
    "    summarise(n_top = sum(score == 12),",                 // 7
    "              .by = c(contestant, jury_score))",          // 8
  ];
  for (const [i, exp] of [[0, sp(4)], [1, sp(4)], [2, sp(14)], [3, sp(4)], [4, sp(0)], [6, sp(4)], [7, sp(14)], [8, sp(0)]])
    check("unit-03 ggplot/summarise chain, Enter at end of line " + i, await enter(G, i), exp);
  check("Enter right after the bracket: one level in", await enter(["    pivot_longer(-(a), b)"], 0, 17), sp(8));
  check("Enter after a pipe with code following", await enter(["x <- d %>% filter(a)"], 0, 11), sp(4));
  check("Enter splitting the last line of a statement: default", await enter(["x <- d %>%", "    select(a) %>% filter(b)"], 1, 13), "DEFAULT");
  check("Enter on a line that is a bare word", await enter(["x <- 5", "y"], 1), "DEFAULT");

  console.log("--- Ctrl+Enter");
  check("selection on 3rd line of pipe with a comment inside", await run(A, new Selection(2, 4, 2, 12)), "SENT 1-4");
  check("selection on the comment line inside the pipe", await run(A, new Selection(1, 0, 1, 5)), "SENT 1-4");
  check("selection ending at column 0 of the next line", await run(A, new Selection(2, 0, 3, 0)), "SENT 1-4");
  check("selection inside brackets, lines 18-19", await run(A, new Selection(17, 14, 18, 20)), "SENT 17-20");
  check("selection on the function's first line", await run(A, new Selection(11, 0, 11, 5)), "SENT 12-16");
  check("selection on ggplot's 2nd line", await run(A, new Selection(9, 4, 9, 10)), "SENT 9-11");
  {
    reset();
    const editor = editorFor(A, new Selection(2, 4, 2, 12));
    vscode.window.activeTextEditor = editor;
    await state.registered["rPipeIndent.runStatement"]();
    check("cursor moves to the line after the statement", editor.selection.active.line, 4);
  }
  check("no selection, cursor in a finished pipe", await run(A, new Selection(2, 6, 2, 6)), "SENT cursor");
  check("no selection, cursor on a comment line", await run(A, new Selection(5, 3, 5, 3)), "SENT cursor");
  check("no selection, cursor on a blank line", await run(A, new Selection(4, 0, 4, 0)), "SENT cursor");
  check("no selection, cursor in the function body", await run(A, new Selection(13, 3, 13, 3)), "SENT cursor");

  const B = ["ans <- c(d1 %>%", "    filter(a) %>%", "    pull(b)"];
  check("unclosed bracket, no selection", await run(B, new Selection(0, 3, 0, 3)), "STOP The bracket ( on line 1 is never closed.");
  check("unclosed bracket, selection", await run(B, new Selection(1, 0, 1, 5)), "STOP The bracket ( on line 1 is never closed.");
  check("unclosed bracket, Send anyway", await run(B, new Selection(0, 3, 0, 3), "Send anyway"), "SENT(anyway) cursor");
  const C = ["x <- d %>%", "    filter(code == \"USA) %>%", "    select(a)"];
  check("unclosed quote", await run(C, new Selection(0, 0, 0, 0)), "STOP The quote \" on line 2 is never closed.");
  check("trailing pipe at end of file", await run(["x <- d %>%"], new Selection(0, 0, 0, 0)), "STOP Line 1 ends with %>% and nothing follows it.");
  check("trailing pipe before a blank line", await run(["x <- d %>%", "", "y <- 5"], new Selection(0, 0, 0, 0)), "STOP Line 1 ends with %>% and nothing follows it.");
  check("trailing + at end of file", await run(["p <- ggplot(d) +"], new Selection(0, 0, 0, 0)), "STOP Line 1 ends with + and nothing follows it.");
  check("apostrophe in a comment is fine", await run(["x <- 5  # don't worry"], new Selection(0, 0, 0, 0)), "SENT cursor");
  check("apostrophe in a string is fine", await run(["print(\"it's\")"], new Selection(0, 0, 0, 0)), "SENT cursor");
  check("unclosed brace in a selected first line of if", await run(["if (a) {", "    x"], new Selection(0, 0, 0, 3)), "STOP The bracket { on line 1 is never closed.");

  console.log("--- Ctrl+Shift+M");
  check("after a space", await pipe("emissions ", 10), "%>%");
  check("after a word", await pipe("emissions", 9), " %>%");
  check("at the start of a line", await pipe("", 0), "%>%");

  console.log("--- saved edits after a reload (makeSavedEditsSafe)");
  {
    const fs = require("fs");
    const os = require("os");
    const safe = ext._test.makeSavedEditsSafe;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rpi-"));
    const dir = path.join(tmp, "a b");                        // a space, as in "<Dropbox>"
    const session = path.join(tmp, "chatEditingSessions", "x");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(session, "contents"), { recursive: true });
    // VS Code writes file URIs as file:///c%3A/Users/a%20b/x.R
    const vsUri = (p) => {
      const parts = p.split(path.sep);
      const drive = parts.shift().replace(":", "").toLowerCase();
      return "file:///" + drive + "%3A/" + parts.map(encodeURIComponent).join("/");
    };
    // one saved edit: the file now (null = no file), the text VS Code saved, its state
    const entry = (name, now, saved, state) => {
      const file = path.join(dir, name);
      if (now !== null) fs.writeFileSync(file, now);
      fs.writeFileSync(path.join(session, "contents", "h-" + name), saved);
      return { resource: vsUri(file), currentHash: "h-" + name, state };
    };
    const stateFile = path.join(session, "state.json");
    const write = (entries, spaces) => fs.writeFileSync(stateFile, JSON.stringify({ version: 2, recentSnapshot: { entries } }, null, spaces));
    const states = () => JSON.parse(fs.readFileSync(stateFile, "utf8")).recentSnapshot.entries.map((e) => e.state);

    check("no saved edits", safe(stateFile), 0);
    write([
      entry("same.R", "x <- 1\r\n", "x <- 1\r\n", 0),
      entry("changed.R", "x <- 2\r\n", "x <- 1\r\n", 0),
      entry("missing.R", null, "x <- 1\r\n", 0),
      entry("kept.R", "x <- 2\r\n", "x <- 1\r\n", 1),
    ]);
    check("waiting for Keep / Undo: only the unchanged file", safe(stateFile), 1);
    check("changed or missing file: marked kept", states(), [0, 1, 1, 1]);
    write([entry("same2.R", "y\n", "y\n", 0), entry("typed.R", "z\n", "z\n", 0)], 1);
    const typed = (p) => (p.endsWith("typed.R") ? "z typed after the reload\n" : fs.readFileSync(p, "utf8"));
    check("unsaved typing in the editor counts as changed", safe(stateFile, typed), 1);
    check("typed file marked kept", states(), [0, 1]);
    write([entry("same3.R", "y\n", "y\n", 0)], 1);
    const before = fs.readFileSync(stateFile, "utf8");
    check("nothing changed: state.json not rewritten", (safe(stateFile), fs.readFileSync(stateFile, "utf8") === before), true);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exitCode = failed ? 1 : 0;
})();
