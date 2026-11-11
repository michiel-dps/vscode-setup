// What the page is built of: the tag, classes and main style of each kind of block and
// of the marks inside the text (citation, code, link, footnote, figure, caption, table).
// Used to write style rules for the page. In a window with another file it says so.
const page = doc.querySelector(".ProseMirror > .body > .pm-content");
if (!page) return "(no page)";

function facts(el) {
  const c = win.getComputedStyle(el), r = el.getBoundingClientRect();
  return "<" + el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\s+/g, ".") : "") + "> " +
    Math.round(r.width) + "x" + Math.round(r.height) + " font=" + c.fontSize + "/" + c.lineHeight + " " + c.fontWeight + " " +
    c.fontFamily.slice(0, 28) + " margin=" + c.marginTop + " " + c.marginBottom + " align=" + c.textAlign + " color=" + c.color +
    " display=" + c.display;
}
function tree(el, depth, max) {
  let out = "  ".repeat(depth) + facts(el) + (el.children.length === 0 ? "  \"" + el.textContent.slice(0, 40) + "\"" : "") + "\n";
  if (depth < max) { Array.from(el.children).slice(0, 6).forEach((c) => { out += tree(c, depth + 1, max); }); }
  return out;
}

const out = [];
const seen = {};
Array.from(page.children).forEach((child) => {
  const key = child.tagName + "." + child.className;
  if (seen[key]) { return; }
  seen[key] = true;
  out.push("BLOCK " + tree(child, 0, 3));
});
const marks = ["a", "code", "strong", "em", "img", "figure", "figcaption", "table", "th", "td", "blockquote", "li",
  "[class*=cite]", "[class*=footnote]", "[class*=caption]", "[class*=yaml]", "[class*=raw]", "[class*=math]", "[class*=attr]"];
marks.forEach((sel) => {
  const el = page.querySelector(sel);
  out.push("MARK " + sel + ": " + (el ? facts(el) + " parent=<" + el.parentElement.tagName.toLowerCase() + "." + el.parentElement.className + ">" : "(none)"));
});
return doc.title + "\n" + out.join("\n");
