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
  contains(p) {
    const afterStart = p.line > this.start.line || (p.line === this.start.line && p.character >= this.start.character);
    const beforeEnd = p.line < this.end.line || (p.line === this.end.line && p.character <= this.end.character);
    return afterStart && beforeEnd;
  }
}
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class Selection extends Range {
  constructor(a, b, c, d) { super(a, b, c, d); this.anchor = this.start; this.active = this.end; }
}
const state = { registered: {}, commands: [], warnings: [], answer: undefined, inserted: null, replaced: [], sent: null };
const vscode = {
  Position, Range, Selection, Location,
  TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
  window: {
    activeTextEditor: null,
    showWarningMessage: async (msg) => { state.warnings.push(msg); return state.answer; },
    onDidChangeTextEditorSelection: (fn) => { state.onSelection = fn; return { dispose() {} }; },
  },
  commands: {
    registerCommand: (id, fn) => { state.registered[id] = fn; return { dispose() {} }; },
    executeCommand: async (cmd, arg) => {
      state.commands.push(cmd);
      if (cmd === "r.workspaceViewer.view") state.viewed = arg.rootName;
      if (cmd === "r.runCommand") state.viewed = "by " + arg;
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

    // a fresh edit history when the saved one is too big (freshSavedEdits, 16 Nov 2026)
    const fresh = ext._test.freshSavedEdits;
    const oldCopy = path.join(tmp, "chatEditingSessions-old", "x", "state.json");
    const history = (steps, waitingState) => {
      fs.mkdirSync(path.join(session, "contents"), { recursive: true });
      const checkpoints = Array.from({ length: steps }, (_, i) => ({ checkpointId: "c" + i }));
      fs.writeFileSync(stateFile, JSON.stringify({ version: 2, recentSnapshot: { entries: [{ state: waitingState }] }, timeline: { checkpoints } }));
    };
    check("no saved history", fresh(path.join(tmp, "nothing", "state.json")), "none");
    history(5, 0);
    check("small, an edit waits: kept", fresh(stateFile), "kept");
    history(5, 1);
    check("small, nothing waits: moved", [fresh(stateFile), fs.existsSync(stateFile), fs.existsSync(oldCopy)], ["moved", false, true]);
    history(1232, 0);
    check("too many steps, an edit waits: moved", [fresh(stateFile), fs.existsSync(stateFile)], ["moved", false]);
    history(5, 0);
    fs.writeFileSync(path.join(session, "contents", "big"), Buffer.alloc(11 * 1024 * 1024));
    check("too many MB, an edit waits: moved", fresh(stateFile), "moved");
    check("only the last old history kept", fs.readdirSync(path.join(tmp, "chatEditingSessions-old")), ["x"]);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("--- Keep on one change: find the kept lines (changedBlock, matchingLine)");
  {
    const block = ext._test.changedBlock;
    const match = ext._test.matchingLine;
    check("one line changed", block(["a", "b", "c"], ["a", "B", "c"]), { start: 1, lines: ["B"] });
    check("two lines added", block(["a", "c"], ["a", "x", "y", "c"]), { start: 1, lines: ["x", "y"] });
    check("lines deleted", block(["a", "x", "y", "c"], ["a", "c"]), { start: 1, lines: [] });
    check("first line changed", block(["a", "b"], ["A", "b"]), { start: 0, lines: ["A"] });
    // hidden copy after Keep vs the file: a change still waiting above the kept lines
    const kept = ["a", "b", "K1", "K2", "c", "d"];
    const file = ["a", "new1", "new2", "new3", "K1", "K2", "c", "d"];   // b -> 3 new lines, not kept yet
    check("kept lines below a waiting change", match(kept, file, 2), 4);
    check("line above the waiting change", match(kept, file, 0), 0);
    check("line at the bottom", match(kept, file, 5), 7);
    const kept2 = ["x", "", "K", "y", "z"];
    const file2 = ["x", "", "", "K", "y", "W", "z"];                   // an extra blank line just above K
    check("blank line inserted just above", match(kept2, file2, 2), 3);
    check("waiting change below the kept lines", match(["a", "K", "b", "c"], ["a", "K", "b", "B2", "c"], 1), 1);
    const long = Array.from({ length: 400 }, (v, i) => "line " + i);
    const longFile = long.slice(0, 50).concat(["new"]).concat(long.slice(51, 300)).concat(["extra 1", "extra 2"]).concat(long.slice(300));
    check("400 lines, changes far apart", match(long, longFile, 200), 200);
    check("400 lines, below both changes", match(long, longFile, 350), 352);
  }

  console.log("--- Ctrl+click on a global object opens the data viewer (ctrlClick)");
  {
    const lines = [
      'rent <- read_csv(file) %>%',
      '    filter(price > 10)',
      'x <- rent$price + n  # rent here is a comment',
      'y <- "rent"',
      'z <- dplyr::n()',
      'print(p) + print(old_plot) + print(map)',
    ];
    const doc = {
      uri: { toString: () => "file:///c/test.R" },
      lineAt: (i) => ({ text: lines[i] }),
      getText: (r) => lines[r.start.line].slice(r.start.character, r.end.character),
      getWordRangeAtPosition: (p, re) => {
        const g = new RegExp(re.source, "g");
        let m;
        while ((m = g.exec(lines[p.line])) !== null) {
          if (m.index <= p.character && p.character <= m.index + m[0].length) return new Range(p.line, m.index, p.line, m.index + m[0].length);
        }
        return undefined;
      },
    };
    const session = { workspaceData: { globalenv: {
      rent: { class: ["tbl_df", "tbl", "data.frame"] }, price: { class: "numeric" }, n: {}, file: { class: "character" },
      p: { class: ["ggplot2::ggplot", "ggplot", "ggplot2::gg", "S7_object", "gg"] },
      old_plot: { class: "recordedplot" },
      map: { class: ["leaflet", "htmlwidget"] },
    } } };
    const ctrl = state.registered["rPipeIndent.ctrlClick"];
    function mouseClick(line, col) {
      state.onSelection({ kind: 2, textEditor: { document: doc }, selections: [new Selection(line, col, line, col)] });
    }
    function ask(line, col, s = session) {
      state.viewed = undefined;
      const answer = ctrl(doc, new Position(line, col), s);
      if (answer === undefined) return "language server";
      if (answer.length === 0) return "viewed " + state.viewed;
      return "underline " + doc.getText(answer[0].range);
    }
    check("Ctrl+hover on rent: underline only", ask(0, 2), "underline rent");
    mouseClick(0, 2);
    check("Ctrl+click on rent: viewer", ask(0, 2), "viewed rent");
    check("same click asked again: underline only", ask(0, 2), "underline rent");
    mouseClick(1, 4);
    check("click on filter (a function, not global): language server", ask(1, 4), "language server");
    mouseClick(1, 12);
    check("Ctrl+click on price, a global: viewer", ask(1, 12), "viewed price");
    mouseClick(2, 10);
    check("price after $: language server", ask(2, 10), "language server");
    mouseClick(2, 5);
    check("rent before $: viewer", ask(2, 5), "viewed rent");
    mouseClick(2, 24);
    check("rent in a comment: language server", ask(2, 24), "language server");
    mouseClick(3, 7);
    check("rent in a string: language server", ask(3, 7), "language server");
    mouseClick(4, 12);
    check("dplyr::n: language server", ask(4, 12), "language server");
    mouseClick(0, 2);
    check("no R session: language server", ask(0, 2, null), "language server");
    check("workspace unavailable: language server", ask(0, 2, { workspaceUnavailable: true, workspaceData: session.workspaceData }), "language server");
    mouseClick(0, 2);
    const now = Date.now;
    Date.now = () => now() + 5000;
    check("request long after the click (a hover): underline only", ask(0, 2), "underline rent");
    Date.now = now;
    mouseClick(0, 18);
    check("click on file, then Ctrl+hover on rent: underline only", ask(0, 2), "underline rent");
    check("Ctrl+hover on a ggplot: underline only", ask(5, 6), "underline p");
    mouseClick(5, 6);
    check("Ctrl+click on a ggplot: printed (R Plot tab)", ask(5, 6), "viewed by print(p)");
    mouseClick(5, 20);
    check("Ctrl+click on a saved base plot: printed", ask(5, 20), "viewed by print(old_plot)");
    mouseClick(5, 36);
    check("Ctrl+click on a leaflet map: printed", ask(5, 36), "viewed by print(map)");
  }

  // ---- a fresh R terminal at every start (18 Nov 2026) ------------------------
  {
    const freshR = async (files, terminalNames) => {
      reset();
      const closed = [];
      vscode.window.tabGroups = { all: [{ tabs: files.map((f) => ({ input: { uri: { fsPath: f } } })) }] };
      vscode.window.terminals = terminalNames.map((name) => ({ name, dispose: () => closed.push(name) }));
      vscode.extensions = { getExtension: () => ({ activate: async () => {} }) };
      await ext._test.startFreshR();
      delete vscode.window.tabGroups;
      delete vscode.window.terminals;
      delete vscode.extensions;
      return { started: state.commands.includes("r.createRTerm"), closed };
    };
    check("R file open: R terminal started", await freshR(["C:/a/unit-04.R"], []), { started: true, closed: [] });
    check("old R terminal closed, then a fresh one", await freshR(["C:/a/unit-04.R"], ["R Interactive", "pwsh"]), { started: true, closed: ["R Interactive"] });
    check("qmd open: started", await freshR(["C:/paper/paper.qmd"], []), { started: true, closed: [] });
    check("no R file open: nothing", await freshR(["C:/a/notes.md"], ["R Interactive"]), { started: false, closed: [] });
    check("a Claude chat tab (no file): nothing", await freshR([], []), { started: false, closed: [] });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exitCode = failed ? 1 : 0;
})();
