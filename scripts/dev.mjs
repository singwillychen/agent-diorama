// Starts the event hub and the web dev server together: `npm run dev`.
import { spawn } from "node:child_process";

const procs = [
  spawn("node", ["server/index.mjs"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "-w", "web"], { stdio: "inherit" }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => { if (code) stop(); });
