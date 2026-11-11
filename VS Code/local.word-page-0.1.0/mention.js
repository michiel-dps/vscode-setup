// Word Page: the reference that goes into the Claude message for a piece of text
// highlighted on the page, for example
//   @paper/draft.qmd#23-25 "Norway forgives part of ... in rural municipalities."
//
// The page shows the text without its markdown marks (**bold**, [link](url), ...),
// so the highlighted text is looked up in the .qmd file by its letters and digits
// only. The words just before and after it tell two equal pieces apart.
//
// No VS Code API in this file: test.js runs it with plain node.
"use strict";

const LETTER = /[\p{L}\p{N}]/u;

// What the copy of the highlighted text gave. The script block on the page
// (inject/word-page.template.js) answers with the text plus the words around it.
// Anything else on the clipboard is not an answer from the page: null.
function readCopied(clipboardText) {
  let data;
  try {
    data = JSON.parse(clipboardText);
  } catch (err) {
    return null;
  }
  if (!data || data.wordPage !== 1 || typeof data.text !== "string") { return null; }
  return { text: data.text, before: String(data.before || ""), after: String(data.after || "") };
}

// only the letters and digits of a text, in lower case
function lettersOf(text) {
  let letters = "";
  for (const ch of text) {
    if (LETTER.test(ch)) { letters += ch.toLowerCase(); }
  }
  return letters;
}

// the letters of the file, and for every letter the line it is on (first line = 1)
function lettersWithLines(source) {
  let letters = "";
  const lines = [];
  let line = 1;
  for (const ch of source) {
    if (ch === "\n") { line++; continue; }
    if (!LETTER.test(ch)) { continue; }
    const low = ch.toLowerCase();
    letters += low;
    for (let i = 0; i < low.length; i++) { lines.push(line); }
  }
  return { letters, lines };
}

// every position where `piece` starts in `letters`
function placesOf(letters, piece) {
  const places = [];
  for (let at = letters.indexOf(piece); at >= 0; at = letters.indexOf(piece, at + 1)) { places.push(at); }
  return places;
}

// how many letters just before position `at` are the same as the end of `before`
function sameBefore(letters, at, before) {
  let same = 0;
  while (same < before.length && same < at && letters[at - 1 - same] === before[before.length - 1 - same]) { same++; }
  return same;
}

// how many letters from position `at` on are the same as the start of `after`
function sameAfter(letters, at, after) {
  let same = 0;
  while (same < after.length && at + same < letters.length && letters[at + same] === after[same]) { same++; }
  return same;
}

// The place whose neighbours fit best. Two places that fit equally well give -1:
// a wrong line number is worse than none.
function bestPlace(places, fit) {
  if (places.length === 1) { return places[0]; }
  let best = -1;
  let bestFit = -1;
  let tie = false;
  for (const place of places) {
    const score = fit(place);
    if (score > bestFit) { best = place; bestFit = score; tie = false; }
    else if (score === bestFit) { tie = true; }
  }
  return tie ? -1 : best;
}

// The lines of the file that hold the highlighted text: { first, last }, or null
// when they cannot be found for sure.
function findLines(source, picked) {
  const file = lettersWithLines(source);
  const want = lettersOf(picked.text);
  const before = lettersOf(picked.before || "");
  const after = lettersOf(picked.after || "");
  if (want.length === 0) { return null; }

  // 1. the highlighted text as one piece
  const whole = placesOf(file.letters, want);
  if (whole.length > 0) {
    const at = bestPlace(whole, (place) =>
      sameBefore(file.letters, place, before) + sameAfter(file.letters, place + want.length, after));
    return at < 0 ? null : { first: file.lines[at], last: file.lines[at + want.length - 1] };
  }

  // 2. A link, a footnote or a formula inside the highlighted text: the file has
  //    letters there that the page does not show. Look up its start and its end.
  //    Find a piece from its start, then walk along the file to its end.
  const anchor = findStart(file.letters, want, before);
  if (!anchor) { return null; }
  const end = walkToEnd(file.letters, anchor.place + anchor.size, want, anchor.from + anchor.size);
  if (end < 0) { return null; }
  return { first: file.lines[anchor.place], last: file.lines[end - 1] };
}

// The first piece of the wanted text that is in the file at one sure place:
// { place: where in the file, from: where in the wanted text, size }. Long pieces
// first (a short piece is also found in wrong places); when the very start cannot
// be found (the text starts at a link or a formula), a piece a few letters further on.
function findStart(letters, want, before) {
  const sizes = [30, 20, 12, 8];
  for (let from = 0; from <= 60; from += 4) {
    for (const size of sizes) {
      if (want.length < from + size) { continue; }
      const place = bestPlace(placesOf(letters, want.slice(from, from + size)),
        (candidate) => (from === 0 ? sameBefore(letters, candidate, before) : 0));
      if (place >= 0) { return { place, from, size }; }
    }
  }
  return null;
}

// Walk along the file from position `at`, letter by letter along the wanted text
// (from its letter `i`). Returns where the wanted text ends in the file, -1 when lost.
//   - the file has letters that the page does not show (a link address): jump to
//     where the next 8 wanted letters are, at most 300 letters further on;
//   - the page has letters that the file does not have (a drawn formula): skip them.
function walkToEnd(letters, at, want, i) {
  let skipped = 0;
  while (i < want.length) {
    if (letters[at] === want[i]) { at++; i++; continue; }
    if (want.length - i < 4) { break; }           // too few letters left to look for: the end is here
    const next = letters.indexOf(want.slice(i, i + 8), at);
    if (next >= 0 && next - at <= 300) { at = next; continue; }
    i++;
    skipped++;
    if (skipped > 60) { return -1; }
  }
  return at;
}

// The highlighted text as a short quote: all of it when short, else its first
// and last four words.
function shortQuote(text) {
  const clean = text.replace(/\s+/g, " ").trim().replace(/"/g, "'");
  if (clean.length <= 60) { return clean; }
  const words = clean.split(" ");
  if (words.length <= 8) { return clean.slice(0, 40) + " ... " + clean.slice(-20); }
  return words.slice(0, 4).join(" ") + " ... " + words.slice(-4).join(" ");
}

// file: path from the workspace folder, with forward slashes. lines: from findLines.
function buildMention(file, lines, text) {
  let mention = "@" + file;
  if (lines) { mention += "#" + lines.first + (lines.last > lines.first ? "-" + lines.last : ""); }
  const quote = shortQuote(text);
  if (quote !== "") { mention += ' "' + quote + '"'; }
  return mention + " ";
}

module.exports = { readCopied, lettersOf, findLines, shortQuote, buildMention };
