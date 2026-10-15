// Agent Diorama event hub — zero-dependency Node server.
// Ingests ADEP events over HTTP, fans them out to viewers over SSE,
// keeps an in-memory log (persisted to data/events.jsonl) for replay,
// and queues commands (pause / approve / …) for adapters to pick up.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.DIORAMA_PORT || 4319);
const HOST = process.env.DIORAMA_HOST || "127.0.0.1";
const DATA_DIR = path.join(ROOT, "data");
const LOG_FILE = path.join(DATA_DIR, "events.jsonl");
const STATIC_DIR = path.join(ROOT, "web", "dist");
const MAX_EVENTS = 20000;
const MAX_BODY = 5 * 1024 * 1024;

/** @type {any[]} */
let events = [];
/** @type {any[]} */
let commands = [];
/** @type {Set<http.ServerResponse>} */
const viewers = new Set();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (process.env.DIORAMA_PERSIST !== "0" && fs.existsSync(LOG_FILE)) {
  for (const line of fs.readFileSync(LOG_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
  }
  events = events.slice(-MAX_EVENTS);
}

function normalize(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.type !== "string") return null;
  return {
    v: raw.v || "0.1",
    id: raw.id || randomUUID(),
    ts: raw.ts || new Date().toISOString(),
    ...raw,
  };
}

function ingest(list) {
  const accepted = [];
  for (const raw of list) {
    const evt = normalize(raw);
    if (!evt) continue;
    events.push(evt);
    accepted.push(evt);
  }
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  if (accepted.length && process.env.DIORAMA_PERSIST !== "0") {
    fs.appendFile(LOG_FILE, accepted.map((e) => JSON.stringify(e)).join("\n") + "\n", () => {});
  }
  for (const evt of accepted) broadcast(evt);
  return accepted.length;
}

function broadcast(evt) {
  const frame = `id: ${evt.id}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const res of viewers) res.write(frame);
}

function parseBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  if (trimmed.startsWith("{") && !trimmed.includes("\n{")) return [JSON.parse(trimmed)];
  return trimmed.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".glb": "model/gltf-binary", ".woff2": "font/woff2",
};

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(STATIC_DIR)) {
    return send(res, 200, { name: "agent-diorama-hub", hint: "Run `npm run web` for the dev UI, or `npm run build` to serve it here." });
  }
  let file = path.join(STATIC_DIR, decodeURIComponent(pathname));
  if (!file.startsWith(STATIC_DIR)) return send(res, 403, { error: "forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === "/v1/health") return send(res, 200, { ok: true, events: events.length, viewers: viewers.size });

    if (p === "/v1/events" && req.method === "POST") {
      const n = ingest(parseBody(await readBody(req)));
      return send(res, 202, { accepted: n });
    }

    if (p === "/v1/events" && req.method === "GET") {
      const since = url.searchParams.get("since");
      const idx = since ? events.findIndex((e) => e.id === since) + 1 : 0;
      return send(res, 200, events.slice(idx));
    }

    if (p === "/v1/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      const replay = url.searchParams.get("replay") !== "0";
      if (replay) for (const evt of events) res.write(`id: ${evt.id}\ndata: ${JSON.stringify(evt)}\n\n`);
      res.write(`event: ready\ndata: {}\n\n`);
      viewers.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      req.on("close", () => { clearInterval(ping); viewers.delete(res); });
      return;
    }

    if (p === "/v1/commands" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!body.command) return send(res, 400, { error: "command required" });
      const cmd = { id: randomUUID(), ts: new Date().toISOString(), ...body };
      commands.push(cmd);
      commands = commands.slice(-1000);
      ingest([{ type: "custom.command_issued", agent: "human", data: cmd }]);
      return send(res, 202, cmd);
    }

    if (p === "/v1/commands" && req.method === "GET") {
      const agent = url.searchParams.get("agent");
      const since = url.searchParams.get("since");
      let list = agent ? commands.filter((c) => !c.agent || c.agent === agent) : commands;
      if (since) list = list.slice(list.findIndex((c) => c.id === since) + 1);
      return send(res, 200, list);
    }

    if (p === "/v1/reset" && req.method === "POST") {
      events = [];
      commands = [];
      if (fs.existsSync(LOG_FILE)) fs.truncateSync(LOG_FILE, 0);
      ingest([{ type: "custom.reset", agent: "system" }]);
      return send(res, 200, { ok: true });
    }

    if (p.startsWith("/v1/")) return send(res, 404, { error: "not found" });
    return serveStatic(req, res, p);
  } catch (err) {
    return send(res, 400, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[diorama-hub] listening on http://${HOST}:${PORT}  (events loaded: ${events.length})`);
});
