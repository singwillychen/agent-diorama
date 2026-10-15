// The cultivation-sect peak (修仙山門): world geometry + agents + effects.
import { useEffect, useMemo, useRef, useState } from "react";
import { Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { displayState, useWorld } from "../../engine/world";
import { useBubbles, visibleBubbles } from "../../engine/bubbles";
import type { AgentView } from "../../engine/types";
import type { ResolvedTheme } from "../../themes/loader";
import { useUi } from "../../ui/store";
import { ANCHORS, seatPosition } from "./layout";
import { Bridge, CloudSea, Cranes, DistantPeaks, FloatingRocks, GrassTop, Peak, PineRing, Plaza, StonePath } from "./terrain";
import { Cauldron, CaveAbode, GrandArray, Hall, Lantern, Pagoda, Paifang, Pond, TeleportArray } from "./buildings";
import { Character } from "./Character";
import { Flights, Tribulation } from "./Effects";

export type Mood = "calm" | "unstable" | "tribulation";

export function useMood(): Mood {
  const agents = useWorld((s) => s.agents);
  const over = useWorld((s) => s.totalCostUsd > s.budgetUsd);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  const states = Object.values(agents).map((a) => displayState(a, now));
  if (over || states.includes("error")) return "tribulation";
  if (states.includes("waiting_human") || states.includes("blocked")) return "unstable";
  return "calm";
}

const IDLE_WANDER_MS = 9000;

function rankLabel(ranks: Record<string, string> | undefined, rank?: number) {
  if (!ranks || rank == null) return undefined;
  const keys = Object.keys(ranks).map(Number).sort((a, b) => a - b);
  let label: string | undefined;
  for (const k of keys) if (rank >= k) label = ranks[String(k)];
  return label;
}

function zoneAnchor(theme: Record<string, any>, zone: string | undefined, fallback: string): string {
  if (!zone) return fallback;
  if (zone === "meeting") return "zone:meeting_plaza";
  return theme.zones?.[zone]?.anchor ?? fallback;
}

interface Placed { agent: AgentView; anchor: string; leaving?: boolean }

function Agents({ theme }: { theme: ResolvedTheme }) {
  const agents = useWorld((s) => s.agents);
  const selected = useWorld((s) => s.selected);
  const select = useWorld((s) => s.select);
  const flights = useWorld((s) => s.flights);
  const zoom = useUi((s) => s.zoom);
  const allBubbles = useBubbles((s) => s.bubbles);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 400); return () => clearInterval(i); }, []);

  // Keep departed agents around briefly so they can teleport away.
  const ghosts = useRef(new Map<string, { agent: AgentView; until: number }>());
  const prev = useRef<Record<string, AgentView>>({});
  for (const [id, a] of Object.entries(prev.current)) {
    if (!agents[id] && !ghosts.current.has(id)) ghosts.current.set(id, { agent: a, until: Date.now() + 1800 });
  }
  for (const [id, g] of ghosts.current) if (g.until < now || agents[id]) ghosts.current.delete(id);
  prev.current = agents;

  const t = theme.theme;
  const style = theme.bubbles.style || t.bubbles?.style;
  const shown = visibleBubbles(allBubbles, zoom, style);
  const byAgent = new Map(shown.map((b) => [b.agent, b]));

  const placed: Placed[] = useMemo(() => {
    const list: Placed[] = Object.values(agents)
      .sort((a, b) => a.order - b.order)
      .map((a) => {
        const st = displayState(a, now);
        const role = t.roles?.[a.role] ?? t.roles?.builder;
        const home = zoneAnchor(t, role?.zone, "zone:main_hall");
        let anchor = home;
        const move = t.states?.[st]?.moveTo;
        if (st === "idle") {
          if (now - a.stateSince > IDLE_WANDER_MS) anchor = zoneAnchor(t, "lounge", home);
        } else if (move && st !== "offline") {
          anchor = zoneAnchor(t, move, home);
        }
        return { agent: a, anchor };
      });
    for (const g of ghosts.current.values()) list.push({ agent: g.agent, anchor: "zone:teleport_array", leaving: true });
    return list;
  }, [agents, now, t]);

  // Seat slots per anchor, in stable agent order.
  const slots = new Map<string, number>();
  const spawn = ANCHORS["zone:teleport_array"].pos;

  return (
    <>
      {placed.map(({ agent, anchor, leaving }) => {
        const slot = slots.get(anchor) ?? 0;
        slots.set(anchor, slot + 1);
        const seat = seatPosition(anchor, slot);
        const st = leaving ? "idle" : displayState(agent, now);
        const role = t.roles?.[agent.role];
        return (
          <Character
            key={agent.id + (leaving ? ":ghost" : "")}
            agent={agent}
            state={st}
            target={leaving ? spawn : seat.pos}
            facing={seat.facing}
            title={role?.title ?? agent.role}
            rankLabel={rankLabel(t.ranks, agent.rank)}
            selected={selected === agent.id}
            bubble={leaving ? undefined : byAgent.get(agent.id)}
            showLabel={zoom !== "overview"}
            spawnFrom={leaving ? undefined : spawn}
            leaving={leaving}
            onSelect={(id) => select(selected === id ? undefined : id)}
          />
        );
      })}
      <Flights flights={flights} />
    </>
  );
}

function useTeleportPulse() {
  const agents = useWorld((s) => s.agents);
  const [pulse, setPulse] = useState(0);
  const count = useRef(0);
  const n = Object.keys(agents).length;
  useEffect(() => {
    if (n !== count.current) {
      count.current = n;
      setPulse(1);
      const i = setInterval(() => setPulse((p) => (p > 0.05 ? p * 0.85 : 0)), 80);
      const t = setTimeout(() => clearInterval(i), 2500);
      return () => { clearInterval(i); clearTimeout(t); };
    }
  }, [n]);
  return pulse;
}

function SkyAndLight({ mood }: { mood: Mood }) {
  const sun = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const target = mood === "tribulation" ? 0.35 : mood === "unstable" ? 0.75 : 1;
  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * 1.5);
    sun.current.intensity += (2.6 * target - sun.current.intensity) * k;
    hemi.current.intensity += (1.1 * (0.5 + target * 0.5) - hemi.current.intensity) * k;
    const fog = state.scene.fog as THREE.Fog | null;
    if (!fog) return;
    const want = new THREE.Color(mood === "tribulation" ? "#6b6476" : mood === "unstable" ? "#d8c9a8" : "#f1e2c8");
    fog.color.lerp(want, k);
  });
  return (
    <>
      <Sky
        distance={4500}
        sunPosition={mood === "tribulation" ? [10, 2, -60] : [60, 18, -80]}
        turbidity={mood === "tribulation" ? 18 : 6}
        rayleigh={mood === "tribulation" ? 0.4 : 1.6}
        mieCoefficient={0.006}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={["#f1e2c8", 70, 190]} />
      <hemisphereLight ref={hemi} args={["#fff1dc", "#6f7f94", 1.1]} />
      <directionalLight
        ref={sun}
        position={[28, 42, 18]}
        intensity={2.6}
        color="#ffe7c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

export function XianxiaScene({ theme }: { theme: ResolvedTheme }) {
  const mood = useMood();
  const pulse = useTeleportPulse();
  const working = useWorld((s) => Object.values(s.agents).filter((a) => a.role === "builder" && (a.state === "tool_call" || a.state === "thinking")).length);
  const select = useWorld((s) => s.select);

  return (
    <group onPointerMissed={() => select(undefined)}>
      <SkyAndLight mood={mood} />
      <Tribulation active={mood === "tribulation"} />

      {/* main peak */}
      <Peak position={[0, 0, -2]} radius={14} height={18} seed={1.3} />
      <GrassTop position={[0, 0, -2]} radius={14} />
      <Plaza position={[0, 0, -1.2]} radius={5.2} />
      <StonePath from={[0, 4]} to={[0, 11.6]} width={2.4} />
      <StonePath from={[3.2, -1]} to={[13.4, -1]} width={1.6} />
      <StonePath from={[-3.2, -1.5]} to={[-13.6, -1.5]} width={1.6} />
      <StonePath from={[2.5, -4]} to={[9.5, -11]} width={1.4} />
      <Hall position={[0, 0, -9.6]} w={9} d={5} colH={2.5} tiers={2} />
      <Paifang position={[0, 0, 11.4]} />
      <TeleportArray position={[-0.2, 0, 5.4]} pulse={pulse} />
      <GrandArray position={[7.5, 0, 3]} mood={mood} />
      <Pond position={[-7.8, 0, 4.4]} radius={1.6} />
      {[-1.6, 1.6].map((x) => [6.5, 8.6].map((z) => <Lantern key={`${x}${z}`} position={[x, 0, z]} />))}
      {[-4, 4].map((x) => <Lantern key={x} position={[x, 0, -5.6]} />)}
      <PineRing center={[0, -2]} radius={14} count={26} seed={5} skip={[[0, 0.3], [Math.PI, 0.3], [Math.PI / 2, 0.3], [-Math.PI / 4, 0.4]]} />

      {/* scripture pavilion peak (west) */}
      <Peak position={[-21, 0.4, -1.5]} radius={5.4} height={12} seed={2.7} />
      <GrassTop position={[-21, 0.4, -1.5]} radius={5.4} />
      <Pagoda position={[-21, 0.4, -3.4]} floors={3} size={3.6} />
      <Bridge from={[-13.9, 0.05, -1.5]} to={[-15.8, 0.45, -1.5]} />
      <PineRing center={[-21, -1.5]} radius={5.4} count={7} seed={8} y={0.4} skip={[[0, 0.5]]} />

      {/* alchemy peak (east) */}
      <Peak position={[21, 0.4, -0.5]} radius={5.6} height={13} seed={3.9} />
      <GrassTop position={[21, 0.4, -0.5]} radius={5.6} />
      <Hall position={[21, 0.4, -4.2]} w={5} d={3} colH={2} plaque base={0.4} />
      <Cauldron position={[21, 0.4, -0.5]} active={Math.min(1, working)} />
      <Bridge from={[13.9, 0.05, -1]} to={[15.6, 0.45, -0.8]} />
      <PineRing center={[21, -0.5]} radius={5.6} count={7} seed={9} y={0.4} skip={[[Math.PI, 0.5]]} />

      {/* cave abode peak (north-east, higher) */}
      <Peak position={[15, 2.2, -17]} radius={3.8} height={11} seed={5.1} />
      <GrassTop position={[15, 2.2, -17]} radius={3.8} />
      <CaveAbode position={[15, 2.2, -18]} />
      <Bridge from={[9.6, 0.05, -11.2]} to={[12.6, 2.2, -14.6]} />

      <DistantPeaks />
      <FloatingRocks />
      <CloudSea tint={mood === "tribulation" ? "#b8b2c4" : "#ffffff"} />
      <Cranes />

      <Agents theme={theme} />
    </group>
  );
}
