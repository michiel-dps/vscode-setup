// Word Page: write like in Word or Google Docs inside VS Code.
//
// The editor itself is Quarto's visual editor (add-on quarto.quarto): toolbar,
// headings, tables, footnotes, citations from a .bib file and from Zotero. This
// add-on adds four things:
//   1. a white page with black text in that editor, whatever the colour theme
//      (patch.js puts two small blocks into Quarto's editor files, and puts them
//      back after Quarto updates itself). Setting wordPage.look: "pdf" draws the
//      page as a paper's PDF (font, margins, headings), "word" as a Word page;
//   2. the command "Word Page: New Document": makes a .qmd file with the header
//      the editor needs and opens it as a page;
//   3. the first .qmd of a session also opens as a page (Quarto itself only does
//      that for the files opened after it has started);
//   4. Ctrl+Numpad5 on a page puts a reference to the highlighted text into the
//      Claude chat box (mention.js finds its lines in the .qmd file).
"use strict";
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const patch = require("./patch");
const mention = require("./mention");

const VISUAL_EDITOR = "quarto.visualEditor";   // Quarto's name for its visual editor
const INJECT = path.join(__dirname, "inject");
const LOG = path.join(os.tmpdir(), "word-page.log");   // one line per Ctrl+Numpad5 on a page

function activate(context) {
  refresh(false);

  context.subscriptions.push(
    vscode.commands.registerCommand("wordPage.newDocument", newDocument),
    vscode.commands.registerCommand("wordPage.openAsPage", openAsPage),
    vscode.commands.registerCommand("wordPage.putBack", () => refresh(true)),
    vscode.commands.registerCommand("wordPage.selectionToClaude", selectionToClaude),
    // Quarto was updated or installed: its new files do not have the page yet
    vscode.extensions.onDidChange(() => refresh(false)),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("wordPage")) { refresh(true); }
    }),
    vscode.window.tabGroups.onDidChangeTabs((change) => { openFirstPage(change.opened); })
  );
}

// ---- 3. the first .qmd of a session ---------------------------------------------

// A .qmd with "editor: visual" in its header opens as a page: Quarto does that, but
// only while it runs. Opening the first .qmd is what starts Quarto, so that file
// was opened as plain text before Quarto could look. This does it for that file.
async function openFirstPage(openedTabs) {
  const quarto = vscode.extensions.getExtension("quarto.quarto");
  if (!quarto || quarto.isActive) { return; }        // Quarto runs: it does this itself
  for (const tab of openedTabs) {
    if (!(tab.input instanceof vscode.TabInputText)) { continue; }
    const uri = tab.input.uri;
    if (uri.scheme !== "file" || !/\.qmd$/i.test(uri.fsPath) || !asksForVisual(uri.fsPath)) { continue; }
    try {
      await quarto.activate();
      // the tab as it is now (the user may have closed or changed it in the meantime)
      const now = findTextTab(uri);
      if (!now) { return; }
      const column = now.group.viewColumn;
      await vscode.window.tabGroups.close(now, true);
      await vscode.commands.executeCommand("vscode.openWith", uri, VISUAL_EDITOR, { viewColumn: column, preview: false });
    } catch (err) {
      // the file stays open as text: Ctrl+Shift+F4 still switches by hand
    }
    return;
  }
}

function findTextTab(uri) {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString() && !tab.isDirty) {
        return tab;
      }
    }
  }
  return undefined;
}

// Does the header of the file (between the first two --- lines) say "editor: visual"?
function asksForVisual(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8").slice(0, 4000);
  } catch (err) {
    return false;
  }
  const header = /^﻿?---\r?\n([\s\S]*?)\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(text);
  if (!header) { return false; }
  return /^editor:[ \t]+visual[ \t]*$/m.test(header[1]) || /^[ \t]+mode:[ \t]+visual[ \t]*$/m.test(header[1]);
}

// ---- 1. the white page -------------------------------------------------------

// Every Quarto folder that should have the page: the one VS Code runs now, and a
// newer one that an update has just put next to it (used after the next restart).
function quartoFolders() {
  const folders = [];
  const running = vscode.extensions.getExtension("quarto.quarto");
  if (running) {
    folders.push(running.extensionPath);
    const newest = patch.findQuarto(path.dirname(running.extensionPath));
    if (newest && newest.toLowerCase() !== running.extensionPath.toLowerCase()) { folders.push(newest); }
  }
  return folders;
}

// Put the page in (setting wordPage.enabled on) or take it out (off).
// tell: also say so when nothing had to change.
function refresh(tell) {
  const config = vscode.workspace.getConfiguration("wordPage");
  const enabled = config.get("enabled", true);
  const options = { pageWidth: config.get("pageWidth", 820), look: config.get("look", "pdf") };
  const folders = quartoFolders();
  if (folders.length === 0) {
    if (tell) { vscode.window.showWarningMessage("Word Page: the Quarto add-on (quarto.quarto) is not installed, so there is no visual editor."); }
    return;
  }
  let changed = false;
  try {
    for (const folder of folders) {
      const result = enabled ? patch.apply(folder, INJECT, options) : patch.remove(folder);
      if (result === "applied" || result === "removed") { changed = true; }
    }
  } catch (err) {
    vscode.window.showErrorMessage("Word Page: could not change Quarto's editor files. " + (err && err.message ? err.message : err));
    return;
  }
  if (changed && pageIsOpen()) {
    vscode.window.showInformationMessage("Word Page: the page look changed. Close the document tab and open it again to see it.");
  } else if (tell) {
    vscode.window.showInformationMessage(enabled ? "Word Page: the white page is on." : "Word Page: the white page is off.");
  }
}

function pageIsOpen() {
  return vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) =>
    tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VISUAL_EDITOR));
}

// ---- 2. the commands -----------------------------------------------------------

// The folder for a new document: the folder that was right-clicked, else the
// folder of the open file, else the workspace folder, else ask.
async function pickFolder(clicked) {
  if (clicked && clicked.fsPath) {
    try {
      return fs.statSync(clicked.fsPath).isDirectory() ? clicked.fsPath : path.dirname(clicked.fsPath);
    } catch (err) { /* fall through */ }
  }
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const open = tab && tab.input && tab.input.uri;
  if (open && open.scheme === "file") { return path.dirname(open.fsPath); }
  const workspace = vscode.workspace.workspaceFolders;
  if (workspace && workspace.length > 0) { return workspace[0].uri.fsPath; }
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Put the document here"
  });
  return picked && picked.length > 0 ? picked[0].fsPath : "";
}

async function newDocument(clicked) {
  const folder = await pickFolder(clicked);
  if (!folder) { return; }

  const name = await vscode.window.showInputBox({
    title: "New document",
    prompt: "Name of the document. It is saved as a .qmd file in the folder " + path.basename(folder) + ".",
    value: "draft",
    validateInput: (text) => {
      const clean = text.trim().replace(/\.qmd$/i, "");
      if (clean === "") { return "Type a name."; }
      if (/[\\/:*?"<>|]/.test(clean)) { return 'A file name cannot have \\ / : * ? " < > |'; }
      if (fs.existsSync(path.join(folder, clean + ".qmd"))) { return clean + ".qmd is already there. Pick another name."; }
      return null;
    }
  });
  if (name === undefined) { return; }
  const clean = name.trim().replace(/\.qmd$/i, "");
  const file = path.join(folder, clean + ".qmd");

  // a .bib file in the same folder becomes the document's list of sources
  const bibFiles = fs.readdirSync(folder).filter((entry) => entry.toLowerCase().endsWith(".bib")).sort();
  const header = ["---", 'title: "' + clean.replace(/"/g, '\\"') + '"', "editor: visual"];
  if (bibFiles.length > 0) { header.push("bibliography: " + bibFiles[0]); }
  header.push("---", "", "");

  fs.writeFileSync(file, header.join("\n"), { encoding: "utf8", flag: "wx" });   // wx: never overwrite
  await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(file), VISUAL_EDITOR);
}

async function openAsPage(clicked) {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const uri = clicked || (tab && tab.input && tab.input.uri);
  if (!uri || !/\.(qmd|md)$/i.test(uri.fsPath)) {
    vscode.window.showWarningMessage("Word Page: open or right-click a .qmd or .md file first.");
    return;
  }
  await vscode.commands.executeCommand("vscode.openWith", uri, VISUAL_EDITOR);
}

// ---- 4. highlighted text for Claude --------------------------------------------

// For a selection in a normal file, Ctrl+Numpad5 lets the Claude add-on type
// "@file#lines" into its chat box. VS Code cannot see what is highlighted on a
// page, so here the text travels over the clipboard:
//   1. copy what is highlighted; the script block on the page answers with the
//      text and the words around it (inject/word-page.template.js);
//   2. find the lines of that text in the .qmd file (mention.js);
//   3. go to the Claude chat box and paste the reference there;
//   4. put the clipboard back as it was (text only: a copied picture is lost).
// Nothing highlighted: the clipboard is not touched, the key only goes to the chat box.
const CLAUDE_PANEL = "claude-vscode.sidebar.open";
const PANEL_WAS_OPEN = 25;     // ms: going to a panel that is open takes about 5 ms, opening a closed one 40 or more
const PANEL_START = 3000;      // ms: time given to a chat box that has to start
let panelFirstOpened = 0;      // when this command first went to the panel in this window (0 = not yet)

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(text) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 200000) { fs.unlinkSync(LOG); }
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    fs.appendFileSync(LOG, stamp + "  " + text + "\n");
  } catch (err) { /* a log line is never worth an error */ }
}

// Wait until the clipboard holds the answer of the page; null when none comes.
async function answerOfPage(ms) {
  const until = Date.now() + ms;
  for (;;) {
    const picked = mention.readCopied(await vscode.env.clipboard.readText());
    if (picked) { return picked; }
    if (Date.now() >= until) { return null; }
    await pause(15);
  }
}

async function selectionToClaude() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const onPage = tab && tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VISUAL_EDITOR;
  if (!onPage) {
    await vscode.commands.executeCommand(CLAUDE_PANEL);
    return;
  }
  const clipboard = vscode.env.clipboard;
  const uri = tab.input.uri;
  const started = Date.now();
  let old = await clipboard.readText();
  if (mention.readCopied(old)) {       // an answer left over from an earlier press
    old = "";
    await clipboard.writeText("");
  }

  try {
    // 1. copy; the page answers on the clipboard
    await vscode.commands.executeCommand("editor.action.clipboardCopyAction");
    let picked = await answerOfPage(300);
    if (!picked) {
      const now = await clipboard.readText();
      if (now !== old) {
        // a plain copy came back: this page was opened before the add-on could answer
        await clipboard.writeText(old);
        vscode.window.showInformationMessage("Word Page: close this document tab and open it again. After that, Ctrl+Numpad5 takes the highlighted text along to Claude.");
        log("claude: plain copy, the page has no answer block yet");
      }
      if (panelFirstOpened === 0) { panelFirstOpened = Date.now(); }
      await vscode.commands.executeCommand(CLAUDE_PANEL);
      picked = await answerOfPage(2500);     // a busy laptop: the answer can still come
      if (!picked) {
        if (now === old) { log("claude: nothing highlighted"); }
        return;
      }
    }
    const copyTime = Date.now() - started;

    // 2. the lines in the file
    let lines = null;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      // Claude reads the file on disk, so the line numbers must be those of the saved file
      if (document.isDirty) { await document.save(); }
      lines = mention.findLines(document.getText(), picked);
    } catch (err) { /* a reference without line numbers */ }
    const reference = mention.buildMention(vscode.workspace.asRelativePath(uri, false), lines, picked.text);

    // 3. paste it into the chat box
    try {
      await clipboard.writeText(reference);
      const opening = Date.now();
      await vscode.commands.executeCommand(CLAUDE_PANEL);
      const panelTime = Date.now() - opening;
      const loaded = panelTime < PANEL_WAS_OPEN || (panelFirstOpened > 0 && opening - panelFirstOpened > PANEL_START);
      if (panelFirstOpened === 0) { panelFirstOpened = opening; }
      if (!loaded) {
        // The panel was closed, and maybe never open in this window. Then the chat box
        // has to start first, and does not take the keyboard by itself: wait, ask again.
        await pause(PANEL_START);
        await vscode.commands.executeCommand(CLAUDE_PANEL);
      }
      await pause(150);                      // the chat box takes the keyboard a moment after its panel
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      await pause(300);                      // the paste reads the clipboard a moment later
      log("claude: " + (lines ? "lines " + lines.first + "-" + lines.last : "no lines found") +
        ", pasted " + JSON.stringify(reference) + " (copy " + copyTime + " ms, panel " + panelTime + " ms" +
        (loaded ? "" : ", waited for the chat box to start") + ")");
    } finally {
      await clipboard.writeText(old);        // 4.
    }
  } catch (err) {
    log("claude: error " + (err && err.message ? err.message : err));
    vscode.window.showWarningMessage("Word Page: could not send the highlighted text to Claude. " + (err && err.message ? err.message : err));
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
