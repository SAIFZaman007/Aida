import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { AvatarRig } from "../src/lib/avatarRig.js";
import {
  DEFAULT_STYLE, STYLES, KINDS, resolveStyle, pickGesture, gestureDelay, gestureVariation, chooseArms, kindInfo,
} from "../src/lib/bodyLanguage.js";
import { AVATARS } from "../src/lib/avatars.js";
import { makeHumanoid, constantClip, worldDir } from "./_humanoid.js";

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Run `fn` with Math.random replaced by a seeded generator (the rig uses Math.random). */
function seeded(seed, fn) {
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

// ---------------------------------------------------------------- the data
test("every avatar has a body-language style and every style is complete", () => {
  for (const id of Object.keys(AVATARS)) assert.ok(STYLES[id], `no style for ${id}`);
  for (const id of Object.keys(STYLES)) {
    const st = resolveStyle(id);
    assert.ok(st.gestures.repertoire.length > 0);
    for (const g of st.gestures.repertoire) {
      assert.ok(KINDS[g.kind], `${id}: unknown gesture kind "${g.kind}"`);
      assert.ok(g.w > 0);
      assert.ok(["right", "left", "either", "both"].includes(g.hands));
    }
    assert.ok(st.gestures.rate[0] > 0 && st.gestures.rate[0] <= st.gestures.rate[1]);
    assert.ok(st.gestures.dur[0] > 0 && st.gestures.dur[0] <= st.gestures.dur[1]);
    assert.ok(st.gestures.amp[1] <= 1.3, "amplitude beyond 1.3 would bend arms unnaturally");
    for (const k of ["yaw", "pitch", "roll", "nod"]) assert.equal(typeof st.head[k], "number");
    if (st.thinkPose) assert.ok(KINDS[st.thinkPose]);
    if (st.listenPose) assert.ok(KINDS[st.listenPose]);
  }
});

test("resolveStyle: ids, partial objects and unknown ids all give a full style", () => {
  assert.equal(resolveStyle(undefined), DEFAULT_STYLE);
  assert.deepEqual(resolveStyle("nope").gestures, DEFAULT_STYLE.gestures);
  const custom = resolveStyle({ face: { smile: 0.5 } });
  assert.equal(custom.face.smile, 0.5);
  assert.equal(custom.face.brow, DEFAULT_STYLE.face.brow, "unspecified fields keep their defaults");
  assert.ok(custom.gestures.repertoire.length > 0);
  assert.equal(resolveStyle("executive").head.yaw, STYLES.executive.head.yaw);
});

test("the avatars really are different from one another", () => {
  const sig = (id) => JSON.stringify([resolveStyle(id).gestures, resolveStyle(id).head, resolveStyle(id).face]);
  const ids = ["nonstop", "executive", "coder", "security", "researcher", "writer"];
  assert.equal(new Set(ids.map(sig)).size, ids.length);
  // the lively ones gesture more often and larger than the reserved ones
  const rate = (id) => resolveStyle(id).gestures.rate[0];
  assert.ok(rate("writer") < rate("executive") && rate("executive") < rate("coder") && rate("coder") < rate("security"));
  assert.ok(resolveStyle("writer").gestures.amp[1] > resolveStyle("security").gestures.amp[1]);
  assert.equal(resolveStyle("architect").face.brow, 0, "the static model has no eyebrows to move");
});

// ---------------------------------------------------------------- the pure helpers
test("pickGesture never repeats the previous gesture and follows the weights", () => {
  const rng = mulberry32(7);
  for (const id of ["nonstop", "executive", "coder", "security", "researcher", "writer"]) {
    const st = resolveStyle(id);
    let recent = [];
    const counts = {};
    for (let i = 0; i < 3000; i++) {
      const p = pickGesture(st, recent, rng);
      assert.notEqual(p.kind, recent[0], `${id}: ${p.kind} twice in a row`);
      counts[p.kind] = (counts[p.kind] || 0) + 1;
      recent = [p.kind, ...recent].slice(0, 3);
    }
    // every kind in the repertoire is actually used
    for (const g of st.gestures.repertoire) assert.ok(counts[g.kind] > 30, `${id}: ${g.kind} never chosen`);
  }
});

test("pickGesture: a heavier gesture is chosen more often; a one-entry repertoire still works", () => {
  const st = resolveStyle({ gestures: { repertoire: [{ kind: "explain", w: 9, hands: "right" }, { kind: "palm", w: 1, hands: "right" }] } });
  const rng = mulberry32(3);
  let ex = 0;
  let recent = [];
  for (let i = 0; i < 4000; i++) {
    const p = pickGesture(st, recent, rng);
    if (p.kind === "explain") ex++;
    recent = [p.kind, ...recent].slice(0, 3);
  }
  assert.ok(ex > 1500 && ex < 2500, `explain/palm alternate because repeats are blocked (${ex})`); // 50 %: they must alternate
  const one = resolveStyle({ gestures: { repertoire: [{ kind: "point", w: 1, hands: "right" }] } });
  assert.equal(pickGesture(one, ["point"], rng).kind, "point");
});

test("gestureDelay and gestureVariation stay inside the style's ranges", () => {
  const rng = mulberry32(11);
  for (const id of Object.keys(STYLES)) {
    const st = resolveStyle(id);
    for (let i = 0; i < 200; i++) {
      const d = gestureDelay(st, rng);
      assert.ok(d >= st.gestures.rate[0] && d <= st.gestures.rate[1]);
      const v = gestureVariation(st, "explain", rng);
      assert.ok(v.amp >= st.gestures.amp[0] && v.amp <= st.gestures.amp[1]);
      assert.ok(v.dur >= st.gestures.dur[0] && v.dur <= st.gestures.dur[1]);
      assert.ok(v.jit.every((x) => Math.abs(x) <= 0.1));
    }
  }
  const st = resolveStyle("nonstop");
  assert.ok(gestureVariation(st, "beat", () => 0.5).dur < gestureVariation(st, "open", () => 0.5).dur, "a beat is a short stroke");
});

test("two gestures with the same kind are never identical (random offsets)", () => {
  const st = resolveStyle("writer");
  const rng = mulberry32(5);
  const a = gestureVariation(st, "open", rng);
  const b = gestureVariation(st, "open", rng);
  assert.notDeepEqual(a.jit, b.jit);
  assert.notEqual(a.amp, b.amp);
});

test("chooseArms", () => {
  const both = ["left", "right"];
  assert.deepEqual(chooseArms("both", both), both);
  assert.deepEqual(chooseArms("both", ["left"]), ["left"], "one hand busy: the other still gestures");
  assert.deepEqual(chooseArms("right", both), ["right"]);
  assert.deepEqual(chooseArms("right", ["left"]), ["left"], "the dominant hand is busy: use the free one");
  assert.deepEqual(chooseArms("either", ["left"]), ["left"]);
  assert.deepEqual(chooseArms("either", []), []);
  let right = 0;
  const rng = mulberry32(2);
  for (let i = 0; i < 1000; i++) if (chooseArms("either", both, rng)[0] === "right") right++;
  assert.ok(right > 550 && right < 750, `right hand used ${right}/1000`);
});

test("kindInfo falls back for unknown kinds", () => {
  assert.equal(kindInfo("explain").pose, "explain");
  assert.equal(kindInfo("zzz").pose, "zzz");
});

// ---------------------------------------------------------------- the rig
/** Speak for `seconds` and return the gestures that were started. */
function speakAndRecord(id, seconds, { seed = 1, withClip = false } = {}) {
  return seeded(seed, () => {
    const { root, bones } = makeHumanoid({});
    const rig = new AvatarRig(root, withClip ? [constantClip(bones)] : [], { id, animation: withClip ? AVATARS[id].animation : {} });
    const started = [];
    const orig = rig._startGesture.bind(rig);
    rig._startGesture = (names, kind, t) => {
      started.push({ kind, names: names.slice(), t });
      orig(names, kind, t);
    };
    let amp = 0;
    for (let i = 0; i < seconds * 30; i++) {
      // a speech-like loudness: syllables at ~4 Hz with phrase pauses
      amp = 0.45 + 0.4 * Math.sin(i * 0.8) * (Math.sin(i * 0.05) > -0.5 ? 1 : 0.1);
      rig.update(1 / 30, { speaking: true, amplitude: Math.max(0, amp), bands: [0.3, 0.2, 0.1] });
    }
    return { started, rig };
  });
}

test("rig: each avatar gestures in its own way, without immediate repeats", () => {
  const out = {};
  for (const id of ["nonstop", "executive", "coder", "security", "researcher", "writer"]) {
    const { started } = speakAndRecord(id, 240, { seed: 4 });
    out[id] = started;
    assert.ok(started.length >= 6, `${id} gestured only ${started.length}× in 4 minutes`);
    for (let i = 1; i < started.length; i++) assert.notEqual(started[i].kind, started[i - 1].kind, `${id}: repeat at ${i}`);
    const allowed = new Set(resolveStyle(id).gestures.repertoire.map((g) => g.kind));
    for (const g of started) assert.ok(allowed.has(g.kind), `${id} played "${g.kind}", which is not in its repertoire`);
  }
  // lively characters make more gestures than reserved ones, and use more variety
  assert.ok(out.writer.length > out.executive.length, `writer ${out.writer.length} vs executive ${out.executive.length}`);
  assert.ok(out.executive.length > out.security.length, `executive ${out.executive.length} vs security ${out.security.length}`);
  const kinds = (id) => new Set(out[id].map((g) => g.kind)).size;
  assert.ok(kinds("writer") >= 5 && kinds("nonstop") >= 5, "expressive characters use at least five different gestures");
  // the Security guard never throws his arms open
  assert.ok(!out.security.some((g) => g.kind === "open" || g.kind === "flourish" || g.kind === "shrug"));
});

test("rig: gestures are not a continuous loop (hands rest most of the time)", () => {
  for (const id of ["executive", "coder", "security"]) {
    const frames = 60 * 30;
    const busy = seeded(9, () => {
      const { root } = makeHumanoid({});
      const rig = new AvatarRig(root, [], { id });
      let n = 0;
      for (let i = 0; i < frames; i++) {
        rig.update(1 / 30, { speaking: true, amplitude: 0.5, bands: [0.3, 0.2, 0.1] });
        if (rig.arms.some((a) => a.state.e > 0.05)) n++;
      }
      return n / frames;
    });
    assert.ok(busy < 0.65, `${id}: hands busy ${(busy * 100).toFixed(0)} % of the time`);
  }
});

test("rig: a two-handed gesture's hands are slightly out of step, not mirror copies", () => {
  seeded(6, () => {
    const { root } = makeHumanoid({});
    const rig = new AvatarRig(root, [], { id: "nonstop" });
    rig._startGesture(["left", "right"], "open", 10);
    const [a, b] = rig.arms.map((x) => x.state);
    assert.equal(a.kind, "open");
    assert.equal(b.kind, "open");
    assert.ok(Math.abs(a.t0 - b.t0) > 0.05, "the second hand starts a moment later");
    assert.notEqual(a.amp, b.amp);
    assert.notDeepEqual(a.jit, b.jit);
    assert.notEqual(a.phase, b.phase);
  });
});

test("rig: loud syllables can only add gestures (beats); monotone speech still gestures on its timer", () => {
  const loud = speakAndRecord("nonstop", 120, { seed: 2 }).started.length;
  const quiet = seeded(2, () => {
    const { root } = makeHumanoid({});
    const rig = new AvatarRig(root, [], { id: "nonstop" });
    let n = 0;
    const orig = rig._startGesture.bind(rig);
    rig._startGesture = (...a) => { n++; orig(...a); };
    for (let i = 0; i < 120 * 30; i++) rig.update(1 / 30, { speaking: true, amplitude: 0.3 }); // monotone: no emphasis
    return n;
  });
  assert.ok(loud >= quiet, `emphasis can only add gestures (${loud} vs ${quiet})`);
});

test("rig: the Executive's embedded clip is a rare signature move, not a loop", () => {
  seeded(3, () => {
    const { root, bones } = makeHumanoid({});
    const clip = new THREE.AnimationClip("gesture", 3.67, Object.values(bones).map((b) => {
      const q = b.quaternion;
      return new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 3.67], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
    }));
    const rig = new AvatarRig(root, [clip], { id: "executive", animation: AVATARS.executive.animation });
    assert.ok(rig.sig, "signature mode is on");
    assert.equal(rig.clipDrivesArms, false, "the clip no longer drives the arms continuously");

    let starts = 0;
    let active = 0;
    let was = false;
    // 60 s of silence first: it must never fire
    for (let i = 0; i < 60 * 30; i++) {
      rig.update(1 / 30, {});
      if (rig.sig.active) starts++;
    }
    assert.equal(starts, 0, "no signature move while silent");

    const speakFrames = 180 * 30;
    for (let i = 0; i < speakFrames; i++) {
      rig.update(1 / 30, { speaking: true, amplitude: 0.5, bands: [0.3, 0.2, 0.1] });
      if (rig.sig.active) active++;
      if (rig.sig.active && !was) starts++;
      was = rig.sig.active;
    }
    // every 11–20 s (+ 3–6 s to begin, + 3.67 s of playing): between 5 and 13 times in 3 minutes
    assert.ok(starts >= 5 && starts <= 13, `signature played ${starts}× in 180 s`);
    assert.ok(active / speakFrames < 0.3, `signature occupies ${(100 * active / speakFrames).toFixed(0)} % of the time`);
  });
});

test("rig: the signature move waits for a rig gesture to end (they never fight)", () => {
  seeded(8, () => {
    const { root, bones } = makeHumanoid({});
    const rig = new AvatarRig(root, [constantClip(bones)], { id: "executive", animation: AVATARS.executive.animation });
    let overlap = 0;
    for (let i = 0; i < 240 * 30; i++) {
      rig.update(1 / 30, { speaking: true, amplitude: 0.5, bands: [0.3, 0.2, 0.1] });
      if (rig.sig.active && rig.arms.some((a) => a.state.e > 0.3 && !a.state.hold)) overlap++;
    }
    assert.equal(overlap, 0);
  });
});

test("rig: the signature clip and gestures do not make the body drift", () => {
  seeded(12, () => {
    const { root, bones } = makeHumanoid({});
    const rig = new AvatarRig(root, [constantClip(bones)], { id: "executive", animation: AVATARS.executive.animation });
    const up = new THREE.Vector3(0, 1, 0);
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      rig.update(1 / 30, { speaking: i % 400 < 300, listening: i % 400 >= 300, amplitude: 0.5, bands: [0.3, 0.2, 0.1] });
      const sq = rig.bones.spine2.getWorldQuaternion(new THREE.Quaternion());
      worst = Math.max(worst, THREE.MathUtils.radToDeg(up.clone().applyQuaternion(sq).angleTo(up)));
    }
    assert.ok(worst < 4, `spine leaned ${worst.toFixed(1)}°`);
  });
});

test("rig: thinking holds a pose (Researcher: hand to chin) and lets go afterwards", () => {
  seeded(1, () => {
    const { root } = makeHumanoid({});
    const rig = new AvatarRig(root, [], { id: "researcher" });
    const right = rig.arms.find((a) => a.name === "right");
    const left = rig.arms.find((a) => a.name === "left");
    for (let i = 0; i < 90; i++) rig.update(1 / 30, { thinking: true });
    assert.equal(right.state.kind, "chin");
    assert.ok(right.state.e > 0.9);
    assert.equal(left.state.kind, "rest", "only one hand goes to the chin");
    const hand = worldDir(right.fore, right.hand);
    assert.ok(hand.y > 0.3, "the forearm points up toward the face");
    for (let i = 0; i < 90; i++) rig.update(1 / 30, {});
    assert.equal(right.state.kind, "rest");
    assert.ok(right.state.e < 0.01);
  });
});

test("rig: the Executive folds his hands while listening; others do not", () => {
  seeded(1, () => {
    const { root } = makeHumanoid({});
    const ex = new AvatarRig(root, [], { id: "executive" });
    for (let i = 0; i < 90; i++) ex.update(1 / 30, { listening: true });
    assert.ok(ex.arms.every((a) => a.state.kind === "fold" && a.state.e > 0.9));
    for (let i = 0; i < 90; i++) ex.update(1 / 30, {});
    assert.ok(ex.arms.every((a) => a.state.kind === "rest"));

    const { root: r2 } = makeHumanoid({});
    const wr = new AvatarRig(r2, [], { id: "writer" });
    for (let i = 0; i < 90; i++) wr.update(1 / 30, { listening: true });
    assert.ok(wr.arms.every((a) => a.state.kind === "rest"));
  });
});

test("rig: Security scans the room with his head while idle; Coder keeps still", () => {
  const range = (id) => seeded(1, () => {
    const { root } = makeHumanoid({});
    const rig = new AvatarRig(root, [], { id });
    let lo = 1;
    let hi = -1;
    for (let i = 0; i < 60 * 30; i++) {
      rig.update(1 / 30, {});
      lo = Math.min(lo, rig.s.head.y);
      hi = Math.max(hi, rig.s.head.y);
    }
    return hi - lo;
  });
  const sec = range("security");
  const cod = range("coder");
  assert.ok(sec > 0.2, `security swept ${sec.toFixed(2)} rad`);
  assert.ok(cod < 0.12, `coder moved ${cod.toFixed(2)} rad`);
});

test("rig: the folded hands (Executive) meet without crossing through each other, right hand over left", () => {
  const { root } = makeHumanoid({});
  const rig = new AvatarRig(root, [], { id: "executive" });
  for (const arm of rig.arms) arm.state = { kind: "fold", hold: "test", e: 1, amp: 1, jit: [0, 0, 0], phase: 0, t0: 0, dur: 1 };
  rig._applyArms(0, 1, true);
  const left = rig.arms.find((a) => a.name === "left");
  const right = rig.arms.find((a) => a.name === "right");
  const wl = left.hand.getWorldPosition(new THREE.Vector3());
  const wr = right.hand.getWorldPosition(new THREE.Vector3());
  // wrists stay on their own side of the body's midline (x = 0): no arm reaches across the other
  assert.ok(wl.x > -0.02 && wr.x < 0.02, `wrists at x=${wl.x.toFixed(3)} / ${wr.x.toFixed(3)}`);
  assert.ok(wr.y > wl.y, "the top (right) hand rests slightly higher than the left");
  const fl = worldDir(left.fore, left.hand);
  const fr = worldDir(right.fore, right.hand);
  assert.ok(fl.z > 0.7 && fr.z > 0.7, "forearms point forward, not down at the belt");
  assert.ok(fl.y > -0.2 && fr.y > -0.2, "forearms do not slope down");
});

test("rig: only the Executive uses the folded-hands pose (Security's clasp is unchanged)", () => {
  const { root } = makeHumanoid({});
  const sec = new AvatarRig(root, [], { id: "security" });
  const kinds = sec.style.gestures.repertoire.map((g) => g.kind);
  assert.ok(kinds.includes("clasp") && !kinds.includes("fold"));
  const { root: r2 } = makeHumanoid({});
  const ex = new AvatarRig(r2, [], { id: "executive" });
  assert.equal(ex.style.listenPose, "fold");
});

test("rig: new poses point where they should", () => {
  const { root } = makeHumanoid({});
  const rig = new AvatarRig(root, [], { id: "writer" });
  const hands = {};
  for (const kind of ["clasp", "shrug", "flourish", "chin", "explain"]) {
    for (const arm of rig.arms) arm.state = { kind, hold: "test", e: 1, amp: 1, jit: [0, 0, 0], phase: 0, t0: 0, dur: 1 };
    rig._applyArms(0, 1, true);
    const l = rig.arms[0].hand.getWorldPosition(new THREE.Vector3());
    const r = rig.arms[1].hand.getWorldPosition(new THREE.Vector3());
    hands[kind] = { gap: Math.abs(l.x - r.x), y: (l.y + r.y) / 2, z: (l.z + r.z) / 2 };
  }
  assert.ok(hands.clasp.gap < hands.explain.gap * 0.6, "clasped hands are closer together than explaining ones");
  assert.ok(hands.flourish.gap > hands.explain.gap, "a flourish opens wider");
  assert.ok(hands.chin.y > hands.explain.y, "chin pose is higher than the explain pose");
  assert.ok(hands.shrug.gap > hands.explain.gap);
});
