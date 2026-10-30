import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { bakedRayTargets } from "../src/lib/faceRig.js";

/** A skinned, textured sphere "head" on a two-bone skeleton, posed away from its bind pose. */
function skinnedHead({ material = new THREE.MeshBasicMaterial() } = {}) {
  const geo = new THREE.SphereGeometry(0.1, 48, 32);
  const n = geo.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = geo.attributes.position.getY(i);
    const w = THREE.MathUtils.clamp(0.5 + y * 5, 0, 1); // lower vertices follow bone 0, upper ones bone 1
    idx.set([0, 1, 0, 0], i * 4);
    wgt.set([1 - w, w, 0, 0], i * 4);
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wgt, 4));
  const b0 = new THREE.Bone();
  const b1 = new THREE.Bone();
  b1.position.set(0, 0.02, 0);
  b0.add(b1);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(b0);
  mesh.bind(new THREE.Skeleton([b0, b1]));
  mesh.position.set(0.01, 1.6, 0.02);
  // pose it away from the bind pose: this is what a raycast sees
  b1.rotation.set(0.35, 0.2, 0.1);
  b0.rotation.set(-0.1, 0, 0.05);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  return mesh;
}

const rayAt = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
const REGION = { minX: -0.05, maxX: 0.07, minY: 1.55, maxY: 1.66 };

test("baked stand-ins give the same hits as raycasting the skinned mesh itself", () => {
  const mesh = skinnedHead();
  const proxy = bakedRayTargets([mesh], REGION);
  assert.ok(proxy.length > 1 && !proxy.includes(mesh), "split over several small meshes");
  assert.ok(proxy.every((p) => p.isSkinnedMesh === undefined), "plain meshes, no bones");
  let compared = 0;
  for (let x = REGION.minX; x <= REGION.maxX; x += 0.006) {
    for (let y = REGION.minY; y <= REGION.maxY; y += 0.006) {
      const a = rayAt(x, y).intersectObject(mesh, false)[0];
      const b = rayAt(x, y).intersectObjects(proxy, false)[0];
      assert.equal(!!a, !!b, `hit or miss differs at ${x.toFixed(3)},${y.toFixed(3)}`);
      if (!a) continue;
      compared++;
      assert.ok(a.point.distanceTo(b.point) < 1e-5, `point ${a.point.toArray()} vs ${b.point.toArray()}`);
      assert.ok(Math.abs(a.uv.x - b.uv.x) < 1e-5 && Math.abs(a.uv.y - b.uv.y) < 1e-5, "same uv");
      assert.equal(b.object.material, mesh.material, "the hit reports the original material");
      assert.equal(b.object.userData.source, mesh);
    }
  }
  assert.ok(compared > 100, `${compared} rays hit the head`);
});

test("the stand-in only keeps the triangles the face rays can reach", () => {
  const count = (list) => {
    const seen = new Set(); // a triangle on a cell border is in both cells: count it once
    for (const m of list) { const i = m.geometry.index; for (let t = 0; t < i.count; t += 3) seen.add(`${i.getX(t)},${i.getX(t + 1)},${i.getX(t + 2)}`); }
    return seen.size;
  };
  const mesh = skinnedHead({ material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const everything = { minX: -1, maxX: 1, minY: 0, maxY: 3 };
  assert.ok(count(bakedRayTargets([mesh], REGION)) < count(bakedRayTargets([mesh], everything)) / 2, "region trims the triangles");
  const one = skinnedHead(); // one-sided: triangles turned away from the rays can never be hit
  assert.ok(count(bakedRayTargets([one], everything)) < one.geometry.index.count * 0.6, "back faces dropped");
});

test("cells have tight bounding boxes, so a ray scans only the cells it crosses", () => {
  const mesh = skinnedHead({ material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const cells = bakedRayTargets([mesh], REGION);
  const ray = rayAt(0.0, 1.6).ray;
  const crossed = cells.filter((c) => ray.intersectsBox(c.geometry.boundingBox));
  assert.ok(crossed.length <= 8 && crossed.length < cells.length / 4, `${crossed.length} of ${cells.length} cells`);
});

test("a mesh is skinned once: raycasting the stand-in never touches the bones again", () => {
  const mesh = skinnedHead();
  const proxy = bakedRayTargets([mesh], REGION);
  let calls = 0;
  const orig = mesh.getVertexPosition.bind(mesh);
  mesh.getVertexPosition = (...a) => { calls++; return orig(...a); };
  for (let i = 0; i < 60; i++) rayAt(0.01 + i * 0.0005, 1.6).intersectObjects(proxy, false);
  assert.equal(calls, 0);
});

test("static meshes are trimmed the same way and give the same hits", () => {
  const mat = new THREE.MeshBasicMaterial();
  const box = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), mat);
  box.position.set(0.01, 1.6, 0.02);
  box.rotation.set(0.1, 0.4, 0);
  box.updateMatrixWorld(true);
  const proxy = bakedRayTargets([box], REGION);
  assert.ok(!proxy.includes(box));
  let n = 0;
  for (let x = REGION.minX; x <= REGION.maxX; x += 0.01) {
    for (let y = REGION.minY; y <= REGION.maxY; y += 0.01) {
      const a = rayAt(x, y).intersectObject(box, false)[0];
      const b = rayAt(x, y).intersectObjects(proxy, false)[0];
      assert.equal(!!a, !!b);
      if (a) { n++; assert.ok(a.point.distanceTo(b.point) < 1e-5); }
    }
  }
  assert.ok(n > 50);
});

test("multi-material and instanced meshes are returned as they are", () => {
  const multi = skinnedHead({ material: [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()] });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial(), 2);
  assert.deepEqual(bakedRayTargets([multi, inst], REGION), [multi, inst]);
});

test("an indexless skinned mesh works too", () => {
  const mesh = skinnedHead();
  mesh.geometry = mesh.geometry.toNonIndexed();
  const proxy = bakedRayTargets([mesh], REGION);
  const a = rayAt(0.01, 1.6).intersectObject(mesh, false)[0];
  const b = rayAt(0.01, 1.6).intersectObjects(proxy, false)[0];
  assert.ok(a && b && a.point.distanceTo(b.point) < 1e-5);
});

// ---- mouth interior (v2.5.1): no "dark smear", lips from the model's own skin
import { lipColor as _lipColor, makeMouthTexture as _makeMouthTexture } from "../src/lib/faceRig.js";

test("lipColor is always visibly redder than the skin it comes from, for light and dark skin", () => {
  for (const skin of [[0.95, 0.8, 0.7], [0.55, 0.38, 0.3], [0.3, 0.2, 0.15], null]) {
    const c = _lipColor(skin);
    assert.ok(c[0] > c[1] + 0.1 && c[0] > c[2] + 0.1, `lip ${c.map((x) => x.toFixed(2))}`);
    assert.ok(c.every((x) => x >= 0 && x <= 1));
  }
});

test("mouth texture: transparent outside the opening, never black inside, teeth near the top", () => {
  const tex = _makeMouthTexture([0.8, 0.6, 0.5]);
  const { data, width: w, height: h } = tex.image;
  const px = (u, t) => {
    const c = Math.round(((u + 1) / 2) * (w - 1));
    const r = Math.round((1 - t) * (h - 1)); // row 0 is the bottom of the picture (t = 1)
    const o = (r * w + c) * 4;
    return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, data[o + 3] / 255];
  };
  assert.equal(px(0.95, 0.95)[3], 0, "outside the half-ellipse nothing is drawn");
  let darkest = 1;
  for (let t = 0.02; t < 0.7; t += 0.04) {
    for (let u = -0.6; u <= 0.6; u += 0.1) {
      const p = px(u, t);
      if (p[3] > 0.95) darkest = Math.min(darkest, Math.max(p[0], p[1], p[2]));
    }
  }
  assert.ok(darkest > 0.12, `the opening must not contain near-black pixels (darkest ${darkest.toFixed(2)})`);
  const teeth = px(0, 0.1);
  assert.ok(teeth[0] > 0.75 && teeth[1] > 0.7 && teeth[2] > 0.65, "a clean light band of upper teeth under the lip");
  const cavity = px(0, 0.8);
  assert.ok(cavity[0] > cavity[1] * 2, "the cavity and tongue are warm, not grey");
});
