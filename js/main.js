// Glue: game loop, input (mouse + touch), side panel UI, floating text, install prompt.
import { Game, TOWERS, TOWER_TYPES, ALIENS, BASE, WAY, upgradeOptions, towerName, sellValue, waveSummary, MAX_LVL } from './game.js';
import { View } from './view.js';

const $ = id => document.getElementById(id);
const game = new Game();
const canvas = $('game');
let view;
try {
  view = new View(canvas, game);
} catch (err) {
  $('card').innerHTML = '<h2 class="bad">NO 3D SUPPORT</h2><p>This browser or device could not start WebGL, which the game needs. Try a recent Chrome, Edge, Firefox or Safari.</p>';
  throw err;
}

const ui = { build: null, selected: null, hover: null, speed: 1, paused: false, started: false, shift: false };
let best = 0;
try { best = +localStorage.getItem('xenoSiegeBest3d') || 0; } catch (e) {}

// ---------- Graphics quality ----------
let quality = 'high';
try { quality = localStorage.getItem('xenoSiegeGfx') || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high'); } catch (e) {}
view.setQuality(quality);
$('quality').onclick = () => {
  quality = quality === 'high' ? 'low' : 'high';
  view.setQuality(quality);
  try { localStorage.setItem('xenoSiegeGfx', quality); } catch (e) {}
};

new ResizeObserver(() => view.resize()).observe($('stage'));

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
function launch() { if (ui.started) game.launch(); }
function doUpgrade(i) {
  const t = ui.selected; if (!t) return;
  const opt = upgradeOptions(t)[i ?? 0];
  if (opt) game.upgrade(t, opt);
}
function doSell() { if (ui.selected) { game.sell(ui.selected); ui.selected = null; } }

$('launch').onclick = launch;
$('speed').onclick = () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; };
$('pause').onclick = () => { if (ui.started && !game.over) ui.paused = !ui.paused; };
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
  const t = view.tileAt(x, y);
  ui.hover = t && t.c >= 0 && t.r >= 0 && t.c < 24 && t.r < 15 ? { c: t.c, r: t.r } : null;
}
function tap(x, y) {
  updateHover(x, y);
  if (!ui.started || game.over || !ui.hover) { if (!ui.hover) ui.selected = null; return; }
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
  if (!cancelled && p && gesture && gesture.type === 'tap' && pointers.size === 0) {
    if (p.button === 0) tap(ev.clientX, ev.clientY);
  }
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
  if (!ui.started || game.over) return;
  const t = TOWER_TYPES.find(k => TOWERS[k].key === ev.key);
  if (t) { setBuild(t); return; }
  if (ev.code === 'Space') { ev.preventDefault(); launch(); }
  else if (ev.key === 'Escape') { ui.build = null; ui.selected = null; }
  else if (ev.key === 'p' || ev.key === 'P') ui.paused = !ui.paused;
  else if ((ev.key === 'u' || ev.key === 'U') && ui.selected && upgradeOptions(ui.selected).length === 1) doUpgrade(0);
  else if (ev.key === '+' || ev.key === '=') view.zoomAt(0.85, innerWidth / 2, innerHeight / 2);
  else if (ev.key === '-') view.zoomAt(1.18, innerWidth / 2, innerHeight / 2);
});
window.addEventListener('keyup', ev => { if (ev.key === 'Shift') ui.shift = false; keysDown.delete(ev.key.toLowerCase()); });
window.addEventListener('blur', () => { keysDown.clear(); ui.shift = false; });
function keyPan(dt) {
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
view.onFlash = () => { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

function handleUIEvents(events) {
  let leaked = 0;
  for (const ev of events) {
    switch (ev.e) {
      case 'waveStart':
        if (ev.boss) banner(`WAVE ${ev.wave} — HIVE QUEEN INBOUND`, '#ffd166');
        else if (ev.swarm) banner(`WAVE ${ev.wave} — MEGA SWARM`, '#9cff57');
        else banner(`WAVE ${ev.wave}`);
        break;
      case 'waveClear':
        banner(`WAVE ${ev.wave} CLEARED  +${ev.bonus}`);
        break;
      case 'early':
        floatText(1, 1, WAY[0].z, `Early call +${ev.amount}`, '#4df3c9', 1.6);
        break;
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
  if (leaked) floatText(BASE.x, 1.5, BASE.z, `-${leaked} shields`, '#ff5c7a', 1.4);
}

// ---------- Overlays ----------
function showOverlay(html) { $('card').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
$('startBtn').onclick = () => { ui.started = true; hideOverlay(); canvas.focus(); };
function showGameOver() {
  const survived = Math.max(0, game.wave - 1);
  if (survived > best) { best = survived; try { localStorage.setItem('xenoSiegeBest3d', best); } catch (e) {} }
  showOverlay(`<h2 class="bad">BASE OVERRUN</h2>
    <p>You held out to wave <b>${game.wave}</b> and vaporized <b>${game.kills.toLocaleString()}</b> aliens.</p>
    <p style="color:var(--dim)">Best: survived ${best} wave${best === 1 ? '' : 's'}</p>
    <button class="b primary" id="restartBtn">REDEPLOY</button>`);
  $('restartBtn').onclick = () => { game.reset(); ui.selected = null; ui.build = null; ui.paused = false; ui.started = true; hideOverlay(); };
}

// ---------- Side panel ----------
const cache = {};
const setText = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
const setHTML = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).innerHTML = v; } };
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

function infoHTML() {
  const t = ui.selected;
  if (t) {
    const d = TOWERS[t.type], opts = upgradeOptions(t);
    let h = `<h3 style="color:${d.color}">${towerName(t).toUpperCase()} · LV ${t.lvl}</h3>`;
    if (t.busy > 0) {
      const p = 1 - t.busy / t.busyMax;
      h += statTable(t.s);
      h += `<div class="muted">Upgrading… offline until complete</div><div class="prog"><div style="width:${(p * 100).toFixed(0)}%"></div></div>`;
    } else if (t.lvl === 2) {
      h += statTable(t.s);
      h += `<div class="muted">Choose a specialization:</div><div class="branches">` +
        opts.map((o, i) => `<button class="branch" data-act="up" data-i="${i}" ${game.credits < o.cost ? 'disabled' : ''}><b>${o.label}</b><span>${o.desc}</span><i>◆ ${o.cost}</i></button>`).join('') + '</div>';
    } else if (opts.length) {
      const o = opts[0];
      const nx = { ...t, lvl: o.lvl, branch: o.branch };
      const ns = (() => { const s2 = Object.assign({}, d.base); if (nx.lvl >= 2) Object.assign(s2, d.l2); if (nx.branch && nx.lvl >= 3) Object.assign(s2, d.branches[nx.branch].a); if (nx.branch && nx.lvl >= 4) Object.assign(s2, d.branches[nx.branch].b); return s2; })();
      h += statTable(t.s, ns);
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
  if (ui.selected && !game.towers.includes(ui.selected)) ui.selected = null;
  setText('sCred', fmt(Math.floor(game.credits)));
  setText('sLives', String(game.lives));
  setText('sWave', String(game.wave));
  for (const b of tb.children) {
    const type = b.dataset.type;
    b.classList.toggle('active', ui.build === type);
    b.classList.toggle('poor', game.credits < TOWERS[type].cost);
  }
  const L = $('launch');
  L.disabled = !ui.started || game.over || game.spawning;
  setText('launch', game.spawning ? 'INCOMING…' : game.waveActive ? `CALL WAVE ${game.wave + 1} EARLY (+${10 + game.wave * 3})` : `LAUNCH WAVE ${game.wave + 1}`);
  setText('speed', `Speed ${ui.speed}×`);
  setText('pause', ui.paused ? 'Resume' : 'Pause');
  setText('quality', quality === 'high' ? 'Gfx: High' : 'Gfx: Low');
  const counts = waveSummary(game.wave + 1);
  setHTML('nextWave', 'Next wave: ' + Object.entries(counts).map(([k, n]) => `<b>${n}</b> ${ALIENS[k].name}${n > 1 ? 's' : ''}`).join(', '));
  const k = infoKey();
  if (k !== lastInfoKey) { lastInfoKey = k; $('info').innerHTML = infoHTML(); }
  $('pausedTag').style.display = ui.paused && ui.started && !game.over ? 'block' : 'none';
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const running = ui.started && !ui.paused && !game.over;
  if (running) for (let i = 0; i < ui.speed; i++) game.update(real);
  keyPan(real);
  const canPlace = ui.build && ui.hover && game.canBuild(ui.hover.c, ui.hover.r) && game.credits >= TOWERS[ui.build].cost;
  view.setPreview({ buildType: ui.build, hover: ui.hover, selected: ui.selected, canPlace });
  view.frame(running ? real * Math.min(ui.speed, 2) : (game.over ? real : 0), game.events);
  handleUIEvents(game.events);
  game.events.length = 0;
  updateUI();
  updateFloats(real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Installable app ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvt = ev; $('installBtn').classList.add('show'); });
$('installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null; $('installBtn').classList.remove('show');
};
window.addEventListener('appinstalled', () => $('installBtn').classList.remove('show'));

// Hook for automated tests
window.__xeno = { game, view, ui };
