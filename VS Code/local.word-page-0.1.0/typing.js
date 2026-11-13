// Typing marks for the Claude hooks (13 Nov 2026).
//
// A Claude chat writes its edits straight into the file on disk. When that happens while
// the user is typing on the page, the page cannot take the edit without losing what he typed:
// it keeps its own text and writes it back over the file (the red bar on the page). So the
// hook that runs before every Claude edit (review.py in ~/.claude/review) waits until he has
// stopped typing in that file, and the hook after the edit checks that the page kept it.
//
// To know when he last typed, extension.js calls note() each time the text of a .qmd or .md
// document changes in VS Code (Quarto writes what is typed on the page into the document every
// 2 seconds). This file keeps, per file, the time of the last change, in milliseconds:
//   %LOCALAPPDATA%\word-page\typing.json   { "c:\\users\\...\\draft.qmd": 1794653372123, ... }
// The file names are written in lower case with backslashes, as Python's os.path.normcase
// writes them, so review.py finds them.
"use strict";
const fs = require("fs");
const path = require("path");

const KEEP_MS = 10 * 60 * 1000;    // marks older than 10 minutes are dropped

function keyOf(file) {
  return path.normalize(file).toLowerCase();
}

// Note that `file` changed at time `now`. Returns the marks as they are written.
function note(markFile, file, now) {
  let marks = {};
  try {
    marks = JSON.parse(fs.readFileSync(markFile, "utf8")) || {};
  } catch (err) { /* no marks yet, or a half-written file: start again */ }
  for (const key of Object.keys(marks)) {
    if (typeof marks[key] !== "number" || now - marks[key] > KEEP_MS) { delete marks[key]; }
  }
  marks[keyOf(file)] = now;
  // write a new file and put it in place in one step: the hook never reads half a file
  fs.mkdirSync(path.dirname(markFile), { recursive: true });
  const temp = markFile + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(marks));
  fs.renameSync(temp, markFile);
  return marks;
}

module.exports = { note, keyOf, KEEP_MS };
