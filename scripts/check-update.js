// Does the setup still fit the VS Code that is installed now? (20 Nov 2026)
//
// Run through check-update.ps1, which runs this file with VS Code's own Node.
// A VS Code update can rename or drop a command, a setting, a "when" word or an
// API proposal that the setup uses. Nothing then tells you: a key just does
// nothing, a setting is ignored. This file looks up every one of them in the
// code of the VS Code that is installed now and of every installed add-on.
//
// Prints one line per check: OK, WRONG or NOTE. Last line: "WRONG: <n>".

const fs = require("fs")
const path = require("path")
const os = require("os")

const home = os.homedir()
const local = process.env.LOCALAPPDATA
const roaming = process.env.APPDATA
const vscodeDir = path.join(local, "Programs", "Microsoft VS Code")
const userDir = path.join(roaming, "Code", "User")
const extDir = path.join(home, ".vscode", "extensions")

let wrong = 0

function ok(text) {
  console.log("OK     " + text)
}

function bad(text) {
  wrong = wrong + 1
  console.log("WRONG  " + text)
}

function note(text) {
  console.log("NOTE   " + text)
}

// JSON with comments and trailing commas (settings.json, keybindings.json, argv.json)
function readJsonc(file) {
  const text = fs.readFileSync(file, "utf8")
  let out = ""
  let inString = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (inString) {
      out = out + c
      if (c === "\\") {
        out = out + next
        i = i + 2
        continue
      }
      if (c === "\"") inString = false
      i = i + 1
      continue
    }
    if (c === "\"") {
      inString = true
      out = out + c
      i = i + 1
      continue
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i = i + 1
      continue
    }
    if (c === "/" && next === "*") {
      i = text.indexOf("*/", i + 2) + 2
      continue
    }
    out = out + c
    i = i + 1
  }
  out = out.replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(out)
}

// 1. which VS Code runs, from which folder
const product = (() => {
  const folders = fs.readdirSync(vscodeDir).filter(name => fs.existsSync(path.join(vscodeDir, name, "resources", "app", "product.json")))
  const newest = folders
    .map(name => ({ name, time: fs.statSync(path.join(vscodeDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0]
  const appDir = path.join(vscodeDir, newest.name, "resources", "app")
  const info = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"))
  return { appDir, version: info.version }
})()
console.log("VS Code " + product.version + " (" + product.appDir + ")")

// all the code to search in: VS Code itself and every add-on
const coreFiles = [
  path.join(product.appDir, "out", "vs", "workbench", "workbench.desktop.main.js"),
  path.join(product.appDir, "out", "vs", "workbench", "api", "node", "extensionHostProcess.js"),
]
const core = coreFiles.map(file => fs.readFileSync(file, "utf8")).join("\n")

function listExtensions(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(folder => fs.existsSync(path.join(folder, "package.json")))
}

// the add-ons VS Code really loads (an old version folder can still lie around)
const loaded = (() => {
  const list = JSON.parse(fs.readFileSync(path.join(extDir, "extensions.json"), "utf8"))
  return list.map(entry => path.join(extDir, entry.relativeLocation))
})()
const builtIn = listExtensions(path.join(product.appDir, "extensions"))
const allExtensions = builtIn.concat(loaded.filter(folder => fs.existsSync(folder)))

const manifests = allExtensions.map(folder => {
  const text = fs.readFileSync(path.join(folder, "package.json"), "utf8")
  return { folder, text, json: JSON.parse(text) }
})

// the main code file of each add-on (where it registers its commands and "when" words)
function mainCode(m) {
  const main = m.json.main || m.json.browser
  if (!main) return ""
  let file = path.join(m.folder, main)
  if (!fs.existsSync(file) && fs.existsSync(file + ".js")) file = file + ".js"
  if (!fs.existsSync(file)) return ""
  return fs.readFileSync(file, "utf8")
}
const extensionText = manifests.map(m => m.text + "\n" + mainCode(m)).join("\n")
const everything = core + "\n" + extensionText

function known(word) {
  return everything.includes("\"" + word + "\"") ||
    everything.includes("'" + word + "'") ||
    everything.includes("`" + word + "`")
}

// 2. argv.json still lets the Enter add-on use the chat edit view
const argv = readJsonc(path.join(home, ".vscode", "argv.json"))
const proposedAllowed = argv["enable-proposed-api"] || []
if (proposedAllowed.includes("local.r-pipe-indent")) {
  ok("argv.json allows the Enter add-on its API proposals")
} else {
  bad("argv.json lost \"enable-proposed-api\": [\"local.r-pipe-indent\"] (Claude's red/green edits stop)")
}

// 3. every API proposal an add-on asks for still exists in this VS Code
for (const m of manifests) {
  const asked = m.json.enabledApiProposals || []
  if (asked.length === 0 || m.folder.startsWith(product.appDir)) continue
  if (!proposedAllowed.includes(m.json.publisher + "." + m.json.name)) continue
  for (const proposal of asked) {
    const name = proposal.split("@")[0]
    if (core.includes(name + ":{proposal:")) {
      ok("API proposal " + name + " (" + m.json.name + ") is still in VS Code")
    } else {
      bad("API proposal " + name + " (" + m.json.name + ") is gone from VS Code " + product.version)
    }
  }
}

// 4. every command and "when" word of keybindings.json still exists
const keys = readJsonc(path.join(userDir, "keybindings.json"))
const commands = new Set()
const whenWords = new Set()
const builtInWhen = ["true", "false", "in", "not", "and", "or"]
for (const key of keys) {
  if (key.command) commands.add(key.command.replace(/^-/, ""))
  if (key.args && Array.isArray(key.args.commands)) {
    for (const inner of key.args.commands) {
      commands.add(typeof inner === "string" ? inner : inner.command)
    }
  }
  if (key.when) {
    const cleaned = key.when.replace(/'[^']*'/g, "").replace(/\/[^/]*\//g, "")
    for (const word of cleaned.match(/[A-Za-z][\w.:-]*/g) || []) {
      if (!builtInWhen.includes(word)) whenWords.add(word)
    }
  }
}
let missingCommands = 0
for (const command of commands) {
  if (!known(command)) {
    bad("keybindings.json: command " + command + " no longer exists")
    missingCommands = missingCommands + 1
  }
}
if (missingCommands === 0) ok("keybindings.json: all " + commands.size + " commands exist")
let missingWhen = 0
for (const word of whenWords) {
  if (!known(word)) {
    bad("keybindings.json: the \"when\" word " + word + " no longer exists")
    missingWhen = missingWhen + 1
  }
}
if (missingWhen === 0) ok("keybindings.json: all " + whenWords.size + " \"when\" words exist")

// 5. every setting in settings.json is still a real setting
const settings = readJsonc(path.join(userDir, "settings.json"))
const settingNames = []
for (const name of Object.keys(settings)) {
  if (name.startsWith("[")) {
    for (const inner of Object.keys(settings[name])) settingNames.push(inner)
  } else {
    settingNames.push(name)
  }
}
let missingSettings = 0
for (const name of [...new Set(settingNames)]) {
  // editor settings sit in VS Code's code without "editor." in front
  const bare = name.replace(/^editor\./, "")
  if (!known(name) && !known(bare)) {
    bad("settings.json: setting " + name + " is not known to VS Code or any add-on (ignored now)")
    missingSettings = missingSettings + 1
  }
}
if (missingSettings === 0) ok("settings.json: all " + settingNames.length + " settings are known")

// 6. every VS Code command the own add-ons run still exists
const own = manifests.filter(m => m.json.publisher === "local")
for (const m of own) {
  const code = mainCode(m)
  const used = new Set()
  for (const match of code.matchAll(/executeCommand\(\s*["'`]([\w.:-]+)["'`]/g)) used.add(match[1])
  const missing = [...used].filter(command => !known(command))
  if (missing.length === 0) {
    ok(m.json.name + ": all " + used.size + " commands it runs exist")
  } else {
    for (const command of missing) bad(m.json.name + " runs " + command + ", which no longer exists")
  }
}

// 7. the own add-ons are loaded at the version in the setup folder
const setupDir = path.join(__dirname, "..")
for (const name of ["local.r-pipe-indent-0.1.0", "local.word-page-0.1.0"]) {
  const mine = path.join(setupDir, "VS Code", name, "extension.js")
  const there = path.join(extDir, name, "extension.js")
  if (!fs.existsSync(mine)) continue
  if (!fs.existsSync(there)) {
    bad(name + " is not installed in " + extDir)
  } else if (fs.readFileSync(mine, "utf8") !== fs.readFileSync(there, "utf8")) {
    note(name + ": the installed extension.js differs from the setup folder")
  } else {
    ok(name + " is installed as in the setup folder")
  }
}

console.log("WRONG: " + wrong)
