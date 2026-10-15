// Procedural floating peaks, cloud sea, pines, bridges and cranes.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRASS = new THREE.Color("#7d9a5a");
const MOSS = new THREE.Color("#5f7d48");
const ROCK_LIGHT = new THREE.Color("#a59d92");
const ROCK_MID = new THREE.Color("#7c736a");
const ROCK_DARK = new THREE.Color("#4b4540");

function rockGeometry(rTop: number, height: number, seed: number) {
  const g = new THREE.CylinderGeometry(rTop, rTop * 0.1, height, 72, 18, false);
  g.translate(0, -height / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = -y / height; // 0 top → 1 bottom
    const radial = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    if (radial > 1e-4) {
      const n =
        Math.sin(ang * 3 + seed) * 0.1 +
        Math.sin(ang * 7 + seed * 2.1 + t * 6) * 0.07 +
        Math.sin(ang * 17 + t * 14 + seed) * 0.035 +
        Math.sin(t * 22 + ang * 2) * 0.03;
      const bulge = 1 + 0.22 * Math.sin(Math.min(1, t * 1.6) * Math.PI);
      const k = (1 + n * (0.35 + t * 1.2)) * (t < 0.01 ? 1 : bulge);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
      // ledges: small vertical jitter on the rock face
      if (t > 0.02) pos.setY(i, y + Math.sin(ang * 5 + seed) * 0.25 * t);
    }
    // color: grass lip → stratified rock
    if (t < 0.015 || (radial < rTop * 0.98 && t < 0.02)) c.copy(GRASS);
    else if (t < 0.06) c.copy(MOSS).lerp(ROCK_LIGHT, (t - 0.015) / 0.045);
    else {
      const band = 0.5 + 0.5 * Math.sin(t * 40 + Math.sin(ang * 3) * 2);
      c.copy(ROCK_LIGHT).lerp(ROCK_MID, Math.min(1, t * 1.4)).lerp(ROCK_DARK, Math.max(0, t - 0.5) * 1.6);
      c.multiplyScalar(0.9 + band * 0.14);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function Peak({ position, radius, height, seed }: { position: [number, number, number]; radius: number; height: number; seed: number }) {
  const geo = useMemo(() => rockGeometry(radius, height, seed), [radius, height, seed]);
  return (
    <mesh geometry={geo} position={position} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}

export function GrassTop({ position, radius }: { position: [number, number, number]; radius: number }) {
  return (
    <mesh position={[position[0], position[1] + 0.02, position[2]]} rotation-x={-Math.PI / 2} receiveShadow>
      <circleGeometry args={[radius * 0.97, 64]} />
      <meshStandardMaterial color="#86a160" roughness={1} />
    </mesh>
  );
}

/** Concentric stone plaza with carved rings. */
export function Plaza({ position, radius }: { position: [number, number, number]; radius: number }) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.04} receiveShadow>
        <circleGeometry args={[radius, 72]} />
        <meshStandardMaterial color="#d6cfbf" roughness={0.85} />
      </mesh>
      {[0.35, 0.62, 0.9].map((k) => (
        <mesh key={k} rotation-x={-Math.PI / 2} position-y={0.05} receiveShadow>
          <ringGeometry args={[radius * k - 0.06, radius * k, 96]} />
          <meshStandardMaterial color="#b4ab98" roughness={0.9} />
        </mesh>
      ))}
      {/* taiji-like inlay */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
        <circleGeometry args={[radius * 0.33, 64, 0, Math.PI]} />
        <meshStandardMaterial color="#3b3a38" roughness={0.6} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
        <circleGeometry args={[radius * 0.33, 64, Math.PI, Math.PI]} />
        <meshStandardMaterial color="#efe9da" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function StonePath({ from, to, width = 2.2, y = 0.045 }: { from: [number, number]; to: [number, number]; width?: number; y?: number }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const slabs = Math.max(1, Math.round(len / 1.1));
  const ang = Math.atan2(dx, dz);
  return (
    <group position={[from[0], y, from[1]]} rotation-y={ang}>
      {Array.from({ length: slabs }, (_, i) => (
        <mesh key={i} position={[0, 0, (i + 0.5) * (len / slabs)]} receiveShadow>
          <boxGeometry args={[width, 0.08, len / slabs - 0.08]} />
          <meshStandardMaterial color={i % 2 ? "#cbc3b2" : "#c3bba9"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function Bridge({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const n = Math.round(len / 0.45);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return (
    <group position={from} rotation-y={yaw}>
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n;
        const sag = -Math.sin(t * Math.PI) * 0.6 + (b.y - a.y) * t;
        return (
          <mesh key={i} position={[0, sag, t * len]} castShadow receiveShadow>
            <boxGeometry args={[1.5, 0.08, 0.36]} />
            <meshStandardMaterial color={i % 3 ? "#8a6a48" : "#7a5c3e"} roughness={0.9} />
          </mesh>
        );
      })}
      {[-0.8, 0.8].map((x) =>
        [0, 1].map((end) => (
          <mesh key={`${x}${end}`} position={[x, 0.45 + (b.y - a.y) * end, end * len]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 1.1, 8]} />
            <meshStandardMaterial color="#5c4430" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Wind-swept cloud pine (迎客松 silhouette): leaning trunk with flat foliage pads. */
export function Pine({ position, scale = 1, seed = 1 }: { position: [number, number, number]; scale?: number; seed?: number }) {
  const r = useMemo(() => rng(seed), [seed]);
  const pads = useMemo(() => {
    const out: { p: [number, number, number]; s: number }[] = [];
    const lean = (r() - 0.5) * 0.8;
    const count = 3 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const h = 0.9 + i * 0.55;
      out.push({ p: [lean * h + (r() - 0.5) * 0.9, h, (r() - 0.5) * 0.7], s: 1.05 - i * 0.16 + r() * 0.2 });
    }
    return { out, lean };
  }, [r]);
  return (
    <group position={position} scale={scale}>
      <mesh position={[pads.lean * 0.9, 1.0, 0]} rotation-z={-pads.lean * 0.6} castShadow>
        <cylinderGeometry args={[0.08, 0.16, 2.2, 7]} />
        <meshStandardMaterial color="#5a4433" roughness={1} />
      </mesh>
      {pads.out.map((pad, i) => (
        <mesh key={i} position={pad.p} scale={[pad.s, pad.s * 0.32, pad.s * 0.85]} castShadow>
          <icosahedronGeometry args={[0.75, 1]} />
          <meshStandardMaterial color={i % 2 ? "#2f5a3a" : "#386645"} roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function PineRing({ center, radius, count, seed, y = 0, skip = [] }: { center: [number, number]; radius: number; count: number; seed: number; y?: number; skip?: [number, number][] }) {
  const items = useMemo(() => {
    const r = rng(seed);
    const out: { p: [number, number, number]; s: number; seed: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = radius * (0.86 + r() * 0.1);
      const p: [number, number, number] = [center[0] + Math.cos(a) * rad, y, center[1] + Math.sin(a) * rad];
      if (skip.some(([sa, sw]) => Math.abs(((a - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < sw)) continue;
      out.push({ p, s: 0.7 + r() * 0.6, seed: seed * 100 + i });
    }
    return out;
  }, [center, radius, count, seed, y, skip]);
  return <>{items.map((it, i) => <Pine key={i} position={it.p} scale={it.s} seed={it.seed} />)}</>;
}

/** Instanced cloud sea below the peaks, drifting slowly. */
export function CloudSea({ count = 320, tint = "#ffffff" }: { count?: number; tint?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const data = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: count }, () => {
      const a = r() * Math.PI * 2;
      const d = 8 + Math.pow(r(), 0.7) * 85;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d - 6, y: -5.5 - r() * 5 + (d > 40 ? 2 : 0), s: 2.5 + r() * 5.5, sp: 0.15 + r() * 0.35, ph: r() * 10 };
    });
  }, [count]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    data.forEach((c, i) => {
      const x = ((c.x + t * c.sp + 100) % 200) - 100;
      const s = c.s * (1 + Math.sin(t * 0.2 + c.ph) * 0.05);
      m.compose(new THREE.Vector3(x, c.y + Math.sin(t * 0.15 + c.ph) * 0.3, c.z), q, new THREE.Vector3(s * 1.6, s * 0.55, s));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} receiveShadow>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial color={tint} roughness={1} emissive="#fff4e6" emissiveIntensity={0.18} />
    </instancedMesh>
  );
}

/** Small drifting rocks and distant peaks for depth. */
export function DistantPeaks() {
  const peaks = useMemo(() => {
    const r = rng(42);
    return Array.from({ length: 9 }, (_, i) => {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (r() - 0.5) * 0.2;
      const d = 55 + r() * 25;
      return { p: [Math.cos(a) * d, -2 + r() * 6, Math.sin(a) * d - 10] as [number, number, number], r: 3 + r() * 5, h: 14 + r() * 14, seed: i + 3 };
    });
  }, []);
  return (
    <>
      {peaks.map((p, i) => (
        <group key={i}>
          <Peak position={p.p} radius={p.r} height={p.h} seed={p.seed} />
          <Pine position={[p.p[0], p.p[1], p.p[2]]} scale={p.r * 0.35} seed={i + 90} />
        </group>
      ))}
    </>
  );
}

export function FloatingRocks() {
  const ref = useRef<THREE.Group>(null!);
  const rocks = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: 10 }, (_, i) => ({
      p: [(r() - 0.5) * 70, -1 + r() * 6, -30 + r() * 45] as [number, number, number],
      r: 0.6 + r() * 1.4,
      seed: 20 + i,
    })).filter((x) => Math.hypot(x.p[0], x.p[2] + 2) > 26);
  }, []);
  useFrame(({ clock }) => {
    ref.current.children.forEach((c, i) => { c.position.y = rocks[i].p[1] + Math.sin(clock.elapsedTime * 0.4 + i) * 0.35; });
  });
  return (
    <group ref={ref}>
      {rocks.map((k, i) => <Peak key={i} position={k.p} radius={k.r} height={k.r * 2.4} seed={k.seed} />)}
    </group>
  );
}

/** Cranes gliding in wide circles above the peak. */
export function Cranes({ count = 3 }: { count?: number }) {
  const refs = useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const a = t * 0.08 + (i * Math.PI * 2) / count;
      const r = 26 + i * 4;
      g.position.set(Math.cos(a) * r, 12 + i * 1.5 + Math.sin(t * 0.5 + i) * 0.6, Math.sin(a) * r - 6);
      g.rotation.y = -a;
      const flap = Math.sin(t * 3 + i) * 0.5;
      (g.children[3] as THREE.Object3D).rotation.z = flap;
      (g.children[4] as THREE.Object3D).rotation.z = -flap;
    });
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(el) => { if (el) refs.current[i] = el; }} scale={0.9}>
          <mesh scale={[0.25, 0.22, 0.75]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#f7f5f0" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.25, 0.75]} rotation-x={-0.6}>
            <cylinderGeometry args={[0.04, 0.06, 0.7, 6]} />
            <meshStandardMaterial color="#f7f5f0" />
          </mesh>
          <mesh position={[0, 0.55, 1.0]}>
            <sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color="#c8302b" />
          </mesh>
          <group position={[0.15, 0.05, 0]}>
            <mesh position={[0, 0, 0]} rotation-z={0.15} scale={[1, 1, 1]}>
              <boxGeometry args={[0.05, 0.02, 0.6]} />
              <meshStandardMaterial color="#f7f5f0" />
            </mesh>
            <mesh position={[0.7, 0, 0]}>
              <boxGeometry args={[1.4, 0.02, 0.45]} />
              <meshStandardMaterial color="#efece4" />
            </mesh>
          </group>
          <group position={[-0.15, 0.05, 0]}>
            <mesh position={[-0.7, 0, 0]}>
              <boxGeometry args={[1.4, 0.02, 0.45]} />
              <meshStandardMaterial color="#efece4" />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}
