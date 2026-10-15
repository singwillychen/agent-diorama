// Procedural chibi cultivator (~3.5 heads tall) with physically based cloth,
// skin and metal. Every pose is driven by the agent's display state.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { AgentState, AgentView } from "../../engine/types";
import type { Bubble } from "../../engine/bubbles";
import { agentPositions } from "./Effects";

const ROLE_PALETTE: Record<string, { robe: string; accent: string }> = {
  orchestrator: { robe: "#f2efe6", accent: "#c9a23a" },
  planner: { robe: "#4b3f6b", accent: "#9b87d6" },
  researcher: { robe: "#3d6f8f", accent: "#9fd0e8" },
  builder: { robe: "#9e3b2e", accent: "#f0b45a" },
  reviewer: { robe: "#4a4f57", accent: "#c0c6cf" },
  monitor: { robe: "#2f6b72", accent: "#7fd6d0" },
  communicator: { robe: "#5f7f4a", accent: "#d8e6a8" },
  designer: { robe: "#2b2b33", accent: "#e8e4da" },
  subagent: { robe: "#b9b2a2", accent: "#6f8f6a" },
};

const SKIN = "#f3d3bb";

export interface CharacterProps {
  agent: AgentView;
  state: AgentState;
  target: [number, number, number];
  facing: number;
  title: string;
  rankLabel?: string;
  selected: boolean;
  bubble?: Bubble;
  showLabel: boolean;
  spawnFrom?: [number, number, number];
  leaving?: boolean;
  onSelect: (id: string) => void;
}

const damp = (cur: number, to: number, k: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-k * dt));

function useMats(robe: string, accent: string, hair: string) {
  return useMemo(() => ({
    robe: new THREE.MeshPhysicalMaterial({ color: robe, roughness: 0.78, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(accent).lerp(new THREE.Color("#ffffff"), 0.5) }),
    robeInner: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(robe).multiplyScalar(0.72), roughness: 0.85, sheen: 0.6 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.5, sheen: 0.8, metalness: 0.05 }),
    skin: new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.55, sheen: 0.25, sheenColor: new THREE.Color("#ffd9c9"), clearcoat: 0.05 }),
    hair: new THREE.MeshPhysicalMaterial({ color: hair, roughness: 0.42, sheen: 1, sheenColor: new THREE.Color(hair).lerp(new THREE.Color("#ffffff"), 0.4), sheenRoughness: 0.3 }),
    eye: new THREE.MeshStandardMaterial({ color: "#1d1714", roughness: 0.15 }),
    white: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.6 }),
    blush: new THREE.MeshBasicMaterial({ color: "#ff9c9c", transparent: true, opacity: 0.35, depthWrite: false }),
    gold: new THREE.MeshStandardMaterial({ color: "#d6ae4a", metalness: 0.85, roughness: 0.28 }),
    boot: new THREE.MeshStandardMaterial({ color: "#2b2522", roughness: 0.6 }),
    mouth: new THREE.MeshStandardMaterial({ color: "#7a3030", roughness: 0.6 }),
  }), [robe, accent, hair]);
}

export function Character(p: CharacterProps) {
  const { agent, state } = p;
  const look = agent.appearance || {};
  const pal = ROLE_PALETTE[agent.role] || ROLE_PALETTE.builder;
  const robeColor = look.robe || pal.robe;
  const accentColor = look.accent || pal.accent;
  const hairColor = look.hairColor || "#221a16";
  const mats = useMats(robeColor, accentColor, hairColor);

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const hips = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const eyes = useRef<THREE.Group>(null!);
  const browL = useRef<THREE.Mesh>(null!);
  const browR = useRef<THREE.Mesh>(null!);
  const mouth = useRef<THREE.Mesh>(null!);
  const orb = useRef<THREE.Mesh>(null!);
  const sword = useRef<THREE.Group>(null!);
  const pillar = useRef<THREE.Mesh>(null!);
  const smoke = useRef<THREE.Group>(null!);
  const slip = useRef<THREE.Mesh>(null!);

  const sim = useRef({
    pos: new THREE.Vector3(...(p.spawnFrom ?? p.target)),
    yaw: p.facing,
    moving: false,
    flying: false,
    flyFrom: new THREE.Vector3(),
    flyDist: 0,
    spawnT: p.spawnFrom ? 0 : 1,
    doneT: 0,
    lastState: state,
    sit: 0,
    leaveT: 0,
  });

  useEffect(() => () => { agentPositions.delete(agent.id); }, [agent.id]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.25);
    const t = clock.elapsedTime + agent.order * 1.7;
    const s = sim.current;
    if (s.lastState !== state) {
      if (state === "done") s.doneT = 0;
      s.lastState = state;
    }
    s.doneT += dt;
    s.spawnT = Math.min(1, s.spawnT + dt * 0.8);

    // ---- locomotion
    const target = new THREE.Vector3(...p.target);
    const delta = target.clone().sub(s.pos);
    delta.y = 0;
    const dist = delta.length();
    if (dist > 0.05) {
      if (!s.moving) {
        s.moving = true;
        s.flying = dist > 9;
        s.flyFrom.copy(s.pos);
        s.flyDist = dist;
      }
      const speed = s.flying ? 8 : 2.6;
      const step = Math.min(dist, speed * dt);
      s.pos.addScaledVector(delta.normalize(), step);
      s.yaw = Math.atan2(delta.x, delta.z);
    } else if (s.moving) {
      s.moving = false;
      s.flying = false;
      s.pos.x = target.x;
      s.pos.z = target.z;
    }
    // height: follow target y; arc while flying
    let y = damp(s.pos.y, target.y, 6, dt);
    s.pos.y = y;
    if (s.flying) {
      const progress = 1 - dist / Math.max(0.001, s.flyDist);
      y += Math.sin(progress * Math.PI) * Math.min(4, s.flyDist * 0.25) + 0.25;
    }
    root.current.position.set(s.pos.x, y, s.pos.z);
    agentPositions.set(agent.id, root.current.position);
    const wantYaw = s.moving ? s.yaw : p.facing;
    let dy = wantYaw - root.current.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.current.rotation.y += dy * (1 - Math.exp(-8 * dt));

    // ---- spawn / leave scale
    if (p.leaving) s.leaveT = Math.min(1, s.leaveT + dt * 0.9);
    const scale = THREE.MathUtils.smoothstep(s.spawnT, 0, 1) * (1 - THREE.MathUtils.smoothstep(s.leaveT, 0.3, 1));
    root.current.scale.setScalar(Math.max(0.001, scale));
    const pm = pillar.current.material as THREE.MeshStandardMaterial;
    const pillarOn = (p.spawnFrom && s.spawnT < 1 ? 1 - s.spawnT : 0) + (p.leaving ? s.leaveT : 0) + (state === "done" ? Math.max(0, 1 - s.doneT / 3) : 0);
    pm.opacity = Math.min(0.8, pillarOn * 0.8);
    pillar.current.visible = pillarOn > 0.01;
    pillar.current.scale.set(1, 0.6 + pillarOn, 1);

    // ---- pose targets
    const walking = s.moving && !s.flying;
    const seated = !s.moving && (state === "thinking" || state === "long_running" || state === "retrying");
    s.sit = damp(s.sit, seated ? 1 : 0, 6, dt);

    let armLx = 0, armRx = 0, armLz = 0.18, armRz = -0.18;
    let headX = 0, headZ = 0, bodyY = 0, bodyZ = 0;
    let eyeOpen = 1, browTilt = 0, mouthOpen = 0;
    const breathe = Math.sin(t * 2) * 0.012;

    if (walking) {
      const w = Math.sin(t * 10);
      armLx = w * 0.6; armRx = -w * 0.6;
      bodyY = Math.abs(Math.cos(t * 10)) * 0.05;
      legL.current.rotation.x = -w * 0.5;
      legR.current.rotation.x = w * 0.5;
    } else {
      legL.current.rotation.x = damp(legL.current.rotation.x, 0, 10, dt);
      legR.current.rotation.x = damp(legR.current.rotation.x, 0, 10, dt);
    }

    if (s.flying) {
      armLz = 0.5; armRz = -0.5; bodyZ = Math.sin(t * 2) * 0.05;
    } else if (!walking) {
      switch (state) {
        case "idle":
          headZ = Math.sin(t * 0.5) * 0.08;
          headX = Math.sin(t * 0.33) * 0.05;
          armLx = 0.1; armRx = 0.1; armLz = 0.25; armRz = -0.25;
          break;
        case "thinking":
        case "retrying":
        case "long_running":
          armLx = -0.55; armRx = -0.55; armLz = -0.45; armRz = 0.45;
          eyeOpen = 0.08;
          headX = 0.08;
          break;
        case "tool_call":
          armLx = -1.25 + Math.sin(t * 7) * 0.12; armRx = -1.25 + Math.cos(t * 7) * 0.12;
          armLz = -0.15; armRz = 0.15;
          browTilt = 0.2;
          break;
        case "speaking":
          armRx = -1.0 + Math.sin(t * 6) * 0.25; armRz = -0.45;
          headX = Math.sin(t * 8) * 0.05;
          mouthOpen = 0.5 + Math.sin(t * 14) * 0.5;
          break;
        case "listening":
          headZ = 0.18;
          break;
        case "meeting":
          armLx = -0.2; armRx = -0.5 + Math.sin(t * 2) * 0.2;
          headX = Math.sin(t * 1.3) * 0.05;
          break;
        case "waiting_human":
          armRx = -2.8 + Math.sin(t * 4) * 0.12; armRz = -0.2;
          headX = -0.15; browTilt = -0.35;
          break;
        case "blocked":
          headX = 0.35; armLx = -0.3; armRx = -0.3; armLz = 0.05; armRz = -0.05;
          browTilt = -0.4; eyeOpen = 0.6;
          bodyZ = Math.sin(t * 1.2) * 0.03;
          break;
        case "error":
          bodyZ = Math.sin(t * 40) * 0.05;
          armLx = -2.4; armRx = -2.4; armLz = 0.4; armRz = -0.4;
          browTilt = -0.5; mouthOpen = 1; eyeOpen = 1.25;
          break;
        case "done": {
          const hop = Math.max(0, Math.sin(Math.min(s.doneT, 1.2) * Math.PI * 2.5)) * 0.35 * Math.max(0, 1 - s.doneT / 1.5);
          bodyY = hop;
          armLx = -2.7; armRx = -2.7; armLz = 0.3; armRz = -0.3;
          eyeOpen = 0.25; mouthOpen = 0.6;
          break;
        }
        default:
          break;
      }
    }

    const k = 10;
    armL.current.rotation.x = damp(armL.current.rotation.x, armLx, k, dt);
    armR.current.rotation.x = damp(armR.current.rotation.x, armRx, k, dt);
    armL.current.rotation.z = damp(armL.current.rotation.z, armLz, k, dt);
    armR.current.rotation.z = damp(armR.current.rotation.z, armRz, k, dt);
    head.current.rotation.x = damp(head.current.rotation.x, headX, 6, dt);
    head.current.rotation.z = damp(head.current.rotation.z, headZ, 6, dt);
    body.current.position.y = damp(body.current.position.y, bodyY - s.sit * 0.22, 14, dt) + breathe;
    body.current.rotation.z = damp(body.current.rotation.z, bodyZ, 12, dt);
    hips.current.scale.x = hips.current.scale.z = 1 + s.sit * 0.4;
    legL.current.visible = legR.current.visible = s.sit < 0.5;

    // blinking
    const blink = (t % 4.3) < 0.12 ? 0.1 : 1;
    eyes.current.scale.y = damp(eyes.current.scale.y, eyeOpen * blink, 20, dt);
    browL.current.rotation.z = damp(browL.current.rotation.z, browTilt, 10, dt);
    browR.current.rotation.z = damp(browR.current.rotation.z, -browTilt, 10, dt);
    mouth.current.scale.y = damp(mouth.current.scale.y, 0.35 + mouthOpen * 1.4, 18, dt);

    // effects
    const casting = state === "tool_call" && !s.moving;
    orb.current.visible = casting;
    if (casting) orb.current.scale.setScalar(0.8 + Math.sin(t * 9) * 0.2);
    sword.current.visible = s.flying;
    smoke.current.visible = state === "error";
    if (state === "error") {
      smoke.current.children.forEach((c, i) => {
        const ph = (t * 0.7 + i / 6) % 1;
        c.position.set(Math.sin(i * 2.1 + t) * 0.3, 0.6 + ph * 1.4, Math.cos(i * 1.7 + t) * 0.3);
        c.scale.setScalar(0.12 + ph * 0.25);
        ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - ph);
      });
    }
    slip.current.visible = state === "waiting_human";
    if (slip.current.visible) {
      slip.current.position.y = 1.95 + Math.sin(t * 3) * 0.06;
      (slip.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(t * 8) * 1.2;
    }
  });

  const female = !!look.female;
  const elder = !!look.beard;
  const showQi = (state === "thinking" || state === "long_running" || state === "retrying") ;
  const qiColor = state === "retrying" ? "#8fb8ff" : accentColor;
  const rankGlow = Math.min(1, (agent.rank ?? 3) / 9);

  return (
    <group ref={root} onClick={(e) => { e.stopPropagation(); p.onSelect(agent.id); }}>
      {/* rank aura + selection ring */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[0.42, 0.5 + rankGlow * 0.12, 40]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.4 + rankGlow * 1.2} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {p.selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
          <ringGeometry args={[0.66, 0.74, 48]} />
          <meshBasicMaterial color="#fff6c8" transparent opacity={0.9} />
        </mesh>
      )}
      <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {/* flying sword */}
      <group ref={sword} position-y={-0.08} visible={false}>
        <mesh rotation-y={Math.PI / 2}>
          <boxGeometry args={[1.6, 0.04, 0.16]} />
          <meshStandardMaterial color="#cfe8ff" metalness={0.9} roughness={0.15} emissive="#7fc8ff" emissiveIntensity={1.2} />
        </mesh>
      </group>

      <group ref={body}>
        {/* legs */}
        <group ref={hips}>
          <group ref={legL} position={[-0.09, 0.36, 0]}>
            <mesh position-y={-0.16} castShadow material={mats.robeInner}>
              <cylinderGeometry args={[0.06, 0.065, 0.3, 10]} />
            </mesh>
            <mesh position={[0, -0.31, 0.035]} castShadow material={mats.boot} scale={[1, 0.7, 1.4]}>
              <sphereGeometry args={[0.075, 12, 10]} />
            </mesh>
          </group>
          <group ref={legR} position={[0.09, 0.36, 0]}>
            <mesh position-y={-0.16} castShadow material={mats.robeInner}>
              <cylinderGeometry args={[0.06, 0.065, 0.3, 10]} />
            </mesh>
            <mesh position={[0, -0.31, 0.035]} castShadow material={mats.boot} scale={[1, 0.7, 1.4]}>
              <sphereGeometry args={[0.075, 12, 10]} />
            </mesh>
          </group>
          {/* robe skirt */}
          <mesh position-y={0.47} castShadow material={mats.robe}>
            <cylinderGeometry args={[0.2, 0.34, 0.5, 20, 1, true]} />
          </mesh>
          <mesh position-y={0.47} material={mats.robeInner}>
            <cylinderGeometry args={[0.19, 0.33, 0.49, 20, 1, true]} />
          </mesh>
          {/* hem trim */}
          <mesh position-y={0.23} rotation-x={Math.PI / 2} material={mats.accent}>
            <torusGeometry args={[0.335, 0.018, 6, 28]} />
          </mesh>
        </group>

        {/* torso */}
        <group position-y={0.49}>
          <mesh position-y={0.2} castShadow material={mats.robe}>
            <cylinderGeometry args={[0.15, 0.2, 0.42, 18]} />
          </mesh>
          {/* crossed collar (交領) */}
          <mesh position={[0.035, 0.27, 0.15]} rotation={[0.25, 0, -0.55]} material={mats.accent}>
            <boxGeometry args={[0.04, 0.28, 0.02]} />
          </mesh>
          <mesh position={[-0.04, 0.29, 0.148]} rotation={[0.25, 0, 0.55]} material={mats.accent}>
            <boxGeometry args={[0.04, 0.24, 0.02]} />
          </mesh>
          {/* sash */}
          <mesh position-y={0.04} rotation-x={Math.PI / 2} material={mats.accent} castShadow>
            <torusGeometry args={[0.185, 0.04, 8, 24]} />
          </mesh>
          <mesh position={[0.06, -0.06, 0.18]} rotation-z={0.15} material={mats.accent}>
            <boxGeometry args={[0.05, 0.18, 0.02]} />
          </mesh>

          {/* arms (shoulder pivots) */}
          {[[-1, armL], [1, armR]].map(([side, ref]) => (
            <group key={side as number} ref={ref as React.RefObject<THREE.Group>} position={[(side as number) * 0.19, 0.36, 0]}>
              <mesh position={[(side as number) * 0.03, -0.17, 0]} castShadow material={mats.robe}>
                <cylinderGeometry args={[0.055, 0.12, 0.34, 12]} />
              </mesh>
              <mesh position={[(side as number) * 0.035, -0.34, 0]} rotation-x={Math.PI / 2} material={mats.accent}>
                <torusGeometry args={[0.11, 0.014, 6, 18]} />
              </mesh>
              <mesh position={[(side as number) * 0.03, -0.36, 0.0]} castShadow material={mats.skin}>
                <sphereGeometry args={[0.05, 12, 10]} />
              </mesh>
              {side === 1 && <RoleProp role={agent.role} mats={mats} />}
            </group>
          ))}
          {/* casting orb between the hands */}
          <mesh ref={orb} position={[0, 0.12, 0.38]} visible={false}>
            <sphereGeometry args={[0.09, 16, 12]} />
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={4} toneMapped={false} />
          </mesh>
        </group>

        {/* head */}
        <group ref={head} position-y={0.96}>
          <group position-y={0.2}>
            <mesh castShadow material={mats.skin} scale={[1, 0.96, 0.97]}>
              <sphereGeometry args={[0.235, 32, 24]} />
            </mesh>
            {/* ears */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.228, -0.01, 0]} scale={[0.5, 1, 0.8]} material={mats.skin}>
                <sphereGeometry args={[0.05, 10, 8]} />
              </mesh>
            ))}
            {/* hair shell (back + top) */}
            <mesh position={[0, 0.03, -0.03]} material={mats.hair} castShadow scale={[1.04, 1.02, 1.02]}>
              <sphereGeometry args={[0.24, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
            <mesh position={[0, -0.02, -0.06]} material={mats.hair} scale={[1.02, 1, 0.9]}>
              <sphereGeometry args={[0.24, 24, 16, Math.PI * 0.15, Math.PI * 0.7 + Math.PI, Math.PI * 0.35, Math.PI * 0.4]} />
            </mesh>
            {/* fringe */}
            <mesh position={[0, 0.12, 0.13]} rotation-x={0.5} scale={[1.05, 0.38, 0.55]} material={mats.hair}>
              <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            {/* top knot + crown (髮冠) */}
            <mesh position={[0, 0.25, -0.02]} material={mats.hair} castShadow>
              <sphereGeometry args={[0.085, 16, 12]} />
            </mesh>
            <mesh position={[0, 0.27, -0.02]} material={mats.gold}>
              <cylinderGeometry args={[0.06, 0.075, 0.07, 12]} />
            </mesh>
            <mesh position={[0, 0.28, -0.02]} rotation-z={Math.PI / 2} material={mats.gold}>
              <cylinderGeometry args={[0.01, 0.01, 0.3, 6]} />
            </mesh>
            {female && (
              <>
                <mesh position={[0, -0.12, -0.17]} scale={[0.75, 1.6, 0.5]} material={mats.hair} castShadow>
                  <sphereGeometry args={[0.16, 16, 12]} />
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * 0.2, 0.1, -0.04]} material={mats.hair}>
                    <sphereGeometry args={[0.065, 12, 10]} />
                  </mesh>
                ))}
              </>
            )}
            {elder && (
              <mesh position={[0, -0.23, 0.13]} rotation-x={0.25} material={mats.hair} castShadow>
                <coneGeometry args={[0.09, 0.3, 10]} />
              </mesh>
            )}
            {/* face */}
            <group ref={eyes} position={[0, -0.02, 0.205]}>
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.08, 0, 0]}>
                  <mesh material={mats.eye} scale={[0.034, 0.05, 0.02]}>
                    <sphereGeometry args={[1, 14, 10]} />
                  </mesh>
                  <mesh position={[0.012, 0.018, 0.016]} material={mats.white} scale={0.011}>
                    <sphereGeometry args={[1, 8, 6]} />
                  </mesh>
                </group>
              ))}
            </group>
            <mesh ref={browL} position={[-0.08, 0.06, 0.215]} material={mats.hair}>
              <boxGeometry args={[0.06, 0.012, 0.01]} />
            </mesh>
            <mesh ref={browR} position={[0.08, 0.06, 0.215]} material={mats.hair}>
              <boxGeometry args={[0.06, 0.012, 0.01]} />
            </mesh>
            <mesh ref={mouth} position={[0, -0.1, 0.212]} material={mats.mouth} scale={[0.025, 0.012, 0.01]}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.13, -0.07, 0.19]} rotation-y={s * 0.6} material={mats.blush}>
                <circleGeometry args={[0.035, 14]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>

      {/* effects */}
      {showQi && !p.leaving && (
        <Sparkles count={24} scale={[1.4, 1.6, 1.4]} position-y={0.8} size={3} speed={0.6} color={qiColor} opacity={0.9} />
      )}
      {state === "done" && <Sparkles count={30} scale={[1.2, 2.4, 1.2]} position-y={1.2} size={4} speed={1.4} color="#ffe28a" />}
      <group ref={smoke} visible={false}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#1a1420" transparent opacity={0.6} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh ref={slip} position={[0, 1.95, 0]} visible={false}>
        <boxGeometry args={[0.16, 0.34, 0.03]} />
        <meshStandardMaterial color="#d8f5c8" emissive="#ffd54a" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh ref={pillar} position-y={3} visible={false}>
        <cylinderGeometry args={[0.55, 0.75, 6, 24, 1, true]} />
        <meshStandardMaterial color="#fff2c0" emissive="#ffe08a" emissiveIntensity={2.5} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>

      {(p.showLabel || p.selected || p.bubble) && (
        <Html position={[0, 1.85, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="char-overlay">
            {p.bubble && <div className={`bubble bubble-${p.bubble.kind}`}>{p.bubble.text}</div>}
            {(p.showLabel || p.selected) && (
              <div className={`nametag ${p.selected ? "selected" : ""}`}>
                <span className="vendor-dot" data-vendor={agent.vendor || "unknown"} />
                <b>{agent.name}</b>
                <span className="nametag-title">{p.title}{p.rankLabel ? `・${p.rankLabel}` : ""}</span>
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function RoleProp({ role, mats }: { role: string; mats: ReturnType<typeof useMats> }) {
  const hand: [number, number, number] = [0.03, -0.38, 0.05];
  switch (role) {
    case "orchestrator": // horsetail whisk (拂塵)
      return (
        <group position={hand} rotation-x={0.4}>
          <mesh position-y={0.1} material={mats.gold}><cylinderGeometry args={[0.012, 0.012, 0.28, 6]} /></mesh>
          <mesh position-y={-0.12}><coneGeometry args={[0.06, 0.3, 10]} /><meshStandardMaterial color="#f4f1ea" roughness={1} /></mesh>
        </group>
      );
    case "researcher": // jade slip
      return (
        <mesh position={hand} rotation-x={-0.6}>
          <boxGeometry args={[0.09, 0.18, 0.02]} />
          <meshPhysicalMaterial color="#a8d8b0" roughness={0.2} clearcoat={1} />
        </mesh>
      );
    case "monitor": // formation flag
      return (
        <group position={hand}>
          <mesh position-y={0.18}><cylinderGeometry args={[0.01, 0.01, 0.5, 6]} /><meshStandardMaterial color="#5a4433" /></mesh>
          <mesh position={[0.07, 0.36, 0]}><planeGeometry args={[0.13, 0.15]} /><meshStandardMaterial color="#2f6b72" side={THREE.DoubleSide} /></mesh>
        </group>
      );
    case "reviewer": // scroll of precepts
      return (
        <mesh position={hand} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 10]} />
          <meshStandardMaterial color="#efe3c8" />
        </mesh>
      );
    case "builder": // gourd
      return (
        <group position={hand}>
          <mesh position-y={-0.03}><sphereGeometry args={[0.05, 12, 10]} /><meshStandardMaterial color="#c99a3a" roughness={0.4} /></mesh>
          <mesh position-y={0.04}><sphereGeometry args={[0.035, 12, 10]} /><meshStandardMaterial color="#c99a3a" roughness={0.4} /></mesh>
        </group>
      );
    case "designer": // brush
      return (
        <mesh position={hand} rotation-x={0.3}>
          <cylinderGeometry args={[0.008, 0.012, 0.24, 6]} />
          <meshStandardMaterial color="#3a2a1e" />
        </mesh>
      );
    default:
      return null;
  }
}
