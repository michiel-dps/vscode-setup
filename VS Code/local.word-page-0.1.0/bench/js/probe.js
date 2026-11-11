// What is in the Quarto editor webview? (doc, win) = the inner document and window
const root = doc.getElementById("root");
const htmlStyle = doc.documentElement.style;
const out = {
  bodyClass: doc.body.className,
  vars: htmlStyle.length,
  bg: htmlStyle.getPropertyValue("--vscode-editor-background"),
  fg: htmlStyle.getPropertyValue("--vscode-editor-foreground"),
  rootChildren: root.children.length,
  text: (doc.body.innerText || "").slice(0, 300)
};
// outline of the DOM, 5 levels deep
function walk(el, depth) {
  if (depth > 5) return "";
  const cls = (el.className && el.className.baseVal === undefined ? String(el.className) : "").trim().split(/\s+/).slice(0, 4).join(".");
  const r = el.getBoundingClientRect();
  let line = "  ".repeat(depth) + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls ? "." + cls : "") +
    " [" + Math.round(r.width) + "x" + Math.round(r.height) + "]\n";
  for (const c of Array.from(el.children).slice(0, 8)) line += walk(c, depth + 1);
  return line;
}
out.tree = walk(root, 0);
return JSON.stringify(out, null, 1);
