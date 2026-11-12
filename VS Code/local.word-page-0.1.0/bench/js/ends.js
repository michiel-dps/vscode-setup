// The page ends: for each page of the PDF (the data in word-page-pdf.css), which of its first lines
// the page finds in its own text, and where. Pages that start with a figure, a table made by R or
// the reference list are not found: those are not text on the page (12 Nov 2026).
const raw = win.getComputedStyle(doc.documentElement).getPropertyValue("--wp-pdf-pages").trim().replace(/^["']|["']$/g, "");
const bytes = Uint8Array.from(win.atob(raw), (c) => c.charCodeAt(0));
const docs = JSON.parse(new TextDecoder("utf-8").decode(bytes)).docs;
const plain = (t) => t.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const content = doc.querySelector(".ProseMirror > .body > .pm-content");
const walker = doc.createTreeWalker(content, 4, { acceptNode: (n) => n.parentElement && n.parentElement.closest(".pm-code-editor, .wp-face, figure") ? 2 : 1 });
let text = "";
while (walker.nextNode()) text += plain(walker.currentNode.nodeValue);
const out = ["letters on page: " + text.length];
let from = 0;
docs[0].pages.forEach((p) => {
  if (p.n === 1 || p.sideways) return;
  let hit = null;
  for (let k = 0; k < p.lines.length && !hit; k++) {
    const line = plain(p.lines[k]);
    if (line.length < 8) continue;
    for (const t of [line, line.slice(0, 40), line.slice(0, 22), line.slice(-24)]) {
      if (t.length < 8) continue;
      const at = text.indexOf(t, from);
      if (at >= 0 && at - from < 15000) { hit = { at, k, t }; break; }
    }
  }
  if (hit) { out.push("page " + p.n + ": found line " + hit.k + " at " + hit.at + " (" + hit.t.slice(0, 30) + ")"); from = hit.at + hit.t.length; }
  else out.push("page " + p.n + ": NOT FOUND, first lines: " + p.lines.slice(0, 4).join(" | ").slice(0, 200));
});
return out.join("\n");
