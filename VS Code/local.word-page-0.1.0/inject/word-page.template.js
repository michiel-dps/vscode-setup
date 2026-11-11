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

  apply();
  // VS Code sends its theme colours again when the theme or a setting changes: put ours back
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  if (document.body) {
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
/* word-page:end */
