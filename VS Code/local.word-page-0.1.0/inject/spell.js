// Spelling suggestions for the page (16 Nov 2026, asked: "make sure the spelling fixes are of
// the highest quality, Grammarly type quality").
//
// Quarto's own suggestions (Typo.js) only count in how many ways a word can be reached, and
// know nothing about which words are common: "dont" got "cont" and "dent", "teh" never got
// "the", "thier" had "their" third. This file keeps Quarto's dictionary (it still decides
// which words get a red line) and only picks and orders the suggestions:
//
// 1. Candidates: every dictionary word one or two small changes away (a letter left out, one
//    too many, two letters swapped, a wrong letter, an apostrophe or a hyphen), the
//    dictionary's own list of common confusions (REP, e.g. "alot" -> "a lot"), and two words
//    run together ("infact" -> "in fact").
// 2. Score = how common the word is in English minus how unlikely the mistake is. Cheap
//    mistakes: a missing apostrophe, a doubled or undoubled letter, two letters swapped, a
//    vowel for a vowel, a key next to the right one. How common: the place of the word in
//    a list of the 50,000 most used English words (FrequencyWords by Hermit Dave, MIT
//    licence, from OpenSubtitles 2018: github.com/hermitdave/FrequencyWords).
//
// The page gets this file inside the script block (patch.js); test.js runs it in node.
var wordPageSpell = (function () {
  var FREQUENCY = "/*FREQ*/";     // the 50,000 words, most used first, separated by spaces
  var rankOf = null;              // word -> place in that list (1 = most used)
  var known = null;               // every dictionary word in lower case -> its own spelling
  var knownFor = null;            // the dictionary those belong to

  var LETTERS = "abcdefghijklmnopqrstuvwxyz'-";
  var VOWELS = "aeiouy";
  var KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  var CONTRACTION = /'(t|re|ll|ve|d|m)$/;   // don't, you're, we'll, I've, we'd, I'm
  var POSSESSIVE = /'s$/;

  // costs of one mistake (in the same units as the frequency score)
  var COST = { apostrophe: 0.3, double: 1.0, swap: 1.2, vowel: 1.4, key: 1.6, other: 3.0, split: 4.5, rep: 1.0 };
  var NAME = 1.5;     // a name offered for a word typed in small letters ("sampel" -> not "Samuel")
  var SOUND = 1.5;    // the candidate sounds like the typed word ("wich" -> "which")
  // The weights were set on Wikipedia's list of common misspellings (3,923 pairs whose right
  // word is in the en_GB dictionary), tried on one half and checked on the other: the right
  // word first 89.6 and 90.1 percent, among the five 97.7 and 97.8 (Quarto's own: 78.4, 92.4).
  // All pairs with the final weights: 90.1 first, 97.8 among the five, about 0.15 s a word.
  var LONG_WORD = 16;    // longer words get only the one-change round (keeps it fast)

  function ranks() {
    if (!rankOf) {
      rankOf = new Map();
      var words = FREQUENCY.split(" ");
      for (var i = 0; i < words.length; i++) {
        if (words[i] && !rankOf.has(words[i])) { rankOf.set(words[i], i + 1); }
      }
    }
    return rankOf;
  }

  // how common a word is: about 6 for the most used words, 0.7 at place 50,000
  function frequency(word) {
    var lower = word.toLowerCase();
    var rank = ranks().get(lower);
    if (rank) { return 0.5 * Math.log(200000 / rank); }
    if (CONTRACTION.test(lower)) { return 4.5; }   // the list splits "don't" into "don" + "'t"
    if (POSSESSIVE.test(lower)) { return frequency(lower.slice(0, -2)) - 1.5; }   // "council's"
    return 0.5;                                  // in the dictionary, but not a common word
  }

  // How a word sounds, roughly (a simple form of the "sounds like" step of spell checkers):
  // "which" and "wich" both give "wx", "tomorrow" and "tommorow" both give "tmr".
  function sound(word) {
    var w = word.toLowerCase().replace(/[^a-z]/g, "")
      .replace(/^kn|^gn|^wr/, function (s) { return s[1]; })
      .replace(/wh/g, "w").replace(/ph/g, "f").replace(/(c|s)h/g, "x").replace(/th/g, "0")
      .replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c|q/g, "k")
      .replace(/dg(?=e)/g, "j").replace(/g(?=[eiy])/g, "j").replace(/gh/g, "").replace(/z/g, "s");
    var key = w[0] || "";
    for (var i = 1; i < w.length; i++) {
      var c = w[i];
      if (VOWELS.indexOf(c) >= 0 || c === "h" || c === "w") { continue; }
      if (c !== key[key.length - 1]) { key += c; }
    }
    return key;
  }

  function dictionary(typo) {
    if (knownFor !== typo) {
      known = new Map();
      typo.dictionaryTable.forEach(function (rules, word) {
        var lower = word.toLowerCase();
        // keep the lower-case spelling when the dictionary has both ("polish", "Polish")
        if (!known.has(lower) || word === lower) { known.set(lower, word); }
      });
      knownFor = typo;
    }
    return known;
  }

  function nextToEachOther(a, b) {
    for (var r = 0; r < KEYS.length; r++) {
      var i = KEYS[r].indexOf(a);
      if (i >= 0) {
        if (KEYS[r][i - 1] === b || KEYS[r][i + 1] === b) { return true; }
        var up = KEYS[r - 1], down = KEYS[r + 1];
        if (up && (up[i] === b || up[i + 1] === b)) { return true; }
        if (down && (down[i] === b || down[i - 1] === b)) { return true; }
      }
    }
    return false;
  }

  function replaceCost(old, now) {
    if (old === "'" || now === "'") { return COST.apostrophe; }
    if (VOWELS.indexOf(old) >= 0 && VOWELS.indexOf(now) >= 0) { return COST.vowel; }
    if (nextToEachOther(old, now)) { return COST.key; }
    return COST.other;
  }

  // every word one change away, with the cost of that change: Map word -> cost
  function oneChange(word) {
    var out = new Map();
    function add(candidate, cost) {
      if (candidate && (!out.has(candidate) || out.get(candidate) > cost)) { out.set(candidate, cost); }
    }
    for (var i = 0; i <= word.length; i++) {
      var left = word.slice(0, i), right = word.slice(i);
      var before = left[left.length - 1] || "", after = right[0] || "";
      var nearVowel = VOWELS.indexOf(before) >= 0 || VOWELS.indexOf(right[1] || "") >= 0;
      if (right) {
        // a letter too many (cheap when it doubles the one before or after it, or is a vowel
        // in a row of vowels: "colleage")
        var doubled = right[0] === right[1] || right[0] === before;
        var extra = right[0] === "'" ? COST.apostrophe : doubled ? COST.double :
          (VOWELS.indexOf(right[0]) >= 0 && nearVowel) ? COST.vowel : COST.other;
        add(left + right.slice(1), extra);
      }
      if (right.length > 1 && right[0] !== right[1]) {
        add(left + right[1] + right[0] + right.slice(2), COST.swap);   // two letters swapped
      }
      for (var k = 0; k < LETTERS.length; k++) {
        var c = LETTERS[k];
        if (right && c !== right[0]) {
          add(left + c + right.slice(1), c === "'" ? COST.other : replaceCost(right[0], c));   // a wrong letter
        }
        // a letter left out (cheap when it is the second of a double letter); a left-out
        // apostrophe is cheap only in a contraction: "dont" -> "don't", not "final" -> "final's"
        var cost = (c === after || c === before) ? COST.double : COST.other;
        // a vowel left out next to a vowel: "liason" -> "liaison"
        if (cost === COST.other && VOWELS.indexOf(c) >= 0 && (VOWELS.indexOf(before) >= 0 || VOWELS.indexOf(after) >= 0)) { cost = COST.vowel; }
        if (c === "'") { cost = CONTRACTION.test("'" + right) ? COST.apostrophe : COST.other; }
        add(left + c + right, cost);
      }
    }
    return out;
  }

  // the dictionary's own list of common confusions (REP lines of the .aff file)
  function confusions(word, typo) {
    var out = [];
    var table = typo.replacementTable || [];
    for (var i = 0; i < table.length; i++) {
      var from = table[i][0], to = table[i][1].replace(/_/g, " ");
      var at = word.indexOf(from);
      while (at >= 0) {
        out.push(word.slice(0, at) + to + word.slice(at + from.length));
        at = word.indexOf(from, at + 1);
      }
    }
    return out;
  }

  // Suggestions for one word, best first (at most `limit`).
  function suggest(word, typo, limit) {
    limit = limit || 5;
    var words = dictionary(typo);
    var lower = word.toLowerCase();
    var best = new Map();   // dictionary spelling -> score
    var typedSound = sound(lower);
    var typedSmall = word === lower;

    function offer(candidate, cost) {
      var parts = candidate.split(" ");
      var spelled = [];
      var score = Infinity;
      for (var p = 0; p < parts.length; p++) {
        var own = words.get(parts[p]);
        if (!own || typo.hasFlag(own, "NOSUGGEST")) { return; }
        if (parts[p].length === 1 && parts[p] !== "a" && parts[p] !== "i") { return; }   // no loose letters
        spelled.push(own);
        score = Math.min(score, frequency(own));   // two words: as common as the rarer one
        if (typedSmall && own !== own.toLowerCase()) { score -= NAME; }
      }
      score -= cost;
      if (parts.length === 1 && sound(candidate) === typedSound) { score += SOUND; }
      var text = spelled.join(" ");
      if (text.toLowerCase() === lower) { return; }
      if (!best.has(text) || best.get(text) < score) { best.set(text, score); }
    }

    var first = oneChange(lower);
    first.forEach(function (cost, candidate) { offer(candidate, cost); });
    confusions(lower, typo).forEach(function (candidate) { offer(candidate, COST.rep); });
    for (var i = 1; i < lower.length; i++) { offer(lower.slice(0, i) + " " + lower.slice(i), COST.split); }

    if (lower.length <= LONG_WORD) {
      first.forEach(function (cost, middle) {
        oneChange(middle).forEach(function (cost2, candidate) {
          if (words.has(candidate)) { offer(candidate, cost + cost2); }
        });
      });
    }

    var ordered = Array.from(best.keys()).sort(function (a, b) { return best.get(b) - best.get(a); });
    return ordered.slice(0, limit).map(function (text) { return sameCase(word, text); });
  }

  // "Dont" -> "Don't", "DONT" -> "DON'T"; a name stays a name ("norweigan" -> "Norwegian")
  function sameCase(typed, text) {
    if (typed.length > 1 && typed === typed.toUpperCase()) { return text.toUpperCase(); }
    if (typed[0] && typed[0] === typed[0].toUpperCase() && typed[0] !== typed[0].toLowerCase()) {
      return text[0].toUpperCase() + text.slice(1);
    }
    return text;
  }

  return { suggest: suggest };
})();
if (typeof module !== "undefined") { module.exports = wordPageSpell; }
