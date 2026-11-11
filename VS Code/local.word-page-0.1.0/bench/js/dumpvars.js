// All theme variables VS Code gave this webview, plus the body's theme marks
const st = doc.documentElement.style;
const vars = {};
for (let i = 0; i < st.length; i++) {
  const name = st[i];
  if (name.startsWith("--vscode-")) vars[name] = st.getPropertyValue(name);
}
return JSON.stringify({
  bodyClass: doc.body.className,
  themeKind: doc.body.dataset.vscodeThemeKind,
  themeName: doc.body.dataset.vscodeThemeName,
  themeId: doc.body.dataset.vscodeThemeId,
  rootClass: doc.getElementById("root").className,
  editorClass: doc.getElementById("editor") ? doc.getElementById("editor").className : null,
  count: Object.keys(vars).length,
  vars
});
