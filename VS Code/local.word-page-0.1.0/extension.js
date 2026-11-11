// Word Page: write like in Word or Google Docs inside VS Code.
//
// The editor itself is Quarto's visual editor (add-on quarto.quarto): toolbar,
// headings, tables, footnotes, citations from a .bib file and from Zotero. This
// add-on adds three things:
//   1. a white page with black text in that editor, whatever the colour theme
//      (patch.js puts two small blocks into Quarto's editor files, and puts them
//      back after Quarto updates itself);
//   2. the command "Word Page: New Document": makes a .qmd file with the header
//      the editor needs and opens it as a page;
//   3. the first .qmd of a session also opens as a page (Quarto itself only does
//      that for the files opened after it has started).
"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const patch = require("./patch");

const VISUAL_EDITOR = "quarto.visualEditor";   // Quarto's name for its visual editor
const INJECT = path.join(__dirname, "inject");

function activate(context) {
  refresh(false);

  context.subscriptions.push(
    vscode.commands.registerCommand("wordPage.newDocument", newDocument),
    vscode.commands.registerCommand("wordPage.openAsPage", openAsPage),
    vscode.commands.registerCommand("wordPage.putBack", () => refresh(true)),
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
  const options = { pageWidth: config.get("pageWidth", 820) };
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

function deactivate() {}

module.exports = { activate, deactivate };
