// Claude's suggestions on the page, like Grammarly (16 Nov 2026, asked: "me having a window open
// with you and if I'm on some text you can come with proposals like Grammarly does").
//
// How it works:
// 1. While he writes on the page, Quarto puts the typed text into the document every 2 seconds.
//    This file notes which paragraphs changed. When he has not typed for PAUSE ms, the changed
//    paragraphs (of at least MIN_WORDS words) go to Claude, one request per paragraph.
// 2. The request runs the Claude Code program of this laptop without a window ("claude -p", on
//    his own Claude subscription), with no tools and no session saved, and asks for a list of
//    suggestions in a fixed JSON form: the exact words, the new words, the kind and a short reason.
// 3. The answers go into word-page-assistant.css next to Quarto's page (patch.js); the page reads
//    it every 2 seconds and draws coloured lines under those words (inject/assistant.js). A click
//    on a line shows a card with Accept and Dismiss; a list of all of them is on the right.
// 4. When he accepts a suggestion the paragraph changes in exactly that way: the other
//    suggestions of the paragraph stay and it is not sent again. Any other change of a paragraph
//    sends it again after the next pause. Each paragraph text is asked about only once.
//
// The functions at the top do not need VS Code (test.js checks them in node).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const PAUSE = 4000;          // ms without typing before a changed paragraph is checked
const MIN_WORDS = 6;         // shorter paragraphs (headings, captions, labels) are not checked
const AT_ONCE = 2;           // requests to Claude at the same time
const TIME_LIMIT = 120000;   // ms: a request that takes longer is stopped
const MAX_SUGGESTIONS = 12;  // per paragraph (every spelling mistake counts on its own)
const KINDS = ["spelling", "grammar", "punctuation", "clarity", "concise", "wording", "source"];
const NO_MARKUP = /[*_`$@\[\]#^\\{}<>|~]/;   // an "original" with these is not plain text on the page
// a citation: [@key], [see @key, p. 5], [@a; @b], or @key in the running text
const CITATION = /\[[^\]]*@[^\]]*\]|-?@[\w:.&-]+/g;

// ---- the paragraphs of a Markdown document ----

// The paragraphs of running text, in order. Left out: the header (YAML), code and maths blocks,
// headings, tables, pictures, divs (:::), HTML, raw LaTeX lines. A list gives one paragraph per
// item. Each: { text } with the Markdown as it is in the file (list marker taken off).
function paragraphsOf(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  if (lines[0] === "---") {                     // the header
    i = 1;
    while (i < lines.length && lines[i] !== "---" && lines[i] !== "...") { i++; }
    i++;
  }
  let block = [];
  let fence = null;                             // inside ``` or ~~~ or $$
  const flush = () => {
    if (block.length) { splitBlock(block).forEach((text) => out.push({ text: text })); }
    block = [];
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (fence) {
      if (trimmed.startsWith(fence)) { fence = null; }
      continue;
    }
    const opens = /^(```|~~~|\$\$)/.exec(trimmed);
    if (opens) {
      flush();
      if (!(opens[1] === "$$" && trimmed.length > 2 && trimmed.endsWith("$$"))) { fence = opens[1]; }
      continue;
    }
    if (trimmed === "") { flush(); continue; }
    // headings, tables and their captions (": Table A7 ..."), divs, HTML, pictures, LaTeX, rules
    if (/^(#{1,6}\s|\||:::|:\s|<|!\[|\\[a-zA-Z]|-{3,}$|\*{3,}$)/.test(trimmed)) { flush(); continue; }
    block.push(line);
  }
  flush();
  return out;
}

// one block of lines: a list gives each item, else the lines joined into one paragraph
function splitBlock(lines) {
  const marker = /^\s*([-*+]|\d+[.)])\s+/;
  const footnote = /^\[\^[^\]]+\]:\s*/;
  if (!marker.test(lines[0])) { return [lines.join(" ").replace(footnote, "").trim()]; }
  const items = [];
  for (const line of lines) {
    if (marker.test(line) || !items.length) { items.push(line.replace(marker, "")); }
    else { items[items.length - 1] += " " + line.trim(); }
  }
  return items.map((item) => item.trim());
}

function wordCount(text) {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

// The text of a paragraph as the page shows it, roughly: without citations, cross references,
// maths, code, footnote marks and Markdown signs. Used for the words around a suggestion.
function plainOf(markdown) {
  return markdown
    .replace(/\^\[[^\]]*\]/g, " ")              // inline footnote
    .replace(/\[\^[^\]]+\]/g, " ")              // footnote mark
    .replace(/\[[^\]]*@[^\]]*\]/g, " ")         // [@key], [see @key, p. 3]
    .replace(/-?@[\w:.-]+/g, " ")               // @key, @fig-map
    .replace(/\$[^$]*\$/g, " ")                 // inline maths
    .replace(/`[^`]*`/g, " ")                   // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")  // [text](link)
    .replace(/\{[^}]*\}/g, " ")                 // {.class}
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// the letters and digits of a text, small (the page compares texts this way too)
function letters(text) {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function count(text, part) {
  let n = 0;
  let at = text.indexOf(part);
  while (at >= 0) { n++; at = text.indexOf(part, at + 1); }
  return n;
}

// A suggestion from Claude, checked and made ready for the page, or null when it is not usable:
// the words must be in the paragraph exactly once and be plain text (no Markdown), the new words
// must differ. before/after: up to 40 letters of the text around it, to find the right place.
// Plain text, or plain text with citations in it: anything else (bold, maths, code) is left alone.
function plainEnough(text) {
  return !NO_MARKUP.test(text.replace(CITATION, ""));
}

// A suggestion from Claude, checked and made ready for the page, or null when it is not usable:
// the old words must be in the paragraph exactly once, and old and new words may only hold plain
// text and citations. before/after: up to 40 letters around it, to find the right place.
// note: a source problem without a fix from the list (new words = old words): only a remark.
// citation: old or new words hold a citation; typing cannot make a citation, so the page lets
// Quarto's own editor put the new words in (inject/assistant.js, acceptWithQuarto).
function prepare(paragraph, s) {
  if (!s || typeof s.original !== "string" || typeof s.replacement !== "string") { return null; }
  const original = s.original;
  const replacement = s.replacement;
  const kind = KINDS.includes(s.kind) ? s.kind : "clarity";
  const note = original === replacement;
  if (!original.trim() || original.length > 400 || (note && kind !== "source")) { return null; }
  if (!plainEnough(original) || !plainEnough(replacement)) { return null; }
  if (count(paragraph, original) !== 1 || !letters(original)) { return null; }
  const at = paragraph.indexOf(original);
  const before = letters(plainOf(paragraph.slice(0, at))).slice(-40);
  const after = letters(plainOf(paragraph.slice(at + original.length))).slice(0, 40);
  const reason = String(s.reason || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const id = crypto.createHash("sha1").update(paragraph + "\u0000" + original + "\u0000" + replacement).digest("hex").slice(0, 16);
  const citation = !note && /[\[\]@]/.test(original + replacement);
  return { id, original, replacement, kind, reason, before, after, note, citation };
}

// ---- what Claude gets to know about the document ----

// The sources of the document's .bib file(s), one short line each: key, first author, year,
// title. The header says which file(s): "bibliography: references.bib" or a list.
function bibliographyFiles(markdown, folder) {
  const header = /^---\n([\s\S]*?)\n---/.exec(markdown.replace(/\r\n/g, "\n"));
  if (!header) { return []; }
  const files = [];
  const one = /^bibliography:[ \t]*(\S.*)$/m.exec(header[1]);
  if (one && !one[1].startsWith("[")) { files.push(one[1].replace(/["']/g, "").trim()); }
  const list = /^bibliography:\s*\n((?:\s+-\s*.+\n?)+)/m.exec(header[1]);
  if (list) { list[1].split("\n").forEach((line) => { const m = /-\s*(.+)/.exec(line); if (m) { files.push(m[1].replace(/["']/g, "").trim()); } }); }
  return files.map((file) => path.resolve(folder, file));
}

function bibLines(bibText) {
  const out = [];
  const entry = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\}/g;
  let m;
  while ((m = entry.exec(bibText))) {
    if (/^(comment|string|preamble)$/i.test(m[1])) { continue; }
    const body = m[3] + "\n";   // the last field has no comma or line end of its own
    const field = (name) => {
      const f = new RegExp("\\b" + name + "\\s*=\\s*[{\"]([\\s\\S]*?)[}\"]\\s*,?[ \\t]*\\n", "i").exec(body);
      return f ? f[1].replace(/[{}]/g, "").replace(/\s+/g, " ").trim() : "";
    };
    const authors = field("author") || field("editor") || field("organization") || field("publisher");
    const first = authors.split(/\s+and\s+/)[0].split(",")[0].trim();
    const more = /\s+and\s+/.test(authors) ? (authors.split(/\s+and\s+/).length > 2 ? " et al." : " & " + authors.split(/\s+and\s+/)[1].split(",")[0].trim()) : "";
    const year = (field("year") || field("date")).slice(0, 4) || "n.d.";
    out.push(m[2] + " | " + first + more + " " + year + " | " + field("title").slice(0, 90));
  }
  return out;
}

// The numbered parts of the paper, as the PDF numbers them, and its figures and tables:
// so Claude can tell when the text points at a section, figure or table that is not there.
function outlineOf(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const numbers = [0, 0, 0, 0];
  const sections = [];
  let fence = false;
  let header = lines[0] === "---";
  for (let i = header ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (header) { if (line === "---") { header = false; } continue; }
    if (/^(```|~~~)/.test(line.trim())) { fence = !fence; continue; }
    if (fence) { continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (!h) { continue; }
    const title = h[2].replace(/\{[^}]*\}/g, "").trim();
    if (/\{[^}]*\.unnumbered[^}]*\}|\{-\}/.test(h[2])) { sections.push("(no number) " + title); continue; }
    const level = h[1].length - 1;
    numbers[level]++;
    for (let k = level + 1; k < numbers.length; k++) { numbers[k] = 0; }
    sections.push(numbers.slice(0, level + 1).join(".") + " " + title);
  }
  const figures = Array.from(new Set((markdown.match(/\*\*Figure ([A-Z]?\d+)\.\*\*/g) || []).map((x) => x.replace(/\*|\./g, ""))));
  const tables = Array.from(new Set((markdown.match(/\*\*Table ([A-Z]?\d+)\.\*\*/g) || []).map((x) => x.replace(/\*|\./g, ""))));
  return "Sections: " + sections.join("; ") + "\nFigures: " + (figures.join(", ") || "none") + "\nTables: " + (tables.join(", ") || "none");
}

// The paragraph changed from `old` to `now`. When the change is exactly one of its suggestions
// (he accepted it), the others that still fit come along: { carried: [...] }. Else null.
function afterAccept(old, now, suggestions) {
  for (const s of suggestions) {
    const at = old.indexOf(s.original);
    if (at < 0) { continue; }
    if (old.slice(0, at) + s.replacement + old.slice(at + s.original.length) !== now) { continue; }
    const carried = [];
    for (const other of suggestions) {
      if (other === s) { continue; }
      const moved = prepare(now, other);
      if (moved) { carried.push(moved); }
    }
    return { carried: carried };
  }
  return null;
}

// ---- asking Claude ----

const SYSTEM = [
  "You are a careful copy editor working like Grammarly inside a student's academic term paper",
  "(economics, British English). You get one paragraph of the paper in Markdown. Propose only real",
  "improvements:",
  "- spelling (you are the only spell checker): every misspelled word, every word that needs a",
  "  capital letter (months and days: January; names, nationalities and languages: Norwegian; the",
  "  first word of a sentence), and British spelling (ageing, colour, analyse, centre, programme,",
  "  modelling). Each misspelled word is its own suggestion of kind \"spelling\", with the word and",
  "  as few words around it as needed to make it unique. Spelling mistakes always count, also when",
  "  there are many. Not mistakes: Norwegian names and terms (innsatssone, Lånekassen, kommune,",
  "  Trøndelag), names of people and places, R names, file names, table names and code.",
  "- correctness: grammar, agreement, tense, articles, wrong or missing words, punctuation;",
  "- clarity: sentences that are hard to follow;",
  "- conciseness: wordy phrases (\"in order to\" -> \"to\");",
  "- word choice and flow: vague, repeated or informal words.",
  "Rules:",
  "- Keep the author's meaning, voice and British spelling. Do not add facts. Make the smallest",
  "  change that fixes the problem.",
  "- \"original\" is copied character for character from the paragraph, as short as possible",
  "  (usually 1 to 8 words), appears exactly once in the paragraph, and contains no Markdown or",
  "  LaTeX characters: none of * _ ` $ # ^ \\ { } outside a citation. A citation may be part of it.",
  "- Never change numbers, maths, code or URLs.",
  "- \"replacement\" replaces exactly the \"original\" text.",
  "- \"reason\": at most 12 plain words, written for a student.",
  "- \"kind\": spelling, grammar, punctuation, clarity, concise, wording or source.",
  "- At most " + MAX_SUGGESTIONS + " suggestions: spelling first, then the most important. If the paragraph is fine, return an",
  "  empty list. Do not suggest a change you would not insist on.",
  "Sources and references (kind \"source\"):",
  "- Citations are written [@key], [@key, p. 5], [@a; @b] or @key. The keys that exist are in the list",
  "  of sources below; never invent a key.",
  "- Flag a citation whose key is not in the list (a typo: propose the right key), broken citation",
  "  syntax (a missing bracket, stray characters such as {}), and a source written by hand or left",
  "  open, such as \"(source)\", \"(datum)\" or \"(Ministry 2020)\": when one source in the list clearly",
  "  fits, the replacement is the citation, e.g. \"(source)\" -> \"[@Hoydahl_2023]\"; keep page numbers.",
  "- When no source in the list fits, or you are not sure which, give a remark: \"replacement\" is the",
  "  same text as \"original\" and \"reason\" says what is missing (e.g. \"No source in your list for this; add one.\").",
  "- Flag a reference to a section, figure or table that does not exist in the outline below",
  "  (e.g. \"Section 5.1\" when there is no 5.1): a remark, or the right number when it is clear."
].join("\n");

// the instructions with the sources and the outline of this document
function systemFor(sources, outline) {
  return SYSTEM + "\n\nThe sources in the document's bibliography (key | author year | title):\n" +
    (sources.length ? sources.join("\n") : "(none)") + "\n\nThe outline of the document:\n" + outline;
}

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          replacement: { type: "string" },
          kind: { type: "string", enum: KINDS },
          reason: { type: "string" }
        },
        required: ["original", "replacement", "kind", "reason"]
      }
    }
  },
  required: ["suggestions"]
});

// where the Claude Code program is: the setting, the installed program, the one in the Claude
// Code add-on, or "claude" on the PATH
function findClaude(setting) {
  if (setting && fs.existsSync(setting)) { return setting; }
  const home = os.homedir();
  const local = path.join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  if (fs.existsSync(local)) { return local; }
  try {
    const extensions = path.join(home, ".vscode", "extensions");
    const addOns = fs.readdirSync(extensions).filter((name) => name.startsWith("anthropic.claude-code-")).sort();
    for (let k = addOns.length - 1; k >= 0; k--) {
      const exe = path.join(extensions, addOns[k], "resources", "native-binary", process.platform === "win32" ? "claude.exe" : "claude");
      if (fs.existsSync(exe)) { return exe; }
    }
  } catch (err) { /* no add-ons folder */ }
  return "claude";
}

// The arguments of one request: print mode, JSON answer in the fixed form, no tools, no MCP
// servers, no session saved, and only "project" settings from an empty folder, so his own hooks
// (review.py, the awake hooks) do not run for these requests.
function claudeArgs(model, system) {
  return ["-p", "--output-format", "json", "--json-schema", SCHEMA, "--system-prompt", system || SYSTEM,
    "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--setting-sources", "project",
    "--model", model || "sonnet", "--effort", "low"];
}

// The suggestions Claude makes for one paragraph: Promise of [{ original, replacement, kind, reason }]
function askClaude(exe, model, paragraph, workDir, system) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(workDir, { recursive: true });
    const env = Object.assign({}, process.env);
    for (const name of Object.keys(env)) {
      // VS Code's own variables (ELECTRON_RUN_AS_NODE, VSCODE_*) and a Claude chat's would
      // change how the program starts
      if (/^(ELECTRON_|VSCODE_|CLAUDECODE|CLAUDE_CODE_)/.test(name)) { delete env[name]; }
    }
    let child;
    try {
      child = childProcess.spawn(exe, claudeArgs(model, system), { cwd: workDir, env: env, windowsHide: true });
    } catch (err) { reject(err); return; }
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("no answer within " + TIME_LIMIT / 1000 + " s")); }, TIME_LIMIT);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const answer = JSON.parse(out);
        if (answer.is_error) { reject(new Error(String(answer.result || answer.subtype || "error").slice(0, 200))); return; }
        const list = answer.structured_output && answer.structured_output.suggestions;
        resolve(Array.isArray(list) ? list : []);
      } catch (e) {
        reject(new Error((err || out || "no answer").trim().slice(0, 200)));
      }
    });
    child.stdin.end(paragraph);
  });
}

// ---- the answers, kept on the disk ----
// Claude's answers per paragraph text, also after a restart or Reload Window, so a paragraph is
// read again only when its text changed (each read uses some of his Claude usage). Kept by the
// SHA-1 of the text, in answers.json; the newest KEEP answers stay. Works like a Map of texts.
const KEEP = 5000;
// Raise this when a saved answer would no longer fit the page (new fields): older answers are
// then asked again. 2: note and citation (16 Nov 2026). 3: Claude also checks spelling.
const ANSWER_VERSION = 3;

function textKey(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 24);
}

function savedResults(file) {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (err) { store = {}; }
  let timer = null;
  let cleared = false;   // "forget": the next save writes only what is new, without the file
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const keys = Object.keys(store);
        if (keys.length > KEEP) {
          keys.sort((a, b) => (store[a].at || 0) - (store[b].at || 0)).slice(0, keys.length - KEEP).forEach((k) => { delete store[k]; });
        }
        // another VS Code window keeps its own answers in the same file: take those in first
        if (!cleared) {
          try { store = Object.assign(JSON.parse(fs.readFileSync(file, "utf8")) || {}, store); } catch (err) { /* no file yet */ }
        }
        cleared = false;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = file + "." + process.pid + ".tmp";
        fs.writeFileSync(temp, JSON.stringify(store));
        fs.renameSync(temp, file);
      } catch (err) { /* kept in memory until the next save */ }
    }, 1000);
  }
  const current = (text) => {
    const entry = store[textKey(text)];
    return entry && entry.v === ANSWER_VERSION ? entry : undefined;
  };
  return {
    has: (text) => current(text) !== undefined,
    get: (text) => current(text),
    set: (text, value) => { store[textKey(text)] = { v: ANSWER_VERSION, suggestions: value.suggestions, at: Date.now() }; save(); },
    clear: () => { store = {}; cleared = true; save(); }
  };
}

// ---- in VS Code ----

function activate(context, helpers) {
  const vscode = require("vscode");
  const log = helpers.log;
  const workDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "word-page", "assistant");
  // paragraph text -> { suggestions }, kept on disk in this VS Code's own add-on folder (a test
  // copy of VS Code with its own --user-data-dir has its own)
  const results = savedResults(path.join(context.globalStorageUri.fsPath, "assistant-answers.json"));
  const asking = new Set();      // paragraph texts being asked about now
  const waiting = [];            // paragraph texts to ask about, oldest first
  const lastText = new Map();    // document -> its text at the last change
  let lastTyping = 0;            // when a page document last changed
  let failure = "";              // the last error, shown on the page and in the status bar
  let writeTimer = null;

  const settings = () => vscode.workspace.getConfiguration("wordPage");
  const isOn = () => settings().get("assistant", true);

  // the documents open as a page now
  function pageDocs() {
    const uris = new Set();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === "quarto.visualEditor") { uris.add(tab.input.uri.toString()); }
      }
    }
    return vscode.workspace.textDocuments.filter((doc) => uris.has(doc.uri.toString()));
  }

  function checkable(text) {
    return wordCount(text) >= MIN_WORDS;
  }

  // what the page should show: the suggestions of every paragraph of the open pages
  function data() {
    const suggestions = [];
    const seen = new Set();
    for (const doc of pageDocs()) {
      for (const p of paragraphsOf(doc.getText())) {
        const found = results.get(p.text);
        if (!found || seen.has(p.text)) { continue; }
        seen.add(p.text);
        suggestions.push(...found.suggestions);
      }
    }
    return { on: isOn(), busy: asking.size + waiting.length, error: failure, suggestions: suggestions };
  }

  function writeSoon() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const now = data();
      for (const folder of helpers.quartoFolders()) {
        try {
          const file = helpers.patch.assistantDataFile(folder);
          const css = helpers.patch.assistantDataCss(now);
          if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== css) { helpers.patch.writeAssistantData(folder, now); }
        } catch (err) {
          log("assistant: could not write the suggestions into " + folder + ": " + (err && err.message ? err.message : err));
        }
      }
      showStatus(now);
    }, 200);
  }

  // ---- the status bar: what Claude is doing; a click gives the choices ----
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = "wordPage.assistantMenu";
  context.subscriptions.push(status);
  function showStatus(now) {
    if (!pageDocs().length) { status.hide(); return; }
    if (!now.on) {
      status.text = "$(circle-slash) Claude off";
      status.tooltip = "Claude's suggestions on the page are off. Click for the choices.";
    } else if (now.error) {
      status.text = "$(warning) Claude";
      status.tooltip = "Claude's suggestions: " + now.error;
    } else if (now.busy) {
      status.text = "$(sync~spin) Claude reading";
      status.tooltip = "Claude is reading " + now.busy + " paragraph" + (now.busy === 1 ? "" : "s");
    } else {
      status.text = "$(sparkle) Claude " + now.suggestions.length;
      status.tooltip = now.suggestions.length + " suggestion" + (now.suggestions.length === 1 ? "" : "s") + " on the page. Click for the choices.";
    }
    status.show();
  }

  // ---- asking, a few at a time ----
  function next() {
    while (isOn() && asking.size < AT_ONCE && waiting.length) {
      const text = waiting.shift();
      if (results.has(text) || asking.has(text) || !stillThere(text)) { continue; }
      ask(text);
    }
    writeSoon();
  }

  function stillThere(text) {
    return pageDocs().some((doc) => paragraphsOf(doc.getText()).some((p) => p.text === text));
  }

  // the sources of a .bib file, read again only when the file changed
  const bibRead = new Map();   // file -> { time, lines }
  function sourcesOf(doc) {
    const lines = [];
    for (const file of bibliographyFiles(doc.getText(), path.dirname(doc.uri.fsPath))) {
      try {
        const time = fs.statSync(file).mtimeMs;
        if (!bibRead.has(file) || bibRead.get(file).time !== time) { bibRead.set(file, { time: time, lines: bibLines(fs.readFileSync(file, "utf8")) }); }
        lines.push(...bibRead.get(file).lines);
      } catch (err) { /* no such file: no sources from it */ }
    }
    return lines;
  }

  async function ask(text) {
    asking.add(text);
    writeSoon();
    const exe = findClaude(settings().get("claudePath", ""));
    const model = settings().get("assistantModel", "sonnet");
    const doc = pageDocs().find((d) => paragraphsOf(d.getText()).some((p) => p.text === text));
    const system = doc ? systemFor(sourcesOf(doc), outlineOf(doc.getText())) : SYSTEM;
    const started = Date.now();
    try {
      const list = await askClaude(exe, model, text, workDir, system);
      const ready = list.slice(0, MAX_SUGGESTIONS).map((s) => prepare(text, s)).filter(Boolean);
      results.set(text, { suggestions: ready });
      failure = "";
      log("assistant: " + ready.length + " of " + list.length + " suggestions for \"" + text.slice(0, 40) + "...\" (" + (Date.now() - started) + " ms)");
    } catch (err) {
      failure = (err && err.code === "ENOENT") ? "the Claude Code program was not found (setting wordPage.claudePath)" :
        (err && err.message ? err.message : String(err));
      log("assistant: ERR " + failure);
    }
    asking.delete(text);
    next();
  }

  function queue(text, front) {
    if (!checkable(text) || results.has(text) || asking.has(text) || waiting.includes(text)) { return; }
    if (front) { waiting.unshift(text); } else { waiting.push(text); }
  }

  // ---- watching the page documents ----
  const changed = new Set();     // paragraph texts that are new since the last pause

  function sameAsDisk(doc) {
    try { return fs.readFileSync(doc.uri.fsPath, "utf8").replace(/\r\n/g, "\n") === doc.getText().replace(/\r\n/g, "\n"); }
    catch (err) { return false; }
  }
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((change) => {
    const doc = change.document;
    if (!change.contentChanges.length || !/\.(qmd|md)$/i.test(doc.uri.fsPath)) { return; }
    const key = doc.uri.toString();
    // a document not seen before: only note the text (else every paragraph would count as new)
    if (!lastText.has(key)) { lastText.set(key, doc.getText()); return; }
    if (!pageDocs().includes(doc)) { lastText.set(key, doc.getText()); return; }
    const before = paragraphsOf(lastText.get(key));
    const now = paragraphsOf(doc.getText());
    lastText.set(key, doc.getText());
    // A change from the disk (a Claude edit, a file changed elsewhere) is not typing: the file
    // on the disk already holds exactly the new text. Typed text is saved only after the
    // change (files.autoSave 100 ms), so "not dirty" alone cannot tell them apart.
    if (!doc.isDirty && sameAsDisk(doc)) { writeSoon(); return; }
    const old = new Set(before.map((p) => p.text));
    const fresh = now.filter((p) => !old.has(p.text)).map((p) => p.text);
    const gone = before.filter((p) => !now.some((q) => q.text === p.text)).map((p) => p.text);
    // one paragraph changed into one other: maybe he accepted a suggestion
    if (fresh.length === 1 && gone.length === 1 && results.has(gone[0])) {
      const kept = afterAccept(gone[0], fresh[0], results.get(gone[0]).suggestions);
      if (kept) { results.set(fresh[0], { suggestions: kept.carried }); writeSoon(); return; }
    }
    fresh.forEach((text) => changed.add(text));
    if (fresh.length) { log("assistant: " + fresh.length + " changed paragraph" + (fresh.length === 1 ? "" : "s") + " in " + path.basename(doc.uri.fsPath) + ", waiting for a pause"); }
    lastTyping = Date.now();
    writeSoon();
  }));

  // after a pause in typing: the changed paragraphs that are still there go to Claude
  const timer = setInterval(() => {
    if (!changed.size || Date.now() - lastTyping < PAUSE || !isOn()) { return; }
    const texts = Array.from(changed);
    changed.clear();
    const now = texts.filter((text) => stillThere(text) && checkable(text));
    now.reverse().forEach((text) => queue(text, true));
    log("assistant: pause: " + now.length + " paragraph" + (now.length === 1 ? "" : "s") + " to Claude");
    next();
  }, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // the text of every .qmd and .md document as soon as it opens (also before its page tab is
  // there), so the first change can be compared with it
  function remember(doc) {
    if (/\.(qmd|md)$/i.test(doc.uri.fsPath) && !lastText.has(doc.uri.toString())) { lastText.set(doc.uri.toString(), doc.getText()); }
  }
  // A document that opens as a page: Claude reads all its text that he has no answer for yet,
  // in the order of the text, behind the paragraphs being typed (setting wordPage.assistantReadAll).
  const readDocs = new Set();
  function readOpenPages() {
    const open = pageDocs();
    for (const key of Array.from(readDocs)) {
      if (!open.some((doc) => doc.uri.toString() === key)) { readDocs.delete(key); }
    }
    if (!isOn() || !settings().get("assistantReadAll", true)) { return; }
    for (const doc of open) {
      const key = doc.uri.toString();
      if (readDocs.has(key)) { continue; }
      readDocs.add(key);
      const todo = paragraphsOf(doc.getText()).map((p) => p.text).filter((text) => checkable(text) && !results.has(text));
      todo.forEach((text) => queue(text, false));
      if (todo.length) { log("assistant: " + path.basename(doc.uri.fsPath) + " opened as a page: " + todo.length + " paragraphs to read"); }
    }
    next();
  }

  function noteOpenPages() {
    vscode.workspace.textDocuments.forEach(remember);
    readOpenPages();
    writeSoon();
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(remember),
    vscode.workspace.onDidCloseTextDocument((doc) => { lastText.delete(doc.uri.toString()); }),
    vscode.window.tabGroups.onDidChangeTabs(noteOpenPages)
  );
  noteOpenPages();

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("wordPage.assistant") || event.affectsConfiguration("wordPage.assistantReadAll")) {
      readDocs.clear();
      readOpenPages();
    }
  }));
  // the text of a page is there a moment after its tab: look again shortly after the start
  const startTimer = setTimeout(noteOpenPages, 3000);
  context.subscriptions.push({ dispose: () => clearTimeout(startTimer) });

  // ---- the commands ----
  function activePageDoc() {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const uri = tab && tab.input && tab.input.uri ? tab.input.uri.toString() : "";
    return pageDocs().find((doc) => doc.uri.toString() === uri) || pageDocs()[0];
  }

  async function checkAll() {
    const doc = activePageDoc();
    if (!doc) { vscode.window.showWarningMessage("Word Page: open a document as a page first."); return; }
    const todo = paragraphsOf(doc.getText()).map((p) => p.text).filter((text) => checkable(text) && !results.has(text));
    if (!todo.length) { vscode.window.showInformationMessage("Claude has already read every paragraph of " + path.basename(doc.uri.fsPath) + "."); return; }
    const go = await vscode.window.showInformationMessage(
      "Let Claude read " + todo.length + " paragraph" + (todo.length === 1 ? "" : "s") + " of " + path.basename(doc.uri.fsPath) +
      "? This uses some of your Claude usage (about " + Math.ceil(todo.length / AT_ONCE * 6 / 60) + " min).", "Read them", "Cancel");
    if (go !== "Read them") { return; }
    if (!isOn()) { await settings().update("assistant", true, vscode.ConfigurationTarget.Global); }
    todo.forEach((text) => queue(text, false));
    next();
  }

  async function toggle() {
    await settings().update("assistant", !isOn(), vscode.ConfigurationTarget.Global);
    if (!isOn()) { waiting.length = 0; }
    writeSoon();
  }

  async function menu() {
    const choice = await vscode.window.showQuickPick([
      { label: "$(book) Let Claude read the whole document", id: "all" },
      { label: isOn() ? "$(circle-slash) Turn Claude's suggestions off" : "$(sparkle) Turn Claude's suggestions on", id: "toggle" },
      { label: "$(trash) Forget the suggestions and read again", id: "forget" }
    ], { placeHolder: "Claude's suggestions on the page" });
    if (!choice) { return; }
    if (choice.id === "all") { checkAll(); }
    if (choice.id === "toggle") { toggle(); }
    if (choice.id === "forget") {
      results.clear();
      failure = "";
      writeSoon();
      if (settings().get("assistantReadAll", true)) { readDocs.clear(); readOpenPages(); } else { checkAll(); }
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("wordPage.assistantCheckAll", checkAll),
    vscode.commands.registerCommand("wordPage.assistantToggle", toggle),
    vscode.commands.registerCommand("wordPage.assistantMenu", menu)
  );
}

module.exports = {
  activate, paragraphsOf, plainOf, letters, prepare, afterAccept, claudeArgs, findClaude, askClaude, wordCount, savedResults,
  bibliographyFiles, bibLines, outlineOf, systemFor,
  SYSTEM, SCHEMA, PAUSE, MIN_WORDS
};
