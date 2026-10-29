/*
  faceRig.js — lip-sync, blinks and expressions for ANY avatar, with or without
  morph targets in the file.

  Only one of the seven supplied avatars (Writer) ships with mouth morph targets. The
  others are closed-mouth meshes with painted lips and eyes. This module gives them a
  speaking face at load time, without touching the files:

    JAW / SMILE / BROW   real vertex motion. Extra morph targets are generated for the
                         skin mesh(es) around the mouth and brows (weights are smooth
                         falloffs around measured landmarks), so the chin and lower lip
                         really move, the corners of the mouth lift, the brows rise —
                         correctly for any head orientation, because they are ordinary
                         three.js morph targets applied before skinning.
    MOUTH OPENING        a thin, curved "mouth interior" patch (dark cavity, upper teeth,
                         tongue) that follows the skin surface and opens in step with
                         the jaw, so the lips visibly part.
    BLINK                a skin-coloured eyelid patch per eye (colour sampled from the
                         avatar's own skin texture) that closes over painted or modelled
                         eyes, with a lash line.

  Models that already carry the morph target (Writer: mouthOpen / mouthSmile) keep
  using their own; only what is missing is added (Writer gets blinks).

  Landmarks are given in METRES relative to the head bone (see avatars.js `face`), or
  found automatically from eye bones / eye meshes. Everything is guarded: a model that
  cannot be analysed simply gets no face animation instead of an error.

  Pure three.js, no canvas needed for the patches (textures are generated as pixels),
  so the maths is unit-tested in Node.
*/
import * as THREE from "three";

const V3 = THREE.Vector3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** smoothstep that also works when e0 > e1 (a falling edge). */
export function sstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
const gauss = (d2, sigma) => Math.exp(-d2 / (2 * sigma * sigma));

// ----------------------------------------------------------------------------- landmarks
const NOT_SKIN = /hair|glass|lash|brow|cornea|eyeball|eyes?\b|eye_|teeth|tongue|beard|cap\b|hat\b|outfit|cloth|shoe|footwear|shirt|suit\b|tie\b|belt|button|sole|leather|floor/i;
const EYE_PARTS = /cornea|eyeball|eye_mat|(^|[_\s])eye(left|right)?([_\s]|$)|wolf3d_eye/i;

export const FACE_DEFAULTS = {
  mouth: { y: 0.0, half: 0.024 },
  eyes: { y: 0.066, x: 0.029, w: 0.0135, h: 0.008 },
  chin: 0.058, // mouth line -> chin (m)
  jaw: 0.013, // chin drop at full opening (m)
};

/** Merge a model's `face` config with defaults and what the file itself tells us. */
export function resolveLandmarks(cfg = {}, found = {}) {
  const eyes = { ...FACE_DEFAULTS.eyes, ...(found.eyes || {}), ...(cfg.eyes || {}) };
  const mouth = { ...FACE_DEFAULTS.mouth, y: eyes.y - 0.066, ...(cfg.mouth || {}) };
  return {
    eyes,
    mouth,
    chin: cfg.chin ?? FACE_DEFAULTS.chin,
    jaw: cfg.jaw ?? FACE_DEFAULTS.jaw,
  };
}

// ----------------------------------------------------------------------------- morph weights
/**
 * Displacements (metres, stage axes) of one vertex for each generated morph.
 * `p` is the vertex position RELATIVE to the head reference (x right, y up, z forward);
 * `lm` the resolved landmarks, `mz` the depth of the lips.
 */
export function faceDeltas(p, lm, mz) {
  const my = lm.mouth.y;
  const half = lm.mouth.half;
  const ax = Math.abs(p.x);
  const side = clamp(p.x / 0.007, -1, 1); // 0 on the midline: both halves never pull in opposite directions
  const front = sstep(mz - 0.06, mz - 0.03, p.z); // only the front of the head moves

  const out = {
    jaw: [0, 0, 0],
    smile: [0, 0, 0],
    wide: [0, 0, 0],
    round: [0, 0, 0],
    brow: [0, 0, 0],
  };

  // ---- jaw: everything below the mouth line, tapering to nothing under the chin
  {
    const chinY = my - lm.chin;
    const wy = sstep(my + 0.002, my - 0.009, p.y) * (1 - sstep(chinY + 0.004, chinY - 0.034, p.y));
    const wx = 1 - sstep(0.032, 0.074, ax);
    // the corners of the mouth follow the jaw only partly (real mouths do not shear there)
    const corner = 1 - 0.5 * gauss((ax - half) ** 2 + (p.y - my) ** 2, 0.011);
    const w = wy * wx * front * corner;
    if (w > 1e-4) out.jaw = [0, -lm.jaw * w, -lm.jaw * 0.3 * w];
  }

  // ---- mouth corners
  const dxc = ax - half * 0.96;
  const dyc = p.y - (my - 0.0005);
  const gc = gauss(dxc * dxc + dyc * dyc, 0.0115) * front;
  {
    const cheekX = ax - (half + 0.009);
    const cheekY = p.y - (my + 0.013);
    const gk = gauss(cheekX * cheekX + cheekY * cheekY, 0.021) * front;
    out.smile = [side * 0.0042 * gc, 0.0078 * gc + 0.0034 * gk, 0.0015 * gc + 0.0012 * gk];
    out.wide = [side * 0.0066 * gc, -0.0006 * gc, -0.0008 * gc];
    const gr = gauss((ax - half * 0.9) ** 2 + dyc * dyc, 0.016) * front;
    const lip = gauss((p.x / (half * 0.85)) ** 2 + ((p.y - my) / 0.011) ** 2, 1) * front; // 1 at the lips
    out.round = [-side * 0.0078 * gr, 0, 0.0062 * lip + 0.0015 * gr];
  }

  // ---- brows
  {
    const by = lm.eyes.y + 0.024;
    const bx = ax - lm.eyes.x;
    const gb = gauss(bx * bx * (0.0115 / 0.022) ** 2 + (p.y - by) ** 2, 0.0115) * front;
    out.brow = [0, 0.006 * gb, 0.001 * gb];
  }
  return out;
}

export const MORPH_NAMES = ["aidaJaw", "aidaSmile", "aidaWide", "aidaRound", "aidaBrow"];
const KEYS = ["jaw", "smile", "wide", "round", "brow"];

/**
 * Adds the generated morph targets to `mesh` (its geometry is cloned first, so a cached
 * model shared with another rig is never modified). Returns the number of vertices
 * that actually move.
 */
export function addFaceMorphs(mesh, { head, lm, mouthZ }) {
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position;
  const n = pos.count;
  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;
  const inv = new THREE.Matrix3().setFromMatrix4(world).invert();
  const arrays = KEYS.map(() => new Float32Array(n * 3));
  const v = new V3();
  const d = new V3();
  let moving = 0;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(world).sub(head);
    const delta = faceDeltas(v, lm, mouthZ - head.z);
    let any = false;
    KEYS.forEach((k, ki) => {
      const dd = delta[k];
      if (dd[0] === 0 && dd[1] === 0 && dd[2] === 0) return;
      d.set(dd[0], dd[1], dd[2]).applyMatrix3(inv); // stage -> mesh-local
      arrays[ki][i * 3] = d.x;
      arrays[ki][i * 3 + 1] = d.y;
      arrays[ki][i * 3 + 2] = d.z;
      any = true;
    });
    if (any) moving++;
  }
  if (!moving) {
    geo.dispose();
    return 0;
  }
  geo.morphAttributes.position = arrays.map((a) => new THREE.Float32BufferAttribute(a, 3));
  geo.morphTargetsRelative = true;
  mesh.geometry = geo;
  mesh.morphTargetDictionary = Object.fromEntries(MORPH_NAMES.map((nm, i) => [nm, i]));
  mesh.morphTargetInfluences = new Array(MORPH_NAMES.length).fill(0);
  mesh.updateMorphTargets();
  mesh.userData.aidaFaceGeometry = geo;
  return moving;
}

// ----------------------------------------------------------------------------- textures
function dataTexture(w, h, fill) {
  const data = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) {
    const t = 1 - r / (h - 1); // 0 at the TOP of the picture (data row 0 is the bottom)
    for (let c = 0; c < w; c++) {
      const u = (c / (w - 1)) * 2 - 1;
      const px = fill(u, t);
      const o = (r * w + c) * 4;
      data[o] = clamp(px[0], 0, 1) * 255;
      data[o + 1] = clamp(px[1], 0, 1) * 255;
      data[o + 2] = clamp(px[2], 0, 1) * 255;
      data[o + 3] = clamp(px[3], 0, 1) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Open mouth seen from the front: upper teeth, dark cavity, tongue, soft edge. */
export function makeMouthTexture() {
  return dataTexture(96, 48, (u, t) => {
    // half-ellipse: full width along the mouth line (t = 0), narrowing to the bottom
    const r = Math.sqrt(u * u + t * t);
    const edge = sstep(1.0, 0.86, r);
    if (edge <= 0) return [0, 0, 0, 0];
    const shade = 0.55 + 0.45 * sstep(1.0, 0.62, r); // darker towards the lips
    let col = [0.1, 0.025, 0.03];
    const tongue = sstep(0.42, 0.7, t) * sstep(0.85, 0.25, Math.abs(u));
    col = col.map((c, i) => c * (1 - tongue) + [0.5, 0.15, 0.17][i] * tongue);
    const teeth = sstep(0.15, 0.06, t) * sstep(0.78, 0.6, Math.abs(u));
    col = col.map((c, i) => c * (1 - teeth) + [0.8, 0.76, 0.7][i] * teeth);
    return [col[0] * shade, col[1] * shade, col[2] * shade, edge];
  });
}

/** Closed eyelid: skin colour with a soft edge and a dark lash line along the bottom. */
export function makeLidTexture(skin = [0.86, 0.66, 0.56]) {
  const dark = [skin[0] * 0.3, skin[1] * 0.22, skin[2] * 0.2];
  return dataTexture(64, 32, (u, t) => {
    const r = Math.sqrt(u * u + (t * 2 - 1) ** 2 * 0.9);
    const a = sstep(1.0, 0.62, r);
    if (a <= 0) return [0, 0, 0, 0];
    const lash = sstep(0.8, 0.93, t) * sstep(0.97, 0.7, Math.abs(u)); // bottom edge
    const crease = 0.86 + 0.14 * sstep(0.0, 0.35, t) - 0.08 * sstep(0.6, 1.0, t); // soft shade under the brow and at the lashes
    const c = skin.map((s, i) => s * crease * (1 - lash) + dark[i] * lash);
    return [c[0], c[1], c[2], a];
  });
}

// ----------------------------------------------------------------------------- patches
/**
 * A group whose axes are the STAGE's axes (x right, y up, z forward) and whose unit is
 * one metre, parented to `anchor` (the head bone): it follows every head movement but
 * scaling it scales in stage directions whatever the bone's own axes are.
 */
export function stagePivot(anchor, worldPoint) {
  anchor.updateWorldMatrix(true, false);
  const pivot = new THREE.Group();
  const q = new THREE.Quaternion();
  const s = new V3();
  anchor.matrixWorld.decompose(new V3(), q, s);
  pivot.position.copy(anchor.worldToLocal(worldPoint.clone()));
  pivot.quaternion.copy(q.invert());
  const k = 1 / (s.x || 1);
  pivot.userData.baseScale = k;
  pivot.scale.setScalar(k);
  anchor.add(pivot);
  return pivot;
}

/** Local set-scale for a pivot made by stagePivot (keeps the metre unit). */
export function setPivotScale(pivot, sx, sy, sz = 1) {
  const k = pivot.userData.baseScale || 1;
  pivot.scale.set(k * sx, k * sy, k * sz);
}

/**
 * Static stand-ins for raycasting against the face meshes — above all the SKINNED ones.
 *
 * three.js re-skins every triangle of a skinned mesh for every ray it casts (four bone
 * matrices per vertex), and tests every triangle of the mesh. The face rig fires ~180 rays
 * (mouth, eyelids, skin colour), which froze the page for 0.4–2.9 s every time a mode's
 * avatar was built — the "stuck while switching modes" problem. Here:
 *   • each vertex is skinned ONCE, in the pose the rig is built in;
 *   • every ray runs along -z inside the face column, so only triangles that overlap
 *     `region` ({ minX, maxX, minY, maxY }, stage metres) in x/y can matter (and, for a
 *     one-sided material, only those facing the rays — what three.js itself would keep);
 *   • the survivors are split over a small grid of sub-meshes with tight bounding boxes,
 *     so a ray only scans the few cells it crosses.
 * The stand-ins share the original's material and UVs, so the hits (point, uv, material)
 * are the ones a direct raycast gives — found ~50× faster. Instanced meshes and meshes with
 * a material array are returned unchanged.
 *
 * Returns the flat list of meshes to raycast (several per input mesh).
 */
export const BAKE_GRID = 8;

export function bakedRayTargets(meshes, region) {
  return meshes.flatMap((m) => bakeOne(m, region));
}

function bakeOne(mesh, region) {
  if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material)) return [mesh];
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return [mesh];
  if (mesh.isSkinnedMesh && (!mesh.skeleton || !geo.attributes.skinIndex)) return [mesh];
  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;
  const n = pos.count;
  const out = new Float32Array(n * 3);
  const v = new V3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(world); // skinned (and morphed) position, in stage metres
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  const position = new THREE.BufferAttribute(out, 3);
  const side = mesh.material.side;
  const G = BAKE_GRID;
  const cw = (region.maxX - region.minX) / G;
  const ch = (region.maxY - region.minY) / G;
  const cell = (c, lo, size) => Math.min(G - 1, Math.max(0, Math.floor((c - lo) / size)));
  const cells = new Map(); // cell id -> { idx: [], lo: [x,y,z], hi: [x,y,z] }
  const src = geo.index;
  const tri = src ? src.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const a = src ? src.getX(t * 3) : t * 3;
    const b = src ? src.getX(t * 3 + 1) : t * 3 + 1;
    const c = src ? src.getX(t * 3 + 2) : t * 3 + 2;
    const ax = out[a * 3], bx = out[b * 3], cx = out[c * 3];
    const ay = out[a * 3 + 1], by = out[b * 3 + 1], cy = out[c * 3 + 1];
    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
    if (minX > region.maxX || maxX < region.minX || minY > region.maxY || maxY < region.minY) continue;
    // three.js ignores triangles turned away from the ray for a one-sided material; so do we
    if (side !== THREE.DoubleSide) {
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); // z of the face normal; the rays travel along -z
      if (side === THREE.FrontSide ? nz <= 0 : nz >= 0) continue;
    }
    const az = out[a * 3 + 2], bz = out[b * 3 + 2], cz = out[c * 3 + 2];
    const minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
    const x0 = cell(minX, region.minX, cw), x1 = cell(maxX, region.minX, cw);
    const y0 = cell(minY, region.minY, ch), y1 = cell(maxY, region.minY, ch);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const id = gy * G + gx;
        let k = cells.get(id);
        if (!k) cells.set(id, (k = { idx: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
        k.idx.push(a, b, c);
        k.lo[0] = Math.min(k.lo[0], minX); k.hi[0] = Math.max(k.hi[0], maxX);
        k.lo[1] = Math.min(k.lo[1], minY); k.hi[1] = Math.max(k.hi[1], maxY);
        k.lo[2] = Math.min(k.lo[2], minZ); k.hi[2] = Math.max(k.hi[2], maxZ);
      }
    }
  }
  const big = n > 65535;
  const parts = [];
  for (const k of cells.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", position); // shared by every cell
    if (geo.attributes.uv) g.setAttribute("uv", geo.attributes.uv); // shared, never modified
    g.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(k.idx) : new Uint16Array(k.idx), 1));
    const centre = new V3((k.lo[0] + k.hi[0]) / 2, (k.lo[1] + k.hi[1]) / 2, (k.lo[2] + k.hi[2]) / 2);
    g.boundingSphere = new THREE.Sphere(centre, centre.distanceTo(new V3(k.hi[0], k.hi[1], k.hi[2])) + 1e-6);
    // a cell is a thin column along the rays' axis: its sphere is huge, its box is what rejects rays
    g.boundingBox = new THREE.Box3(new V3(...k.lo), new V3(...k.hi));
    const part = new THREE.Mesh(g, mesh.material); // same material: side culling and colour map as the original
    part.userData.source = mesh;
    parts.push(part);
  }
  return parts;
}

/**
 * A grid of `nx` x `ny` vertices spanning x in [-halfW, halfW] and y in [0, -height]
 * below the pivot's origin, each vertex pushed onto the skin (raycast from the front)
 * plus `lift`. Coordinates are relative to `origin` (stage metres).
 */
export function conformalPatch({ origin, halfW, height, nx = 9, ny = 5, lift = 0.0013, rayTargets, fallbackZ }) {
  const rc = new THREE.Raycaster();
  const positions = [];
  const uvs = [];
  const idx = [];
  const zs = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = ((i / nx) * 2 - 1) * halfW;
      const y = -(j / ny) * height;
      let z = fallbackZ - origin.z;
      if (rayTargets.length) {
        rc.set(new V3(origin.x + x, origin.y + y, origin.z + 1), new V3(0, 0, -1));
        const hit = rc.intersectObjects(rayTargets, false)[0];
        if (hit) z = hit.point.z - origin.z;
      }
      zs.push(z);
    }
  }
  const raw = zs.slice();
  // two box-blur passes: a stray ray (hair, a lash, a mesh seam) must not make a spike
  const W = nx + 1;
  for (let pass = 0; pass < 2; pass++) {
    const prev = zs.slice();
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        let sum = 0;
        let cnt = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const jj = j + dj;
            const ii = i + di;
            if (jj < 0 || jj > ny || ii < 0 || ii > nx) continue;
            sum += prev[jj * W + ii];
            cnt++;
          }
        }
        zs[j * W + i] = sum / cnt;
      }
    }
  }
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = ((i / nx) * 2 - 1) * halfW;
      const y = -(j / ny) * height;
      // never behind the real surface (a cornea bulges), never a spike in front of it
      const z = Math.max(zs[j * W + i], raw[j * W + i] - 0.0005);
      positions.push(x, y, Math.min(z, raw[j * W + i] + 0.0015) + lift);
      uvs.push(i / nx, 1 - j / ny);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Eyelid / skin material that reacts to the lights exactly like the avatar's own skin:
 * a clone of the skin material with only the colour picture replaced.
 */
export function lidMaterial(base, tex) {
  const m = base && base.isMaterial && !base.isShaderMaterial ? base.clone() : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  for (const k of ["normalMap", "aoMap", "emissiveMap", "roughnessMap", "metalnessMap", "bumpMap", "alphaMap", "displacementMap", "lightMap", "specularColorMap", "sheenColorMap", "transmissionMap", "thicknessMap"]) {
    if (k in m) m[k] = null;
  }
  if ("color" in m) m.color.set(0xffffff);
  m.map = tex;
  m.transparent = true;
  m.depthWrite = false;
  m.side = THREE.FrontSide;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  m.vertexColors = false;
  return m;
}

/** Average colour (0..1) of a few pixels of the texture under a raycast hit; null if unavailable. */
export function sampleSkin(hit) {
  try {
    const img = hit?.object?.material?.map?.image;
    if (!img || !hit.uv || typeof document === "undefined") return null;
    const w = img.width;
    const h = img.height;
    const c = document.createElement("canvas");
    c.width = c.height = 5;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, Math.round(hit.uv.x * w) - 2, Math.round(hit.uv.y * h) - 2, 5, 5, 0, 0, 5, 5);
    const px = ctx.getImageData(0, 0, 5, 5).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < px.length; i += 4) {
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
    }
    const n = px.length / 4;
    return [r / n / 255, g / n / 255, b / n / 255];
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------- the rig
const hasMorph = (root, names) => {
  let found = false;
  root.traverse((o) => {
    if (o.isMesh && o.morphTargetDictionary && names.some((n) => n in o.morphTargetDictionary)) found = true;
  });
  return found;
};

export class FaceRig {
  /**
   * @param scene   the cloned glTF scene (already fitted: matrices are in stage metres)
   * @param anchor  the head bone (or the scene for a rig-less model)
   * @param cfg     the model's `face` config (see avatars.js)
   */
  constructor(scene, anchor, cfg = {}) {
    this.cfg = cfg;
    this.kind = "none";
    this.disposables = [];
    this.skinMeshes = [];
    this.mouth = null;
    this.lids = [];
    this.s = { open: 0, wide: 0, round: 0, smile: 0, brow: 0, blink: 0 };
    this.landmarks = null;
    if (cfg.mode === "none") return;
    try {
      this._build(scene, anchor, cfg);
    } catch (e) {
      console.warn("[avatar] face animation disabled:", e?.message || e);
      this.dispose();
      this.kind = "none";
    }
  }

  _build(scene, anchor, cfg) {
    scene.updateMatrixWorld(true);
    const ref = anchor.isBone ? anchor.getWorldPosition(new V3()) : new V3(cfg.origin?.x ?? 0, cfg.origin?.y ?? 0, cfg.origin?.z ?? 0);
    this.ref = ref;

    // eyes from bones / eye meshes when the config does not say
    const found = {};
    const eyeMeshes = [];
    scene.traverse((o) => {
      if (o.isMesh && EYE_PARTS.test(`${o.name} ${o.material?.name || ""}`)) eyeMeshes.push(o);
    });
    const lbone = this._bone(scene, "lefteye");
    const rbone = this._bone(scene, "righteye");
    if (lbone && rbone) {
      const l = lbone.getWorldPosition(new V3());
      const r = rbone.getWorldPosition(new V3());
      found.eyes = { x: Math.abs(l.x - r.x) / 2, y: (l.y + r.y) / 2 - ref.y };
    } else if (eyeMeshes.length) {
      // each eye mesh on its own: centre of the eye = average of the mesh centres
      const centres = eyeMeshes.map((m) => new THREE.Box3().setFromObject(m).getCenter(new V3()));
      const offCentre = centres.filter((c) => Math.abs(c.x - ref.x) > 0.008);
      if (offCentre.length) {
        found.eyes = {
          y: offCentre.reduce((a, c) => a + c.y, 0) / offCentre.length - ref.y,
          x: offCentre.reduce((a, c) => a + Math.abs(c.x - ref.x), 0) / offCentre.length,
        };
      }
    }
    const lm = resolveLandmarks(cfg, found);
    this.landmarks = lm;

    // skin meshes = textured meshes that contain the mouth
    const mouthW = new V3(ref.x, ref.y + lm.mouth.y, ref.z);
    const skin = [];
    const raySkin = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const label = `${o.name} ${o.material?.name || ""}`;
      o.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(o);
      const eyeY = ref.y + lm.eyes.y;
      const nearMouth = box.min.y - 0.01 <= mouthW.y && box.max.y + 0.01 >= mouthW.y && box.min.x <= ref.x && box.max.x >= ref.x;
      const nearEye = box.min.y - 0.02 <= eyeY && box.max.y + 0.02 >= eyeY;
      const isEye = EYE_PARTS.test(label);
      if (nearMouth && (/lips?\b/i.test(label) || !NOT_SKIN.test(label))) skin.push(o);
      if ((nearEye && isEye) || (nearMouth && !isEye && (/lips?\b/i.test(label) || !NOT_SKIN.test(label)))) raySkin.push(o);
    });
    if (!skin.length) throw new Error("no skin mesh near the mouth");

    // Every ray below runs along -z inside the face column; skinned meshes are skinned ONCE
    // into static stand-ins covering just that column (see bakedRayTargets).
    const { eyes: le, mouth: lmo } = lm;
    const margin = 0.03;
    const halfX = Math.max(le.x + le.w, lmo.half) + margin;
    const region = {
      minX: ref.x - halfX,
      maxX: ref.x + halfX,
      maxY: ref.y + Math.max(le.y + 2 * le.h + 0.016, lmo.y) + margin,
      minY: ref.y + Math.min(lmo.y - lm.jaw, le.y - 0.03 - le.h) - margin,
    };
    const baked = new Map();
    for (const m of new Set([...skin, ...raySkin])) baked.set(m, bakedRayTargets([m], region));
    const rayOf = (list) => list.flatMap((m) => baked.get(m));
    const skinRay = rayOf(skin);
    const raySkinRay = rayOf(raySkin);

    // depth of the lips / eyes: ray from the front
    const rc = new THREE.Raycaster();
    const surf = (x, y) => {
      rc.set(new V3(x, y, ref.z + 1), new V3(0, 0, -1));
      return rc.intersectObjects(skinRay, false)[0] || null;
    };
    const mHit = surf(ref.x, mouthW.y);
    const mouthZ = mHit ? mHit.point.z : ref.z + 0.09;

    const nativeMouth = hasMorph(scene, ["mouthOpen", "jawOpen", "viseme_aa"]);
    const nativeSmile = hasMorph(scene, ["mouthSmile", "mouthSmileLeft"]);
    const nativeBlink = hasMorph(scene, ["eyeBlinkLeft", "eyesClosed"]);
    const nativeBrow = hasMorph(scene, ["browInnerUp"]);
    this.native = { mouth: nativeMouth, smile: nativeSmile, blink: nativeBlink, brow: nativeBrow };

    // ---- procedural morphs (skin meshes that have no morph targets of their own)
    if (cfg.mode !== "native" && (!nativeMouth || !nativeSmile || !nativeBrow)) {
      for (const m of skin) {
        if (m.morphTargetDictionary) continue;
        const moved = addFaceMorphs(m, { head: ref, lm, mouthZ });
        if (moved) {
          this.skinMeshes.push(m);
          if (m.userData.aidaFaceGeometry) this.disposables.push(m.userData.aidaFaceGeometry);
        }
      }
    }

    // ---- mouth interior (only where the file has no mouth morph)
    if (!nativeMouth && this.skinMeshes.length) {
      const origin = new V3(ref.x, ref.y + lm.mouth.y, mouthZ);
      const geo = conformalPatch({ origin, halfW: lm.mouth.half, height: lm.jaw, nx: 12, ny: 5, rayTargets: skinRay, fallbackZ: mouthZ, lift: 0.0011 });
      const tex = makeMouthTexture();
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      mesh.visible = false;
      const pivot = stagePivot(anchor, origin);
      pivot.add(mesh);
      this.mouth = { pivot, mesh, half: lm.mouth.half, depth: lm.jaw };
      this.disposables.push(geo, mat, tex);
    }

    // ---- eyelids (only where the file has no blink morph)
    if (!nativeBlink && cfg.blink !== false) {
      const { x: ex, y: ey, w, h } = lm.eyes;
      for (const side of [-1, 1]) {
        const cx = ref.x + side * ex;
        const cy = ref.y + ey;
        const rcTargets = raySkin.length ? raySkinRay : skinRay; // same choice as for the raw meshes
        rc.set(new V3(cx, cy, ref.z + 1), new V3(0, 0, -1));
        const hit = rc.intersectObjects(rcTargets, false)[0];
        const eyeZ = hit ? hit.point.z : mouthZ - 0.02;
        // skin colour around the eye (lid area, side, cheek), from the model's own texture
        let cheekMaterial = null;
        const samples = [];
        for (const [dx, dy] of [[0, h + 0.012], [side * (w + 0.008), 0], [0, -0.03], [-side * 0.01, h + 0.016]]) {
          rc.set(new V3(cx + dx, cy + dy, ref.z + 1), new V3(0, 0, -1));
          const sh = rc.intersectObjects(skinRay, false)[0];
          if (sh && !cheekMaterial) cheekMaterial = sh.object.material;
          const c = sampleSkin(sh);
          if (c) samples.push(c);
        }
        const avg = samples.length ? [0, 1, 2].map((k) => samples.reduce((a, c) => a + c[k], 0) / samples.length) : null;
        const col = (cfg.lidColor || avg || [0.8, 0.6, 0.5]).map((c) => clamp(c * 0.95 * (cfg.lidBoost || 1), 0, 1));
        const origin = new V3(cx, cy + h, eyeZ);
        const geo = conformalPatch({ origin, halfW: w, height: 2 * h, nx: 8, ny: 4, rayTargets: rcTargets, fallbackZ: eyeZ, lift: 0.0016 });
        const tex = makeLidTexture(col);
        const mat = lidMaterial(hit?.object?.material || cheekMaterial, tex);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 5;
        mesh.frustumCulled = false;
        mesh.visible = false;
        const pivot = stagePivot(anchor, origin);
        pivot.add(mesh);
        this.lids.push({ pivot, mesh, side, color: col });
        this.disposables.push(geo, mat, tex);
      }
    }

    this.kind = this.skinMeshes.length || this.mouth || this.lids.length ? (nativeMouth ? "native+" : "procedural") : "none";
  }

  _bone(scene, key) {
    let found = null;
    scene.traverse((o) => {
      if (!found && o.isBone && o.name.toLowerCase().replace(/^mixamorig[:_]?/, "").replace(/[^a-z]/g, "") === key) found = o;
    });
    return found;
  }

  /**
   * @param sig  { open, wide, round, smile, brow, blink }  all 0..1
   */
  apply(sig) {
    const s = this.s;
    s.open = clamp(sig.open ?? 0, 0, 1);
    s.wide = clamp(sig.wide ?? 0, 0, 1);
    s.round = clamp(sig.round ?? 0, 0, 1);
    s.smile = clamp(sig.smile ?? 0, 0, 1);
    s.brow = clamp(sig.brow ?? 0, 0, 1);
    s.blink = clamp(sig.blink ?? 0, 0, 1);

    for (const m of this.skinMeshes) {
      const inf = m.morphTargetInfluences;
      inf[0] = s.open;
      inf[1] = s.smile;
      inf[2] = s.wide * (1 - s.smile * 0.5);
      inf[3] = s.round * s.open;
      inf[4] = s.brow;
    }

    if (this.mouth) {
      const { pivot, mesh, half, depth } = this.mouth;
      const vis = s.open > 0.04;
      mesh.visible = vis;
      if (vis) {
        const sx = clamp(0.7 + 0.2 * s.open + 0.22 * s.wide - 0.3 * s.round + 0.12 * s.smile, 0.45, 1.15);
        setPivotScale(pivot, sx, s.open * 1.05, 1);
      }
      void half;
      void depth;
    }

    for (const l of this.lids) {
      const vis = s.blink > 0.04;
      l.mesh.visible = vis;
      if (vis) setPivotScale(l.pivot, 1, s.blink, 1);
    }
  }

  dispose() {
    for (const m of this.skinMeshes) {
      // hand the original geometry back is not needed: the clone is ours alone
      m.morphTargetInfluences = undefined;
    }
    for (const p of [this.mouth?.pivot, ...this.lids.map((l) => l.pivot)]) p?.parent?.remove(p);
    for (const d of this.disposables) d?.dispose?.();
    this.disposables = [];
    this.skinMeshes = [];
    this.mouth = null;
    this.lids = [];
  }
}
