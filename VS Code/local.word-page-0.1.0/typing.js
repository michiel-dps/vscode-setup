// Typing marks for the Claude hooks (13 Nov 2026).
//
// A Claude chat writes its edits straight into the file on disk. When that happens while
// the user is typing on the page, the page cannot take the edit without losing what he typed:
// it keeps its own text and writes it back over the file. So the hook that runs before every
// Claude edit (review.py in ~/.claude/review) waits until he has stopped typing in that file,
// and the hook after the edit checks that the page kept it.
//
// To know when he last typed, extension.js calls note() each time the text of a .qmd or .md
// document changes in VS Code (Quarto writes what is typed on the page into the document every
// 2 seconds). Each file has its own small mark file, so two VS Code windows never write over
// each other's marks:
//   %LOCALAPPDATA%\word-page\typing\<sha1 of the file name>.json   { "file": "...", "time": ms }
// The file name is written in lower case with backslashes, as Python's os.path.normcase writes
// it, so review.py finds the same mark file.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEEP_MS = 10 * 60 * 1000;    // mark files older than 10 minutes are removed

function keyOf(file) {
  return path.normalize(file).toLowerCase();
}

function markFile(markDir, file) {
  return path.join(markDir, crypto.createHash("sha1").update(keyOf(file), "utf8").digest("hex") + ".json");
}

// Note that `file` changed at time `now`.
function note(markDir, file, now) {
  fs.mkdirSync(markDir, { recursive: true });
  const target = markFile(markDir, file);
  // write a new file and put it in place in one step: the hook never reads half a file
  const temp = target + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify({ file: keyOf(file), time: now }));
  try {
    fs.renameSync(temp, target);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch (err2) { /* gone already */ }
    throw err;                       // the hook was reading it: the next change writes it
  }
}

// Remove the mark files of files nobody typed in for 10 minutes.
function clean(markDir, now) {
  let names = [];
  try { names = fs.readdirSync(markDir); } catch (err) { return; }
  for (const name of names) {
    const full = path.join(markDir, name);
    try {
      if (now - fs.statSync(full).mtimeMs > KEEP_MS) { fs.unlinkSync(full); }
    } catch (err) { /* in use or gone: next time */ }
  }
}

module.exports = { note, clean, keyOf, markFile, KEEP_MS };
