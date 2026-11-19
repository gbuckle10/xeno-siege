// Balance bot: plays Xeno Siege headlessly with a scripted build order and prints how it fares per wave.
// Usage: node tools/balance.mjs [seed]
import { Game, TOWERS, upgradeOptions } from '../js/game.js';

const PLAN = [
  ['gatling',4,4],['gatling',6,6],['mortar',3,8],['cryo',9,11],['gatling',9,8],['arc',11,10],['mortar',8,5],
  ['missile',12,6],['gatling',3,11],['cryo',14,5],['arc',14,9],['missile',16,8],['mortar',11,5],['gatling',19,9],
  ['arc',7,9],['missile',8,10],['cryo',16,5],['gatling',21,7],['mortar',13,8],['arc',3,6],['missile',17,7],
  ['gatling',1,9],['mortar',6,11],['arc',9,3],['missile',18,9],['cryo',4,8],
];
const BRANCH = { gatling: ['minigun','railgun'], mortar: ['cluster','singularity'], cryo: ['shatter','zero'], arc: ['storm','lance'], missile: ['hydra','nuke'] };

let seed = +(process.argv[2] || 1);
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const g = new Game({ rand });
let placed = 0;
const typeCount = {};

function spend() {
  for (let guard = 0; guard < 200; guard++) {
    const target = Math.min(PLAN.length, 3 + Math.floor(g.wave * 1.1));
    if (placed < target) {
      const [type, c, r] = PLAN[placed];
      if (g.credits < TOWERS[type].cost) return;
      const t = g.build(type, c, r); placed++;
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
let peak = 0;
const t0 = Date.now();
for (let w = 1; w <= 60 && !g.over; w++) {
  spend();
  g.launch();
  const lives0 = g.lives; let steps = 0; peak = 0;
  const ws = Date.now();
  while (g.waveActive && !g.over && steps < 60 * 400) {
    g.update(dt); g.events.length = 0; steps++;
    peak = Math.max(peak, g.enemies.length);
    if (steps % 300 === 0) spend();
  }
  const ms = Date.now() - ws;
  console.log(`wave ${String(w).padStart(2)} | shields ${String(g.lives).padStart(3)} (-${lives0 - g.lives}) | credits ${String(Math.floor(g.credits)).padStart(5)} | towers ${g.towers.length} lv[${g.towers.map(t=>t.lvl).join('')}] | peak aliens ${String(peak).padStart(4)} | ${(steps/60).toFixed(0)}s game, ${(ms/steps*1000).toFixed(0)}µs/tick`);
}
console.log(g.over ? `GAME OVER at wave ${g.wave}` : 'survived 60 waves', `| total ${((Date.now()-t0)/1000).toFixed(1)}s real`);
