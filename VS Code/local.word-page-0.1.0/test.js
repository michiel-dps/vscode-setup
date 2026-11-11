// Offline checks for patch.js (no VS Code needed). Run with VS Code's own node:
//   $env:ELECTRON_RUN_AS_NODE = "1"; & "<VS Code>\Code.exe" test.js
// It works on a made-up Quarto folder in the temp folder; nothing real is touched.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const patch = require("./patch");

let passed = 0;
let failed = 0;
function check(what, ok) {
  if (ok) { passed++; } else { failed++; console.log("FAIL: " + what); }
}

const inject = path.join(__dirname, "inject");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "word-page-test-"));

function makeQuarto(version) {
  const dir = path.join(temp, "quarto.quarto-" + version, "assets", "www", "editor");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.js"), "(function(e,t){/* quarto " + version + " */})(this);\n");
  fs.writeFileSync(path.join(dir, "style.css"), ".ProseMirror{position:relative}\n");
  return path.join(temp, "quarto.quarto-" + version);
}

const old = makeQuarto("1.139.0");
const newer = makeQuarto("1.140.2");
makeQuarto("1.99.0");
fs.mkdirSync(path.join(temp, "other.addon-1.0.0"));
const options = { pageWidth: 820 };
const files = patch.editorFiles(old);
const jsBefore = fs.readFileSync(files.js, "utf8");
const cssBefore = fs.readFileSync(files.css, "utf8");

// finding Quarto
check("newest Quarto folder is found (1.140.2, not 1.99.0)", patch.findQuarto(temp) === newer);
check("no Quarto folder gives an empty answer", patch.findQuarto(path.join(temp, "other.addon-1.0.0")) === "");
check("a missing folder gives an empty answer", patch.findQuarto(path.join(temp, "nope")) === "");

// the blocks
const blocks = patch.buildBlocks(inject, options);
check("script block starts with the start mark", blocks.js.startsWith(patch.START));
check("script block ends with the end mark", blocks.js.trimEnd().endsWith(patch.END));
check("style block starts with the start mark", blocks.css.startsWith(patch.START));
check("script block has no placeholder left", !/\/\*(LIGHT|DROP|OPTIONS)\*\//.test(blocks.js));
check("script block is valid JavaScript", (() => { try { new Function(blocks.js); return true; } catch (e) { console.log(e.message); return false; } })());
check("script block holds the light background colour", blocks.js.includes('"--vscode-editor-background":"#ffffff"'));
check("script block holds no font settings", !blocks.js.includes("--vscode-font-family") && !blocks.js.includes("--vscode-editor-font-size"));
check("page width goes into the script block", patch.buildBlocks(inject, { pageWidth: 700 }).js.includes('"pageWidth":700'));

// apply
check("state before: none", patch.state(old, inject, options) === "none");
check("first apply: applied", patch.apply(old, inject, options) === "applied");
check("state after: applied", patch.state(old, inject, options) === "applied");
check("index.js = block + original", fs.readFileSync(files.js, "utf8") === blocks.js + jsBefore);
check("style.css = original + line break + block", fs.readFileSync(files.css, "utf8") === cssBefore + "\n" + blocks.css);
check("second apply: already", patch.apply(old, inject, options) === "already");
check("second apply changed nothing", fs.readFileSync(files.js, "utf8") === blocks.js + jsBefore);
check("no temp file left behind", !fs.existsSync(files.js + ".word-page-tmp") && !fs.existsSync(files.css + ".word-page-tmp"));

// another page width replaces the block, it does not stack
check("other width: applied", patch.apply(old, inject, { pageWidth: 700 }) === "applied");
check("state for the old width: other", patch.state(old, inject, options) === "other");
const jsWide = fs.readFileSync(files.js, "utf8");
check("only one script block in the file", jsWide.split(patch.START).length === 2);
check("only one style block in the file", fs.readFileSync(files.css, "utf8").split(patch.START).length === 2);
check("original script still follows the block", jsWide.endsWith(jsBefore));

// remove
check("remove: removed", patch.remove(old) === "removed");
check("index.js is the original again", fs.readFileSync(files.js, "utf8") === jsBefore);
check("style.css is the original again", fs.readFileSync(files.css, "utf8") === cssBefore);
check("second remove: clean", patch.remove(old) === "clean");

// a style file without a last line break comes back without one
fs.writeFileSync(files.css, ".a{color:red}");
patch.apply(old, inject, options);
check("block starts on its own line", fs.readFileSync(files.css, "utf8") === ".a{color:red}\n" + blocks.css);
patch.remove(old);
check("remove gives back the exact file (no line break added)", fs.readFileSync(files.css, "utf8") === ".a{color:red}");

// Windows line endings in Quarto's files stay as they are
fs.writeFileSync(files.css, ".a{color:red}\r\n.b{color:blue}\r\n");
patch.apply(old, inject, options);
check("applied on a file with Windows line endings", patch.state(old, inject, options) === "applied");
patch.remove(old);
check("Windows line endings are kept", fs.readFileSync(files.css, "utf8") === ".a{color:red}\r\n.b{color:blue}\r\n");

// strip
check("strip leaves other text alone", patch.strip("abc") === "abc");
check("strip takes out a block at the start and one at the end",
  patch.strip(patch.START + " x */\nfoo\n" + patch.END + "\nmiddle\n" + "\n" + patch.START + " y */" + patch.END + "\n") === "middle\n");
check("strip refuses a block without end", (() => { try { patch.strip(patch.START + " x */ foo"); return false; } catch (e) { return true; } })());

fs.rmSync(temp, { recursive: true, force: true });
console.log(passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
