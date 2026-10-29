import * as THREE from "three";
import { findBones } from "../src/lib/avatarRig.js";

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
export function makeHumanoid({ prefix = "", pose = "T", suffix = (i) => "" } = {}) {
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
export const worldDir = (a, b) => b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
export const angleDeg = (u, v) => THREE.MathUtils.radToDeg(u.angleTo(v));
export const want = (side, comps) => new THREE.Vector3(side * comps[0], comps[1], comps[2]).normalize();

/** A clip that holds every bone at its current pose (one second long). */
export function constantClip(bones) {
  const tracks = Object.values(bones).map((b) => {
    const q = b.quaternion;
    return new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
  });
  return new THREE.AnimationClip("hold", 1, tracks);
}
