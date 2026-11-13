// Word Page: put (or take out) the white-page block in Quarto's visual editor files.
//
// Quarto's visual editor is a web page inside VS Code. It reads its colours from
// the VS Code theme, so under a dark theme it is dark. Two blocks make it a white
// page under any theme:
//   - a script at the top of  assets/www/editor/index.js  (light colours)
//   - styles at the end of    assets/www/editor/style.css  (the page look)
// Each block sits between "word-page:start" and "word-page:end" marks, so it can
// be found again, replaced or removed. One file is added: word-page-pdf.css, where
// the pages of a PDF start (see below).
//
// Since 13 Nov 2026 three small hooks also go INTO Quarto's code in index.js (addSyncHooks),
// so that the script block decides how the page and the file stay in step when a Claude chat
// changes the file while the user types (see "keeping the page and the file in step" in
// inject/word-page.template.js). Each hook is only added text between /*wp+*/ and /*wp-*/,
// so strip() gives the file back byte for byte. When Quarto's code has changed and a hook
// does not fit exactly once, no hook goes in, and the page works as Quarto made it.
//
// No VS Code API in this file: test.js runs it with plain node.
"use strict";
const fs = require("fs");
const path = require("path");

const START = "/* word-page:start";
const END = "/* word-page:end */";

// the folder of the newest Quarto add-on in an extensions folder ("" when there is none)
function findQuarto(extensionsDir) {
  let names;
  try {
    names = fs.readdirSync(extensionsDir);
  } catch (err) {
    return "";
  }
  const quarto = names.filter((name) => /^quarto\.quarto-\d/.test(name));
  quarto.sort((a, b) => compareVersions(versionOf(a), versionOf(b)));
  return quarto.length ? path.join(extensionsDir, quarto[quarto.length - 1]) : "";
}

function versionOf(folderName) {
  return folderName.replace(/^quarto\.quarto-/, "").split(/[.-]/).map((part) => parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) { return diff; }
  }
  return 0;
}

function editorFiles(quartoDir) {
  const dir = path.join(quartoDir, "assets", "www", "editor");
  return { js: path.join(dir, "index.js"), css: path.join(dir, "style.css") };
}

// The style rules of the PDF look, with each font file written into the rules as a
// "data:" address. That way the page needs no font installed in Windows, and no extra
// file in Quarto's folder.
function pdfLookCss(injectDir) {
  const css = fs.readFileSync(path.join(injectDir, "pdf-look.css"), "utf8").replace(/\r\n/g, "\n").trim();
  return css.replace(/url\("fonts\/([a-z0-9-]+\.otf)"\)/g, (whole, name) => {
    const font = fs.readFileSync(path.join(injectDir, "fonts", name));
    return 'url("data:font/otf;base64,' + font.toString("base64") + '")';
  });
}

// the two blocks, built from the files in inject/ and the options
// (options.look: "pdf" = the page as a paper's PDF, anything else = the Word look;
// sync: the hooks are in Quarto's code, so the script block keeps page and file in step)
function buildBlocks(injectDir, options, sync) {
  const look = options.look === "pdf" ? "pdf" : "word";
  const theme = JSON.parse(fs.readFileSync(path.join(injectDir, "light-theme.json"), "utf8"));
  const template = fs.readFileSync(path.join(injectDir, "word-page.template.js"), "utf8");
  const merge = fs.readFileSync(path.join(injectDir, "..", "merge.js"), "utf8");
  const js = template
    .replace("/*LIGHT*/", () => JSON.stringify(theme.colours))
    .replace("/*DROP*/", () => JSON.stringify(theme.drop))
    .replace("/*OPTIONS*/", () => JSON.stringify({
      pageWidth: options.pageWidth, look: look, fold: options.fold !== false, pageEnds: options.pageEnds !== false,
      fromPdf: options.fromPdf !== false
    }))
    .replace("/*SYNC*/", () => (sync ? "true" : "false"))
    .replace("/*MERGE*/", () => merge)
    .replace(/\r\n/g, "\n").trim() + "\n";
  let css = fs.readFileSync(path.join(injectDir, "word-page.css"), "utf8").replace(/\r\n/g, "\n").trim() + "\n";
  if (look === "pdf") {
    // the PDF rules go inside the block, just before its end mark
    const end = css.lastIndexOf(END);
    css = css.slice(0, end) + pdfLookCss(injectDir) + "\n" + css.slice(end);
  }
  for (const block of [js, css]) {
    if (!block.startsWith(START) || !block.trimEnd().endsWith(END)) {
      throw new Error("an inject file does not start and end with the word-page marks");
    }
  }
  return { js, css };
}

// ---- the hooks in Quarto's code (13 Nov 2026) ----
// In Quarto 1.139 the page's handlers read (variable names differ per version):
//   async applyExternalEdit(t){!e.hasFocus()&&!window.document.hasFocus()&&c(t)},
//   async getMarkdownFromState(t){return await e.getMarkdownFromStateJson(t,o())}
// and its init ends with  ...,i.canonical):null}catch
// e = the editor, o = its writing options, c = Quarto's own (1 s delayed) way to take a change.
const ADDED = /\/\*wp\+\*\/[\s\S]*?\/\*wp-\*\//g;
const HANDLERS = /async applyExternalEdit\(([\w$]+)\)\{!([\w$]+)\.hasFocus\(\)&&!window\.document\.hasFocus\(\)&&([\w$]+)\(\1\)\},async getMarkdownFromState\(([\w$]+)\)\{return await \2\.getMarkdownFromStateJson\(\4,([\w$]+)\(\)\)\}/g;
const STARTED = /([\w$]+)\.canonical\):null\}catch/g;

function countOf(text, pattern) {
  return (text.match(pattern) || []).length;
}

// Quarto's code with the hooks in: { js, ok }. ok = false: Quarto's code is not as expected,
// and the code comes back unchanged.
function addSyncHooks(js) {
  if (countOf(js, HANDLERS) !== 1 || countOf(js, STARTED) !== 1) { return { js: js, ok: false }; }
  const out = js
    .replace(HANDLERS, (whole, t, e, c, s, o) =>
      "async applyExternalEdit(" + t + "){/*wp+*/if(window.wordPageSync)return window.wordPageSync.external(" + t + "," + e + "," + o + "," + c + ");/*wp-*/" +
      "!" + e + ".hasFocus()&&!window.document.hasFocus()&&" + c + "(" + t + ")}," +
      "async getMarkdownFromState(" + s + "){/*wp+*/if(window.wordPageSync)return window.wordPageSync.markdown(" + s + "," + e + "," + o + ");/*wp-*/" +
      "return await " + e + ".getMarkdownFromStateJson(" + s + "," + o + "())}")
    .replace(STARTED, (whole, i) =>
      "/*wp+*/window.wordPageSync&&window.wordPageSync.started(" + i + ".canonical),/*wp-*/" + i + ".canonical):null}catch");
  return { js: out, ok: true };
}

// The text without any word-page block or hook. A block is taken out together with the
// line break before it and the one after it: exactly what apply() adds, so a
// file comes back byte for byte as it was.
function strip(text) {
  let out = text.replace(ADDED, "");
  for (;;) {
    let start = out.indexOf(START);
    if (start < 0) { return out; }
    const end = out.indexOf(END, start);
    if (end < 0) { throw new Error("word-page:start without word-page:end"); }
    let after = end + END.length;
    if (out[after] === "\r") { after++; }
    if (out[after] === "\n") { after++; }
    if (start > 0 && out[start - 1] === "\n") { start--; }
    out = out.slice(0, start) + out.slice(after);
  }
}

function writeFileSafely(file, text) {
  // write next to the file, then swap: Quarto never reads half a file
  const temp = file + ".word-page-tmp";
  fs.writeFileSync(temp, text, "utf8");
  fs.renameSync(temp, file);
}

// What index.js and style.css should hold: the blocks, and the hooks when they fit.
function wanted(quartoDir, injectDir, options) {
  const files = editorFiles(quartoDir);
  const jsNow = fs.readFileSync(files.js, "utf8");
  const cssNow = fs.readFileSync(files.css, "utf8");
  const synced = addSyncHooks(strip(jsNow));
  const blocks = buildBlocks(injectDir, options, synced.ok);
  return {
    files, jsNow, cssNow, sync: synced.ok,
    js: blocks.js + synced.js, css: strip(cssNow) + "\n" + blocks.css
  };
}

// Put the blocks (and hooks) in. Returns "applied" or "already".
function apply(quartoDir, injectDir, options) {
  const want = wanted(quartoDir, injectDir, options);
  if (want.jsNow === want.js && want.cssNow === want.css) { return "already"; }
  writeFileSafely(want.files.js, want.js);
  writeFileSafely(want.files.css, want.css);
  return "applied";
}

// Are the hooks in Quarto's code? (for the log and the checks)
function synced(quartoDir) {
  return fs.readFileSync(editorFiles(quartoDir).js, "utf8").includes("/*wp+*/if(window.wordPageSync)");
}

// ---- the page ends of the PDF ----
// The add-on writes where each page of the PDF starts into this file next to Quarto's
// index.js; the page reads it as a style sheet (Quarto's page may load style sheets from
// its own folder, but no other files). The data is JSON, as base64 in a CSS variable.
const PDF_DATA = "word-page-pdf.css";
// the pictures of tables, figures and the reference list, cut out of the PDF (pdfpages.py)
const PICTURE_DIR = "word-page-pdf";

function pdfDataFile(quartoDir) {
  return path.join(quartoDir, "assets", "www", "editor", PDF_DATA);
}

function pdfPictureDir(quartoDir) {
  return path.join(quartoDir, "assets", "www", "editor", PICTURE_DIR);
}

// docs: [{ name: "draft.pdf", built: "15:30", pages: [{ n, sideways, lines }] }]
function pdfDataCss(docs) {
  const base64 = Buffer.from(JSON.stringify({ docs: docs }), "utf8").toString("base64");
  return "/* word-page: where the pages of the PDF start (extension.js, pdfpages.py) */\n" +
    ':root { --wp-pdf-pages: "' + base64 + '"; }\n';
}

// the docs back from such a file (for the checks in test.js)
function readPdfDataCss(css) {
  const found = /--wp-pdf-pages:\s*"([A-Za-z0-9+/=]*)"/.exec(css);
  return found ? JSON.parse(Buffer.from(found[1], "base64").toString("utf8")).docs : null;
}

function writePdfData(quartoDir, docs) {
  writeFileSafely(pdfDataFile(quartoDir), pdfDataCss(docs));
}

// Take the blocks out. Returns "removed" or "clean".
function remove(quartoDir) {
  const files = editorFiles(quartoDir);
  let changed = false;
  if (fs.existsSync(pdfDataFile(quartoDir))) {
    fs.unlinkSync(pdfDataFile(quartoDir));
    changed = true;
  }
  if (fs.existsSync(pdfPictureDir(quartoDir))) {
    fs.rmSync(pdfPictureDir(quartoDir), { recursive: true, force: true });
    changed = true;
  }
  if (fs.existsSync(holdFile(quartoDir))) {
    fs.unlinkSync(holdFile(quartoDir));
    changed = true;
  }
  for (const file of [files.js, files.css]) {
    const text = fs.readFileSync(file, "utf8");
    const stripped = strip(text);
    if (stripped !== text) {
      writeFileSafely(file, stripped);
      changed = true;
    }
  }
  return changed ? "removed" : "clean";
}

// "applied" (our blocks are in), "other" (older blocks are in) or "none"
function state(quartoDir, injectDir, options) {
  const want = wanted(quartoDir, injectDir, options);
  if (want.jsNow === want.js && want.cssNow === want.css) { return "applied"; }
  return want.jsNow.startsWith(START) ? "other" : "none";
}

// ---- a Claude chat is about to write a file (13 Nov 2026) ----
// review.py writes this file next to Quarto's index.js just before a Claude edit of a .qmd,
// and empties it right after. The page reads it (as a style sheet, the only kind of file it
// may load) before it hands its text to Quarto: while it holds a time in the future, the page
// hands nothing over, so the page and the chat never write the file at the same moment.
const HOLD_FILE = "word-page-hold.css";

function holdFile(quartoDir) {
  return path.join(quartoDir, "assets", "www", "editor", HOLD_FILE);
}

module.exports = {
  findQuarto, editorFiles, buildBlocks, strip, apply, remove, state, addSyncHooks, synced, START, END,
  pdfDataFile, pdfDataCss, readPdfDataCss, writePdfData, pdfPictureDir, PICTURE_DIR, holdFile, HOLD_FILE
};
