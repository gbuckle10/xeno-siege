// Balance bot: plays Xeno Siege headlessly on each map and reports how far it gets.
// Usage: node tools/balance.mjs [mapId|all] [seed] [--verbose]
import { Game, TOWERS, MAP_IDS, upgradeOptions, rankBuildSpots, getMap } from '../js/game.js';

const ROTATION = ['gatling', 'mortar', 'cryo', 'gatling', 'arc', 'missile', 'mortar', 'gatling', 'arc', 'missile', 'cryo', 'mortar'];
const BRANCH = { gatling: ['minigun', 'railgun'], mortar: ['cluster', 'singularity'], cryo: ['shatter', 'zero'], arc: ['storm', 'lance'], missile: ['hydra', 'nuke'] };
const MAX_TOWERS = 26;

function run(mapId, seed, verbose) {
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new Game({ rand, map: mapId });
  const spots = rankBuildSpots(g.map, 3.2);
  let placed = 0, si = 0;
  const typeCount = {};

  function spend() {
    for (let guard = 0; guard < 200; guard++) {
      const target = Math.min(MAX_TOWERS, 3 + Math.floor(g.wave * 1.1));
      if (placed < target) {
        const type = ROTATION[placed % ROTATION.length];
        if (g.credits < TOWERS[type].cost) return;
        while (si < spots.length && !g.canBuild(spots[si].c, spots[si].r)) si++;
        const s = spots[si++]; if (!s) return;
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
  let firstLeak = 0, peakAll = 0;
  for (let w = 1; w <= 60 && !g.over; w++) {
    spend(); g.launch();
    const lives0 = g.lives; let steps = 0, peak = 0;
    while (g.waveActive && !g.over && steps < 60 * 500) {
      g.update(dt); g.events.length = 0; steps++;
      peak = Math.max(peak, g.enemies.length);
      if (steps % 300 === 0) spend();
    }
    peakAll = Math.max(peakAll, peak);
    if (!firstLeak && g.lives < lives0) firstLeak = w;
    if (verbose) console.log(`  wave ${String(w).padStart(2)} | shields ${String(g.lives).padStart(3)} (-${lives0 - g.lives}) | credits ${String(Math.floor(g.credits)).padStart(5)} | towers ${g.towers.length} | peak ${peak} | ${(steps / 60).toFixed(0)}s`);
  }
  return { died: g.over ? g.wave : null, firstLeak, peak: peakAll };
}

const [arg = 'all', seedArg = '1', flag] = process.argv.slice(2);
const hpArg = process.argv.find(a => a.startsWith('--hp='));
if (hpArg && arg !== 'all') getMap(arg).hpScale = +hpArg.slice(5);
const ids = arg === 'all' ? MAP_IDS : [arg];
for (const id of ids) {
  const res = [1, 2, 3].map(k => run(id, +seedArg * 7 + k, flag === '--verbose' && k === 1));
  const m = getMap(id);
  console.log(`${m.name.padEnd(12)} (${m.difficulty.padEnd(6)}) lanes ${m.paths.length}, length ${m.paths.map(p => p.len.toFixed(0)).join('/')} | ` +
    `first leak: ${res.map(r => r.firstLeak || '-').join(', ')} | game over at wave: ${res.map(r => r.died || '60+').join(', ')} | peak aliens ${Math.max(...res.map(r => r.peak))}`);
}
