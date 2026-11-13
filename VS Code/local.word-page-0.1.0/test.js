// Offline checks for patch.js, mention.js and typing.js (no VS Code needed). Run with VS Code's own node:
//   $env:ELECTRON_RUN_AS_NODE = "1"; & "<VS Code>\Code.exe" test.js
// It works on a made-up Quarto folder in the temp folder; nothing real is touched.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const patch = require("./patch");

let passed = 0;
let failed = 0;
function check(what, ok) {
  if (ok) { passed++; } else { failed++; console.log("FAIL: " + what); }
}

const inject = path.join(__dirname, "inject");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "word-page-test-"));

function makeQuarto(version) {
  const dir = path.join(temp, "quarto.quarto-" + version, "assets", "www", "editor");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.js"), "(function(e,t){/* quarto " + version + " */})(this);\n");
  fs.writeFileSync(path.join(dir, "style.css"), ".ProseMirror{position:relative}\n");
  return path.join(temp, "quarto.quarto-" + version);
}

const old = makeQuarto("1.139.0");
const newer = makeQuarto("1.140.2");
makeQuarto("1.99.0");
fs.mkdirSync(path.join(temp, "other.addon-1.0.0"));
const options = { pageWidth: 820 };
const files = patch.editorFiles(old);
const jsBefore = fs.readFileSync(files.js, "utf8");
const cssBefore = fs.readFileSync(files.css, "utf8");

// finding Quarto
check("newest Quarto folder is found (1.140.2, not 1.99.0)", patch.findQuarto(temp) === newer);
check("no Quarto folder gives an empty answer", patch.findQuarto(path.join(temp, "other.addon-1.0.0")) === "");
check("a missing folder gives an empty answer", patch.findQuarto(path.join(temp, "nope")) === "");

// the blocks
const blocks = patch.buildBlocks(inject, options);
check("script block starts with the start mark", blocks.js.startsWith(patch.START));
check("script block ends with the end mark", blocks.js.trimEnd().endsWith(patch.END));
check("style block starts with the start mark", blocks.css.startsWith(patch.START));
check("script block has no placeholder left", !/\/\*(LIGHT|DROP|OPTIONS|SYNC|MERGE)\*\//.test(blocks.js));
check("script block holds the merge, and no hook marks", blocks.js.includes("function merge3(") && !blocks.js.includes("/*wp+*/") && !blocks.js.includes("/*wp-*/"));
check("script block is valid JavaScript", (() => { try { new Function(blocks.js); return true; } catch (e) { console.log(e.message); return false; } })());
check("script block holds the light background colour", blocks.js.includes('"--vscode-editor-background":"#ffffff"'));
check("script block holds no font settings", !blocks.js.includes("--vscode-font-family") && !blocks.js.includes("--vscode-editor-font-size"));
check("page width goes into the script block", patch.buildBlocks(inject, { pageWidth: 700 }).js.includes('"pageWidth":700'));

// apply
check("state before: none", patch.state(old, inject, options) === "none");
check("first apply: applied", patch.apply(old, inject, options) === "applied");
check("state after: applied", patch.state(old, inject, options) === "applied");
check("index.js = block + original", fs.readFileSync(files.js, "utf8") === blocks.js + jsBefore);
check("style.css = original + line break + block", fs.readFileSync(files.css, "utf8") === cssBefore + "\n" + blocks.css);
check("second apply: already", patch.apply(old, inject, options) === "already");
check("second apply changed nothing", fs.readFileSync(files.js, "utf8") === blocks.js + jsBefore);
check("no temp file left behind", !fs.existsSync(files.js + ".word-page-tmp") && !fs.existsSync(files.css + ".word-page-tmp"));

// another page width replaces the block, it does not stack
check("other width: applied", patch.apply(old, inject, { pageWidth: 700 }) === "applied");
check("state for the old width: other", patch.state(old, inject, options) === "other");
const jsWide = fs.readFileSync(files.js, "utf8");
check("only one script block in the file", jsWide.split(patch.START).length === 2);
check("only one style block in the file", fs.readFileSync(files.css, "utf8").split(patch.START).length === 2);
check("original script still follows the block", jsWide.endsWith(jsBefore));

// remove
check("remove: removed", patch.remove(old) === "removed");
check("index.js is the original again", fs.readFileSync(files.js, "utf8") === jsBefore);
check("style.css is the original again", fs.readFileSync(files.css, "utf8") === cssBefore);
check("second remove: clean", patch.remove(old) === "clean");

// the PDF look: its rules and fonts go inside the same style block
const pdfOptions = { pageWidth: 820, look: "pdf" };
const pdfBlocks = patch.buildBlocks(inject, pdfOptions);
check("no look given: the Word look, without the PDF rules",
  blocks.js.includes('"look":"word"') && !blocks.css.includes("pdf-look") && !blocks.css.includes("@font-face"));
check("PDF look goes into the script block", pdfBlocks.js.includes('"look":"pdf"'));
check("PDF look: the script block is valid JavaScript", (() => { try { new Function(pdfBlocks.js); return true; } catch (e) { return false; } })());
check("PDF look: the style block starts and ends with the marks",
  pdfBlocks.css.startsWith(patch.START) && pdfBlocks.css.trimEnd().endsWith(patch.END));
check("PDF look: one start mark and one end mark",
  pdfBlocks.css.split(patch.START).length === 2 && pdfBlocks.css.split(patch.END).length === 2);
check("PDF look: the Word rules stay, the PDF rules come after them",
  pdfBlocks.css.indexOf("html.word-page.pdf-look") > pdfBlocks.css.indexOf("html.word-page #editor"));
check("PDF look: all eight fonts are written into the rules",
  (pdfBlocks.css.match(/url\("data:font\/otf;base64,[A-Za-z0-9+\/=]+"\)/g) || []).length === 8 && !pdfBlocks.css.includes('url("fonts/'));
check("PDF look: folded code and page ends are on unless switched off",
  pdfBlocks.js.includes('"fold":true') && pdfBlocks.js.includes('"pageEnds":true') &&
  patch.buildBlocks(inject, { pageWidth: 820, look: "pdf", fold: false, pageEnds: false }).js.includes('"fold":false,"pageEnds":false'));
check("PDF look: \"indent: true\" in the header gives indented paragraphs (class wp-indent)",
  pdfBlocks.js.includes('classList.toggle("wp-indent"') &&
  pdfBlocks.css.includes("html.word-page.pdf-look.wp-indent .pm-content > p") && pdfBlocks.css.includes("calc(35.43 * var(--wp-pt))"));
check("PDF look: numbered headings, but not {.unnumbered} ones",
  pdfBlocks.css.includes("h1.pm-heading:not(.unnumbered)::before") && pdfBlocks.css.includes('counter(wp-h1) "." counter(wp-h2)'));
check("PDF look: a font comes back byte for byte", (() => {
  const found = /font-weight: 400; font-style: normal; src: url\("data:font\/otf;base64,([^"]+)"\)/.exec(pdfBlocks.css);
  return found !== null && Buffer.from(found[1], "base64").equals(fs.readFileSync(path.join(inject, "fonts", "lmroman10-regular.otf")));
})());
check("PDF look: as many { as }", pdfBlocks.css.split("{").length === pdfBlocks.css.split("}").length);
check("PDF look: applied", patch.apply(old, inject, pdfOptions) === "applied");
check("PDF look: state applied; for the Word look: other",
  patch.state(old, inject, pdfOptions) === "applied" && patch.state(old, inject, options) === "other");
check("PDF look: second apply: already", patch.apply(old, inject, pdfOptions) === "already");
check("back to the Word look: applied, and one style block in the file",
  patch.apply(old, inject, options) === "applied" && fs.readFileSync(files.css, "utf8") === cssBefore + "\n" + blocks.css);
patch.apply(old, inject, pdfOptions);
check("remove after the PDF look: both files are the originals again",
  patch.remove(old) === "removed" && fs.readFileSync(files.js, "utf8") === jsBefore && fs.readFileSync(files.css, "utf8") === cssBefore);

// the page ends of the PDF: the file the page reads
const docs = [{ name: "draft.pdf", built: "15:30", pages: [{ n: 2, sideways: false, lines: ["Høydahl’s “line” – 25,000 kr"] }] }];
const dataCss = patch.pdfDataCss(docs);
check("page ends: one CSS variable with the data as base64", /^:root \{ --wp-pdf-pages: "[A-Za-z0-9+\/=]+"; \}$/m.test(dataCss));
check("page ends: the data comes back as it went in (also ø, curly quotes, dash)",
  JSON.stringify(patch.readPdfDataCss(dataCss)) === JSON.stringify(docs));
patch.writePdfData(old, docs);
check("page ends: the file is written next to Quarto's index.js",
  path.dirname(patch.pdfDataFile(old)) === path.dirname(files.js) && fs.readFileSync(patch.pdfDataFile(old), "utf8") === dataCss);
check("page ends: remove takes the file away too", patch.remove(old) === "removed" && !fs.existsSync(patch.pdfDataFile(old)));
check("from the PDF: on unless switched off",
  pdfBlocks.js.includes('"fromPdf":true') && patch.buildBlocks(inject, { pageWidth: 820, look: "pdf", fromPdf: false }).js.includes('"fromPdf":false'));
fs.mkdirSync(patch.pdfPictureDir(old), { recursive: true });
fs.writeFileSync(path.join(patch.pdfPictureDir(old), "p1-abc-Table_1.png"), "x");
check("from the PDF: the pictures are in a folder next to Quarto's index.js",
  path.dirname(patch.pdfPictureDir(old)) === path.dirname(files.js) && path.basename(patch.pdfPictureDir(old)) === patch.PICTURE_DIR);
check("from the PDF: remove takes the pictures away too", patch.remove(old) === "removed" && !fs.existsSync(patch.pdfPictureDir(old)));

// a style file without a last line break comes back without one
fs.writeFileSync(files.css, ".a{color:red}");
patch.apply(old, inject, options);
check("block starts on its own line", fs.readFileSync(files.css, "utf8") === ".a{color:red}\n" + blocks.css);
patch.remove(old);
check("remove gives back the exact file (no line break added)", fs.readFileSync(files.css, "utf8") === ".a{color:red}");

// Windows line endings in Quarto's files stay as they are
fs.writeFileSync(files.css, ".a{color:red}\r\n.b{color:blue}\r\n");
patch.apply(old, inject, options);
check("applied on a file with Windows line endings", patch.state(old, inject, options) === "applied");
patch.remove(old);
check("Windows line endings are kept", fs.readFileSync(files.css, "utf8") === ".a{color:red}\r\n.b{color:blue}\r\n");

// strip
check("strip leaves other text alone", patch.strip("abc") === "abc");
check("strip takes out a block at the start and one at the end",
  patch.strip(patch.START + " x */\nfoo\n" + patch.END + "\nmiddle\n" + "\n" + patch.START + " y */" + patch.END + "\n") === "middle\n");
check("strip refuses a block without end", (() => { try { patch.strip(patch.START + " x */ foo"); return false; } catch (e) { return true; } })());

// the script block also answers the add-on's copy for Claude, and stops a stray paste
check("script block listens for the Claude key, a copy and a paste",
  blocks.js.includes('"Numpad5"') && blocks.js.includes('addEventListener("copy"') && blocks.js.includes('addEventListener("paste"'));

// ---- mention.js: the reference for the Claude chat box ----
const mention = require("./mention");
const sample = fs.readFileSync(path.join(__dirname, "bench", "sample", "sample.qmd"), "utf8").replace(/\r\n/g, "\n");
const lineOf = (text) => sample.split("\n").findIndex((line) => line.includes(text)) + 1;
const intro = lineOf("Norway forgives");       // one long line: the first paragraph
const second = lineOf("A second paragraph");
const same = (lines, first, last) => lines !== null && lines.first === first && lines.last === last;

check("an answer of the page is read",
  mention.readCopied(JSON.stringify({ wordPage: 1, text: "abc", before: "x", after: "y" })).text === "abc");
check("plain text on the clipboard is not an answer", mention.readCopied("just some text") === null);
check("other JSON on the clipboard is not an answer", mention.readCopied('{"text":"abc"}') === null);
check("letters only: marks, spaces and capitals go", mention.lettersOf("The **Student** loan, 2026!") === "thestudentloan2026");

check("a sentence is found on its line",
  same(mention.findLines(sample, { text: "This paper asks whether the scheme brought young adults to these places" }), intro, intro));
check("bold marks in the file do not matter",
  same(mention.findLines(sample, { text: "part of the student loan for people" }), intro, intro));
check("curly quotes and dashes on the page do not matter",
  same(mention.findLines("a\n\nShe said \"no\" -- twice.\n", { text: "She said “no” – twice." }), 3, 3));
check("text over two paragraphs gives both lines",
  same(mention.findLines(sample, { text: "small effects of place-based policies [see @kline2014, pp. 630-640].\n\nA second paragraph with a footnote" }), intro, second));
check("a list item is found", same(mention.findLines(sample, { text: "The centrality index" }), lineOf("The centrality index"), lineOf("The centrality index")));
check("a link inside the text: start and end are looked up",
  same(mention.findLines(sample, { text: "A second paragraph with a footnote1 and a link. Inline maths" }), second, second));
check("text that ends right after a link, over two paragraphs",
  same(mention.findLines(sample, { text: "Earlier work finds small effects of place-based policies [see @kline2014, pp. 630-640].\n\nA second paragraph with a footnote1 and a link. Inline" }), intro, second));
check("text that starts at a link", same(mention.findLines(sample, { text: "link. Inline maths" }), second, second));
check("a drawn formula inside the text: its letters are skipped",
  same(mention.findLines("One.\n\nThe model is $y = \\alpha + \\beta x$ for every town in the sample.\n", { text: "The model is y=α+βx for every town in the sample." }), 3, 3));
check("text that is not in the file gives no lines", mention.findLines(sample, { text: "this sentence is nowhere in the file" }) === null);
check("nothing but marks gives no lines", mention.findLines(sample, { text: " ... " }) === null);

const twice = "The scheme is new.\n\nMany like the scheme a lot.\n\nOthers say the scheme is unfair.\n";
check("a word that is there three times, without the words around it: no lines",
  mention.findLines(twice, { text: "scheme" }) === null);
check("the words before it pick the right one",
  same(mention.findLines(twice, { text: "scheme", before: "The scheme is new.Many like the ", after: " a lot.Others say" }), 3, 3));
check("the words after it pick the right one",
  same(mention.findLines(twice, { text: "scheme", before: "", after: " is unfair." }), 5, 5));

check("a short text is quoted whole", mention.shortQuote("  young   adults ") === "young adults");
check("a long text is quoted by its first and last four words",
  mention.shortQuote("Norway forgives part of the student loan for people who live in rural municipalities.") ===
  "Norway forgives part of ... live in rural municipalities.");
check("double quotes in the text become single ones", mention.shortQuote('the "treated" group') === "the 'treated' group");
check("reference with a line range",
  mention.buildMention("paper/draft.qmd", { first: 9, last: 11 }, "young adults") === '@paper/draft.qmd#9-11 "young adults" ');
check("reference with one line",
  mention.buildMention("paper/draft.qmd", { first: 9, last: 9 }, "young adults") === '@paper/draft.qmd#9 "young adults" ');
check("reference without lines keeps the file and the quote",
  mention.buildMention("paper/draft.qmd", null, "young adults") === '@paper/draft.qmd "young adults" ');

// the hooks in Quarto's code (patch.addSyncHooks), on Quarto 1.139's own lines
const quartoLines = "kst(n.vscode,{async init(t,r){try{s();let i=await e.setMarkdown(t,o(),!1);return i?(e.focus(r)," +
  "e.subscribe(xl,()=>n.onEditorUpdated(e.getStateJson())),i.canonical):null}catch(t){return e.onLoadFailed(t),null}}," +
  "async isFocused(){return e.hasFocus()},async applyExternalEdit(t){!e.hasFocus()&&!window.document.hasFocus()&&c(t)}," +
  "async getMarkdownFromState(t){return await e.getMarkdownFromStateJson(t,o())},async getSlideIndex(){return 1}});" +
  "class Ed{async setMarkdown(e,t,n){t=TA(t);let{doc:r,line_wrapping:i,unrecognized:a,example_lists:o,unparsed_meta:s}=" +
  "await this.pandocConverter.toProsemirror(e,this.pandocFormat);if(this.isInitialDoc())this.state=r}}";
const hooked = patch.addSyncHooks(quartoLines);
check("hooks: they fit Quarto 1.139's code", hooked.ok);
check("hooks: only text added, strip gives Quarto's code back byte for byte", patch.strip(hooked.js) === quartoLines);
check("hooks: the result is valid JavaScript", (() => { try { new Function("var kst=function(){};" + hooked.js); return true; } catch (e) { console.log(e.message); return false; } })());
check("hooks: external gets the text, the editor, its options and Quarto's own way",
  hooked.js.includes("window.wordPageSync.external(t,e,o,c)") && hooked.js.includes("window.wordPageSync.markdown(t,e,o)") &&
  hooked.js.includes("window.wordPageSync.started(i.canonical),/*wp-*/i.canonical):null}catch"));
check("hooks: the swap asks changedSince right after reading the markdown, before swapping",
  hooked.js.includes("toProsemirror(e,this.pandocFormat);/*wp+*/if(window.wordPageSync&&window.wordPageSync.changedSince&&window.wordPageSync.changedSince(this.state))throw"));
check("hooks: not twice", patch.addSyncHooks(quartoLines + quartoLines).ok === false);
check("hooks: without the swap lines nothing goes in", patch.addSyncHooks(quartoLines.replace("this.pandocConverter.toProsemirror", "this.converter.toProsemirror")).ok === false);
check("hooks: other variable names (another Quarto build) still fit", patch.addSyncHooks(quartoLines.replace(/\bc\(t\)/, "d(t)")).ok);
check("hooks: Quarto's code changed: nothing goes in", patch.addSyncHooks(quartoLines.replace("!window.document.hasFocus()&&", "")).ok === false);
check("hooks: patch.apply puts them in a Quarto that has these lines, and remove takes them out", (() => {
  fs.writeFileSync(files.js, quartoLines);
  const done = patch.apply(old, inject, options);
  const ok = done === "applied" && patch.synced(old) && fs.readFileSync(files.js, "utf8").includes("var SYNC = true;") &&
    patch.apply(old, inject, options) === "already" && patch.state(old, inject, options) === "applied";
  patch.remove(old);
  const back = fs.readFileSync(files.js, "utf8") === quartoLines && !patch.synced(old);
  fs.writeFileSync(files.js, jsBefore);
  return ok && back;
})());
check("hooks: a Quarto without these lines gets the block, with SYNC false", (() => {
  patch.apply(old, inject, options);
  const ok = fs.readFileSync(files.js, "utf8").includes("var SYNC = false;") && !patch.synced(old);
  patch.remove(old);
  return ok;
})());
fs.writeFileSync(patch.holdFile(old), ':root { --wp-hold: "1"; }');
check("hold file: next to Quarto's index.js, and remove takes it away",
  path.dirname(patch.holdFile(old)) === path.dirname(files.js) && patch.remove(old) === "removed" && !fs.existsSync(patch.holdFile(old)));

// the merge (merge.js)
const merge = require("./merge");
const P = "Paragraph 01 talks about slot01 and anchor01, and then the sentence goes on for a while.";
check("merge: same paragraph, different places: both changes stay",
  merge.merge3(P, P.replace("anchor01", "anchor01 tok1"), P.replace("slot01", "ClaudeEdit01")).text ===
  "Paragraph 01 talks about ClaudeEdit01 and anchor01 tok1, and then the sentence goes on for a while.");
check("merge: right next to each other: both stay",
  merge.merge3("about slot01 and anchor01,", "about slot01 and anchor01 tok7,", "about ClaudeEdit01 and anchor01,").text ===
  "about ClaudeEdit01 and anchor01 tok7,");
check("merge: other paragraphs: both stay", merge.merge3("a\n\nb\n\nc", "a typed\n\nb\n\nc", "a\n\nb\n\nc changed").text === "a typed\n\nb\n\nc changed");
check("merge: a paragraph taken out by the chat, typing elsewhere", merge.merge3("a\n\nb\n\nc", "a\n\nb\n\nc typed", "a\n\nc").text === "a\n\nc typed");
check("merge: both put text in at the same place: both stay", merge.merge3("ab", "aXb", "aYb").text === "aXYb");
check("merge: both put in the same words, one side a few more: no word twice",
  merge.merge3("anchor05, then", "anchor05 tok1 tok2 tok3, then", "anchor05 tok1 tok2, then").text === "anchor05 tok1 tok2 tok3, then" &&
  merge.merge3("anchor05, then", "anchor05 tok1, then", "anchor05 tok1 tok2, then").text === "anchor05 tok1 tok2, then");
check("merge: the same typed words placed differently by the diff (repeating letters): once",
  merge.merge3("anchor55 tok021 tok022,", "anchor55 tok146 tok147 tok148 tok021 tok022,", "anchor55 tok146 tok147 tok14 tok021 tok022,").text ===
  "anchor55 tok146 tok147 tok148 tok021 tok022," &&
  merge.merge3("anchor73 tok054,", "anchor73 tok054 tok055 tok056,", "anchor73 tok054 tok055,").text === "anchor73 tok054 tok055 tok056,");
check("merge: 2000 random typing bursts written at two moments: never a word twice", (() => {
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let r = 0; r < 2000; r++) {
    const old = [];
    for (let k = 0; k < rnd(4); k++) { old.push("tok" + (100 + rnd(900))); }
    const base = "Paragraph talks about slot and anchor" + (old.length ? " " + old.join(" ") : "") + ", and then more.";
    const at = base.indexOf("anchor") + 6;
    const burst = [];
    for (let k = 0; k < 1 + rnd(5); k++) { burst.push("tok" + (1000 + r * 10 + k)); }
    const full = " " + burst.join(" ");
    const part = full.slice(0, 1 + rnd(full.length));      // what the file got at an earlier write
    const ours = base.slice(0, at) + full + base.slice(at);
    const theirs = (base.slice(0, at) + part + base.slice(at)).replace("slot", "ClaudeEdit");
    const out = merge.merge3(base, ours, theirs).text;
    if (!out.includes("ClaudeEdit") || !burst.every((t) => out.split(t).length === 2)) { console.log("dup:", JSON.stringify({ base, ours, theirs, out })); return false; }
  }
  return true;
})());
check("merge: both put in the same new paragraph, one longer: once", merge.merge3("a\nc", "a\nb1\nb2\nc", "a\nb1\nc").text === "a\nb1\nb2\nc");
check("merge: different new paragraphs at the same place: both", merge.merge3("a\nc", "a\nX\nc", "a\nY\nc").text === "a\nX\nY\nc");
check("merge: both changed the same letters: the page's text wins, counted as a conflict",
  JSON.stringify(merge.merge3("a b c", "a X c", "a Y c")) === JSON.stringify({ text: "a X c", conflicts: 1 }));
check("merge: nothing typed: the file's text", merge.merge3("abc", "abc", "abXc").text === "abXc");
check("merge: nothing changed outside: the page's text", merge.merge3("abc", "abYc", "abc").text === "abYc");
check("merge: 3000 random cases keep every typed word and the chat's change", (() => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const words = ["the", "scheme", "loan", "class", "five", "young", "adults", "moved", "to", "rural", "SSB"];
  for (let r = 0; r < 3000; r++) {
    const lines = [];
    for (let i = 0; i < 3 + rnd(12); i++) {
      const w = [];
      for (let j = 0; j < 5 + rnd(30); j++) { w.push(words[rnd(words.length)]); }
      lines.push(w.join(" ") + ".", "");
    }
    let base = lines.join("\n");
    const at = base.indexOf(" ", rnd(base.length));
    if (at < 0) { continue; }
    base = base.slice(0, at) + " MARK" + r + base.slice(at);
    let ours = base;
    const typed = [];
    for (let k = 0; k < 1 + rnd(3); k++) {
      const p = ours.indexOf(" ", rnd(ours.length));
      if (p < 0 || ours.slice(Math.max(0, p - 12), p + 12).includes("MARK")) { continue; }
      typed.push("TOK" + r + "x" + k);
      ours = ours.slice(0, p) + " TOK" + r + "x" + k + ours.slice(p);
    }
    const out = merge.merge3(base, ours, base.replace("MARK" + r, "CLAUDE" + r)).text;
    if (!out.includes("CLAUDE" + r) || out.includes("MARK" + r) || !typed.every((t) => out.split(t).length === 2)) { return false; }
  }
  return true;
})());
check("merge: 600 paragraphs in well under a second", (() => {
  const big = Array.from({ length: 600 }, (v, i) => "Paragraph " + i + " with some words in it.").join("\n");
  const started = Date.now();
  const out = merge.merge3(big, big.replace("Paragraph 3 ", "Paragraph 3 typed "), big.replace("Paragraph 590 ", "Paragraph 590 changed ")).text;
  return out.includes("Paragraph 3 typed ") && out.includes("Paragraph 590 changed ") && Date.now() - started < 500;
})());

// typing marks (typing.js)
const typing = require("./typing");
const marks = path.join(temp, "word-page", "typing");
const draft = "C:\\Users\\Someone\\Paper\\draft.qmd";
typing.note(marks, draft, 1000000);
const draftMark = typing.markFile(marks, draft);
check("a typing mark is written, its folder made", JSON.parse(fs.readFileSync(draftMark, "utf8")).time === 1000000);
check("the file name is in lower case with backslashes, as Python's normcase writes it",
  typing.keyOf("C:/Users/Someone/Paper/draft.qmd") === "c:\\users\\someone\\paper\\draft.qmd");
check("the mark file is named after the SHA-1 of that name (as review.py looks for it)",
  path.basename(draftMark) === require("crypto").createHash("sha1").update("c:\\users\\someone\\paper\\draft.qmd").digest("hex") + ".json");
typing.note(marks, "C:\\Users\\Someone\\Paper\\notes.md", 1000000 + 1000);
check("each file has its own mark file", fs.readdirSync(marks).length === 2);
typing.note(marks, draft, 1000000 + 2000);
check("a new mark replaces the old one, no temporary file left", fs.readdirSync(marks).length === 2 &&
  JSON.parse(fs.readFileSync(draftMark, "utf8")).time === 1002000);
fs.utimesSync(draftMark, new Date(1000), new Date(1000));
typing.clean(marks, Date.now());
check("a mark file older than 10 minutes is removed, a new one stays", !fs.existsSync(draftMark) && fs.readdirSync(marks).length === 1);

fs.rmSync(temp, { recursive: true, force: true });
console.log(passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
