  // ---- Claude's suggestions, like Grammarly (16 Nov 2026) ----
  // assistant.js in the add-on asks Claude about each paragraph he changed, after a pause in
  // typing, and writes the answers into word-page-assistant.css next to this script. Every 2 s
  // the page reads that file and draws a coloured line under the words of each suggestion:
  // red = correctness, blue = clarity and conciseness, green = word choice. A click on such
  // words opens a card with the new words, the reason, Accept and Dismiss. A list of all of them
  // is on the right of the page (folded into a small button when the editor is narrow).
  //
  // All of it is drawn in a layer of its own on top of the page (position: fixed), never inside
  // Quarto's editor, so the document is never touched by the drawing. Accept puts the cursor
  // over the old words and types the new ones (document.execCommand "insertText"): Quarto takes
  // that as typing, so Ctrl+Z undoes it and the text goes into the file as always.
  // Dismiss is remembered in this page (localStorage), per suggestion.
  var ASSIST_URL = thisScript ? thisScript.replace(/index\.js(\?.*)?$/, "word-page-assistant.css") : "";
  var assist = { raw: null, data: { on: true, busy: 0, error: "", suggestions: [] }, found: [], open: null, panelOpen: null, gone: {} };
  var assistLink = null;
  var KIND = {
    grammar: { label: "Correctness", colour: "#d1343b" },
    punctuation: { label: "Correctness", colour: "#d1343b" },
    clarity: { label: "Clarity", colour: "#2b63d9" },
    concise: { label: "Conciseness", colour: "#2b63d9" },
    wording: { label: "Word choice", colour: "#16915a" }
  };

  function dismissedList() {
    try { return JSON.parse(localStorage.getItem("wp-assistant-dismissed") || "[]"); } catch (err) { return []; }
  }
  var dismissed = dismissedList();
  function dismiss(id) {
    if (dismissed.indexOf(id) < 0) { dismissed.push(id); }
    if (dismissed.length > 2000) { dismissed = dismissed.slice(-2000); }
    try { localStorage.setItem("wp-assistant-dismissed", JSON.stringify(dismissed)); } catch (err) { /* only for this session then */ }
  }

  function loadAssistData() {
    if (!ASSIST_URL || document.visibilityState === "hidden") { return; }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ASSIST_URL + "?v=" + Date.now();
    link.onload = function () {
      if (assistLink && assistLink !== link) { assistLink.remove(); }
      assistLink = link;
      var raw = getComputedStyle(document.documentElement).getPropertyValue("--wp-assistant").trim().replace(/^["']|["']$/g, "");
      if (raw === assist.raw) {
        // an accepted suggestion whose few seconds are over: draw again (it may be back)
        for (var id in assist.gone) {
          if (Date.now() - assist.gone[id] >= 6000) { delete assist.gone[id]; assistSchedule(true); }
        }
        return;
      }
      assist.raw = raw;
      try {
        var bytes = Uint8Array.from(atob(raw), function (c) { return c.charCodeAt(0); });
        assist.data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      } catch (err) {
        assist.data = { on: true, busy: 0, error: "", suggestions: [] };
      }
      needFind = true;
      assistDraw();
    };
    link.onerror = function () { link.remove(); };
    document.head.appendChild(link);
  }

  // how many letters two texts share at the end (a) and at the start (b)
  function sharedEnd(a, b) {
    var n = 0;
    while (n < a.length && n < b.length && a.charAt(a.length - 1 - n) === b.charAt(b.length - 1 - n)) { n++; }
    return n;
  }
  function sharedStart(a, b) {
    var n = 0;
    while (n < a.length && n < b.length && a.charAt(n) === b.charAt(n)) { n++; }
    return n;
  }

  // Where the words of a suggestion are on the page: a Range, or null. Of all places with these
  // letters, the one whose letters around it fit the suggestion best. The range also takes in
  // punctuation at the start or end of the old words ("check this," with its comma).
  function assistRange(s, page) {
    var key = plain(s.original);
    if (!key) { return null; }
    var best = -1;
    var bestScore = -1;
    var at = page.text.indexOf(key);
    while (at >= 0) {
      var score = sharedEnd(page.text.slice(Math.max(0, at - 40), at), s.before || "") +
        sharedStart(page.text.slice(at + key.length, at + key.length + 40), s.after || "");
      if (score > bestScore) { best = at; bestScore = score; }
      at = page.text.indexOf(key, at + 1);
    }
    if (best < 0) { return null; }
    // with letters around it, at least some of them must fit (else it is another place)
    if ((s.before || s.after) && bestScore < Math.min(6, (s.before || "").length + (s.after || "").length)) { return null; }
    var startNode = page.nodes[best];
    var startOffset = page.offsets[best];
    var endNode = page.nodes[best + key.length - 1];
    var endOffset = page.offsets[best + key.length - 1] + 1;
    var lead = (/^[^\p{L}\p{N}]*/u.exec(s.original) || [""])[0];
    var tail = (/[^\p{L}\p{N}]*$/u.exec(s.original) || [""])[0];
    if (lead && startNode.nodeValue.slice(startOffset - lead.length, startOffset) === lead) { startOffset -= lead.length; }
    if (tail && endNode.nodeValue.slice(endOffset, endOffset + tail.length) === tail) { endOffset += tail.length; }
    var range = document.createRange();
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
    } catch (err) { return null; }
    return range;
  }

  // ---- drawing ----
  var assistLayer = null;
  var assistCard = null;
  var assistPanel = null;
  function assistElements() {
    if (assistLayer && document.body.contains(assistLayer)) { return; }
    var style = document.createElement("style");
    style.id = "word-page-assistant";
    style.textContent = [
      "#wp-assist-layer { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 40; pointer-events: none; }",
      "#wp-assist-layer .wp-line { position: fixed; height: 2px; border-radius: 1px; pointer-events: none; }",
      "#wp-assist-layer .wp-line.wp-active { height: 100%; opacity: .14; border-radius: 2px; }",
      ".wp-assist-card { position: fixed; z-index: 60; width: 330px; max-width: calc(100vw - 24px); background: #fff; color: #1f2328;",
      "  border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06); padding: 12px 14px;",
      "  font: 13px/1.45 'Segoe UI', system-ui, sans-serif; }",
      ".wp-assist-card .wp-kind { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 6px; }",
      ".wp-assist-card .wp-change { font-size: 14px; margin-bottom: 6px; word-wrap: break-word; }",
      ".wp-assist-card .wp-old { text-decoration: line-through; color: #8a8f98; }",
      ".wp-assist-card .wp-new { font-weight: 600; background: #e7f6ec; border-radius: 3px; padding: 0 3px; }",
      ".wp-assist-card .wp-why { color: #57606a; margin-bottom: 10px; }",
      ".wp-assist-card button, .wp-assist-panel button { font: 600 12px 'Segoe UI', system-ui, sans-serif; border-radius: 6px; padding: 5px 12px; cursor: pointer; border: 1px solid #d0d7de; background: #f6f8fa; color: #24292f; }",
      ".wp-assist-card button.wp-accept, .wp-assist-panel button.wp-accept { background: #1f7a4d; border-color: #1f7a4d; color: #fff; margin-right: 6px; }",
      ".wp-assist-panel { position: fixed; z-index: 50; right: 12px; top: 12px; width: 280px; max-height: calc(100vh - 24px); display: flex; flex-direction: column;",
      "  background: #fff; color: #1f2328; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.06); font: 13px/1.4 'Segoe UI', system-ui, sans-serif; }",
      ".wp-assist-panel.wp-folded { width: auto; }",
      ".wp-assist-panel .wp-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; font-weight: 600; user-select: none; }",
      ".wp-assist-panel .wp-head .wp-count { margin-left: auto; min-width: 20px; text-align: center; border-radius: 10px; padding: 0 6px; background: #d1343b; color: #fff; font-size: 12px; }",
      ".wp-assist-panel .wp-head .wp-count.wp-zero { background: #1f7a4d; }",
      ".wp-assist-panel .wp-state { padding: 0 12px 8px; color: #57606a; font-size: 12px; }",
      ".wp-assist-panel .wp-list { overflow-y: auto; padding: 0 8px 8px; }",
      ".wp-assist-panel.wp-folded .wp-list, .wp-assist-panel.wp-folded .wp-state { display: none; }",
      ".wp-assist-panel .wp-item { border-radius: 8px; padding: 8px 8px 8px 10px; margin-top: 6px; border-left: 3px solid #ccc; background: #f6f8fa; cursor: pointer; }",
      ".wp-assist-panel .wp-item:hover { background: #eef1f4; }",
      ".wp-assist-panel .wp-item .wp-change { margin: 2px 0 4px; word-wrap: break-word; }",
      ".wp-assist-panel .wp-item .wp-old { text-decoration: line-through; color: #8a8f98; }",
      ".wp-assist-panel .wp-item .wp-new { font-weight: 600; }",
      ".wp-assist-panel .wp-item .wp-why { color: #57606a; font-size: 12px; margin-bottom: 6px; }",
      ".wp-assist-panel .wp-item .wp-kind { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }",
      ".wp-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }"
    ].join("\n");
    document.head.appendChild(style);
    assistLayer = document.createElement("div");
    assistLayer.id = "wp-assist-layer";
    document.body.appendChild(assistLayer);
    // a press on the card or the list must not take the cursor out of the text
    assistPanel = document.createElement("div");
    assistPanel.className = "wp-assist-panel";
    assistPanel.addEventListener("mousedown", function (event) { event.preventDefault(); });
    document.body.appendChild(assistPanel);
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // the suggestions found on the page now, in the order of the text, with their ranges
  function assistFind() {
    var content = pageContent();
    var list = (assist.data && assist.data.on && assist.data.suggestions) || [];
    if (!content || !list.length) { return []; }
    var page = textOfPage(content);
    var found = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      // accepted a moment ago: hidden until the add-on's new list has come (after Ctrl+Z it is back)
      if (dismissed.indexOf(s.id) >= 0 || (assist.gone[s.id] && Date.now() - assist.gone[s.id] < 6000)) { continue; }
      var range = assistRange(s, page);
      if (range) { found.push({ s: s, range: range }); }
    }
    found.sort(function (a, b) { return a.range.compareBoundaryPoints(Range.START_TO_START, b.range); });
    return found;
  }

  // Finding the words reads the text of the whole page: only after the text or the suggestions
  // changed (find = true). Scrolling only moves the lines.
  var assistTimer = null;
  var needFind = true;
  function assistSchedule(find) {
    if (find === true) { needFind = true; }
    if (assistTimer) { return; }
    assistTimer = requestAnimationFrame(function () { assistTimer = null; assistDraw(); });
  }

  function assistDraw() {
    if (!document.body) { return; }
    assistElements();
    if (needFind) { assist.found = assistFind(); needFind = false; }
    var parts = [];
    var height = window.innerHeight;
    for (var i = 0; i < assist.found.length; i++) {
      var f = assist.found[i];
      var colour = (KIND[f.s.kind] || KIND.clarity).colour;
      var rects = f.range.getClientRects();
      var active = assist.open && assist.open.s.id === f.s.id;
      for (var r = 0; r < rects.length; r++) {
        var rect = rects[r];
        if (rect.width < 1 || rect.bottom < 0 || rect.top > height) { continue; }
        if (active) {
          parts.push('<div class="wp-line wp-active" style="left:' + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;background:" + colour + '"></div>');
        }
        parts.push('<div class="wp-line" style="left:' + rect.left + "px;top:" + (rect.bottom - 1) + "px;width:" + rect.width + "px;background:" + colour + '"></div>');
      }
    }
    assistLayer.innerHTML = parts.join("");
    if (assist.open) {
      var still = assist.found.filter(function (f) { return f.s.id === assist.open.s.id; })[0];
      if (still) { assist.open = still; placeCard(); } else { closeCard(); }
    }
    drawPanel();
  }

  // ---- the card ----
  function openCard(found) {
    assist.open = found;
    if (!assistCard) {
      assistCard = document.createElement("div");
      assistCard.className = "wp-assist-card";
      assistCard.addEventListener("mousedown", function (event) { event.preventDefault(); });
      assistCard.addEventListener("click", function (event) {
        var button = event.target.closest("button");
        if (!button || !assist.open) { return; }
        if (button.classList.contains("wp-accept")) { accept(assist.open); }
        if (button.classList.contains("wp-dismiss")) { dismiss(assist.open.s.id); closeCard(); assistSchedule(true); }
      });
      document.body.appendChild(assistCard);
    }
    var s = found.s;
    var kind = KIND[s.kind] || KIND.clarity;
    assistCard.innerHTML =
      '<div class="wp-kind" style="color:' + kind.colour + '">' + kind.label + "</div>" +
      '<div class="wp-change"><span class="wp-old">' + escapeHtml(s.original) + '</span> &rarr; <span class="wp-new">' +
      (s.replacement ? escapeHtml(s.replacement) : "<i>(remove)</i>") + "</span></div>" +
      (s.reason ? '<div class="wp-why">' + escapeHtml(s.reason) + "</div>" : "") +
      '<button class="wp-accept">Accept</button><button class="wp-dismiss">Dismiss</button>';
    assistCard.style.display = "block";
    placeCard();
    assistDraw();
  }

  function placeCard() {
    if (!assistCard || !assist.open) { return; }
    var rects = assist.open.range.getClientRects();
    var rect = rects[rects.length - 1] || assist.open.range.getBoundingClientRect();
    var cardHeight = assistCard.offsetHeight || 140;
    var top = rect.bottom + 8;
    if (top + cardHeight > window.innerHeight - 8) { top = Math.max(8, rect.top - cardHeight - 8); }
    var left = Math.min(Math.max(8, rect.left), window.innerWidth - (assistCard.offsetWidth || 330) - 8);
    assistCard.style.top = top + "px";
    assistCard.style.left = left + "px";
  }

  function closeCard() {
    assist.open = null;
    if (assistCard) { assistCard.style.display = "none"; }
  }

  // Accept: select the old words and type the new ones, as if he typed them
  function accept(found) {
    var editor = document.querySelector(".ProseMirror");
    var range = found.range;
    var fresh = assistFind().filter(function (f) { return f.s.id === found.s.id; })[0];
    if (fresh) { range = fresh.range; }
    if (!editor || !range) { return; }
    try { editor.focus({ preventScroll: true }); } catch (err) { /* it still works without */ }
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    var done = false;
    try {
      done = found.s.replacement ? document.execCommand("insertText", false, found.s.replacement) : document.execCommand("delete", false);
    } catch (err) { done = false; }
    if (done) { assist.gone[found.s.id] = Date.now(); }
    closeCard();
    setTimeout(function () { assistSchedule(true); }, 50);
  }

  // a click in the text on underlined words opens their card; a click elsewhere closes it
  document.addEventListener("click", function (event) {
    if (assistCard && assistCard.contains(event.target)) { return; }
    if (assistPanel && assistPanel.contains(event.target)) { return; }
    var x = event.clientX, y = event.clientY;
    for (var i = 0; i < assist.found.length; i++) {
      var rects = assist.found[i].range.getClientRects();
      for (var r = 0; r < rects.length; r++) {
        var rect = rects[r];
        if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 2 && y <= rect.bottom + 3) {
          openCard(assist.found[i]);
          return;
        }
      }
    }
    if (assist.open) { closeCard(); assistDraw(); }
  }, true);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && assist.open) { closeCard(); assistDraw(); }
  }, true);

  // ---- the list on the right ----
  function panelFits() {
    var sheet = document.querySelector(".ProseMirror");
    if (!sheet) { return false; }
    var right = sheet.getBoundingClientRect().right;
    return window.innerWidth - right >= 300;
  }

  function drawPanel() {
    var data = assist.data || {};
    if (!data.on) { assistPanel.style.display = "none"; return; }
    assistPanel.style.display = "flex";
    var folded = assist.panelOpen === null ? !panelFits() : !assist.panelOpen;
    assistPanel.classList.toggle("wp-folded", folded);
    var n = assist.found.length;
    var state = data.error ? "Claude: " + data.error :
      data.busy ? "Claude is reading " + data.busy + " paragraph" + (data.busy === 1 ? "" : "s") + "…" :
      n ? "" : "No suggestions for what you wrote.";
    var items = assist.found.map(function (f, i) {
      var kind = KIND[f.s.kind] || KIND.clarity;
      return '<div class="wp-item" data-i="' + i + '" style="border-left-color:' + kind.colour + '">' +
        '<div class="wp-kind" style="color:' + kind.colour + '">' + kind.label + "</div>" +
        '<div class="wp-change"><span class="wp-old">' + escapeHtml(f.s.original) + '</span> &rarr; <span class="wp-new">' +
        (f.s.replacement ? escapeHtml(f.s.replacement) : "<i>(remove)</i>") + "</span></div>" +
        (f.s.reason ? '<div class="wp-why">' + escapeHtml(f.s.reason) + "</div>" : "") +
        '<button class="wp-accept" data-i="' + i + '">Accept</button><button class="wp-dismiss" data-i="' + i + '">Dismiss</button></div>';
    }).join("");
    var html = '<div class="wp-head"><span class="wp-dot" style="background:#7c4dff"></span>Claude' +
      '<span class="wp-count' + (n ? "" : " wp-zero") + '">' + (data.busy && !n ? "…" : n) + "</span></div>" +
      (state ? '<div class="wp-state">' + escapeHtml(state) + "</div>" : "") +
      '<div class="wp-list">' + items + "</div>";
    if (assistPanel.innerHTML !== html) {
      var list = assistPanel.querySelector(".wp-list");
      var scroll = list ? list.scrollTop : 0;
      assistPanel.innerHTML = html;
      var again = assistPanel.querySelector(".wp-list");
      if (again) { again.scrollTop = scroll; }
    }
  }

  document.addEventListener("click", function (event) {
    if (!assistPanel || !assistPanel.contains(event.target)) { return; }
    if (event.target.closest(".wp-head")) {
      assist.panelOpen = assistPanel.classList.contains("wp-folded");
      drawPanel();
      return;
    }
    var holder = event.target.closest("[data-i]");
    if (!holder) { return; }
    var found = assist.found[Number(holder.getAttribute("data-i"))];
    if (!found) { return; }
    if (event.target.closest(".wp-accept")) { accept(found); return; }
    if (event.target.closest(".wp-dismiss")) { dismiss(found.s.id); closeCard(); assistSchedule(true); return; }
    // a click on the item: show the words in the text, with their card
    var rect = found.range.getBoundingClientRect();
    if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
      var node = found.range.startContainer.parentElement;
      if (node && node.scrollIntoView) { node.scrollIntoView({ block: "center" }); }
    }
    setTimeout(function () {
      var again = assistFind().filter(function (f) { return f.s.id === found.s.id; })[0];
      if (again) { openCard(again); }
    }, 60);
  });

  // redraw when the page scrolls or changes size (lines move), or its text changes (find again)
  window.addEventListener("scroll", function () { assistSchedule(false); }, true);
  window.addEventListener("resize", function () { assistSchedule(false); });
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var target = records[i].target;
      var element = target.nodeType === 1 ? target : target.parentElement;
      if (!element || !element.closest || element.closest("head, #wp-assist-layer, .wp-assist-card, .wp-assist-panel")) { continue; }
      assistSchedule(true);
      return;
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  if (ASSIST_URL) {
    loadAssistData();
    setInterval(loadAssistData, 2000);
  }
