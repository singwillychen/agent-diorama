#!/usr/bin/env node
// Adds the Agent Diorama hook to a Claude Code settings file.
//   node adapters/claude-code/install.mjs            → ./.claude/settings.local.json (this project)
//   node adapters/claude-code/install.mjs --global   → ~/.claude/settings.json (every project)
//   node adapters/claude-code/install.mjs --print    → just print the JSON snippet
//   node adapters/claude-code/install.mjs --remove   → remove the hook again
// Identity options (baked into the hook command as env vars):
//   --name 雲崖子  --role orchestrator  --id my-claude  --hub http://127.0.0.1:4319  --token s3cret  --privacy redacted
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "diorama-hook.mjs");
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const quote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
const ENV = [
  ["DIORAMA_NAME", opt("name")],
  ["DIORAMA_ROLE", opt("role")],
  ["DIORAMA_AGENT_ID", opt("id")],
  ["DIORAMA_HUB", opt("hub")],
  ["DIORAMA_TOKEN", opt("token")],
  ["DIORAMA_PRIVACY", opt("privacy")],
].filter(([, v]) => v).map(([k, v]) => `${k}=${quote(v)}`);
const COMMAND = [...ENV, `node "${HOOK}"`].join(" ");
const EVENTS_WITH_MATCHER = ["PreToolUse", "PostToolUse", "PermissionRequest"];
const EVENTS = ["SessionStart", "UserPromptSubmit", "Notification", "SubagentStart", "SubagentStop", "PreCompact", "Stop", "SessionEnd"];

const args = new Set(argv);
const target = args.has("--global")
  ? path.join(os.homedir(), ".claude", "settings.json")
  : path.join(process.cwd(), ".claude", "settings.local.json");

const entry = (matcher) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: COMMAND, timeout: 5 }] });

function strip(hooks) {
  for (const [ev, list] of Object.entries(hooks)) {
    hooks[ev] = list
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || "").includes("diorama-hook.mjs")) }))
      .filter((g) => g.hooks.length);
    if (!hooks[ev].length) delete hooks[ev];
  }
  return hooks;
}

const snippet = { hooks: {} };
for (const ev of EVENTS_WITH_MATCHER) snippet.hooks[ev] = [entry("*")];
for (const ev of EVENTS) snippet.hooks[ev] = [entry()];

if (args.has("--print")) {
  console.log(JSON.stringify(snippet, null, 2));
  process.exit(0);
}

let settings = {};
if (fs.existsSync(target)) settings = JSON.parse(fs.readFileSync(target, "utf8"));
settings.hooks = strip(settings.hooks || {});
if (!args.has("--remove")) {
  for (const [ev, list] of Object.entries(snippet.hooks)) settings.hooks[ev] = [...(settings.hooks[ev] || []), ...list];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(settings, null, 2) + "\n");
console.log(`${args.has("--remove") ? "Removed" : "Installed"} Agent Diorama hooks in ${target}`);
