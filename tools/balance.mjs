// Balance bot: plays Xeno Siege headlessly on each map and reports how far it gets.
// Usage: node tools/balance.mjs [mapId|all] [seed] [--verbose]
import { Game, TOWERS, MAP_IDS, upgradeOptions, getMap, TUNING } from '../js/game.js';

const ROTATION = ['gatling', 'mortar', 'cryo', 'gatling', 'arc', 'missile', 'mortar', 'gatling', 'arc', 'missile', 'cryo', 'mortar'];
const BRANCH = { gatling: ['minigun', 'railgun'], mortar: ['cluster', 'singularity'], cryo: ['shatter', 'zero'], arc: ['storm', 'lance'], missile: ['hydra', 'nuke'] };
const MAX_TOWERS = 90;

function run(mapId, seed, verbose) {
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new Game({ rand, map: mapId });
  // Greedy placement: each new tower goes where it adds the most coverage of lane + flight line not yet covered.
  const pts = [...g.map.pathTiles].map(k => { const [c, r] = k.split(',').map(Number); return { x: c + 0.5, z: r + 0.5, w: 1, cov: 0 }; });
  for (const f of g.map.flights) for (let k = 0; k <= f.len; k += 1) pts.push({ x: f.way[0].x + f.seg[0].ux * k, z: f.way[0].z + f.seg[0].uz * k, w: 0.6, cov: 0 });
  function nextSpot() {
    let best = null, bs = -1;
    for (let c = 0; c < g.map.cols; c++) for (let r = 0; r < g.map.rows; r++) {
      if (!g.canBuild(c, r)) continue;
      let sc = 0;
      for (const p of pts) if (Math.hypot(p.x - c - 0.5, p.z - r - 0.5) <= 3.2) sc += p.w / (1 + p.cov);
      if (sc > bs) { bs = sc; best = { c, r }; }
    }
    if (best) for (const p of pts) if (Math.hypot(p.x - best.c - 0.5, p.z - best.r - 0.5) <= 3.2) p.cov++;
    return best;
  }
  let placed = 0;
  const typeCount = {};

  function spend() {
    for (let guard = 0; guard < 200; guard++) {
      const target = Math.min(MAX_TOWERS, 3 + Math.floor(g.wave * 1.1) + (g.towers.every(t => t.lvl >= 4) ? 99 : 0));
      if (placed < target) {
        const type = ROTATION[placed % ROTATION.length];
        if (g.credits < TOWERS[type].cost) return;
        const s = nextSpot(); if (!s) return;
        const t = g.build(type, s.c, s.r); placed++;
        if (t) { typeCount[type] = (typeCount[type] || 0) + 1; t.pick = BRANCH[type][typeCount[type] % 2]; }
        continue;
      }
      const cands = g.towers.filter(t => t.lvl < 4 && t.busy <= 0)
        .map(t => ({ t, o: upgradeOptions(t).find(o => !o.branch || o.branch === t.pick) }))
        .filter(x => x.o).sort((a, b) => a.o.cost - b.o.cost);
      if (!cands.length || g.credits < cands[0].o.cost) return;
      g.upgrade(cands[0].t, cands[0].o);
    }
  }

  const dt = 1 / 60;
  let firstLeak = 0, peakAll = 0, lastWave = 0, lives0 = g.lives, steps = 0; const deep = {}; const leaks = {}; const leakWaves = new Set(); let prevLives = g.lives;
  spend(); g.launch();
  while (!g.over && g.wave <= 60 && steps < 60 * 60 * 60) {
    g.update(dt); for (const ev of g.events) if (ev.e === 'leak') leaks[ev.type] = (leaks[ev.type] || 0) + ev.dmg; g.events.length = 0; steps++;
    peakAll = Math.max(peakAll, g.enemies.length);
    if (steps % 30 === 0) for (const e of g.enemies) { const f = e.d / g.route(e).len; if (f > (deep[g.wave] || 0)) deep[g.wave] = f; }
    if (steps % 120 === 0) spend();
    if (!g.waveActive && !g.rules.autoWaves) { spend(); g.launch(); }
    if (!firstLeak && g.lives < lives0) firstLeak = g.wave;
    if (g.lives < prevLives) { leakWaves.add(g.wave); prevLives = g.lives; }
    if (verbose && g.wave !== lastWave) { lastWave = g.wave; console.log(`  t=${(steps / 60).toFixed(0)}s wave ${g.wave} | shields ${g.lives} | credits ${Math.floor(g.credits)} | towers ${g.towers.length} | alive ${g.enemies.length}`); }
  }
  if (verbose) console.log('  shield damage by alien:', JSON.stringify(leaks));
  const ws = Object.keys(deep).map(Number).filter(w => w >= 5 && w < (g.over ? g.wave : 99));
  const tense = ws.filter(w => deep[w] > 0.7).length / Math.max(1, ws.length);
  if (verbose) console.log('  deepest progress per wave:', ws.map(w => w + ':' + Math.round(deep[w] * 100)).join(' '));
  return { died: g.over ? g.wave : null, firstLeak, peak: peakAll, mins: steps / 3600, leakWaves: leakWaves.size, tense };
}

const [arg = 'all', seedArg = '1', flag] = process.argv.slice(2);
const hpArg = process.argv.find(a => a.startsWith('--hp='));
if (hpArg && arg !== 'all') getMap(arg).hpScale = +hpArg.slice(5);
const tuneArg = process.argv.find(a => a.startsWith('--tune='));
if (tuneArg) for (const kv of tuneArg.slice(7).split(',')) { const [k, v] = kv.split(':'); TUNING[k] = +v; }
const ids = arg === 'all' ? MAP_IDS : [arg];
for (const id of ids) {
  const res = [1, 2, 3].map(k => run(id, +seedArg * 7 + k, flag === '--verbose' && k === 1));
  const m = getMap(id);
  console.log(`${m.name.padEnd(12)} (${m.difficulty.padEnd(6)}) lanes ${m.paths.length}, length ${m.paths.map(p => p.len.toFixed(0)).join('/')} | ` +
    `first leak: ${res.map(r => r.firstLeak || '-').join(', ')} | waves w/ leaks: ${res.map(r => r.leakWaves).join(', ')} | tense waves: ${res.map(r => Math.round(r.tense * 100) + '%').join(', ')} | game over at wave: ${res.map(r => r.died || '60+').join(', ')} | peak ${Math.max(...res.map(r => r.peak))} | ${(res.reduce((a, r) => a + r.mins, 0) / 3).toFixed(0)} min`);
}
