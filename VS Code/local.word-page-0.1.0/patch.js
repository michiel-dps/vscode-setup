// Word Page: put (or take out) the white-page block in Quarto's visual editor files.
//
// Quarto's visual editor is a web page inside VS Code. It reads its colours from
// the VS Code theme, so under a dark theme it is dark. Two blocks make it a white
// page under any theme:
//   - a script at the top of  assets/www/editor/index.js  (light colours)
//   - styles at the end of    assets/www/editor/style.css  (the page look)
// Each block sits between "word-page:start" and "word-page:end" marks, so it can
// be found again, replaced or removed. Nothing else in Quarto's files is changed;
// one file is added: word-page-pdf.css, where the pages of a PDF start (see below).
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
// (options.look: "pdf" = the page as a paper's PDF, anything else = the Word look)
function buildBlocks(injectDir, options) {
  const look = options.look === "pdf" ? "pdf" : "word";
  const theme = JSON.parse(fs.readFileSync(path.join(injectDir, "light-theme.json"), "utf8"));
  const template = fs.readFileSync(path.join(injectDir, "word-page.template.js"), "utf8");
  const js = template
    .replace("/*LIGHT*/", JSON.stringify(theme.colours))
    .replace("/*DROP*/", JSON.stringify(theme.drop))
    .replace("/*OPTIONS*/", JSON.stringify({
      pageWidth: options.pageWidth, look: look, fold: options.fold !== false, pageEnds: options.pageEnds !== false,
      fromPdf: options.fromPdf !== false
    }))
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

// The text without any word-page block. A block is taken out together with the
// line break before it and the one after it: exactly what apply() adds, so a
// file comes back byte for byte as it was.
function strip(text) {
  let out = text;
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

// is the wanted block in place? (reads only the start of index.js: it is 10 MB)
function isApplied(quartoDir, blocks) {
  const files = editorFiles(quartoDir);
  try {
    const wanted = Buffer.from(blocks.js, "utf8");
    const head = Buffer.alloc(wanted.length);
    const fd = fs.openSync(files.js, "r");
    fs.readSync(fd, head, 0, wanted.length, 0);
    fs.closeSync(fd);
    if (!head.equals(wanted)) { return false; }
    return fs.readFileSync(files.css, "utf8").endsWith("\n" + blocks.css);
  } catch (err) {
    return false;
  }
}

// Put the blocks in. Returns "applied" or "already".
function apply(quartoDir, injectDir, options) {
  const blocks = buildBlocks(injectDir, options);
  if (isApplied(quartoDir, blocks)) { return "already"; }
  const files = editorFiles(quartoDir);
  const js = strip(fs.readFileSync(files.js, "utf8"));
  const css = strip(fs.readFileSync(files.css, "utf8"));
  writeFileSafely(files.js, blocks.js + js);
  writeFileSafely(files.css, css + "\n" + blocks.css);
  return "applied";
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
  if (isApplied(quartoDir, buildBlocks(injectDir, options))) { return "applied"; }
  const files = editorFiles(quartoDir);
  const fd = fs.openSync(files.js, "r");
  const head = Buffer.alloc(START.length);
  fs.readSync(fd, head, 0, START.length, 0);
  fs.closeSync(fd);
  return head.toString("utf8") === START ? "other" : "none";
}

module.exports = {
  findQuarto, editorFiles, buildBlocks, strip, apply, remove, state, START, END,
  pdfDataFile, pdfDataCss, readPdfDataCss, writePdfData, pdfPictureDir, PICTURE_DIR
};
