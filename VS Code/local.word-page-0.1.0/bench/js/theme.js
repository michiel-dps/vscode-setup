// The style rules that Quarto writes itself when the page starts (colours, fonts, the room
// left and right of the page), which classes the page boxes carry, where a picture gets its
// width, and whether this VS Code can break words at the end of a line (hyphens).
const page = doc.querySelector(".ProseMirror > .body > .pm-content");
if (!page) return "(no page)";
const out = [];
["pm-editor-theme-styles-id", "pm-editor-padding-styles-id"].forEach((id) => {
  const tag = doc.getElementById(id);
  out.push("STYLE TAG " + id + ":\n" + (tag ? tag.textContent.replace(/\s+/g, " ").replace(/\}/g, "}\n").slice(0, 5000) : "(none)"));
});
out.push("html: class=" + doc.documentElement.className + " lang=" + JSON.stringify(doc.documentElement.lang));
out.push(".ProseMirror: class=" + doc.querySelector(".ProseMirror").className);
out.push(".body: class=" + page.parentElement.className);
out.push(".pm-content: class=" + page.className + " lang=" + JSON.stringify(page.lang));
Array.from(page.querySelectorAll("figure")).slice(0, 5).forEach((f) => {
  const img = f.querySelector("img");
  out.push("FIGURE style=" + JSON.stringify(f.getAttribute("style")) + " box=" + Math.round(f.getBoundingClientRect().width) + "x" +
    Math.round(f.getBoundingClientRect().height) + " | img style=" + JSON.stringify(img && img.getAttribute("style")) +
    " natural=" + (img ? img.naturalWidth + "x" + img.naturalHeight : "") + " src=" + (img ? String(img.src).slice(-60) : ""));
});
// hyphens: a narrow box with one long word; more than one line = the word was broken
const box = doc.createElement("div");
box.lang = "en";
box.style.cssText = "position:absolute;visibility:hidden;width:6em;hyphens:auto;font-size:16px;line-height:20px;white-space:normal";
box.textContent = "extraordinarily internationalisation";
doc.body.appendChild(box);
out.push("hyphens: box height " + box.getBoundingClientRect().height + " px (40 = two lines, no word broken; more = words are broken)");
box.remove();
return out.join("\n");
