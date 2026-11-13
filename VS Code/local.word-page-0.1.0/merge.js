// Three-way merge of two texts that both started from the same text (13 Nov 2026).
//
// Used by the page (inject/word-page.template.js; patch.js copies this file into it): when a
// Claude chat changed the file while the user was typing on the page, the page writes
//   merge3(base, ours, theirs)
// base   = the file's text that the page's text stands on,
// ours   = the page's text now (with what he typed),
// theirs = the file's text now (with the chat's change).
// The result has both changes. It works line by line (a paragraph of the paper is one line);
// where both sides changed the same line it works letter by letter inside that line. Only
// where both changed the very same letters does the page's text win ("conflict"); the hook
// after Claude's edit then sees that the old text is back and tells the chat.
//
// No VS Code and no browser in this file: test.js runs it with plain node.
"use strict";

var MAX_STEPS = 2000;   // differences counted at most; beyond that the whole middle is one change

// The changed places between sequence a and sequence b (arrays of lines, or strings):
// [{ aStart, aEnd, bStart, bEnd }]: a[aStart..aEnd) became b[bStart..bEnd), in order.
function changes(a, b) {
  var start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) { start++; }
  var endA = a.length;
  var endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return shortestEdit(a, start, endA, b, start, endB);
}

// Myers' method: the fewest single steps (take out one of a, put in one of b) from
// a[aS..aE) to b[bS..bE), grouped into changed places.
function shortestEdit(a, aS, aE, b, bS, bE) {
  var n = aE - aS;
  var m = bE - bS;
  if (n === 0 && m === 0) { return []; }
  var whole = [{ aStart: aS, aEnd: aE, bStart: bS, bEnd: bE }];
  if (n === 0 || m === 0) { return whole; }
  var limit = Math.min(n + m, MAX_STEPS);
  var rows = [];            // rows[d][k + d] = furthest x on diagonal k after d steps
  var found = -1;
  var prev = null;
  for (var d = 0; d <= limit && found < 0; d++) {
    var row = new Array(2 * d + 1);
    for (var k = -d; k <= d; k += 2) {
      var x;
      if (d === 0) {
        x = 0;
      } else if (k === -d || (k !== d && prev[k - 1 + d - 1] < prev[k + 1 + d - 1])) {
        x = prev[k + 1 + d - 1];          // a step down: one of b put in
      } else {
        x = prev[k - 1 + d - 1] + 1;      // a step right: one of a taken out
      }
      var y = x - k;
      while (x < n && y < m && a[aS + x] === b[bS + y]) { x++; y++; }
      row[k + d] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    rows.push(row);
    prev = row;
  }
  if (found < 0) { return whole; }
  // walk back from the end, one step at a time
  var steps = [];
  var cx = n;
  var cy = m;
  for (var dd = found; dd > 0; dd--) {
    var before = rows[dd - 1];
    var kk = cx - cy;
    var fromK = (kk === -dd || (kk !== dd && before[kk - 1 + dd - 1] < before[kk + 1 + dd - 1])) ? kk + 1 : kk - 1;
    var fromX = before[fromK + dd - 1];
    var fromY = fromX - fromK;
    var toX = fromK === kk + 1 ? fromX : fromX + 1;
    steps.push({ x0: fromX, y0: fromY, x1: toX, y1: toX - kk });
    cx = fromX;
    cy = fromY;
  }
  steps.reverse();
  var out = [];
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var last = out[out.length - 1];
    if (last && last.aEnd === aS + s.x0 && last.bEnd === bS + s.y0) {
      last.aEnd = aS + s.x1;
      last.bEnd = bS + s.y1;
    } else {
      out.push({ aStart: aS + s.x0, aEnd: aS + s.x1, bStart: bS + s.y0, bEnd: bS + s.y1 });
    }
  }
  return out;
}

function same(a, b) {
  if (a.length !== b.length) { return false; }
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return false; } }
  return true;
}

// Merge sequences. resolve(base, ours, theirs) gives the pieces for a place both changed.
// Returns { parts: [...], conflicts: n }.
function mergeSequences(base, ours, theirs, resolve) {
  var all = [];
  changes(base, ours).forEach(function (c) { c.side = "ours"; all.push(c); });
  changes(base, theirs).forEach(function (c) { c.side = "theirs"; all.push(c); });
  all.sort(function (p, q) { return p.aStart - q.aStart || p.aEnd - q.aEnd; });
  var parts = [];
  var conflicts = 0;
  var pos = 0;        // in base
  var posO = 0;       // the same place in ours
  var posT = 0;       // the same place in theirs
  var i = 0;
  while (i < all.length) {
    var start = all[i].aStart;
    var end = all[i].aEnd;
    var group = [all[i]];
    var j = i + 1;
    // changes that overlap, or that both put something in at the same place, go together
    while (j < all.length && (all[j].aStart < end ||
           (all[j].aStart === end && all[j].aStart === all[j].aEnd && group.some(function (g) { return g.aStart === g.aEnd && g.aStart === end; })))) {
      end = Math.max(end, all[j].aEnd);
      group.push(all[j]);
      j++;
    }
    // the unchanged stretch before this place: the same in all three
    for (var u = pos; u < start; u++) { parts.push(base[u]); }
    posO += start - pos;
    posT += start - pos;
    var lenO = end - start;
    var lenT = end - start;
    var byO = false;
    var byT = false;
    group.forEach(function (g) {
      var grow = (g.bEnd - g.bStart) - (g.aEnd - g.aStart);
      if (g.side === "ours") { lenO += grow; byO = true; } else { lenT += grow; byT = true; }
    });
    var pieceB = base.slice(start, end);
    var pieceO = ours.slice(posO, posO + lenO);
    var pieceT = theirs.slice(posT, posT + lenT);
    var piece;
    if (!byT || same(pieceO, pieceT)) {
      piece = pieceO;
    } else if (!byO) {
      piece = pieceT;
    } else {
      var resolved = resolve(pieceB, pieceO, pieceT);
      piece = resolved.parts;
      conflicts += resolved.conflicts;
    }
    for (var p = 0; p < piece.length; p++) { parts.push(piece[p]); }
    pos = end;
    posO += lenO;
    posT += lenT;
    i = j;
  }
  for (var r = pos; r < base.length; r++) { parts.push(base[r]); }
  return { parts: parts, conflicts: conflicts };
}

// Where both sides changed the same letters: both put something in at the same place (and
// took nothing out) -> both stay, ours first; else ours wins.
function letterConflict(b, o, t) {
  if (b.length === 0) { return { parts: o.split("").concat(t.split("")), conflicts: 0 }; }
  return { parts: o.split(""), conflicts: 1 };
}

// letter by letter
function mergeLetters(base, ours, theirs) {
  return mergeSequences(base, ours, theirs, letterConflict).parts.join("");
}

// merge3(base, ours, theirs) -> { text, conflicts }
function merge3(base, ours, theirs) {
  if (ours === theirs || theirs === base) { return { text: ours, conflicts: 0 }; }
  if (ours === base) { return { text: theirs, conflicts: 0 }; }
  var merged = mergeSequences(base.split("\n"), ours.split("\n"), theirs.split("\n"), function (b, o, t) {
    // both put new lines in at the same place: both stay, ours first
    if (b.length === 0) { return { parts: o.concat(t), conflicts: 0 }; }
    // the same lines changed on both sides: letter by letter inside them
    var text = mergeSequences(b.join("\n"), o.join("\n"), t.join("\n"), letterConflict);
    return { parts: text.parts.join("").split("\n"), conflicts: text.conflicts };
  });
  return { text: merged.parts.join("\n"), conflicts: merged.conflicts };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { merge3: merge3, changes: changes, mergeLetters: mergeLetters };
}
