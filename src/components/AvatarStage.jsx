import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useProgress } from "@react-three/drei";
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { speechBus } from "../lib/speech.js";
import { AvatarRig, portraitFraming } from "../lib/avatarRig.js";
import { allAvatars } from "../lib/avatars.js";

/*
  AvatarStage — one avatar per mode, posed and alive.

  • The avatar is chosen by the caller (it follows the selected mode).
  • Every model goes through lib/avatarRig.js: same real-world height, feet on the
    floor, a relaxed professional posture (no floating hands), breathing, head and
    eye movement, glances, blinks, hand gestures while speaking, and a mouth that
    follows the REAL voice (loudness + spectrum from the audio player).
  • The eyes follow the pointer a little when it is over the stage and return to
    eye contact when it leaves.
  • The other avatars are fetched quietly after the first one is on screen, so
    switching modes is instant.
  • A missing / invalid file (e.g. a server that answers index.html) never throws:
    a clean animated "AI core" is shown instead.
*/

/** True when the URL really serves a glTF binary/JSON (reads 4 bytes, then hangs up). */
async function looksLikeGltf(url) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-3" } });
    if (!res.ok || !res.body) return false;
    const reader = res.body.getReader();
    const { value } = await reader.read();
    reader.cancel().catch(() => {});
    if (!value || value.length < 1) return false;
    const isGlb = value[0] === 0x67 && value[1] === 0x6c && value[2] === 0x54 && value[3] === 0x46; // "glTF"
    return isGlb || value[0] === 0x7b; // "{" = glTF JSON
  } catch {
    return false;
  }
}

function RiggedAvatar({ avatar, activity, look, onReady }) {
  const gltf = useGLTF(avatar.url);
  const { camera, size } = useThree();

  const rig = useMemo(
    () => new AvatarRig(SkeletonUtils.clone(gltf.scene), gltf.animations, { animation: avatar.animation }),
    [gltf, avatar],
  );
  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    onReady?.(avatar.id);
  }, [rig, avatar.id, onReady]);

  // Head-and-torso portrait, like a video call; recomputed when the panel is resized.
  useLayoutEffect(() => {
    const f = portraitFraming(rig.measure, {
      fov: camera.fov,
      aspect: size.width / Math.max(1, size.height),
    });
    camera.position.set(0, f.y, f.distance);
    camera.lookAt(0, f.y, 0);
    camera.near = 0.05;
    camera.far = 100;
    camera.updateProjectionMatrix();
  }, [rig, camera, size.width, size.height]);

  useFrame((_, dt) => {
    const a = activity.current;
    rig.update(dt, {
      speaking: a.speaking,
      listening: a.listening,
      thinking: a.thinking,
      amplitude: speechBus.amplitude,
      bands: [speechBus.low, speechBus.mid, speechBus.high],
      look: look.current,
    });
    speechBus.amplitude *= 0.86; // browser-voice word pulses fade out; the cloud meter refreshes it each frame
  });

  return <primitive object={rig.holder} />;
}

/* Refined "AI core" placeholder — intentional and premium, not a cartoon face. */
function CorePlaceholder() {
  const shell = useRef();
  const inner = useRef();
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0, 5.6); // far enough that the whole shell is in view
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (shell.current) {
      shell.current.rotation.y = t * 0.25;
      shell.current.rotation.x = t * 0.12;
    }
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
          emissiveIntensity={0.3}
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
  componentDidCatch(error) {
    console.warn("[avatar] could not load the model:", error?.message || error);
  }
  render() {
    return this.state.failed ? <CorePlaceholder /> : this.props.children;
  }
}

/** Quietly fetch the other modes' avatars once the first is showing (one at a time). */
function usePreloadOthers(current) {
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.connection?.saveData) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const a of allAvatars()) {
        if (cancelled) return;
        if (a.id === current.id) continue;
        try {
          useGLTF.preload(a.url);
        } catch {
          /* a missing file is reported when that mode is selected */
        }
        await new Promise((r) => setTimeout(r, 1500)); // spread out: never compete with chat traffic
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [current.id]);
}

/** Only for the avatar being OPENED — not for the quiet background fetch of the others. */
function LoadingBar({ show }) {
  const { active, progress } = useProgress();
  if (!show || !active) return null;
  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 w-40 -translate-x-1/2" aria-hidden="true">
      <div className="h-0.5 overflow-hidden rounded-full bg-cyan/15">
        <div className="h-full bg-cyan transition-[width] duration-200" style={{ width: `${Math.max(6, progress)}%` }} />
      </div>
    </div>
  );
}

export default function AvatarStage({ avatar, activity }) {
  const [valid, setValid] = useState(null); // null = checking
  const act = useRef({ speaking: false, listening: false, thinking: false });
  act.current = activity;
  const look = useRef({ x: 0, y: 0 });
  const [readyId, setReadyId] = useState(null); // the avatar currently on screen
  usePreloadOthers(avatar);

  useEffect(() => {
    let alive = true;
    setValid(null);
    looksLikeGltf(avatar.url).then((ok) => alive && setValid(ok));
    return () => {
      alive = false;
    };
  }, [avatar.url]);

  function onPointerMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    look.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    look.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1) + 0.2; // the face sits a little above the middle
  }
  function onPointerLeave() {
    look.current.x = 0;
    look.current.y = 0;
  }

  const state = activity.speaking
    ? "speaking"
    : activity.listening
      ? "listening"
      : activity.thinking
        ? "thinking"
        : "standby";

  return (
    <div
      className="relative h-full w-full"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[78%] w-[78%] animate-ringspin rounded-full border border-cyan/20" />
        <div className="absolute h-[64%] w-[64%] animate-ringrev rounded-full border border-dashed border-cyan/15" />
        <div className="absolute h-[88%] w-[88%] rounded-full border border-cyan/5 shadow-glowsoft" />
      </div>

      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.4, 2.6], fov: 28, near: 0.05, far: 100 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <hemisphereLight args={["#ffffff", "#1b2a36", 1.0]} />
        <directionalLight position={[2, 3, 4]} intensity={1.6} />
        <directionalLight position={[-3, 1.5, 2]} intensity={0.8} color="#38e1ff" />
        <directionalLight position={[0, 2, -3]} intensity={0.5} color="#ff3b5c" />
        {valid ? (
          <Boundary key={avatar.url}>
            <Suspense fallback={<CorePlaceholder />}>
              <RiggedAvatar avatar={avatar} activity={act} look={look} onReady={setReadyId} />
            </Suspense>
          </Boundary>
        ) : (
          <CorePlaceholder />
        )}
      </Canvas>

      <LoadingBar show={readyId !== avatar.id} />

      <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center">
        <span
          className={
            "inline-block rounded-full bg-void-900/70 px-4 py-1 font-hud text-[11px] uppercase tracking-[0.35em] backdrop-blur-xs " +
            (state === "standby" ? "text-steel" : "text-cyan")
          }
          role="status"
          aria-live="polite"
        >
          {state === "standby" ? "○" : "◉"} {state}
          <span className="ml-3 text-steel/70">{avatar.label}</span>
        </span>
      </div>
    </div>
  );
}
