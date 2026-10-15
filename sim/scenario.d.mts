export declare const DEMO_AGENTS: Array<Record<string, any>>;
export declare function runScenario(io: {
  emit: (e: Record<string, any>) => void;
  sleep: (ms: number) => Promise<void>;
  waitApproval: (id: string, ms: number) => Promise<"approve" | "reject" | "timeout">;
  speed?: number;
  signal?: { stopped: boolean };
}): Promise<void>;
export declare function pickRandom<T>(list: T[]): T;
