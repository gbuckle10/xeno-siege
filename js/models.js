// Low-poly 3D models for aliens and towers, built from simple shapes (no external model files).
// Every model faces +x and sits on y = 0.
import * as THREE from '../vendor/three.bundle.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// Transform a primitive and return a non-indexed copy (so different shapes can be merged).
function part(geo, o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _m.compose(V(o.x || 0, o.y || 0, o.z || 0), _q, V(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
const merge = parts => THREE.mergeGeometries(parts, false);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);

function legs(n, spread, len, y, zOff, thick = 0.025, tilt = 0.7) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * spread;
    for (const side of [-1, 1]) out.push(part(box(thick, thick, len), { x, y, z: side * zOff, rx: side * tilt }));
  }
  return out;
}

// ---------- Aliens: { body, eyes, height } ----------
export function alienGeometries() {
  const A = {};
  A.skitter = {
    body: merge([
      part(sphere(0.14), { y: 0.11, sx: 1.15, sy: 0.55, sz: 0.85 }),
      part(sphere(0.07), { x: 0.14, y: 0.11 }),
      part(cone(0.03, 0.12, 5), { x: 0.2, y: 0.17, rz: -0.9, z: 0.03 }),
      part(cone(0.03, 0.12, 5), { x: 0.2, y: 0.17, rz: -0.9, z: -0.03 }),
      ...legs(3, 0.08, 0.2, 0.06, 0.12, 0.022),
    ]),
    eyes: merge([part(sphere(0.035, 6, 5), { x: 0.2, y: 0.12 })]),
    height: 0.2,
  };
  A.grunt = {
    body: merge([
      part(sphere(0.21), { y: 0.25, sy: 0.92 }),
      part(sphere(0.12), { x: -0.06, y: 0.17, sx: 1.4, sy: 0.6, sz: 1.3 }),
      ...[-0.1, 0, 0.1].map((z, i) => part(cone(0.055, 0.32, 6), { x: -0.27, y: 0.14 + (i === 1 ? 0.03 : 0), z, rz: Math.PI / 2 + 0.25 })),
    ]),
    eyes: merge([part(sphere(0.055, 8, 6), { x: 0.16, y: 0.3, z: 0.08 }), part(sphere(0.055, 8, 6), { x: 0.16, y: 0.3, z: -0.08 })]),
    height: 0.47,
  };
  A.shell = {
    body: merge([
      part(cyl(0.27, 0.32, 0.17, 6), { y: 0.2, sz: 0.85 }),
      part(cyl(0.18, 0.25, 0.08, 6), { y: 0.32, sz: 0.85 }),
      part(box(0.5, 0.04, 0.05), { y: 0.37 }),
      part(sphere(0.11), { x: 0.3, y: 0.15 }),
      part(cone(0.03, 0.12, 5), { x: 0.42, y: 0.13, rz: -1.4, z: 0.05 }),
      part(cone(0.03, 0.12, 5), { x: 0.42, y: 0.13, rz: -1.4, z: -0.05 }),
      ...legs(3, 0.16, 0.22, 0.08, 0.24, 0.035, 0.8),
    ]),
    eyes: merge([part(sphere(0.03, 6, 5), { x: 0.39, y: 0.19, z: 0.045 }), part(sphere(0.03, 6, 5), { x: 0.39, y: 0.19, z: -0.045 })]),
    height: 0.4,
  };
  A.brood = {
    body: merge([
      part(sphere(0.25), { y: 0.3, sx: 1.1 }),
      part(sphere(0.1), { x: -0.05, y: 0.5, z: 0.1 }),
      part(sphere(0.09), { x: 0.06, y: 0.47, z: -0.13 }),
      part(sphere(0.08), { x: -0.18, y: 0.42, z: -0.06 }),
      part(sphere(0.07), { x: -0.12, y: 0.3, z: 0.22 }),
      part(sphere(0.09), { x: 0.26, y: 0.2 }),
      ...legs(2, 0.2, 0.18, 0.08, 0.2, 0.03),
    ]),
    eyes: merge([
      part(sphere(0.03, 6, 5), { x: 0.34, y: 0.24, z: 0.04 }), part(sphere(0.03, 6, 5), { x: 0.34, y: 0.24, z: -0.04 }),
      part(sphere(0.022, 6, 5), { x: 0.32, y: 0.29, z: 0 }),
    ]),
    height: 0.6,
  };
  A.queen = {
    body: merge([
      part(sphere(0.5, 14, 10), { x: -0.3, y: 0.5, sx: 1.35, sy: 0.75 }),
      part(sphere(0.32, 12, 9), { x: 0.35, y: 0.5 }),
      part(sphere(0.22, 12, 9), { x: 0.68, y: 0.55 }),
      ...[-2, -1, 0, 1, 2].map(i => part(cone(0.07, 0.45, 6), { x: -0.2 + Math.abs(i) * 0.05, y: 0.95, z: i * 0.14, rz: 0.35, rx: i * 0.25 })),
      ...[-1, 0, 1].map(i => part(cone(0.06, 0.4, 6), { x: -0.85, y: 0.45 + i * 0.1, z: i * 0.15, rz: Math.PI / 2 + 0.2 })),
      ...legs(4, 0.22, 0.5, 0.18, 0.4, 0.05, 0.9),
    ]),
    eyes: merge([
      part(sphere(0.055, 8, 6), { x: 0.86, y: 0.6, z: 0.08 }), part(sphere(0.055, 8, 6), { x: 0.86, y: 0.6, z: -0.08 }),
      part(sphere(0.04, 8, 6), { x: 0.8, y: 0.7, z: 0.15 }), part(sphere(0.04, 8, 6), { x: 0.8, y: 0.7, z: -0.15 }),
    ]),
    height: 1.2,
  };
  A.wasp = {
    body: merge([
      part(sphere(0.1), { x: 0.06, sx: 1.3, sy: 0.8 }),
      part(sphere(0.08), { x: -0.12, sx: 1.6, sy: 0.75 }),
      part(cone(0.035, 0.14, 5), { x: -0.3, rz: Math.PI / 2 }),
      part(box(0.18, 0.012, 0.42), { x: 0.02, y: 0.06, rx: 0.25, sz: 1 }),
      part(box(0.14, 0.012, 0.34), { x: -0.08, y: 0.06, rx: -0.25 }),
    ]),
    eyes: merge([part(sphere(0.035, 6, 5), { x: 0.17, y: 0.03, z: 0.05 }), part(sphere(0.035, 6, 5), { x: 0.17, y: 0.03, z: -0.05 })]),
    height: 0.2,
  };
  A.warden = {
    body: merge([
      part(cyl(0.18, 0.24, 0.32, 8), { y: 0.22 }),
      part(sphere(0.15, 10, 8), { y: 0.42, sy: 0.8 }),
      part(cyl(0.02, 0.02, 0.4, 5), { x: -0.05, y: 0.6 }),
      part(sphere(0.05, 8, 6), { x: -0.05, y: 0.82 }),
      part(box(0.08, 0.26, 0.36), { x: 0.2, y: 0.24 }),
      ...legs(2, 0.18, 0.18, 0.06, 0.2, 0.04),
    ]),
    eyes: merge([part(sphere(0.045, 8, 6), { x: 0.13, y: 0.45 }), part(sphere(0.06, 8, 6), { x: -0.05, y: 0.82 })]),
    height: 0.85,
  };
  for (const k in A) { A[k].body.computeVertexNormals(); A[k].eyes.computeVertexNormals(); }
  return A;
}

// ---------- Tower materials ----------
export const MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1a2440, metalness: 0.6, roughness: 0.45 }),
  mid: new THREE.MeshStandardMaterial({ color: 0x34466e, metalness: 0.7, roughness: 0.35 }),
  light: new THREE.MeshStandardMaterial({ color: 0x9aa9c8, metalness: 0.85, roughness: 0.28 }),
  black: new THREE.MeshStandardMaterial({ color: 0x06070c, roughness: 0.7 }),
};
const glowCache = new Map(), accentCache = new Map();
export function glowMat(hex, k = 2.5) {
  const key = hex + ':' + k;
  if (!glowCache.has(key)) glowCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }));
  return glowCache.get(key);
}
function accentMat(hex) {
  if (!accentCache.has(hex)) accentCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.4 }));
  return accentCache.get(hex);
}
function mesh(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.s) m.scale.setScalar(o.s);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- Towers ----------
// Returns { group, head (rotates to aim), muzzle (Object3D at the barrel tip), spin?, float?, flash }.
export function buildTower(type, lvl, branch, color) {
  const group = new THREE.Group();
  const head = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const acc = accentMat(color), glow = glowMat(color, 2.6);
  const mk2 = lvl >= 4;
  const r = { group, head, muzzle, spin: null, float: null, floatY: 0 };

  // Shared base: hex pad, trim ring, level pips
  group.add(mesh(cyl(0.4, 0.45, 0.14, 6), MAT.dark, { y: 0.07 }));
  group.add(mesh(cyl(0.3, 0.36, 0.06, 6), MAT.mid, { y: 0.17 }));
  group.add(mesh(new THREE.TorusGeometry(0.39, 0.014, 4, 6), glowMat(color, 1.4), { y: 0.145, rx: Math.PI / 2, rz: Math.PI / 6 }));
  for (let i = 0; i < lvl; i++) group.add(mesh(box(0.07, 0.035, 0.035), glow, { x: -0.15 + i * 0.1, y: 0.1, z: 0.39 }));
  head.position.y = 0.2;
  group.add(head);

  if (type === 'gatling') {
    if (branch === 'railgun') {
      const L = mk2 ? 1.15 : 0.95;
      head.add(mesh(box(0.34, 0.2, 0.3), MAT.mid, { y: 0.12 }));
      head.add(mesh(box(0.2, 0.08, 0.36), MAT.dark, { y: 0.25, x: -0.05 }));
      for (const z of [-0.075, 0.075]) head.add(mesh(box(L, 0.06, 0.05), MAT.light, { x: 0.1 + L / 2, y: 0.15, z }));
      head.add(mesh(box(L, 0.025, 0.025), glow, { x: 0.1 + L / 2, y: 0.15 }));
      const n = mk2 ? 5 : 3;
      for (let i = 0; i < n; i++) head.add(mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), acc, { x: 0.25 + i * (L - 0.2) / n, y: 0.15, ry: Math.PI / 2 }));
      muzzle.position.set(0.12 + L, 0.15, 0);
    } else {
      const mini = branch === 'minigun';
      const n = mini ? 6 : 3, rad = mini ? 0.075 : 0.05, L = mini ? (mk2 ? 0.62 : 0.55) : 0.42;
      head.add(mesh(box(mini ? 0.42 : 0.34, mini ? 0.26 : 0.2, mini ? 0.38 : 0.3), MAT.mid, { y: 0.14 }));
      head.add(mesh(box(0.16, 0.1, 0.16), acc, { y: 0.3, x: -0.06 }));
      if (mini) head.add(mesh(cyl(0.13, 0.13, 0.12, 12), MAT.dark, { y: 0.14, z: -0.27, rx: Math.PI / 2 }));
      const spin = new THREE.Group(); spin.position.set(0.2, 0.15, 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spin.add(mesh(cyl(0.028, 0.028, L, 6), MAT.light, { x: L / 2, y: Math.cos(a) * rad, z: Math.sin(a) * rad, rz: Math.PI / 2 }));
      }
      spin.add(mesh(cyl(rad + 0.03, rad + 0.03, 0.05, 10), MAT.dark, { x: L * 0.7, rz: Math.PI / 2 }));
      head.add(spin); r.spin = spin;
      if (lvl >= 2) head.add(mesh(box(0.06, 0.16, 0.34), acc, { x: -0.18, y: 0.14 }));
      muzzle.position.set(0.22 + L, 0.15, 0);
    }
  } else if (type === 'mortar') {
    head.add(mesh(cyl(0.27, 0.3, 0.2, 12), MAT.mid, { y: 0.1 }));
    head.add(mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 16), acc, { y: 0.19, rx: Math.PI / 2 }));
    const tilt = -0.65;
    const tube = (x, z, rad, len) => {
      const m = mesh(cyl(rad, rad * 1.15, len, 12), MAT.light, { rz: tilt });
      m.position.set(x + Math.sin(-tilt) * len / 2, 0.22 + Math.cos(tilt) * len / 2, z);
      head.add(m);
      head.add(mesh(new THREE.TorusGeometry(rad, 0.018, 6, 12), glow,
        { x: x + Math.sin(-tilt) * len, y: 0.22 + Math.cos(tilt) * len, z, rz: tilt, rx: Math.PI / 2 }));
      return [x + Math.sin(-tilt) * len, 0.22 + Math.cos(tilt) * len, z];
    };
    let tip;
    if (branch === 'cluster') {
      const k = mk2 ? 0.075 : 0.065;
      for (const [x, z] of [[0, -0.09], [0, 0.09], [-0.12, -0.09], [-0.12, 0.09]]) tip = tube(x, z, k, 0.38);
      tip = [tip[0] + 0.06, tip[1], 0];
    } else {
      tip = tube(0, 0, branch ? 0.13 : 0.1, branch ? 0.44 : 0.38);
    }
    if (branch === 'singularity') {
      const f = new THREE.Group(); f.position.set(-0.05, 0.75, 0);
      f.add(mesh(sphere(mk2 ? 0.14 : 0.11, 14, 10), MAT.black));
      f.add(mesh(new THREE.TorusGeometry(mk2 ? 0.24 : 0.2, 0.02, 6, 24), glowMat('#c792ff', 3), { rx: 1.2 }));
      f.add(mesh(new THREE.TorusGeometry(mk2 ? 0.2 : 0.16, 0.012, 6, 24), glowMat('#ff9f43', 2.5), { rx: -0.9, ry: 0.6 }));
      head.add(f); r.float = f; r.floatY = 0.75;
    }
    if (lvl >= 2 && !branch) head.add(mesh(box(0.1, 0.12, 0.42), MAT.dark, { x: -0.22, y: 0.18 }));
    muzzle.position.set(tip[0], tip[1], tip[2]);
  } else if (type === 'cryo') {
    head.add(mesh(cyl(0.07, 0.11, 0.42, 8), MAT.mid, { y: 0.21 }));
    head.add(mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), acc, { y: 0.3, rx: Math.PI / 2 }));
    const crystal = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x7cc7ff, emissiveIntensity: 1.6, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.92 });
    const f = new THREE.Group(); const fy = 0.72;
    f.position.y = fy;
    const big = branch === 'zero' ? (mk2 ? 0.25 : 0.21) : lvl >= 2 ? 0.17 : 0.15;
    f.add(mesh(new THREE.OctahedronGeometry(big), crystal, { sy: 1.6 }));
    if (branch === 'zero') {
      for (let i = 0; i < (mk2 ? 5 : 3); i++) {
        const a = i / (mk2 ? 5 : 3) * Math.PI * 2;
        f.add(mesh(new THREE.OctahedronGeometry(0.07), crystal, { x: Math.cos(a) * 0.36, z: Math.sin(a) * 0.36, sy: 1.6 }));
      }
    }
    if (branch === 'shatter') {
      for (let i = 0; i < (mk2 ? 7 : 5); i++) {
        const a = i / (mk2 ? 7 : 5) * Math.PI * 2;
        head.add(mesh(cone(0.05, 0.36, 5), crystal, { x: Math.cos(a) * 0.17, y: 0.48, z: Math.sin(a) * 0.17, rz: -Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6 }));
      }
    }
    head.add(f); r.float = f; r.floatY = fy;
    muzzle.position.set(0, fy, 0);
  } else if (type === 'arc') {
    if (branch === 'lance') {
      head.add(mesh(cyl(0.12, 0.18, 0.3, 10), MAT.mid, { y: 0.15 }));
      head.add(mesh(cone(mk2 ? 0.26 : 0.22, 0.16, 16), MAT.light, { x: 0.12, y: 0.42, rz: Math.PI / 2 }));
      head.add(mesh(cyl(0.025, 0.025, 0.42, 6), glow, { x: 0.25, y: 0.42, rz: Math.PI / 2 }));
      head.add(mesh(new THREE.TorusGeometry(mk2 ? 0.2 : 0.17, 0.02, 6, 20), glow, { x: 0.2, y: 0.42, ry: Math.PI / 2 }));
      head.add(mesh(sphere(0.06), glowMat('#ffffff', 3), { x: 0.46, y: 0.42 }));
      muzzle.position.set(0.47, 0.42, 0);
    } else {
      const storm = branch === 'storm';
      const h = storm ? (mk2 ? 1.2 : 1.05) : lvl >= 2 ? 0.85 : 0.75;
      head.add(mesh(cyl(0.12, 0.18, 0.22, 10), MAT.mid, { y: 0.11 }));
      head.add(mesh(cyl(0.05, 0.1, h - 0.2, 8), MAT.light, { y: 0.2 + (h - 0.2) / 2 - 0.05 }));
      const rings = storm ? (mk2 ? 6 : 5) : lvl >= 2 ? 4 : 3;
      for (let i = 0; i < rings; i++) {
        const y = 0.28 + i * (h - 0.4) / rings;
        head.add(mesh(new THREE.TorusGeometry(0.17 - i * 0.015, 0.024, 6, 16), glow, { y, rx: Math.PI / 2 }));
      }
      const top = storm ? 0.14 : 0.1;
      head.add(mesh(sphere(top, 14, 10), glowMat('#e9d6ff', 3), { y: h }));
      if (storm) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        head.add(mesh(cyl(0.015, 0.015, 0.3, 4), MAT.light, { x: Math.cos(a) * 0.18, y: h - 0.05, z: Math.sin(a) * 0.18, rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 }));
      }
      muzzle.position.set(0, h, 0);
    }
  } else if (type === 'missile') {
    const tiltG = new THREE.Group(); tiltG.position.y = 0.2; tiltG.rotation.z = 0.32;
    head.add(mesh(cyl(0.16, 0.2, 0.18, 10), MAT.mid, { y: 0.09 }));
    head.add(tiltG);
    if (branch === 'nuke') {
      tiltG.add(mesh(box(0.8, 0.06, 0.24), MAT.dark, { x: 0.05 }));
      const L = mk2 ? 0.7 : 0.6;
      tiltG.add(mesh(cyl(0.09, 0.09, L, 12), MAT.light, { x: 0.02, y: 0.13, rz: Math.PI / 2 }));
      tiltG.add(mesh(cone(0.09, 0.22, 12), glowMat('#ffd166', 1.6), { x: 0.02 + L / 2 + 0.11, y: 0.13, rz: -Math.PI / 2 }));
      tiltG.add(mesh(cyl(0.095, 0.095, 0.06, 12), glowMat('#ffd166', 2.4), { x: 0.1, y: 0.13, rz: Math.PI / 2 }));
      for (const [y, z] of [[0.24, 0], [0.13, 0.11], [0.13, -0.11]]) tiltG.add(mesh(box(0.14, 0.02, 0.02), MAT.mid, { x: -0.24, y, z }));
      muzzle.position.set(0.45, 0.42, 0);
    } else {
      const hydra = branch === 'hydra';
      const n = hydra ? 3 : 2, w = hydra ? (mk2 ? 0.56 : 0.5) : lvl >= 2 ? 0.4 : 0.36;
      tiltG.add(mesh(box(0.42, w * 0.72, w), MAT.mid, { y: w * 0.36 }));
      for (const z of [-w / 2, w / 2]) tiltG.add(mesh(box(0.44, 0.05, 0.035), acc, { y: w * 0.6, z }));
      tiltG.add(mesh(box(0.3, 0.03, w * 0.8), MAT.dark, { y: w * 0.73, x: -0.04 }));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const y = w * 0.36 + (i - (n - 1) / 2) * (w * 0.72 / n), z = (j - (n - 1) / 2) * (w / n);
        tiltG.add(mesh(cyl(0.045, 0.045, 0.04, 8), MAT.black, { x: 0.215, y, z, rz: Math.PI / 2 }));
        tiltG.add(mesh(cyl(0.022, 0.022, 0.045, 6), glowMat('#ff5c7a', 2), { x: 0.216, y, z, rz: Math.PI / 2 }));
      }
      muzzle.position.set(0.3, 0.45, 0);
    }
  }
  if (type === 'sunlance') {
    const prism = branch === 'prism', scorch = branch === 'scorch';
    head.add(mesh(cyl(0.2, 0.26, 0.24, 10), MAT.mid, { y: 0.12 }));
    const yoke = new THREE.Group(); yoke.position.y = 0.36; head.add(yoke);
    for (const z of [-0.17, 0.17]) yoke.add(mesh(box(0.16, 0.22, 0.05), MAT.dark, { z }));
    const L = mk2 ? 0.95 : lvl >= 3 ? 0.85 : 0.75;
    yoke.add(mesh(cyl(0.1, 0.13, L, 14), MAT.light, { x: L / 2 - 0.12, rz: Math.PI / 2 }));
    const rings = lvl >= 3 ? 4 : lvl >= 2 ? 3 : 2;
    for (let i = 0; i < rings; i++) yoke.add(mesh(new THREE.TorusGeometry(0.135, 0.022, 6, 16), glowMat(scorch ? '#ff7a3d' : '#ffe066', 2.2), { x: 0.05 + i * (L - 0.25) / rings, ry: Math.PI / 2 }));
    // Rear capacitor: glows brighter as the beam charges
    yoke.add(mesh(sphere(0.15, 14, 10), MAT.dark, { x: -0.2 }));
    const core = mesh(sphere(0.11, 12, 9), glowMat(scorch ? '#ff9a5c' : '#fff3b0', 3.2), { x: -0.2 });
    core.castShadow = false; yoke.add(core); r.core = core;
    const tipX = L - 0.1;
    if (prism) {
      const p = mesh(new THREE.OctahedronGeometry(mk2 ? 0.13 : 0.11), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe066, emissiveIntensity: 1.4, roughness: 0.1, transparent: true, opacity: 0.9 }), { x: tipX + 0.08, sx: 1.4 });
      yoke.add(p); r.float = null;
      for (const z of (mk2 ? [-0.14, -0.07, 0.07, 0.14] : [-0.1, 0.1])) yoke.add(mesh(cyl(0.02, 0.02, 0.2, 6), MAT.light, { x: tipX - 0.02, z, rz: Math.PI / 2 }));
    } else {
      yoke.add(mesh(cyl(0.09, 0.09, 0.03, 16), glowMat(scorch ? '#ff5c2a' : '#fff3b0', 3), { x: tipX + 0.02, rz: Math.PI / 2 }));
    }
    if (scorch) for (let i = 0; i < (mk2 ? 4 : 3); i++) for (const z of [-1, 1])
      yoke.add(mesh(box(0.05, 0.16, 0.08), glowMat('#ff7a3d', 1.4), { x: 0.05 + i * 0.13, z: z * 0.19 }));
    muzzle.position.set(tipX + 0.1, 0.36, 0);
  }
  head.add(muzzle);
  // Muzzle flash sprite (shown for a moment after firing)
  const flash = mesh(sphere(0.07, 8, 6), glowMat(color, 4));
  flash.castShadow = false; flash.visible = false;
  muzzle.add(flash); r.flash = flash;
  // Upgrade-in-progress ring
  const ring = mesh(new THREE.TorusGeometry(0.46, 0.02, 6, 32), glowMat('#ffffff', 2.2), { rx: Math.PI / 2 });
  ring.castShadow = false; ring.visible = false;
  group.add(ring); r.busyRing = ring;
  const k = mk2 ? 1.12 : lvl >= 3 ? 1.06 : 1;
  head.scale.setScalar(k);
  return r;
}
