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
//    on a line shows a card with Accept and Decline; a list of all of them is on the right.
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
const KINDS = ["spelling", "grammar", "punctuation", "clarity", "concise", "wording", "source", "notation"];
const NO_MARKUP = /[*_`$@\[\]#^\\{}<>|~]/;   // an "original" with these is not plain text on the page
// a citation: [@key], [see @key, p. 5], [@a; @b], or @key in the running text
const CITATION = /\[[^\]]*@[^\]]*\]|-?@[\w:.&-]+/g;
// inline maths: $y_{it}$
const INLINE_MATHS = /\$[^$\n]+\$/g;
const CITATION_IN_BRACKETS = /\[[^\]]*@[^\]]*\]/g;

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
// Plain text, or plain text with citations in it (and, for new words, inline maths): anything else
// (bold, code, maths in the old words) is left alone.
function plainEnough(text, mathsToo) {
  const rest = text.replace(CITATION, "");
  return !NO_MARKUP.test(mathsToo ? rest.replace(INLINE_MATHS, "") : rest);
}

// A suggestion from Claude, checked and made ready for the page, or null when it is not usable:
// the old words must be in the paragraph exactly once, and old and new words may only hold plain
// text and citations. before/after: up to 40 letters around it, to find the right place.
// note: a source problem without a fix from the list (new words = old words): only a remark.
// rich: old or new words hold a citation or maths; typing cannot make those (Quarto keeps them as
// text), so the page builds them as Quarto does (inject/assistant.js, acceptWithQuarto).
function prepare(paragraph, s) {
  if (!s || typeof s.original !== "string" || typeof s.replacement !== "string") { return null; }
  const original = s.original;
  // "--" and "---" are Markdown for a dash, but typed on the page they stay two or three hyphens
  // ("30-39" became "30--39", 16 Nov 2026): new words get the real dashes, – and —
  const replacement = original.includes("--") ? s.replacement : s.replacement.replace(/---/g, "—").replace(/--/g, "–");
  const kind = KINDS.includes(s.kind) ? s.kind : "clarity";
  const note = original === replacement;
  if (!original.trim() || original.length > 400 || (note && kind !== "source")) { return null; }
  if (!plainEnough(original, false) || !plainEnough(replacement, true)) { return null; }
  if (count(paragraph, original) !== 1 || !letters(original)) { return null; }
  const at = paragraph.indexOf(original);
  const before = letters(plainOf(paragraph.slice(0, at))).slice(-40);
  const after = letters(plainOf(paragraph.slice(at + original.length))).slice(0, 40);
  const reason = String(s.reason || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const id = crypto.createHash("sha1").update(paragraph + "\u0000" + original + "\u0000" + replacement).digest("hex").slice(0, 16);
  const rich = !note && /[\[\]@$]/.test(original + replacement);
  return { id, original, replacement, kind, reason, before, after, note, rich };
}

// ---- what Claude changed in the file (16 Nov 2026) ----
// Asked: "underline the rows you added or changed, with a little window like the suggestions
// that shows what you changed, and a switch to turn it off or on". A change that comes from the
// disk (a Claude edit through the Edit/Write tools: the file already holds the new text when VS
// Code sees it) is compared with the text before, word by word: each run of changed words
// becomes one mark, { added: the new words, removed: the old words }, with the letters around
// it so the page can find it. A deletion gets the word next to it as its mark.
const MIN_MARK_LETTERS = 8;    // shorter marks take in the words around them, so they can be found
const MAX_MARKS = 300;         // per change of the file

function tokens(text) {
  return text.match(/\s+|[\p{L}\p{N}_@'’-]+|[^\s\p{L}\p{N}]/gu) || [];
}

// the longest common subsequence of two lists of strings: pairs [i, j] of equal items, in order
function commonItems(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 4e6) { return null; }   // too big to compare item by item
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) { i++; }
    else { j++; }
  }
  return pairs;
}

// the marks for one old line and its new line: runs of changed words
function wordMarks(oldLine, newLine) {
  const a = tokens(oldLine), b = tokens(newLine);
  const pairs = commonItems(a, b) || [];
  pairs.push([a.length, b.length]);
  const runs = [];
  let i = 0, j = 0;
  for (const [pi, pj] of pairs) {
    if (pi > i || pj > j) { runs.push({ a0: i, a1: pi, b0: j, b1: pj }); }
    i = pi + 1; j = pj + 1;
  }
  // runs with only spaces between them are one change
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && b.slice(last.b1, run.b0).every((t) => /^\s+$/.test(t)) && a.slice(last.a1, run.a0).every((t) => /^\s+$/.test(t))) {
      last.a1 = run.a1; last.b1 = run.b1;
    } else { merged.push(Object.assign({}, run)); }
  }
  const out = [];
  for (const run of merged) {
    if (b.slice(run.b0, run.b1).concat(a.slice(run.a0, run.a1)).every((t) => /^\s+$/.test(t))) { continue; }   // only spaces
    // a mark needs some letters of the new text: take in words around it until it has enough
    let { a0, a1, b0, b1 } = run;
    const lettersIn = () => letters(b.slice(b0, b1).join("")).length;
    while (lettersIn() < MIN_MARK_LETTERS && (b0 > 0 || b1 < b.length)) {
      if (b1 < b.length) { b1++; a1++; }
      if (lettersIn() < MIN_MARK_LETTERS && b0 > 0) { b0--; a0--; }
    }
    a0 = Math.max(0, a0); a1 = Math.min(a.length, a1);
    out.push({ added: b.slice(b0, b1).join("").trim(), removed: a.slice(a0, a1).join("").trim(), b0: b0, b1: b1, tokens: b });
  }
  return out;
}

// All marks between the old and the new text of a file. Lines are compared first (a line that
// is new is one mark; an old line that became a new line is compared word by word).
function changesBetween(oldText, newText) {
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");
  let top = 0;
  while (top < oldLines.length && top < newLines.length && oldLines[top] === newLines[top]) { top++; }
  let end = 0;
  while (end < oldLines.length - top && end < newLines.length - top &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]) { end++; }
  // empty lines are all the same: they would tie old and new paragraphs together in the wrong places
  const oldMid = oldLines.slice(top, oldLines.length - end).filter((line) => line.trim());
  const newMid = newLines.slice(top, newLines.length - end).filter((line) => line.trim());
  const pairs = (commonItems(oldMid, newMid) || []).concat([[oldMid.length, newMid.length]]);
  const marks = [];
  let i = 0, j = 0;
  for (const [pi, pj] of pairs) {
    const gone = oldMid.slice(i, pi), came = newMid.slice(j, pj);
    // each new line with the old line that looks most like it (in order), else it is all new
    let from = 0;
    for (let k = 0; k < came.length; k++) {
      if (!came[k].trim()) { continue; }
      let best = -1, bestScore = 0.4;
      for (let g = from; g < gone.length; g++) {
        const score = alike(gone[g], came[k]);
        if (score > bestScore) { best = g; bestScore = score; }
      }
      if (best >= 0) {
        wordMarks(gone[best], came[k]).forEach((mark) => marks.push(withContext(mark, came[k])));
        from = best + 1;
      } else {
        marks.push(withContext({ added: came[k].trim(), removed: "", b0: 0, b1: tokens(came[k]).length, tokens: tokens(came[k]) }, came[k]));
      }
    }
    i = pi + 1; j = pj + 1;
  }
  return marks.filter((mark) => letters(mark.added)).slice(0, MAX_MARKS);
}

// how much two lines share: 0 (nothing) to 1 (the same words)
function alike(a, b) {
  const wa = a.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [], wb = b.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!wa.length || !wb.length) { return 0; }
  const count = new Map();
  wa.forEach((w) => count.set(w, (count.get(w) || 0) + 1));
  let shared = 0;
  wb.forEach((w) => { if (count.get(w) > 0) { shared++; count.set(w, count.get(w) - 1); } });
  return 2 * shared / (wa.length + wb.length);
}

function withContext(mark, line) {
  const id = crypto.createHash("sha1").update(mark.removed + "\u0000" + mark.added + "\u0000" + line).digest("hex").slice(0, 16);
  return {
    id: id, added: mark.added, removed: mark.removed,
    before: letters(plainOf(mark.tokens.slice(0, mark.b0).join(""))).slice(-40),
    after: letters(plainOf(mark.tokens.slice(mark.b1).join(""))).slice(0, 40),
    // Undo on the page: plain text, whole citations and inline maths only (a key alone inside a
    // citation, or bold, code and the like: Ctrl+Z in the text view instead)
    undo: plainEnough(mark.added, true) && plainEnough(mark.removed, true) && !/@/.test((mark.added + mark.removed).replace(CITATION_IN_BRACKETS, "")),
    rich: /[\[\]@$]/.test(mark.added + mark.removed)
  };
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
  // the equations ($$ ... $$), so Claude knows how the symbols of the model are written
  const equations = (markdown.replace(/\r\n/g, "\n").match(/\$\$([\s\S]*?)\$\$/g) || []).map((x) => x.replace(/\s+/g, " ").trim().slice(0, 300));
  return "Sections: " + sections.join("; ") + "\nFigures: " + (figures.join(", ") || "none") + "\nTables: " + (tables.join(", ") || "none") +
    "\nEquations: " + (equations.join("\n") || "none");
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
  "(economics, British English). You get one paragraph of the paper in Markdown, under PARAGRAPH",
  "TO CHECK, with the paragraph before it and the paragraph after it for context. Suggest changes",
  "only inside the paragraph to check (\"original\" is always copied from it), never in the others.",
  "Every change must still fit the text around it: read the whole paragraph and its neighbours",
  "first, and read the full sentence with your replacement in it before you suggest it. Never",
  "suggest a change that breaks the link with the sentence before or after, repeats or contradicts",
  "them, leaves a sentence with a colon, \"they\" or \"this\" that no longer points to anything, or",
  "reads worse as a whole than before. Propose only real improvements:",
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
  "- Never change numbers, existing maths, code or URLs.",
  "- Type the real characters, never Markdown stand-ins: an en dash – for ranges (ages 20–39,",
  "  2016–2024), never \"--\"; an em dash —, never \"---\". The author's \"--\" or \"-\" in a range",
  "  becomes – (kind \"punctuation\").",
  "- \"replacement\" replaces exactly the \"original\" text.",
  "- \"reason\": at most 12 plain words, written for a student.",
  "- \"kind\": spelling, grammar, punctuation, clarity, concise, wording, source or notation.",
  "Notation (kind \"notation\"): a symbol of the model typed as plain letters in the text (yit, Ti,",
  "  beta1, alpha i, a lone i or t that stands for the index) is written as inline maths, the same way",
  "  as in the document's equations (listed below): \"yit\" -> \"$y_{it}$\", \"Ti\" -> \"$T_i$\",",
  "  \"beta1\" -> \"$\\beta_1$\". The original is the plain letters (with a neighbouring word when needed",
  "  to make it unique); the replacement keeps that neighbouring word and puts the symbol in $...$.",
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

// What Claude gets for one paragraph: the paragraph before it and the one after it as context,
// so a suggestion fits the sentences around it (asked 16 Nov 2026, after a rewrite that read
// badly with the sentence after it). Without a document: the paragraph alone.
function messageFor(markdown, text) {
  const all = markdown ? paragraphsOf(markdown).map((p) => p.text) : [];
  const at = all.indexOf(text);
  const before = at > 0 ? all[at - 1] : "(none: start of the text)";
  const after = at >= 0 && at < all.length - 1 ? all[at + 1] : "(none: end of the text)";
  return "PARAGRAPH BEFORE (context only, do not edit):\n" + before +
    "\n\nPARAGRAPH TO CHECK:\n" + text +
    "\n\nPARAGRAPH AFTER (context only, do not edit):\n" + after + "\n";
}

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
// 4: notation (symbols as inline maths), "rich" instead of "citation".
const ANSWER_VERSION = 4;

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
  // carried: only the suggestions left over after an Accept; Claude still reads the new text
  return {
    has: (text) => current(text) !== undefined,
    answered: (text) => current(text) !== undefined && !current(text).carried,
    get: (text) => current(text),
    set: (text, value) => { store[textKey(text)] = { v: ANSWER_VERSION, suggestions: value.suggestions, carried: value.carried ? true : undefined, at: Date.now() }; save(); },
    clear: () => { store = {}; cleared = true; save(); }
  };
}

// Claude's edits per document, kept on the disk for EDIT_DAYS days (also after a restart):
// { "<document>": [mark, ...] }; every save takes in what other VS Code windows wrote.
const EDIT_DAYS = 7;

function savedEdits(file) {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (err) { store = {}; }
  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        let disk = {};
        try { disk = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (err) { disk = {}; }
        const oldest = Date.now() - EDIT_DAYS * 86400000;
        for (const doc of new Set(Object.keys(disk).concat(Object.keys(store)))) {
          const byId = new Map();
          (disk[doc] || []).concat(store[doc] || []).forEach((mark) => { if (mark.at >= oldest) { byId.set(mark.id, mark); } });
          store[doc] = Array.from(byId.values());
          if (!store[doc].length) { delete store[doc]; }
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = file + "." + process.pid + ".tmp";
        fs.writeFileSync(temp, JSON.stringify(store));
        fs.renameSync(temp, file);
      } catch (err) { /* kept in memory until the next save */ }
    }, 1000);
  }
  return {
    get: (doc) => store[doc] || [],
    add: (doc, marks) => {
      const byId = new Map((store[doc] || []).map((mark) => [mark.id, mark]));
      marks.forEach((mark) => byId.set(mark.id, mark));
      store[doc] = Array.from(byId.values());
      save();
    }
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
  // document -> Claude's edits in it (the marks on the page, see changesBetween)
  const edits = savedEdits(path.join(context.globalStorageUri.fsPath, "assistant-edits.json"));
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
    const changes = [];
    const seen = new Set();
    for (const doc of pageDocs()) {
      const text = doc.getText();
      for (const p of paragraphsOf(text)) {
        const found = results.get(p.text);
        if (!found || seen.has(p.text)) { continue; }
        seen.add(p.text);
        suggestions.push(...found.suggestions);
      }
      // Claude's edits whose new words are still in the document
      edits.get(doc.uri.toString()).forEach((mark) => { if (text.includes(mark.added)) { changes.push(mark); } });
    }
    return { on: isOn(), busy: asking.size + waiting.length, error: failure, suggestions: suggestions, edits: changes };
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
      if (results.answered(text) || asking.has(text) || !stillThere(text)) { continue; }
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
      const list = await askClaude(exe, model, messageFor(doc ? doc.getText() : "", text), workDir, system);
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
    if (!checkable(text) || results.answered(text) || asking.has(text) || waiting.includes(text)) { return; }
    if (front) { waiting.unshift(text); } else { waiting.push(text); }
  }

  // ---- watching the page documents ----
  const changed = new Set();     // paragraph texts that are new since the last pause

  // Claude's edit (a change from the disk): the marks of what changed, kept for the page
  function recordEdits(doc, previous) {
    try {
      const marks = changesBetween(previous, doc.getText()).map((mark) => Object.assign(mark, { at: Date.now() }));
      if (!marks.length) { return; }
      edits.add(doc.uri.toString(), marks);
      log("assistant: an edit from the disk in " + path.basename(doc.uri.fsPath) + ": " + marks.length + " mark" + (marks.length === 1 ? "" : "s"));
    } catch (err) {
      log("assistant: ERR could not compare the edit: " + (err && err.message ? err.message : err));
    }
  }

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
    const previous = lastText.get(key);
    // A change from the disk (a Claude edit, a file changed elsewhere) is not typing: the file
    // on the disk already holds exactly the new text. Typed text is saved only after the
    // change (files.autoSave 100 ms), so "not dirty" alone cannot tell them apart.
    const fromDisk = !doc.isDirty && sameAsDisk(doc);
    if (fromDisk) { recordEdits(doc, previous); }
    if (!pageDocs().includes(doc)) { lastText.set(key, doc.getText()); return; }
    const before = paragraphsOf(previous);
    const now = paragraphsOf(doc.getText());
    lastText.set(key, doc.getText());
    if (fromDisk) { writeSoon(); return; }
    const old = new Set(before.map((p) => p.text));
    const fresh = now.filter((p) => !old.has(p.text)).map((p) => p.text);
    const gone = before.filter((p) => !now.some((q) => q.text === p.text)).map((p) => p.text);
    // one paragraph changed into one other: maybe he accepted a suggestion. The other suggestions
    // stay on the page at once, and Claude still reads the new text after the pause, so what the
    // Accept brought in is checked too (asked 16 Nov 2026, after an Accept typed "30--39")
    if (fresh.length === 1 && gone.length === 1 && results.has(gone[0])) {
      const kept = afterAccept(gone[0], fresh[0], results.get(gone[0]).suggestions);
      if (kept) { results.set(fresh[0], { suggestions: kept.carried, carried: true }); }
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
      const todo = paragraphsOf(doc.getText()).map((p) => p.text).filter((text) => checkable(text) && !results.answered(text));
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
    const todo = paragraphsOf(doc.getText()).map((p) => p.text).filter((text) => checkable(text) && !results.answered(text));
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
  activate, messageFor, paragraphsOf, plainOf, letters, prepare, afterAccept, claudeArgs, findClaude, askClaude, wordCount, savedResults,
  bibliographyFiles, bibLines, outlineOf, systemFor, changesBetween, savedEdits,
  SYSTEM, SCHEMA, PAUSE, MIN_WORDS
};
