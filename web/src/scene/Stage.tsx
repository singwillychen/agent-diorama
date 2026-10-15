// Canvas, 60° camera rig and post-processing shared by every scene.
import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useWorld } from "../engine/world";
import { useUi } from "../ui/store";
import { agentPositions } from "./xianxia/Effects";

const DEG = Math.PI / 180;

function DevHandle() {
  const state = useThree();
  useEffect(() => { if (import.meta.env.DEV) (window as any).__r3f = state; }, [state]);
  return null;
}

function CameraRig({ camera: cfg }: { camera: Record<string, any> }) {
  const controls = useRef<OrbitControlsImpl>(null!);
  const { camera } = useThree();
  const selected = useWorld((s) => s.selected);
  const setZoom = useUi((s) => s.setZoom);
  const pitch = (cfg?.pitchDeg ?? 60) * DEG;
  const yawRange = (cfg?.yawRangeDeg ?? 30) * DEG;
  const home = useRef(new THREE.Vector3(0, 0, -2));

  useEffect(() => {
    const dist = 74;
    camera.position.set(0, Math.sin(pitch) * dist, -2 + Math.cos(pitch) * dist);
    camera.lookAt(home.current);
  }, [camera, pitch]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const pos = selected ? agentPositions.get(selected) : undefined;
    const want = pos ? new THREE.Vector3(pos.x, pos.y + 0.8, pos.z) : null;
    if (want) {
      const delta = want.sub(c.target).multiplyScalar(1 - Math.exp(-dt * 3));
      c.target.add(delta);
      camera.position.add(delta);
    }
    const d = camera.position.distanceTo(c.target);
    setZoom(d > 82 ? "overview" : d > 40 ? "area" : "close");
  });

  // Polar angle is measured from straight-down (+y); 60° elevation = 30° polar.
  const polar = Math.PI / 2 - pitch;
  return (
    <OrbitControls
      ref={controls}
      target={[0, 0, -2]}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={Math.max(0.15, polar - 12 * DEG)}
      maxPolarAngle={polar + 12 * DEG}
      minAzimuthAngle={-yawRange}
      maxAzimuthAngle={yawRange}
      minDistance={12}
      maxDistance={120}
      screenSpacePanning={false}
      panSpeed={0.8}
    />
  );
}

export function Stage({ camera, children }: { camera: Record<string, any>; children: React.ReactNode }) {
  const effects = useUi((s) => s.effects);
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: camera?.fovDeg ?? 30, near: 0.5, far: 5000, position: [0, 64, 35] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
    >
      <Suspense fallback={null}>
        {children}
        <CameraRig camera={camera} />
        <DevHandle />
        <EffectComposer multisampling={4}>
          <Bloom intensity={effects.bloom ? 0.7 : 0} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
          <TiltShift2 blur={effects.tiltShift ? 0.16 : 0} taper={0.6} start={[0.5, 0.05]} end={[0.5, 0.95]} samples={10} />
          <Vignette darkness={0.38} offset={0.25} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
