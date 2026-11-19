// 3D renderer for Xeno Siege (Three.js). Reads the Game state each frame and turns events into effects.
import * as THREE from '../vendor/three.bundle.js';
import { TOWERS, ALIENS, POWERS } from './game.js';
import { alienGeometries, buildTower, glowMat } from './models.js';

const TYPES = Object.keys(ALIENS);
const MAXN = { skitter: 3500, grunt: 900, shell: 400, brood: 300, queen: 16, wasp: 800, warden: 200 };
const EYE = { skitter: '#f4ff6a', grunt: '#ff3355', shell: '#ffe1f5', brood: '#ff9f43', queen: '#ff2244', wasp: '#fff27a', warden: '#7cc7ff' };
const FLY_Y = 1.0;
const PAD_Y = 0.14; // towers stand on raised pads; the lane is a trench at y = 0

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- Pooled effect systems ----------
class Beams {          // glowing cylinders between two points: tracers, rails, lightning, lances
  constructor(scene, max) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0)); this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh); this.max = max; this.list = [];
  }
  add(a, b, color, thick, life, k = 2.5) {
    if (this.list.length >= this.max) return;
    this.list.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, col: new THREE.Color(color).multiplyScalar(k), thick, life, max: life });
  }
  update(dt) {
    let n = 0;
    for (const b of this.list) {
      b.life -= dt; if (b.life <= 0) continue;
      this.list[n] = b;
      _v.set(b.bx - b.ax, b.by - b.ay, b.bz - b.az);
      const len = _v.length(); if (len < 1e-4) continue;
      _q.setFromUnitVectors(UP, _v.divideScalar(len));
      _s.set(b.thick, len, b.thick);
      _v2.set((b.ax + b.bx) / 2, (b.ay + b.by) / 2, (b.az + b.bz) / 2);
      _m.compose(_v2, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.copy(b.col).multiplyScalar(b.life / b.max));
      n++;
    }
    this.list.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

class Particles {      // additive glowing points with velocity, drag and gravity
  constructor(scene, max, size, tex, gravity = 0, drag = 0.9) {
    this.max = max; this.n = 0; this.gravity = gravity; this.drag = drag;
    this.p = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('color', this.colAttr);
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  get free() { return this.max - this.n; }
  spawn(x, y, z, vx, vy, vz, life, color, k = 2) {
    if (this.n >= this.max) return;
    const i = this.n++, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    _c.set(color);
    this.base[j] = _c.r * k; this.base[j + 1] = _c.g * k; this.base[j + 2] = _c.b * k;
    this.life[i] = this.maxLife[i] = life;
  }
  burst(x, y, z, n, color, speed, life, up = 0.5, k = 2) {
    n = Math.min(n, this.free);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * 1.2, s = speed * (0.3 + Math.random() * 0.9);
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s * up + s * 0.2 * up, Math.sin(a) * Math.cos(e) * s, life * (0.5 + Math.random() * 0.7), color, k);
    }
  }
  update(dt) {
    const d = Math.pow(this.drag, dt * 60);
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] - dt; if (life <= 0) continue;
      const j = i * 3, o = n * 3;
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.gravity * dt; this.vel[j + 2] *= d;
      let y = this.p[j + 1] + this.vel[j + 1] * dt;
      if (y < 0.02) { y = 0.02; this.vel[j + 1] *= -0.3; }
      this.p[o] = this.p[j] + this.vel[j] * dt; this.p[o + 1] = y; this.p[o + 2] = this.p[j + 2] + this.vel[j + 2] * dt;
      this.vel[o] = this.vel[j]; this.vel[o + 1] = this.vel[j + 1]; this.vel[o + 2] = this.vel[j + 2];
      this.base[o] = this.base[j]; this.base[o + 1] = this.base[j + 1]; this.base[o + 2] = this.base[j + 2];
      this.life[n] = life; this.maxLife[n] = this.maxLife[i];
      const f = life / this.maxLife[n];
      this.col[o] = this.base[o] * f; this.col[o + 1] = this.base[o + 1] * f; this.col[o + 2] = this.base[o + 2] * f;
      n++;
    }
    this.n = n;
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
  }
}

class Rings {          // flat expanding shockwave rings
  constructor(scene, max) {
    const geo = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0)); this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh); this.max = max; this.list = [];
  }
  add(x, y, z, r0, r1, life, color, k = 2) {
    if (this.list.length < this.max) this.list.push({ x, y, z, r0, r1, life, max: life, col: new THREE.Color(color).multiplyScalar(k) });
  }
  update(dt) {
    let n = 0;
    for (const r of this.list) {
      r.life -= dt; if (r.life <= 0) continue;
      this.list[n] = r;
      const f = 1 - r.life / r.max, e = 1 - (1 - f) * (1 - f), rad = r.r0 + (r.r1 - r.r0) * e;
      _m.makeScale(rad, 1, rad).setPosition(r.x, r.y, r.z);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.copy(r.col).multiplyScalar(1 - f));
      n++;
    }
    this.list.length = n; this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- View ----------
export class View {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050b);
    this.scene.fog = new THREE.Fog(0x03050b, 28, 62);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.cam = { x: 12, z: 7.5, dist: 22, pitch: 0.98, fit: 22, userZoomed: false };
    this.shake = 0;
    this.time = 0;
    this.tex = softDot();

    this.buildLights();
    this.buildAliens();
    this.buildHelpers();
    this.beams = new Beams(this.scene, 5000);
    this.sparks = new Particles(this.scene, 9000, 0.11, this.tex, 6, 0.93);
    this.glows = new Particles(this.scene, 1500, 0.9, this.tex, -0.4, 0.9);
    this.rings = new Rings(this.scene, 300);
    this.preview = new Beams(this.scene, 200);   // aim lines / editor lanes, rebuilt every frame
    const burnMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.burnMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), burnMat, 60);
    this.burnMesh.setColorAt(0, _c.set(0)); this.burnMesh.frustumCulled = false; this.burnMesh.count = 0;
    this.scene.add(this.burnMesh);
    this.buildProjectiles();
    this.towerObjs = new Map();
    this.wellObjs = [];

    this.composer = new THREE.EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
    this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.4, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new THREE.OutputPass());

    this.quality = 'high';
    this.loadMap(game.map);
    this.setQuality('high');
  }

  setQuality(q) {
    this.quality = q;
    const high = q === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    this.renderer.shadowMap.enabled = high;
    this.renderer.toneMappingExposure = high ? 1.05 : 1.55;
    this.sun.castShadow = high;
    this.shadowsOn = high;
    this.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
    this.resize();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x0b0b18, 0.75));
    const sun = new THREE.DirectionalLight(0xd6e4ff, 1.7);
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.rim = new THREE.DirectionalLight(0x9a6bff, 0.5);
    this.scene.add(this.rim);
  }

  // Build (or rebuild) everything that depends on the map, and clear leftover effects.
  loadMap(map, opts = {}) {
    const keepCam = opts.keepCamera && this.map && this.map.cols === map.cols && this.map.rows === map.rows;
    if (this.world) {
      this.scene.remove(this.world);
      this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
    }
    for (const [, o] of this.towerObjs) this.scene.remove(o.obj.group);
    this.towerObjs.clear();
    this.beams.list.length = 0; this.sparks.n = 0; this.glows.n = 0; this.rings.list.length = 0; this.burnMesh.count = 0;
    for (const w of this.wellObjs) w.visible = false;
    this.shake = 0;

    this.map = map;
    const W = this.world = new THREE.Group();
    this.scene.add(W);
    const COLS = map.cols, ROWS = map.rows, pathTiles = map.pathTiles;

    // Lighting follows the map
    this.sun.position.set(COLS / 2 - 7, 20, ROWS / 2 + 9);
    this.sun.target.position.set(COLS / 2, 0, ROWS / 2);
    const hx = COLS / 2 + 5, hz = ROWS / 2 + 5;
    Object.assign(this.sun.shadow.camera, { left: -hx, right: hx, top: hz, bottom: -hz, near: 2, far: 50 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.rim.position.set(COLS + 6, 6, -6);

    // Far ground
    const far = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(COLS / 2, -0.02, ROWS / 2); far.receiveShadow = true;
    W.add(far);

    // Map floor with painted lanes
    const px = 64, cv = document.createElement('canvas'); cv.width = COLS * px; cv.height = ROWS * px;
    const g = cv.getContext('2d');
    g.fillStyle = '#060a14'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(77,243,201,0.55)'; g.lineWidth = 4; g.setLineDash([12, 20]); g.lineCap = 'round';
    for (const path of map.paths) {
      g.beginPath(); path.way.forEach((p, i) => i ? g.lineTo(p.x * px, p.z * px) : g.moveTo(p.x * px, p.z * px)); g.stroke();
    }
    g.setLineDash([]);
    for (const k of pathTiles) {
      const [c, r] = k.split(',').map(Number);
      g.strokeStyle = 'rgba(70,110,180,0.10)'; g.lineWidth = 2; g.strokeRect(c * px + 2, r * px + 2, px - 4, px - 4);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.8, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(COLS / 2, 0, ROWS / 2); floor.receiveShadow = true;
    W.add(floor);

    // Raised build pads on every non-lane tile
    const pads = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (!pathTiles.has(c + ',' + r)) pads.push([c, r]);
    const padMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, PAD_Y, 0.94), new THREE.MeshStandardMaterial({ color: 0x111b30, metalness: 0.55, roughness: 0.5 }), pads.length);
    pads.forEach(([c, r], i) => { _m.makeTranslation(c + 0.5, PAD_Y / 2, r + 0.5); padMesh.setMatrixAt(i, _m); });
    padMesh.receiveShadow = true; padMesh.castShadow = true;
    W.add(padMesh);
    const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05).rotateX(-Math.PI / 2), glowMat('#5a86d6', 0.9), pads.length);
    pads.forEach(([c, r], i) => { _m.makeTranslation(c + 0.5, PAD_Y + 0.002, r + 0.5); dots.setMatrixAt(i, _m); });
    W.add(dots);

    // Glowing curbs along both sides of every lane (open where a lane enters from a rift)
    const strips = [];
    for (const k of pathTiles) {
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (pathTiles.has(nc + ',' + nr) || map.entrances.has(nc + ',' + nr)) continue;
        const geo = dc ? new THREE.BoxGeometry(0.04, 0.03, 1) : new THREE.BoxGeometry(1, 0.03, 0.04);
        geo.translate(c + 0.5 + dc * 0.5, PAD_Y + 0.005, r + 0.5 + dr * 0.5);
        strips.push(geo);
      }
    }
    if (strips.length) W.add(new THREE.Mesh(THREE.mergeGeometries(strips), glowMat('#4df3c9', 0.85)));

    // Scenery outside the map
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x1a1f33, roughness: 0.9, metalness: 0.1, flatShading: true }), 140);
    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7a4dff, emissive: 0x6a3df0, emissiveIntensity: 1.3, roughness: 0.2, flatShading: true }), 70);
    let seed = 3 + map.id.length * 17; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nearEntrance = (x, z) => map.paths.some(p => Math.hypot(p.way[0].x - x, p.way[0].z - z) < 2.2);
    const outside = () => { for (;;) { const x = -10 + rnd() * (COLS + 20), z = -8 + rnd() * (ROWS + 16); if ((x < -0.6 || x > COLS + 0.6 || z < -0.6 || z > ROWS + 0.6) && !nearEntrance(x, z)) return [x, z]; } };
    for (let i = 0; i < 140; i++) {
      const [x, z] = outside(), s = 0.15 + rnd() * 0.6;
      _m.compose(_v.set(x, s * 0.4, z), _q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)), _s.set(s, s * (0.6 + rnd() * 0.6), s));
      rocks.setMatrixAt(i, _m);
    }
    for (let i = 0; i < 70; i++) {
      const [x, z] = outside(), s = 0.08 + rnd() * 0.22;
      _m.compose(_v.set(x, s * 1.2, z), _q.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 3, rnd() * 0.5)), _s.set(s, s * (2 + rnd() * 2), s));
      crystals.setMatrixAt(i, _m);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    W.add(rocks, crystals);

    // A rift portal where each lane starts
    this.portals = [];
    for (const path of map.paths) {
      const a = path.way[0], b = path.way[1] || { x: Math.min(Math.max(a.x, 0.5), COLS - 0.5), z: Math.min(Math.max(a.z, 0.5), ROWS - 0.5) };
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const portal = new THREE.Group();
      const px0 = a.x + dx * 0.35, pz0 = a.z + dz * 0.35;
      portal.position.set(px0, 0.62, pz0);
      portal.rotation.y = Math.atan2(dx, dz);
      portal.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), glowMat('#9cff57', 2.2)));
      const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 6, 32, Math.PI * 1.4), glowMat('#d8ff8a', 2));
      portal.add(swirl);
      portal.add(new THREE.Mesh(new THREE.CircleGeometry(0.58, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a5a10'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })));
      W.add(portal);
      this.portals.push({ swirl, x: px0, z: pz0, dx, dz });
    }

    // Player base
    this.shield = null; this.baseCore = null;
    if (map.base) {
    const base = new THREE.Group(); base.position.set(map.base.x, 0, map.base.z);
    const bm = new THREE.MeshStandardMaterial({ color: 0x23365c, metalness: 0.75, roughness: 0.3 });
    const mk = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; base.add(m); return m; };
    mk(new THREE.CylinderGeometry(0.62, 0.72, 0.2, 6), bm, 0.1);
    mk(new THREE.CylinderGeometry(0.34, 0.48, 0.5, 6), bm, 0.45);
    mk(new THREE.CylinderGeometry(0.06, 0.12, 0.7, 6), bm, 0.95);
    this.baseCore = mk(new THREE.SphereGeometry(0.16, 16, 12), glowMat('#4df3c9', 3), 0.75);
    mk(new THREE.TorusGeometry(0.66, 0.025, 6, 6), glowMat('#4df3c9', 1.8), 0.21).rotation.x = Math.PI / 2;
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4df3c9, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    base.add(this.shield);
    W.add(base);
    }

    if (this.shadowsOn !== undefined) this.setQuality(this.quality);
    this.cam.fit = this.fitDistance();
    if (!keepCam) this.resetCamera();
  }

  buildAliens() {
    const geos = alienGeometries();
    this.alienH = {};
    this.aliens = {};
    for (const type of TYPES) {
      const col = new THREE.Color(ALIENS[type].color);
      const bodyMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.28, roughness: 0.55, metalness: 0.15 });
      const body = new THREE.InstancedMesh(geos[type].body, bodyMat, MAXN[type]);
      const eyes = new THREE.InstancedMesh(geos[type].eyes, glowMat(EYE[type], 3), MAXN[type]);
      for (const m of [body, eyes]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; this.scene.add(m); }
      body.setColorAt(0, _c.set(1, 1, 1)); body.instanceColor.setUsage(THREE.DynamicDrawUsage);
      body.castShadow = true;
      this.aliens[type] = { body, eyes };
      this.alienH[type] = geos[type].height;
    }
    // Health bars (billboards)
    const bar = new THREE.PlaneGeometry(1, 1);
    this.barBg = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }), 1500);
    this.barFg = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthWrite: false }), 1500);
    this.barFg.setColorAt(0, _c.set(1, 1, 1));
    for (const m of [this.barBg, this.barFg]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 5; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    // Warden shield bubbles + flyer shadows
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7cc7ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 200);
    this.shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }), 800);
    for (const m of [this.bubbles, this.shadows]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
  }

  buildProjectiles() {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.proj = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, 1500);
    this.proj.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.proj.setColorAt(0, _c.set(1, 1, 1)); this.proj.frustumCulled = false; this.proj.count = 0;
    this.scene.add(this.proj);
    this.PROJ = {
      shell: { s: 0.1, col: new THREE.Color('#ffb36b').multiplyScalar(3), trail: '#ff9f43' },
      bomblet: { s: 0.06, col: new THREE.Color('#ffc58a').multiplyScalar(3), trail: '#ff9f43' },
      void: { s: 0.13, col: new THREE.Color('#d9a8ff').multiplyScalar(3), trail: '#c792ff' },
      missile: { s: 0.055, col: new THREE.Color('#ffffff').multiplyScalar(3), trail: '#ff6a4d' },
      nuke: { s: 0.16, col: new THREE.Color('#ffe59a').multiplyScalar(3), trail: '#ffd166' },
      meteor: { s: 0.17, col: new THREE.Color('#ffb070').multiplyScalar(3), trail: '#ff6a2a' },
    };
  }

  buildHelpers() {
    const mkRing = () => {
      const g = new THREE.Group();
      const edge = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4df3c9, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4df3c9, transparent: true, opacity: 0.07, depthWrite: false }));
      g.add(edge, fill); g.visible = false; g.position.y = PAD_Y + 0.02; g.renderOrder = 3;
      g.setColor = hex => { edge.material.color.set(hex); fill.material.color.set(hex); };
      this.scene.add(g); return g;
    };
    this.rangeRing = mkRing();
    this.nextRings = [mkRing(), mkRing()];   // upgrade range previews
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 6).rotateX(-Math.PI / 2), glowMat('#4df3c9', 2));
    this.selRing.visible = false; this.scene.add(this.selRing);
    const sq = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2));
    this.hoverTile = new THREE.LineSegments(sq, new THREE.LineBasicMaterial({ color: 0x4df3c9, transparent: true, opacity: 0.8 }));
    this.hoverTile.visible = false; this.scene.add(this.hoverTile);
    this.ghosts = {};
  }

  ghost(type) {
    if (!this.ghosts[type]) {
      const o = buildTower(type, 1, null, TOWERS[type].color);
      const mat = new THREE.MeshBasicMaterial({ color: TOWERS[type].color, transparent: true, opacity: 0.45, depthWrite: false });
      o.group.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = false; } });
      o.flash.visible = false;
      o.group.visible = false; o.mat = mat;
      this.scene.add(o.group);
      this.ghosts[type] = o;
    }
    return this.ghosts[type];
  }

  // ----- camera -----
  // Keep the map clear of UI covering part of the canvas (the home screen menu). Pixels from the left / bottom.
  setInset(left = 0, bottom = 0) {
    if (left === (this.inset?.left || 0) && bottom === (this.inset?.bottom || 0)) return;
    this.inset = { left, bottom };
    this.resize();
  }
  fitDistance() {
    const { cols: COLS, rows: ROWS } = this.map;
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 500, ins = this.inset || { left: 0, bottom: 0 };
    const xMin = -1 + 2 * ins.left / w + 0.03, yMin = -1 + 2 * ins.bottom / h + 0.03;
    const corners = [[0, 0], [COLS, 0], [0, ROWS], [COLS, ROWS]];
    let lo = 4, hi = 150;
    const save = { ...this.cam };
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      this.cam.dist = mid; this.cam.x = COLS / 2; this.cam.z = ROWS / 2 + 0.3; this.applyCamera(true);
      const ok = corners.every(([x, z]) => { _v.set(x, 0, z).project(this.camera); return _v.x > xMin && _v.x < 0.97 && _v.y > yMin && _v.y < 0.95; });
      if (ok) hi = mid; else lo = mid;
    }
    Object.assign(this.cam, save);
    return hi;
  }
  applyCamera(noShake) {
    const c = this.cam;
    const sx = noShake ? 0 : (Math.random() - 0.5) * this.shake * 0.5, sz = noShake ? 0 : (Math.random() - 0.5) * this.shake * 0.5;
    this.camera.position.set(c.x + sx, Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.pitch) * c.dist + sz);
    this.camera.lookAt(c.x + sx, 0, c.z + sz);
    this.camera.updateMatrixWorld();
    this.scene.fog.near = c.dist * 1.15; this.scene.fog.far = c.dist * 2.7 + 6;
    const ins = this.inset;
    if (ins && (ins.left || ins.bottom)) {
      const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 500;
      if (!this.camera.view || this.camera.view.offsetX !== -ins.left / 2 || this.camera.view.offsetY !== ins.bottom / 2 || this.camera.view.fullWidth !== w)
        this.camera.setViewOffset(w, h, -ins.left / 2, ins.bottom / 2, w, h);
    } else if (this.camera.view && this.camera.view.enabled) this.camera.clearViewOffset();
  }
  clampCam() {
    const c = this.cam;
    c.dist = Math.min(Math.max(c.dist, 5), c.fit * 1.25);
    c.x = Math.min(Math.max(c.x, 0), this.map.cols); c.z = Math.min(Math.max(c.z, 0), this.map.rows);
  }
  zoomAt(factor, clientX, clientY) {
    const before = this.groundAt(clientX, clientY);
    const old = this.cam.dist;
    this.cam.dist *= factor; this.clampCam();
    this.cam.userZoomed = true;
    if (before) { const k = 1 - this.cam.dist / old; this.cam.x += (before.x - this.cam.x) * k; this.cam.z += (before.z - this.cam.z) * k; }
    this.clampCam();
  }
  panPixels(dx, dy) {
    const h = this.canvas.clientHeight || 1;
    const k = 2 * this.cam.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / h;
    this.cam.x -= dx * k; this.cam.z -= dy * k / Math.sin(this.cam.pitch);
    this.cam.userZoomed = true;
    this.clampCam();
  }
  resetCamera() { this.cam.userZoomed = false; this.cam.dist = this.cam.fit; this.cam.x = this.map.cols / 2; this.cam.z = this.map.rows / 2 + 0.3; }

  groundAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    _v.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    this.applyCamera(true);
    _v.unproject(this.camera);
    _v.sub(this.camera.position).normalize();
    const t = (PAD_Y - this.camera.position.y) / _v.y;
    if (t <= 0) return null;
    return { x: this.camera.position.x + _v.x * t, z: this.camera.position.z + _v.z * t };
  }
  tileAt(clientX, clientY) {
    const p = this.groundAt(clientX, clientY);
    return p ? { c: Math.floor(p.x), r: Math.floor(p.z), x: p.x, z: p.z } : null;
  }
  toScreen(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    return { x: (_v.x + 1) / 2 * this.canvas.clientWidth, y: (1 - _v.y) / 2 * this.canvas.clientHeight, visible: _v.z < 1 };
  }

  resize() {
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.cam.fit = this.fitDistance();
    if (!this.cam.userZoomed) this.resetCamera();
    this.clampCam();
  }

  // ----- per-frame sync -----
  muzzle(tid, out) {
    const o = this.towerObjs.get(tid);
    if (!o) return out.set(0, 0.5, 0);
    return o.obj.muzzle.getWorldPosition(out);
  }

  syncTowers(dt) {
    const g = this.game, seen = new Set();
    for (const t of g.towers) {
      seen.add(t.id);
      let o = this.towerObjs.get(t.id);
      const key = t.lvl + '|' + t.branch;
      if (!o || o.key !== key) {
        const prevYaw = o ? o.yaw : t.yaw;
        if (o) this.scene.remove(o.obj.group);
        const obj = buildTower(t.type, t.lvl, t.branch, TOWERS[t.type].color);
        obj.group.position.set(t.x, PAD_Y, t.z);
        this.scene.add(obj.group);
        o = { key, obj, yaw: prevYaw };
        this.towerObjs.set(t.id, o);
      }
      let d = t.yaw - o.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      o.yaw += d * Math.min(1, dt * 14);
      o.obj.head.rotation.y = -o.yaw;
      const sinceFire = g.time - t.fireT;
      if (o.obj.spin) o.obj.spin.rotation.x += dt * (sinceFire < 0.3 ? 40 : 3);
      if (o.obj.float) { o.obj.float.rotation.y += dt * 1.2; o.obj.float.position.y = o.obj.floatY + Math.sin(this.time * 2 + t.id) * 0.04; }
      o.obj.flash.visible = t.s.kind !== 'cryo' && t.s.kind !== 'mortar' && t.s.kind !== 'beam' && sinceFire < 0.045;
      if (o.obj.core) {
        const charge = t.busy > 0 ? 0 : 1 - Math.max(0, t.cd) / t.s.rate;
        const ready = charge >= 1;
        o.obj.core.scale.setScalar(ready ? 1.1 + Math.sin(this.time * 6) * 0.15 : 0.3 + charge * 0.6);
        if (ready && Math.random() < 0.15) { this.muzzle(t.id, _v2); this.sparks.spawn(_v2.x, _v2.y, _v2.z, (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, 0.4, '#ffe066', 2); }
      }
      if (this.game.overdriveT > 0 && Math.random() < 0.08) this.sparks.spawn(t.x + (Math.random() - 0.5) * 0.6, 0.3, t.z + (Math.random() - 0.5) * 0.6, 0, 1.6, 0, 0.5, '#c792ff', 2);
      if (t.busy > 0) {
        const p = 1 - t.busy / t.busyMax;
        o.obj.busyRing.visible = true;
        o.obj.busyRing.position.y = 0.1 + p * 0.9;
        o.obj.busyRing.scale.setScalar(1 - p * 0.35);
      } else o.obj.busyRing.visible = false;
    }
    for (const [id, o] of this.towerObjs) if (!seen.has(id)) { this.scene.remove(o.obj.group); this.towerObjs.delete(id); }
  }

  syncAliens() {
    const g = this.game, counts = {};
    for (const t of TYPES) counts[t] = 0;
    let bars = 0, nbub = 0, nsh = 0;
    const camQ = this.camera.quaternion;
    for (const e of g.enemies) {
      const A = this.aliens[e.type], i = counts[e.type];
      if (i >= MAXN[e.type]) continue;
      counts[e.type]++;
      const bob = e.freezeT > 0 ? 0 : e.air ? FLY_Y + Math.sin(e.anim * 0.7) * 0.08 : Math.abs(Math.sin(e.anim)) * (e.type === 'queen' ? 0.03 : 0.04);
      const sq = e.freezeT > 0 ? 1 : e.air ? 1 : 1 + Math.sin(e.anim * 2) * 0.06;
      _q.setFromAxisAngle(UP, Math.atan2(-e.dz, e.dx));
      _m.compose(_v.set(e.x, e.air && e.freezeT > 0 ? FLY_Y : bob, e.z), _q, _s.set(1, sq, e.air ? 0.75 + Math.abs(Math.sin(e.anim * 5)) * 0.35 : 1));
      if (e.air && nsh < 800) { _m.makeScale(0.16, 1, 0.16).setPosition(e.x, 0.02, e.z); this.shadows.setMatrixAt(nsh++, _m); }
      if (ALIENS[e.type].aura && nbub < 200) { const r = ALIENS[e.type].aura; _m.makeScale(r, r * 0.55, r).setPosition(e.x, 0, e.z); this.bubbles.setMatrixAt(nbub++, _m); }
      A.body.setMatrixAt(i, _m); A.eyes.setMatrixAt(i, _m);
      if (e.hit > 0) _c.setRGB(5, 5, 5);
      else if (e.freezeT > 0) _c.setRGB(0.6, 1.4, 3);
      else if (e.slowT > 0) _c.setRGB(0.55, 0.85, 1.7);
      else _c.setRGB(1, 1, 1);
      A.body.setColorAt(i, _c);
      if (e.type !== 'skitter' && e.hp < e.max && bars < 1500) {
        const w = Math.max(0.32, ALIENS[e.type].r * 1.8), f = Math.max(0, e.hp / e.max), y = this.alienH[e.type] + 0.18 + (e.air ? FLY_Y : 0);
        _m.compose(_v.set(e.x, y, e.z), camQ, _s.set(w + 0.03, 0.065, 1));
        this.barBg.setMatrixAt(bars, _m);
        _m.compose(_v.set(e.x - (1 - f) * w / 2, y, e.z + 0.001), camQ, _s.set(w * f, 0.04, 1));
        this.barFg.setMatrixAt(bars, _m);
        this.barFg.setColorAt(bars, _c.set(f > 0.5 ? 0x4df3c9 : f > 0.25 ? 0xffd166 : 0xff5c7a));
        bars++;
      }
    }
    for (const t of TYPES) {
      const A = this.aliens[t];
      A.body.count = A.eyes.count = counts[t];
      A.body.instanceMatrix.needsUpdate = A.eyes.instanceMatrix.needsUpdate = true;
      A.body.instanceColor.needsUpdate = true;
    }
    this.barBg.count = this.barFg.count = bars;
    this.bubbles.count = nbub; this.shadows.count = nsh;
    this.bubbles.instanceMatrix.needsUpdate = this.shadows.instanceMatrix.needsUpdate = true;
    this.barBg.instanceMatrix.needsUpdate = this.barFg.instanceMatrix.needsUpdate = true;
    if (this.barFg.instanceColor) this.barFg.instanceColor.needsUpdate = true;
  }

  syncProjectiles(dt) {
    let n = 0;
    const trailEvery = this.sparks.free > 3000 ? 1 : 3;
    for (const p of this.game.projectiles) {
      if (p.delay > 0) continue;
      const P = this.PROJ[p.k]; if (!P || n >= 1500) continue;
      _m.makeScale(P.s, P.s, P.s).setPosition(p.x, p.y, p.z);
      this.proj.setMatrixAt(n, _m); this.proj.setColorAt(n, P.col); n++;
      if (p.k === 'meteor') { this.glows.spawn(p.x, p.y, p.z, 0, 0.3, 0, 0.45, P.trail, 1.2); this.sparks.spawn(p.x, p.y, p.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.3, '#ffd27a', 2); }
      else if ((n % trailEvery) === 0) this.glows.spawn(p.x, p.y, p.z, 0, 0.1, 0, p.k === 'nuke' ? 0.6 : 0.25, P.trail, p.k === 'missile' ? 0.35 : 0.6);
    }
    this.proj.count = n;
    this.proj.instanceMatrix.needsUpdate = true;
    if (this.proj.instanceColor) this.proj.instanceColor.needsUpdate = true;

    // Burning ground from Scorch Line beams
    let nb = 0;
    for (const b of this.game.burns) {
      if (nb >= 60) break;
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1, L = Math.hypot(dx, dz);
      _q.setFromAxisAngle(UP, Math.atan2(-dz, dx));
      _m.compose(_v.set((b.x1 + b.x2) / 2, 0.03, (b.z1 + b.z2) / 2), _q, _s.set(L, 1, b.w * 2));
      this.burnMesh.setMatrixAt(nb, _m);
      const f = Math.min(1, b.t / b.max * 2) * (0.75 + Math.random() * 0.25);
      this.burnMesh.setColorAt(nb, _c.setRGB(1.6 * f, 0.55 * f, 0.15 * f));
      nb++;
      if (Math.random() < 0.9 * dt * 60) {
        const k = Math.random();
        this.glows.spawn(b.x1 + dx * k + (Math.random() - 0.5) * b.w, 0.1, b.z1 + dz * k + (Math.random() - 0.5) * b.w, 0, 0.9, 0, 0.5, Math.random() < 0.5 ? '#ff7a3d' : '#ffc06a', 1.2);
      }
    }
    this.burnMesh.count = nb;
    this.burnMesh.instanceMatrix.needsUpdate = true;
    if (this.burnMesh.instanceColor) this.burnMesh.instanceColor.needsUpdate = true;

    // Orbital strikes charging up
    for (const st of this.game.strikes) {
      _v2.set(st.x, 16, st.z); _v3.set(st.x, 0, st.z);
      this.beams.add(_v2, _v3, '#fff1a8', 0.02 + (1.2 - st.t) * 0.04, dt * 1.5, 2);
      if (Math.random() < 0.5) this.sparks.spawn(st.x + (Math.random() - 0.5) * st.r * 2, 0.1, st.z + (Math.random() - 0.5) * st.r * 2, 0, 1.5, 0, 0.4, '#fff1a8', 2);
    }

    // Singularity wells
    const wells = this.game.wells;
    while (this.wellObjs.length < wells.length) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 6, 40), glowMat('#c792ff', 3)); r1.rotation.x = Math.PI / 2; grp.add(r1);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.04, 6, 40), glowMat('#ff9f43', 2)); r2.rotation.x = Math.PI / 2 + 0.3; grp.add(r2);
      this.scene.add(grp); this.wellObjs.push(grp);
    }
    this.wellObjs.forEach((grp, i) => {
      const w = wells[i];
      grp.visible = !!w;
      if (!w) return;
      const k = 0.12 + 0.1 * (1 - w.t / w.max);
      grp.position.set(w.x, 0.35, w.z); grp.scale.setScalar(k * (w.splash / 1.4));
      grp.rotation.y += dt * 6;
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2, r = w.r;
        this.sparks.spawn(w.x + Math.cos(a) * r, 0.3, w.z + Math.sin(a) * r, -Math.cos(a) * r * 2.5, 0.2, -Math.sin(a) * r * 2.5, 0.4, '#c792ff', 2.5);
      }
    });

    // Ion lances: continuous beams
    for (const t of this.game.towers) {
      if (t.s.kind !== 'lance' || !t.lt || t.lt.dead || this.game.time - t.fireT > 0.1 || t.busy > 0) continue;
      const heat = t.heat / t.s.rampTime;
      this.muzzle(t.id, _v2);
      _v3.set(t.lt.x, this.alienH[t.lt.type] * 0.5 + (t.lt.air ? FLY_Y : 0), t.lt.z);
      _c.set('#c792ff').lerp(new THREE.Color('#ffffff'), heat * 0.7);
      this.beams.add(_v2, _v3, _c.getHex(), 0.03 + heat * 0.05, dt * 1.6, 3);
      this.beams.add(_v2, _v3, 0xffffff, 0.012, dt * 1.6, 3);
      if (Math.random() < 0.5) this.sparks.burst(_v3.x, _v3.y, _v3.z, 2, '#e9d6ff', 2.5, 0.3);
    }
  }

  // ----- events → effects -----
  handleEvents(events) {
    const busy = this.sparks.free < 2500;
    for (const ev of events) {
      switch (ev.e) {
        case 'bullet': {
          this.muzzle(ev.tid, _v2);
          _v3.set(ev.x + (Math.random() - 0.5) * 0.1, ev.r + 0.05 + (ev.air ? FLY_Y : 0), ev.z + (Math.random() - 0.5) * 0.1);
          this.beams.add(_v2, _v3, '#ffe9a6', 0.016, 0.06, 2.5);
          if (!busy && Math.random() < 0.35) this.sparks.burst(_v3.x, _v3.y, _v3.z, 2, '#ffd27a', 2, 0.18);
          break;
        }
        case 'rail': {
          this.muzzle(ev.tid, _v2); _v3.set(ev.x, _v2.y * 0.6, ev.z);
          this.beams.add(_v2, _v3, '#4df3c9', 0.055, 0.22, 2.5);
          this.beams.add(_v2, _v3, '#ffffff', 0.018, 0.16, 3);
          for (let i = 0; i < 14; i++) { const k = Math.random(); this.sparks.spawn(_v2.x + (_v3.x - _v2.x) * k, _v2.y + (_v3.y - _v2.y) * k, _v2.z + (_v3.z - _v2.z) * k, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.4, '#8ffbe0', 2); }
          this.glows.spawn(_v2.x, _v2.y, _v2.z, 0, 0, 0, 0.2, '#4df3c9', 1.5);
          break;
        }
        case 'cryo': {
          const t = this.game.towers.find(x => x.id === ev.tid); if (!t) break;
          this.rings.add(t.x, PAD_Y + 0.05, t.z, 0.2, ev.r, 0.55, '#7cc7ff', 1.6);
          if (!busy) for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * ev.r; this.sparks.spawn(t.x + Math.cos(a) * r, 0.1, t.z + Math.sin(a) * r, 0, 0.6 + Math.random(), 0, 0.6, '#cdeeff', 1.5); }
          break;
        }
        case 'arc': {
          this.muzzle(ev.tid, _v2);
          let ax = _v2.x, ay = _v2.y, az = _v2.z;
          for (let i = 0; i < ev.pts.length; i += 2) {
            const bx = ev.pts[i], by = 0.25, bz = ev.pts[i + 1];
            let px = ax, py = ay, pz = az;
            for (let s = 1; s <= 4; s++) {
              const k = s / 4, j = s < 4 ? 0.12 : 0;
              const nx = ax + (bx - ax) * k + (Math.random() - 0.5) * j, ny = ay + (by - ay) * k + (Math.random() - 0.5) * j, nz = az + (bz - az) * k + (Math.random() - 0.5) * j;
              _v.set(px, py, pz); _v3.set(nx, ny, nz);
              this.beams.add(_v, _v3, '#c792ff', 0.03, 0.16, 3);
              this.beams.add(_v, _v3, '#ffffff', 0.01, 0.12, 3);
              px = nx; py = ny; pz = nz;
            }
            if (!busy) this.sparks.burst(bx, by, bz, 3, '#e9d6ff', 2, 0.25);
            ax = bx; ay = by; az = bz;
          }
          break;
        }
        case 'boom': {
          const { x, z, r, kind } = ev;
          if (kind === 'orbital') {
            _v2.set(x, 18, z); _v3.set(x, 0, z);
            this.beams.add(_v2, _v3, '#fff1a8', r * 0.38, 0.55, 1.8);
            this.beams.add(_v2, _v3, '#ffffff', r * 0.12, 0.4, 2);
            this.rings.add(x, 0.1, z, 0.2, r * 2.5, 0.8, '#fff1a8', 3);
            this.sparks.burst(x, 0.3, z, 120, '#fff1a8', 6, 1, 1.2, 2.5);
            this.glows.spawn(x, 0.5, z, 0, 0.5, 0, 0.6, '#ffffff', 1.6);
            this.shake = Math.max(this.shake, 0.6);
            this.onFlash && this.onFlash();
          } else if (kind === 'meteor') {
            this.rings.add(x, 0.08, z, 0.05, r * 1.2, 0.4, '#ff7a3d', 2.2);
            this.glows.spawn(x, 0.3, z, 0, 0.4, 0, 0.5, '#ffb070', 2.5);
            this.sparks.burst(x, 0.2, z, busy ? 6 : 16, '#ffcf8a', 3.5, 0.6, 1);
            this.shake = Math.max(this.shake, 0.12);
          } else if (kind === 'nuke') {
            this.rings.add(x, 0.1, z, 0.3, r * 1.3, 0.9, '#fff1c2', 3);
            this.rings.add(x, 0.1, z, 0.1, r * 0.8, 0.6, '#ff9f43', 3);
            for (let i = 0; i < 14; i++) this.glows.spawn(x + (Math.random() - 0.5) * r, 0.2 + Math.random() * 0.8, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.4, i % 2 ? '#ffb347' : '#fff1c2', 2.5);
            this.sparks.burst(x, 0.3, z, 160, '#ffd27a', 7, 1.2, 1.2, 2.5);
            this.shake = Math.max(this.shake, 0.7);
            this.onFlash && this.onFlash();
          } else if (kind === 'singularity') {
            this.rings.add(x, 0.15, z, 0.1, r * 1.2, 0.6, '#c792ff', 3);
            this.glows.spawn(x, 0.4, z, 0, 0.5, 0, 0.6, '#e2c4ff', 3);
            this.sparks.burst(x, 0.3, z, 60, '#c792ff', 5, 0.7, 1);
            this.shake = Math.max(this.shake, 0.25);
          } else {
            const big = kind === 'mortar';
            this.rings.add(x, 0.08, z, 0.05, r, big ? 0.4 : 0.3, '#ff9f43', 2);
            this.glows.spawn(x, 0.3, z, 0, 0.3, 0, big ? 0.45 : 0.3, '#ffb36b', big ? 2.5 : 1.8);
            if (!busy) this.sparks.burst(x, 0.2, z, big ? 18 : 7, '#ffcf8a', big ? 4 : 3, 0.5, 1);
            if (big) this.shake = Math.max(this.shake, 0.06);
          }
          break;
        }
        case 'death': {
          const n = { skitter: busy ? 1 : 4, grunt: 8, shell: 14, brood: 16, queen: 120 }[ev.type];
          this.sparks.burst(ev.x, 0.2, ev.z, n, ALIENS[ev.type].color, ev.type === 'queen' ? 5 : 2.6, 0.6, 1, 2);
          if (ev.type !== 'skitter') this.glows.spawn(ev.x, 0.25, ev.z, 0, 0.2, 0, 0.3, ALIENS[ev.type].color, ev.type === 'queen' ? 4 : 1);
          if (ev.type === 'queen') { this.rings.add(ev.x, 0.1, ev.z, 0.2, 3, 1, '#ffd166', 3); this.shake = Math.max(this.shake, 0.6); }
          break;
        }
        case 'leak':
          if (this.map.base) this.rings.add(this.map.base.x, 0.1, this.map.base.z, 0.4, 1.6, 0.5, '#ff5c7a', 2.5);
          this.shake = Math.max(this.shake, ev.dmg >= 10 ? 0.6 : 0.15);
          this.shieldHit = 0.4;
          break;
        case 'beam': {
          this.muzzle(ev.tid, _v2);
          for (const [x1, z1, x2, z2] of ev.lines) {
            _v.set(_v2.x, _v2.y, _v2.z); _v3.set(x2, 0.3, z2);
            this.beams.add(_v, _v3, ev.scorch ? '#ff7a3d' : '#ffe066', ev.width * 0.9, 0.6, 3);
            this.beams.add(_v, _v3, '#ffffff', ev.width * 0.3, 0.45, 3);
            const L = Math.hypot(x2 - x1, z2 - z1);
            for (let i = 0; i < Math.min(80, L * 3); i++) {
              const k = Math.random();
              this.sparks.spawn(x1 + (x2 - x1) * k, 0.3, z1 + (z2 - z1) * k, (Math.random() - 0.5) * 2, Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.6, ev.scorch ? '#ffb070' : '#fff3b0', 2.2);
            }
          }
          this.glows.spawn(_v2.x, _v2.y, _v2.z, 0, 0, 0, 0.4, '#fff3b0', 3);
          this.shake = Math.max(this.shake, 0.3);
          break;
        }
        case 'orbitalCharge':
          this.rings.add(ev.x, 0.06, ev.z, ev.r * 2.2, ev.r, ev.t, '#fff1a8', 2);
          break;
        case 'stasis':
          this.rings.add(ev.x, 0.1, ev.z, 0.2, ev.r, 0.6, '#9fdcff', 3);
          this.rings.add(ev.x, 0.1, ev.z, ev.r, ev.r, 4, '#7cc7ff', 0.8);
          for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ev.r; this.sparks.spawn(ev.x + Math.cos(a) * r, 0.1, ev.z + Math.sin(a) * r, 0, 0.8 + Math.random(), 0, 1, '#dff4ff', 2); }
          break;
        case 'overdrive':
          for (const t of this.game.towers) this.rings.add(t.x, PAD_Y + 0.05, t.z, 0.2, 1.1, 0.7, '#c792ff', 2.5);
          break;
        case 'repair':
          this.shieldHeal = 0.8;
          if (this.map.base) { this.rings.add(this.map.base.x, 0.1, this.map.base.z, 0.3, 2, 0.8, '#9cff57', 2.5); this.sparks.burst(this.map.base.x, 0.6, this.map.base.z, 50, '#9cff57', 2.5, 1, 1.5); }
          break;
        case 'build': case 'upgraded': {
          const t = this.game.towers.find(x => x.id === ev.tid); if (!t) break;
          this.rings.add(t.x, PAD_Y + 0.05, t.z, 0.1, 0.8, 0.5, TOWERS[t.type].color, 2.5);
          this.sparks.burst(t.x, 0.4, t.z, ev.e === 'upgraded' ? 40 : 16, TOWERS[t.type].color, 2.5, 0.6, 1.5);
          break;
        }
        case 'sell':
          this.sparks.burst(ev.x, 0.3, ev.z, 20, '#ffd166', 2.5, 0.6, 1.5);
          break;
      }
    }
  }

  // ----- selection / build preview -----
  setPreview({ buildType, hover, selected, canPlace, aim, power, lines, hoverColor, nextRanges }) {
    for (const k in this.ghosts) this.ghosts[k].group.visible = false;
    this.rangeRing.visible = false; this.selRing.visible = false; this.hoverTile.visible = false;
    this.nextRings.forEach(r => r.visible = false);
    if (selected && nextRanges && selected.s.kind !== 'beam') {
      nextRanges.slice(0, 2).forEach((nr, i) => {
        if (!nr || Math.abs(nr.range - selected.s.range) < 0.01) return;
        const g = this.nextRings[i];
        g.visible = true; g.position.x = selected.x; g.position.z = selected.z; g.position.y = PAD_Y + 0.025 + i * 0.004;
        g.scale.setScalar(nr.range); g.setColor(nr.color || 0xffd166);
        g.children[1].material.opacity = 0.03;
      });
    }
    this.preview.list.length = 0;
    const L = (x1, z1, x2, z2, col, w = 0.03, k = 2) => { _v.set(x1, PAD_Y + 0.06, z1); _v3.set(x2, PAD_Y + 0.06, z2); this.preview.add(_v, _v3, col, w, 1, k); };
    if (lines) for (const l of lines) L(l[0], l[1], l[2], l[3], l[4] || '#4df3c9', l[5] || 0.05, 1.6);
    if (aim) {
      const t = aim.tower, s = t.s, n = s.beams || 1;
      const base = Math.atan2(aim.z - t.z, aim.x - t.x);
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i - (n - 1) / 2) * s.spread : 0);
        L(t.x, t.z, t.x + Math.cos(a) * 40, t.z + Math.sin(a) * 40, aim.ready ? '#ffe066' : '#7d6a3a', aim.ready ? 0.035 : 0.02, aim.ready ? 1.6 : 0.8);
      }
    }
    if (power && power.point) {
      this.rangeRing.visible = true; this.rangeRing.position.x = power.point.x; this.rangeRing.position.z = power.point.z;
      this.rangeRing.scale.setScalar(POWERS[power.id].radius); this.rangeRing.setColor(power.ok ? POWERS[power.id].color : '#ff5c7a');
    }
    if (hover) { this.hoverTile.visible = true; this.hoverTile.position.set(hover.c + 0.5, PAD_Y + 0.01, hover.r + 0.5); }
    if (buildType && hover) {
      const gh = this.ghost(buildType);
      gh.group.visible = true; gh.group.position.set(hover.c + 0.5, PAD_Y, hover.r + 0.5);
      gh.mat.color.set(canPlace ? TOWERS[buildType].color : '#ff5c7a');
      this.rangeRing.visible = !TOWERS[buildType].manual; this.rangeRing.position.x = hover.c + 0.5; this.rangeRing.position.z = hover.r + 0.5;
      this.rangeRing.scale.setScalar(TOWERS[buildType].base.range); this.rangeRing.setColor(canPlace ? 0x4df3c9 : 0xff5c7a);
      this.hoverTile.material.color.set(canPlace ? 0x4df3c9 : 0xff5c7a);
    } else this.hoverTile.material.color.set(hoverColor || 0x7d9cc8);
    if (selected && selected.s.kind !== 'beam') {
      this.rangeRing.visible = true; this.rangeRing.position.x = selected.x; this.rangeRing.position.z = selected.z;
      this.rangeRing.scale.setScalar(selected.s.range); this.rangeRing.setColor(0x4df3c9);
    }
    if (selected) { this.selRing.visible = true; this.selRing.position.set(selected.x, PAD_Y + 0.03, selected.z); }
  }

  frame(dt, events) {
    dt = Math.max(0, dt);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.applyCamera();
    this.syncTowers(dt);
    this.handleEvents(events);
    this.syncAliens();
    this.syncProjectiles(dt);
    this.beams.update(dt); this.sparks.update(dt); this.glows.update(dt); this.rings.update(dt);
    // ambient motion
    for (const p of this.portals) {
      p.swirl.rotation.z -= dt * 3;
      if (Math.random() < 0.5) {
        const o = (Math.random() - 0.5) * 0.9, s = 0.6 + Math.random();
        this.sparks.spawn(p.x - p.dz * o, 0.6 + (Math.random() - 0.5) * 0.9, p.z + p.dx * o, p.dx * s, 0, p.dz * s, 0.5, '#9cff57', 1.5);
      }
    }
    this.shieldHit = Math.max(0, (this.shieldHit || 0) - dt);
    this.shieldHeal = Math.max(0, (this.shieldHeal || 0) - dt);
    if (this.shield) {
      const lf = this.game.lives / (this.game.maxLives || 100);
      this.shield.material.opacity = 0.05 + 0.16 * lf + Math.sin(this.time * 3) * 0.02 + (this.shieldHit + this.shieldHeal) * 0.8;
      this.shield.material.color.set(this.shieldHit > 0 ? 0xff5c7a : this.shieldHeal > 0 ? 0x9cff57 : 0x4df3c9);
      this.baseCore.scale.setScalar(1 + Math.sin(this.time * 4) * 0.12);
    }
    this.preview.update(0);
    if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // Render small icons of each tower for the build buttons.
  static towerIcon(type, size = 96) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(size, size, false); r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xc8dcff, 0x223355, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 4, 3); s.add(d);
    const o = buildTower(type, 1, null, TOWERS[type].color);
    o.head.rotation.y = -0.5; s.add(o.group);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    cam.position.set(1.05, 1.0, 1.35); cam.lookAt(0, 0.36, 0);
    r.render(s, cam);
    const url = r.domElement.toDataURL();
    r.dispose(); r.forceContextLoss();
    return url;
  }
}
