// Glue: home screen, game loop, input (mouse + touch), side panel UI, menus, install prompt.
import { Game, TOWERS, TOWER_TYPES, ALIENS, MAPS, POWERS, POWER_IDS, MAX_ENERGY, getMap, rankBuildSpots, upgradeOptions, towerName, sellValue, waveSummary } from './game.js';
import { View } from './view.js';
import { Editor, loadCustomMaps, saveCustomMaps, customToMap, parseShareCode } from './editor.js';

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
const ui = { mode: 'home', build: null, selected: null, hover: null, hoverPoint: null, power: null, speed: 1, paused: false, shift: false, current: null };
let selectedMap = store.get('xenoSiegeMap', 'spiral');
const customDef = id => loadCustomMaps().find(d => d.id === id);
if (!MAPS.some(m => m.id === selectedMap) && !customDef(selectedMap)) selectedMap = 'spiral';
// The map + rules to play for the current home-screen selection
function selection() {
  const def = customDef(selectedMap);
  return def ? { map: customToMap(def), rules: def.rules, name: def.name } : { map: getMap(selectedMap), rules: null, name: getMap(selectedMap).name };
}
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
      selectCard(def.id, b);
    };
    list.appendChild(b);
  }
  renderCustomList();
  $('playBtn').textContent = 'PLAY — ' + selection().name.toUpperCase();
}
function selectCard(id, card) {
  selectedMap = id; store.set('xenoSiegeMap', id);
  document.querySelectorAll('.mapCard').forEach(c => c.classList.toggle('sel', c === card));
  $('playBtn').textContent = 'PLAY — ' + selection().name.toUpperCase();
  startDemo();
}
function renderCustomList() {
  const list = $('customList');
  list.innerHTML = '';
  for (const def of loadCustomMaps()) {
    const map = customToMap(def), best = +store.get(bestKey(def.id), 0), R = def.rules || {};
    const b = document.createElement('button');
    b.className = 'mapCard' + (def.id === selectedMap ? ' sel' : '');
    const goal = R.winWave ? `Win at wave ${R.winWave}` : 'Endless';
    b.innerHTML = `<canvas></canvas><div style="flex:1;min-width:0"><div class="mn">${def.name.replace(/</g, '&lt;')} <span class="chip d-Custom">Custom</span></div>
      <div class="mb">${best ? `Best: ${best} wave${best === 1 ? '' : 's'} · ` : ''}${goal}</div>
      <div class="acts"><span data-a="edit">Edit</span><span data-a="del">Delete</span></div></div>`;
    drawMiniMap(b.querySelector('canvas'), map);
    b.onclick = ev => {
      const a = ev.target.closest('[data-a]');
      if (a && a.dataset.a === 'edit') { openEditor(def); return; }
      if (a && a.dataset.a === 'del') {
        if (a.dataset.sure) {
          saveCustomMaps(loadCustomMaps().filter(d => d.id !== def.id));
          if (selectedMap === def.id) { selectedMap = 'spiral'; store.set('xenoSiegeMap', 'spiral'); renderMapList(); startDemo(); } else renderCustomList();
        } else { a.dataset.sure = 1; a.textContent = 'Tap to confirm'; }
        return;
      }
      if (selectedMap === def.id) { play(); return; }
      selectCard(def.id, b);
    };
    list.appendChild(b);
  }
  const c = document.createElement('button');
  c.className = 'mapCard create'; c.textContent = '＋ Create a map';
  c.onclick = () => openEditor(null);
  list.appendChild(c);
}
$('importBtn').onclick = () => $('importBox').classList.toggle('hidden');
$('importGo').onclick = () => {
  try {
    const def = parseShareCode($('importText').value);
    saveCustomMaps([...loadCustomMaps(), def]);
    $('importText').value = ''; $('importMsg').textContent = `Imported “${def.name}”.`;
    selectedMap = def.id; store.set('xenoSiegeMap', def.id);
    renderMapList(); startDemo();
  } catch (e) { $('importMsg').textContent = e.message || 'Could not read that code.'; }
};
$('playBtn').onclick = () => play();
$('howBtn').onclick = () => $('howPanel').classList.toggle('hidden');

// A live battle behind the home screen: maxed-out towers vs. an endless swarm.
const DEMO_TYPES = [['gatling', 'minigun'], ['mortar', 'cluster'], ['arc', 'storm'], ['missile', 'hydra'], ['cryo', 'shatter'], ['gatling', 'railgun'],
  ['mortar', 'singularity'], ['arc', 'lance'], ['missile', 'nuke'], ['gatling', 'minigun'], ['arc', 'storm'], ['cryo', 'zero']];
function startDemo() {
  const sel = selection();
  game.setMap(sel.map, sel.rules ? { ...sel.rules, winWave: 0 } : null);
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

// opts: { map, rules, fromEditor } — defaults to the home-screen selection. Restart replays ui.current.
function play(opts) {
  if (!opts) { const s = selection(); opts = { map: s.map, rules: s.rules, fromEditor: false }; }
  ui.current = opts;
  ui.mode = 'game'; ui.build = null; ui.selected = null; ui.power = null; ui.paused = false; ui.speed = 1;
  document.body.classList.remove('home', 'editor');
  hideOverlay();
  view.setInset(0, 0);
  game.setMap(opts.map, opts.rules);
  game.demo = false;
  view.loadMap(game.map);
  const goal = game.rules.winWave ? ` · win at wave ${game.rules.winWave}` : '';
  setText('mapName', `${game.map.name} · ${game.map.difficulty}${goal}`);
  banner(game.map.name.toUpperCase(), '#4df3c9');
  canvas.focus({ preventScroll: true });
}

// ---------- Map editor ----------
const editor = new Editor({
  panel: $('editorPanel'),
  onChange: map => { game.setMap(map); game.demo = true; view.loadMap(map, { keepCamera: true }); },
  onTest: (map, rules) => play({ map, rules, fromEditor: true }),
  onExit: () => showHome(),
});
function openEditor(def) {
  ui.mode = 'editor'; ui.build = null; ui.selected = null; ui.power = null; ui.paused = false;
  hideOverlay();
  document.body.classList.remove('home'); document.body.classList.add('editor');
  view.setInset(0, 0);
  view.map = null;
  editor.open(def);
  requestAnimationFrame(() => { view.resize(); view.resetCamera(); });
}

// ---------- Power bar ----------
const pb = $('powerBtns');
for (const id of POWER_IDS) {
  const P = POWERS[id];
  const b = document.createElement('button');
  b.className = 'pw'; b.dataset.p = id; b.style.setProperty('--pc', P.color);
  b.title = `${P.name} (${P.cost} energy, key ${P.key.toUpperCase()}): ${P.desc}`;
  b.innerHTML = `<span class="ic">${P.icon}</span><small>${P.cost}</small><span class="k">${P.key}</span><div class="cdv"></div>`;
  b.onclick = () => usePower(id);
  pb.appendChild(b);
}
function usePower(id) {
  if (!playing() || ui.paused) return;
  const P = POWERS[id];
  if (!game.canCast(id)) {
    const why = game.powerCd[id] > 0 ? `${P.name} recharging (${Math.ceil(game.powerCd[id])}s)` : `Need ${P.cost} energy`;
    floatText(game.map.base.x, 1.3, game.map.base.z, why, '#c792ff', 1.2);
    return;
  }
  if (!P.target) { game.castPower(id, 0, 0); return; }
  ui.power = ui.power === id ? null : id;
  if (ui.power) { ui.build = null; ui.selected = null; }
}
function updatePowerBar() {
  $('energyFill').style.width = (game.energy / MAX_ENERGY * 100).toFixed(1) + '%';
  setText('energyText', String(Math.floor(game.energy)));
  for (const b of pb.children) {
    const id = b.dataset.p, P = POWERS[id], cd = game.powerCd[id] > 0 ? game.powerCd[id] / P.cd : 0;
    b.style.setProperty('--p', cd.toFixed(3));
    b.classList.toggle('off', !game.canCast(id));
    b.classList.toggle('ready', game.canCast(id));
    b.classList.toggle('active', ui.power === id);
  }
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
ui.hoverUpgrade = null;
$('info').addEventListener('pointerover', ev => { const a = ev.target.closest('[data-act="up"]'); ui.hoverUpgrade = a ? +a.dataset.i || 0 : null; });
$('info').addEventListener('pointerleave', () => { ui.hoverUpgrade = null; });
$('info').addEventListener('click', ev => {
  const a = ev.target.closest('[data-act]'); if (!a || a.disabled) return;
  if (a.dataset.act === 'up') doUpgrade(+a.dataset.i || 0);
  if (a.dataset.act === 'sell') doSell();
  if (a.dataset.act === 'auto' && ui.selected) ui.selected.auto = !ui.selected.auto;
});

// ---------- Pointer input: tap = act, drag = pan, pinch / wheel = zoom ----------
const pointers = new Map();
let gesture = null;
const pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function updateHover(x, y) {
  if (ui.mode === 'home') { ui.hover = null; ui.hoverPoint = null; return; }
  const t = view.tileAt(x, y), m = game.map;
  ui.hoverPoint = t ? { x: t.x, z: t.z } : null;
  ui.hover = t && t.c >= 0 && t.r >= 0 && t.c < m.cols && t.r < m.rows ? { c: t.c, r: t.r } : null;
  if (ui.mode === 'editor') editor.hover(ui.hover ? ui.hover.c : null, ui.hover ? ui.hover.r : null);
}
function tap(x, y) {
  updateHover(x, y);
  if (ui.mode === 'editor') { if (ui.hover) editor.tap(ui.hover.c, ui.hover.r); return; }
  if (!playing() || ui.paused) return;
  if (ui.power && ui.hoverPoint) {
    if (game.castPower(ui.power, ui.hoverPoint.x, ui.hoverPoint.z) && !ui.shift) ui.power = null;
    return;
  }
  const sel = ui.selected;
  if (sel && sel.s.kind === 'beam' && ui.hoverPoint && !ui.build) {
    const hit = ui.hover && game.towerAt(ui.hover.c, ui.hover.r);
    if (!hit) {
      const ang = Math.atan2(ui.hoverPoint.z - sel.z, ui.hoverPoint.x - sel.x);
      if (!game.fireBeam(sel, ang)) {
        sel.aim = ang;
        floatText(sel.x, 1.2, sel.z, sel.busy > 0 ? 'Upgrading…' : `Charging ${Math.floor((1 - sel.cd / sel.s.rate) * 100)}%`, '#ffe066', 1);
      }
      return;
    }
  }
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
  if (ev.target.closest && ev.target.closest('input,textarea,select')) return;
  if (ev.key === 'Shift') ui.shift = true;
  keysDown.add(ev.key.toLowerCase());
  if (ui.mode === 'home') { if (ev.key === 'Enter') play(); return; }
  if (ui.mode === 'editor') {
    if (ev.key === 'Backspace' || ((ev.ctrlKey || ev.metaKey) && ev.key === 'z')) { ev.preventDefault(); editor.undo(); }
    return;
  }
  if (ev.key === 'Escape') {
    if (!$('overlay').classList.contains('hidden') && !game.over) { resume(); return; }
    if (ui.build || ui.selected || ui.power) { ui.build = null; ui.selected = null; ui.power = null; return; }
    if (!game.over) showMenu();
    return;
  }
  if (!playing() || ui.paused) return;
  const t = TOWER_TYPES.find(k => TOWERS[k].key === ev.key);
  if (t) { setBuild(t); return; }
  const pw = POWER_IDS.find(k => POWERS[k].key === ev.key.toLowerCase());
  if (pw) { usePower(pw); return; }
  if (ev.key === 'f' || ev.key === 'F') {
    const lances = game.towers.filter(x => x.s.kind === 'beam');
    if (lances.length) {
      lances.sort((a, b) => (game.beamReady(b) ? 1 : 0) - (game.beamReady(a) ? 1 : 0) || a.cd - b.cd);
      const i = lances.indexOf(ui.selected);
      ui.selected = i >= 0 && lances.length > 1 ? lances[(i + 1) % lances.length] : lances[0];
      ui.build = null; ui.power = null;
    }
    return;
  }
  if (ev.code === 'Space') { ev.preventDefault(); launch(); }
  else if (ev.key === 'p' || ev.key === 'P') ui.paused = !ui.paused;
  else if ((ev.key === 'u' || ev.key === 'U') && ui.selected && upgradeOptions(ui.selected).length === 1) doUpgrade(0);
  else if (ev.key === '+' || ev.key === '=') view.zoomAt(0.85, innerWidth / 2, innerHeight / 2);
  else if (ev.key === '-') view.zoomAt(1.18, innerWidth / 2, innerHeight / 2);
});
window.addEventListener('keyup', ev => { if (ev.key === 'Shift') ui.shift = false; keysDown.delete(ev.key.toLowerCase()); });
window.addEventListener('blur', () => { keysDown.clear(); ui.shift = false; });
function keyPan(dt) {
  if (ui.mode === 'home') return;
  const s = 700 * dt;
  let dx = 0, dy = 0;
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('input,textarea,select');
  if (typing) return;
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
      case 'waveStart': {
        const now = waveSummary(ev.wave, game.rules), before = ev.wave > 1 ? waveSummary(ev.wave - 1, game.rules) : {};
        const NEW = { wasp: 'WASPS — they fly straight at your base. Mortars and Cryo can\'t hit them', warden: 'WARDENS — they shield nearby aliens. Kill them first', shell: 'SHELLBACKS — heavy armor. Use Railguns, Arc Coils or the Sunlance', brood: 'BROOD SACS — they burst into Skitters' };
        const fresh = Object.keys(now).find(k => !before[k] && NEW[k] && ev.wave > 1);
        if (fresh) { setTimeout(() => banner(NEW[fresh], ALIENS[fresh].color), 2400); }
      }
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
      case 'overdrive': banner('OVERDRIVE', '#c792ff'); break;
      case 'repair': floatText(game.map.base.x, 1.5, game.map.base.z, `+${ev.amount} shields`, '#9cff57', 1.6); break;
      case 'gameOver': showGameOver(); break;
      case 'victory': showVictory(); break;
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
      ${ui.current && ui.current.fromEditor ? '<button class="b" id="mEditor">Back to the editor</button>' : ''}
      <button class="b" id="mGfx">Graphics: ${quality === 'high' ? 'High' : 'Low'}</button>
      <button class="b sell" id="mHome">Quit to home screen</button>
    </div>`);
  $('mResume').onclick = resume;
  $('mRestart').onclick = () => play(ui.current);
  if ($('mEditor')) $('mEditor').onclick = () => openEditor(editor.draft);
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
      ${ui.current && ui.current.fromEditor ? '<button class="b" id="goEditor">Back to the editor</button>' : ''}
      <button class="b" id="goHome">Home screen</button>
    </div>`);
  wireEndButtons();
}
function wireEndButtons() {
  $('goRetry').onclick = () => play(ui.current);
  $('goHome').onclick = () => showHome();
  if ($('goEditor')) $('goEditor').onclick = () => openEditor(editor.draft);
}
function showVictory() {
  const key = bestKey(game.map.id), prev = +store.get(key, 0);
  if (game.wave > prev) store.set(key, game.wave);
  showOverlay(`<h2>VICTORY</h2>
    <p>${game.map.name}: you survived all <b>${game.wave}</b> waves with <b>${game.lives}</b> shields left and vaporized <b>${game.kills.toLocaleString()}</b> aliens.</p>
    <div class="menuBtns">
      <button class="b primary" id="goRetry">PLAY AGAIN</button>
      ${ui.current && ui.current.fromEditor ? '<button class="b" id="goEditor">Back to the editor</button>' : ''}
      <button class="b" id="goHome">Home screen</button>
    </div>`);
  wireEndButtons();
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
  ['beams', 'Beams', v => v],
  ['burn', 'Burn / sec', v => fmt(v)],
  ['burnTime', 'Burn time', v => v + 's'],
  ['range', 'Range', (v, s) => s.kind === 'beam' ? 'Whole map' : v.toFixed(1)],
  ['rate', 'Fire rate', (v, s) => s.kind === 'lance' ? null : s.kind === 'beam' ? null : (1 / v).toFixed(1) + '/s'],
  ['rate', 'Cooldown', (v, s) => s.kind === 'beam' ? v.toFixed(1) + 's' : null],
  ['splash', 'Blast radius', v => v.toFixed(1)],
  ['bomblets', 'Bomblets', v => v],
  ['well', 'Hold time', v => v.toFixed(1) + 's'],
  ['salvo', 'Missiles', v => v],
  ['chain', 'Jumps', v => v],
  ['slow', 'Slow', v => Math.round(v * 100) + '%'],
  ['freeze', 'Freeze chance', v => Math.round(v * 100) + '%'],
  ['brittle', 'Extra damage taken', v => '+' + Math.round(v * 100) + '%'],
];
const airRow = t => `<tr><td class="muted">Hits flyers</td><td>${TOWERS[t.type].air ? 'Yes' : '<span style="color:#ff9f43">No</span>'}</td></tr>`;
function statTable(s, n, t) {
  let h = '<table>' + (t ? airRow(t) : '');
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
    if (t.s.kind === 'beam' && t.busy <= 0) {
      const ch = 1 - Math.max(0, t.cd) / t.s.rate;
      h += `<div class="charge"><div style="width:${(ch * 100).toFixed(0)}%"></div></div>
        <div style="font-size:13px">${ch >= 1 ? '<b style="color:#ffe066">READY</b> · tap the map to fire' : 'Charging… tap the map to aim'}</div>
        <div class="row" style="margin:5px 0"><button class="b ${t.auto ? 'on' : ''}" data-act="auto">Auto-fire along last shot: ${t.auto ? 'On' : 'Off'}</button></div>`;
    }
    if (t.busy > 0) {
      const p = 1 - t.busy / t.busyMax;
      h += statTable(t.s, null, t) + `<div class="muted">Upgrading… offline until complete</div><div class="prog"><div style="width:${(p * 100).toFixed(0)}%"></div></div>`;
    } else if (t.lvl === 2) {
      h += statTable(t.s, null, t) + `<div class="muted">Choose a specialization:</div><div class="branches">` +
        opts.map((o, i) => `<button class="branch" data-act="up" data-i="${i}" ${game.credits < o.cost ? 'disabled' : ''} style="border-left:3px solid ${['#ffd166', '#ff9fd1'][i]}"><b>${o.label}</b><span>${o.desc}</span><i>◆ ${o.cost} · range ${statsFor(t.type, o.lvl, o.branch).range.toFixed(1)}</i></button>`).join('') + '</div>' +
        '<div class="muted" style="font-size:12px">Rings on the map show each option\'s range.</div>';
    } else if (opts.length) {
      const o = opts[0];
      h += statTable(t.s, statsFor(t.type, o.lvl, o.branch || t.branch), t);
      h += `<div class="row"><button class="b" data-act="up" data-i="0" ${game.credits < o.cost ? 'disabled' : ''}>Upgrade → ${o.label} ◆${o.cost}</button></div>`;
    } else {
      h += statTable(t.s, null, t) + '<div class="up">Fully upgraded</div>';
    }
    h += `<div class="row" style="margin-top:6px"><button class="b sell" data-act="sell">Sell +${sellValue(t)}</button></div>`;
    h += `<div class="muted" style="margin-top:5px;font-size:12.5px">Kills: ${t.kills.toLocaleString()} · Damage dealt: ${fmt(t.dmgDone)}</div>`;
    return h;
  }
  if (ui.power) {
    const P = POWERS[ui.power];
    return `<h3 style="color:${P.color}">${P.name.toUpperCase()}</h3><div>${P.desc}</div><div class="muted" style="margin-top:6px">Tap the map to target it. Esc or tap the button again to cancel.</div>`;
  }
  if (ui.build) {
    const d = TOWERS[ui.build];
    return `<h3 style="color:${d.color}">${d.name.toUpperCase()}</h3><div>${d.desc}</div>
      <div style="margin-top:5px;font-size:13px">${d.air ? '✓ Hits flying Wasps' : '<span style="color:#ff9f43">✗ Can\'t hit flying Wasps</span>'}</div>
      <div class="muted" style="margin-top:6px">Specializations: ${Object.values(d.branches).map(b => b.name).join(' or ')}.</div>
      <div class="muted" style="margin-top:6px">Tap an empty pad to build (◆${d.cost}).</div>`;
  }
  return `<h3>COMMAND</h3><div class="muted">Pick a tower type to build, or tap a placed tower to upgrade or sell it.<br><br>Towers start at level 1. Upgrade to level 2, then choose one of two specializations, then Mk II. Upgrades take a few seconds and the tower stops firing while it works.</div>`;
}
function infoKey() {
  const t = ui.selected;
  if (t) {
    const opts = upgradeOptions(t).map(o => game.credits >= o.cost ? 1 : 0).join('');
    const ch = t.s.kind === 'beam' ? Math.floor((1 - Math.max(0, t.cd) / t.s.rate) * 20) + (t.auto ? 'a' : '') : '';
    return `t${t.id}|${t.lvl}|${t.branch}|${t.busy > 0 ? Math.floor((1 - t.busy / t.busyMax) * 25) : 'x'}|${opts}|${t.kills}|${Math.floor(t.dmgDone / 50)}|${ch}`;
  }
  return ui.power ? 'p' + ui.power : ui.build ? 'b' + ui.build : 'none';
}
let lastInfoKey = '';

function updateUI() {
  if (ui.mode !== 'game') { setText('gfxHome', quality === 'high' ? 'Gfx: High' : 'Gfx: Low'); return; }
  updatePowerBar();
  if (ui.selected && !game.towers.includes(ui.selected)) ui.selected = null;
  setText('sCred', fmt(Math.floor(game.credits)));
  setText('sLives', String(game.lives));
  setText('sWave', String(game.wave));
  for (const b of tb.children) {
    const type = b.dataset.type;
    b.classList.toggle('active', ui.build === type);
    b.classList.toggle('poor', game.credits < TOWERS[type].cost);
  }
  const lastWave = game.rules.winWave && game.wave >= game.rules.winWave;
  setText('launch', game.spawning ? `WAVE ${game.wave} INCOMING…`
    : lastWave ? 'FINAL WAVE — HOLD ON'
    : game.nextIn !== null ? `NEXT WAVE IN ${Math.ceil(game.nextIn)}s · CALL NOW +${game.earlyBonus()}`
    : game.waveActive ? `CALL WAVE ${game.wave + 1} EARLY (+${game.earlyBonus()})` : `LAUNCH WAVE ${game.wave + 1}`);
  $('launch').disabled = !playing() || game.spawning || lastWave;
  setText('speed', `Speed ${ui.speed}×`);
  setText('pause', ui.paused ? 'Resume' : 'Pause');
  setText('quality', quality === 'high' ? 'Gfx: High' : 'Gfx: Low');
  const counts = waveSummary(game.wave + 1, game.rules);
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
  } else if (ui.mode === 'editor') {
    fxDt = real;
  } else if (!ui.paused && !game.over) {
    for (let i = 0; i < ui.speed; i++) game.update(real);
    fxDt = real * Math.min(ui.speed, 2);
  } else if (game.over) fxDt = real;
  keyPan(real);
  if (ui.mode === 'editor') {
    view.setPreview({ hover: ui.hover, lines: editor.previewLines(), hoverColor: editor.hoverColor() });
  } else if (ui.mode === 'game') {
    const canPlace = ui.build && ui.hover && game.canBuild(ui.hover.c, ui.hover.r) && game.credits >= TOWERS[ui.build].cost;
    const sel = ui.selected;
    let aim = null;
    if (sel && sel.s.kind === 'beam' && !ui.build && !ui.power) {
      const p = ui.hoverPoint && !(ui.hover && game.towerAt(ui.hover.c, ui.hover.r)) ? ui.hoverPoint
        : sel.aim !== undefined ? { x: sel.x + Math.cos(sel.aim), z: sel.z + Math.sin(sel.aim) } : null;
      if (p) aim = { tower: sel, x: p.x, z: p.z, ready: game.beamReady(sel) };
    }
    const power = ui.power ? { id: ui.power, point: ui.hoverPoint, ok: game.canCast(ui.power) } : null;
    // Upgrade previews: the next level's range drawn over the current one (both branches at the choice point)
    let nextRanges = null;
    if (sel && sel.busy <= 0) {
      const opts = upgradeOptions(sel);
      const BR = ['#ffd166', '#ff9fd1'];
      nextRanges = opts.map((o, i) => (ui.hoverUpgrade === null || ui.hoverUpgrade === i)
        ? { range: statsFor(sel.type, o.lvl, o.branch || sel.branch).range, color: opts.length > 1 ? BR[i] : BR[0] } : null);
    }
    view.setPreview({ buildType: ui.build, hover: ui.power ? null : ui.hover, selected: sel, canPlace, aim, power, nextRanges });
  } else view.setPreview({});
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
window.__xeno = { game, view, ui, play, showHome, editor, openEditor };
