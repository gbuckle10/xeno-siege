// Map editor: draw lanes, place the base, set wave rules, save / share custom maps.
import { buildMap, normalizeRules, DEFAULT_RULES, waveSummary, ALIENS } from './game.js';

export const SIZES = { S: [18, 11], M: [24, 15], L: [30, 18] };
const STORE_KEY = 'xenoSiegeCustomMaps';

// ---------- Storage + share codes ----------
export function loadCustomMaps() {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
export function saveCustomMaps(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {} }
export function customToMap(def) {
  return buildMap({ id: def.id, name: def.name, difficulty: 'Custom', cols: def.cols, rows: def.rows, base: def.base,
    lanes: def.lanes, credits: normalizeRules(def.rules).credits ?? 250, hpScale: 1, desc: 'Your map.' });
}
export function shareCode(def) {
  const json = JSON.stringify({ v: 1, n: def.name, c: def.cols, r: def.rows, b: def.base, l: def.lanes, u: def.rules });
  return 'XS1:' + btoa(unescape(encodeURIComponent(json)));
}
export function parseShareCode(code) {
  code = (code || '').trim();
  if (!code.startsWith('XS1:')) throw new Error('That doesn\'t look like a Xeno Siege map code.');
  let o;
  try { o = JSON.parse(decodeURIComponent(escape(atob(code.slice(4).replace(/\s+/g, ''))))); }
  catch (e) { throw new Error('This map code is damaged or incomplete. Copy the whole code and try again.'); }
  const ok = o && Number.isInteger(o.c) && Number.isInteger(o.r) && o.c >= 8 && o.c <= 40 && o.r >= 6 && o.r <= 30 &&
    Array.isArray(o.b) && Array.isArray(o.l) && o.l.length > 0 && o.l.length <= 8 &&
    o.l.every(l => Array.isArray(l) && l.length >= 2 && l.length < 200 && l.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)));
  if (!ok) throw new Error('This map code is damaged or incomplete.');
  return { id: 'c' + Date.now().toString(36), name: String(o.n || 'Shared map').slice(0, 28), cols: o.c, rows: o.r, base: o.b, lanes: o.l, rules: normalizeRules(o.u) };
}

// ---------- Geometry helpers ----------
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
function segTiles(a, b) {           // tiles from a to b inclusive (axis-aligned)
  const out = [], dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]);
  let c = a[0], r = a[1];
  out.push([c, r]);
  while (c !== b[0] || r !== b[1]) { c += dc; r += dr; out.push([c, r]); }
  return out;
}
function onSegment(p, a, b) {
  return (a[0] === b[0] && p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) ||
         (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]));
}

// ---------- Editor ----------
export class Editor {
  constructor({ panel, onChange, onTest, onExit, onSaved }) {
    this.panel = panel; this.onChange = onChange; this.onTest = onTest; this.onExit = onExit; this.onSaved = onSaved;
    this.tool = 'lane'; this.drawing = null; this.hoverTile = null; this.msg = ''; this.confirm = null;
    panel.addEventListener('click', ev => this.click(ev));
    panel.addEventListener('input', ev => this.input(ev));
    panel.addEventListener('change', ev => this.input(ev));
  }

  open(def) {
    const n = loadCustomMaps().length + 1;
    this.draft = def ? JSON.parse(JSON.stringify(def)) :
      { id: null, name: 'My map ' + n, cols: 24, rows: 15, base: null, lanes: [], rules: normalizeRules({ credits: 250 }) };
    this.draft.rules = normalizeRules(this.draft.rules);
    this.tool = this.draft.base ? 'lane' : 'base';
    this.drawing = null; this.confirm = null;
    this.msg = this.draft.base ? '' : 'Start by tapping a tile to place your base.';
    this.render(); this.changed();
  }

  get map() { return buildMap({ id: 'editor', name: this.draft.name, difficulty: 'Custom', cols: this.draft.cols, rows: this.draft.rows,
    base: this.draft.base, lanes: this.draft.lanes, credits: 250, hpScale: 1, desc: '' }); }
  changed() { this.onChange && this.onChange(this.map); this.renderStatus(); }

  laneDone(l) { return this.draft.base && same(l[l.length - 1], this.draft.base); }
  laneTiles(skip) {
    const set = new Set();
    this.draft.lanes.forEach((l, i) => { if (i === skip) return; for (let k = 0; k < l.length - 1; k++) for (const t of segTiles(l[k], l[k + 1])) set.add(t[0] + ',' + t[1]); });
    return set;
  }
  inside(c, r) { return c >= 0 && r >= 0 && c < this.draft.cols && r < this.draft.rows; }
  isEdge(c, r) { return this.inside(c, r) && (c === 0 || r === 0 || c === this.draft.cols - 1 || r === this.draft.rows - 1); }

  // Points to add when extending the lane being drawn toward tile t (straight, or an L-turn).
  extension(t) {
    const lane = this.draft.lanes[this.drawing], last = lane[lane.length - 1], prev = lane[lane.length - 2];
    if (same(t, last)) return null;
    if (t[0] === last[0] || t[1] === last[1]) return [t];
    const horiz = prev[1] === last[1];
    return [horiz ? [t[0], last[1]] : [last[0], t[1]], t];
  }
  checkExtension(pts) {
    const lane = this.draft.lanes[this.drawing];
    let a = lane[lane.length - 1], dirPrev = [Math.sign(a[0] - lane[lane.length - 2][0]), Math.sign(a[1] - lane[lane.length - 2][1])];
    for (const p of pts) {
      const d = [Math.sign(p[0] - a[0]), Math.sign(p[1] - a[1])];
      if (d[0] === -dirPrev[0] && d[1] === -dirPrev[1]) return 'Lanes can\'t double back on themselves.';
      for (const t of segTiles(a, p).slice(1)) {
        if (!this.inside(t[0], t[1])) return 'Keep the lane inside the map.';
        if (same(t, this.draft.base) && !same(t, pts[pts.length - 1])) return 'The lane would run through your base. End it there instead.';
      }
      dirPrev = d; a = p;
    }
    return null;
  }

  tap(c, r) {
    const D = this.draft, t = [c, r];
    this.msg = ''; this.confirm = null;
    if (!this.inside(c, r)) return;
    if (this.tool === 'base') {
      if (D.lanes.length && !same(D.base, t)) { D.lanes = []; this.drawing = null; this.msg = 'Base moved. Lanes were cleared, since they have to end at the base.'; }
      D.base = t; this.tool = 'lane';
      if (!this.msg) this.msg = 'Base placed. Now draw a lane: tap a tile on the edge of the map where the aliens should come in.';
    } else if (this.tool === 'erase') {
      for (let i = D.lanes.length - 1; i >= 0; i--) {
        const l = D.lanes[i];
        if (l.some((p, k) => k < l.length - 1 && onSegment(t, p, l[k + 1]))) {
          D.lanes.splice(i, 1);
          if (this.drawing === i) this.drawing = null; else if (this.drawing > i) this.drawing--;
          this.msg = 'Lane removed.'; break;
        }
      }
    } else if (this.tool === 'lane') {
      if (!D.base) { this.tool = 'base'; this.msg = 'Place your base first.'; return this.render(), this.changed(); }
      if (this.drawing === null) {
        if (!this.isEdge(c, r)) { this.msg = 'Lanes start at the edge of the map. Tap an edge tile.'; }
        else if (this.laneTiles().has(c + ',' + r) || same(t, D.base)) { this.msg = 'Pick an empty edge tile to start the lane.'; }
        else if (D.lanes.length >= 6) { this.msg = 'That\'s the maximum of 6 lanes.'; }
        else {
          const out = c === 0 ? [-1, r] : c === D.cols - 1 ? [D.cols, r] : r === 0 ? [c, -1] : [c, D.rows];
          D.lanes.push([out, t]); this.drawing = D.lanes.length - 1;
          this.msg = 'Now tap where the lane should turn. It runs straight, or makes an L-turn. End it on the base or on another lane.';
        }
      } else {
        const pts = this.extension(t);
        if (!pts) return;
        const err = this.checkExtension(pts);
        if (err) { this.msg = err; return this.render(), this.changed(); }
        const lane = D.lanes[this.drawing], backup = lane.map(p => p.slice());
        for (const p of pts) {
          const a = lane[lane.length - 2], b = lane[lane.length - 1];
          if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) lane[lane.length - 1] = p; else lane.push(p);
        }
        if (same(t, D.base)) { this.drawing = null; this.msg = 'Lane complete! Add another lane from the edge, or test-play your map.'; }
        else {
          // Ending on another finished lane merges into it
          const other = D.lanes.findIndex((l, i) => i !== this.drawing && this.laneDone(l) && l.some((p, k) => k < l.length - 1 && onSegment(t, p, l[k + 1])));
          if (other >= 0) {
            const l = D.lanes[other], k = l.findIndex((p, k2) => k2 < l.length - 1 && onSegment(t, p, l[k2 + 1]));
            const rest = l.slice(k + 1).map(p => p.slice());
            if (same(rest[0], t)) rest.shift();
            const a = lane[lane.length - 2], b = lane[lane.length - 1], n = rest[0];
            if (n && Math.sign(b[0] - a[0]) === -Math.sign(n[0] - b[0]) && Math.sign(b[1] - a[1]) === -Math.sign(n[1] - b[1])) {
              D.lanes[this.drawing] = backup;
              this.msg = 'That would make the aliens turn around. Join the other lane from the side or in the same direction.';
              return this.render(), this.changed();
            }
            if (n && ((a[0] === b[0] && b[0] === n[0]) || (a[1] === b[1] && b[1] === n[1]))) lane.pop();
            lane.push(...rest);
            this.drawing = null; this.msg = 'Lane merged into an existing lane. Nice.';
          }
        }
      }
    }
    this.render(); this.changed();
  }
  hover(c, r) { this.hoverTile = c === null ? null : [c, r]; }

  undo() {
    const D = this.draft;
    if (this.drawing !== null) {
      const lane = D.lanes[this.drawing];
      if (lane.length > 2) lane.pop(); else { D.lanes.splice(this.drawing, 1); this.drawing = null; }
    } else if (D.lanes.length) { D.lanes.pop(); this.msg = 'Removed the last lane.'; }
    this.render(); this.changed();
  }

  // Lines for the 3D preview: the in-progress lane's next segment toward the hovered tile.
  previewLines() {
    const lines = [];
    if (this.drawing !== null && this.hoverTile) {
      const lane = this.draft.lanes[this.drawing], pts = this.extension(this.hoverTile);
      if (pts) {
        const ok = !this.checkExtension(pts);
        let a = lane[lane.length - 1];
        for (const p of pts) { lines.push([a[0] + 0.5, a[1] + 0.5, p[0] + 0.5, p[1] + 0.5, ok ? '#ffd166' : '#ff5c7a', 0.06]); a = p; }
      }
    }
    return lines;
  }
  hoverColor() {
    const h = this.hoverTile; if (!h) return null;
    if (this.tool === 'base') return 0xffd166;
    if (this.tool === 'erase') return 0xff5c7a;
    if (this.drawing === null) return this.isEdge(h[0], h[1]) ? 0x9cff57 : 0x7d9cc8;
    return 0xffd166;
  }

  problems() {
    const D = this.draft, p = [];
    if (!D.base) p.push('Place a base.');
    if (!D.lanes.length) p.push('Draw at least one lane.');
    if (this.drawing !== null) p.push('Finish the lane you are drawing (end it on the base or another lane).');
    else if (D.lanes.some(l => !this.laneDone(l))) p.push('Every lane must end at the base.');
    if (!D.name.trim()) p.push('Give your map a name.');
    return p;
  }

  save() {
    const p = this.problems();
    if (p.length) { this.msg = p[0]; this.render(); return null; }
    const list = loadCustomMaps();
    if (!this.draft.id) this.draft.id = 'c' + Date.now().toString(36);
    const i = list.findIndex(m => m.id === this.draft.id);
    const copy = JSON.parse(JSON.stringify(this.draft));
    if (i >= 0) list[i] = copy; else list.push(copy);
    saveCustomMaps(list);
    this.msg = 'Saved. It\'s on the home screen under Your maps.';
    this.render();
    this.onSaved && this.onSaved(copy);
    return copy;
  }

  // ---------- Panel ----------
  click(ev) {
    const b = ev.target.closest('[data-ed]'); if (!b) return;
    const a = b.dataset.ed, D = this.draft;
    if (a === 'tool') { this.tool = b.dataset.v; this.msg = { base: 'Tap a tile to place (or move) the base.', lane: this.drawing === null ? 'Tap an edge tile to start a lane.' : 'Keep tapping turn points.', erase: 'Tap any lane to delete it.' }[this.tool]; }
    else if (a === 'size') {
      const [c, r] = SIZES[b.dataset.v];
      if (c === D.cols && r === D.rows) return;
      if ((D.lanes.length || D.base) && this.confirm !== 'size' + b.dataset.v) { this.confirm = 'size' + b.dataset.v; this.msg = 'Changing size clears the map. Tap the size again to confirm.'; return this.render(); }
      D.cols = c; D.rows = r; D.base = null; D.lanes = []; this.drawing = null; this.tool = 'base'; this.confirm = null;
      this.msg = 'New size. Tap a tile to place your base.'; this.render(); return this.changed();
    }
    else if (a === 'undo') return this.undo();
    else if (a === 'clear') {
      if (this.confirm !== 'clear') { this.confirm = 'clear'; this.msg = 'Tap Clear again to remove the base and all lanes.'; return this.render(); }
      D.base = null; D.lanes = []; this.drawing = null; this.tool = 'base'; this.confirm = null; this.msg = 'Cleared. Tap a tile to place your base.';
      this.render(); return this.changed();
    }
    else if (a === 'alien') { D.rules.enabled[b.dataset.v] = !D.rules.enabled[b.dataset.v]; }
    else if (a === 'save') { this.save(); return; }
    else if (a === 'test') {
      const p = this.problems();
      if (p.length) { this.msg = p[0]; return this.render(); }
      this.onTest && this.onTest(customToMap({ ...D, id: D.id || 'draft' }), D.rules);
      return;
    }
    else if (a === 'share') {
      const p = this.problems();
      if (p.length) { this.msg = p[0]; return this.render(); }
      const code = shareCode(D);
      const box = this.panel.querySelector('#edCode'); box.value = code; box.style.display = 'block'; box.select();
      navigator.clipboard?.writeText(code).then(() => { this.msg = 'Share code copied. Send it to a friend; they paste it under Import on the home screen.'; this.renderStatus(); },
        () => { this.msg = 'Copy the code from the box below.'; this.renderStatus(); });
      return;
    }
    else if (a === 'exit') { this.onExit && this.onExit(); return; }
    this.render();
  }
  input(ev) {
    const el = ev.target, R = this.draft.rules;
    if (el.id === 'edName') { this.draft.name = el.value.slice(0, 28); return; }
    const k = el.dataset.rule; if (!k) return;
    const v = +el.value;
    R[k] = k === 'autoWaves' ? !!v : v;
    const out = this.panel.querySelector(`[data-out="${k}"]`); if (out) out.textContent = this.fmtRule(k, v);
    this.renderPreview();
  }
  fmtRule(k, v) {
    if (k === 'countMul' || k === 'hpMul' || k === 'speedMul') return '×' + v.toFixed(2).replace(/0$/, '');
    return String(v);
  }

  render() {
    const D = this.draft, R = D.rules;
    const sizeKey = Object.keys(SIZES).find(k => SIZES[k][0] === D.cols && SIZES[k][1] === D.rows) || 'M';
    const slider = (k, label, min, max, step) => `<label class="rule"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${R[k]}" data-rule="${k}"><b data-out="${k}">${this.fmtRule(k, R[k])}</b></label>`;
    const select = (k, label, opts) => `<label class="rule"><span>${label}</span><select data-rule="${k}">${opts.map(([v, t]) => `<option value="${v}" ${+R[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    this.panel.innerHTML = `
      <div class="row" style="align-items:center"><h1 style="flex:1;font-size:16px">MAP EDITOR</h1><button class="b" data-ed="exit" style="flex:none;padding:6px 10px">✕ Exit</button></div>
      <label class="rule"><span>Name</span><input id="edName" maxlength="28" value="${D.name.replace(/"/g, '&quot;')}"></label>
      <div class="seg">${Object.keys(SIZES).map(k => `<button class="b ${k === sizeKey ? 'on' : ''}" data-ed="size" data-v="${k}">${k} ${SIZES[k][0]}×${SIZES[k][1]}</button>`).join('')}</div>
      <div class="seg tools">
        <button class="b ${this.tool === 'base' ? 'on' : ''}" data-ed="tool" data-v="base">⌂ Base</button>
        <button class="b ${this.tool === 'lane' ? 'on' : ''}" data-ed="tool" data-v="lane">↯ Lane</button>
        <button class="b ${this.tool === 'erase' ? 'on' : ''}" data-ed="tool" data-v="erase">⌫ Erase</button>
      </div>
      <div class="edMsg" id="edMsg"></div>
      <div class="row"><button class="b" data-ed="undo">↶ Undo</button><button class="b sell" data-ed="clear">Clear all</button></div>
      <div class="edLanes" id="edLanes"></div>
      <div class="label" style="margin-top:4px">Wave rules</div>
      ${slider('countMul', 'Swarm size', 0.5, 3, 0.25)}
      ${slider('hpMul', 'Alien toughness', 0.5, 3, 0.25)}
      ${slider('speedMul', 'Alien speed', 0.75, 1.5, 0.05)}
      ${slider('credits', 'Start credits', 100, 2000, 20)}
      ${slider('lives', 'Shields', 10, 500, 10)}
      ${select('bossEvery', 'Hive Queen', [[0, 'Never'], [5, 'Every 5 waves'], [10, 'Every 10 waves'], [15, 'Every 15 waves'], [20, 'Every 20 waves']])}
      ${select('swarmEvery', 'Mega swarm', [[0, 'Never'], [3, 'Every 3 waves'], [5, 'Every 5 waves'], [7, 'Every 7 waves'], [10, 'Every 10 waves']])}
      ${select('autoWaves', 'Wave timer', [[1, 'On — waves keep coming'], [0, 'Off — launch manually']])}
      ${select('winWave', 'Goal', [[0, 'Endless'], [10, 'Win after wave 10'], [15, 'Win after wave 15'], [20, 'Win after wave 20'], [30, 'Win after wave 30'], [50, 'Win after wave 50']])}
      <div class="chips">${Object.keys(ALIENS).map(k => `<button class="chipBtn ${R.enabled[k] ? 'on' : ''}" data-ed="alien" data-v="${k}" style="--c:${ALIENS[k].color}">${ALIENS[k].name}</button>`).join('')}</div>
      <div class="edPrev" id="edPrev"></div>
      <div class="row"><button class="b primary" data-ed="test">▶ TEST PLAY</button><button class="b" data-ed="save">Save</button></div>
      <button class="b" data-ed="share">Copy share code</button>
      <textarea id="edCode" readonly style="display:none"></textarea>`;
    this.renderStatus(); this.renderPreview();
  }
  renderStatus() {
    const D = this.draft, m = this.panel.querySelector('#edMsg'), l = this.panel.querySelector('#edLanes');
    if (!m) return;
    m.textContent = this.msg || (this.problems()[0] ? 'To do: ' + this.problems()[0] : 'Map is ready. Test-play it or save it.');
    l.innerHTML = D.lanes.length ? D.lanes.map((ln, i) => {
      const len = ln.reduce((s, p, k) => k ? s + Math.abs(p[0] - ln[k - 1][0]) + Math.abs(p[1] - ln[k - 1][1]) : 0, 0);
      return `<div>${this.laneDone(ln) ? '✓' : '…'} Lane ${i + 1} · ${len} tiles${i === this.drawing ? ' <i>(drawing)</i>' : ''}</div>`;
    }).join('') : '<div class="muted">No lanes yet.</div>';
  }
  renderPreview() {
    const el = this.panel.querySelector('#edPrev'); if (!el) return;
    const R = normalizeRules(this.draft.rules);
    const line = w => `<div><b>Wave ${w}:</b> ${Object.entries(waveSummary(w, R)).map(([k, n]) => `${n} ${ALIENS[k].name}${n > 1 ? 's' : ''}`).join(', ')}</div>`;
    el.innerHTML = [1, 5, 10, 20].map(line).join('');
  }
}
export { DEFAULT_RULES };
