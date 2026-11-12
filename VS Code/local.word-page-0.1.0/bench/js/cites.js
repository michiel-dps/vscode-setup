// Citations on the page: how many there are, and which are still shown as @key (no author and
// year from the PDF for them: cited after the last build, or a key the PDF links differently).
const ids = Array.from(doc.querySelectorAll(".pm-content .cite .cite-id"));
const raw = ids.filter((e) => parseFloat(win.getComputedStyle(e).fontSize) > 0).map((e) => e.textContent);
return ids.length + " citation keys on the page, still shown as @key: " + (raw.length ? raw.join(", ") : "none");
