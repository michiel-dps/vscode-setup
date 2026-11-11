// Offline checks for patch.js and mention.js (no VS Code needed). Run with VS Code's own node:
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
check("script block has no placeholder left", !/\/\*(LIGHT|DROP|OPTIONS)\*\//.test(blocks.js));
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
check("PDF look: all six fonts are written into the rules",
  (pdfBlocks.css.match(/url\("data:font\/otf;base64,[A-Za-z0-9+\/=]+"\)/g) || []).length === 6 && !pdfBlocks.css.includes('url("fonts/'));
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

fs.rmSync(temp, { recursive: true, force: true });
console.log(passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
