// The title block on the page, measured: the foot of the letters of each part, in points from the
// top of the column of text, next to the numbers of the term paper's PDF (inject/pdf-look.css).
// Also the last line of the abstract and the first section heading (12 Nov 2026).
const content = doc.querySelector(".ProseMirror > .body > .pm-content");
const cs = win.getComputedStyle(content);
const pt = parseFloat(cs.fontSize) / 10.91;
const textTop = content.getBoundingClientRect().top + parseFloat(cs.paddingTop);
const canvas = doc.createElement("canvas").getContext("2d");
function base(el) {
  // baseline of the first line of el: top of a one-letter range + font ascent
  const walker = doc.createTreeWalker(el, 4); let n; while ((n = walker.nextNode()) && !n.nodeValue.trim()) {}
  if (!n) return null;
  const i = n.nodeValue.search(/\S/);
  const r = doc.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
  const rect = r.getClientRects()[0];
  const c = win.getComputedStyle(n.parentElement);
  canvas.font = c.fontStyle + " " + c.fontWeight + " " + c.fontSize + " " + c.fontFamily;
  return (rect.top + canvas.measureText("x").fontBoundingBoxAscent - textTop) / pt;
}
function lastBase(el) {
  const walker = doc.createTreeWalker(el, 4); let n, last = null; while ((n = walker.nextNode())) { if (n.nodeValue.trim()) last = n; }
  const r = doc.createRange(); const j = last.nodeValue.trimEnd().length - 1; r.setStart(last, j); r.setEnd(last, j + 1);
  const rect = r.getClientRects()[0]; const c = win.getComputedStyle(last.parentElement);
  canvas.font = c.fontStyle + " " + c.fontWeight + " " + c.fontSize + " " + c.fontFamily;
  return (rect.top + canvas.measureText("x").fontBoundingBoxAscent - textTop) / pt;
}
const face = content.querySelector(".wp-title-block");
const box = face.parentElement;
const out = ["pt=" + pt.toFixed(3) + " face width " + (face.getBoundingClientRect().width / pt).toFixed(1) + "pt, box " + (box.getBoundingClientRect().width / pt).toFixed(1) + " box top " + ((box.getBoundingClientRect().top - textTop)/pt).toFixed(1)];
out.push("box classes: " + box.className + " | cm-editor: " + win.getComputedStyle(box.querySelector(".cm-editor")).outline + " h=" + box.querySelector(".cm-editor").getBoundingClientRect().height + " border " + win.getComputedStyle(box).borderTop + " margin " + win.getComputedStyle(box).margin);
// the PDF of 11 Nov (room between paragraphs) and of 12 Nov 2026 ("indent: true", \parskip 0pt)
const indent = doc.documentElement.classList.contains("wp-indent");
const want = indent
  ? { "wp-title": 54.69, "wp-subtitle": 90.56, "wp-authors": 120.87, "wp-date": 145.33, "wp-abstract-title": 185.35, "wp-abstract": 204.02 }
  : { "wp-title": 54.69, "wp-subtitle": 96.36, "wp-authors": 132.48, "wp-date": 162.75, "wp-abstract-title": 202.38, "wp-abstract": 223.62 };
const wantLast = indent ? 299.67 : 319.26;
const wantH1 = indent ? 334.02 : 359.30;
Object.keys(want).forEach((k) => { const el = face.querySelector("." + k); const b = base(el); out.push(k.padEnd(18) + " page " + b.toFixed(2) + "  pdf " + want[k] + "  diff " + (want[k] - b).toFixed(2)); });
const t = face.querySelector(".wp-title"); out.push("title last line base " + lastBase(t).toFixed(2) + " pdf 76.61; title lines: " + (t.getBoundingClientRect().height / pt).toFixed(1) + "pt high");
const ab = face.querySelector(".wp-abstract"); out.push("abstract last base " + lastBase(ab).toFixed(2) + " pdf " + wantLast + " (the page has no broken words: it can be a line longer)");
const h1 = content.querySelector("h1.pm-heading"); out.push("first h1 base " + base(h1).toFixed(2) + " pdf " + wantH1 + "; abstract to h1: " + (base(h1) - lastBase(ab)).toFixed(2) + " pdf " + (wantH1 - wantLast).toFixed(2));
return out.join("\n");
