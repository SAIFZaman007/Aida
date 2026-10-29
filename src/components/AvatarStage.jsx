import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { speechBus } from "../lib/speech.js";
import { AvatarRig, findBones, fitToStage, portraitFraming } from "../lib/avatarRig.js";
import { allAvatars } from "../lib/avatars.js";
import { loadAvatar, peekAvatar, preloadAvatars } from "../lib/avatarLoader.js";

/*
  AvatarStage — one avatar per mode, posed and alive.

  Loading (v2.4): the stage asks lib/avatarLoader.js for the avatar of the selected
  mode and keeps showing the PREVIOUS one until the new one is ready, so switching
  modes never flashes a placeholder. A failed download is retried by the loader; if it
  still fails, the reason is shown on the stage with a Retry button (and in the console
  as "[avatar] …") instead of silently drawing a placeholder.

  Drawing: every model goes through lib/avatarRig.js — same height, relaxed posture,
  breathing, gaze, blinks, gestures and a face that lip-syncs to the REAL voice
  (loudness + spectrum from the audio player). If a model ever breaks the rig, it is
  shown un-animated rather than not at all.
*/

/** Animated model. */
function RiggedAvatar({ avatar, gltf, activity, look }) {
  const { camera, size } = useThree();
  const rig = useMemo(
    () =>
      new AvatarRig(SkeletonUtils.clone(gltf.scene), gltf.animations, {
        animation: avatar.animation,
        face: avatar.face,
        style: avatar.style,
        id: avatar.id,
      }),
    [gltf, avatar],
  );
  useEffect(() => () => rig.dispose(), [rig]);
  useFraming(rig.measure, camera, size);

  useFrame((_, dt) => {
    const a = activity.current;
    rig.update(dt, {
      speaking: a.speaking,
      listening: a.listening,
      thinking: a.thinking,
      amplitude: speechBus.amplitude,
      bands: [speechBus.low, speechBus.mid, speechBus.high],
      synthetic: speechBus.synthetic, // browser voice: nothing to measure, the rig makes up a speech rhythm
      look: look.current,
    });
  });

  return <primitive object={rig.holder} />;
}

/** Safe mode: the model, fitted and framed, without any animation. */
function PlainAvatar({ gltf }) {
  const { camera, size } = useThree();
  const fitted = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene);
    return fitToStage(scene, findBones(scene));
  }, [gltf]);
  useFraming(fitted, camera, size);
  return <primitive object={fitted.holder} />;
}

/** Head-and-torso portrait, like a video call; recomputed when the panel is resized. */
function useFraming(measure, camera, size) {
  useLayoutEffect(() => {
    const f = portraitFraming(measure, { fov: camera.fov, aspect: size.width / Math.max(1, size.height) });
    camera.position.set(0, f.y, f.distance);
    camera.lookAt(0, f.y, 0);
    camera.near = 0.05;
    camera.far = 100;
    camera.updateProjectionMatrix();
  }, [measure, camera, size.width, size.height]);
}

/* Refined "AI core" — only shown before the very first avatar arrives. */
function CorePlaceholder() {
  const shell = useRef();
  const inner = useRef();
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0, 5.6);
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
        <meshStandardMaterial color="#0e7490" emissive="#38e1ff" emissiveIntensity={0.25} wireframe transparent opacity={0.55} />
      </mesh>
      <mesh ref={inner}>
        <sphereGeometry args={[0.6, 48, 48]} />
        <meshStandardMaterial color="#0b141b" emissive="#38e1ff" emissiveIntensity={0.3} roughness={0.2} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** If the animated rig throws for one model, fall back to showing it plainly. */
class RigBoundary extends Component {
  constructor(p) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn(`[avatar] ${this.props.name}: animation disabled, showing the model as is —`, error?.message || error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** After the first avatar is on screen, quietly fetch the others, one at a time. */
function usePreloadOthers(current) {
  const id = current?.id;
  useEffect(() => {
    if (!id) return undefined;
    const conn = typeof navigator !== "undefined" ? navigator.connection : null;
    const lowMemory = typeof navigator !== "undefined" && navigator.deviceMemory && navigator.deviceMemory <= 2;
    if (conn?.saveData || lowMemory) return undefined; // load on demand instead
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      preloadAvatars(allAvatars().filter((a) => a.id !== id), { signal: ctrl.signal });
    }, 2500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [id]);
}

export default function AvatarStage({ avatar, activity }) {
  const act = useRef({ speaking: false, listening: false, thinking: false });
  act.current = activity;
  const look = useRef({ x: 0, y: 0 });

  const [shown, setShown] = useState(() => {
    const hit = peekAvatar(avatar);
    return hit ? { avatar, gltf: hit.gltf } : null;
  });
  const [load, setLoad] = useState({ status: "loading", progress: 0, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const hit = peekAvatar(avatar);
    if (hit) {
      setShown({ avatar, gltf: hit.gltf });
      setLoad({ status: "ready", progress: 1, error: null });
      return () => ctrl.abort();
    }
    setLoad({ status: "loading", progress: 0, error: null });
    loadAvatar(avatar, {
      signal: ctrl.signal,
      onProgress: (p) => setLoad((l) => (l.status === "loading" ? { ...l, progress: p } : l)),
    })
      .then(({ gltf }) => {
        setShown({ avatar, gltf });
        setLoad({ status: "ready", progress: 1, error: null });
      })
      .catch((error) => {
        if (error?.code === "aborted") return;
        setLoad({ status: "error", progress: 0, error });
      });
    return () => ctrl.abort();
  }, [avatar, attempt]);

  usePreloadOthers(shown?.avatar);

  function onPointerMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    look.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    look.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1) + 0.2; // the face sits a little above the middle
  }
  function onPointerLeave() {
    look.current.x = 0;
    look.current.y = 0;
  }

  const state = activity.speaking ? "speaking" : activity.listening ? "listening" : activity.thinking ? "thinking" : "standby";
  const label = (shown?.avatar || avatar).label;

  return (
    <div
      className="relative h-full w-full"
      data-avatar={shown?.avatar.id || ""}
      data-load={load.status}
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
        {shown ? (
          <RigBoundary key={shown.avatar.id} name={shown.avatar.id} fallback={<PlainAvatar gltf={shown.gltf} />}>
            <RiggedAvatar avatar={shown.avatar} gltf={shown.gltf} activity={act} look={look} />
          </RigBoundary>
        ) : (
          <CorePlaceholder />
        )}
      </Canvas>

      {load.status === "loading" && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 w-40 -translate-x-1/2" aria-hidden="true">
          <div className="h-0.5 overflow-hidden rounded-full bg-cyan/15">
            <div className="h-full bg-cyan transition-[width] duration-200" style={{ width: `${Math.max(6, Math.round(load.progress * 100))}%` }} />
          </div>
        </div>
      )}

      {load.status === "error" && (
        <div
          role="alert"
          data-testid="avatar-error"
          className="absolute inset-x-4 bottom-14 rounded-lg border border-crimson/40 bg-void-900/90 px-4 py-3 text-center backdrop-blur-xs"
        >
          <p className="font-hud text-[11px] uppercase tracking-[0.2em] text-crimson">{avatar.label} avatar unavailable</p>
          <p className="mt-1 text-xs text-steel">{load.error?.message || "It could not be loaded."}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-2 rounded-md border border-cyan/40 px-3 py-1 font-hud text-[11px] uppercase tracking-wider text-cyan transition hover:bg-cyan/10"
          >
            Retry
          </button>
        </div>
      )}

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
          <span className="ml-3 text-steel/70">{label}</span>
        </span>
      </div>
    </div>
  );
}
