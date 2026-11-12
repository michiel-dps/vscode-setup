// The blocks made with ::: name ... ::: (for example ::: landscape): which classes the
// page gives them, how wide they are, and the pictures inside them.
const page = doc.querySelector(".ProseMirror > .body > .pm-content");
if (!page) return "(no page)";
const out = [];
const pr = page.getBoundingClientRect();
out.push("page [" + Math.round(pr.left) + " .. " + Math.round(pr.right) + "] width " + Math.round(pr.width) + ", window " + win.innerWidth);
Array.from(page.querySelectorAll("div.pm-div")).forEach((div) => {
  const r = div.getBoundingClientRect();
  const c = win.getComputedStyle(div);
  out.push("DIV class=" + JSON.stringify(div.className) + " attrs=" +
    JSON.stringify(Array.from(div.attributes).filter((a) => a.name !== "class").map((a) => a.name + "=" + a.value).join(" ")) +
    " box [" + Math.round(r.left) + " .. " + Math.round(r.right) + "] " + Math.round(r.width) + "x" + Math.round(r.height) +
    " padding=" + c.padding + " margin=" + c.margin + " border=" + c.borderTopWidth + " bg=" + c.backgroundColor);
  Array.from(div.children).slice(0, 4).forEach((child) => {
    const cr = child.getBoundingClientRect();
    out.push("   child <" + child.tagName.toLowerCase() + "." + String(child.className).slice(0, 70) + "> " + Math.round(cr.width) + "x" + Math.round(cr.height));
  });
  const img = div.querySelector("img");
  if (img) {
    const ir = img.getBoundingClientRect();
    out.push("   img style=" + JSON.stringify(img.getAttribute("style")) + " box " + Math.round(ir.width) + "x" + Math.round(ir.height) +
      " natural " + img.naturalWidth + "x" + img.naturalHeight);
  }
});
return out.join("\n");
