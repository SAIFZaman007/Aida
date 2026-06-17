import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { speechBus } from "../lib/speech.js";

/*
  AvatarStage — realistic, expressive, multi-avatar.

  ROOT-CAUSE FIX (console error): we no longer blindly hand "/avatars/x.glb" to
  the GLTF loader. We first fetch the file and check the glTF magic bytes
  ("glTF"). If it isn't a real model (e.g. the dev server returned index.html
  because the file is missing), we render a clean animated core instead of
  throwing. No more "Unexpected token '<'".

  EXPRESSION RIG (Issue 1): when a real Ready Player Me GLB is present we drive
  ARKit/Oculus blendshapes for blinking, eye saccades, breathing,
  micro-expressions and lip-sync. Lip-sync amplitude comes from the shared
  speechBus, so the mouth tracks the ACTUAL voice (real audio amplitude with
  Piper, word pulses with the browser voice).
*/

function isGltf(url) {
  return fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then((buf) => {
      const head = new Uint8Array(buf.slice(0, 4));
      // 0x67 0x6C 0x54 0x46 == "glTF" (binary) ; "{" (0x7B) == glTF JSON.
      return (
        (head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46) ||
        head[0] === 0x7b
      );
    })
    .catch(() => false);
}

function GltfAvatar({ url }) {
  const { scene } = useGLTF(url);
  const root = useRef();
  const amp = useRef(0);
  const blink = useRef({ t: -1, next: 1.5 });
  const sac = useRef({ x: 0, y: 0, next: 1 });
  const expr = useRef({ smile: 0, brow: 0, next: 4 });

  const rig = useMemo(() => {
    const morphMeshes = [];
    let leftEye = null;
    let rightEye = null;
    let head = null;
    scene.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary) morphMeshes.push(o);
      if (o.name === "LeftEye") leftEye = o;
      if (o.name === "RightEye") rightEye = o;
      if (o.name === "Head") head = o;
    });
    return { morphMeshes, leftEye, rightEye, head };
  }, [scene]);

  const setMorph = (name, value) => {
    for (const mesh of rig.morphMeshes) {
      const idx = mesh.morphTargetDictionary[name];
      if (idx !== undefined) mesh.morphTargetInfluences[idx] = value;
    }
  };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    if (root.current) {
      root.current.rotation.y = Math.sin(t * 0.35) * 0.05;
      root.current.position.y = -1.5 + Math.sin(t * 0.9) * 0.008;
    }
    if (rig.head) rig.head.rotation.x = Math.sin(t * 0.8) * 0.02;

    // Blinking
    if (blink.current.t < 0 && t > blink.current.next) {
      blink.current.t = 0;
      blink.current.next = t + 2 + Math.random() * 4;
    }
    if (blink.current.t >= 0) {
      blink.current.t += dt;
      const p = blink.current.t / 0.15;
      const v = p < 0.5 ? p * 2 : Math.max(0, 2 - p * 2);
      setMorph("eyeBlinkLeft", v);
      setMorph("eyeBlinkRight", v);
      if (p >= 1) blink.current.t = -1;
    }

    // Eye saccades
    if (t > sac.current.next) {
      sac.current.x = (Math.random() - 0.5) * 0.12;
      sac.current.y = (Math.random() - 0.5) * 0.06;
      sac.current.next = t + 0.6 + Math.random() * 2.2;
    }
    for (const eye of [rig.leftEye, rig.rightEye]) {
      if (eye) {
        eye.rotation.y = THREE.MathUtils.lerp(eye.rotation.y, sac.current.x, 0.2);
        eye.rotation.x = THREE.MathUtils.lerp(eye.rotation.x, sac.current.y, 0.2);
      }
    }

    // Micro-expressions
    if (t > expr.current.next) {
      expr.current.smile = Math.random() * 0.25;
      expr.current.brow = Math.random() * 0.2;
      expr.current.next = t + 3 + Math.random() * 5;
    }
    expr.current.smile *= 0.97;
    expr.current.brow *= 0.97;
    setMorph("mouthSmileLeft", expr.current.smile);
    setMorph("mouthSmileRight", expr.current.smile);
    setMorph("browInnerUp", expr.current.brow);

    // Lip-sync from the live voice amplitude (decays smoothly).
    speechBus.amplitude *= 0.86;
    amp.current = THREE.MathUtils.lerp(amp.current, speechBus.amplitude, 0.5);
    setMorph("jawOpen", amp.current * 0.7);
    setMorph("mouthOpen", amp.current);
    setMorph("viseme_aa", amp.current * 0.6);
  });

  return <primitive ref={root} object={scene} position={[0, -1.5, 0]} scale={1.2} />;
}

/* Refined "AI core" placeholder — intentional and premium, not a cartoon face. */
function CorePlaceholder() {
  const shell = useRef();
  const inner = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (shell.current) {
      shell.current.rotation.y = t * 0.25;
      shell.current.rotation.x = t * 0.12;
    }
    speechBus.amplitude *= 0.86;
    const pulse = 0.85 + speechBus.amplitude * 0.5 + Math.sin(t * 2) * 0.03;
    if (inner.current) inner.current.scale.setScalar(pulse);
  });
  return (
    <group>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshStandardMaterial
          color="#0e7490"
          emissive="#38e1ff"
          emissiveIntensity={0.25}
          wireframe
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh ref={inner}>
        <sphereGeometry args={[0.6, 48, 48]} />
        <meshStandardMaterial
          color="#0b141b"
          emissive="#38e1ff"
          emissiveIntensity={0.7}
          roughness={0.2}
          metalness={0.6}
        />
      </mesh>
    </group>
  );
}

class Boundary extends Component {
  constructor(p) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <CorePlaceholder /> : this.props.children;
  }
}

export default function AvatarStage({ avatarUrl, speaking }) {
  const [valid, setValid] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    setValid(null);
    isGltf(avatarUrl).then((ok) => alive && setValid(ok));
    return () => {
      alive = false;
    };
  }, [avatarUrl]);

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[78%] w-[78%] animate-ringspin rounded-full border border-cyan/20" />
        <div className="absolute h-[64%] w-[64%] animate-ringrev rounded-full border border-dashed border-cyan/15" />
        <div className="absolute h-[88%] w-[88%] rounded-full border border-cyan/5 shadow-glowsoft" />
      </div>

      <Canvas camera={{ position: [0, 0, 3.0], fov: 32 }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[2, 3, 4]} intensity={1.2} />
        <directionalLight position={[-3, 1, 2]} intensity={0.5} color="#38e1ff" />
        <pointLight position={[0, -1, 3]} intensity={0.4} color="#ff3b5c" />
        {valid ? (
          <Boundary key={avatarUrl}>
            <Suspense fallback={<CorePlaceholder />}>
              <GltfAvatar url={avatarUrl} />
            </Suspense>
          </Boundary>
        ) : (
          <CorePlaceholder />
        )}
      </Canvas>

      <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center">
        <span
          className={
            "font-hud text-[11px] uppercase tracking-[0.35em] " +
            (speaking ? "text-cyan" : "text-steel")
          }
        >
          {speaking ? "\u25C9 speaking" : "\u25CB standby"}
        </span>
      </div>
    </div>
  );
}