// The PDF look, measured: the distance from the last line of each block to the first line
// of the next one (baseline to baseline), in points of the PDF, to compare with the PDF
// itself (inject/pdf-look.css lists its numbers). Also the page and text width in points.
const page = doc.querySelector(".ProseMirror > .body > .pm-content");
if (!page) return "(no page)";
const pagePx = page.getBoundingClientRect().width;
const pt = parseFloat(win.getComputedStyle(page).fontSize) / 10.91;   // one PDF point in pixels (the text is 10.91 pt)
const canvas = doc.createElement("canvas").getContext("2d");

function textNodes(el) {
  const walker = doc.createTreeWalker(el, 4);                 // 4 = text nodes
  const nodes = [];
  while (walker.nextNode()) { if (walker.currentNode.nodeValue.trim() !== "") { nodes.push(walker.currentNode); } }
  return nodes;
}
// the baseline of one character: the top of its box plus the height of the font above the baseline
function baseline(node, offset) {
  const range = doc.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  const rect = range.getClientRects()[0];
  if (!rect) { return null; }
  const c = win.getComputedStyle(node.parentElement);
  canvas.font = c.fontStyle + " " + c.fontWeight + " " + c.fontSize + " " + c.fontFamily;
  return rect.top + canvas.measureText("x").fontBoundingBoxAscent;
}

const cs = win.getComputedStyle(page);
const out = ["page " + (pagePx / pt).toFixed(1) + " pt wide = " + pagePx.toFixed(0) + " px; text " +
  ((pagePx - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / pt).toFixed(1) + " pt wide; text size " +
  parseFloat(cs.fontSize).toFixed(2) + " px; margin " + parseFloat(cs.paddingLeft).toFixed(0) + " px; font " + cs.fontFamily.slice(0, 30) +
  "; fonts loaded: " + Array.from(doc.fonts).filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight + " " + f.style).join(", ")];
let before = null;
let rows = 0;
Array.from(page.children).forEach((block) => {
  const nodes = textNodes(block);
  if (nodes.length === 0 || rows > 60) { before = null; return; }
  const first = baseline(nodes[0], 0);
  const lastNode = nodes[nodes.length - 1];
  const last = baseline(lastNode, lastNode.nodeValue.length - 1);
  if (first === null || last === null) { before = null; return; }
  const tag = block.tagName.toLowerCase();
  const wanted = /^(h[1-6]|p)$/.test(tag);
  if (wanted) {
    const lineStep = tag === "p" && last - first > 1 ? " | lines " + (parseFloat(win.getComputedStyle(block).lineHeight) / pt).toFixed(2) + " apart" : "";
    out.push((before === null ? "      " : ((first - before.y) / pt).toFixed(1).padStart(5) + " ") + "pt after <" + (before ? before.tag : "-") + "> : <" + tag + "> " +
      JSON.stringify(block.textContent.slice(0, 34)) + lineStep);
    rows++;
  }
  before = wanted ? { y: last, tag: tag } : null;
});
return out.join("\n");
