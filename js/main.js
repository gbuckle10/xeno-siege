// Glue: home screen, game loop, input (mouse + touch), side panel UI, menus, install prompt.
import { Game, TOWERS, TOWER_TYPES, ALIENS, MAPS, getMap, rankBuildSpots, upgradeOptions, towerName, sellValue, waveSummary } from './game.js';
import { View } from './view.js';

const $ = id => document.getElementById(id);
const game = new Game({ map: 'spiral' });
const canvas = $('game');
let view;
try {
  view = new View(canvas, game);
} catch (err) {
  document.body.classList.remove('home');
  $('card').innerHTML = '<h2 class="bad">NO 3D SUPPORT</h2><p>This browser or device could not start WebGL, which the game needs. Try a recent Chrome, Edge, Firefox or Safari.</p>';
  $('overlay').classList.remove('hidden');
  throw err;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const ui = { mode: 'home', build: null, selected: null, hover: null, speed: 1, paused: false, shift: false };
let selectedMap = store.get('xenoSiegeMap', 'spiral');
if (!MAPS.some(m => m.id === selectedMap)) selectedMap = 'spiral';
const bestKey = id => 'xenoSiegeBest:' + id;

// ---------- Graphics quality ----------
let quality = store.get('xenoSiegeGfx', matchMedia('(pointer: coarse)').matches ? 'low' : 'high');
view.setQuality(quality);
function toggleQuality() {
  quality = quality === 'high' ? 'low' : 'high';
  view.setQuality(quality);
  store.set('xenoSiegeGfx', quality);
}
$('quality').onclick = toggleQuality;
$('gfxHome').onclick = toggleQuality;

new ResizeObserver(() => view.resize()).observe($('stage'));

// ---------- Home screen ----------
function drawMiniMap(cv, map) {
  const W = cv.width = 192, H = cv.height = 120, g = cv.getContext('2d');
  const k = Math.min(W / (map.cols + 1), H / (map.rows + 1)), ox = (W - map.cols * k) / 2, oz = (H - map.rows * k) / 2;
  g.fillStyle = '#070c18'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#101a30';
  for (let c = 0; c < map.cols; c++) for (let r = 0; r < map.rows; r++) if (!map.pathTiles.has(c + ',' + r)) g.fillRect(ox + c * k + 0.6, oz + r * k + 0.6, k - 1.2, k - 1.2);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, col] of [[k * 0.95, 'rgba(77,243,201,0.25)'], [k * 0.3, '#4df3c9']]) {
    g.strokeStyle = col; g.lineWidth = w;
    for (const p of map.paths) { g.beginPath(); p.way.forEach((pt, i) => i ? g.lineTo(ox + pt.x * k, oz + pt.z * k) : g.moveTo(ox + pt.x * k, oz + pt.z * k)); g.stroke(); }
  }
  for (const p of map.paths) {
    const a = p.way[0], b = p.way[1], L = Math.hypot(b.x - a.x, b.z - a.z);
    g.fillStyle = '#9cff57'; g.shadowColor = '#9cff57'; g.shadowBlur = 8;
    g.beginPath(); g.arc(ox + (a.x + (b.x - a.x) / L * 0.6) * k, oz + (a.z + (b.z - a.z) / L * 0.6) * k, k * 0.6, 0, 7); g.fill();
  }
  g.fillStyle = '#4df3c9'; g.shadowColor = '#4df3c9';
  g.beginPath(); g.arc(ox + map.base.x * k, oz + map.base.z * k, k * 0.75, 0, 7); g.fill();
  g.shadowBlur = 0;
}
function renderMapList() {
  const list = $('mapList');
  list.innerHTML = '';
  for (const def of MAPS) {
    const map = getMap(def.id), best = +store.get(bestKey(def.id), 0);
    const b = document.createElement('button');
    b.className = 'mapCard' + (def.id === selectedMap ? ' sel' : '');
    b.innerHTML = `<canvas></canvas><div><div class="mn">${def.name} <span class="chip d-${def.difficulty}">${def.difficulty}</span></div>
      <div class="md">${def.desc}</div><div class="mb">${best ? `Best: survived ${best} wave${best === 1 ? '' : 's'}` : (def.lanes.length > 1 ? def.lanes.length + ' rifts' : 'Not played yet')}</div></div>`;
    drawMiniMap(b.querySelector('canvas'), map);
    b.onclick = () => {
      if (selectedMap === def.id) { play(); return; }
      selectedMap = def.id; store.set('xenoSiegeMap', def.id);
      for (const c of list.children) c.classList.toggle('sel', c === b);
      $('playBtn').textContent = 'PLAY — ' + def.name.toUpperCase();
      startDemo();
    };
    list.appendChild(b);
  }
  $('playBtn').textContent = 'PLAY — ' + getMap(selectedMap).name.toUpperCase();
}
$('playBtn').onclick = () => play();
$('howBtn').onclick = () => $('howPanel').classList.toggle('hidden');

// A live battle behind the home screen: maxed-out towers vs. an endless swarm.
const DEMO_TYPES = [['gatling', 'minigun'], ['mortar', 'cluster'], ['arc', 'storm'], ['missile', 'hydra'], ['cryo', 'shatter'], ['gatling', 'railgun'],
  ['mortar', 'singularity'], ['arc', 'lance'], ['missile', 'nuke'], ['gatling', 'minigun'], ['arc', 'storm'], ['cryo', 'zero']];
function startDemo() {
  game.setMap(selectedMap);
  game.demo = true;
  view.loadMap(game.map);
  game.credits = 1e9;
  const spots = rankBuildSpots(game.map, 3.2);
  let n = 0;
  for (const s of spots) {
    if (n >= DEMO_TYPES.length) break;
    if (!game.canBuild(s.c, s.r) || game.towers.some(t => Math.abs(t.c - s.c) + Math.abs(t.r - s.r) < 2)) continue;
    const [type, br] = DEMO_TYPES[n++];
    const t = game.build(type, s.c, s.r);
    for (const lvl of [2, 3, 4]) { game.upgrade(t, { ...upgradeOptions(t).find(o => !o.branch || o.branch === br), cost: 0 }); t.busy = 0; }
  }
  game.events.length = 0;
  game.wave = 7; game.launch(); game.events.length = 0;
}

function showHome() {
  ui.mode = 'home'; ui.build = null; ui.selected = null; ui.paused = false; ui.speed = 1;
  hideOverlay();
  document.body.classList.add('home');
  renderMapList();
  startDemo();
  updateHomeInset();
}
// Frame the demo battle in the part of the screen the home menu doesn't cover.
function updateHomeInset() {
  if (ui.mode !== 'home') { view.setInset(0, 0); return; }
  const col = document.querySelector('.homeCol').getBoundingClientRect(), stage = canvas.getBoundingClientRect();
  if (col.width >= stage.width * 0.9) view.setInset(0, Math.max(0, stage.bottom - col.top));
  else view.setInset(Math.max(0, col.right - stage.left), 0);
  view.resetCamera();
}
window.addEventListener('resize', () => requestAnimationFrame(updateHomeInset));

function play() {
  ui.mode = 'game'; ui.build = null; ui.selected = null; ui.paused = false; ui.speed = 1;
  document.body.classList.remove('home');
  hideOverlay();
  view.setInset(0, 0);
  game.setMap(selectedMap);
  game.demo = false;
  view.loadMap(game.map);
  setText('mapName', `${game.map.name} · ${game.map.difficulty}`);
  banner(game.map.name.toUpperCase(), '#4df3c9');
  canvas.focus({ preventScroll: true });
}

// ---------- Build buttons ----------
const tb = $('towerBtns');
for (const type of TOWER_TYPES) {
  const d = TOWERS[type];
  const b = document.createElement('button');
  b.className = 'tbtn'; b.dataset.type = type; b.title = d.name + ' — ' + d.desc;
  let icon = '';
  try { icon = View.towerIcon(type); } catch (e) {}
  b.innerHTML = `<img alt="" src="${icon}"><div><div class="nm">${d.name}</div><div class="cs">◆ ${d.cost}<span class="ky">key ${d.key}</span></div></div>`;
  b.onclick = () => setBuild(type);
  tb.appendChild(b);
}
function setBuild(type) {
  ui.build = ui.build === type ? null : type;
  if (ui.build) ui.selected = null;
}

// ---------- Actions ----------
const playing = () => ui.mode === 'game' && !game.over;
function launch() { if (playing()) game.launch(); }
function doUpgrade(i) {
  const t = ui.selected; if (!t) return;
  const opt = upgradeOptions(t)[i ?? 0];
  if (opt) game.upgrade(t, opt);
}
function doSell() { if (ui.selected) { game.sell(ui.selected); ui.selected = null; } }

$('launch').onclick = launch;
$('speed').onclick = () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; };
$('pause').onclick = () => { if (playing()) ui.paused = !ui.paused; };
$('menuBtn').onclick = () => showMenu();
$('zoomIn').onclick = () => { const r = canvas.getBoundingClientRect(); view.zoomAt(0.8, r.left + r.width / 2, r.top + r.height / 2); };
$('zoomOut').onclick = () => { const r = canvas.getBoundingClientRect(); view.zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2); };
$('recenter').onclick = () => view.resetCamera();
$('info').addEventListener('click', ev => {
  const a = ev.target.closest('[data-act]'); if (!a || a.disabled) return;
  if (a.dataset.act === 'up') doUpgrade(+a.dataset.i || 0);
  if (a.dataset.act === 'sell') doSell();
});

// ---------- Pointer input: tap = act, drag = pan, pinch / wheel = zoom ----------
const pointers = new Map();
let gesture = null;
const pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function updateHover(x, y) {
  if (ui.mode !== 'game') { ui.hover = null; return; }
  const t = view.tileAt(x, y), m = game.map;
  ui.hover = t && t.c >= 0 && t.r >= 0 && t.c < m.cols && t.r < m.rows ? { c: t.c, r: t.r } : null;
}
function tap(x, y) {
  updateHover(x, y);
  if (!playing() || ui.paused) return;
  if (!ui.hover) { ui.selected = null; return; }
  const { c, r } = ui.hover;
  const existing = game.towerAt(c, r);
  if (ui.build) {
    if (existing) { ui.build = null; ui.selected = existing; return; }
    if (game.build(ui.build, c, r) && !ui.shift) ui.build = null;
    return;
  }
  ui.selected = existing;
}
canvas.addEventListener('pointerdown', ev => {
  canvas.focus({ preventScroll: true });
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, button: ev.button });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d0: pdist(a, b), dist0: view.cam.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  } else if (pointers.size === 1) {
    gesture = { type: ev.button === 0 ? 'tap' : 'pan', button: ev.button };
  }
});
canvas.addEventListener('pointermove', ev => {
  const p = pointers.get(ev.pointerId);
  if (ev.pointerType === 'mouse') updateHover(ev.clientX, ev.clientY);
  if (!p) return;
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  p.x = ev.clientX; p.y = ev.clientY;
  if (gesture && gesture.type === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    view.cam.dist = gesture.dist0 * gesture.d0 / Math.max(10, pdist(a, b));
    view.cam.userZoomed = true; view.clampCam();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.panPixels(mx - gesture.mx, my - gesture.my);
    gesture.mx = mx; gesture.my = my;
    return;
  }
  if (gesture && gesture.type === 'tap' && Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) > 9) gesture.type = 'pan';
  if (gesture && gesture.type === 'pan') view.panPixels(dx, dy);
});
function endPointer(ev, cancelled) {
  const p = pointers.get(ev.pointerId);
  pointers.delete(ev.pointerId);
  if (!cancelled && p && gesture && gesture.type === 'tap' && pointers.size === 0 && p.button === 0) tap(ev.clientX, ev.clientY);
  if (pointers.size === 0) gesture = null;
  else if (gesture && gesture.type === 'pinch') gesture = { type: 'pan' };
}
canvas.addEventListener('pointerup', ev => endPointer(ev, false));
canvas.addEventListener('pointercancel', ev => endPointer(ev, true));
canvas.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse' && !pointers.size) ui.hover = null; });
canvas.addEventListener('wheel', ev => { ev.preventDefault(); view.zoomAt(Math.exp(ev.deltaY * 0.0012), ev.clientX, ev.clientY); }, { passive: false });
canvas.addEventListener('contextmenu', ev => { ev.preventDefault(); if (gesture && gesture.type === 'pan') return; ui.build = null; ui.selected = null; });

// ---------- Keyboard ----------
const keysDown = new Set();
window.addEventListener('keydown', ev => {
  if (ev.key === 'Shift') ui.shift = true;
  keysDown.add(ev.key.toLowerCase());
  if (ui.mode === 'home') { if (ev.key === 'Enter') play(); return; }
  if (ev.key === 'Escape') {
    if (!$('overlay').classList.contains('hidden') && !game.over) { resume(); return; }
    if (ui.build || ui.selected) { ui.build = null; ui.selected = null; return; }
    if (!game.over) showMenu();
    return;
  }
  if (!playing() || ui.paused) return;
  const t = TOWER_TYPES.find(k => TOWERS[k].key === ev.key);
  if (t) { setBuild(t); return; }
  if (ev.code === 'Space') { ev.preventDefault(); launch(); }
  else if (ev.key === 'p' || ev.key === 'P') ui.paused = !ui.paused;
  else if ((ev.key === 'u' || ev.key === 'U') && ui.selected && upgradeOptions(ui.selected).length === 1) doUpgrade(0);
  else if (ev.key === '+' || ev.key === '=') view.zoomAt(0.85, innerWidth / 2, innerHeight / 2);
  else if (ev.key === '-') view.zoomAt(1.18, innerWidth / 2, innerHeight / 2);
});
window.addEventListener('keyup', ev => { if (ev.key === 'Shift') ui.shift = false; keysDown.delete(ev.key.toLowerCase()); });
window.addEventListener('blur', () => { keysDown.clear(); ui.shift = false; });
function keyPan(dt) {
  if (ui.mode !== 'game') return;
  const s = 700 * dt;
  let dx = 0, dy = 0;
  if (keysDown.has('arrowleft') || keysDown.has('a')) dx += s;
  if (keysDown.has('arrowright') || keysDown.has('d')) dx -= s;
  if (keysDown.has('arrowup') || keysDown.has('w')) dy += s;
  if (keysDown.has('arrowdown') || keysDown.has('s')) dy -= s;
  if (dx || dy) view.panPixels(dx, dy);
}

// ---------- Floating text + banner ----------
const floats = [];
function floatText(x, y, z, text, color = '#ffd166', life = 1.3) {
  const el = document.createElement('div');
  el.className = 'fl'; el.textContent = text; el.style.color = color;
  $('floats').appendChild(el);
  floats.push({ el, x, y, z, life, max: life });
}
function updateFloats(dt) {
  for (const f of floats) {
    f.life -= dt; f.y += dt * 0.5;
    const p = view.toScreen(f.x, f.y, f.z);
    f.el.style.left = p.x + 'px'; f.el.style.top = p.y + 'px';
    f.el.style.opacity = Math.min(1, f.life / 0.4);
    if (f.life <= 0) f.el.remove();
  }
  for (let i = floats.length - 1; i >= 0; i--) if (floats[i].life <= 0) floats.splice(i, 1);
}
function banner(text, color = '#4df3c9') {
  const b = $('banner');
  b.textContent = text; b.style.color = color;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
view.onFlash = () => { if (ui.mode !== 'game') return; const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

function handleUIEvents(events) {
  if (ui.mode !== 'game') return;
  let leaked = 0;
  for (const ev of events) {
    switch (ev.e) {
      case 'waveStart':
        if (ev.boss) banner(`WAVE ${ev.wave} — HIVE QUEEN INBOUND`, '#ffd166');
        else if (ev.swarm) banner(`WAVE ${ev.wave} — MEGA SWARM`, '#9cff57');
        else banner(`WAVE ${ev.wave}`);
        break;
      case 'waveClear': banner(`WAVE ${ev.wave} CLEARED  +${ev.bonus}`); break;
      case 'early': {
        const p = view.portals[0];
        floatText(Math.max(0.5, p.x), 1, Math.max(0.5, p.z), `Early call +${ev.amount}`, '#4df3c9', 1.6);
        break;
      }
      case 'leak': leaked += ev.dmg; break;
      case 'bossDown':
        banner('HIVE QUEEN DOWN', '#ffd166');
        floatText(ev.x, 1.2, ev.z, `+${Math.floor(ev.reward)}`, '#ffd166', 2);
        break;
      case 'upgraded': {
        const t = game.towers.find(x => x.id === ev.tid);
        if (t) floatText(t.x, 1.1, t.z, towerName(t) + (t.lvl === 2 ? ' Lv 2' : '') + ' online', TOWERS[t.type].color, 1.6);
        break;
      }
      case 'sell': floatText(ev.x, 0.9, ev.z, `+${ev.value}`, '#ffd166'); break;
      case 'gameOver': showGameOver(); break;
    }
  }
  if (leaked) floatText(game.map.base.x, 1.5, game.map.base.z, `-${leaked} shields`, '#ff5c7a', 1.4);
}

// ---------- Menus ----------
function showOverlay(html) { $('card').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
function resume() { hideOverlay(); ui.paused = false; }
function showMenu() {
  if (ui.mode !== 'game' || game.over) return;
  ui.paused = true;
  showOverlay(`<h2>PAUSED</h2><p class="muted">${game.map.name} · wave ${game.wave}</p>
    <div class="menuBtns">
      <button class="b primary" id="mResume">RESUME</button>
      <button class="b" id="mRestart">Restart this map</button>
      <button class="b" id="mGfx">Graphics: ${quality === 'high' ? 'High' : 'Low'}</button>
      <button class="b sell" id="mHome">Quit to home screen</button>
    </div>`);
  $('mResume').onclick = resume;
  $('mRestart').onclick = () => play();
  $('mGfx').onclick = () => { toggleQuality(); $('mGfx').textContent = 'Graphics: ' + (quality === 'high' ? 'High' : 'Low'); };
  $('mHome').onclick = () => showHome();
}
function showGameOver() {
  const survived = Math.max(0, game.wave - 1), key = bestKey(game.map.id);
  const prev = +store.get(key, 0), isBest = survived > prev;
  if (isBest) store.set(key, survived);
  showOverlay(`<h2 class="bad">BASE OVERRUN</h2>
    <p>${game.map.name}: you held out to wave <b>${game.wave}</b> and vaporized <b>${game.kills.toLocaleString()}</b> aliens.</p>
    <p style="color:${isBest ? 'var(--gold)' : 'var(--dim)'}">${isBest ? 'New best on this map!' : `Best on this map: survived ${prev} wave${prev === 1 ? '' : 's'}`}</p>
    <div class="menuBtns">
      <button class="b primary" id="goRetry">TRY AGAIN</button>
      <button class="b" id="goHome">Home screen</button>
    </div>`);
  $('goRetry').onclick = () => play();
  $('goHome').onclick = () => showHome();
}

// ---------- Side panel ----------
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
function setHTML(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).innerHTML = v; } }
const fmt = n => Math.round(n).toLocaleString();

const STAT_ROWS = [
  ['dmg', 'Damage', v => fmt(v)],
  ['dps', 'Damage / sec', v => fmt(v)],
  ['ramp', 'Max heat', v => '×' + v],
  ['range', 'Range', v => v.toFixed(1)],
  ['rate', 'Fire rate', (v, s) => s.kind === 'lance' ? null : (1 / v).toFixed(1) + '/s'],
  ['splash', 'Blast radius', v => v.toFixed(1)],
  ['bomblets', 'Bomblets', v => v],
  ['well', 'Hold time', v => v.toFixed(1) + 's'],
  ['salvo', 'Missiles', v => v],
  ['chain', 'Jumps', v => v],
  ['slow', 'Slow', v => Math.round(v * 100) + '%'],
  ['freeze', 'Freeze chance', v => Math.round(v * 100) + '%'],
  ['brittle', 'Extra damage taken', v => '+' + Math.round(v * 100) + '%'],
];
function statTable(s, n) {
  let h = '<table>';
  for (const [k, label, f] of STAT_ROWS) {
    if (s[k] === undefined) continue;
    const cur = f(s[k], s); if (cur === null) continue;
    const nx = n && n[k] !== undefined ? f(n[k], n) : null;
    h += `<tr><td class="muted">${label}</td><td>${cur}${nx !== null && nx !== cur ? ` <span class="up">→ ${nx}</span>` : ''}</td></tr>`;
  }
  return h + '</table>';
}
function statsFor(type, lvl, branch) {
  const d = TOWERS[type], s = { ...d.base };
  if (lvl >= 2) Object.assign(s, d.l2);
  if (branch && lvl >= 3) Object.assign(s, d.branches[branch].a);
  if (branch && lvl >= 4) Object.assign(s, d.branches[branch].b);
  return s;
}
function infoHTML() {
  const t = ui.selected;
  if (t) {
    const d = TOWERS[t.type], opts = upgradeOptions(t);
    let h = `<h3 style="color:${d.color}">${towerName(t).toUpperCase()} · LV ${t.lvl}</h3>`;
    if (t.busy > 0) {
      const p = 1 - t.busy / t.busyMax;
      h += statTable(t.s) + `<div class="muted">Upgrading… offline until complete</div><div class="prog"><div style="width:${(p * 100).toFixed(0)}%"></div></div>`;
    } else if (t.lvl === 2) {
      h += statTable(t.s) + `<div class="muted">Choose a specialization:</div><div class="branches">` +
        opts.map((o, i) => `<button class="branch" data-act="up" data-i="${i}" ${game.credits < o.cost ? 'disabled' : ''}><b>${o.label}</b><span>${o.desc}</span><i>◆ ${o.cost}</i></button>`).join('') + '</div>';
    } else if (opts.length) {
      const o = opts[0];
      h += statTable(t.s, statsFor(t.type, o.lvl, o.branch || t.branch));
      h += `<div class="row"><button class="b" data-act="up" data-i="0" ${game.credits < o.cost ? 'disabled' : ''}>Upgrade → ${o.label} ◆${o.cost}</button></div>`;
    } else {
      h += statTable(t.s) + '<div class="up">Fully upgraded</div>';
    }
    h += `<div class="row" style="margin-top:6px"><button class="b sell" data-act="sell">Sell +${sellValue(t)}</button></div>`;
    h += `<div class="muted" style="margin-top:5px;font-size:12.5px">Kills: ${t.kills.toLocaleString()} · Damage dealt: ${fmt(t.dmgDone)}</div>`;
    return h;
  }
  if (ui.build) {
    const d = TOWERS[ui.build];
    return `<h3 style="color:${d.color}">${d.name.toUpperCase()}</h3><div>${d.desc}</div>
      <div class="muted" style="margin-top:6px">Specializations: ${Object.values(d.branches).map(b => b.name).join(' or ')}.</div>
      <div class="muted" style="margin-top:6px">Tap an empty pad to build (◆${d.cost}).</div>`;
  }
  return `<h3>COMMAND</h3><div class="muted">Pick a tower type to build, or tap a placed tower to upgrade or sell it.<br><br>Towers start at level 1. Upgrade to level 2, then choose one of two specializations, then Mk II. Upgrades take a few seconds and the tower stops firing while it works.</div>`;
}
function infoKey() {
  const t = ui.selected;
  if (t) {
    const opts = upgradeOptions(t).map(o => game.credits >= o.cost ? 1 : 0).join('');
    return `t${t.id}|${t.lvl}|${t.branch}|${t.busy > 0 ? Math.floor((1 - t.busy / t.busyMax) * 25) : 'x'}|${opts}|${t.kills}|${Math.floor(t.dmgDone / 50)}`;
  }
  return ui.build ? 'b' + ui.build : 'none';
}
let lastInfoKey = '';

function updateUI() {
  if (ui.mode !== 'game') { setText('gfxHome', quality === 'high' ? 'Gfx: High' : 'Gfx: Low'); return; }
  if (ui.selected && !game.towers.includes(ui.selected)) ui.selected = null;
  setText('sCred', fmt(Math.floor(game.credits)));
  setText('sLives', String(game.lives));
  setText('sWave', String(game.wave));
  for (const b of tb.children) {
    const type = b.dataset.type;
    b.classList.toggle('active', ui.build === type);
    b.classList.toggle('poor', game.credits < TOWERS[type].cost);
  }
  $('launch').disabled = !playing() || game.spawning;
  setText('launch', game.spawning ? 'INCOMING…' : game.waveActive ? `CALL WAVE ${game.wave + 1} EARLY (+${10 + game.wave * 3})` : `LAUNCH WAVE ${game.wave + 1}`);
  setText('speed', `Speed ${ui.speed}×`);
  setText('pause', ui.paused ? 'Resume' : 'Pause');
  setText('quality', quality === 'high' ? 'Gfx: High' : 'Gfx: Low');
  const counts = waveSummary(game.wave + 1);
  setHTML('nextWave', 'Next wave: ' + Object.entries(counts).map(([k, n]) => `<b>${n}</b> ${ALIENS[k].name}${n > 1 ? 's' : ''}`).join(', '));
  const k = infoKey();
  if (k !== lastInfoKey) { lastInfoKey = k; $('info').innerHTML = infoHTML(); }
  $('pausedTag').style.display = ui.paused && $('overlay').classList.contains('hidden') && !game.over ? 'block' : 'none';
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  let fxDt = 0;
  if (ui.mode === 'home') {
    game.update(real);
    if (!game.waveActive) { game.wave = 7; game.launch(); }
    view.cam.x = game.map.cols / 2 + Math.sin(now / 9000) * 0.8;
    fxDt = real;
  } else if (!ui.paused && !game.over) {
    for (let i = 0; i < ui.speed; i++) game.update(real);
    fxDt = real * Math.min(ui.speed, 2);
  } else if (game.over) fxDt = real;
  keyPan(real);
  const canPlace = ui.build && ui.hover && game.canBuild(ui.hover.c, ui.hover.r) && game.credits >= TOWERS[ui.build].cost;
  view.setPreview({ buildType: ui.mode === 'game' ? ui.build : null, hover: ui.mode === 'game' ? ui.hover : null, selected: ui.mode === 'game' ? ui.selected : null, canPlace });
  view.frame(fxDt, game.events);
  handleUIEvents(game.events);
  game.events.length = 0;
  updateUI();
  updateFloats(real);
  requestAnimationFrame(frame);
}

// ---------- Installable app ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
let installEvt = null;
const installBtns = [$('installBtn'), $('installBtn2')];
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvt = ev; installBtns.forEach(b => b.classList.add('show')); });
installBtns.forEach(b => b.onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null; installBtns.forEach(x => x.classList.remove('show'));
});
window.addEventListener('appinstalled', () => installBtns.forEach(b => b.classList.remove('show')));

showHome();
requestAnimationFrame(frame);

// Hook for automated tests
window.__xeno = { game, view, ui, play, showHome };
