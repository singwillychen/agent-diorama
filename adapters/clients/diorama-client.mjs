// Minimal Agent Diorama client for Node 18+ / Deno / Bun / browsers.
//
//   import { Diorama } from "./diorama-client.mjs";
//   const d = new Diorama("gpt-1");
//   d.register({ name: "鏡月", role: "planner", vendor: "openai", model: "gpt-5", framework: "openai-agents" });
//   d.thinking(); d.tool("web_search", { query: "…" }); d.toolDone("web_search"); d.done("t1");
//
// Errors are swallowed: the hub being down must never break an agent.
const DEFAULT_HUB = (typeof process !== "undefined" && process.env?.DIORAMA_HUB) || "http://127.0.0.1:4319";

export class Diorama {
  constructor(agentId, { hub = DEFAULT_HUB, session } = {}) {
    this.agentId = agentId;
    this.hub = hub.replace(/\/$/, "");
    this.session = session || Math.random().toString(36).slice(2, 14);
  }

  emit(type, data = {}, { agent, utterance, visibility = "public" } = {}) {
    const evt = { v: "0.1", id: crypto.randomUUID(), ts: new Date().toISOString(), type, agent: agent || this.agentId, session: this.session, data, visibility };
    if (utterance) evt.utterance = utterance;
    return fetch(`${this.hub}/v1/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evt) }).catch(() => {});
  }

  async commands(since) {
    try {
      const r = await fetch(`${this.hub}/v1/commands?agent=${encodeURIComponent(this.agentId)}${since ? `&since=${since}` : ""}`);
      return await r.json();
    } catch { return []; }
  }

  register(manifest) { return this.emit("agent.registered", { id: this.agentId, ...manifest }); }
  unregister() { return this.emit("agent.unregistered"); }
  thinking() { return this.emit("llm.started"); }
  idle() { return this.emit("llm.finished"); }
  tool(name, args = {}) { return this.emit("tool.called", { tool: name, args }); }
  toolDone(name, error) { return this.emit(error ? "tool.failed" : "tool.finished", error ? { tool: name, error } : { tool: name }); }
  message(to, text) { return this.emit("message.sent", { to, text }); }
  say(text) { return this.emit("say", {}, { utterance: text }); }
  cost(usd, tokensIn = 0, tokensOut = 0) { return this.emit("cost.updated", { usd, tokensIn, tokensOut }); }
  context(used, max) { return this.emit("context.updated", { used, max }); }
  askApproval(request, summary) { return this.emit("approval.requested", { request, summary }); }
  done(task, utterance) { return this.emit("task.completed", { task }, { utterance }); }
}
