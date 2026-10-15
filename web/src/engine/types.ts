// ADEP (Agent Diorama Event Protocol) types — mirrors spec/event-protocol.schema.json.

export type AgentState =
  | "idle" | "thinking" | "tool_call" | "speaking" | "listening" | "meeting"
  | "waiting_human" | "blocked" | "error" | "retrying" | "long_running" | "done" | "offline";

export interface DioramaEvent {
  v: string;
  id: string;
  ts: string;
  type: string;
  agent?: string;
  session?: string;
  parent?: string;
  data?: Record<string, any>;
  utterance?: string;
  visibility?: "public" | "redacted" | "hidden";
}

export interface AgentManifest {
  id: string;
  name: string;
  role: string;
  rank?: number;
  vendor?: string;
  model?: string;
  framework?: string;
  parent?: string;
  persona?: { voice?: string; chattiness?: number; catchphrases?: string[] };
  appearance?: Record<string, any>;
  capabilities?: string[];
}

export interface AgentView extends AgentManifest {
  /** Name the agent registered with, before any viewer rename. */
  originalName?: string;
  state: AgentState;
  stateSince: number;
  /** Short-lived display state (speaking, done…) that falls back to `state`. */
  transient?: { state: AgentState; until: number };
  taskId?: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  context?: { used: number; max: number };
  joinedAt: number;
  lastEventAt: number;
  lastErrorAt?: number;
  lastRecoveredAt?: number;
  completedStreak: number;
  order: number;
}

export interface TaskView {
  id: string;
  title: string;
  assignee?: string;
  status: "open" | "assigned" | "in_progress" | "done" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface ApprovalView {
  id: string;
  agent: string;
  summary: string;
  at: number;
}

export interface Flight {
  id: string;
  from: string;
  to: string | "*";
  start: number;
}

export interface TimelineEntry {
  id: string;
  at: number;
  agent?: string;
  type: string;
  text: string;
  level: "info" | "work" | "talk" | "warn" | "error" | "good";
}
