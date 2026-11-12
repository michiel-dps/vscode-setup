/* word-page:start (local add-on "Word Page": a white page in Quarto's visual editor, whatever the VS Code theme) */
(function () {
  // The colours VS Code gives a webview under its "Light Modern" theme.
  // Fonts and sizes are not in this list: those stay as the user's own settings.
  var LIGHT = /*LIGHT*/;
  // variables that only a dark theme sets
  var DROP = /*DROP*/;
  var OPTIONS = /*OPTIONS*/;
  var busy = false;

  function apply() {
    if (busy) { return; }
    busy = true;
    try {
      var root = document.documentElement;
      var st = root.style;
      for (var name in LIGHT) {
        if (st.getPropertyValue(name) !== LIGHT[name]) { st.setProperty(name, LIGHT[name]); }
      }
      for (var i = 0; i < DROP.length; i++) {
        if (st.getPropertyValue(DROP[i]) !== "") { st.removeProperty(DROP[i]); }
      }
      if (st.getPropertyValue("--word-page-width") !== OPTIONS.pageWidth + "px") {
        st.setProperty("--word-page-width", OPTIONS.pageWidth + "px");
      }
      if (!root.classList.contains("word-page")) { root.classList.add("word-page"); }
      // the PDF look: the style block has rules that only count with this class
      var pdfLook = OPTIONS.look === "pdf";
      if (root.classList.contains("pdf-look") !== pdfLook) { root.classList.toggle("pdf-look", pdfLook); }
      var body = document.body;
      if (body) {
        // Quarto decides "dark mode" from this class
        if (!body.classList.contains("vscode-light") || body.classList.contains("vscode-dark") ||
            body.classList.contains("vscode-high-contrast")) {
          body.classList.remove("vscode-dark", "vscode-high-contrast", "vscode-high-contrast-light");
          body.classList.add("vscode-light");
        }
        if (body.dataset.vscodeThemeKind !== "vscode-light") { body.dataset.vscodeThemeKind = "vscode-light"; }
      }
    } finally {
      busy = false;
    }
  }

  // Quarto also gets a "darkMode" yes/no with its preferences from VS Code (it draws
  // formulas white with it, and picks dark icons). Switch it off as the message
  // comes in: this listener is added first, so it runs before Quarto's own.
  function lightPrefs(prefs) {
    if (prefs && typeof prefs === "object" && typeof prefs.darkMode === "boolean") { prefs.darkMode = false; }
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    lightPrefs(data.result);                                   // answer to "give me the preferences"
    if (Array.isArray(data.params)) { data.params.forEach(lightPrefs); }   // "the preferences changed"
  }, true);

  // ---- highlighted text for Claude ----
  // Ctrl+Numpad5 (keybindings.json) runs the add-on command wordPage.selectionToClaude.
  // That command copies what is highlighted on the page. For that one copy, this block
  // puts the highlighted text on the clipboard together with the words just before and
  // after it, so the add-on can find the lines in the .qmd file. The command then pastes
  // a reference ("@file#lines ...") into the Claude chat box; should that paste ever land
  // on the page instead, it is stopped here. Every other copy and paste works as always.
  var CLAUDE_KEY = "Numpad5";      // the key of Ctrl+Numpad5
  var claudeKeyAt = 0;             // when that key was last pressed on this page
  var claudeCopyDone = true;
  window.addEventListener("keydown", function (event) {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === CLAUDE_KEY) {
      claudeKeyAt = Date.now();
      claudeCopyDone = false;
    }
  }, true);
  // not "capture": this runs after the editor's own copy handler
  document.addEventListener("copy", function (event) {
    if (claudeCopyDone || Date.now() - claudeKeyAt > 3000 || !event.clipboardData) { return; }
    claudeCopyDone = true;
    try {
      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) { return; }
      var range = selection.getRangeAt(0);
      var page = document.querySelector(".ProseMirror") || document.body;
      var before = document.createRange();
      before.selectNodeContents(page);
      before.setEnd(range.startContainer, range.startOffset);
      var after = document.createRange();
      after.selectNodeContents(page);
      after.setStart(range.endContainer, range.endOffset);
      event.clipboardData.setData("text/plain", JSON.stringify({
        wordPage: 1,
        text: selection.toString(),
        before: before.toString().slice(-300),
        after: after.toString().slice(0, 300)
      }));
      event.preventDefault();
    } catch (err) { /* the editor's own copy stays as it is */ }
  }, false);
  window.addEventListener("paste", function (event) {
    if (Date.now() - claudeKeyAt > 10000 || !event.clipboardData) { return; }
    if (event.clipboardData.getData("text/plain").charAt(0) === "@") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // ---- the page as the PDF: title block, folded code, page ends (12 Nov 2026) ----
  // Asked: "want the visual version of the .qmd to be exactly how the eventual pdf will
  // look, just that I am able to edit it". The style rules are at the end of
  // inject/pdf-look.css; here is what style rules cannot do on their own.
  //
  // 1. Folded boxes. The header (YAML), R chunks and raw LaTeX are boxes with code. The
  //    PDF does not show them, so each gets the class wp-folded and a face (.wp-face):
  //    the title block for the header, one grey line for the others. The face is put
  //    INSIDE Quarto's box: Quarto tells the editor to leave everything in its boxes alone
  //    (ignoreMutation), so the face never becomes part of the document. A click on the
  //    face puts the cursor in the code; the box then opens (class wp-open).
  // 2. Page ends. The add-on reads the PDF next to the document each time it changes
  //    (pdfpages.py: the first lines of every page) and writes them into the file
  //    word-page-pdf.css next to this script. The page reads that file every 3 seconds,
  //    finds the first lines of each page in its own text and draws a dashed line with
  //    "page n" there: a picture behind the text, so the document itself is not touched.
  //    The page may only load files as style sheets (Quarto's page header), hence the
  //    .css file with the data in a CSS variable.
  // 3. From the same PDF (setting wordPage.fromPdf): pictures of the tables, figures and
  //    reference list that R and LaTeX make, in the faces of the boxes that make them, and
  //    the citations as the PDF prints them. Both are further down.
  var PDF_LOOK = OPTIONS.look === "pdf";
  var FOLD = PDF_LOOK && OPTIONS.fold !== false;
  var PAGE_ENDS = PDF_LOOK && OPTIONS.pageEnds !== false;
  var FROM_PDF = PDF_LOOK && OPTIONS.fromPdf !== false;
  var thisScript = (document.currentScript && document.currentScript.src) || "";
  var DATA_URL = thisScript.replace(/index\.js(\?.*)?$/, "word-page-pdf.css");

  function pageContent() {
    return document.querySelector(".ProseMirror > .body > .pm-content");
  }

  // the text of the document node behind a box (its view keeps the node), else the lines on screen
  function boxText(box) {
    var desc = box.pmViewDesc;
    if (desc && desc.node && typeof desc.node.textContent === "string") { return desc.node.textContent; }
    return Array.prototype.map.call(box.querySelectorAll(".cm-line"), function (line) { return line.textContent; }).join("\n");
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // as pandoc and LaTeX print text: curly quotes and dashes, *italic*, **bold**
  function printed(text) {
    var html = escapeHtml(text)
      .replace(/---/g, "\u2014").replace(/--/g, "\u2013")
      .replace(/(^|[\s(\[])&quot;/g, "$1\u201c").replace(/&quot;/g, "\u201d")
      .replace(/(^|[\s(\[])'/g, "$1\u2018").replace(/'/g, "\u2019")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
  }

  // ---- the header: a small reader for the keys the title block needs ----
  function unquote(value) {
    var text = value.trim();
    if (/^".*"$/.test(text)) { return text.slice(1, -1).replace(/\\(["\\])/g, "$1"); }
    if (/^'.*'$/.test(text)) { return text.slice(1, -1).replace(/''/g, "'"); }
    return text;
  }

  // top-level keys of a YAML header: { key: { value: "text after the colon", lines: [indented lines under it] } }
  function readHeader(text) {
    var keys = {};
    var current = null;
    text.replace(/\r/g, "").split("\n").forEach(function (line) {
      if (/^(---|\.\.\.)\s*$/.test(line)) { current = null; return; }
      var top = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
      if (top) {
        current = { value: top[2].trim(), lines: [] };
        keys[top[1]] = current;
      } else if (current && (/^\s/.test(line) || line === "")) {
        current.lines.push(line);
      }
    });
    return keys;
  }

  // the text of a key: "text", or a block (| or >) of indented lines
  function scalar(entry) {
    if (!entry) { return ""; }
    if (!/^[|>][-+]?$/.test(entry.value)) { return unquote(entry.value); }
    var lines = entry.lines.slice();
    while (lines.length && lines[lines.length - 1].trim() === "") { lines.pop(); }
    var indent = Math.min.apply(null, lines.filter(function (l) { return l.trim() !== ""; })
      .map(function (l) { return /^\s*/.exec(l)[0].length; }).concat([1000]));
    return lines.map(function (l) { return l.slice(indent); }).join("\n");
  }

  // the authors: "A and B", or a list of names, or a list with "name:" in each item
  function authorsOf(entry) {
    if (!entry) { return []; }
    if (entry.value !== "") { return [unquote(entry.value)]; }
    var names = [];
    entry.lines.forEach(function (line) {
      var named = /^\s*(?:-\s*)?name:\s*(.+)$/.exec(line);
      if (named) { names.push(unquote(named[1])); return; }
      var item = /^\s*-\s*(.+)$/.exec(line);
      if (item && !/^[\w-]+:/.test(item[1])) { names.push(unquote(item[1])); }
    });
    return names;
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // "date: today" with "date-format: D MMMM YYYY" gives "12 November 2026", as Quarto does
  function dateOf(value, format) {
    var date = null;
    if (/^(today|now|last-modified)$/i.test(value)) { date = new Date(); }
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (iso) { date = new Date(+iso[1], +iso[2] - 1, +iso[3]); }
    if (!date) { return value; }
    var named = { long: "MMMM D, YYYY", full: "dddd, MMMM D, YYYY", medium: "MMM D, YYYY", short: "M/D/YY", iso: "YYYY-MM-DD" };
    var pattern = named[format || "long"] || format;
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|dddd|DD|D/g, function (token) {
      switch (token) {
        case "YYYY": return String(date.getFullYear());
        case "YY": return String(date.getFullYear()).slice(2);
        case "MMMM": return MONTHS[date.getMonth()];
        case "MMM": return MONTHS[date.getMonth()].slice(0, 3);
        case "MM": return two(date.getMonth() + 1);
        case "M": return String(date.getMonth() + 1);
        case "dddd": return DAYS[date.getDay()];
        case "DD": return two(date.getDate());
        default: return String(date.getDate());
      }
    });
  }

  // the title block of the PDF, built from the header
  function titleBlockHtml(text) {
    var keys = readHeader(text);
    var html = [];
    var title = scalar(keys.title);
    if (title) { html.push('<div class="wp-title">' + printed(title) + "</div>"); }
    var subtitle = scalar(keys.subtitle);
    if (subtitle) { html.push('<div class="wp-subtitle">' + printed(subtitle) + "</div>"); }
    var authors = authorsOf(keys.author);
    if (authors.length) {
      html.push('<div class="wp-authors">' + authors.map(function (name) { return "<span>" + printed(name) + "</span>"; }).join("") + "</div>");
    }
    var date = scalar(keys.date);
    if (date) { html.push('<div class="wp-date">' + escapeHtml(dateOf(date, scalar(keys["date-format"]))) + "</div>"); }
    var abstract = scalar(keys.abstract);
    if (abstract) {
      html.push('<div class="wp-abstract-title">Abstract</div>');
      html.push('<div class="wp-abstract">' + abstract.split(/\n\s*\n/).map(function (paragraph) {
        return "<p>" + printed(paragraph.replace(/\s*\n\s*/g, " ")) + "</p>";
      }).join("") + "</div>");
    }
    if (html.length === 0) { html.push('<div class="wp-subtitle">(the header has no title)</div>'); }
    return html.join("");
  }

  // the grey line of a folded R chunk or LaTeX block
  function lineText(box, text) {
    var first = text.split("\n")[0].trim();
    if (box.classList.contains("pm-chunk-background-color")) {
      var language = (/^\{(\w+)/.exec(first) || [])[1] || "code";
      var name = (/^\{\w+[ ,]+([\w.-]+)\s*[,}]/.exec(first) || [])[1];
      var made = allMatches(CHUNK_CAPTION, text, 1);
      var what = made.length ? made.join(", ") + (made.length > 1 ? " are" : " is") + " made here" : (name || "");
      return (language === "r" ? "R" : language) + " code" + (what ? ": " + what : "") + "   (click to see the code)";
    }
    if (box.classList.contains("pm-yaml-metadata-block")) {
      // a second header further down (for example "nocite:" for the reference list)
      var keys = Object.keys(readHeader(text));
      return "header settings: " + (keys.length ? keys.join(", ") : "(empty)") + "   (click to see them)";
    }
    var lines = text.split("\n").filter(function (l) { return l.trim() !== ""; });
    var shown = (lines[0] || "").trim();
    var node = box.pmViewDesc && box.pmViewDesc.node;
    var format = node && node.attrs && node.attrs.format ? String(node.attrs.format) : (/^\\/.test(shown) ? "latex" : "raw");
    var names = { latex: "LaTeX", tex: "LaTeX", html: "HTML", openxml: "Word", typst: "Typst" };
    return (names[format.toLowerCase()] || format) + ": " + shown + (lines.length > 1 ? " \u2026" : "") + "   (click to see it)";
  }

  // which boxes fold: the header at the top, R chunks, raw blocks and further headers
  // (not a plain code block: the PDF shows that one)
  function foldKind(box, isFirstHeader) {
    if (box.classList.contains("pm-yaml-metadata-block")) { return isFirstHeader ? "header" : "settings"; }
    if (box.classList.contains("pm-chunk-background-color")) { return "chunk"; }
    if (box.classList.contains("pm-raw-block-border")) { return "raw"; }
    return "";
  }

  // ---- pictures from the PDF (12 Nov 2026, asked: "try and make it more look like draft.pdf") ----
  // What R or LaTeX makes (tables, the figure made in R, Figure 1 beside the text, the
  // reference list) is not on the page. The add-on cuts it out of the last build of the PDF
  // (pdfpages.py) and the face of the box that makes it shows that picture, at the size of
  // the PDF. Which box makes what: the caption in its code, e.g. caption = "**Table 3.** ..."
  // in an R chunk, #| fig-cap: !expr name (the caption kept in a variable by another chunk),
  // or \caption{\textbf{Figure 1.} ...} in raw LaTeX.
  var LABEL = "((?:Table|Figure) [A-Z]?\\d+)\\.";
  var CHUNK_CAPTION = new RegExp("(?:caption\\s*=|fig-cap:)\\s*(?:str_c\\(\\s*)?[\"']\\*\\*" + LABEL, "g");
  var CAPTION_IN_VARIABLE = new RegExp("([\\w.]+)\\s*<-\\s*(?:str_c\\(\\s*)?[\"']\\*\\*" + LABEL, "g");
  var LATEX_CAPTION = new RegExp("\\\\caption\\{\\\\textbf\\{" + LABEL, "g");
  var PICTURE_BASE = thisScript.replace(/index\.js(\?.*)?$/, "");

  function allMatches(pattern, text, group) {
    var found = [];
    var match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text))) {
      if (found.indexOf(match[group]) < 0) { found.push(match[group]); }
    }
    return found;
  }

  // the tables and figures that a box makes ("Table 3", "Figure 7"); variables: name -> label
  function labelsOf(kind, text, variables) {
    if (kind === "raw") { return allMatches(LATEX_CAPTION, text, 1); }
    if (kind !== "chunk") { return []; }
    var labels = allMatches(CHUNK_CAPTION, text, 1);
    var expr = /#\|\s*fig-cap:\s*!expr\s+([\w.]+)/.exec(text);
    if (expr && variables[expr[1]] && labels.indexOf(variables[expr[1]]) < 0) { labels.push(variables[expr[1]]); }
    return labels;
  }

  function currentDoc() {
    return FROM_PDF ? (pdf.current || pdf.docs[0] || null) : null;
  }

  // a picture at the size and place of the PDF (x: from the left edge of the column of text;
  // a picture of a page on its side has no x and is put in the middle)
  function picture(doc, part) {
    var place = typeof part.x === "number" ? "; margin-left: calc(" + part.x + " * var(--wp-pt))" : "";
    return '<img class="wp-pic" alt="" draggable="false" src="' + escapeHtml(PICTURE_BASE + (doc.pictures || "") + part.file) +
      '" style="width: calc(' + Number(part.w) + " * var(--wp-pt))" + place + '">';
  }

  // the face with pictures: a tag that shows on hover (what the box is), then the pictures
  function picturesHtml(doc, labels, tag) {
    var html = ['<div class="wp-tag">' + escapeHtml(tag) + "</div>"];
    labels.forEach(function (label) {
      var item = doc.items[label];
      item.parts.forEach(function (part) { html.push(picture(doc, part)); });
      if (item.more) {
        html.push('<div class="wp-more">' + escapeHtml(label) + " goes on for " + item.more + (item.more === 1 ? " more page" : " more pages") +
          " in " + escapeHtml(doc.name) + "</div>");
      }
    });
    return html.join("");
  }

  function foldBoxes(content) {
    var boxes = content.querySelectorAll(".pm-code-editor");
    var firstHeader = content.querySelector(".pm-yaml-metadata-block");
    var doc = currentDoc();
    var docKey = doc ? doc.name + " " + doc.built + " " + doc.pictures : "";
    // captions that chunks keep in a variable for another chunk (fig-cap: !expr name)
    var variables = {};
    for (var v = 0; v < boxes.length; v++) {
      if (boxes[v].classList.contains("pm-chunk-background-color")) {
        var defs = boxText(boxes[v]);
        var match;
        CAPTION_IN_VARIABLE.lastIndex = 0;
        while ((match = CAPTION_IN_VARIABLE.exec(defs))) { variables[match[1]] = match[2]; }
      }
    }
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var kind = foldKind(box, box === firstHeader);
      if (!kind || !box.querySelector(".cm-editor")) { continue; }
      var text = boxText(box);
      var labels = doc ? labelsOf(kind, text, variables).filter(function (label) { return doc.items && doc.items[label]; }) : [];
      var refs = doc && kind === "settings" && /^nocite:/m.test(text) && doc.refs && doc.refs.length ? doc.refs : null;
      var shows = kind === "header" ? "wp-title-block" : (labels.length || refs ? "wp-pictures" : "wp-line");
      // LaTeX's wrapfigure: a figure beside the text, on the right or the left
      var beside = kind === "raw" && labels.length ? /\\begin\{wrapfigure\}\{([rlRL])\}/.exec(text) : null;
      var faceClass = "wp-face " + shows + (beside ? (/[rR]/.test(beside[1]) ? " wp-beside-right" : " wp-beside-left") : "");
      var face = box.querySelector(":scope > .wp-face");
      if (!face) {
        face = document.createElement("div");
        face.setAttribute("contenteditable", "false");
        box.appendChild(face);
      }
      if (face.className !== faceClass) {
        face.className = faceClass;
        face.title = kind === "header" ? "Click to change the header (title, names, abstract, settings)" :
          (shows === "wp-pictures" ? "A picture from the PDF. Click to see the code that makes it." : "Click to open");
        face.removeAttribute("data-wp-text");
      }
      var key = text + "\n" + (shows === "wp-pictures" ? docKey : "");
      if (face.getAttribute("data-wp-text") !== key) {
        face.setAttribute("data-wp-text", key);
        if (kind === "header") {
          face.innerHTML = titleBlockHtml(text);
        } else if (refs) {
          face.innerHTML = '<div class="wp-tag">' + escapeHtml(lineText(box, text) + " – the reference list is a picture of " + doc.name) + "</div>" +
            refs.map(function (part) { return picture(doc, part); }).join("");
        } else if (labels.length) {
          face.innerHTML = picturesHtml(doc, labels, lineText(box, text));
        } else {
          face.textContent = lineText(box, text);
        }
      }
      if (!box.classList.contains("wp-folded")) { box.classList.add("wp-folded"); }
    }
  }

  // ---- citations as the PDF prints them ----
  // "[@Hoydahl_2023, p. 4]" is shown as "(Høydahl, 2023, p. 4)", with the author and year
  // exactly as in the PDF (pdfpages.py reads them from the links of the citations). The
  // text in the document stays as it is: style rules (in a style block of our own, in the
  // page's head) make "[", the @key and "]" invisible and show "(", "Høydahl, 2023" and ")"
  // in their place. The rules find each part by its place on the page (":nth-child"), so
  // nothing in the editor is changed. A citation with the cursor in it shows its @key, so
  // it can be changed. After every change on the page the places are checked at once, before
  // the screen is drawn again, so a rule never lands on another citation.
  var citeStyle = null;
  var citeParts = [];          // [{el, path}] of the parts that have a rule now
  var citeWithCursor = null;
  var ROOT = "html.word-page.pdf-look .ProseMirror > .body > .pm-content > ";

  function pathOf(el, root) {
    var steps = [];
    while (el && el !== root) {
      var parent = el.parentElement;
      if (!parent) { return null; }
      steps.unshift(":nth-child(" + (Array.prototype.indexOf.call(parent.children, el) + 1) + ")");
      el = parent;
    }
    return el === root ? steps.join(" > ") : null;
  }

  function cssText(text) {
    return '"' + String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';
  }

  function cursorCite() {
    var selection = window.getSelection();
    var node = selection && selection.rangeCount ? selection.focusNode : null;
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && el.closest ? el.closest(".cite") : null;
  }

  function drawCites(content) {
    if (!citeStyle) {
      citeStyle = document.createElement("style");
      citeStyle.id = "word-page-cites";
      document.head.appendChild(citeStyle);
    }
    var doc = currentDoc();
    var labels = doc && doc.cites ? doc.cites : null;
    var rules = [];
    var parts = [];
    citeWithCursor = cursorCite();
    if (labels && content) {
      var cites = content.querySelectorAll(".cite");
      for (var c = 0; c < cites.length; c++) {
        var cite = cites[c];
        if (cite === citeWithCursor || cite.closest(".pm-code-editor")) { continue; }
        var ids = cite.querySelectorAll(".cite-id");
        var known = ids.length > 0;
        for (var k = 0; k < ids.length; k++) {
          if (!labels[ids[k].textContent.replace(/^-?@/, "")]) { known = false; }
        }
        if (!known) { continue; }                     // a key the PDF does not have yet: leave it as it is
        var size = getComputedStyle(cite).fontSize;
        var inBrackets = cite.textContent.trim().charAt(0) === "[";
        for (var p = 0; p < cite.children.length; p++) {
          var child = cite.children[p];
          var text = child.textContent;
          var shown = null;
          if (child.classList.contains("cite-id")) {
            var label = labels[text.replace(/^-?@/, "")];
            shown = /^-@/.test(text) ? label.year : (inBrackets ? label.author + ", " + label.year : label.author + " (" + label.year + ")");
          } else if (text === "[") {
            shown = "(";
          } else if (text === "]") {
            shown = ")";
          }
          if (shown === null) { continue; }
          var path = pathOf(child, content);
          if (!path) { continue; }
          // the brackets are black in the PDF (the link is only the author and year);
          // a long @key may be broken anywhere (pdf-look.css), the author and year may not
          rules.push(ROOT + path + " { font-size: 0 !important; }");
          rules.push(ROOT + path + "::before { content: " + cssText(shown) + "; font-size: " + size +
            "; word-break: normal;" + (shown === "(" || shown === ")" ? " color: #000000;" : "") + " }");
          parts.push({ el: child, path: path });
        }
      }
    }
    citeParts = parts;
    var css = rules.join("\n");
    if (citeStyle.textContent !== css) { citeStyle.textContent = css; }
  }

  // after a change on the page: is every rule still on its own part? If not, draw them again now
  function checkCites() {
    if (!citeParts.length) { return; }
    var content = pageContent();
    for (var i = 0; i < citeParts.length; i++) {
      var part = citeParts[i];
      if (!content || !content.contains(part.el) || pathOf(part.el, content) !== part.path) {
        drawCites(content);
        return;
      }
    }
  }

  document.addEventListener("selectionchange", function () {
    if (!FROM_PDF || !citeParts.length && !citeWithCursor) { return; }
    if (cursorCite() !== citeWithCursor) { drawCites(pageContent()); }
  });

  // A box opens (class wp-open) when the cursor goes into it because of the user: a click
  // on its face, or the arrow keys. When the editor puts the cursor there by itself (it
  // does so in the header when a document opens), the cursor is taken out again: typing
  // must never go into a box that is folded. The box folds again when the cursor leaves.
  var lastInput = 0;
  function userInput() { lastInput = Date.now(); }
  document.addEventListener("keydown", userInput, true);
  document.addEventListener("mousedown", userInput, true);

  document.addEventListener("mousedown", function (event) {
    var face = event.target && event.target.closest ? event.target.closest(".wp-face") : null;
    if (!face) { return; }
    var box = face.parentElement;
    var code = box && box.querySelector(".cm-content");
    if (!code) { return; }
    event.preventDefault();
    event.stopPropagation();
    box.classList.add("wp-open");
    code.focus();
  }, true);

  document.addEventListener("focusin", function (event) {
    var box = event.target && event.target.closest ? event.target.closest(".pm-code-editor.wp-folded") : null;
    if (!box || box.classList.contains("wp-open")) { return; }
    if (Date.now() - lastInput < 1000) {
      box.classList.add("wp-open");
    } else if (event.target.blur) {
      event.target.blur();
    }
  }, true);

  document.addEventListener("focusout", function (event) {
    var box = event.target && event.target.closest ? event.target.closest(".pm-code-editor.wp-open") : null;
    if (box && !(event.relatedTarget && box.contains(event.relatedTarget))) { box.classList.remove("wp-open"); }
  }, true);

  // ---- page ends ----
  var pdf = { raw: null, docs: [] };     // what word-page-pdf.css holds now
  var dataLink = null;

  // the letters and digits of a text, small: "Norway's 25,000 kr" -> "norways25000kr"
  function plain(text) {
    return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  function loadPdfData() {
    if (!DATA_URL || document.visibilityState === "hidden") { return; }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = DATA_URL + "?v=" + Date.now();
    link.onload = function () {
      if (dataLink && dataLink !== link) { dataLink.remove(); }
      dataLink = link;
      var raw = getComputedStyle(document.documentElement).getPropertyValue("--wp-pdf-pages").trim().replace(/^["']|["']$/g, "");
      if (raw === pdf.raw) { return; }
      pdf.raw = raw;
      pdf.current = null;
      try {
        var bytes = Uint8Array.from(atob(raw), function (c) { return c.charCodeAt(0); });
        pdf.docs = JSON.parse(new TextDecoder("utf-8").decode(bytes)).docs || [];
      } catch (err) {
        pdf.docs = [];
      }
      schedule();
    };
    link.onerror = function () { link.remove(); };
    document.head.appendChild(link);
  }

  // the text of the page as one string of letters and digits, and for each of them the
  // text node and place it comes from. Code boxes, faces and figure captions are left
  // out (in the PDF a figure floats to another place).
  function textOfPage(content) {
    var letters = [];
    var nodes = [];
    var offsets = [];
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || parent.closest(".pm-code-editor, .wp-face, figure")) { return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var value = node.nodeValue;
      for (var i = 0; i < value.length; i++) {
        var kept = plain(value.charAt(i));
        for (var k = 0; k < kept.length; k++) {
          letters.push(kept.charAt(k));
          nodes.push(node);
          offsets.push(i);
        }
      }
    }
    return { text: letters.join(""), nodes: nodes, offsets: offsets };
  }

  // where one PDF page starts in the text of the page: the place of the first of its
  // lines that is found after the start of the page before (-1 = not found)
  function findPageStart(page, text, from) {
    for (var k = 0; k < page.lines.length; k++) {
      var line = plain(page.lines[k]);
      if (line.length < 8) { continue; }
      var tries = [line, line.slice(0, 40), line.slice(0, 22), line.slice(-24)];
      for (var t = 0; t < tries.length; t++) {
        if (tries[t].length < 8) { continue; }
        var at = text.indexOf(tries[t], from);
        if (at >= 0 && at - from < 15000) {
          return { at: at, end: at + tries[t].length };
        }
      }
    }
    return null;
  }

  // the height on the page (from the top of the sheet) of the line where a text place is
  function heightOf(content, node, offset, top) {
    var range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, Math.min(offset + 1, node.nodeValue.length));
    var rect = range.getClientRects()[0];
    if (!rect) { return null; }
    var block = node.parentElement.closest("p, h1, h2, h3, h4, h5, h6, li, td, th, .pm-node-caption") || node.parentElement;
    var style = getComputedStyle(block);
    var lineHeight = parseFloat(style.lineHeight) || rect.height;
    var lineTop = rect.top - (lineHeight - rect.height) / 2;
    var blockRect = block.getBoundingClientRect();
    if (lineTop - blockRect.top < 2) {
      // the first line of a paragraph or heading: halfway into the room above it
      return blockRect.top - top - (parseFloat(style.marginTop) || 0) / 2;
    }
    return lineTop - top;
  }

  var endsStyle = null;
  function drawPageEnds(content) {
    if (!endsStyle) {
      endsStyle = document.createElement("style");
      endsStyle.id = "word-page-ends";
      document.head.appendChild(endsStyle);
    }
    var css = "";
    if (PAGE_ENDS && pdf.docs.length) {
      var page = textOfPage(content);
      var best = null;
      pdf.docs.forEach(function (doc) {
        var marks = [];
        var from = 0;
        doc.pages.forEach(function (p) {
          if (p.n === 1 || p.sideways) { return; }
          var found = findPageStart(p, page.text, from);
          if (!found) { return; }
          from = found.end;
          marks.push({ n: p.n, at: found.at });
        });
        if (!best || marks.length > best.marks.length) { best = { doc: doc, marks: marks }; }
      });
      // the PDF of this document (when more documents are open as a page, each has its own)
      if (best && best.marks.length && pdf.current !== best.doc) {
        pdf.current = best.doc;
        schedule();
      }
      if (best && best.marks.length) {
        var box = content.getBoundingClientRect();
        var width = Math.round(content.offsetWidth);
        var height = Math.round(content.offsetHeight);
        var margin = parseFloat(getComputedStyle(content).paddingRight) || 40;
        var size = margin >= 56 ? 11 : 9;
        var parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">'];
        best.marks.forEach(function (mark) {
          var y = heightOf(content, page.nodes[mark.at], page.offsets[mark.at], box.top);
          if (y === null) { return; }
          y = Math.round(y) + 0.5;
          parts.push('<line x1="0" x2="' + width + '" y1="' + y + '" y2="' + y + '" stroke="#aab1ba" stroke-width="1" stroke-dasharray="6 4"/>');
          parts.push('<text x="' + (width - 6) + '" y="' + (y - 4) + '" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="' + size +
            '" fill="#7d858f">' + (size === 11 ? "page " : "p. ") + mark.n + "</text>");
        });
        // (a page that starts with a figure, a table made by R or the reference list has no
        // line of its own: those are not text on this page)
        var note = "page ends: " + escapeHtml(best.doc.name) + ", built " + escapeHtml(best.doc.built);
        parts.push('<text x="' + (width - 6) + '" y="16" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#9aa0a6">' + note + "</text>");
        parts.push("</svg>");
        css = "html.word-page.pdf-look .ProseMirror > .body > .pm-content {" +
          " background-image: url(\"data:image/svg+xml," + encodeURIComponent(parts.join("")) + "\") !important;" +
          " background-repeat: no-repeat !important; background-position: 0 0 !important;" +
          " background-size: " + width + "px " + height + "px !important; }";
      }
    }
    if (endsStyle.textContent !== css) { endsStyle.textContent = css; }
  }

  // ---- when to do it: after the page changes (typing, a picture loads, a box opens) ----
  var timer = 0;
  var watchedContent = null;
  var resizes = typeof ResizeObserver === "function" ? new ResizeObserver(function () { schedule(); }) : null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 400);
  }
  function update() {
    var content = pageContent();
    if (!content) { return; }
    if (resizes && watchedContent !== content) {
      if (watchedContent) { resizes.unobserve(watchedContent); }
      resizes.observe(content);
      watchedContent = content;
    }
    try { if (FOLD) { foldBoxes(content); } } catch (err) { /* the page stays as Quarto made it */ }
    // "indent: true" in the header: paragraphs as in the PDF, first line in, no room between
    // them (the rules for the class wp-indent are at the end of inject/pdf-look.css)
    var header = content.querySelector(".pm-yaml-metadata-block");
    var indent = !!header && /^\s*indent:\s*(true|yes)\s*$/m.test(boxText(header));
    if (document.documentElement.classList.contains("wp-indent") !== indent) {
      document.documentElement.classList.toggle("wp-indent", indent);
    }
    // the cursor in a folded box that the user did not open (the page was opened in the
    // background, so no focusin came): take it out, typing must not go into hidden code
    var active = document.activeElement;
    var hidden = active && active.closest ? active.closest(".pm-code-editor.wp-folded:not(.wp-open)") : null;
    if (hidden && active.blur) { active.blur(); }
    try { if (FROM_PDF) { drawCites(content); } } catch (err) { /* citations stay @keys this time */ }
    try { drawPageEnds(content); } catch (err) { /* no page ends this time */ }
  }
  if (PDF_LOOK && document.body) {
    // checkCites runs straight away (before the screen is drawn again), the rest a moment later
    new MutationObserver(function () {
      try { checkCites(); } catch (err) { /* drawn again with the rest */ }
      schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(schedule); }
    if (PAGE_ENDS || FROM_PDF) {
      loadPdfData();
      setInterval(loadPdfData, 3000);
    }
  }

  // ---- changes made to the file outside the page (12 Nov 2026) ----
  // Quarto's page drops a change that another program makes to the file (another Claude
  // session, a script) while the page has the focus: its handler only applies it when
  // neither the editor nor the page has the focus (applyExternalEdit in Quarto's index.js),
  // and it does not try again. The page then shows the old text, and 2 seconds after the next
  // keystroke Quarto writes that old text over the whole file (found 12 Nov 2026: the user did
  // not see the edits of another session in his page). Here: when such a change comes in and
  // nothing was typed on the page for 2.5 seconds (so Quarto has written everything typed into
  // the file), the page takes the change: for this one message the editor has no focus. While
  // typing it cannot take it without losing what was typed; a bar at the top then says so.
  var EXTERNAL_EDIT = "vsc_ve_apply_external_edit";
  var lastTyping = 0;
  ["keydown", "beforeinput", "paste", "cut", "drop"].forEach(function (name) {
    document.addEventListener(name, function () { lastTyping = Date.now(); }, true);
  });

  function outsideWarning() {
    var bar = document.getElementById("word-page-outside");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "word-page-outside";
      bar.setAttribute("style", "position: fixed; top: 0; left: 0; right: 0; z-index: 1000; padding: 6px 12px; " +
        "background: #b42318; color: #ffffff; font: 13px 'Segoe UI', Arial, sans-serif; cursor: pointer;");
      bar.title = "Click to close";
      bar.addEventListener("click", function () { bar.remove(); });
      document.body.appendChild(bar);
    }
    bar.textContent = "This file was changed outside the page while you were typing. The page has written its own text " +
      "over that change. To see the file as it is now: close this tab and open it again (click to close this bar).";
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object" || data.method !== EXTERNAL_EDIT) { return; }
    if (!document.hasFocus()) { return; }                   // Quarto takes the change itself
    if (Date.now() - lastTyping < 2500) { outsideWarning(); return; }
    var active = document.activeElement;
    var scroller = document.querySelector(".ProseMirror") && document.querySelector(".ProseMirror").parentElement;
    var scrollTop = scroller ? scroller.scrollTop : 0;
    // Quarto's handler runs right after this one and asks: does the editor, does the page have the focus?
    document.hasFocus = function () { return false; };
    if (active && active.blur) { active.blur(); }
    setTimeout(function () {
      delete document.hasFocus;                               // the browser's own again
      if (scroller) { scroller.scrollTop = scrollTop; }
      if (active && active.focus && document.contains(active)) {
        try { active.focus({ preventScroll: true }); } catch (err) { /* the user clicks back in */ }
      }
    }, 300);
  }, true);

  apply();
  // VS Code sends its theme colours again when the theme or a setting changes: put ours back
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  if (document.body) {
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
/* word-page:end */
