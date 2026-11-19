// Xeno Siege — game simulation.
// Pure logic: no DOM, no Three.js. The browser game and tools/balance.mjs both use this file.
// World units: 1 unit = 1 tile. x runs left→right (columns), z runs top→bottom (rows).

export const START_LIVES = 100;

// ---------- Maps ----------
// Each lane is a list of [col, row] waypoints. The first point sits just outside the map (the rift),
// and every lane must end on the same tile (the base). Lanes may share tiles where they merge.
export const MAPS = [
  {
    id: 'spiral', name: 'The Spiral', difficulty: 'Easy', cols: 24, rows: 15, credits: 280, hpScale: 0.9, airMul: 0.5,
    desc: 'One very long lane that coils inward to a base at the centre. Plenty of time to shoot.',
    lanes: [[[-1,1],[22,1],[22,13],[1,13],[1,4],[19,4],[19,10],[4,10],[4,7],[12,7]]],
  },
  {
    id: 'valley', name: 'Rift Valley', difficulty: 'Normal', cols: 24, rows: 15, credits: 260, hpScale: 1.1,
    desc: 'A single winding lane through the valley. The classic.',
    lanes: [[[-1,2],[5,2],[5,7],[2,7],[2,12],[10,12],[10,4],[15,4],[15,10],[20,10],[20,6],[22,6]]],
  },
  {
    id: 'twin', name: 'Twin Rifts', difficulty: 'Hard', cols: 24, rows: 15, credits: 300, hpScale: 0.9,
    desc: 'Two rifts split the swarm into lanes that merge halfway. Cover both or get flanked.',
    lanes: [
      [[-1,2],[6,2],[6,6],[11,6],[11,7],[16,7],[16,2],[20,2],[20,12],[22,12]],
      [[-1,12],[6,12],[6,8],[11,8],[11,7],[16,7],[16,2],[20,2],[20,12],[22,12]],
    ],
  },
  {
    id: 'hive', name: 'Hive Breach', difficulty: 'Brutal', cols: 24, rows: 15, credits: 340, hpScale: 0.95,
    desc: 'Three rifts converge on a short run to your base. Only for veterans.',
    lanes: [
      [[8,-1],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
      [[-1,7],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
      [[8,15],[8,7],[13,7],[13,2],[18,2],[18,12],[22,12]],
    ],
  },
];

export function buildMap(def) {
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
  m.flights = [];
  m.base = def.base ? { x: def.base[0] + 0.5, z: def.base[1] + 0.5 }
    : m.paths.length ? m.paths[0].way[m.paths[0].way.length - 1] : null;
  if (m.base) for (const p of m.paths) {
    const a = p.way[0], b = m.base, l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    m.flights.push({ way: [a, b], seg: [{ a, b, len: l, start: 0, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l }], len: l });
  }
  return m;
}
const MAP_CACHE = new Map(MAPS.map(d => [d.id, buildMap(d)]));
export const getMap = id => (id && typeof id === 'object') ? id : (MAP_CACHE.get(id) || MAP_CACHE.get('valley'));
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
    // Flyers cut straight across: covering their flight lines matters too
    for (const f of map.flights || []) for (let k = 0; k <= f.len; k += 1) {
      const fx = f.way[0].x + f.seg[0].ux * k - 0.5, fz = f.way[0].z + f.seg[0].uz * k - 0.5;
      if (Math.hypot(fx - c, fz - r) <= range) score += 0.3;
    }
    out.push({ c, r, score });
  }
  return out.sort((a, b) => b.score - a.score || a.c - b.c || a.r - b.r);
}

// ---------- Towers ----------
// Each tower: base stats (level 1), l2 overrides, then two branches with a (level 3) and b (level 4 / Mk II) overrides.
export const TOWERS = {
  gatling: {
    name: 'Gatling Turret', key: '1', cost: 60, color: '#4df3c9', air: true,
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
    name: 'Plasma Mortar', key: '2', cost: 100, color: '#ff9f43', air: false,
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
    name: 'Cryo Field', key: '3', cost: 80, color: '#7cc7ff', air: false,
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
    name: 'Arc Coil', key: '4', cost: 140, color: '#c792ff', air: true,
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
    name: 'Missile Battery', key: '5', cost: 160, color: '#ff5c7a', air: true,
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
TOWERS.sunlance = {
  name: 'Sunlance', key: '6', cost: 220, color: '#ffe066', manual: true, air: true,
  desc: 'You aim it. A map-wide beam that burns through everything in a straight line. Long cooldown.',
  base: { kind: 'beam', rate: 9, dmg: 600, width: 0.45, range: 1.4 },
  l2:   { dmg: 1400, rate: 8 },
  branches: {
    prism: { name: 'Prism Splitter', cost: 330, cost2: 660,
      desc: 'Splits the beam into a fan of 3 beams (5 at Mk II). Rakes whole sections of the map.',
      a: { beams: 3, spread: 0.26, dmg: 2400, rate: 7.5 }, b: { beams: 5, spread: 0.22, dmg: 5500, rate: 6.5 } },
    scorch: { name: 'Scorch Line', cost: 350, cost2: 700,
      desc: 'The beam leaves a burning strip on the ground that keeps damaging anything that crosses it.',
      a: { dmg: 3200, burn: 600, burnTime: 4, width: 0.55, rate: 7.5 }, b: { dmg: 7500, burn: 1500, burnTime: 6, width: 0.6, rate: 6.5 } },
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

// ---------- Powers (paid for with Energy, which kills and wave clears generate) ----------
export const MAX_ENERGY = 100;
export const ENERGY_PER_REWARD = 0.35;   // energy per credit of kill reward
export const ENERGY_PER_WAVE = 8;
export const POWERS = {
  meteor:    { name: 'Meteor Shower',  key: 'z', icon: '☄', cost: 35, cd: 18, radius: 2.0, target: true, color: '#ff9f43',
               desc: 'A rain of meteors hammers a small area.' },
  orbital:   { name: 'Orbital Strike', key: 'x', icon: '⊕', cost: 50, cd: 30, radius: 1.1, target: true, color: '#fff1a8',
               desc: 'After a short charge, a beam from orbit obliterates one spot. Great against bosses.' },
  stasis:    { name: 'Stasis Field',   key: 'c', icon: '❄', cost: 35, cd: 25, radius: 2.5, target: true, color: '#7cc7ff',
               desc: 'Freezes every alien in an area for 4 seconds (bosses are only slowed).' },
  overdrive: { name: 'Overdrive',      key: 'v', icon: '⚡', cost: 60, cd: 45, target: false, color: '#c792ff',
               desc: 'All towers fire twice as fast for 8 seconds.' },
  repair:    { name: 'Repair Drones',  key: 'b', icon: '✚', cost: 70, cd: 60, target: false, color: '#4df3c9',
               desc: 'Restores 20 shields.' },
};
export const POWER_IDS = Object.keys(POWERS);

// ---------- Aliens ----------
export const ALIENS = {
  skitter: { name: 'Skitter',    hp: 14,   speed: 2.0,  reward: 0.65, dmg: 1,  r: 0.14, color: '#9cff57' },
  grunt:   { name: 'Grunt',      hp: 55,   speed: 1.2,  reward: 3.5, dmg: 2,  r: 0.22, color: '#57e3ff' },
  shell:   { name: 'Shellback',  hp: 230,  speed: 0.8,  reward: 10,  dmg: 5,  r: 0.30, armor: 6, color: '#ff6bd6' },
  brood:   { name: 'Brood Sac',  hp: 170,  speed: 0.9,  reward: 8,   dmg: 4,  r: 0.30, split: 8, color: '#c77dff' },
  wasp:    { name: 'Wasp',       hp: 15,   speed: 1.2,  reward: 2,   dmg: 2,  r: 0.18, air: true, color: '#ff7b4f' },
  warden:  { name: 'Warden',     hp: 130,  speed: 0.85, reward: 7,   dmg: 3,  r: 0.26, aura: 1.4, color: '#e8e2ff' },
  queen:   { name: 'Hive Queen', hp: 1800, speed: 0.75, reward: 150, dmg: 20, r: 0.60, armor: 4, boss: true, color: '#ffd166' },
};
// Alien toughness per wave. Polynomial growth tracks how fast a player's defences grow
// (so the pressure stays steady), with a small exponential term so every run ends eventually.
export const TUNING = { hpA: 0.03, hpB: 1.13, lateFrom: 14, lateB: 1.05 };
export const hpMult = w => (1 + TUNING.hpA * (w - 1)) * TUNING.hpB ** (w - 1) * TUNING.lateB ** Math.max(0, w - TUNING.lateFrom);
// Later waves get bigger and faster, not just tougher
export const countGrowth = w => 1 + 0.03 * (w - 1);
// Armor creeps up on the tougher aliens, so spamming many small hits stops being enough
export const armorGrowth = (type, w) => type === 'skitter' || type === 'wasp' ? 0 : Math.floor((w - 1) / (type === 'shell' || type === 'queen' ? 3 : 6));
export const speedGrowth = w => 1 + Math.min(0.4, 0.012 * (w - 1));

// ---------- Waves ----------
// A wave is a list of groups that spawn one after another: { type, n, gap (s between spawns), wait (s before the group) }.
// Rules let custom maps change how waves are built. Built-in maps use the defaults.
export const DEFAULT_RULES = {
  countMul: 1, hpMul: 1, speedMul: 1, credits: null, lives: 100,
  bossEvery: 10, swarmEvery: 5, winWave: 0, autoWaves: true,
  enabled: { skitter: true, grunt: true, wasp: true, shell: true, warden: true, brood: true, queen: true },
};
export const normalizeRules = r => ({ ...DEFAULT_RULES, ...(r || {}), enabled: { ...DEFAULT_RULES.enabled, ...((r && r.enabled) || {}) } });

export function buildWave(w, rules = DEFAULT_RULES) {
  const R = rules, on = R.enabled;
  const g = [];
  // maxDur squeezes big groups into a fixed window so late waves arrive as a flood, not a trickle.
  const add = (type, n, gap, maxDur, wait = 0.6) => {
    n = Math.round(n * (type === 'queen' ? 1 : R.countMul * countGrowth(w)));
    if (n > 0 && on[type]) g.push({ type, n, gap: Math.min(gap, maxDur / n), wait });
  };
  add('skitter', 18 + w * 9, 0.06, 6, 0);
  add('grunt', 3 + w * 1.7, 0.35, 9);
  if (w >= 4) add('wasp', 2 + w * 0.8 + Math.max(0, w - 10) * 0.6, 0.25, 6);
  if (w >= 4) add('shell', 1 + (w - 4) * 0.8 + Math.max(0, w - 12) * 0.4, 0.9, 9);
  if (w >= 5) add('warden', 1 + (w - 5) * 0.4, 1.0, 8);
  if (w >= 6) add('brood', (w - 4) * 0.5, 1.2, 9);
  if (R.swarmEvery && w % R.swarmEvery === 0) add('skitter', 20 + w * 16, 0.03, 5, 1);  // mega swarm
  add('skitter', 10 + w * 6, 0.08, 5);
  if (R.bossEvery && w % R.bossEvery === 0) add('queen', Math.max(1, Math.round(w / 10)), 4, 8, 1.5);  // boss wave
  if (!g.length) g.push({ type: 'skitter', n: Math.round((20 + w * 10) * R.countMul), gap: 0.06, wait: 0 });
  return g;
}
export function waveSummary(w, rules) {
  const counts = {};
  for (const g of buildWave(w, rules)) counts[g.type] = (counts[g.type] || 0) + g.n;
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
    this.setMap(opts.map || 'valley', opts.rules);
  }

  setMap(id, rules) {
    this.map = getMap(id);
    this.rules = normalizeRules(rules);
    this.grid = new Grid(this.map.cols, this.map.rows);
    this.reset();
  }

  reset() {
    Object.assign(this, {
      credits: this.rules.credits ?? this.map.credits, lives: this.rules.lives, maxLives: this.rules.lives, wave: 0, kills: 0, time: 0,
      enemies: [], pending: [], towers: [], projectiles: [], wells: [], events: [], burns: [], strikes: [],
      energy: 0, powerCd: {}, overdriveT: 0, won: false, nextIn: null, nextMax: 0,
      groups: [], gi: 0, gCount: 0, gTimer: 0, waveActive: false, over: false, uid: 0, spawnIdx: 0,
    });
    this.grid.clear();
  }

  get spawning() { return this.gi < this.groups.length; }
  emit(ev) { if (this.events.length < 4000) this.events.push(ev); }

  // ----- Enemies -----
  spawnEnemy(type, d = 0, off = null, pi = null) {
    const a = ALIENS[type], w = Math.max(1, this.wave);
    const hp = Math.round(a.hp * (a.boss ? hpMult(w) ** 0.88 : hpMult(w)) * this.map.hpScale * this.rules.hpMul);
    const e = {
      id: ++this.uid, type, hp, max: hp, d, pi: pi ?? (this.spawnIdx++ % Math.max(1, this.map.paths.length)),
      speed: a.speed * this.rules.speedMul * speedGrowth(w) * (0.92 + this.rand() * 0.16), armor: (a.armor || 0) + armorGrowth(type, w),
      reward: a.reward * (1 + 0.02 * (w - 1)) / Math.sqrt(countGrowth(w)), dmg: a.dmg,
      off: off ?? (a.boss ? 0 : (this.rand() - 0.5) * (a.air ? 1.6 : 0.72)), air: !!a.air, shielded: false,
      x: 0, z: 0, dx: 1, dz: 0, si: 0,
      slowT: 0, slowAmt: 0, freezeT: 0, brittleT: 0, brittle: 0, hit: 0, wellMul: 1,
      anim: this.rand() * 10, dead: false,
    };
    this.placeEnemy(e);
    this.pending.push(e);
    return e;
  }

  // Position on the lane plus a sideways offset, blended smoothly around corners.
  route(e) { return e.air ? this.map.flights[e.pi] : this.map.paths[e.pi]; }
  placeEnemy(e) {
    const SEG = this.route(e).seg;
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
    if (e.shielded) d *= 0.5;
    e.hp -= d; e.hit = 0.06;
    if (src) src.dmgDone += d;
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.dead = true;
    this.credits += e.reward; this.kills++;
    if (!this.demo) this.energy = Math.min(MAX_ENERGY, this.energy + e.reward * ENERGY_PER_REWARD);
    if (src) src.kills++;
    this.emit({ e: 'death', type: e.type, x: e.x, z: e.z, reward: e.reward });
    const a = ALIENS[e.type];
    if (a.split) for (let i = 0; i < a.split; i++) this.spawnEnemy('skitter', Math.max(0, e.d - this.rand() * 0.6), (this.rand() - 0.5) * 0.72, e.pi);
    if (a.boss) this.emit({ e: 'bossDown', x: e.x, z: e.z, reward: e.reward });
  }

  explode(x, z, r, dmg, src, pierce, kind) {
    const groundOnly = kind === 'mortar' || kind === 'bomblet' || kind === 'singularity';
    for (const e of this.grid.query(x, z, r, this._q2)) if (!(groundOnly && e.air)) this.damage(e, dmg, pierce, src);
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
    if (!TOWERS[t.type].air) compact(list, e => !e.air);
    if (!list.length) return false;
    const aim = e => { t.yaw = Math.atan2(e.z - t.z, e.x - t.x); };

    if (s.kind === 'bullet') {
      const e = s.spread > 1 ? list[(this.rand() * list.length) | 0] : first(list);
      aim(e); this.damage(e, s.dmg, false, t);
      this.emit({ e: 'bullet', tid: t.id, x: e.x, z: e.z, r: ALIENS[e.type].r, air: e.air });
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
      const path = this.route(tg);
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

  // ----- Sunlance: player-aimed, map-wide beam -----
  beamReady(t) { return t && t.s.kind === 'beam' && t.busy <= 0 && t.cd <= 0; }
  fireBeam(t, angle) {
    if (!this.beamReady(t) || this.over) return false;
    const s = t.s, n = s.beams || 1, lines = [];
    for (let i = 0; i < n; i++) {
      const a = angle + (n > 1 ? (i - (n - 1) / 2) * s.spread : 0);
      const ux = Math.cos(a), uz = Math.sin(a);
      // Run until the beam leaves the map (plus a margin)
      let L = 60;
      const m = this.map;
      if (ux > 1e-6) L = Math.min(L, (m.cols + 1 - t.x) / ux); else if (ux < -1e-6) L = Math.min(L, (-1 - t.x) / ux);
      if (uz > 1e-6) L = Math.min(L, (m.rows + 1 - t.z) / uz); else if (uz < -1e-6) L = Math.min(L, (-1 - t.z) / uz);
      const x2 = t.x + ux * L, z2 = t.z + uz * L;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const px = e.x - t.x, pz = e.z - t.z, along = px * ux + pz * uz;
        if (along < 0 || along > L) continue;
        if (Math.abs(px * uz - pz * ux) <= s.width + ALIENS[e.type].r * 0.5) this.damage(e, s.dmg, true, t);
      }
      if (s.burn) this.burns.push({ x1: t.x, z1: t.z, x2, z2, w: s.width, dps: s.burn, t: s.burnTime, max: s.burnTime, src: t });
      lines.push([t.x, t.z, x2, z2]);
    }
    t.yaw = angle; t.aim = angle; t.fireT = this.time; t.cd = s.rate;
    this.emit({ e: 'beam', tid: t.id, lines, width: s.width, scorch: !!s.burn });
    return true;
  }

  // ----- Powers -----
  powerHp() { return hpMult(Math.max(1, this.wave)) * this.map.hpScale * this.rules.hpMul; }
  canCast(id) { const P = POWERS[id]; return !!P && !this.over && this.energy >= P.cost && !(this.powerCd[id] > 0); }
  castPower(id, x, z) {
    if (!this.canCast(id)) return false;
    const P = POWERS[id], k = this.powerHp();
    this.energy -= P.cost; this.powerCd[id] = P.cd;
    if (id === 'meteor') {
      for (let i = 0; i < 14; i++) {
        const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * P.radius;
        const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        this.projectiles.push({ k: 'meteor', sx: tx - 3 + this.rand(), sy: 13, sz: tz - 5, x: tx, y: 13, z: tz, tx, tz,
          t: 0, dur: 0.7, delay: i * 0.13 + this.rand() * 0.1, dmg: 45 * k, splash: 0.75, src: null });
      }
    } else if (id === 'orbital') {
      this.strikes.push({ x, z, r: P.radius, t: 1.2, dmg: 1200 * k });
      this.emit({ e: 'orbitalCharge', x, z, r: P.radius, t: 1.2 });
    } else if (id === 'stasis') {
      for (const e of this.grid.query(x, z, P.radius, this._q2)) {
        if (ALIENS[e.type].boss) { e.slowT = 4; e.slowAmt = Math.max(e.slowAmt, 0.6); } else e.freezeT = 4;
      }
      this.emit({ e: 'stasis', x, z, r: P.radius });
    } else if (id === 'overdrive') {
      this.overdriveT = 8;
      this.emit({ e: 'overdrive' });
    } else if (id === 'repair') {
      const before = this.lives;
      this.lives = Math.min(this.maxLives, this.lives + 20);
      this.emit({ e: 'repair', amount: this.lives - before });
    }
    this.emit({ e: 'power', id, x, z });
    return true;
  }

  // ----- Waves -----
  earlyBonus() {
    if (!this.waveActive && this.nextIn === null) return 0;
    const frac = this.nextIn !== null && this.nextMax ? this.nextIn / this.nextMax : 1;
    return Math.round((8 + this.wave * 3) * frac);
  }
  launch(auto = false) {
    if (this.over || this.spawning) return false;
    if (!auto && this.wave > 0) {
      const b = this.earlyBonus();
      if (b > 0) { this.credits += b; this.emit({ e: 'early', amount: b }); }
    }
    this.nextIn = null;
    this.wave++;
    this.groups = buildWave(this.wave, this.rules);
    const air = this.map.airMul ?? 1;   // some maps get fewer flyers
    if (air !== 1) for (const g of this.groups) if (ALIENS[g.type].air) { g.n = Math.max(1, Math.round(g.n * air)); }
    this.gi = 0; this.gCount = 0; this.gTimer = 0.2;
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

    // Wardens shield the aliens around them
    for (const e of this.enemies) e.shielded = false;
    for (const e of this.enemies) {
      const aura = ALIENS[e.type].aura;
      if (!aura || e.dead) continue;
      for (const o of this.grid.query(e.x, e.z, aura, this._q2)) if (o !== e && o.type !== 'warden') o.shielded = true;
    }

    // Wave timer: once a wave has fully arrived, the next one launches on its own
    if (this.rules.autoWaves && !this.demo && this.wave > 0 && !this.spawning && !(this.rules.winWave && this.wave >= this.rules.winWave)) {
      if (this.nextIn === null) { this.nextMax = Math.max(10, 30 - this.wave * 0.75); this.nextIn = this.nextMax; }
      this.nextIn -= dt;
      if (this.nextIn <= 0) this.launch(true);
    }

    // Power cooldowns and timed effects
    for (const k in this.powerCd) if (this.powerCd[k] > 0) this.powerCd[k] -= dt;
    if (this.overdriveT > 0) this.overdriveT -= dt;
    for (const st of this.strikes) {
      st.t -= dt;
      if (st.t <= 0) { st.done = true; this.explode(st.x, st.z, st.r, st.dmg, null, true, 'orbital'); }
    }
    compact(this.strikes, st => !st.done);

    // Gravity wells hold aliens in place
    for (const w of this.wells) {
      w.t -= dt;
      for (const e of this.grid.query(w.x, w.z, w.r, this._q2)) if (!e.air) e.wellMul = ALIENS[e.type].boss ? 0.5 : 0.08;
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
      if (e.d >= this.route(e).len) {
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
      const rateMul = this.overdriveT > 0 ? 2 : 1;
      if (t.s.kind === 'lance') { this.lance(t, dt * rateMul); continue; }
      if (t.s.kind === 'beam') {
        if (t.cd > 0) t.cd -= dt * rateMul;
        if (t.cd <= 0 && t.auto && t.aim !== undefined && this.enemies.length) this.fireBeam(t, t.aim);
        continue;
      }
      t.cd -= dt * rateMul;
      let guard = 0;
      while (t.cd <= 0 && guard++ < 6) {
        if (!this.fire(t)) { t.cd = 0; break; }
        t.cd += t.s.rate;
      }
    }

    // Burning ground left by Scorch Line beams
    for (const b of this.burns) {
      b.t -= dt;
      if (b.t <= 0) { b.done = true; continue; }
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1, L2 = dx * dx + dz * dz || 1;
      for (const e of this.enemies) {
        if (e.dead || e.air) continue;
        const k = Math.max(0, Math.min(1, ((e.x - b.x1) * dx + (e.z - b.z1) * dz) / L2));
        const ex = b.x1 + dx * k - e.x, ez = b.z1 + dz * k - e.z;
        if (ex * ex + ez * ez <= b.w * b.w) this.damage(e, b.dps * dt, true, b.src);
      }
    }
    compact(this.burns, b => !b.done);

    // Projectiles
    for (const p of this.projectiles) {
      if (p.k === 'meteor') {
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy * (1 - k) + 0.1; p.z = p.sz + (p.tz - p.sz) * k;
        if (k >= 1) { p.done = true; this.explode(p.tx, p.tz, p.splash, p.dmg, null, true, 'meteor'); }
      } else if (p.k === 'shell' || p.k === 'void' || p.k === 'bomblet') {
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
        const ty = p.tgt && p.tgt.air ? 1.0 : 0.15;
        const dx = p.tx - p.x, dy = ty - p.y, dz = p.tz - p.z, L = Math.hypot(dx, dy, dz) || 1;
        const turn = Math.min(1, (p.k === 'nuke' ? 2.2 : 5) * dt * (1 + (5 - p.life)));
        p.vx += (dx / L * p.spd - p.vx) * turn; p.vy += (dy / L * p.spd - p.vy) * turn; p.vz += (dz / L * p.spd - p.vz) * turn;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
        if (L < 0.3 || (p.y <= 0.05 && ty < 0.5) || p.life <= 0) {
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
      if (!this.demo) this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_PER_WAVE);
      this.emit({ e: 'waveClear', wave: this.wave, bonus });
      if (this.rules.winWave && this.wave >= this.rules.winWave && !this.demo) {
        this.over = true; this.won = true;
        this.emit({ e: 'victory', wave: this.wave });
      }
    }
    if (this.lives <= 0 && !this.over) { this.over = true; this.emit({ e: 'gameOver', wave: this.wave }); }
  }
}
