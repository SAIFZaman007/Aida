/*
  avatarRig.js — gives ANY humanoid GLB a professional posture and a living face.

  Pure three.js (no React), so it is unit-testable and reusable.

  WHY THIS EXISTS
  The supplied avatars come from different tools (Avaturn, Ready Player Me,
  Sketchfab/Mixamo exports) and arrive in different rest poses: some in a T-pose
  (arms straight out), some in an A-pose (arms away from the body → "floating
  hands"), one as a static mesh. Nothing in the old stage changed their pose.

  WHAT IT DOES
   1. FIT      — scales every model to the same real-world height, stands it on the
                 floor, hides stray scenery (the architect's floor disc) and frames
                 the camera on head-and-torso like a professional video call.
   2. POSTURE  — "aims" the arm bones in world space: upper arms hang by the sides,
                 elbows slightly bent, hands relaxed in front of the thighs. It needs
                 only bone NAMES (Mixamo / Avaturn / RPM naming), never bone axes, so
                 it works whatever the rig's local orientation is.
   3. LIFE     — breathing, weight shift, head motion, glances and saccades, nods on
                 speech emphasis, listening/thinking attitudes, gestures with the
                 hands while speaking, blinks and mouth through morph targets when
                 the model has them.
   4. CLIPS    — if the file carries its own animation (coder: idle, executive:
                 gesture, security: idle) that clip is the base layer.

  Everything is guarded: a missing bone or morph just disables that detail.
*/
import * as THREE from "three";
import { FaceRig } from "./faceRig.js";
import { LipSync } from "./lipSync.js";
import { resolveStyle, kindInfo, pickGesture, gestureDelay, gestureVariation, chooseArms } from "./bodyLanguage.js";

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (x) => x * x * (3 - 2 * x);
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// ----------------------------------------------------------------------------- bones
/** "mixamorig:LeftForeArm_014" -> "leftforearm". */
export function canonName(name) {
  return String(name || "")
    .replace(/^mixamorig[:_]?/i, "")
    .replace(/_\d+$/, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function findBones(root) {
  const bones = {};
  root.traverse((o) => {
    if (!o.isBone) return;
    const k = canonName(o.name);
    if (k && !(k in bones)) bones[k] = o;
  });
  return bones;
}

// ----------------------------------------------------------------------------- morphs
const MORPH = {
  jaw: ["jawOpen"],
  mouth: ["mouthOpen"],
  visemeAa: ["viseme_aa"],
  visemeOu: ["viseme_U", "mouthFunnel"],
  visemeEe: ["viseme_I", "mouthStretchLeft"],
  smile: ["mouthSmileLeft", "mouthSmileRight", "mouthSmile"],
  blink: ["eyeBlinkLeft", "eyeBlinkRight", "eyesClosed"],
  browUp: ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"],
  squint: ["eyeSquintLeft", "eyeSquintRight"],
};

export function collectMorphs(root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) meshes.push(o);
  });
  const has = {};
  for (const [key, names] of Object.entries(MORPH)) {
    has[key] = names.filter((n) => meshes.some((m) => n in m.morphTargetDictionary));
  }
  const set = (key, value) => {
    for (const name of has[key] || []) {
      for (const m of meshes) {
        const i = m.morphTargetDictionary[name];
        if (i !== undefined) m.morphTargetInfluences[i] = value;
      }
    }
  };
  return { meshes, has, set };
}

// ----------------------------------------------------------------------------- fit
const SCENERY = /(^|[_\s])(floor|ground|plane|shadow|stage|disc|disk|platform|backdrop)([_\s\d]|$)/i;

/** Remove props that are not part of the person, then measure. */
export function stripScenery(root) {
  const doomed = [];
  root.traverse((o) => {
    if (o.isMesh && SCENERY.test(o.name)) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
  return doomed.length;
}

/**
 * Wraps `scene` in a holder scaled to `targetHeight` with its feet at y = 0 and its
 * centre at x = z = 0. Returns measurements in holder (= stage) units.
 */
export function fitToStage(scene, bones, targetHeight = 1.75) {
  stripScenery(scene);
  scene.traverse((o) => {
    if (o.isSkinnedMesh) o.frustumCulled = false; // bounds come from the bind pose; posed bodies would be culled
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new V3());
  const centre = box.getCenter(new V3());
  const scale = size.y > 0 ? targetHeight / size.y : 1;

  const holder = new THREE.Group();
  holder.name = "aida-holder";
  holder.add(scene);
  holder.scale.setScalar(scale);
  holder.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  holder.updateMatrixWorld(true);

  const world = (b) => (b ? b.getWorldPosition(new V3()) : null);
  const hips = world(bones.hips);
  const head = world(bones.head);
  const top = targetHeight; // after scaling, the top of the head is the target height
  return {
    holder,
    scale,
    height: targetHeight,
    headTopY: top,
    headY: head ? head.y : top * 0.93,
    hipsY: hips ? hips.y : top * 0.53,
  };
}

/** Camera placement for a head-and-torso portrait of a fitted avatar. */
export function portraitFraming(measure, { fov = 28, aspect = 0.8, padTop = 0.1, padBottom = 0.02 } = {}) {
  const top = measure.headTopY + padTop;
  const bottom = measure.hipsY + padBottom;
  const visibleH = top - bottom;
  const centreY = (top + bottom) / 2;
  const fitH = visibleH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  // the shoulders (≈ 0.95 stage units across with a margin) must fit the width, too
  const fitW = 0.95 / (2 * Math.max(aspect, 0.3) * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  return { y: centreY, distance: Math.max(fitH, fitW), fov };
}

// ----------------------------------------------------------------------------- arm posture
/** Direction in the body frame: [outward, up, forward] -> world vector for a given side. */
const dir = (side, [out, up, fwd]) => new V3(side * out, up, fwd).normalize();

export const POSES = {
  rest: { upper: [0.12, -0.99, 0.05], fore: [0.03, -0.9, 0.42], hand: [0.0, -0.85, 0.52] },
  // elbows stay close to the body; forearms come forward — conversational, not theatrical
  explain: { upper: [0.14, -0.95, 0.27], fore: [0.06, -0.3, 0.95], hand: [0.06, -0.25, 0.97] },
  open: { upper: [0.22, -0.93, 0.28], fore: [0.38, -0.25, 0.89], hand: [0.4, -0.2, 0.89] },
  point: { upper: [0.14, -0.95, 0.28], fore: [0.06, 0.3, 0.95], hand: [0.06, 0.25, 0.97] },
  palm: { upper: [0.18, -0.94, 0.28], fore: [0.12, -0.15, 0.98], hand: [0.12, -0.1, 0.99] },
  // bigger arc, hand lifted and out — storytelling
  flourish: { upper: [0.26, -0.88, 0.3], fore: [0.42, 0.38, 0.82], hand: [0.42, 0.34, 0.84] },
  // hands up and out, elbows in: "who knows?"
  shrug: { upper: [0.28, -0.93, 0.18], fore: [0.42, 0.2, 0.88], hand: [0.4, 0.3, 0.86] },
  // hands together in front of the belt — professional, calm
  clasp: { upper: [0.1, -0.97, 0.2], fore: [-0.62, -0.28, 0.73], hand: [-0.75, -0.1, 0.65] },
  // hand up to the chin — thinking
  chin: { upper: [0.1, -0.85, 0.5], fore: [-0.3, 0.72, 0.62], hand: [-0.25, 0.75, 0.6] },
};

const _pq = new Q();
const _bq = new Q();
const _dq = new Q();
const _a = new V3();
const _b = new V3();

/** Rotate `bone` (world space) so that the line bone -> `child` points along `target`. */
export function aimBone(bone, child, target) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a);
  if (_b.lengthSq() < 1e-12) return;
  _b.normalize();
  _dq.setFromUnitVectors(_b, target);
  bone.getWorldQuaternion(_bq);
  _bq.premultiply(_dq);
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_bq));
  } else {
    bone.quaternion.copy(_bq);
  }
  bone.updateMatrixWorld(true);
}

/** Apply a rotation expressed in WORLD axes on top of the bone's current orientation. */
export function rotateWorld(bone, pitch, yaw, roll) {
  if (!bone || (!pitch && !yaw && !roll)) return;
  _dq.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_bq);
  _bq.premultiply(_dq);
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_bq));
  } else {
    bone.quaternion.copy(_bq);
  }
  bone.updateMatrixWorld(true);
}

const lerpDir = (a, b, t) => a.clone().lerp(b, t).normalize();

/** Arm chain of one side, or null if the rig lacks it. */
function armChain(bones, side) {
  const p = side > 0 ? "left" : "right";
  const arm = bones[`${p}arm`];
  const fore = bones[`${p}forearm`];
  const hand = bones[`${p}hand`];
  if (!arm || !fore || !hand) return null;
  return {
    side,
    name: p,
    shoulder: bones[`${p}shoulder`] || null,
    arm,
    fore,
    hand,
    finger: bones[`${p}handmiddle1`] || null,
    state: { kind: "rest", t0: 0, dur: 0, e: 0, phase: Math.random() * 6.28 },
  };
}

/** Which world side is the character's left? (+X for a model facing +Z.) */
function sideOf(bones) {
  const l = bones.leftarm?.getWorldPosition(new V3());
  const r = bones.rightarm?.getWorldPosition(new V3());
  if (l && r && Math.abs(l.x - r.x) > 1e-6) return l.x > r.x ? 1 : -1;
  return 1;
}

// ----------------------------------------------------------------------------- the rig
export class AvatarRig {
  /**
   * @param scene       the cloned glTF scene
   * @param animations  glTF clips (may be empty)
   * @param cfg         { animation: { idle: "loop"|"hold"|null, holdAt: 0..1, speaking: "loop"|null }, gestures: bool }
   */
  constructor(scene, animations = [], cfg = {}) {
    this.cfg = { gestures: true, ...cfg };
    this.style = resolveStyle(cfg.style || cfg.id);
    this.bones = findBones(scene);
    this.morphs = collectMorphs(scene);
    this.measure = fitToStage(scene, this.bones, cfg.height || 1.75);
    this.holder = this.measure.holder;
    this.scene = scene;
    this.skinned = !!this.bones.head && !!this.bones.hips;

    // Lip-sync / blink / expression patches (built now, while the body is in its bind pose).
    this.face = new FaceRig(scene, this.bones.head || scene, cfg.face || {});

    // Mirror the character: +1 when its left arm is at +X (facing the camera at +Z).
    this.flip = this.skinned ? sideOf(this.bones) : 1;

    this.arms = this.skinned && this.cfg.gestures !== false
      ? [armChain(this.bones, this.flip), armChain(this.bones, -this.flip)].filter(Boolean)
      : [];

    // Rest rotations of every bone we steer (for rigs without a clip that overwrites them).
    this.rest = new Map();
    const steer = [
      "hips", "spine", "spine1", "spine2", "neck", "head", "lefteye", "righteye",
    ].map((k) => this.bones[k]).filter(Boolean);
    for (const arm of this.arms) steer.push(arm.shoulder, arm.arm, arm.fore, arm.hand);
    for (const b of steer) if (b) this.rest.set(b, b.quaternion.clone());

    // Clips
    this.mixer = null;
    this.actions = {};
    this.clipDrivesArms = false;
    const clip = animations[0];
    const anim = this.cfg.animation || {};
    if (clip && this.skinned && (anim.idle || anim.speaking)) {
      this.mixer = new THREE.AnimationMixer(scene);
      const idle = this.mixer.clipAction(clip);
      if (anim.idle === "hold") {
        // A still frame of the clip as the standing pose; `holdAt` (0..1) picks which one.
        idle.time = clamp(anim.holdAt ?? 0, 0, 1) * clip.duration;
        idle.paused = true;
      }
      idle.play();
      this.actions.idle = idle;
      if (anim.speaking === "loop" || anim.speaking === "signature") {
        const talk = this.mixer.clipAction(clip.clone());
        talk.setEffectiveWeight(0);
        talk.play();
        this.actions.talk = talk;
        // "loop": the clip IS the speaking animation. "signature": the clip is played now
        // and then (a few seconds, every ~15 s) and the rig's own varied gestures fill the rest.
        this.clipDrivesArms = anim.speaking === "loop";
        if (anim.speaking === "signature") {
          talk.paused = true;
          this.sig = { active: false, t0: 0, dur: clip.duration || 3, next: Infinity, wasSpeaking: false };
        }
      }
      // glTF track names use sanitized node names ("mixamorig:Hips_01" -> "mixamorigHips_01")
      this.clipTracks = new Set(clip.tracks.map((t) => t.name.split(".")[0]));
    }

    // Relaxed posture for rigs without a clip (T-pose / A-pose models).
    this.armWeight = this.mixer && !this.clipDrivesArms ? 0 : 1;
    this.baseArms = !this.mixer; // bones are not overwritten each frame → reset from rest first
    if (this.arms.length) this._applyArms(0, 1, true);
    this.scene.updateMatrixWorld(true);

    // For every bone we add motion to: `pre` = its pose BEFORE our offsets (rest pose, or what
    // the clip last wrote), `post` = what we left in it. three.js's mixer only writes a bone
    // when the clip's value CHANGED, so a held/paused clip never re-writes it; without this
    // bookkeeping our per-frame offsets would pile up and the body would slowly topple.
    this.track = new Map();
    for (const b of this.rest.keys()) this.track.set(b, { pre: this.rest.get(b).clone(), post: b.quaternion.clone() });

    // ---- animation state
    this.t = 0;
    this.lip = new LipSync(); // loudness + spectrum → a natural mouth (see lipSync.js)
    this.mouth = { open: 0, wide: 0, round: 0, level: 0 };
    this.s = {
      head: new V3(), // smoothed yaw/pitch/roll
      eyes: { x: 0, y: 0, tx: 0, ty: 0, next: 0.6 },
      blink: { t: -1, next: 1.8 },
      amp: 0,
      ampPrev: 0,
      nod: 0,
      jaw: 0,
      smile: 0,
      brow: 0,
      gestureAt: 2,
      lastGesture: -10,
      recent: [], // the last gesture kinds, newest first
      emph: false, // a loud syllable happened this frame
      browFlash: 0,
      talk: 0, // 0..1 weight of "speaking" attitude
      listen: 0,
      think: 0,
      look: { x: 0, y: 0 },
    };
  }

  // ---- arms ---------------------------------------------------------------------
  _armTargets(arm, kind, e, t) {
    const rest = POSES.rest;
    const info = kindInfo(kind);
    const g = POSES[info.pose] || POSES.rest;
    const st = arm.state;
    const ph = st.phase;
    const sway = e * 0.08 * (info.sway ?? 1);
    const f = info.freq || 5;
    const j = st.jit || [0, 0, 0];
    const upper = lerpDir(dir(arm.side, rest.upper), dir(arm.side, g.upper), e);
    const foreRaw = lerpDir(dir(arm.side, rest.fore), dir(arm.side, g.fore), e);
    // this gesture's own small offset, then the hand rhythm of its kind
    foreRaw.x += j[0] * e * arm.side;
    foreRaw.y += j[1] * e + sway * Math.sin(t * f + ph);
    foreRaw.z += j[2] * e;
    foreRaw.x += sway * 0.6 * Math.cos(t * f * 0.75 + ph) * arm.side;
    const fore = foreRaw.normalize();
    const hand = lerpDir(dir(arm.side, rest.hand), dir(arm.side, g.hand), e);
    return { upper, fore, hand };
  }

  /** Aim shoulder → arm → forearm → hand. `weight` blends over whatever pose is there now. */
  _applyArms(t, weight, fromRest = false) {
    for (const arm of this.arms) {
      const chain = [arm.shoulder, arm.arm, arm.fore, arm.hand].filter(Boolean);
      if (fromRest) for (const b of chain) b.quaternion.copy(this.rest.get(b));
      const before = chain.map((b) => b.quaternion.clone());

      const { kind, e, amp = 1 } = arm.state;
      const eff = clamp(e * amp, 0, 1.25);
      const T = this._armTargets(arm, kind, eff, t);
      if (arm.shoulder) {
        // drop the collar a little so the shoulder line looks relaxed, not shrugged
        const lift = (kindInfo(kind).lift || 0) * e;
        aimBone(arm.shoulder, arm.arm, new V3(arm.side * 0.97, -0.2 * (1 - e * 0.5) + lift, 0.05).normalize());
      }
      aimBone(arm.arm, arm.fore, T.upper);
      aimBone(arm.fore, arm.hand, T.fore);
      if (arm.finger) aimBone(arm.hand, arm.finger, T.hand);

      if (weight < 1) {
        chain.forEach((b, i) => {
          const after = b.quaternion.clone();
          b.quaternion.copy(before[i]).slerp(after, weight);
        });
        chain[0].updateMatrixWorld(true);
      }
    }
  }

  /** Start one gesture on the named arms. */
  _startGesture(names, kind, t) {
    const v = gestureVariation(this.style, kind);
    for (const arm of this.arms) {
      if (!names.includes(arm.name)) continue;
      // the second hand of a two-handed gesture is slightly out of step, like a real person's
      const second = names.length > 1 && arm !== this.arms.find((a) => names.includes(a.name));
      arm.state = {
        kind,
        t0: t + (second ? 0.08 + Math.random() * 0.12 : 0),
        dur: v.dur,
        e: 0,
        amp: v.amp * (second ? 0.92 : 1),
        jit: second ? [-v.jit[0], v.jit[1] * 0.7, v.jit[2]] : v.jit,
        phase: second ? v.phase + 1.7 : v.phase,
      };
    }
    this.s.recent = [kind, ...this.s.recent].slice(0, 3);
    this.s.lastGesture = t;
    this.s.browFlash = Math.max(this.s.browFlash, 0.3 * (this.style.face.brow || 0));
  }

  /** An arm pose held for as long as the avatar is thinking / listening. */
  _holdPose(t, kind, level, names) {
    for (const arm of this.arms) {
      if (!names.includes(arm.name)) continue;
      const st = arm.state;
      if (st.hold === kind) {
        st.e = level;
        if (level < 0.01) arm.state = { kind: "rest", t0: 0, dur: 0, e: 0, phase: st.phase };
      } else if (level > 0.05 && st.kind === "rest") {
        arm.state = { kind, hold: kind, t0: t, dur: 1, e: level, amp: 1, jit: [0, 0, 0], phase: st.phase };
      }
    }
  }

  _scheduleGestures(t, speaking, input) {
    const g = this.style.gestures;
    const s = this.s;

    for (const arm of this.arms) {
      const st = arm.state;
      if (st.kind === "rest" || st.hold) continue;
      const p = (t - st.t0) / st.dur;
      if (p < 0) {
        st.e = 0; // waiting for its (slightly late) start
      } else if (p >= 1) {
        arm.state = { kind: "rest", t0: 0, dur: 0, e: 0, phase: st.phase };
      } else {
        // ease in over the first 22 %, hold, ease out over the last 30 %
        st.e = p < 0.22 ? smooth(p / 0.22) : p > 0.7 ? smooth((1 - p) / 0.3) : 1;
      }
    }

    // poses that belong to a state (thinking / listening)
    if (this.style.thinkPose) this._holdPose(t, this.style.thinkPose, s.think, ["right"]);
    if (this.style.listenPose) this._holdPose(t, this.style.listenPose, s.listen, this.arms.map((a) => a.name));

    if (this.sig?.active) return; // the signature clip owns the body for a moment
    const free = this.arms.filter((a) => a.state.kind === "rest");
    if (!free.length) return;

    const due = t >= s.gestureAt;
    const beat = speaking && g.emphasis && s.emph && t - s.lastGesture > g.minGap && t > s.gestureAt - 1.2;
    const idle = !speaking && g.idle > 0 && due && Math.random() < g.idle;
    if (!((speaking && due) || beat || idle)) return;

    const pick = pickGesture(this.style, s.recent);
    const names = chooseArms(pick.hands, free.map((a) => a.name));
    if (names.length) this._startGesture(names, pick.kind, t);
    s.gestureAt = t + gestureDelay(this.style);
  }

  /**
   * Executive: the model's own gesture clip as an occasional signature move. It starts a
   * few seconds into a reply and then every ~15 s (random), never while a rig gesture is
   * in progress, and is cross-faded in and out so there is no jump.
   */
  _signature(t, speaking) {
    const sig = this.sig;
    const cfg = this.style.signature || { first: [3, 6], every: [11, 20] };
    const act = this.actions;
    const rnd = ([lo, hi]) => lo + Math.random() * (hi - lo);
    if (speaking && !sig.wasSpeaking) sig.next = Math.max(sig.next === Infinity ? 0 : sig.next, t + rnd(cfg.first));
    if (!speaking && sig.wasSpeaking && !sig.active) sig.next = Infinity;
    sig.wasSpeaking = speaking;

    if (!sig.active) {
      const handsBusy = this.arms.some((a) => a.state.kind !== "rest" && !a.state.hold && a.state.e > 0.02);
      if (speaking && t >= sig.next && !handsBusy) {
        sig.active = true;
        sig.t0 = t;
        act.talk.time = 0;
        act.talk.paused = false;
      }
    }
    let w = 0;
    if (sig.active) {
      const p = (t - sig.t0) / sig.dur;
      if (p >= 1) {
        sig.active = false;
        sig.next = t + rnd(cfg.every);
        act.talk.paused = true;
        act.talk.time = 0;
      } else {
        w = smooth(clamp(p / 0.14, 0, 1)) * smooth(clamp((1 - p) / 0.18, 0, 1));
      }
    }
    act.talk.setEffectiveWeight(w);
    act.idle.setEffectiveWeight(1 - w);
  }

  // ---- per frame ------------------------------------------------------------------
  /**
   * @param dt      seconds since the last frame
   * @param input   { speaking, listening, thinking, amplitude, bands:[low,mid,high], synthetic, look:{x,y} }
   *                `synthetic` = the voice cannot be measured (browser voice): a speech rhythm is made up
   */
  update(dt, input = {}) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    const s = this.s;
    const b = this.bones;
    const speaking = !!input.speaking;
    const listening = !!input.listening && !speaking;
    const thinking = !!input.thinking && !speaking && !listening;

    s.talk = damp(s.talk, speaking ? 1 : 0, 6, dt);
    s.listen = damp(s.listen, listening ? 1 : 0, 5, dt);
    s.think = damp(s.think, thinking ? 1 : 0, 4, dt);
    s.look.x = damp(s.look.x, clamp(input.look?.x ?? 0, -1, 1), 3, dt);
    s.look.y = damp(s.look.y, clamp(input.look?.y ?? 0, -1, 1), 3, dt);

    // mouth energy
    const amp = clamp(input.amplitude ?? 0, 0, 1);
    s.ampPrev = s.amp;
    s.amp = damp(s.amp, amp, amp > s.amp ? 28 : 14, dt);
    // the mouth: conditioned loudness → jaw, spectrum shares → wide / round (see lipSync.js)
    this.mouth = this.lip.update(dt, {
      speaking,
      amplitude: input.amplitude,
      bands: input.bands,
      synthetic: !!input.synthetic,
    });
    const rise = s.amp - s.ampPrev;
    s.emph = rise > 0.07 && speaking;
    if (s.emph) s.nod = Math.min(1, s.nod + 0.7); // emphasis → small nod
    s.nod = damp(s.nod, 0, 7, dt);

    // ---- base layer
    // 1) take back last frame's offsets wherever nothing else has rewritten the bone
    for (const [bone, st] of this.track) if (bone.quaternion.equals(st.post)) bone.quaternion.copy(st.pre);
    if (this.mixer) {
      if (this.actions.talk && this.sig) {
        this._signature(t, speaking);
      } else if (this.actions.talk) {
        this.actions.talk.setEffectiveWeight(s.talk);
        this.actions.idle.setEffectiveWeight(1 - s.talk);
        const quiet = s.talk < 0.02; // do not burn through the clip while nobody is talking
        if (quiet && !this.actions.talk.paused) this.actions.talk.time = 0;
        this.actions.talk.paused = quiet;
      }
      this.mixer.update(dt);
    }
    // 2) whatever is in the bones now is the base pose to add our motion to
    for (const [bone, st] of this.track) st.pre.copy(bone.quaternion);
    this.holder.updateMatrixWorld(true);

    // ---- arms
    if (this.arms.length) {
      if (!this.clipDrivesArms) {
        this._scheduleGestures(t, speaking, input);
        // rest posture always for clip-less rigs; blended in only while gesturing for clip rigs
        const gesturing = this.arms.reduce((m, a) => Math.max(m, a.state.e), 0);
        const w = this.baseArms ? 1 : clamp(gesturing * 1.5, 0, 1);
        if (w > 0.001) this._applyArms(t, w, this.baseArms);
      }
    }

    if (!this.skinned) {
      // A static mesh (no skeleton) can only move as one piece: a gentle sway and breath.
      const h = this.holder;
      h.rotation.y = Math.sin(t * 0.33) * 0.025 + s.look.x * 0.05;
      h.scale.y = this.measure.scale * (1 + Math.sin(t * 1.45) * 0.0015 + s.amp * 0.002);
      h.scale.x = h.scale.z = this.measure.scale;
      this._face(dt, t, speaking, listening, input);
      return;
    }

    // ---- spine: breathing + weight shift (+ a lean toward the listener for warm characters)
    const B = this.style.body;
    const breathe = Math.sin(t * 1.45) * 0.5 + 0.5;
    const lean = B.lean * s.talk * 0.03;
    rotateWorld(b.hips, 0, Math.sin(t * 0.37) * 0.012 * B.sway, Math.sin(t * 0.29) * 0.01 * B.sway);
    rotateWorld(b.spine, -0.004 - breathe * 0.006, Math.sin(t * 0.37 + 1) * -0.006 * B.sway, 0);
    rotateWorld(b.spine1, -breathe * 0.008 + lean * 0.5, 0, 0);
    rotateWorld(b.spine2, -breathe * 0.01 + s.listen * 0.012 + lean * 0.5, 0, Math.sin(t * 0.29) * -0.006 * B.sway);

    // ---- head
    const H = this.style.head;
    const n1 = Math.sin(t * 0.61) * 0.5 + Math.sin(t * 1.07 + 1.3) * 0.5;
    const n2 = Math.sin(t * 0.47 + 0.6) * 0.5 + Math.sin(t * 0.93 + 2.1) * 0.5;
    const n3 = Math.sin(t * 0.39 + 2.2) * 0.5 + Math.sin(t * 0.83) * 0.5;
    const talkAmt = s.talk;
    // slow side-to-side look-around (Security): flat ends so it pauses at each side
    const scan = H.scan ? clamp(Math.sin(t * 0.52) * 1.7, -1, 1) * H.scan * (1 - talkAmt * 0.75) * (1 - s.listen * 0.5) : 0;
    let yaw = n1 * (0.035 + talkAmt * 0.035) * H.yaw + s.look.x * 0.22 * (1 - talkAmt * 0.5) + scan;
    let pitch = n2 * 0.022 * H.pitch - s.look.y * 0.1 * (1 - talkAmt * 0.5) + s.nod * 0.07 * H.nod + s.amp * talkAmt * 0.03;
    let roll = n3 * 0.02 * H.roll + s.listen * 0.06 * Math.sin(t * 0.8) * H.roll - s.listen * 0.035 + (s.listen + s.think) * H.tilt;
    // thinking: gaze up and to the side, slow
    yaw += s.think * (0.12 + 0.04 * Math.sin(t * 0.7));
    pitch += s.think * -0.07;
    s.head.set(damp(s.head.x, pitch, 10, dt), damp(s.head.y, yaw, 10, dt), damp(s.head.z, roll, 10, dt));
    // yaw about the world up axis, pitch about the world X axis
    rotateWorld(b.neck, s.head.x * 0.4, s.head.y * 0.4, s.head.z * 0.4);
    rotateWorld(b.head, s.head.x * 0.6, s.head.y * 0.6, s.head.z * 0.6);

    // ---- eyes: saccades + eye contact + glances
    const e = s.eyes;
    if (t > e.next) {
      const away = s.think > 0.5 ? 0.5 : 0.12;
      e.tx = (Math.random() - 0.5) * 2 * (0.05 + away * 0.15);
      e.ty = (Math.random() - 0.5) * 2 * 0.03 + s.think * -0.05;
      e.next = t + (s.think > 0.5 ? 0.9 : 0.35) + Math.random() * (s.talk > 0.5 ? 1.6 : 2.6);
    }
    e.x = damp(e.x, e.tx + s.look.x * 0.18, 18, dt);
    e.y = damp(e.y, e.ty - s.look.y * 0.1, 18, dt);
    rotateWorld(b.lefteye, e.y, e.x, 0);
    rotateWorld(b.righteye, e.y, e.x, 0);

    for (const [bone, st] of this.track) st.post.copy(bone.quaternion);

    // ---- face (morph targets; only models that have them)
    this._face(dt, t, speaking, listening, input);
  }

  _face(dt, t, speaking, listening, input) {
    const m = this.morphs;
    const s = this.s;
    const { open, wide, round } = this.mouth;

    // blink
    const bl = s.blink;
    if (bl.t < 0 && t > bl.next) {
      bl.t = 0;
      bl.next = t + (1.6 + Math.random() * 4.2) / (this.style.face.blink || 1);
      if (Math.random() < 0.2) bl.next = t + 0.25; // occasional double blink
    }
    let blink = 0;
    if (bl.t >= 0) {
      bl.t += dt;
      const p = bl.t / 0.17;
      blink = p < 0.4 ? p / 0.4 : Math.max(0, 1 - (p - 0.4) / 0.6);
      if (p >= 1) bl.t = -1;
    }

    // mouth: see lipSync.js — `open` is the jaw, `wide` ("ee") and `round` ("oo") the shape

    // expression: this character's own smile; brows lift on emphasis and when a gesture starts
    const F = this.style.face;
    s.browFlash = damp(s.browFlash, 0, 5, dt);
    const base = F.smile + s.listen * 0.12 + s.talk * 0.04;
    s.smile = damp(s.smile, base + (Math.sin(t * 0.21) * 0.5 + 0.5) * F.smileVar, 3, dt);
    s.brow = damp(s.brow, (s.nod * 0.5 + s.listen * 0.12 + s.think * 0.2 + s.browFlash) * F.brow, 6, dt);

    // models that carry their own morph targets
    if (m.meshes.length) {
      // some models' own morphs are subtle: avatars.js can scale them (face.gain), e.g. Writer
      const G = this.cfg.face?.gain || {};
      const gm = G.mouth ?? 1;
      m.set("blink", blink);
      m.set("jaw", open * 0.75 * gm);
      m.set("mouth", open * gm);
      m.set("visemeAa", open * (0.4 + (1 - wide) * 0.4));
      m.set("visemeEe", open * wide * 0.5);
      m.set("visemeOu", open * round * 0.4);
      m.set("smile", s.smile * (G.smile ?? 1));
      m.set("browUp", s.brow);
    }
    // everything the file lacks (generated morphs, mouth interior, eyelids)
    this.face?.apply({ open, wide, round, smile: s.smile, brow: s.brow, blink });
  }

  get capabilities() {
    return {
      skinned: this.skinned,
      arms: this.arms.length === 2,
      clip: !!this.mixer,
      eyes: !!(this.bones.lefteye && this.bones.righteye),
      face: this.face?.kind || "none",
      morphs: Object.fromEntries(Object.entries(this.morphs.has).map(([k, v]) => [k, v.length > 0])),
    };
  }

  /** Stop the clip mixer. GPU resources are shared with the loader cache (the same
   *  model is shown again when the person returns to a mode), so they are only freed
   *  with `{ resources: true }`. */
  dispose({ resources = false } = {}) {
    this.face?.dispose();
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.scene);
    if (!resources) return;
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
        mat.dispose?.();
      }
    });
  }
}
