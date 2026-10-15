// Procedural sect architecture: halls with upturned hip roofs, pagoda,
// alchemy room, mountain gate, teleport array, grand formation, cave abode.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const C = {
  stone: "#d8d0bf",
  stoneDark: "#b9b09d",
  pillar: "#9b2d24",
  wall: "#efe3c8",
  lattice: "#7a3a2a",
  beam: "#2f5f5a",
  trim: "#c9a23a",
  roof: "#36424d",
  roofEdge: "#2a333b",
  wood: "#6b4a33",
};

function hipRoofGeometry(w: number, d: number, h: number, lift: number) {
  const hw = w / 2, hd = d / 2;
  const rw = Math.max(0.2, (w - d) / 2 + 0.25);
  const P = {
    FL: [-hw, lift, hd], FM: [0, 0, hd], FR: [hw, lift, hd],
    BL: [-hw, lift, -hd], BM: [0, 0, -hd], BR: [hw, lift, -hd],
    LM: [-hw, 0, 0], RM: [hw, 0, 0],
    RL: [-rw, h, 0], RR: [rw, h, 0],
    FLm: [-hw * 0.5, lift * 0.2, hd], FRm: [hw * 0.5, lift * 0.2, hd],
    BLm: [-hw * 0.5, lift * 0.2, -hd], BRm: [hw * 0.5, lift * 0.2, -hd],
  } as Record<string, number[]>;
  const tris = [
    // front
    ["FL", "FLm", "RL"], ["FLm", "FM", "RL"], ["FM", "RR", "RL"], ["FM", "FRm", "RR"], ["FRm", "FR", "RR"],
    // back
    ["BR", "BRm", "RR"], ["BRm", "BM", "RR"], ["BM", "RL", "RR"], ["BM", "BLm", "RL"], ["BLm", "BL", "RL"],
    // right
    ["FR", "RM", "RR"], ["RM", "BR", "RR"],
    // left
    ["BL", "LM", "RL"], ["LM", "FL", "RL"],
  ];
  const verts: number[] = [];
  for (const t of tris) for (const k of t) verts.push(...P[k]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return { geo: g, ridge: rw * 2 };
}

export function Roof({ w, d, h, lift = 0.45, y = 0, color = C.roof }: { w: number; d: number; h: number; lift?: number; y?: number; color?: string }) {
  const { geo, ridge } = useMemo(() => hipRoofGeometry(w, d, h, lift), [w, d, h, lift]);
  return (
    <group position-y={y}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} side={THREE.DoubleSide} flatShading />
      </mesh>
      {/* eave fascia */}
      <mesh position-y={-0.06} castShadow>
        <boxGeometry args={[w * 0.92, 0.12, d * 0.92]} />
        <meshStandardMaterial color={C.roofEdge} roughness={0.8} />
      </mesh>
      {/* ridge with chiwen ornaments */}
      <mesh position-y={h + 0.06} castShadow>
        <boxGeometry args={[ridge + 0.3, 0.22, 0.24]} />
        <meshStandardMaterial color={C.roofEdge} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ridge / 2 + 0.2), h + 0.35, 0]} rotation-z={s * -0.35} castShadow>
          <coneGeometry args={[0.16, 0.6, 6]} />
          <meshStandardMaterial color={C.trim} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Columns({ w, d, h, spacing = 1.5 }: { w: number; d: number; h: number; spacing?: number }) {
  const pts: [number, number][] = [];
  const nx = Math.max(2, Math.round(w / spacing) + 1);
  const nz = Math.max(2, Math.round(d / spacing) + 1);
  for (let i = 0; i < nx; i++) {
    const x = -w / 2 + (w * i) / (nx - 1);
    pts.push([x, d / 2], [x, -d / 2]);
  }
  for (let j = 1; j < nz - 1; j++) {
    const z = -d / 2 + (d * j) / (nz - 1);
    pts.push([w / 2, z], [-w / 2, z]);
  }
  return (
    <>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={h / 2} castShadow>
            <cylinderGeometry args={[0.16, 0.18, h, 12]} />
            <meshStandardMaterial color={C.pillar} roughness={0.5} />
          </mesh>
          <mesh position-y={0.08}>
            <cylinderGeometry args={[0.26, 0.28, 0.16, 12]} />
            <meshStandardMaterial color={C.stoneDark} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Stairs({ width, depth, height, steps = 4 }: { width: number; depth: number; height: number; steps?: number }) {
  return (
    <>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, (height * (i + 0.5)) / steps, depth - (depth * (i + 0.5)) / steps]} receiveShadow castShadow>
          <boxGeometry args={[width, height / steps, depth / steps]} />
          <meshStandardMaterial color={i % 2 ? C.stone : C.stoneDark} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

/** A Chinese hall. `tiers=2` gives a double-eave roof (重簷). */
export function Hall({
  position, rotation = 0, w = 8, d = 5, colH = 2.4, tiers = 1, plaque = true, base = 0.6,
}: { position: [number, number, number]; rotation?: number; w?: number; d?: number; colH?: number; tiers?: 1 | 2; plaque?: boolean; base?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      {/* platform + front stairs */}
      <mesh position-y={base / 2} receiveShadow castShadow>
        <boxGeometry args={[w + 2, base, d + 2]} />
        <meshStandardMaterial color={C.stone} roughness={0.9} />
      </mesh>
      <group position={[0, 0, d / 2 + 1]}>
        <Stairs width={Math.min(3.2, w * 0.45)} depth={1.1} height={base} />
      </group>
      <group position-y={base}>
        <Columns w={w} d={d} h={colH} />
        {/* walls set back from the colonnade */}
        <mesh position-y={colH / 2} castShadow receiveShadow>
          <boxGeometry args={[w - 1.2, colH, d - 1.2]} />
          <meshStandardMaterial color={C.wall} roughness={0.85} />
        </mesh>
        {/* lattice doors */}
        {[-1, 0, 1].map((k) => (
          <mesh key={k} position={[k * (w * 0.2), colH * 0.42, (d - 1.2) / 2 + 0.01]}>
            <planeGeometry args={[w * 0.16, colH * 0.8]} />
            <meshStandardMaterial color={C.lattice} roughness={0.7} />
          </mesh>
        ))}
        {/* painted beam band */}
        <mesh position-y={colH + 0.18} castShadow>
          <boxGeometry args={[w + 0.45, 0.36, d + 0.45]} />
          <meshStandardMaterial color={C.beam} roughness={0.6} />
        </mesh>
        <mesh position-y={colH + 0.02}>
          <boxGeometry args={[w + 0.5, 0.06, d + 0.5]} />
          <meshStandardMaterial color={C.trim} metalness={0.5} roughness={0.4} />
        </mesh>
        {plaque && (
          <mesh position={[0, colH + 0.2, d / 2 + 0.25]}>
            <boxGeometry args={[1.6, 0.5, 0.06]} />
            <meshStandardMaterial color="#1f2a2c" roughness={0.4} emissive="#c9a23a" emissiveIntensity={0.08} />
          </mesh>
        )}
        <Roof w={w + 2.2} d={d + 2.2} h={tiers === 2 ? 1.2 : 1.9} lift={0.55} y={colH + 0.36} />
        {tiers === 2 && (
          <group position-y={colH + 1.3}>
            <mesh position-y={0.45} castShadow>
              <boxGeometry args={[w * 0.62, 0.9, d * 0.6]} />
              <meshStandardMaterial color={C.beam} roughness={0.6} />
            </mesh>
            <Roof w={w * 0.62 + 2} d={d * 0.6 + 2} h={1.6} lift={0.5} y={0.9} />
          </group>
        )}
      </group>
    </group>
  );
}

/** Multi-storey pagoda — the scripture pavilion (藏經閣). */
export function Pagoda({ position, floors = 3, size = 4.2 }: { position: [number, number, number]; floors?: number; size?: number }) {
  let y = 0.5;
  const parts: React.ReactElement[] = [];
  for (let i = 0; i < floors; i++) {
    const s = size * (1 - i * 0.18);
    const h = 1.7 - i * 0.15;
    parts.push(
      <group key={i} position-y={y}>
        <mesh position-y={h / 2} castShadow receiveShadow>
          <boxGeometry args={[s, h, s]} />
          <meshStandardMaterial color={i % 2 ? C.wall : "#e9dcc0"} roughness={0.85} />
        </mesh>
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r) => (
          <mesh key={r} rotation-y={r} position={[Math.sin(r) * (s / 2 + 0.01), h * 0.45, Math.cos(r) * (s / 2 + 0.01)]}>
            <planeGeometry args={[s * 0.5, h * 0.6]} />
            <meshStandardMaterial color={C.lattice} roughness={0.7} />
          </mesh>
        ))}
        <mesh position-y={h + 0.1}>
          <boxGeometry args={[s + 0.3, 0.2, s + 0.3]} />
          <meshStandardMaterial color={C.beam} roughness={0.6} />
        </mesh>
        <Roof w={s + 1.8} d={s + 1.8} h={0.9} lift={0.5} y={h + 0.2} />
      </group>,
    );
    y += h + 0.75;
  }
  return (
    <group position={position}>
      <mesh position-y={0.25} receiveShadow castShadow>
        <boxGeometry args={[size + 1.6, 0.5, size + 1.6]} />
        <meshStandardMaterial color={C.stone} roughness={0.9} />
      </mesh>
      {parts}
      <mesh position-y={y + 0.4} castShadow>
        <coneGeometry args={[0.18, 1.4, 8]} />
        <meshStandardMaterial color={C.trim} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Bronze tripod cauldron with flickering fire (煉丹爐). */
export function Cauldron({ position, active = 0 }: { position: [number, number, number]; active?: number }) {
  const fire = useRef<THREE.Mesh>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const geo = useMemo(() => {
    const pts = [
      [0.0, 0], [0.75, 0.05], [0.95, 0.35], [1.0, 0.75], [0.9, 1.05], [0.72, 1.18], [0.78, 1.28], [0.7, 1.3],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 32);
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = 0.6 + active * 0.8;
    fire.current.scale.set(1, k * (0.9 + Math.sin(t * 12) * 0.1 + Math.sin(t * 7.3) * 0.08), 1);
    light.current.intensity = (4 + Math.sin(t * 10) * 1.2) * k;
  });
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6]} castShadow>
            <cylinderGeometry args={[0.07, 0.11, 0.7, 8]} />
            <meshStandardMaterial color="#6f5631" metalness={0.8} roughness={0.35} />
          </mesh>
        );
      })}
      <mesh geometry={geo} position-y={0.55} castShadow>
        <meshStandardMaterial color="#8a6a3a" metalness={0.85} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.82, 1.95, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.18, 0.05, 8, 16]} />
          <meshStandardMaterial color="#8a6a3a" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      <mesh ref={fire} position-y={0.12}>
        <coneGeometry args={[0.5, 0.8, 12]} />
        <meshStandardMaterial color="#ff7a2a" emissive="#ff5a10" emissiveIntensity={3} transparent opacity={0.85} />
      </mesh>
      <pointLight ref={light} position={[0, 0.6, 0]} color="#ff8a3a" distance={7} />
    </group>
  );
}

export function Paifang({ position, width = 5.5, height = 3.6 }: { position: [number, number, number]; width?: number; height?: number }) {
  return (
    <group position={position}>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * width) / 2, 0, 0]}>
          <mesh position-y={height / 2} castShadow>
            <cylinderGeometry args={[0.2, 0.22, height, 12]} />
            <meshStandardMaterial color={C.pillar} roughness={0.5} />
          </mesh>
          <mesh position-y={0.3} castShadow>
            <boxGeometry args={[0.7, 0.6, 0.7]} />
            <meshStandardMaterial color={C.stoneDark} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position-y={height - 0.3} castShadow>
        <boxGeometry args={[width + 0.8, 0.32, 0.35]} />
        <meshStandardMaterial color={C.beam} roughness={0.6} />
      </mesh>
      <mesh position={[0, height - 0.85, 0.2]}>
        <boxGeometry args={[1.8, 0.55, 0.06]} />
        <meshStandardMaterial color="#1f2a2c" emissive="#c9a23a" emissiveIntensity={0.1} />
      </mesh>
      <Roof w={width + 1.8} d={1.6} h={0.6} lift={0.35} y={height - 0.1} />
    </group>
  );
}

/** Teleport array (傳送陣): glowing rune rings; `pulse` 0..1 flares on arrivals. */
export function TeleportArray({ position, pulse = 0 }: { position: [number, number, number]; pulse?: number }) {
  const ring = useRef<THREE.Mesh>(null!);
  const ring2 = useRef<THREE.Mesh>(null!);
  const beam = useRef<THREE.Mesh>(null!);
  const pulseRef = useRef(0);
  pulseRef.current = pulse;
  useFrame(({ clock }, dt) => {
    ring.current.rotation.z += dt * 0.25;
    ring2.current.rotation.z -= dt * 0.4;
    const p = pulseRef.current;
    const m = beam.current.material as THREE.MeshStandardMaterial;
    m.opacity = 0.05 + p * 0.55 + Math.sin(clock.elapsedTime * 2) * 0.02;
    beam.current.scale.y = 0.4 + p * 1.2;
  });
  return (
    <group position={position}>
      <mesh position-y={0.08} receiveShadow>
        <cylinderGeometry args={[2.5, 2.7, 0.16, 48]} />
        <meshStandardMaterial color="#cfc6b3" roughness={0.85} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.17}>
        <ringGeometry args={[1.9, 2.2, 6, 1]} />
        <meshStandardMaterial color="#7fe3ff" emissive="#47c8ff" emissiveIntensity={2.2} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ring2} rotation-x={-Math.PI / 2} position-y={0.18}>
        <ringGeometry args={[1.2, 1.35, 8, 1]} />
        <meshStandardMaterial color="#b9f1ff" emissive="#7fdcff" emissiveIntensity={2} transparent opacity={0.85} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 2.55, 0, Math.sin(a) * 2.55]}>
            <mesh position-y={0.5} castShadow>
              <boxGeometry args={[0.28, 1.0, 0.28]} />
              <meshStandardMaterial color="#bdb3a0" roughness={0.9} />
            </mesh>
            <mesh position-y={1.15}>
              <octahedronGeometry args={[0.16]} />
              <meshStandardMaterial color="#a8ecff" emissive="#58d0ff" emissiveIntensity={2.5} />
            </mesh>
          </group>
        );
      })}
      <mesh ref={beam} position-y={3}>
        <cylinderGeometry args={[1.6, 2.0, 6, 32, 1, true]} />
        <meshStandardMaterial color="#9feaff" emissive="#7fdcff" emissiveIntensity={1.5} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Grand protective formation core (護山大陣): floating crystal + array flags. */
export function GrandArray({ position, mood = "calm" }: { position: [number, number, number]; mood?: "calm" | "unstable" | "tribulation" }) {
  const crystal = useRef<THREE.Mesh>(null!);
  const color = mood === "tribulation" ? "#ff5a4a" : mood === "unstable" ? "#ffc24a" : "#6fe0d0";
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    crystal.current.rotation.y = t * 0.6;
    crystal.current.position.y = 2.1 + Math.sin(t * 1.2) * 0.15;
  });
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
        <ringGeometry args={[1.5, 1.62, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
      <mesh position-y={0.35} castShadow>
        <cylinderGeometry args={[0.55, 0.7, 0.7, 8]} />
        <meshStandardMaterial color="#bdb3a0" roughness={0.9} />
      </mesh>
      <mesh ref={crystal} castShadow>
        <octahedronGeometry args={[0.55, 0]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={1.6} roughness={0.1} clearcoat={1} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <group key={i} position={[Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55]}>
            <mesh position-y={0.9}>
              <cylinderGeometry args={[0.03, 0.03, 1.8, 6]} />
              <meshStandardMaterial color={C.wood} />
            </mesh>
            <mesh position={[0.22, 1.5, 0]}>
              <planeGeometry args={[0.42, 0.6]} />
              <meshStandardMaterial color={i % 2 ? "#2f6b72" : "#c9a23a"} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function CaveAbode({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.2, -1.2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[2.2, 0]} />
        <meshStandardMaterial color="#8d857a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.85, 0.75]}>
        <boxGeometry args={[1.3, 1.7, 0.2]} />
        <meshStandardMaterial color="#5d564c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.95, 0.88]}>
        <boxGeometry args={[1.5, 0.35, 0.08]} />
        <meshStandardMaterial color="#1f2a2c" emissive="#c9a23a" emissiveIntensity={0.1} />
      </mesh>
    </group>
  );
}

export function Lantern({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.55} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.1, 6]} />
        <meshStandardMaterial color={C.stoneDark} />
      </mesh>
      <mesh position-y={1.2} castShadow>
        <boxGeometry args={[0.36, 0.42, 0.36]} />
        <meshStandardMaterial color="#d24a3a" emissive="#ff6a3a" emissiveIntensity={0.9} roughness={0.6} />
      </mesh>
      <mesh position-y={1.5}>
        <coneGeometry args={[0.32, 0.22, 4]} />
        <meshStandardMaterial color={C.roof} />
      </mesh>
    </group>
  );
}

export function Pond({ position, radius = 2.2 }: { position: [number, number, number]; radius?: number }) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
        <circleGeometry args={[radius, 48]} />
        <meshPhysicalMaterial color="#4f8f8f" roughness={0.08} metalness={0.1} clearcoat={1} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * radius, 0.12, Math.sin(a) * radius]} scale={[0.4, 0.22, 0.32]} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#9b958a" roughness={1} flatShading />
          </mesh>
        );
      })}
      {/* lotus pads */}
      {[[0.6, 0.4], [-0.8, -0.3], [0.1, -0.9]].map(([x, z], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.07, z]}>
          <circleGeometry args={[0.28, 16, 0.4, Math.PI * 1.8]} />
          <meshStandardMaterial color="#4f7d3f" />
        </mesh>
      ))}
    </group>
  );
}
