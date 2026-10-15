"""Minimal Agent Diorama client — stdlib only, Python 3.8+.

Any Python agent (Hermes Agent, MiniMax-based agents, custom loops…) can use
this to appear in the diorama:

    from diorama_client import Diorama
    d = Diorama(agent_id="hermes-1")
    d.register(name="赫墨", role="researcher", vendor="nous", model="hermes-4", framework="hermes-agent")
    d.thinking()
    d.tool("web_search", query="...")
    d.tool_done("web_search")
    d.say("找到三篇相關論文")
    d.done(task="t1")

Network errors are swallowed so the agent never breaks because the hub is down.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
import uuid
from typing import Any, Dict, List, Optional

HUB = os.environ.get("DIORAMA_HUB", "http://127.0.0.1:4319")


class Diorama:
    def __init__(self, agent_id: str, hub: str = HUB, session: Optional[str] = None, background: bool = True):
        self.agent_id = agent_id
        self.hub = hub.rstrip("/")
        self.session = session or uuid.uuid4().hex[:12]
        self.background = background

    # ---- transport
    def emit(self, type: str, data: Optional[Dict[str, Any]] = None, agent: Optional[str] = None,
             utterance: Optional[str] = None, visibility: str = "public") -> None:
        evt = {
            "v": "0.1",
            "id": uuid.uuid4().hex,
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
            "type": type,
            "agent": agent or self.agent_id,
            "session": self.session,
            "data": data or {},
            "visibility": visibility,
        }
        if utterance:
            evt["utterance"] = utterance
        body = json.dumps(evt).encode("utf-8")

        def send() -> None:
            try:
                req = urllib.request.Request(f"{self.hub}/v1/events", data=body, headers={"content-type": "application/json"})
                urllib.request.urlopen(req, timeout=1.5).read()
            except Exception:
                pass

        if self.background:
            threading.Thread(target=send, daemon=True).start()
        else:
            send()

    def commands(self, since: Optional[str] = None) -> List[Dict[str, Any]]:
        """Poll commands (approve / reject / pause …) addressed to this agent."""
        url = f"{self.hub}/v1/commands?agent={self.agent_id}" + (f"&since={since}" if since else "")
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                return json.loads(r.read())
        except Exception:
            return []

    # ---- convenience
    def register(self, name: str, role: str, **manifest: Any) -> None:
        self.emit("agent.registered", {"id": self.agent_id, "name": name, "role": role, **manifest})

    def unregister(self) -> None:
        self.emit("agent.unregistered")

    def thinking(self) -> None:
        self.emit("llm.started")

    def idle(self) -> None:
        self.emit("llm.finished")

    def tool(self, name: str, **args: Any) -> None:
        self.emit("tool.called", {"tool": name, "args": args})

    def tool_done(self, name: str, error: Optional[str] = None) -> None:
        self.emit("tool.failed" if error else "tool.finished", {"tool": name, "error": error} if error else {"tool": name})

    def message(self, to: str, text: str) -> None:
        self.emit("message.sent", {"to": to, "text": text})

    def say(self, text: str) -> None:
        self.emit("say", utterance=text)

    def cost(self, usd: float, tokens_in: int = 0, tokens_out: int = 0) -> None:
        self.emit("cost.updated", {"usd": usd, "tokensIn": tokens_in, "tokensOut": tokens_out})

    def context(self, used: int, max_tokens: int) -> None:
        self.emit("context.updated", {"used": used, "max": max_tokens})

    def ask_approval(self, request_id: str, summary: str) -> None:
        self.emit("approval.requested", {"request": request_id, "summary": summary})

    def done(self, task: str, utterance: Optional[str] = None) -> None:
        self.emit("task.completed", {"task": task}, utterance=utterance)
