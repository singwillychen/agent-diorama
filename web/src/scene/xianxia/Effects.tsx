// Message visuals: talismans (傳音符) flying between agents, thousand-li
// voice rings for broadcasts, and the tribulation sky for alarms.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import type { Flight } from "../../engine/types";

/** Live positions written by each Character every frame. */
export const agentPositions = new Map<string, THREE.Vector3>();

const FLIGHT_MS = 1400;

function Talisman({ flight }: { flight: Flight }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    const from = agentPositions.get(flight.from);
    const to = agentPositions.get(flight.to as string);
    const g = ref.current;
    if (!from || !to) { g.visible = false; return; }
    const t = Math.min(1, (Date.now() - flight.start) / FLIGHT_MS);
    g.visible = t < 1;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const p = from.clone().lerp(to, e);
    p.y += 1.3 + Math.sin(e * Math.PI) * (1.5 + from.distanceTo(to) * 0.12);
    g.position.copy(p);
    g.rotation.y += 0.25;
    g.rotation.z = Math.sin(t * 20) * 0.3;
  });
  return (
    <Trail width={0.6} length={5} color="#ffe6a0" attenuation={(w) => w * w}>
      <group ref={ref}>
        <mesh>
          <planeGeometry args={[0.22, 0.38]} />
          <meshStandardMaterial color="#f3d86a" emissive="#ffcf4a" emissiveIntensity={1.6} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position-z={0.002}>
          <planeGeometry args={[0.05, 0.28]} />
          <meshBasicMaterial color="#b3261e" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </Trail>
  );
}

function VoiceRing({ flight }: { flight: Flight }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const from = agentPositions.get(flight.from);
    const t = (Date.now() - flight.start) / 2200;
    const m = ref.current;
    if (!from || t > 1) { m.visible = false; return; }
    m.visible = true;
    m.position.set(from.x, from.y + 0.15, from.z);
    m.scale.setScalar(0.5 + t * 22);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.92, 1, 64]} />
      <meshBasicMaterial color="#ffe6a0" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function Flights({ flights }: { flights: Flight[] }) {
  return (
    <>
      {flights.map((f) => (f.to === "*" ? <VoiceRing key={f.id} flight={f} /> : <Talisman key={f.id} flight={f} />))}
    </>
  );
}

/** Dark storm clouds + lightning flashes when the sect is in trouble. */
export function Tribulation({ active }: { active: boolean }) {
  const light = useRef<THREE.PointLight>(null!);
  const clouds = useRef<THREE.Group>(null!);
  const level = useRef(0);
  useFrame(({ clock }, dt) => {
    level.current += ((active ? 1 : 0) - level.current) * Math.min(1, dt * 1.5);
    const l = level.current;
    clouds.current.visible = l > 0.02;
    clouds.current.rotation.y += dt * 0.05;
    clouds.current.children.forEach((c) => {
      ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.75 * l;
    });
    const t = clock.elapsedTime;
    const flash = active && (Math.sin(t * 1.7) > 0.985 || Math.sin(t * 2.9 + 1) > 0.99) ? 1 : 0;
    light.current.intensity = flash * 1500 * l;
  });
  return (
    <group position={[0, 20, -4]}>
      <pointLight ref={light} color="#cfd8ff" distance={90} decay={1.2} />
      <group ref={clouds}>
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 14, Math.sin(i * 3) * 1.2, Math.sin(a) * 14]} scale={[6, 1.8, 4]}>
              <icosahedronGeometry args={[1, 2]} />
              <meshStandardMaterial color="#3b3546" roughness={1} transparent opacity={0} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

if (import.meta.env.DEV) (window as any).__dioramaPositions = agentPositions;
