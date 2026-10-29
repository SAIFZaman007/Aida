import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { AvatarRig, POSES, canonName, findBones, aimBone, rotateWorld, collectMorphs, stripScenery, portraitFraming } from "../src/lib/avatarRig.js";

// ---------------------------------------------------------------- a synthetic T-pose humanoid
function bone(name, x, y, z, parent) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z); // local; parents are positioned absolutely below, so subtract
  if (parent) { b.position.sub(parent.userData.abs); parent.add(b); }
  b.userData.abs = new THREE.Vector3(x, y, z);
  return b;
}
/** Faces +Z, character's LEFT at +X (like every supplied model). `prefix` mimics Mixamo names. */
function makeHumanoid({ prefix = "", pose = "T", suffix = (i) => "" } = {}) {
  let n = 0;
  const nm = (s) => prefix + s + suffix(n++);
  const hips = bone(nm("Hips"), 0, 0.95, 0);
  const spine = bone(nm("Spine"), 0, 1.05, 0, hips);
  const spine1 = bone(nm("Spine1"), 0, 1.2, 0, spine);
  const spine2 = bone(nm("Spine2"), 0, 1.35, 0, spine1);
  const neck = bone(nm("Neck"), 0, 1.5, 0, spine2);
  const head = bone(nm("Head"), 0, 1.58, 0, neck);
  const lEye = bone(nm("LeftEye"), 0.03, 1.66, 0.08, head);
  const rEye = bone(nm("RightEye"), -0.03, 1.66, 0.08, head);
  const arm = (side) => {
    const s = side === "Left" ? 1 : -1;
    const dy = pose === "T" ? 0 : -0.35; // A-pose: arms angled down
    const sh = bone(nm(`${side}Shoulder`), s * 0.06, 1.46, 0, spine2);
    const up = bone(nm(`${side}Arm`), s * 0.18, 1.46, 0, sh);
    const fo = bone(nm(`${side}ForeArm`), s * 0.45, 1.46 + dy * 0.9 * 0.5, 0, up);
    const ha = bone(nm(`${side}Hand`), s * 0.72, 1.46 + dy * 0.9, 0, fo);
    const fi = bone(nm(`${side}HandMiddle1`), s * 0.8, 1.46 + dy * 1.0, 0, ha);
    return [sh, up, fo, ha, fi];
  };
  arm("Left"); arm("Right");
  const root = new THREE.Group();
  root.add(hips);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.75, 0.3), new THREE.MeshBasicMaterial());
  body.position.y = 0.875;
  root.add(body);
  return { root, bones: findBones(root) };
}
const worldDir = (a, b) => b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
const angleDeg = (u, v) => THREE.MathUtils.radToDeg(u.angleTo(v));
const want = (side, comps) => new THREE.Vector3(side * comps[0], comps[1], comps[2]).normalize();

test("bone names are matched across Mixamo / Avaturn / RPM / numbered exports", () => {
  assert.equal(canonName("mixamorig:LeftForeArm_010"), "leftforearm");
  assert.equal(canonName("LeftHandMiddle1_026"), "lefthandmiddle1");
  assert.equal(canonName("Head_08"), "head");
  assert.equal(canonName("Spine1"), "spine1");
  assert.equal(canonName("HeadTop_End_011"), "headtopend");
});

for (const [label, opts] of [["T-pose", { pose: "T" }], ["A-pose", { pose: "A" }], ["Mixamo-named, numbered", { prefix: "mixamorig:", pose: "T", suffix: (i) => `_0${i}` }]]) {
  test(`${label}: arms end up hanging by the sides with slightly bent elbows`, () => {
    const { root } = makeHumanoid(opts);
    const rig = new AvatarRig(root, [], {});
    assert.equal(rig.arms.length, 2);
    for (const arm of rig.arms) {
      const up = worldDir(arm.arm, arm.fore);
      const fore = worldDir(arm.fore, arm.hand);
      assert.ok(angleDeg(up, want(arm.side, POSES.rest.upper)) < 3, `upper arm ${angleDeg(up, want(arm.side, POSES.rest.upper))}°`);
      assert.ok(angleDeg(fore, want(arm.side, POSES.rest.fore)) < 3, `forearm ${angleDeg(fore, want(arm.side, POSES.rest.fore))}°`);
      assert.ok(up.y < -0.95, "upper arm points down");
    }
  });
}

test("each gesture reaches its target directions (and returns to rest)", () => {
  const { root } = makeHumanoid({ pose: "T" });
  const rig = new AvatarRig(root, [], {});
  for (const kind of ["explain", "open", "palm", "point"]) {
    for (const arm of rig.arms) arm.state = { kind, t0: 0, dur: 1, e: 1, phase: 0 };
    rig._applyArms(0, 1, true);
    for (const arm of rig.arms) {
      const f = worldDir(arm.fore, arm.hand);
      // the hand rhythm adds a small wobble (phase 0 at t=0 → none for sin, some for cos)
      assert.ok(angleDeg(f, want(arm.side, POSES[kind].fore)) < 9, `${kind} forearm off by ${angleDeg(f, want(arm.side, POSES[kind].fore)).toFixed(1)}°`);
    }
  }
  for (const arm of rig.arms) arm.state = { kind: "rest", t0: 0, dur: 0, e: 0, phase: 0 };
  rig._applyArms(0, 1, true);
  const arm = rig.arms[0];
  assert.ok(angleDeg(worldDir(arm.arm, arm.fore), want(arm.side, POSES.rest.upper)) < 3);
});

test("the character's own left/right is detected from the skeleton", () => {
  const { root } = makeHumanoid({});
  const rig = new AvatarRig(root, [], {});
  assert.equal(rig.flip, 1); // left arm at +X
});

test("fit: any scale is normalized to 1.75 with the feet on the floor", () => {
  const { root } = makeHumanoid({});
  root.scale.setScalar(100); // a model exported in centimetres
  root.position.set(5, -3, 2);
  const rig = new AvatarRig(root, [], {});
  const box = new THREE.Box3().setFromObject(rig.holder);
  assert.ok(Math.abs(box.max.y - box.min.y - 1.75) < 0.01, `height ${box.max.y - box.min.y}`);
  assert.ok(Math.abs(box.min.y) < 0.01);
  assert.ok(Math.abs((box.max.x + box.min.x) / 2) < 0.01);
});

test("scenery props (floor disc) are removed before measuring", () => {
  const { root } = makeHumanoid({});
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2), new THREE.MeshBasicMaterial());
  floor.name = "floor__0";
  root.add(floor);
  assert.equal(stripScenery(root), 1);
  assert.equal(root.getObjectByName("floor__0"), undefined);
});

test("update(): idle, listening, thinking and speaking all run and keep the arms down at rest", () => {
  const { root } = makeHumanoid({});
  const rig = new AvatarRig(root, [], {});
  for (let i = 0; i < 90; i++) rig.update(1 / 30, { look: { x: 0.3, y: -0.2 } });
  for (const s of [{ listening: true }, { thinking: true }, { speaking: true, amplitude: 0.6, bands: [0.5, 0.3, 0.1] }]) {
    for (let i = 0; i < 60; i++) rig.update(1 / 30, s);
  }
  for (let i = 0; i < 400; i++) rig.update(1 / 30, {}); // quiet again: gestures finish
  for (const arm of rig.arms) {
    assert.equal(arm.state.kind, "rest");
    assert.ok(worldDir(arm.arm, arm.fore).y < -0.95);
  }
  rig.dispose();
});

test("update(): head motion stays small (never a broken neck) even while speaking", () => {
  const { root, bones } = makeHumanoid({});
  const rig = new AvatarRig(root, [], {});
  const fwd = new THREE.Vector3(0, 0, 1);
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    rig.update(1 / 30, { speaking: true, amplitude: Math.abs(Math.sin(i * 0.4)), look: { x: 1, y: 1 } });
    const q = bones.head.getWorldQuaternion(new THREE.Quaternion());
    worst = Math.max(worst, fwd.clone().applyQuaternion(q).angleTo(fwd));
  }
  assert.ok(worst < THREE.MathUtils.degToRad(30), `head turned ${THREE.MathUtils.radToDeg(worst).toFixed(1)}°`);
});

test("rotateWorld / aimBone are no-ops for missing bones", () => {
  assert.doesNotThrow(() => { rotateWorld(null, 1, 1, 1); aimBone(null, null, new THREE.Vector3(0, 1, 0)); });
});

test("morph helper only drives targets that exist", () => {
  const g = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  mesh.morphTargetDictionary = { mouthOpen: 0, mouthSmile: 1 };
  mesh.morphTargetInfluences = [0, 0];
  const root = new THREE.Group(); root.add(mesh);
  const m = collectMorphs(root);
  assert.deepEqual(m.has.mouth, ["mouthOpen"]);
  assert.deepEqual(m.has.jaw, []);
  m.set("mouth", 0.8); m.set("jaw", 1); m.set("smile", 0.3);
  assert.deepEqual(mesh.morphTargetInfluences, [0.8, 0.3]);
});

test("portrait framing shows head to hips and widens for narrow panels", () => {
  const m = { headTopY: 1.75, hipsY: 0.95 };
  const wide = portraitFraming(m, { aspect: 1.4 });
  const narrow = portraitFraming(m, { aspect: 0.5 });
  assert.ok(wide.y > 1.2 && wide.y < 1.45);
  assert.ok(narrow.distance > wide.distance);
});

// ---------------------------------------------------------------- clip avatars: no drift
function constantClip(bones) {
  const tracks = Object.values(bones).map((b) => {
    const q = b.quaternion;
    return new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
  });
  return new THREE.AnimationClip("hold", 1, tracks);
}

test("a held clip pose does not drift: offsets are taken back every frame (three.js only rewrites CHANGED tracks)", () => {
  const { root, bones } = makeHumanoid({});
  const clip = constantClip(bones);
  const rig = new AvatarRig(root, [clip], { animation: { idle: "hold", speaking: "loop" } });
  const fwd = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const start = rig.bones.head.getWorldQuaternion(new THREE.Quaternion());
  let worst = 0;
  let spineWorst = 0;
  for (let i = 0; i < 3000; i++) {
    rig.update(1 / 30, {});
    const q = rig.bones.head.getWorldQuaternion(new THREE.Quaternion());
    worst = Math.max(worst, THREE.MathUtils.radToDeg(fwd.clone().applyQuaternion(q).angleTo(fwd.clone().applyQuaternion(start))));
    const sq = rig.bones.spine2.getWorldQuaternion(new THREE.Quaternion());
    spineWorst = Math.max(spineWorst, THREE.MathUtils.radToDeg(up.clone().applyQuaternion(sq).angleTo(up)));
  }
  assert.ok(worst < 6, `head wandered ${worst.toFixed(1)}° from its held pose`);
  assert.ok(spineWorst < 4, `spine leaned ${spineWorst.toFixed(1)}°`);
});

test("a looping clip plus our motion stays bounded too", () => {
  const { root, bones } = makeHumanoid({});
  const rig = new AvatarRig(root, [constantClip(bones)], { animation: { idle: "loop" } });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 2000; i++) rig.update(1 / 30, { speaking: i % 200 < 100, amplitude: 0.5, look: { x: 0.5, y: 0.2 } });
  const sq = rig.bones.spine2.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(THREE.MathUtils.radToDeg(up.clone().applyQuaternion(sq).angleTo(up)) < 4);
});

test("holdAt picks which frame of the clip is the standing pose", () => {
  const { root, bones } = makeHumanoid({});
  const tracks = [new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1], [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1).toArray()])];
  const clip = new THREE.AnimationClip("turn", 1, tracks);
  const rig = new AvatarRig(root, [clip], { animation: { idle: "hold", holdAt: 1 } });
  rig.update(1 / 30, {});
  const yaw = new THREE.Euler().setFromQuaternion(rig.bones.head.quaternion, "YXZ").y;
  assert.ok(Math.abs(yaw - 1) < 0.15, `yaw ${yaw}`); // end of the clip, plus our tiny head motion
});
