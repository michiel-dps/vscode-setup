// Layout facts: computed styles of the main boxes, and the style rules that set widths/colours
function cs(sel, el) {
  el = el || doc.querySelector(sel);
  if (!el) return sel + ": (none)";
  const c = win.getComputedStyle(el), r = el.getBoundingClientRect();
  return sel + " [" + Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height) + "] display=" + c.display +
    " pos=" + c.position + " overflow=" + c.overflowY + " maxW=" + c.maxWidth + " margin=" + c.margin + " padding=" + c.padding +
    " bg=" + c.backgroundColor + " color=" + c.color + " font=" + c.fontSize + "/" + c.lineHeight + " " + c.fontFamily.slice(0, 60);
}
const out = [];
out.push(cs("body"));
out.push(cs("#root"));
out.push(cs("[class*=_editorParent_]"));
out.push(cs(".fui-Toolbar"));
out.push(cs("#editor"));
out.push(cs(".ProseMirror"));
out.push(cs(".ProseMirror > .body"));
const body = doc.querySelector(".ProseMirror > .body");
Array.from(body.children).slice(0, 6).forEach((c, i) => out.push(cs("body-child-" + i + " <" + c.tagName.toLowerCase() + "." + String(c.className).slice(0, 40) + ">", c)));
out.push(cs(".ProseMirror > .notes"));
// style rules that mention max-width or the editing root
const rules = [];
for (const sheet of Array.from(doc.styleSheets)) {
  let list;
  try { list = sheet.cssRules; } catch (e) { continue; }
  for (const rule of Array.from(list)) {
    const t = rule.cssText || "";
    if (/max-width|\.ProseMirror\s*\{|\.pm-background-color|\.pm-text-color\s*\{|_editorFrame_|\.body\s*[>{]|pm-proportional-font/.test(t) && t.length < 600) {
      rules.push((sheet.href ? "[file] " : "[inline] ") + t.replace(/\s+/g, " "));
    }
  }
}
return out.join("\n") + "\n\nRULES (" + rules.length + "):\n" + rules.slice(0, 45).join("\n") +
  "\n\nSTYLE TAGS: " + Array.from(doc.querySelectorAll("style")).map((s) => (s.id || "-") + ":" + s.textContent.length).join(", ");
