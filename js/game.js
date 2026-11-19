// Xeno Siege — game simulation.
// Pure logic: no DOM, no Three.js. The browser game and tools/balance.mjs both use this file.
// World units: 1 unit = 1 tile. x runs left→right (columns), z runs top→bottom (rows).

export const START_LIVES = 100;

// ---------- Maps ----------
// Each lane is a list of [col, row] waypoints. The first point sits just outside the map (the rift),
// and every lane must end on the same tile (the base). Lanes may share tiles where they merge.
export const MAPS = [
  {
    id: 'spiral', name: 'The Spiral', difficulty: 'Easy', cols: 24, rows: 15, credits: 260, hpScale: 1.0,
    desc: 'One very long lane that coils inward to a base at the centre. Plenty of time to shoot.',
    lanes: [[[-1,1],[22,1],[22,13],[1,13],[1,4],[19,4],[19,10],[4,10],[4,7],[12,7]]],
  },
  {
    id: 'valley', name: 'Rift Valley', difficulty: 'Normal', cols: 24, rows: 15, credits: 220, hpScale: 1.1,
    desc: 'A single winding lane through the valley. The classic.',
    lanes: [[[-1,2],[5,2],[5,7],[2,7],[2,12],[10,12],[10,4],[15,4],[15,10],[20,10],[20,6],[22,6]]],
  },
  {
    id: 'twin', name: 'Twin Rifts', difficulty: 'Hard', cols: 24, rows: 15, credits: 260, hpScale: 1.0,
    desc: 'Two rifts split the swarm into lanes that merge halfway. Cover both or get flanked.',
    lanes: [
      [[-1,2],[6,2],[6,6],[11,6],[11,7],[16,7],[16,2],[20,2],[20,12],[22,12]],
      [[-1,12],[6,12],[6,8],[11,8],[11,7],[16,7],[16,2],[20,2],[20,12],[22,12]],
    ],
  },
  {
    id: 'hive', name: 'Hive Breach', difficulty: 'Brutal', cols: 24, rows: 15, credits: 300, hpScale: 1.2,
    desc: 'Three rifts converge on a short run to your base. Only for veterans.',
    lanes: [
      [[8,-1],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
      [[-1,7],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
      [[8,15],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
    ],
  },
];

function buildMap(def) {
  const m = { ...def, paths: [], pathTiles: new Set(), entrances: new Set() };
  for (const pts of def.lanes) {
    const way = pts.map(([c, r]) => ({ x: c + 0.5, z: r + 0.5 }));
    const seg = []; let len = 0;
    for (let i = 0; i < way.length - 1; i++) {
      const a = way[i], b = way[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
      seg.push({ a, b, len: l, start: len, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l });
      len += l;
    }
    for (const s of seg) {
      for (let i = 0; i <= Math.round(s.len); i++) {
        const c = Math.floor(s.a.x + s.ux * i), r = Math.floor(s.a.z + s.uz * i);
        if (c >= 0 && c < m.cols && r >= 0 && r < m.rows) m.pathTiles.add(c + ',' + r);
      }
    }
    m.paths.push({ way, seg, len });
    m.entrances.add(pts[0][0] + ',' + pts[0][1]);
  }
  m.base = m.paths[0].way[m.paths[0].way.length - 1];
  return m;
}
const MAP_CACHE = new Map(MAPS.map(d => [d.id, buildMap(d)]));
export const getMap = id => MAP_CACHE.get(id) || MAP_CACHE.get('valley');
export const MAP_IDS = MAPS.map(d => d.id);

// Point on a lane's centre line at distance d (no sideways offset).
export function posAt(path, d, out = {}) {
  let s = path.seg[path.seg.length - 1];
  for (const g of path.seg) if (d <= g.start + g.len) { s = g; break; }
  const k = Math.min(d, s.start + s.len) - s.start;
  out.x = s.a.x + s.ux * k; out.z = s.a.z + s.uz * k; out.dx = s.ux; out.dz = s.uz;
  return out;
}

// Buildable tiles ranked by how much lane is within `range` of them (used by the demo battle and balance bot).
export function rankBuildSpots(map, range = 3) {
  const tiles = [...map.pathTiles].map(k => k.split(',').map(Number));
  const out = [];
  for (let c = 0; c < map.cols; c++) for (let r = 0; r < map.rows; r++) {
    if (map.pathTiles.has(c + ',' + r)) continue;
    let score = 0;
    for (const [pc, pr] of tiles) if (Math.hypot(pc - c, pr - r) <= range) score++;
    out.push({ c, r, score });
  }
  return out.sort((a, b) => b.score - a.score || a.c - b.c || a.r - b.r);
}

// ---------- Towers ----------
// Each tower: base stats (level 1), l2 overrides, then two branches with a (level 3) and b (level 4 / Mk II) overrides.
export const TOWERS = {
  gatling: {
    name: 'Gatling Turret', key: '1', cost: 60, color: '#4df3c9',
    desc: 'Rapid-fire cannon. Shreds small aliens, but armor soaks a lot of each bullet.',
    base: { kind: 'bullet', range: 3.2, rate: 0.14, dmg: 6, spread: 1 },
    l2:   { dmg: 9, range: 3.5, rate: 0.12 },
    branches: {
      minigun: { name: 'Minigun', cost: 160, cost2: 340,
        desc: 'Six spinning barrels that spray the whole swarm. Huge rate of fire.',
        a: { rate: 0.045, dmg: 8, range: 3.7, spread: 2 }, b: { rate: 0.03, dmg: 12, range: 4.1, spread: 2 } },
      railgun: { name: 'Railgun', cost: 180, cost2: 380,
        desc: 'Hypersonic slugs that pierce every alien in a line and ignore armor.',
        a: { kind: 'rail', rate: 1.3, dmg: 110, range: 6, width: 0.35 }, b: { kind: 'rail', rate: 1.0, dmg: 240, range: 7, width: 0.45 } },
    },
  },
  mortar: {
    name: 'Plasma Mortar', key: '2', cost: 100, color: '#ff9f43',
    desc: 'Lobs plasma shells that splash whole clusters of aliens.',
    base: { kind: 'mortar', range: 4.2, rate: 1.7, dmg: 28, splash: 0.9 },
    l2:   { dmg: 45, splash: 1.0, rate: 1.5 },
    branches: {
      cluster: { name: 'Cluster Bombard', cost: 200, cost2: 420,
        desc: 'Every shell bursts into a ring of bomblets. Carpets the lane.',
        a: { dmg: 45, splash: 0.85, bomblets: 5, rate: 1.4 }, b: { dmg: 70, splash: 0.95, bomblets: 9, rate: 1.2 } },
      singularity: { name: 'Singularity Shell', cost: 220, cost2: 460,
        desc: 'Opens a tiny black hole that holds aliens in place, then detonates.',
        a: { dmg: 140, splash: 1.4, well: 1.3, rate: 2.6 }, b: { dmg: 320, splash: 1.8, well: 1.7, rate: 2.3 } },
    },
  },
  cryo: {
    name: 'Cryo Field', key: '3', cost: 80, color: '#7cc7ff',
    desc: 'Pulses frost at every alien in range, slowing them down for your other guns.',
    base: { kind: 'cryo', range: 2.2, rate: 1.0, dmg: 3, slow: 0.4, slowDur: 1.5 },
    l2:   { range: 2.5, slow: 0.5, dmg: 5 },
    branches: {
      zero: { name: 'Absolute Zero', cost: 170, cost2: 360,
        desc: 'Deep freeze. Each pulse can freeze aliens solid (bosses are immune).',
        a: { slow: 0.6, freeze: 0.15, freezeDur: 0.8, range: 2.7 }, b: { slow: 0.7, freeze: 0.25, freezeDur: 1.1, range: 3.0, dmg: 10 } },
      shatter: { name: 'Shatter Field', cost: 190, cost2: 400,
        desc: 'Frozen hides turn brittle: chilled aliens take extra damage from everything.',
        a: { brittle: 0.35, range: 2.7 }, b: { brittle: 0.6, range: 3.0, dmg: 12 } },
    },
  },
  arc: {
    name: 'Arc Coil', key: '4', cost: 140, color: '#c792ff',
    desc: 'Lightning that jumps between aliens and ignores armor.',
    base: { kind: 'arc', range: 3.0, rate: 1.1, dmg: 22, chain: 3, jump: 1.5, decay: 0.88 },
    l2:   { dmg: 34, chain: 4 },
    branches: {
      storm: { name: 'Storm Coil', cost: 230, cost2: 480,
        desc: 'Forked lightning that tears through huge chunks of the swarm.',
        a: { chain: 10, jump: 1.9, dmg: 40, rate: 0.9, decay: 0.94 }, b: { chain: 18, jump: 2.2, dmg: 58, rate: 0.75, decay: 0.95 } },
      lance: { name: 'Ion Lance', cost: 240, cost2: 500,
        desc: 'A continuous beam that burns hotter the longer it holds a target. Locks onto the toughest alien. Boss killer.',
        a: { kind: 'lance', dps: 90, ramp: 3, rampTime: 3, range: 3.6 }, b: { kind: 'lance', dps: 180, ramp: 5, rampTime: 3, range: 4.2 } },
    },
  },
  missile: {
    name: 'Missile Battery', key: '5', cost: 160, color: '#ff5c7a',
    desc: 'Fires salvos of homing missiles, each at a different alien.',
    base: { kind: 'missile', range: 4.6, rate: 2.0, dmg: 26, splash: 0.6, salvo: 3 },
    l2:   { dmg: 38, salvo: 4, rate: 1.8 },
    branches: {
      hydra: { name: 'Hydra Pods', cost: 260, cost2: 520,
        desc: 'Massive salvos of micro-missiles, every one hunting its own alien.',
        a: { salvo: 10, dmg: 36, rate: 1.7 }, b: { salvo: 18, dmg: 52, rate: 1.5 } },
      nuke: { name: 'Tactical Nuke', cost: 280, cost2: 560,
        desc: 'One enormous warhead aimed at the densest part of the swarm. Slow to reload.',
        a: { salvo: 1, dmg: 480, splash: 2.3, rate: 6, range: 6 }, b: { salvo: 1, dmg: 1050, splash: 2.9, rate: 5.5, range: 7 } },
    },
  },
};
export const TOWER_TYPES = Object.keys(TOWERS);
export const UPGRADE_TIME = { 2: 1.5, 3: 2.5, 4: 3.5 };
export const MAX_LVL = 4;

export function towerStats(type, lvl, branch) {
  const d = TOWERS[type], s = { ...d.base };
  if (lvl >= 2) Object.assign(s, d.l2);
  if (lvl >= 3 && branch) Object.assign(s, d.branches[branch].a);
  if (lvl >= 4 && branch) Object.assign(s, d.branches[branch].b);
  return s;
}
export function towerName(t) {
  if (t.branch) return TOWERS[t.type].branches[t.branch].name + (t.lvl >= 4 ? ' Mk II' : '');
  return TOWERS[t.type].name;
}
export function upgradeOptions(t) {
  const d = TOWERS[t.type];
  if (t.lvl === 1) return [{ lvl: 2, cost: Math.round(d.cost * 0.8), label: 'Level 2' }];
  if (t.lvl === 2) return Object.entries(d.branches).map(([k, b]) => ({ lvl: 3, branch: k, cost: b.cost, label: b.name, desc: b.desc }));
  if (t.lvl === 3) { const b = d.branches[t.branch]; return [{ lvl: 4, branch: t.branch, cost: b.cost2, label: b.name + ' Mk II' }]; }
  return [];
}
export const sellValue = t => Math.floor(t.spent * 0.7);

// ---------- Aliens ----------
export const ALIENS = {
  skitter: { name: 'Skitter',    hp: 14,   speed: 2.0,  reward: 0.5, dmg: 1,  r: 0.14, color: '#9cff57' },
  grunt:   { name: 'Grunt',      hp: 55,   speed: 1.2,  reward: 3,   dmg: 2,  r: 0.22, color: '#57e3ff' },
  shell:   { name: 'Shellback',  hp: 230,  speed: 0.8,  reward: 10,  dmg: 5,  r: 0.30, armor: 6, color: '#ff6bd6' },
  brood:   { name: 'Brood Sac',  hp: 170,  speed: 0.9,  reward: 8,   dmg: 4,  r: 0.30, split: 8, color: '#c77dff' },
  queen:   { name: 'Hive Queen', hp: 1800, speed: 0.75, reward: 150, dmg: 20, r: 0.60, armor: 4, boss: true, color: '#ffd166' },
};
export const hpMult = w => 1.17 ** (w - 1) * (1 + 0.05 * (w - 1));

// ---------- Waves ----------
// A wave is a list of groups that spawn one after another: { type, n, gap (s between spawns), wait (s before the group) }.
export function buildWave(w) {
  const g = [];
  // maxDur squeezes big groups into a fixed window so late waves arrive as a flood, not a trickle.
  const add = (type, n, gap, maxDur, wait = 0.6) => {
    n = Math.round(n);
    if (n > 0) g.push({ type, n, gap: Math.min(gap, maxDur / n), wait });
  };
  add('skitter', 20 + w * 10, 0.06, 6, 0);
  add('grunt', 3 + w * 1.6, 0.35, 10);
  if (w >= 4) add('shell', (w - 2) * 0.7, 0.9, 10);
  if (w >= 6) add('brood', (w - 4) * 0.5, 1.2, 10);
  if (w % 5 === 3) add('skitter', 60 + w * 22, 0.03, 5, 1);  // swarm wave
  add('skitter', 10 + w * 6, 0.08, 5);
  if (w % 10 === 0) add('queen', w / 10, 4, 8, 1.5);         // boss wave
  return g;
}
export function waveSummary(w) {
  const counts = {};
  for (const g of buildWave(w)) counts[g.type] = (counts[g.type] || 0) + g.n;
  return counts;
}

// ---------- Spatial grid (fast "who is near here?" lookups for big swarms) ----------
class Grid {
  constructor(cols, rows) { this.w = cols + 4; this.h = rows + 4; this.cells = Array.from({ length: this.w * this.h }, () => []); }
  clear() { for (const c of this.cells) c.length = 0; }
  add(e) {
    const cx = Math.floor(e.x) + 2, cz = Math.floor(e.z) + 2;
    if (cx >= 0 && cz >= 0 && cx < this.w && cz < this.h) this.cells[cx + cz * this.w].push(e);
  }
  query(x, z, r, out) {
    out.length = 0;
    const r2 = r * r, W = this.w;
    const x0 = Math.max(0, Math.floor(x - r) + 2), x1 = Math.min(W - 1, Math.floor(x + r) + 2);
    const z0 = Math.max(0, Math.floor(z - r) + 2), z1 = Math.min(this.h - 1, Math.floor(z + r) + 2);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      for (const e of this.cells[cx + cz * W]) {
        if (e.dead) continue;
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz <= r2) out.push(e);
      }
    }
    return out;
  }
}

function compact(arr, keep) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[j++] = arr[i];
  arr.length = j;
}
function first(list) { let b = list[0]; for (const e of list) if (e.d > b.d) b = e; return b; }

// ---------- Game ----------
export class Game {
  constructor(opts = {}) {
    this.rand = opts.rand || Math.random;
    this._q = []; this._q2 = []; this._hit = new Set(); this._p = {};
    this.demo = false;          // demo battle on the home screen: leaks cost nothing
    this.setMap(opts.map || 'valley');
  }

  setMap(id) {
    this.map = getMap(id);
    this.grid = new Grid(this.map.cols, this.map.rows);
    this.reset();
  }

  reset() {
    Object.assign(this, {
      credits: this.map.credits, lives: START_LIVES, wave: 0, kills: 0, time: 0,
      enemies: [], pending: [], towers: [], projectiles: [], wells: [], events: [],
      groups: [], gi: 0, gCount: 0, gTimer: 0, waveActive: false, over: false, uid: 0, spawnIdx: 0,
    });
    this.grid.clear();
  }

  get spawning() { return this.gi < this.groups.length; }
  emit(ev) { if (this.events.length < 4000) this.events.push(ev); }

  // ----- Enemies -----
  spawnEnemy(type, d = 0, off = null, pi = null) {
    const a = ALIENS[type], w = Math.max(1, this.wave);
    const hp = Math.round(a.hp * (a.boss ? hpMult(w) ** 0.88 : hpMult(w)) * this.map.hpScale);
    const e = {
      id: ++this.uid, type, hp, max: hp, d, pi: pi ?? (this.spawnIdx++ % this.map.paths.length),
      speed: a.speed * (0.92 + this.rand() * 0.16), armor: a.armor || 0,
      reward: a.reward * (1 + 0.02 * (w - 1)), dmg: a.dmg,
      off: off ?? (a.boss ? 0 : (this.rand() - 0.5) * 0.72),
      x: 0, z: 0, dx: 1, dz: 0, si: 0,
      slowT: 0, slowAmt: 0, freezeT: 0, brittleT: 0, brittle: 0, hit: 0, wellMul: 1,
      anim: this.rand() * 10, dead: false,
    };
    this.placeEnemy(e);
    this.pending.push(e);
    return e;
  }

  // Position on the lane plus a sideways offset, blended smoothly around corners.
  placeEnemy(e) {
    const SEG = this.map.paths[e.pi].seg;
    while (e.si < SEG.length - 1 && e.d > SEG[e.si].start + SEG[e.si].len) e.si++;
    const s = SEG[e.si];
    const k = Math.min(Math.max(e.d - s.start, 0), s.len);
    let px = -s.uz, pz = s.ux, dx = s.ux, dz = s.uz;
    const B = 0.45;
    const rem = s.len - k;
    if (rem < B && e.si < SEG.length - 1) {
      const n = SEG[e.si + 1], w = 0.5 * (1 - rem / B);
      px += (-n.uz - px) * w; pz += (n.ux - pz) * w; dx += (n.ux - dx) * w; dz += (n.uz - dz) * w;
    } else if (k < B && e.si > 0) {
      const p = SEG[e.si - 1], w = 0.5 * (1 - k / B);
      px += (-p.uz - px) * w; pz += (p.ux - pz) * w; dx += (p.ux - dx) * w; dz += (p.uz - dz) * w;
    }
    e.x = s.a.x + s.ux * k + px * e.off;
    e.z = s.a.z + s.uz * k + pz * e.off;
    const dl = Math.hypot(dx, dz) || 1;
    e.dx = dx / dl; e.dz = dz / dl;
  }

  damage(e, amt, pierce, src) {
    if (e.dead) return;
    let d = pierce ? amt : Math.max(amt * 0.2, amt - e.armor);
    if (e.brittleT > 0) d *= 1 + e.brittle;
    e.hp -= d; e.hit = 0.06;
    if (src) src.dmgDone += d;
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.dead = true;
    this.credits += e.reward; this.kills++;
    if (src) src.kills++;
    this.emit({ e: 'death', type: e.type, x: e.x, z: e.z, reward: e.reward });
    const a = ALIENS[e.type];
    if (a.split) for (let i = 0; i < a.split; i++) this.spawnEnemy('skitter', Math.max(0, e.d - this.rand() * 0.6), (this.rand() - 0.5) * 0.72, e.pi);
    if (a.boss) this.emit({ e: 'bossDown', x: e.x, z: e.z, reward: e.reward });
  }

  explode(x, z, r, dmg, src, pierce, kind) {
    for (const e of this.grid.query(x, z, r, this._q2)) this.damage(e, dmg, pierce, src);
    this.emit({ e: 'boom', x, z, r, kind });
  }

  // ----- Towers -----
  canBuild(c, r) {
    if (c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return false;
    if (this.map.pathTiles.has(c + ',' + r)) return false;
    return !this.towers.some(t => t.c === c && t.r === r);
  }
  towerAt(c, r) { return this.towers.find(t => t.c === c && t.r === r) || null; }

  build(type, c, r) {
    const d = TOWERS[type];
    if (this.over || !this.canBuild(c, r) || this.credits < d.cost) return null;
    this.credits -= d.cost;
    const t = {
      id: ++this.uid, type, c, r, x: c + 0.5, z: r + 0.5, lvl: 1, branch: null,
      cd: 0, yaw: -Math.PI / 2, spent: d.cost, kills: 0, dmgDone: 0,
      busy: 0, busyMax: 0, heat: 0, lt: null, fireT: -1, s: towerStats(type, 1, null),
    };
    this.towers.push(t);
    this.emit({ e: 'build', tid: t.id });
    return t;
  }

  upgrade(t, opt) {
    if (!t || !opt || t.busy > 0 || this.credits < opt.cost || this.over) return false;
    if (!upgradeOptions(t).some(o => o.lvl === opt.lvl && o.branch === opt.branch)) return false;
    this.credits -= opt.cost; t.spent += opt.cost;
    t.lvl = opt.lvl; if (opt.branch) t.branch = opt.branch;
    t.s = towerStats(t.type, t.lvl, t.branch);
    t.busy = t.busyMax = UPGRADE_TIME[t.lvl]; t.cd = 0; t.heat = 0; t.lt = null;
    this.emit({ e: 'upgradeStart', tid: t.id });
    return true;
  }

  sell(t) {
    if (!t) return;
    this.credits += sellValue(t);
    this.towers = this.towers.filter(x => x !== t);
    this.emit({ e: 'sell', tid: t.id, x: t.x, z: t.z, value: sellValue(t) });
  }

  fire(t) {
    const s = t.s, list = this.grid.query(t.x, t.z, s.range, this._q);
    if (!list.length) return false;
    const aim = e => { t.yaw = Math.atan2(e.z - t.z, e.x - t.x); };

    if (s.kind === 'bullet') {
      const e = s.spread > 1 ? list[(this.rand() * list.length) | 0] : first(list);
      aim(e); this.damage(e, s.dmg, false, t);
      this.emit({ e: 'bullet', tid: t.id, x: e.x, z: e.z, r: ALIENS[e.type].r });
    } else if (s.kind === 'rail') {
      const tg = first(list); aim(tg);
      const ux = Math.cos(t.yaw), uz = Math.sin(t.yaw);
      const cand = this.grid.query(t.x + ux * s.range / 2, t.z + uz * s.range / 2, s.range / 2 + s.width, this._q2);
      for (const e of cand) {
        const px = e.x - t.x, pz = e.z - t.z, along = px * ux + pz * uz;
        if (along < 0 || along > s.range) continue;
        if (Math.abs(px * uz - pz * ux) <= s.width) this.damage(e, s.dmg, true, t);
      }
      this.emit({ e: 'rail', tid: t.id, x: t.x + ux * s.range, z: t.z + uz * s.range });
    } else if (s.kind === 'mortar') {
      const tg = first(list);
      const dist = Math.hypot(tg.x - t.x, tg.z - t.z), dur = 0.6 + dist * 0.12;
      const sp = tg.speed * (tg.freezeT > 0 ? 0 : tg.slowT > 0 ? 1 - tg.slowAmt : 1);
      const path = this.map.paths[tg.pi];
      const p = posAt(path, Math.min(tg.d + sp * dur, path.len - 0.01), this._p);
      aim(p);
      this.projectiles.push({ k: s.well ? 'void' : 'shell', sx: t.x, sz: t.z, x: t.x, y: 0.6, z: t.z, tx: p.x, tz: p.z,
        t: 0, dur, h: 2.4, dmg: s.dmg, splash: s.splash, bomblets: s.bomblets || 0, well: s.well || 0, src: t });
    } else if (s.kind === 'cryo') {
      for (const e of list) {
        this.damage(e, s.dmg, true, t);
        if (e.dead) continue;
        if (e.slowT <= 0) e.slowAmt = 0;
        e.slowAmt = Math.max(e.slowAmt, s.slow); e.slowT = Math.max(e.slowT, s.slowDur);
        if (s.freeze && !ALIENS[e.type].boss && this.rand() < s.freeze) e.freezeT = s.freezeDur;
        if (s.brittle) { e.brittle = Math.max(e.brittleT > 0 ? e.brittle : 0, s.brittle); e.brittleT = s.slowDur; }
      }
      this.emit({ e: 'cryo', tid: t.id, r: s.range });
    } else if (s.kind === 'arc') {
      let cur = first(list), dmg = s.dmg;
      const hit = this._hit; hit.clear();
      const pts = [];
      aim(cur);
      for (let i = 0; i <= s.chain && cur; i++) {
        hit.add(cur.id); pts.push(cur.x, cur.z);
        this.damage(cur, dmg, true, t); dmg *= s.decay;
        let nx = null, nd = 1e9;
        for (const e of this.grid.query(cur.x, cur.z, s.jump, this._q2)) {
          if (hit.has(e.id)) continue;
          const dd = (e.x - cur.x) ** 2 + (e.z - cur.z) ** 2;
          if (dd < nd) { nd = dd; nx = e; }
        }
        cur = nx;
      }
      this.emit({ e: 'arc', tid: t.id, pts });
    } else if (s.kind === 'missile') {
      let targets;
      if (s.salvo === 1) targets = [this.densest(list, s.splash)];
      else targets = list.slice().sort((a, b) => b.d - a.d);
      aim(targets[0]);
      for (let i = 0; i < s.salvo; i++) {
        const tg = targets[i % targets.length];
        const nuke = s.salvo === 1;
        this.projectiles.push({ k: nuke ? 'nuke' : 'missile', x: t.x, y: 0.7, z: t.z,
          vx: (this.rand() - 0.5) * 2.5, vy: nuke ? 3.5 : 3 + this.rand() * 1.5, vz: (this.rand() - 0.5) * 2.5,
          tgt: tg, tx: tg.x, tz: tg.z, spd: nuke ? 4.5 : 7, life: 5, delay: i * 0.035,
          dmg: s.dmg, splash: s.splash, src: t });
      }
    }
    t.fireT = this.time;
    return true;
  }

  densest(list, r) {
    let best = list[0], bc = -1;
    const step = Math.max(1, Math.floor(list.length / 30));
    for (let i = 0; i < list.length; i += step) {
      const c = this.grid.query(list[i].x, list[i].z, r, this._q2).length;
      if (c > bc) { bc = c; best = list[i]; }
    }
    return best;
  }

  lance(t, dt) {
    const s = t.s;
    let tg = t.lt;
    if (!tg || tg.dead || Math.hypot(tg.x - t.x, tg.z - t.z) > s.range) {
      const list = this.grid.query(t.x, t.z, s.range, this._q);
      tg = null;
      for (const e of list) if (!tg || e.max > tg.max || (e.max === tg.max && e.d > tg.d)) tg = e;
      t.heat = 0; t.lt = tg;
    }
    if (!tg) return;
    t.heat = Math.min(s.rampTime, t.heat + dt);
    const mult = 1 + (s.ramp - 1) * (t.heat / s.rampTime);
    t.yaw = Math.atan2(tg.z - t.z, tg.x - t.x);
    t.fireT = this.time;
    this.damage(tg, s.dps * mult * dt, true, t);
  }

  // ----- Waves -----
  launch() {
    if (this.over || this.spawning) return false;
    if (this.waveActive) {
      const b = 10 + this.wave * 3;
      this.credits += b;
      this.emit({ e: 'early', amount: b });
    }
    this.wave++;
    this.groups = buildWave(this.wave); this.gi = 0; this.gCount = 0; this.gTimer = 0.2;
    this.waveActive = true;
    this.emit({ e: 'waveStart', wave: this.wave, boss: this.wave % 10 === 0, swarm: this.wave % 5 === 3 });
    return true;
  }

  // ----- Main update -----
  update(dt) {
    if (this.over || !(dt > 0)) return;
    this.time += dt;

    // Spawning
    if (this.spawning) {
      this.gTimer -= dt;
      while (this.gi < this.groups.length && this.gTimer <= 0) {
        const g = this.groups[this.gi];
        this.spawnEnemy(g.type);
        this.gTimer += g.gap;
        if (++this.gCount >= g.n) {
          this.gi++; this.gCount = 0;
          if (this.gi < this.groups.length) this.gTimer += this.groups[this.gi].wait;
        }
      }
    }
    if (this.pending.length) { for (const e of this.pending) this.enemies.push(e); this.pending.length = 0; }

    // Gravity wells hold aliens in place
    for (const w of this.wells) {
      w.t -= dt;
      for (const e of this.grid.query(w.x, w.z, w.r, this._q2)) e.wellMul = ALIENS[e.type].boss ? 0.5 : 0.08;
      if (w.t <= 0) { w.done = true; this.explode(w.x, w.z, w.splash, w.dmg, w.src, true, 'singularity'); }
    }
    compact(this.wells, w => !w.done);

    // Move aliens
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.hit > 0) e.hit -= dt;
      let mul = 1;
      if (e.freezeT > 0) { e.freezeT -= dt; mul = 0; }
      else if (e.slowT > 0) { e.slowT -= dt; mul = 1 - e.slowAmt; }
      if (e.brittleT > 0) e.brittleT -= dt;
      mul *= e.wellMul; e.wellMul = 1;
      e.d += e.speed * mul * dt;
      e.anim += dt * (0.3 + mul) * e.speed * 4;
      if (e.d >= this.map.paths[e.pi].len) {
        e.dead = true; e.leaked = true;
        if (!this.demo) {
          this.lives = Math.max(0, this.lives - e.dmg);
          this.emit({ e: 'leak', dmg: e.dmg, type: e.type });
        }
        continue;
      }
      this.placeEnemy(e);
    }
    compact(this.enemies, e => !e.dead);
    this.grid.clear();
    for (const e of this.enemies) this.grid.add(e);

    // Towers
    for (const t of this.towers) {
      if (t.busy > 0) {
        t.busy -= dt;
        if (t.busy <= 0) { t.busy = 0; this.emit({ e: 'upgraded', tid: t.id }); }
        continue;
      }
      if (t.s.kind === 'lance') { this.lance(t, dt); continue; }
      t.cd -= dt;
      let guard = 0;
      while (t.cd <= 0 && guard++ < 6) {
        if (!this.fire(t)) { t.cd = 0; break; }
        t.cd += t.s.rate;
      }
    }

    // Projectiles
    for (const p of this.projectiles) {
      if (p.k === 'shell' || p.k === 'void' || p.k === 'bomblet') {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k; p.z = p.sz + (p.tz - p.sz) * k;
        p.y = 0.2 + Math.sin(Math.PI * k) * p.h + (1 - k) * 0.4;
        if (k >= 1) {
          p.done = true;
          if (p.well) {
            this.wells.push({ x: p.tx, z: p.tz, r: p.splash * 1.3, t: p.well, max: p.well, dmg: p.dmg, splash: p.splash, src: p.src });
          } else {
            this.explode(p.tx, p.tz, p.splash, p.dmg, p.src, false, p.k === 'bomblet' ? 'bomblet' : 'mortar');
            for (let i = 0; i < p.bomblets; i++) {
              const a = (i / p.bomblets) * Math.PI * 2 + this.rand() * 0.5, r = 0.6 + this.rand() * 0.7;
              this.projectiles.push({ k: 'bomblet', sx: p.tx, sz: p.tz, x: p.tx, y: 0.2, z: p.tz,
                tx: p.tx + Math.cos(a) * r, tz: p.tz + Math.sin(a) * r, t: 0, dur: 0.3 + this.rand() * 0.2, h: 0.8,
                dmg: p.dmg * 0.55, splash: p.splash * 0.7, bomblets: 0, well: 0, src: p.src });
            }
          }
        }
      } else {
        if (p.delay > 0) { p.delay -= dt; continue; }
        if (p.tgt && !p.tgt.dead) { p.tx = p.tgt.x; p.tz = p.tgt.z; } else p.tgt = null;
        const dx = p.tx - p.x, dy = 0.15 - p.y, dz = p.tz - p.z, L = Math.hypot(dx, dy, dz) || 1;
        const turn = Math.min(1, (p.k === 'nuke' ? 2.2 : 5) * dt * (1 + (5 - p.life)));
        p.vx += (dx / L * p.spd - p.vx) * turn; p.vy += (dy / L * p.spd - p.vy) * turn; p.vz += (dz / L * p.spd - p.vz) * turn;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
        if (L < 0.3 || p.y <= 0.05 || p.life <= 0) {
          p.done = true;
          this.explode(p.x, p.z, p.splash, p.dmg, p.src, false, p.k);
        }
      }
    }
    compact(this.projectiles, p => !p.done);

    if (this.pending.length) { for (const e of this.pending) this.enemies.push(e); this.pending.length = 0; }
    compact(this.enemies, e => !e.dead);

    // Wave cleared?
    if (this.waveActive && !this.spawning && !this.enemies.length) {
      this.waveActive = false;
      const bonus = 20 + this.wave * 4;
      this.credits += bonus;
      this.emit({ e: 'waveClear', wave: this.wave, bonus });
    }
    if (this.lives <= 0) { this.over = true; this.emit({ e: 'gameOver', wave: this.wave }); }
  }
}
