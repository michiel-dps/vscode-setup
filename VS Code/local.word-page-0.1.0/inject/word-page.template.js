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

  apply();
  // VS Code sends its theme colours again when the theme or a setting changes: put ours back
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  if (document.body) {
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
/* word-page:end */
