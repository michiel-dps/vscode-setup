// In the workbench page: is the open tab the Quarto visual editor or the plain text editor?
const label = (document.querySelector(".editor-group-container .title .label-name") || {}).textContent;
const overlay = Array.from(document.querySelectorAll("[class*=webview-overlay]")).some((e) => e.getBoundingClientRect().height > 100);
const monaco = !!document.querySelector(".editor-instance .monaco-editor");
return (label || "?") + " -> " + (overlay ? "WORD-LIKE VIEW (visual editor)" : (monaco ? "plain text editor" : "unknown"));
