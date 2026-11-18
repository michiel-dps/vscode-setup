// Word Page: write like in Word or Google Docs inside VS Code.
//
// The editor itself is Quarto's visual editor (add-on quarto.quarto): toolbar,
// headings, tables, footnotes, citations from a .bib file and from Zotero. This
// add-on adds five things:
//   1. a white page with black text in that editor, whatever the colour theme
//      (patch.js puts two small blocks into Quarto's editor files, and puts them
//      back after Quarto updates itself). Setting wordPage.look: "pdf" draws the
//      page as a paper's PDF (font, margins, numbered headings, the title block,
//      code folded away), "word" as a Word page;
//   2. the command "Word Page: New Document": makes a .qmd file with the header
//      the editor needs and opens it as a page;
//   3. the first .qmd of a session also opens as a page (Quarto itself only does
//      that for the files opened after it has started);
//   4. Ctrl+Numpad5 on a page puts a reference to the highlighted text into the
//      Claude chat box (mention.js finds its lines in the .qmd file). Ctrl+Numpad1
//      does the same into a Claude chat in an editor tab (18 Nov 2026);
//   5. the page ends of the PDF on the page: each time the PDF next to an open page
//      changes, pdfpages.py reads where its pages start, and the page draws a
//      dashed line there;
//   6. typing marks: when the user last typed in each .qmd, so a Claude chat waits
//      before it writes into a file he is typing in (typing.js, review.py);
//   7. when a program wrote the file at the moment VS Code had unsaved text ("the
//      content of the file is newer"): both are merged and VS Code reads it back.
"use strict";
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const patch = require("./patch");
const mention = require("./mention");
const typing = require("./typing");

const VISUAL_EDITOR = "quarto.visualEditor";   // Quarto's name for its visual editor
const INJECT = path.join(__dirname, "inject");
const LOG = path.join(os.tmpdir(), "word-page.log");   // one line per Ctrl+Numpad5 on a page, and per PDF read

function activate(context) {
  refresh(false);
  watchPdfs(context);
  watchTyping(context);
  watchClashes(context);
  // Claude's suggestions on the page, like Grammarly (assistant.js, 16 Nov 2026)
  require("./assistant").activate(context, { log: log, quartoFolders: quartoFolders, patch: patch });

  context.subscriptions.push(
    vscode.commands.registerCommand("wordPage.newDocument", newDocument),
    vscode.commands.registerCommand("wordPage.openAsPage", openAsPage),
    vscode.commands.registerCommand("wordPage.openAsText", openAsText),
    vscode.commands.registerCommand("wordPage.reloadPage", reloadPage),
    vscode.commands.registerCommand("wordPage.putBack", () => refresh(true)),
    vscode.commands.registerCommand("wordPage.selectionToClaude", selectionToClaude),
    vscode.commands.registerCommand("wordPage.browserToClaude", browserToClaude),
    vscode.commands.registerCommand("wordPage.chatSelectionToClaude", chatSelectionToClaude),
    vscode.commands.registerCommand("wordPage.editorSelectionToClaude", editorSelectionToClaude),
    vscode.commands.registerCommand("wordPage.toClaudeTab", () => goToChat("tab")),
    // which Claude chat tab was used last (Ctrl+Numpad1 picks that one first)
    vscode.window.tabGroups.onDidChangeTabs((change) => { noteChatTabs([...change.opened, ...change.changed]); }),
    vscode.window.tabGroups.onDidChangeTabGroups((change) => { noteChatTabs(change.changed.map((group) => group.activeTab).filter(Boolean)); }),
    // Quarto was updated or installed: its new files do not have the page yet
    vscode.extensions.onDidChange(() => refresh(false)),
    vscode.workspace.onDidChangeConfiguration((change) => {
      // the assistant's settings do not change the page itself (assistant.js follows them)
      const assistantOnly = ["wordPage.assistant", "wordPage.assistantReadAll", "wordPage.assistantModel", "wordPage.claudePath"].some((name) => change.affectsConfiguration(name));
      if (change.affectsConfiguration("wordPage") && !assistantOnly) { refresh(true); }
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
  const options = {
    pageWidth: config.get("pageWidth", 820), look: config.get("look", "pdf"),
    fold: config.get("foldCode", true), pageEnds: config.get("pageEnds", true), fromPdf: config.get("fromPdf", true)
  };
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
  // no "editor: visual": with it Quarto throws you back to the page when you switch to the text
  // (16 Nov 2026); "*.qmd": "quarto.visualEditor" in settings.json opens it as a page instead
  const header = ["---", 'title: "' + clean.replace(/"/g, '\\"') + '"'];
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

// Reload the page (16 Nov 2026, asked: "reload the qmd file because i just reran code to fix an
// image but its still showing the broken one"). A page keeps every picture it loaded when it
// opened; a page that is opened again reads them all from disk. So: save, close, open again in
// the same place. The round arrow in the page's tab bar, or "Word Page: Reload Page".
function pageTabOf(uri) {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VISUAL_EDITOR &&
          tab.input.uri.toString() === uri.toString()) { return tab; }
    }
  }
  return undefined;
}

async function reloadPage(clicked) {
  const active = vscode.window.tabGroups.activeTabGroup.activeTab;
  const uri = clicked && clicked.fsPath ? clicked : (active && active.input && active.input.uri);
  if (!uri || !pageTabOf(uri)) {
    vscode.window.showWarningMessage("Word Page: open the page you want to reload first.");
    return;
  }
  if (pageTabOf(uri).isDirty) { await vscode.workspace.save(uri); }
  const tab = pageTabOf(uri);                      // the tab as it is after saving
  if (!tab || tab.isDirty) {
    vscode.window.showWarningMessage("Word Page: the page could not be saved, so it was not reloaded.");
    return;
  }
  const column = tab.group.viewColumn;
  await vscode.window.tabGroups.close(tab, true);
  await vscode.commands.executeCommand("vscode.openWith", uri, VISUAL_EDITOR, { viewColumn: column, preview: false });
  log("reload: " + path.basename(uri.fsPath) + " opened again (pictures read from disk)");
}

// The plain markdown text of a page (12 Nov 2026, asked: "the text editor function doesn't
// work anymore for the quarto file"). Quarto opens a .qmd whose header says "editor: visual"
// as a page every time, also after "Reopen Editor With > Text Editor" or "Open With > Text
// Editor": it closes the text tab and opens the page again (checked in Quarto's main.js).
// Only Quarto's own command "Edit in Source Mode" (Ctrl+Shift+F4 on the page) is let
// through. This command uses it for any .qmd: it opens the file as a page first when it is
// not one yet, and switches it to the text as soon as the page has started.
function textTabOf(uri) {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) { return tab; }
    }
  }
  return undefined;
}

async function openAsText(clicked) {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const uri = clicked && clicked.fsPath ? clicked : (tab && tab.input && tab.input.uri);
  if (!uri || !/\.(qmd|md)$/i.test(uri.fsPath)) {
    vscode.window.showWarningMessage("Word Page: open or right-click a .qmd or .md file first.");
    return;
  }
  const open = textTabOf(uri);
  if (open) {
    await vscode.window.showTextDocument(uri, { viewColumn: open.group.viewColumn, preview: false });
    return;
  }
  const pageWasOpen = vscode.window.tabGroups.all.some((group) => group.tabs.some((t) =>
    t.input instanceof vscode.TabInputCustom && t.input.viewType === VISUAL_EDITOR && t.input.uri.toString() === uri.toString()));
  await vscode.commands.executeCommand("vscode.openWith", uri, VISUAL_EDITOR, { preview: false });
  // A page that has just been opened needs a moment to start before Quarto can switch it.
  await pause(pageWasOpen ? 200 : 1500);
  // Quarto's switch saves the file, closes the page and opens the text. Ask it once, and wait:
  // asking again while it is busy closes the new text again (tested 12 Nov 2026).
  for (let tries = 0; tries < 4; tries++) {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    log("text: try " + (tries + 1) + " for " + path.basename(uri.fsPath) + " (page was open: " + pageWasOpen +
      ", active tab: " + (active ? active.label + " " + (active.input && active.input.viewType ? active.input.viewType : "text") : "none") + ")");
    await vscode.commands.executeCommand("quarto.editInSourceMode");
    for (let wait = 0; wait < 12; wait++) {
      await pause(250);
      if (textTabOf(uri)) {
        log("text: " + path.basename(uri.fsPath) + " is open as text");
        return;
      }
    }
  }
  log("text: " + path.basename(uri.fsPath) + " did not switch to the text");
  vscode.window.showWarningMessage("Word Page: the page did not switch to the text. Press Ctrl+Shift+F4 on the page.");
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

// ---- where the text goes: the side panel or a chat tab (18 Nov 2026) ----------------
// Ctrl+Numpad5 = the Claude side panel, never a chat tab. Ctrl+Numpad1 = a Claude chat
// in an editor tab, never the side panel. The keys pass { "target": "tab" } for the
// tab (keybindings.json). Which tab, in this order:
//   1. a chat tab in front in ANOTHER editor window than the one with the keyboard
//   2. a chat tab in front in this editor window (the keyboard is in that chat)
//   3. a chat tab behind another tab in another editor window (brought to the front)
//   4. a chat tab behind the file in this editor window (brought to the front)
//   5. none: a new chat tab, in another editor window (or a new one beside this one)
// Several in the same step: the one used last.
const CLAUDE_TAB = "claudeVSCodePanel";     // part of the view type of a Claude chat tab
const FOCUS_GROUP = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]
  .map((n) => "workbench.action.focus" + n + "EditorGroup");
const chatTabUsed = new Map();   // "column|title" of a chat tab -> when it last had the keyboard

function targetOf(args) {
  return args && args.target === "tab" ? "tab" : "panel";
}

function isChatTab(tab) {
  return tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes(CLAUDE_TAB);
}

function tabKey(tab) {
  return tab.group.viewColumn + "|" + tab.label;
}

function noteChatTabs(tabs) {
  for (const tab of tabs) {
    if (isChatTab(tab) && tab.isActive && tab.group.isActive) { chatTabUsed.set(tabKey(tab), Date.now()); }
  }
}

function pickChatTab() {
  const here = vscode.window.tabGroups.activeTabGroup.viewColumn;
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs.filter(isChatTab));
  const steps = [
    ["in front in another editor window", (t) => t.isActive && t.group.viewColumn !== here],
    ["in front in this editor window", (t) => t.isActive && t.group.viewColumn === here],
    ["behind another tab in another editor window", (t) => !t.isActive && t.group.viewColumn !== here],
    ["behind the file in this editor window", (t) => !t.isActive && t.group.viewColumn === here],
  ];
  const lastUsed = (t) => chatTabUsed.get(tabKey(t)) || 0;
  for (const [why, fits] of steps) {
    const found = tabs.filter(fits).sort((a, b) => lastUsed(b) - lastUsed(a));
    if (found.length > 0) { return { tab: found[0], why: why }; }
  }
  return null;
}

// Bring a tab to the front of its editor window and give that window the keyboard
// (as the Claude add-on does itself for a tab it reopens).
async function focusTab(tab) {
  const focusGroup = FOCUS_GROUP[tab.group.viewColumn - 1];
  if (!focusGroup) { return false; }
  await vscode.commands.executeCommand(focusGroup);
  const group = vscode.window.tabGroups.all.find((g) => g.viewColumn === tab.group.viewColumn);
  // the tab itself, else the first chat tab with its title (two new chats are both "Claude Code")
  let index = group ? group.tabs.indexOf(tab) : -1;
  if (index < 0 && group) { index = group.tabs.findIndex((t) => isChatTab(t) && t.label === tab.label); }
  if (index < 0) { return false; }
  await vscode.commands.executeCommand("workbench.action.openEditorAtIndex", index);
  for (let waited = 0; waited < 1000; waited += 50) {
    if (group.tabs[index] && group.tabs[index].isActive) { return true; }
    await pause(50);
  }
  return false;
}

// Go to a Claude chat tab (never the side panel). Returns words for the log; they
// start with "new" when the tab was just made. A new tab gets `text` as its first
// text: Claude puts it into the chat box once the box has started (setInputText,
// it is not sent), so nothing has to be pasted and no start time guessed.
async function goToChatTab(text) {
  const picked = pickChatTab();
  if (picked) {
    const ok = await focusTab(picked.tab);
    noteChatTabs([picked.tab]);
    return "tab \"" + picked.tab.label + "\" (" + picked.why + ")" + (ok ? "" : ", NOT brought to the front");
  }
  // no chat tab: a new one, in another editor window, or a new window beside this one.
  // Opened the way Ctrl+Numpad4 does (5th argument true): a plain "open in new tab"
  // would also change Claude's preferred place from the side panel to a tab.
  const here = vscode.window.tabGroups.activeTabGroup.viewColumn;
  const other = vscode.window.tabGroups.all.find((g) => g.viewColumn !== here);
  const column = other ? other.viewColumn : vscode.ViewColumn.Beside;
  await vscode.commands.executeCommand("claude-vscode.editor.open", undefined, text || undefined, column, undefined, true);
  return "new chat tab in " + (other ? "editor window " + column : "a new editor window beside") + (text ? ", with the text" : "");
}

// Go to the chat box the key is for, without pasting (nothing highlighted).
async function goToChat(target) {
  if (target === "tab") {
    const how = await goToChatTab();
    log("tab: went to " + how);
    return;
  }
  await vscode.commands.executeCommand(CLAUDE_PANEL);
}

// Go to the Claude chat box and paste what is on the clipboard there.
// Returns a few words for the log: how long the panel took.
async function pasteInChatBox(target) {
  if (target === "tab") {
    const how = await goToChatTab(await vscode.env.clipboard.readText());
    if (how.startsWith("new")) {
      await pause(300);                  // a new tab got the text itself
      return how;
    }
    await pause(150);                    // the chat box takes the keyboard a moment after its tab
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    await pause(300);
    return how;
  }
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
  return "panel " + panelTime + " ms" + (loaded ? "" : ", waited for the chat box to start");
}

// ---- 4b. highlighted text on a web page in VS Code's built-in browser (14 Nov 2026) ----
// VS Code cannot copy from its built-in browser. So the page itself does it: a page
// that knows this (the macro Exam Tutor) puts the text on the clipboard when
// Ctrl+Numpad5 is pressed with something highlighted, after a first line BROWSER_MARK.
// This command (the same key, in the browser tab) waits a moment for that text, goes to
// the Claude chat box and pastes it there without the mark. The text stays on the
// clipboard. Nothing comes (nothing highlighted, or another page): it only goes to the chat box.
const BROWSER_MARK = "[to Claude chat]\n";
const BROWSER_WAIT = 400;      // ms: the page copies before VS Code gets the key, so it is usually there at once

async function browserToClaude(args) {
  const target = targetOf(args);
  const clipboard = vscode.env.clipboard;
  const started = Date.now();
  let text = null;
  for (;;) {
    const now = (await clipboard.readText()).replace(/\r\n/g, "\n");
    if (now.startsWith(BROWSER_MARK)) { text = now.slice(BROWSER_MARK.length); break; }
    if (Date.now() - started >= BROWSER_WAIT) { break; }
    await pause(15);
  }
  try {
    if (text === null) {
      await goToChat(target);
      log("browser: nothing came from the page, only went to the chat box (" + target + ")");
      return;
    }
    await clipboard.writeText(text);       // without the mark, so a later press does not paste it again
    const how = await pasteInChatBox(target);
    log("browser: pasted " + text.length + " characters (wait " + (Date.now() - started) + " ms in all, " + how + ")");
  } catch (err) {
    log("browser: error " + (err && err.message ? err.message : err));
    vscode.window.showWarningMessage("Word Page: could not send the highlighted text to Claude. " + (err && err.message ? err.message : err));
  }
}

// ---- 4c. highlighted text in the Claude panel itself (14 Nov 2026) ----------------
// Highlight a piece of a Claude answer in the side panel, press Ctrl+Numpad5: the piece
// comes back into the chat box as a quote ("> ..." lines and an empty line), so the
// next question can be about it. VS Code's copy command copies from the panel while it
// has the keyboard. To see whether anything was highlighted, the clipboard first gets a
// probe text; still the probe after the wait = nothing copied, only go to the chat box.
// The clipboard is put back afterwards (text only).
const CHAT_COPY_WAIT = 400;    // ms: the panel copies a moment after the command

async function chatSelectionToClaude(args) {
  const target = targetOf(args);
  const clipboard = vscode.env.clipboard;
  const old = await clipboard.readText();
  const probe = "word-page probe " + Date.now();
  try {
    await clipboard.writeText(probe);
    await vscode.commands.executeCommand("editor.action.clipboardCopyAction");
    const started = Date.now();
    let copied = probe;
    while (copied === probe && Date.now() - started < CHAT_COPY_WAIT) {
      await pause(15);
      copied = await clipboard.readText();
    }
    const piece = copied === probe ? "" : copied.replace(/\r\n/g, "\n").trim();
    if (!piece) {
      await clipboard.writeText(old);
      await goToChat(target);
      log("chat: nothing highlighted in the chat, only went to the chat box (" + target + ")");
      return;
    }
    const quote = piece.split("\n").map((line) => "> " + line).join("\n") + "\n\n";
    await clipboard.writeText(quote);
    const how = await pasteInChatBox(target);
    log("chat: quoted " + piece.length + " characters (copy " + (Date.now() - started) + " ms in all, " + how + ")");
  } catch (err) {
    log("chat: error " + (err && err.message ? err.message : err));
    vscode.window.showWarningMessage("Word Page: could not quote the highlighted text in the chat box. " + (err && err.message ? err.message : err));
  } finally {
    await clipboard.writeText(old);
  }
}

async function selectionToClaude(args) {
  const target = targetOf(args);
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const onPage = tab && tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VISUAL_EDITOR;
  if (!onPage) {
    await goToChat(target);
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
      if (target === "panel" && panelFirstOpened === 0) { panelFirstOpened = Date.now(); }
      await goToChat(target);
      picked = await answerOfPage(2500);     // a busy computer: the answer can still come
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
      const how = await pasteInChatBox(target);
      log("claude: " + (lines ? "lines " + lines.first + "-" + lines.last : "no lines found") +
        ", pasted " + JSON.stringify(reference) + " (copy " + copyTime + " ms, " + how + ")");
    } finally {
      await clipboard.writeText(old);        // 4.
    }
  } catch (err) {
    log("claude: error " + (err && err.message ? err.message : err));
    vscode.window.showWarningMessage("Word Page: could not send the highlighted text to Claude. " + (err && err.message ? err.message : err));
  }
}

// ---- 4d. a selection in a normal file: an R script, the .qmd as text (18 Nov 2026) ----
// Claude's own command for this (claude-vscode.insertAtMention) sends "@file#lines" to
// EVERY Claude chat that can be seen at that moment: the side panel and a chat tab next
// to the file alike. So with a chat tab open, Ctrl+Numpad5 also wrote into that tab
// (noticed in the .qmd). This command writes the same reference into the one chat the
// key is for, over the clipboard, which is put back afterwards (text only). Should the
// paste land in the file after all (the chat did not take the keyboard), it is undone.
async function editorSelectionToClaude(args) {
  const target = targetOf(args);
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    await goToChat(target);
    return;
  }
  const file = vscode.workspace.asRelativePath(editor.document.fileName);
  if (file.includes("#") || file.includes('"')) {
    vscode.window.showWarningMessage("Claude cannot take a reference to a file with # or \" in its name: " + file);
    await goToChat(target);
    return;
  }
  const selection = editor.selection;
  let last = selection.end.line;
  if (selection.end.character === 0 && last > selection.start.line) { last--; }   // ends at the start of a line: that line is not selected
  const reference = mention.buildMention(file, { first: selection.start.line + 1, last: last + 1 }, "");
  const document = editor.document;
  const version = document.version;
  const clipboard = vscode.env.clipboard;
  const old = await clipboard.readText();
  try {
    await clipboard.writeText(reference);
    const how = await pasteInChatBox(target);
    if (document.version !== version && document.getText().includes(reference.trim())) {
      await vscode.commands.executeCommand("undo");
      log("editor: the paste landed in " + file + " and was undone (" + how + ")");
      vscode.window.showWarningMessage("The Claude chat did not take the keyboard in time. Press the key again.");
      return;
    }
    log("editor: pasted " + JSON.stringify(reference) + " (" + target + ", " + how + ")");
  } catch (err) {
    log("editor: error " + (err && err.message ? err.message : err));
    vscode.window.showWarningMessage("Could not send the selection to Claude. " + (err && err.message ? err.message : err));
  } finally {
    await clipboard.writeText(old);
  }
}

// ---- 5. the page ends of the PDF ---------------------------------------------------

// The PDF of a page is the file with the same name next to it (draft.qmd -> draft.pdf),
// as Quarto makes it (Ctrl+Shift+K). Each time that PDF changes, pdfpages.py reads the
// first lines of each of its pages (Python with the package PyMuPDF). The add-on writes
// them into Quarto's folder (patch.writePdfData), and the open page reads them from
// there every 3 seconds (inject/word-page.template.js) and draws the page ends.
const pdfRead = new Map();      // PDF file -> { mtime, doc }; doc is what the page gets
const pdfTimers = new Map();    // PDF file -> timer (wait until Quarto has written the whole PDF)
const pdfReading = new Map();   // PDF file -> true while pdfpages.py reads it, "again" when it changed meanwhile
const PDF_WAIT = 1500;          // ms

// The PDF is read when the page shows anything of it: the page ends (wordPage.pageEnds) or
// the citations and pictures of tables, figures and the reference list (wordPage.fromPdf).
function pageEndsOn() {
  const config = vscode.workspace.getConfiguration("wordPage");
  return config.get("enabled", true) && config.get("look", "pdf") === "pdf" &&
    (config.get("pageEnds", true) || config.get("fromPdf", true));
}

// a short name for a PDF file, for the names of its pictures
function shortName(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) { hash = (hash * 31 + key.charCodeAt(i)) >>> 0; }
  return "p" + hash.toString(36);
}

// take away the pictures of a PDF, except those of the build that is shown now (keep)
function removePictures(folder, name, keep) {
  const dir = patch.pdfPictureDir(folder);
  let files = [];
  try { files = fs.readdirSync(dir); } catch (err) { return; }
  for (const file of files) {
    if (file.startsWith(name + "-") && !(keep && file.startsWith(keep))) {
      try { fs.unlinkSync(path.join(dir, file)); } catch (err) { /* in use: next time */ }
    }
  }
}

function keyOf(file) {
  return path.normalize(file).toLowerCase();
}

// the PDF files of the .qmd files that are open as a page
function pdfsOfOpenPages() {
  const pdfs = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputCustom && input.viewType === VISUAL_EDITOR && /\.qmd$/i.test(input.uri.fsPath)) {
        pdfs.push(input.uri.fsPath.replace(/\.qmd$/i, ".pdf"));
      }
    }
  }
  return pdfs;
}

function watchPdfs(context) {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.pdf");
  const changed = (uri) => pdfChanged(uri.fsPath);
  context.subscriptions.push(
    watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed),
    // a page was opened: read its PDF (when that is newer than what was read before)
    vscode.window.tabGroups.onDidChangeTabs(() => { pdfsOfOpenPages().forEach(pdfChanged); })
  );
  pdfsOfOpenPages().forEach(pdfChanged);
}

function pdfChanged(pdf) {
  if (!pageEndsOn()) { return; }
  const key = keyOf(pdf);
  if (!pdfsOfOpenPages().some((open) => keyOf(open) === key)) { return; }    // no page of it is open
  clearTimeout(pdfTimers.get(key));
  pdfTimers.set(key, setTimeout(() => { pdfTimers.delete(key); readPdf(pdf); }, PDF_WAIT));
}

function readPdf(pdf) {
  const key = keyOf(pdf);
  let stat;
  try {
    stat = fs.statSync(pdf);
  } catch (err) {
    return;                              // not built yet
  }
  const known = pdfRead.get(key);
  if (known && known.mtime === stat.mtimeMs) {
    writePdfData();                      // the same PDF: only make sure the page can find it
    return;
  }
  // pdfpages.py is reading this PDF already: read it once more when that is done
  if (pdfReading.has(key)) {
    pdfReading.set(key, "again");
    return;
  }
  pdfReading.set(key, true);
  const done = () => {
    const again = pdfReading.get(key) === "again";
    pdfReading.delete(key);
    if (again) { readPdf(pdf); }
  };
  const config = vscode.workspace.getConfiguration("wordPage");
  const python = config.get("python", "python");
  const started = Date.now();
  const script = path.join(__dirname, "pdfpages.py");
  // The pictures go into Quarto's folder (the page may only load files from there), named
  // after the PDF and the time of its build, so the page never shows an old picture.
  const folders = quartoFolders();
  if (folders.length === 0) { done(); return; }
  const name = shortName(key);
  const prefix = name + "-" + Math.round(stat.mtimeMs).toString(36);
  const args = ["-I", script, pdf];
  if (config.get("fromPdf", true)) { args.push(patch.pdfPictureDir(folders[0]), prefix); }
  childProcess.execFile(python, args, { timeout: 120000, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
    (err, stdout, stderr) => {
      if (err) {
        const why = String(stderr || err.message).trim().split("\n").pop();
        log("pdf: could not read " + path.basename(pdf) + " with " + python + " pdfpages.py: " + why);
        done();
        return;
      }
      let read;
      try {
        read = JSON.parse(stdout);
      } catch (parseErr) {
        log("pdf: pdfpages.py gave no list of pages for " + path.basename(pdf));
        done();
        return;
      }
      // a newer Quarto next to the running one (used after the next restart) gets the pictures too
      for (const other of folders.slice(1)) {
        try {
          fs.mkdirSync(patch.pdfPictureDir(other), { recursive: true });
          for (const file of fs.readdirSync(patch.pdfPictureDir(folders[0])).filter((f) => f.startsWith(prefix))) {
            fs.copyFileSync(path.join(patch.pdfPictureDir(folders[0]), file), path.join(patch.pdfPictureDir(other), file));
          }
        } catch (copyErr) { /* that Quarto shows no pictures until the PDF changes again */ }
      }
      pdfRead.set(key, {
        mtime: stat.mtimeMs,
        doc: {
          name: path.basename(pdf), built: builtAt(stat.mtime), pages: read.pages || [],
          cites: read.cites || {}, items: read.items || {}, refs: read.refs || [], pictures: patch.PICTURE_DIR + "/",
          style: read.style || null, title: read.title || null
        }
      });
      log("pdf: read " + path.basename(pdf) + ", " + (read.pages || []).length + " pages, " +
        Object.keys(read.cites || {}).length + " citation keys, " + Object.keys(read.items || {}).length +
        " tables and figures, " + (read.refs || []).length + " pages of references (" + (Date.now() - started) + " ms)");
      writePdfData();
      // the pictures of earlier builds of this PDF are not needed any more
      for (const folder of folders) { removePictures(folder, name, prefix); }
      done();
    });
}

// "15:30", or "11 Nov 15:30" when the PDF is not from today
function builtAt(date) {
  const two = (n) => (n < 10 ? "0" : "") + n;
  const time = two(date.getHours()) + ":" + two(date.getMinutes());
  if (date.toDateString() === new Date().toDateString()) { return time; }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return date.getDate() + " " + months[date.getMonth()] + " " + time;
}

// the PDFs of the pages open now, into the file the page reads
function writePdfData() {
  const docs = [];
  for (const pdf of pdfsOfOpenPages()) {
    const read = pdfRead.get(keyOf(pdf));
    if (read && !docs.includes(read.doc)) { docs.push(read.doc); }
  }
  for (const folder of quartoFolders()) {
    try {
      const file = patch.pdfDataFile(folder);
      const css = patch.pdfDataCss(docs);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== css) { patch.writePdfData(folder, docs); }
    } catch (err) {
      log("pdf: could not write the page ends into " + folder + ": " + (err && err.message ? err.message : err));
    }
  }
}

// ---- 6. typing marks for the Claude hooks (13 Nov 2026) ----------------------------

// Each change of a .qmd or .md document made inside VS Code (on the page: Quarto writes the
// typed text into the document every 2 seconds) is noted in the file's own mark file
// (typing.js). A change that comes from the disk, such as a Claude edit, is not typing: after
// it the document is not dirty. At most one write per file every 250 ms.
const TYPING_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "word-page", "typing");
const TYPING_EVERY = 100;       // ms (250 hid a write that came right after another one; bench, 13 Nov 2026)
const typingNoted = new Map();  // file -> when its mark was last written

// Where review.py puts the hold file (patch.holdFile) just before a Claude edit: the editor
// folders of the Quarto add-ons of this VS Code, one file per running VS Code:
//   %LOCALAPPDATA%\word-page\quarto\<process id>.json   { "dirs": ["...\\assets\\www\\editor"] }
const QUARTO_LIST = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "word-page", "quarto", process.pid + ".json");

function writeQuartoList() {
  try {
    fs.mkdirSync(path.dirname(QUARTO_LIST), { recursive: true });
    const dirs = quartoFolders().map((folder) => path.dirname(patch.holdFile(folder)));
    fs.writeFileSync(QUARTO_LIST, JSON.stringify({ dirs: dirs }));
  } catch (err) { /* the hook then holds no page: it still waits for typing to stop */ }
}

function watchTyping(context) {
  typing.clean(TYPING_DIR, Date.now());
  writeQuartoList();
  const timer = setInterval(writeQuartoList, 60000);   // a newer Quarto, or the file was cleaned away
  context.subscriptions.push({ dispose: () => {
    clearInterval(timer);
    try { fs.unlinkSync(QUARTO_LIST); } catch (err) { /* gone already */ }
  } });
  for (const folder of quartoFolders()) {
    try {
      log("sync: hooks in Quarto's code " + (patch.synced(folder) ? "in place" : "NOT in place (Quarto's code changed?)") + ": " + path.basename(folder));
    } catch (err) { /* no log line */ }
  }
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((change) => {
    const doc = change.document;
    if (change.contentChanges.length === 0 || !doc.isDirty) { return; }
    if (doc.uri.scheme !== "file" || !/\.(qmd|md)$/i.test(doc.uri.fsPath)) { return; }
    const key = typing.keyOf(doc.uri.fsPath);
    const now = Date.now();
    if (now - (typingNoted.get(key) || 0) < TYPING_EVERY) { return; }
    try {
      typing.note(TYPING_DIR, doc.uri.fsPath, now);
      typingNoted.set(key, now);          // only when written: else the next change tries again
    } catch (err) { /* the hook was reading the mark: the next change writes it */ }
  }));
}

// ---- 7. the file changed on disk while VS Code had text not saved yet (13 Nov 2026) ----

// A program that writes a .qmd without the Claude hooks (a script, Dropbox) can hit the
// moment between the page writing into the document and the save (autosave, 100 ms). VS Code
// then says "Failed to save: the content of the file is newer" and saves nothing any more:
// the typing stays in VS Code, the other change on disk (bench, 13 Nov 2026). Here: the pages
// are held for a moment (no new writes), the three texts are merged (merge.js: what VS Code
// last saved or read, what it has now, what is on disk now), the result goes to disk, and
// VS Code reads it back ("Revert File", which works on the active editor: the page he types
// in). Not active: tried again when it becomes the active tab.
const merge = require("./merge");
const HOLDS = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "word-page", "holds");
const lastSaved = new Map();    // file -> the text VS Code last read from disk or saved
const healing = new Set();

function watchedFile(doc) {
  return doc && doc.uri.scheme === "file" && /\.(qmd|md)$/i.test(doc.uri.fsPath);
}

const lastText = new Map();     // file -> the document's text after its last change

function noteSaved(doc) {
  if (!watchedFile(doc)) { return; }
  const key = typing.keyOf(doc.uri.fsPath);
  if (!doc.isDirty) {
    lastSaved.set(key, doc.getText());
  } else {
    // typed on already: what was saved is what is on disk now (VS Code has just written it)
    try { lastSaved.set(key, fs.readFileSync(doc.uri.fsPath, "utf8")); } catch (err) { /* next save */ }
  }
}

// the same hold as review.py's: the pages hand nothing to Quarto while it lasts
function writeHold(name, seconds) {
  try {
    fs.mkdirSync(HOLDS, { recursive: true });
    const own = path.join(HOLDS, name + ".hold");
    if (seconds > 0) { fs.writeFileSync(own, String(Date.now() / 1000 + seconds)); }
    else { try { fs.unlinkSync(own); } catch (err) { /* gone */ } }
    let until = 0;
    for (const file of fs.readdirSync(HOLDS)) {
      const end = parseFloat(fs.readFileSync(path.join(HOLDS, file), "utf8"));
      if (end * 1000 > Date.now()) { until = Math.max(until, end); }
    }
    const css = '/* word-page: a Claude chat is about to write a file (review.py) */\n:root { --wp-hold: "' + Math.round(until * 1000) + '"; }\n';
    for (const folder of quartoFolders()) { fs.writeFileSync(patch.holdFile(folder), css); }
  } catch (err) {
    log("heal: could not write the hold: " + (err && err.message ? err.message : err));
  }
}

function activeUri() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  return tab && tab.input && tab.input.uri ? tab.input.uri.toString() : "";
}

// The file's text, read twice 0.2 s apart; null while it is being written (VS Code and most
// programs write a file in pieces: a single read can catch half a file; bench, 13 Nov 2026).
async function readSettled(file) {
  try {
    const first = fs.readFileSync(file, "utf8");
    const firstStat = fs.statSync(file);
    await pause(200);
    const second = fs.readFileSync(file, "utf8");
    const secondStat = fs.statSync(file);
    if (first !== second || firstStat.mtimeMs !== secondStat.mtimeMs || firstStat.size !== secondStat.size) { return null; }
    return second.replace(/\r\n/g, "\n");
  } catch (err) {
    return null;
  }
}

// a merge that would take out much more than a typical edit does: something is wrong (half a file read)
function tooShort(merged, a, b) {
  return merged.length < 0.9 * Math.max(a.length, b.length);
}

// for the bench only (environment variable WORD_PAGE_DEBUG=1): the texts of each repair
function debugNote(kind, texts) {
  if (!process.env.WORD_PAGE_DEBUG) { return; }
  try {
    fs.appendFileSync(path.join(os.tmpdir(), "word-page-debug.jsonl"), JSON.stringify({ t: Date.now(), kind: kind, texts: texts }) + "\n");
  } catch (err) { /* no note */ }
}

// half a file: shorter, and its end is neither the old end nor the other side's end
function looksCut(text, base, other) {
  const end = (t) => t.slice(-80);
  return text.length < base.length && end(text) !== end(base) && end(text) !== end(other);
}

const STUCK_MS = 1500;          // unsaved this long with autosave at 100 ms: VS Code could not save
const dirtySince = new Map();   // file -> when the document became unsaved

async function checkClash(uri) {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (!watchedFile(doc) || !doc.isDirty) { return; }
  const key = typing.keyOf(doc.uri.fsPath);
  if (!dirtySince.has(key) || Date.now() - dirtySince.get(key) < STUCK_MS) { return; }   // a save is on its way
  if (healing.has(key) || activeUri() !== doc.uri.toString()) { return; }
  const base = lastSaved.has(key) ? lastSaved.get(key).replace(/\r\n/g, "\n") : null;
  if (base === null) { return; }
  healing.add(key);
  const hold = "heal-" + process.pid;
  try {
    const disk = await readSettled(doc.uri.fsPath);
    if (disk === null || disk === base) { return; }   // still being written, or not changed: not now
    writeHold(hold, 10);
    await pause(500);                                   // a write that was on its way is in the document by now
    const ours = doc.getText().replace(/\r\n/g, "\n");
    const merged = merge.merge3(base, ours, disk);      // (when it equals ours, it still has to get onto disk)
    debugNote("heal", { base: base, ours: ours, disk: disk, merged: merged.text });
    if (looksCut(disk, base, ours) || tooShort(merged.text, ours, disk)) {
      log("heal: " + path.basename(doc.uri.fsPath) + ": the merge would take out too much text; left to the user (VS Code's own question)");
      return;
    }
    const again = await readSettled(doc.uri.fsPath);
    if (again !== disk) { return; }                     // changed meanwhile: next time
    const temp = doc.uri.fsPath + ".word-page-tmp";
    fs.writeFileSync(temp, merged.text);
    fs.renameSync(temp, doc.uri.fsPath);                // in one step: no reader sees half of it
    if (activeUri() === doc.uri.toString()) {
      await vscode.commands.executeCommand("workbench.action.files.revert");
    }
    log("heal: " + path.basename(doc.uri.fsPath) + " changed on disk while VS Code had unsaved text: merged" +
      (merged.conflicts ? " (" + merged.conflicts + " places changed on both sides: VS Code's text kept there)" : "") +
      (doc.isDirty ? ", but VS Code did not read it back yet" : " and read back"));
  } catch (err) {
    log("heal: " + path.basename(doc.uri.fsPath) + " failed: " + (err && err.message ? err.message : err));
  } finally {
    writeHold(hold, 0);
    healing.delete(key);
  }
}

// A change read from disk that the page may not have seen. Quarto skips the first change of
// the document after each of its own writes, thinking it is that write; when a change from
// disk comes in at that moment, the page never hears of it, and its next write (all of its
// text) leaves the change out (bench, 13 Nov 2026: 3 of 11 quick outside writes lost). So
// after a change from disk, the next write from the page is checked: when it lacks that
// change, the change is merged back in, and the page hears of the result.
// (18 Nov 2026: the line break before savingSince had gone, so savingSince was never made and
// every change from the page stopped here with "savingSince is not defined", 1,142 times
// since 17 Nov 00:28 in exthost.log: this whole check was off.)
const fromDisk = new Map();     // file -> { base, disk }
const savingSince = new Map();  // file -> when VS Code began saving it (until the save is done)

function documentChanged(change) {
  const doc = change.document;
  if (!watchedFile(doc)) { return; }
  const key = typing.keyOf(doc.uri.fsPath);
  if (!doc.isDirty) { dirtySince.delete(key); } else if (!dirtySince.has(key)) { dirtySince.set(key, Date.now()); }
  if (change.contentChanges.length === 0) { return; }
  const text = doc.getText().replace(/\r\n/g, "\n");
  const before = lastText.get(key);                     // the text just before this change
  lastText.set(key, text);
  if (!doc.isDirty) {
    // Read from disk? Not when VS Code is saving: Quarto puts its newest text in at the last
    // moment of a save (a "save participant"), and that change also comes without unsaved
    // text. Taking that for a change from disk doubled typed words (bench, 13 Nov 2026).
    // A real read from disk has the file's text.
    let read = !(savingSince.has(key) && Date.now() - savingSince.get(key) < 3000);
    if (read) {
      try { read = fs.readFileSync(doc.uri.fsPath, "utf8").replace(/\r\n/g, "\n") === text; } catch (err) { read = false; }
    }
    if (read) {
      const known = fromDisk.get(key);
      if (known) { known.disk = text; }
      else if (before !== undefined && before !== text) { fromDisk.set(key, { base: before, disk: text }); }
      noteSaved(doc);     // only a real read from disk: Quarto's last-moment text may never reach the disk (a failed save)
    }
    return;
  }
  const known = fromDisk.get(key);
  if (!known) { return; }
  fromDisk.delete(key);
  const merged = merge.merge3(known.base, text, known.disk).text;
  if (merged === text) { return; }                      // the page had it: all well
  // Exactly the text from before Claude's change: Decline on every mark (or Ctrl+Z). A page
  // that missed the change writes nothing until he types, and then its text holds his typing
  // too, so it is never exactly the old text. Merging back here brought declined Claude edits
  // back (18 Nov 2026, asked: "edits I had already declined came back").
  if (text === known.base) {
    log("keep: " + path.basename(doc.uri.fsPath) + ": the page put all old words back (Decline or Ctrl+Z); left as it is");
    return;
  }
  if (require("./assistant").onlyDeclined(known.base, text, known.disk)) {
    log("keep: " + path.basename(doc.uri.fsPath) + ": the page put old words back with Decline; left as it is");
    return;
  }
  debugNote("keep", { base: known.base, page: text, disk: known.disk, merged: merged });
  if (looksCut(known.disk, known.base, text) || tooShort(merged, text, known.disk)) {
    log("keep: " + path.basename(doc.uri.fsPath) + ": merging back would take out too much text; not done");
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), merged);
  vscode.workspace.applyEdit(edit).then((done) => {
    log("keep: " + path.basename(doc.uri.fsPath) + ": the page wrote without a change just read from disk; " +
      (done ? "merged it back in" : "COULD NOT merge it back in"));
  });
}

function watchClashes(context) {
  vscode.workspace.textDocuments.forEach(noteSaved);
  vscode.workspace.textDocuments.forEach((doc) => {
    if (watchedFile(doc)) { lastText.set(typing.keyOf(doc.uri.fsPath), doc.getText().replace(/\r\n/g, "\n")); }
  });
  const later = (uri) => setTimeout(() => { checkClash(uri); }, 300);
  const timer = setInterval(() => {                     // a save that failed: the document stays dirty
    for (const doc of vscode.workspace.textDocuments) {
      if (watchedFile(doc) && doc.isDirty) { checkClash(doc.uri); }
    }
  }, 1000);
  context.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    vscode.workspace.onDidOpenTextDocument((doc) => {
      noteSaved(doc);
      if (watchedFile(doc)) { lastText.set(typing.keyOf(doc.uri.fsPath), doc.getText().replace(/\r\n/g, "\n")); }
    }),
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (watchedFile(event.document)) { savingSince.set(typing.keyOf(event.document.uri.fsPath), Date.now()); }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (watchedFile(doc)) {
        savingSince.delete(typing.keyOf(doc.uri.fsPath));
        if (!doc.isDirty) { dirtySince.delete(typing.keyOf(doc.uri.fsPath)); }
      }
      noteSaved(doc);
    }),
    vscode.workspace.onDidChangeTextDocument(documentChanged),
    vscode.window.tabGroups.onDidChangeTabs(() => { const uri = activeUri(); if (uri) { later(vscode.Uri.parse(uri)); } })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
