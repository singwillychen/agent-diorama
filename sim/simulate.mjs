// Plays the demo scenario against a running hub: `npm run sim [-- --speed 2]`.
import { runScenario } from "./scenario.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const HUB = opt("hub", process.env.DIORAMA_HUB || "http://127.0.0.1:4319");
const speed = Number(opt("speed", 1));
const TOKEN = opt("token", process.env.DIORAMA_TOKEN || "");
const auth = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

async function emit(evt) {
  const full = { v: "0.1", id: `sim-${Date.now()}-${seq++}`, ts: new Date().toISOString(), ...evt };
  try {
    await fetch(`${HUB}/v1/events`, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(full) });
  } catch (err) {
    console.error(`[sim] hub unreachable at ${HUB}: ${err.message}`);
    process.exit(1);
  }
}

async function waitApproval(id, ms) {
  const deadline = Date.now() + ms;
  let since;
  while (Date.now() < deadline) {
    const res = await fetch(`${HUB}/v1/commands${since ? `?since=${since}` : ""}`, { headers: auth }).then((r) => r.json()).catch(() => []);
    for (const c of res) {
      since = c.id;
      // The viewer posts approval.resolved itself; we only need the decision.
      if ((c.command === "approve" || c.command === "reject") && c.args?.request === id) return c.command;
    }
    await sleep(800);
  }
  return "timeout";
}

console.log(`[sim] streaming demo scenario to ${HUB} at ${speed}x — Ctrl+C to stop`);
await runScenario({ emit: (e) => { emit(e); }, sleep, waitApproval, speed });
