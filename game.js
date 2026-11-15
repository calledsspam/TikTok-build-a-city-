/* TikTok-Stadt – eine Stadt, die durch TikTok-LIVE-Geschenke wächst.
   Reines Canvas-2D, keine Abhängigkeiten. Auflösung 1080x1920 (Hochformat). */
'use strict';

const W = 1080, H = 1920;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const STORAGE_KEY = 'tiktokStadt.v1';
const params = new URLSearchParams(location.search);

// ---------- Gebäude & Events ----------
const BUILD = {
  tree:          { de: 'Baum',           plural: 'Bäume',          value: 1,    residents: 0,   nature: true },
  flowers:       { de: 'Blumenbeet',     plural: 'Blumenbeete',    value: 1,    residents: 0,   nature: true },
  house:         { de: 'Kleines Haus',   plural: 'Kleine Häuser',  value: 3,    residents: 4 },
  familyHouse:   { de: 'Familienhaus',   plural: 'Familienhäuser', value: 5,    residents: 6 },
  followerHouse: { de: 'Haus mit Namensschild', plural: 'Follower-Häuser', value: 5, residents: 3 },
  shop:          { de: 'Laden',          plural: 'Läden',          value: 15,   residents: 2 },
  apartment:     { de: 'Wohnhaus',       plural: 'Wohnhäuser',     value: 40,   residents: 40 },
  park:          { de: 'Park',           plural: 'Parks',          value: 30,   residents: 0 },
  skyscraper:    { de: 'Wolkenkratzer',  plural: 'Wolkenkratzer',  value: 250,  residents: 300 },
  tower:         { de: 'Fernsehturm',    plural: 'Fernsehtürme',   value: 600,  residents: 0 },
  stadium:       { de: 'Stadion',        plural: 'Stadien',        value: 1500, residents: 0, size: 2 },
};
const EVENTS = { fireworks: 'Feuerwerk', daynight: 'Tag/Nacht-Wechsel', festival: 'Stadtfest', cars: 'Autos', confetti: 'Konfetti' };

let CFG = null;
let S = null;            // gespeicherter Zustand
let occ = new Map();     // belegte Felder
let queue = [];          // Bau-Warteschlange
let walkers = [], cars = [], particles = [], skyParticles = [], rockets = [], toasts = [], banners = [];
let nightT = 0, camScale = 1.6, time = 0, lastBuildAt = 0, dirty = false;
let conn = { mode: 'connecting', text: 'Verbinde mit Server …' };
let ws = null;
function sendServer(msg) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; }
const cooldowns = new Map();
const stars = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * 1100, r: Math.random() * 1.8 + .4, p: Math.random() * 6 }));
const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random() * W, y: 330 + Math.random() * 420, s: .6 + Math.random() * .8, v: 6 + Math.random() * 10 }));

// ---------- Hilfsfunktionen ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (n, m) => ((n % m) + m) % m;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const fmt = (n) => Math.round(n).toLocaleString('de-DE');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hexCache = {};
function hex(c) { if (hexCache[c]) return hexCache[c]; if (c.startsWith('rgb')) return (hexCache[c] = c.match(/[\d.]+/g).slice(0, 3).map(Number)); const n = parseInt(c.slice(1), 16); return (hexCache[c] = [n >> 16 & 255, n >> 8 & 255, n & 255]); }
// Farbe mit Helligkeit k und Nacht-Abdunklung
function col(c, k = 1, a = 1) {
  const [r0, g0, b0] = hex(c); const n = nightT * .62;
  const r = clamp(r0 * k, 0, 255) * (1 - n) + 18 * n, g = clamp(g0 * k, 0, 255) * (1 - n) + 24 * n, b = clamp(b0 * k, 0, 255) * (1 - n) + 60 * n;
  return a === 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, i) => (v + (b[i] - v) * t) | 0).join(',')})`; }

// Isometrische Projektion (Welt-Koordinaten → Pixel vor Kamera)
const TW = 64, TH = 32;
const P = (x, y, z = 0) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z });
const camX = () => W / 2, camY = () => 1150;
const toScreen = (p) => ({ x: camX() + p.x * camScale, y: camY() + p.y * camScale });

function poly(pts, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function isoBox(x0, y0, x1, y1, z0, h, c, kTop = 1.1, kL = .92, kR = .72) {
  const t = z0 + h;
  poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, t), P(x0, y1, t)], col(c, kL));
  poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, t), P(x1, y0, t)], col(c, kR));
  poly([P(x0, y0, t), P(x1, y0, t), P(x1, y1, t), P(x0, y1, t)], col(c, kTop));
}
// Rechteck auf einer Gebäudeseite ('L' = vordere linke Seite y=y1, 'R' = rechte Seite x=x1)
function facePt(face, b, u, z) { return face === 'L' ? P(b[0] + (b[2] - b[0]) * u, b[3], z) : P(b[2], b[1] + (b[3] - b[1]) * u, z); }
function faceRect(face, b, u0, u1, z0, z1, fill) { poly([facePt(face, b, u0, z0), facePt(face, b, u1, z0), facePt(face, b, u1, z1), facePt(face, b, u0, z1)], fill); }
function windowColor(lit, dayCol = '#a9d3f0') { return mix(dayCol, lit ? '#ffd970' : '#1a2238', nightT); }
function windowsGrid(b, cols, rows, zStart, floorH, maxZ, rnd, opts = {}) {
  const ww = opts.ww ?? .5, wh = opts.wh ?? .5;
  for (const face of ['L', 'R']) {
    for (let r = 0; r < rows; r++) {
      const z0 = zStart + r * floorH + floorH * (1 - wh) / 2, z1 = z0 + floorH * wh;
      for (let c = 0; c < cols; c++) {
        const lit = rnd() < (opts.lit ?? .7);
        if (z1 > maxZ) continue;
        const cw = 1 / cols, u0 = c * cw + cw * (1 - ww) / 2, u1 = u0 + cw * ww;
        faceRect(face, b, u0, u1, z0, z1, windowColor(lit, opts.day));
      }
    }
  }
}
function glow(x, y, r, color, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function roundRect(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// ---------- Zustand ----------
function freshState() { return { buildings: [], R: 3, board: {}, stats: { coins: 0, gifts: 0, likes: 0, follows: 0, likeAcc: 0, growthAcc: 0 }, night: false, seed: 1 }; }
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s && s.buildings) return Object.assign(freshState(), s); } catch { }
  return freshState();
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S, (k, v) => (k === 'born' || k === 'labelUntil') ? undefined : v)); } catch { } dirty = false; }
function rebuildOcc() { occ = new Map(); for (const b of S.buildings) for (const [x, y] of tilesOf(b)) occ.set(x + ',' + y, b); }
function tilesOf(b) { const n = BUILD[b.t]?.size || 1; const r = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) r.push([b.x + i, b.y + j]); return r; }
const isRoad = (x, y) => mod(x + 2, 4) === 0 || mod(y + 2, 4) === 0;
const isNode = (x, y) => mod(x + 2, 4) === 0 && mod(y + 2, 4) === 0;
const MAX_R = 17;

function resetCity() {
  S = freshState(); rebuildOcc(); queue = []; walkers = []; cars = []; particles = []; toasts = []; banners = [];
  save(); addToast({ emoji: '🧹', text: 'Die Stadt wurde zurückgesetzt. Schickt Geschenke zum Bauen!', color: '#7f8c8d' });
}

// ---------- Platzsuche ----------
function freeSpots(size) {
  const R = S.R, res = [];
  for (let x = -R; x <= R - size + 1; x++) for (let y = -R; y <= R - size + 1; y++) {
    let ok = true;
    for (let i = 0; i < size && ok; i++) for (let j = 0; j < size && ok; j++) if (isRoad(x + i, y + j) || occ.has((x + i) + ',' + (y + j))) ok = false;
    if (ok) res.push([x, y]);
  }
  return res;
}
function findSpot(type) {
  const def = BUILD[type], size = def.size || 1;
  for (let tries = 0; tries < 6; tries++) {
    const spots = freeSpots(size);
    if (spots.length) {
      const jitter = def.nature ? 4 : (def.value >= 250 ? .4 : 1.2);
      const bias = def.value >= 250 ? 0 : 0; // große Gebäude: möglichst zentral
      spots.sort((a, b) => (Math.hypot(a[0] + size / 2, a[1] + size / 2) + Math.random() * jitter + bias) - (Math.hypot(b[0] + size / 2, b[1] + size / 2) + Math.random() * jitter + bias));
      return spots[0];
    }
    // kein Platz: Bäume/Blumen für echte Gebäude abreißen (nur 1x1)
    if (!def.nature && size === 1) {
      const nat = S.buildings.filter(b => BUILD[b.t].nature).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
      if (nat.length && (S.R >= MAX_R || Math.random() < .5)) { removeBuilding(nat[0]); return [nat[0].x, nat[0].y]; }
    }
    if (S.R < MAX_R) {
      S.R++;
      addToast({ emoji: '🏗️', text: `Die Stadt wächst! Neues Bauland erschlossen (${2 * S.R + 1}×${2 * S.R + 1})`, color: '#27ae60' });
    } else if (size === 1) {
      const nat = S.buildings.find(b => BUILD[b.t].nature); if (nat) { removeBuilding(nat); return [nat.x, nat.y]; }
      return null;
    } else return null;
  }
  return null;
}
function removeBuilding(b) { S.buildings.splice(S.buildings.indexOf(b), 1); for (const [x, y] of tilesOf(b)) occ.delete(x + ',' + y); }

const palettes = {
  wall: ['#f4e1c1', '#f7d6d0', '#dfe9f3', '#e8f0d8', '#fff2b3', '#f9e0b0'],
  roof: ['#c0392b', '#d35400', '#8e44ad', '#34495e', '#16a085', '#b03a2e', '#2e86c1'],
  apt: ['#e0b089', '#c9d6df', '#f0c987', '#d7bde2', '#a9cce3', '#e6b0aa', '#f5cba7'],
  glass: ['#5dade2', '#48c9b0', '#7f8c8d', '#5d6d7e', '#85c1e9', '#76d7c4'],
  shop: [['#e74c3c', '#ffffff'], ['#27ae60', '#ffffff'], ['#2980b9', '#ffffff'], ['#f39c12', '#ffffff'], ['#8e44ad', '#f5eef8']],
};

function build(item) {
  const spot = findSpot(item.t);
  if (!spot) return false;
  const b = { t: item.t, x: spot[0], y: spot[1], o: item.owner || '', n: item.name || '', s: (Math.random() * 1e9) | 0 };
  b.born = performance.now();
  // Namens-Label nur für echte Gebäude und nicht doppelt bei Combos
  const recent = S.buildings.some(o => o.o === b.o && o.labelUntil && o.labelUntil - b.born > 3300);
  b.labelUntil = item.owner && !BUILD[b.t].nature && !recent ? b.born + 4500 : 0;
  S.buildings.push(b); for (const [x, y] of tilesOf(b)) occ.set(x + ',' + y, b);
  Sound.build(b.t);
  // Bau-Effekte
  const size = BUILD[b.t].size || 1, c = P(b.x + (size - 1) / 2, b.y + (size - 1) / 2, 0);
  const big = BUILD[b.t].value >= 250;
  for (let i = 0; i < (big ? 60 : 18); i++) particles.push({ x: c.x + rand(-20, 20) * size, y: c.y + rand(-6, 6), vx: rand(-40, 40), vy: rand(-50, -10), g: 60, life: rand(.6, 1.2), max: 1.2, size: rand(3, 7), color: 'rgba(200,180,150,A)', kind: 'dust' });
  for (let i = 0; i < (big ? 50 : 14); i++) particles.push({ x: c.x, y: c.y - 20, vx: rand(-90, 90), vy: rand(-160, -40), g: 220, life: rand(.7, 1.4), max: 1.4, size: rand(2, 4), color: pick(['rgba(255,215,0,A)', 'rgba(255,255,255,A)', 'rgba(255,120,200,A)', 'rgba(120,220,255,A)']), kind: 'spark' });
  if (b.t === 'skyscraper' || b.t === 'apartment' || b.t === 'shop') ensureCars();
  dirty = true; return true;
}

// ---------- Bewohner & Autos ----------
function roadLines() { const r = []; for (let c = -S.R; c <= S.R; c++) if (mod(c + 2, 4) === 0) r.push(c); return r; }
function spawnMover(isCar) {
  const lines = roadLines(); if (!lines.length) return null;
  const horiz = Math.random() < .5, line = pick(lines), pos = Math.round(rand(-S.R, S.R));
  const m = { x: horiz ? pos : line, y: horiz ? line : pos, dx: horiz ? (Math.random() < .5 ? 1 : -1) : 0, dy: 0, prog: Math.random(), car: isCar,
    speed: isCar ? rand(1.4, 2.4) : rand(.35, .7), color: isCar ? pick(['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#9b59b6', '#e67e22', '#34495e']) : pick(['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fb5']),
    side: Math.random() < .5 ? -1 : 1, phase: Math.random() * 6 };
  if (!horiz) { m.dx = 0; m.dy = Math.random() < .5 ? 1 : -1; }
  return m;
}
function ensureCars() {
  const want = Math.min(40, Math.floor(S.buildings.filter(b => !BUILD[b.t].nature).length / 3) + (S.extraCars || 0));
  while (cars.length < want) { const c = spawnMover(true); if (!c) break; cars.push(c); }
}
function ensureWalkers() {
  const L = CFG.likes;
  const want = Math.min(L.maxWalkers, Math.floor(S.stats.likes / L.likesPerWalker) + Math.floor(residents() / 25));
  while (walkers.length < want) { const w = spawnMover(false); if (!w) break; walkers.push(w); }
}
function stepMover(m, dt) {
  m.prog += m.speed * dt;
  while (m.prog >= 1) {
    m.prog -= 1; m.x += m.dx; m.y += m.dy;
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const nx = m.x + dx, ny = m.y + dy;
      return Math.abs(nx) <= S.R && Math.abs(ny) <= S.R && isRoad(nx, ny) && (isNode(m.x, m.y) || (dx !== 0 ? mod(m.y + 2, 4) === 0 : mod(m.x + 2, 4) === 0));
    });
    const straight = opts.find(([dx, dy]) => dx === m.dx && dy === m.dy);
    const noBack = opts.filter(([dx, dy]) => !(dx === -m.dx && dy === -m.dy));
    let d = straight && Math.random() < .65 ? straight : (noBack.length ? pick(noBack) : opts[0]);
    if (!d) { d = [-m.dx, -m.dy]; }
    m.dx = d[0]; m.dy = d[1];
  }
}
function moverPos(m) {
  let x = m.x + m.dx * m.prog, y = m.y + m.dy * m.prog;
  // Seitlicher Versatz: Autos rechts fahren, Fußgänger auf dem Gehweg
  const off = m.car ? .17 : .36 * m.side;
  x += -m.dy * off * (m.car ? 1 : 1); y += m.dx * off;
  return { x, y };
}
function residents() { return S.buildings.reduce((a, b) => a + (BUILD[b.t]?.residents || 0), 0); }
function points() { return S.buildings.reduce((a, b) => a + (BUILD[b.t]?.value || 0), 0) + Math.floor(S.stats.likes / 100); }

// ---------- Event-Verarbeitung ----------
function giftDef(name, diamonds) {
  const key = Object.keys(CFG.gifts).find(k => k.toLowerCase() === String(name).toLowerCase() || (CFG.gifts[k].de || '').toLowerCase() === String(name).toLowerCase());
  if (key) return { key, ...CFG.gifts[key] };
  const tiers = [...CFG.unknownGiftTiers].sort((a, b) => a.min - b.min);
  let t = tiers[0]; for (const x of tiers) if ((diamonds || 1) >= x.min) t = x;
  return { key: name, de: name, emoji: '🎁', diamonds: diamonds || 1, actions: t.actions };
}
function describe(actions, mult = 1) {
  return actions.map(a => {
    if (a.build) { const n = (a.count || 1) * mult; const d = BUILD[a.build]; return n > 1 ? `${n}× ${d.de}` : d.de; }
    return EVENTS[a.event] || a.event;
  }).join(' + ');
}
function runActions(actions, mult, owner, extra = {}) {
  for (const a of actions) {
    if (a.build && BUILD[a.build]) {
      const n = Math.min((a.count || 1) * mult, CFG.maxQueue);
      for (let i = 0; i < n && queue.length < CFG.maxQueue; i++) queue.push({ t: a.build, owner, name: extra.name });
    } else if (a.event) triggerEvent(a.event, a, mult);
  }
}
function triggerEvent(name, a, mult) {
  if (name === 'fireworks') launchFireworks(a.small ? 3 : Math.min(30, 8 * mult), a.small ? 1.5 : 4);
  else if (name === 'daynight') { S.night = !S.night; dirty = true; }
  else if (name === 'festival') { launchFireworks(40, 8); confetti(260); S.night = true; dirty = true; }
  else if (name === 'confetti') confetti(120 * Math.min(3, mult));
  else if (name === 'cars') { S.extraCars = (S.extraCars || 0) + (a.count || 4) * mult; ensureCars(); dirty = true; }
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;
  const nick = ev.nickname || ev.user || 'Jemand';
  if (ev.type === 'gift') {
    const g = giftDef(ev.giftName, ev.diamonds), count = Math.max(1, ev.count || 1);
    const coins = (g.diamonds || ev.diamonds || 1) * count;
    const u = ev.user || nick; S.board[u] = S.board[u] || { name: nick, coins: 0 }; S.board[u].name = nick; S.board[u].coins += coins;
    S.stats.coins += coins; S.stats.gifts += count; dirty = true;
    runActions(g.actions, count, nick);
    // Toast (Combos werden zusammengefasst)
    const key = 'g:' + u + ':' + g.key; const ex = toasts.find(t => t.key === key && time - t.born < 6);
    const total = (ex ? ex.count : 0) + count;
    const giftTxt = `${g.de || g.key}${total > 1 ? ' ×' + total : ''}`;
    const text = `${nick} hat ${giftTxt} geschickt → ${describe(g.actions, total)}`;
    if (ex) { ex.count = total; ex.text = text; ex.born = time; ex.pulse = time; }
    else addToast({ key, count, emoji: g.emoji || '🎁', text, color: g.diamonds >= 1000 ? '#c0392b' : g.diamonds >= 30 ? '#8e44ad' : '#ff2d6f' });
    if ((g.diamonds || 0) >= 1000 && !ev.repeatOnly) { Sound.fx.fanfare(); } if ((g.diamonds || 0) >= 1000 && !ev.repeatOnly) banners.push({ born: time, emoji: g.emoji || '🎁', title: `${(g.de || g.key).toUpperCase()} von ${nick}!`, sub: describe(g.actions, count) + ' entsteht!' });
  } else if (ev.type === 'like') {
    const n = Math.max(1, ev.likeCount || 1), L = CFG.likes;
    S.stats.likes += n; S.stats.growthAcc += n; dirty = true;
    while (S.stats.growthAcc >= L.likesPerGrowth) { S.stats.growthAcc -= L.likesPerGrowth; queue.push({ t: L.growthBuild || 'flowers', owner: '' }); }
    ensureWalkers(); Sound.fx.like();
    for (let i = 0; i < Math.min(8, 1 + n / 10); i++) skyParticles.push({ x: rand(780, 1040), y: rand(1450, 1560), vx: rand(-30, 30), vy: rand(-180, -90), g: 0, life: rand(1.2, 2), max: 2, size: rand(26, 44), text: pick(['❤️', '💖', '💗']), kind: 'text' });
    if (n >= 50) addToast({ key: 'l:' + ev.user, emoji: '❤️', text: `${nick} hat ${fmt(n)} Likes geschickt → neue Spaziergänger`, color: '#e84393', small: true });
  } else if (ev.type === 'follow') {
    S.stats.follows++; dirty = true; Sound.fx.follow();
    if (CFG.follow?.enabled !== false && !S.buildings.some(b => b.t === 'followerHouse' && b.n === nick) && !queue.some(q => q.name === nick)) queue.push({ t: CFG.follow?.build || 'followerHouse', owner: nick, name: nick });
    addToast({ emoji: '➕', text: `${nick} folgt jetzt → ${BUILD[CFG.follow?.build || 'followerHouse'].de}`, color: '#00b894' });
  } else if (ev.type === 'share') {
    if (CFG.share?.enabled !== false) { runActions(CFG.share.actions || [], 1, nick); addToast({ emoji: '🔗', text: `${nick} hat den LIVE geteilt → ${describe(CFG.share.actions || [])}`, color: '#0984e3', small: true }); }
  } else if (ev.type === 'chat') {
    if (!CFG.commands?.enabled) return;
    const msg = String(ev.comment || '').trim().toLowerCase();
    const cmdKey = Object.keys(CFG.commands.list).find(k => msg === k || msg.startsWith(k + ' '));
    if (!cmdKey) return;
    const c = CFG.commands.list[cmdKey], now = Date.now();
    const uk = cmdKey + ':' + (ev.user || nick), gk = cmdKey + ':*';
    if ((cooldowns.get(uk) || 0) > now || (cooldowns.get(gk) || 0) > now) return;
    cooldowns.set(uk, now + (c.cooldownSec || 0) * 1000); cooldowns.set(gk, now + (c.globalCooldownSec || 0) * 1000);
    runActions(c.actions, 1, nick); Sound.fx.chat();
    addToast({ emoji: '💬', text: `${nick}: ${cmdKey} → ${c.label || describe(c.actions)}`, color: '#6c5ce7', small: true });
  } else if (ev.type === 'status') {
    conn = ev;
  } else if (ev.type === 'command' && ev.name === 'reset') resetCity();
}

// ---------- Effekte ----------
function launchFireworks(n, overSec) {
  for (let i = 0; i < n; i++) rockets.push({ delay: Math.random() * overSec, x: rand(120, 960), y: 1250, vy: rand(-900, -700), ty: rand(330, 800), color: pick(['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ffdb', '#f72585', '#b8f2e6', '#ff9e00', '#ffffff']) });
}
function confetti(n) {
  Sound.fx.confetti();
  for (let i = 0; i < n; i++) skyParticles.push({ x: rand(0, W), y: rand(-200, -10), vx: rand(-40, 40), vy: rand(120, 300), g: 30, life: rand(3, 6), max: 6, size: rand(8, 16), rot: rand(0, 6), vr: rand(-6, 6), color: pick(['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ffdb', '#f72585', '#9b5de5', '#00f5d4']), kind: 'confetti' });
}
function addToast(t) {
  t.born = time; t.count = t.count || 1;
  toasts.unshift(t);
  if (toasts.length > 12) toasts.length = 12;
}

// ---------- Zeichnen: Welt ----------
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix('#6ec6ff', '#0b1026', nightT)); g.addColorStop(.45, mix('#bfe6ff', '#1b1f4a', nightT)); g.addColorStop(1, mix('#e8f7ff', '#2a1f4f', nightT));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (nightT > .01) { for (const s of stars) { ctx.globalAlpha = nightT * (.5 + .5 * Math.sin(time * 2 + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
  // Sonne / Mond
  const sx = 170, sy = 760 - Math.sin((1 - nightT) * Math.PI / 2) * 60;
  if (nightT < .99) { ctx.globalAlpha = 1 - nightT; glow(sx, sy, 150, 'rgba(255,230,120,A)', .55); ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(sx, sy, 55, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (nightT > .01) { ctx.globalAlpha = nightT; glow(910, 700, 120, 'rgba(200,220,255,A)', .3); ctx.fillStyle = '#f4f1de'; ctx.beginPath(); ctx.arc(910, 700, 46, 0, 7); ctx.fill(); ctx.fillStyle = mix('#bfe6ff', '#1b1f4a', nightT); ctx.beginPath(); ctx.arc(930, 688, 40, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  // Wolken
  for (const c of clouds) {
    c.x += c.v * c.s * (1 / 60); if (c.x > W + 200) c.x = -200;
    ctx.fillStyle = `rgba(255,255,255,${.85 - nightT * .78})`;
    for (const [dx, dy, r] of [[0, 0, 40], [40, 8, 32], [-40, 10, 30], [15, -18, 30]]) { ctx.beginPath(); ctx.arc(c.x + dx * c.s, c.y + dy * c.s, r * c.s, 0, 7); ctx.fill(); }
  }
  // Ferne Hügel
  ctx.fillStyle = mix('#9fd8a0', '#18213f', nightT);
  ctx.beginPath(); ctx.moveTo(0, 1200); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 1080 + Math.sin(x / 140) * 40 + Math.sin(x / 57) * 14); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  ctx.fillStyle = mix('#7cc47f', '#121a33', nightT);
  ctx.beginPath(); ctx.moveTo(0, 1300); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 1180 + Math.sin(x / 90 + 2) * 30); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
}

function drawGround() {
  const R = S.R, e = R + .5;
  // Inselrand (Erde)
  const thick = 26;
  poly([P(-e, e), P(e, e), P(e, e, -thick), P(-e, e, -thick)], col('#8d5a2b', 1));
  poly([P(e, -e), P(e, e), P(e, e, -thick), P(e, -e, -thick)], col('#6b4220', 1));
  poly([P(-e, e), P(e, e), P(e, e, -6), P(-e, e, -6)], col('#4caf50', .8));
  poly([P(e, -e), P(e, e), P(e, e, -6), P(e, -e, -6)], col('#4caf50', .65));
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) {
    const pts = [P(x - .5, y - .5), P(x + .5, y - .5), P(x + .5, y + .5), P(x - .5, y + .5)];
    if (isRoad(x, y)) {
      poly(pts, col('#5d6470'));
      // Gehweg-Kanten + Mittellinie
      const n = isNode(x, y);
      if (!n) {
        const h = mod(y + 2, 4) === 0; ctx.lineWidth = 1.4; ctx.strokeStyle = col('#f5f5f5', 1, .8); ctx.beginPath();
        if (h) { const a = P(x - .22, y), b = P(x + .22, y); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } else { const a = P(x, y - .22), b = P(x, y + .22); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      } else poly([P(x - .3, y - .3), P(x + .3, y - .3), P(x + .3, y + .3), P(x - .3, y + .3)], col('#666e7a'));
    } else {
      const v = (mulberry32(x * 928371 + y * 1237)() - .5) * .08;
      poly(pts, col('#7bc96f', 1 + v));
    }
  }
  // Gehwege (dünne helle Ränder an Straßen)
  ctx.lineWidth = 2.2; ctx.strokeStyle = col('#d9d4c7', 1, .9);
  for (const c of roadLines()) {
    for (const s of [-.5, .5]) {
      let a = P(-e, c + s), b = P(e, c + s); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = P(c + s, -e); b = P(c + s, e); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
}

function pad(x, y, inset, c) { poly([P(x - inset, y - inset), P(x + inset, y - inset), P(x + inset, y + inset), P(x - inset, y + inset)], col(c)); }

function drawTree(b, g, rnd) {
  const x = b.x + (rnd() - .5) * .3, y = b.y + (rnd() - .5) * .3, s = (.8 + rnd() * .5) * g;
  const sway = Math.sin(time * 1.5 + b.s) * 1.2;
  const base = P(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(base.x, base.y, 13 * s, 6 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col('#7b4a26'); ctx.fillRect(base.x - 2 * s, base.y - 14 * s, 4 * s, 14 * s);
  const pine = rnd() < .35, green = pick2(rnd, ['#2ecc71', '#27ae60', '#3fae4a', '#58d68d']);
  if (pine) {
    for (let i = 0; i < 3; i++) poly([{ x: base.x - (14 - i * 3) * s + sway * i * .3, y: base.y - (10 + i * 9) * s }, { x: base.x + (14 - i * 3) * s + sway * i * .3, y: base.y - (10 + i * 9) * s }, { x: base.x + sway * (i + 1) * .3, y: base.y - (28 + i * 9) * s }], col('#1e8449', 1 + i * .08));
  } else {
    for (const [dx, dy, r, k] of [[-5, -22, 10, .9], [5, -22, 10, .8], [0, -30, 11, 1.05]]) { ctx.fillStyle = col(green, k); ctx.beginPath(); ctx.arc(base.x + (dx + sway) * s, base.y + dy * s, r * s, 0, 7); ctx.fill(); }
    ctx.fillStyle = col('#ffffff', 1, .25); ctx.beginPath(); ctx.arc(base.x + (-3 + sway) * s, base.y - 34 * s, 4 * s, 0, 7); ctx.fill();
  }
}
const pick2 = (rnd, a) => a[Math.floor(rnd() * a.length)];
function drawFlowers(b, g, rnd) {
  pad(b.x, b.y, .32 * g, '#6b8e23');
  for (let i = 0; i < 14; i++) {
    const p = P(b.x + (rnd() - .5) * .55, b.y + (rnd() - .5) * .55); const c = pick2(rnd, ['#ff6b81', '#ffd32a', '#ffffff', '#c56cf0', '#ff9f43']);
    ctx.fillStyle = col('#2d8a34'); ctx.fillRect(p.x - .7, p.y - 5 * g, 1.4, 5 * g);
    ctx.fillStyle = col(c); ctx.beginPath(); ctx.arc(p.x, p.y - 6 * g, 2.6 * g, 0, 7); ctx.fill();
  }
  // Busch
  const p = P(b.x - .2, b.y - .2); ctx.fillStyle = col('#2e9e4f'); ctx.beginPath(); ctx.arc(p.x, p.y - 6 * g, 8 * g, 0, 7); ctx.fill();
}
function drawHouse(b, g, rnd, floors = 1, sign = false) {
  const wall = pick2(rnd, palettes.wall), roof = pick2(rnd, palettes.roof);
  const r = floors > 1 ? .36 : .3, x0 = b.x - r, x1 = b.x + r, y0 = b.y - r, y1 = b.y + r;
  pad(b.x, b.y, .44, '#cfc8b8');
  const fh = 20, h = fh * floors * g, rh = 16 * g;
  isoBox(x0, y0, x1, y1, 0, h, wall);
  const bx = [x0, y0, x1, y1];
  windowsGrid(bx, 2, floors, 0, fh * g, h, rnd, { ww: .42, wh: .42 });
  faceRect('L', bx, .42, .58, 0, Math.min(h, 12 * g), col('#7b4a26')); // Tür
  // Satteldach
  const e = .05, X0 = x0 - e, X1 = x1 + e, Y0 = y0 - e, Y1 = y1 + e, cx = b.x;
  poly([P(X0, Y0, h), P(X0, Y1, h), P(cx, Y1, h + rh), P(cx, Y0, h + rh)], col(roof, .95));
  poly([P(X1, Y0, h), P(X1, Y1, h), P(cx, Y1, h + rh), P(cx, Y0, h + rh)], col(roof, .75));
  poly([P(x0, y1, h), P(x1, y1, h), P(cx, y1, h + rh)], col(wall, .92));
  // Schornstein
  if (rnd() < .6) isoBox(x1 - .14, y0 + .05, x1 - .04, y0 + .15, h + 2, 14 * g, '#8d6e63');
  if (sign) drawSign(b, g);
}
function drawSign(b, g) {
  const base = P(b.x - .1, b.y + .5);
  ctx.fillStyle = col('#6d4c41'); ctx.fillRect(base.x - 1.2, base.y - 26 * g, 2.4, 26 * g);
  const fs = Math.max(9, 12 / camScale);
  ctx.font = `bold ${fs}px ${FONT}`; const tw = ctx.measureText(b.n).width + 10;
  roundRect(base.x - tw / 2, base.y - 26 * g - fs - 6, tw, fs + 8, 3, col('#fff8e1'), col('#6d4c41'), 1.2);
  ctx.fillStyle = col('#3e2723'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.n, base.x, base.y - 26 * g - fs / 2 - 2);
}
function drawShop(b, g, rnd) {
  const [aw, aw2] = pick2(rnd, palettes.shop);
  const r = .38, x0 = b.x - r, x1 = b.x + r, y0 = b.y - r, y1 = b.y + r, h = 26 * g;
  pad(b.x, b.y, .46, '#d5d0c4');
  isoBox(x0, y0, x1, y1, 0, h, '#f2efe8');
  const bx = [x0, y0, x1, y1];
  faceRect('L', bx, .1, .9, 3 * g, 15 * g, windowColor(true, '#bfe3f5'));
  faceRect('R', bx, .15, .45, 3 * g, 15 * g, windowColor(true, '#bfe3f5'));
  faceRect('R', bx, .6, .85, 0, 14 * g, col('#7b4a26'));
  // Markise (gestreift)
  for (let i = 0; i < 8; i++) {
    const u0 = i / 8, u1 = (i + 1) / 8, c = i % 2 ? aw2 : aw;
    poly([P(x0 + (x1 - x0) * u0, y1, 19 * g), P(x0 + (x1 - x0) * u1, y1, 19 * g), P(x0 + (x1 - x0) * u1, y1 + .16, 14 * g), P(x0 + (x1 - x0) * u0, y1 + .16, 14 * g)], col(c, .95));
  }
  // Schild auf dem Dach
  isoBox(b.x - .2, b.y - .05, b.x + .2, b.y + .05, h, 9 * g, aw, 1.1, 1, .8);
  if (nightT > .3) { const p = P(b.x, b.y + .05, h + 5 * g); ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y, 22, 'rgba(255,200,120,A)', .35 * nightT); ctx.globalCompositeOperation = 'source-over'; }
}
function drawApartment(b, g, rnd) {
  const wall = pick2(rnd, palettes.apt), floors = 3 + Math.floor(rnd() * 3);
  const r = .38, x0 = b.x - r, x1 = b.x + r, y0 = b.y - r, y1 = b.y + r, fh = 17, h = (floors * fh + 4) * g;
  pad(b.x, b.y, .46, '#c8c2b4');
  isoBox(x0, y0, x1, y1, 0, h, wall);
  const bx = [x0, y0, x1, y1];
  windowsGrid(bx, 3, floors, 2 * g, fh * g, h, rnd, { ww: .5, wh: .5, lit: .6 });
  // Balkone
  for (let f = 1; f < floors; f++) { const z = (2 + f * fh) * g; poly([P(x0 + .2, y1, z), P(x0 + .45, y1, z), P(x0 + .45, y1 + .08, z), P(x0 + .2, y1 + .08, z)], col('#ecf0f1')); }
  isoBox(x0 - .02, y0 - .02, x1 + .02, y1 + .02, h, 3 * g, wall, 1.15, .8, .6);
  isoBox(b.x - .1, b.y - .15, b.x + .08, b.y + .05, h + 3 * g, 7 * g, '#bdc3c7');
}
function drawSkyscraper(b, g, rnd) {
  const glass = pick2(rnd, palettes.glass), H0 = 130 + rnd() * 90;
  const r = .37, x0 = b.x - r, x1 = b.x + r, y0 = b.y - r, y1 = b.y + r, h = H0 * g;
  pad(b.x, b.y, .47, '#bdbdbd');
  isoBox(x0, y0, x1, y1, 0, h, glass, 1.15, .95, .7);
  const bx = [x0, y0, x1, y1];
  windowsGrid(bx, 4, Math.floor(h / 9), 4, 9, h - 4, rnd, { ww: .62, wh: .55, lit: .55, day: mix(glass, '#ffffff', .45) });
  // Spiegelung
  ctx.globalAlpha = .18 * (1 - nightT); poly([facePt('R', bx, .1, h * .2), facePt('R', bx, .35, h * .2), facePt('R', bx, .1, h * .95)], '#ffffff'); ctx.globalAlpha = 1;
  // Aufbau + Antenne
  const r2 = .22; isoBox(b.x - r2, b.y - r2, b.x + r2, b.y + r2, h, 14 * g, glass, 1.15, .9, .65);
  const top = P(b.x, b.y, h + 14 * g); ctx.strokeStyle = col('#7f8c8d'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x, top.y - 26 * g); ctx.stroke();
  if (g >= 1 && Math.sin(time * 4 + b.s) > 0) { ctx.globalCompositeOperation = 'lighter'; glow(top.x, top.y - 26, 9, 'rgba(255,40,40,A)', .9); ctx.globalCompositeOperation = 'source-over'; }
}
function drawTower(b, g, rnd) {
  pad(b.x, b.y, .46, '#bdbdbd');
  const h = 240 * g, base = P(b.x, b.y);
  isoBox(b.x - .2, b.y - .2, b.x + .2, b.y + .2, 0, 14 * g, '#95a5a6');
  // Schaft
  const sw = 7;
  const gr = ctx.createLinearGradient(base.x - sw, 0, base.x + sw, 0); gr.addColorStop(0, col('#f0f0f0')); gr.addColorStop(1, col('#a8a8a8'));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(base.x - sw * 1.4, base.y - 12 * g); ctx.lineTo(base.x - sw * .7, base.y - h * .75); ctx.lineTo(base.x + sw * .7, base.y - h * .75); ctx.lineTo(base.x + sw * 1.4, base.y - 12 * g); ctx.fill();
  // Kugel
  const ky = base.y - h * .75;
  const kg = ctx.createRadialGradient(base.x - 6, ky - 6, 2, base.x, ky, 18); kg.addColorStop(0, col('#ffffff')); kg.addColorStop(1, col('#7f8c8d'));
  ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(base.x, ky, 18 * Math.min(1, g * 1.2), 0, 7); ctx.fill();
  ctx.fillStyle = windowColor(true, '#5dade2'); ctx.fillRect(base.x - 17, ky - 2, 34, 4);
  ctx.fillStyle = col('#e74c3c'); ctx.fillRect(base.x - 3, ky - h * .25, 6, h * .25 - 16);
  ctx.strokeStyle = col('#bdc3c7'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(base.x, ky - h * .25); ctx.lineTo(base.x, ky - h * .25 - 30 * g); ctx.stroke();
  if (g >= 1 && Math.sin(time * 3 + b.s) > -.2) { ctx.globalCompositeOperation = 'lighter'; glow(base.x, ky - h * .25 - 30, 12, 'rgba(255,40,40,A)', 1); ctx.globalCompositeOperation = 'source-over'; }
}
function drawPark(b, g, rnd) {
  pad(b.x, b.y, .5, '#5fbf5a');
  poly([P(b.x - .5, b.y - .06), P(b.x + .5, b.y - .06), P(b.x + .5, b.y + .06), P(b.x - .5, b.y + .06)], col('#e0cda9'));
  poly([P(b.x - .06, b.y - .5), P(b.x + .06, b.y - .5), P(b.x + .06, b.y + .5), P(b.x - .06, b.y + .5)], col('#e0cda9'));
  const c = P(b.x, b.y);
  ctx.fillStyle = col('#b0b7bf'); ctx.beginPath(); ctx.ellipse(c.x, c.y, 15 * g, 7.5 * g, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col('#4fc3f7'); ctx.beginPath(); ctx.ellipse(c.x, c.y - 1, 12 * g, 5.5 * g, 0, 0, 7); ctx.fill();
  if (g >= 1) for (let i = 0; i < 8; i++) { const t = (time * 1.4 + i / 8) % 1, a = i / 8 * Math.PI * 2; ctx.fillStyle = `rgba(200,240,255,${1 - t})`; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * 9 * t, c.y - 4 - 16 * Math.sin(t * Math.PI) , 1.6, 0, 7); ctx.fill(); }
  for (const [dx, dy] of [[-.3, -.3], [.3, -.3]]) drawTree({ x: b.x + dx, y: b.y + dy, s: b.s + dx * 100 }, g * .7, mulberry32(b.s + dx * 1000 + dy));
  // Bank
  isoBox(b.x + .2, b.y + .25, b.x + .4, b.y + .32, 3, 2, '#8d6e63');
}
function drawStadium(b, g, rnd) {
  const cx = b.x + .5, cy = b.y + .5, c = P(cx, cy), rx = 60, ry = 30, Hh = 28 * g;
  pad(cx, cy, .98, '#bdbdbd');
  ctx.fillStyle = col('#7f8c8d', .8); ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.fill();
  ctx.fillRect(c.x - rx, c.y - Hh, rx * 2, Hh);
  ctx.fillStyle = col('#95a5a6', .7); for (let i = 0; i < 12; i++) { const a = Math.PI * i / 12; ctx.fillRect(c.x - Math.cos(a) * rx * .97 - 2, c.y - Hh + 6 + Math.sin(a) * ry * .97 - 2, 4, Hh - 8); }
  ctx.fillStyle = col('#d0d6dc'); ctx.beginPath(); ctx.ellipse(c.x, c.y - Hh, rx, ry, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col('#2c3e50', 1.1); ctx.beginPath(); ctx.ellipse(c.x, c.y - Hh, rx * .9, ry * .9, 0, 0, 7); ctx.fill();
  // Zuschauer
  const crnd = mulberry32(b.s);
  for (let i = 0; i < 160; i++) { const a = crnd() * Math.PI * 2, rr = .7 + crnd() * .19, j = Math.sin(time * 8 + i) > .6 ? -1.5 : 0;
    ctx.fillStyle = col(pick2(crnd, ['#e74c3c', '#f1c40f', '#ecf0f1', '#3498db', '#e67e22', '#9b59b6'])); ctx.fillRect(c.x + Math.cos(a) * rx * rr - 1, c.y - Hh + Math.sin(a) * ry * rr - 1 + j, 2.2, 2.2); }
  // Spielfeld
  ctx.fillStyle = col('#2ecc71'); ctx.beginPath(); ctx.ellipse(c.x, c.y - Hh * .55, rx * .62, ry * .55, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = col('#ffffff', 1, .85); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(c.x, c.y - Hh * .55, 8, 4, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y - Hh * .55 - ry * .55); ctx.lineTo(c.x, c.y - Hh * .55 + ry * .55); ctx.stroke();
  // Flutlicht
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = c.x + dx * rx * .9, py = c.y - Hh + dy * ry * .75;
    ctx.strokeStyle = col('#7f8c8d'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 34 * g); ctx.stroke();
    ctx.fillStyle = col('#ecf0f1'); ctx.fillRect(px - 5, py - 38 * g, 10, 5);
    if (nightT > .1 && g >= 1) { ctx.globalCompositeOperation = 'lighter'; glow(px, py - 36, 40, 'rgba(255,255,220,A)', .55 * nightT); ctx.globalCompositeOperation = 'source-over'; }
  }
}
const DRAW = {
  tree: drawTree, flowers: drawFlowers, house: (b, g, r) => drawHouse(b, g, r, 1), familyHouse: (b, g, r) => drawHouse(b, g, r, 2),
  followerHouse: (b, g, r) => drawHouse(b, g, r, 1, true), shop: drawShop, apartment: drawApartment, park: drawPark,
  skyscraper: drawSkyscraper, tower: drawTower, stadium: drawStadium,
};
function fullHeight(b) { return { tree: 40, flowers: 10, house: 40, familyHouse: 60, followerHouse: 60, shop: 40, apartment: 100, park: 30, skyscraper: 230, tower: 290, stadium: 70 }[b.t] || 40; }

function drawWalker(m) {
  const p = moverPos(m), s = P(p.x, p.y), bob = Math.abs(Math.sin(time * 9 + m.phase)) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 3, 1.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col('#2d3436'); ctx.fillRect(s.x - 1.6, s.y - 5 - bob, 1.3, 5); ctx.fillRect(s.x + .3, s.y - 5 - bob * .5, 1.3, 5);
  ctx.fillStyle = col(m.color); ctx.beginPath(); ctx.ellipse(s.x, s.y - 8 - bob, 2.8, 3.8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col('#f5cba7'); ctx.beginPath(); ctx.arc(s.x, s.y - 13.5 - bob, 2.3, 0, 7); ctx.fill();
}
function drawCar(m) {
  const p = moverPos(m), lx = m.dx !== 0 ? .26 : .13, ly = m.dx !== 0 ? .13 : .26;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; const s = P(p.x, p.y); ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 6, 0, 0, 7); ctx.fill();
  isoBox(p.x - lx, p.y - ly, p.x + lx, p.y + ly, 2, 6, m.color);
  isoBox(p.x - lx * .55, p.y - ly * .55, p.x + lx * .55, p.y + ly * .55, 8, 4.5, '#cfe8ff', 1.1, .8, .6);
  if (nightT > .2) { const f = P(p.x + m.dx * lx, p.y + m.dy * ly, 4); ctx.globalCompositeOperation = 'lighter'; glow(f.x, f.y, 16, 'rgba(255,240,180,A)', .7 * nightT); ctx.globalCompositeOperation = 'source-over'; }
}
function drawLamp(x, y) {
  const p = P(x + .42, y + .42); ctx.strokeStyle = col('#4a4f57'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 20); ctx.stroke();
  ctx.fillStyle = nightT > .3 ? '#fff3b0' : col('#cfd8dc'); ctx.beginPath(); ctx.arc(p.x, p.y - 21, 2.5, 0, 7); ctx.fill();
  if (nightT > .05) { ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y - 20, 34, 'rgba(255,220,130,A)', .45 * nightT); glow(p.x, p.y, 26, 'rgba(255,210,120,A)', .25 * nightT); ctx.globalCompositeOperation = 'source-over'; }
}

function drawCity(now) {
  ctx.save(); ctx.setTransform(camScale, 0, 0, camScale, camX(), camY());
  drawGround();
  const items = [];
  for (const b of S.buildings) { const n = BUILD[b.t]?.size || 1; items.push({ d: b.x + b.y + (n - 1) * 2, f: () => drawBuilding(b, now) }); }
  for (const w of walkers) { const p = moverPos(w); items.push({ d: p.x + p.y + .01, f: () => drawWalker(w) }); }
  for (const c of cars) { const p = moverPos(c); items.push({ d: p.x + p.y + .02, f: () => drawCar(c) }); }
  for (const c of roadLines()) for (const d of roadLines()) items.push({ d: c + d + .9, f: () => drawLamp(c, d) });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();
  // Partikel (Welt)
  for (const p of particles) { const a = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color.replace('A', a.toFixed(2)); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawBuilding(b, now) {
  const age = b.born ? (now - b.born) / 1000 : 99, dur = BUILD[b.t].value >= 250 ? 1.6 : .9;
  const t = clamp(age / dur, 0, 1), g = Math.max(.02, easeOutBack(t));
  const rnd = mulberry32(b.s);
  if (t < 1) { // Baugerüst
    const n = BUILD[b.t].size || 1, x0 = b.x - .42, y0 = b.y - .42, x1 = b.x + n - 1 + .42, y1 = b.y + n - 1 + .42, fh = fullHeight(b);
    ctx.globalAlpha = (1 - t) * .9; ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 1.5;
    for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0], [x0, y0]]) { const a = P(x, y), c = P(x, y, fh); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); }
    for (let z = 0; z <= fh; z += 14) poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], null, '#f39c12');
    ctx.globalAlpha = 1;
  }
  DRAW[b.t](b, g, rnd);
}

// ---------- Zeichnen: Overlay ----------
let lastLevel = null;
function drawHeader() {
  roundRect(30, 30, 1020, 230, 34, 'rgba(15,15,30,.72)');
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `900 64px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText('🏙️ ' + (CFG.cityName || 'TikTok-Stadt'), 64, 108);
  // Status
  const st = { live: ['#2ecc71', 'LIVE'], sim: ['#f39c12', 'TEST'], connecting: ['#f1c40f', '…'], offline: ['#e74c3c', 'OFFLINE'], error: ['#e74c3c', 'FEHLER'], noserver: ['#e74c3c', 'KEIN SERVER'] }[conn.mode] || ['#999', '?'];
  ctx.font = `800 26px ${FONT}`; const sw = ctx.measureText(st[1]).width + 52;
  roundRect(1016 - sw, 56, sw, 46, 23, 'rgba(255,255,255,.12)');
  ctx.fillStyle = st[0]; ctx.beginPath(); ctx.arc(1016 - sw + 24, 79, 8 + (conn.mode === 'live' ? Math.sin(time * 5) * 2 : 0), 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(st[1], 1016 - sw + 40, 88);
  // Level + Fortschritt
  const pts = points(), lv = CFG.levels; let i = 0; while (i + 1 < lv.length && pts >= lv[i + 1].points) i++;
  const cur = lv[i], next = lv[i + 1];
  if (lastLevel === null) lastLevel = i;
  if (i > lastLevel) { lastLevel = i; Sound.fx.levelUp(); addToast({ emoji: '⭐', text: `Neue Stufe erreicht: ${cur.name}! Danke an alle Unterstützer!`, color: '#f1c40f' }); confetti(150); }
  else if (i < lastLevel) lastLevel = i;
  const frac = next ? (pts - cur.points) / (next.points - cur.points) : 1;
  ctx.font = `800 34px ${FONT}`; ctx.fillStyle = '#ffd166'; ctx.fillText(`Stufe ${i + 1}: ${cur.name}`, 64, 160);
  ctx.font = `600 26px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'right';
  ctx.fillText(next ? `${fmt(pts)} / ${fmt(next.points)} Punkte → ${next.name}` : `${fmt(pts)} Punkte – Maximum!`, 1016, 160);
  ctx.textAlign = 'left';
  roundRect(64, 176, 952, 22, 11, 'rgba(255,255,255,.15)');
  const gr = ctx.createLinearGradient(64, 0, 1016, 0); gr.addColorStop(0, '#ff2d6f'); gr.addColorStop(1, '#ffd166');
  roundRect(64, 176, Math.max(22, 952 * clamp(frac, 0, 1)), 22, 11, gr);
  // Statistiken
  const nb = S.buildings.filter(b => !BUILD[b.t].nature).length;
  ctx.font = `700 28px ${FONT}`; ctx.fillStyle = '#fff';
  const stats = [`🏠 ${fmt(nb)} Gebäude`, `👥 ${fmt(residents() + walkers.length)} Einwohner`, `❤️ ${fmt(S.stats.likes)} Likes`];
  stats.forEach((s, k) => { ctx.textAlign = ['left', 'center', 'right'][k]; ctx.fillText(s, [64, 540, 1016][k], 240); });
  ctx.textAlign = 'left';
}
function drawLeaderboard() {
  if (CFG.layout?.showLeaderboard === false) return;
  const list = Object.values(S.board).sort((a, b) => b.coins - a.coins).slice(0, CFG.layout?.leaderboardSize || 5);
  const x = 700, y = 285, w = 350, h = 70 + Math.max(1, list.length) * 52;
  roundRect(x, y, w, h, 26, 'rgba(15,15,30,.68)');
  ctx.font = `800 30px ${FONT}`; ctx.fillStyle = '#ffd166'; ctx.textAlign = 'left'; ctx.fillText('🏆 Top-Unterstützer', x + 22, y + 46);
  if (!list.length) { ctx.font = `600 24px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('Sei der Erste! 🎁', x + 22, y + 98); return; }
  list.forEach((u, i) => {
    const yy = y + 100 + i * 52;
    ctx.font = `700 26px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.', '9.', '10.'][i], x + 20, yy);
    let name = u.name; while (ctx.measureText(name).width > 170 && name.length > 3) name = name.slice(0, -2);
    if (name !== u.name) name += '…';
    ctx.fillText(name, x + 72, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = '#7fe3ff'; ctx.fillText(`${fmt(u.coins)} 💎`, x + w - 20, yy); ctx.textAlign = 'left';
  });
}
function drawToasts() {
  const max = CFG.layout?.maxToasts || 4; let y = 285; const life = 6;
  toasts = toasts.filter(t => time - t.born < life);
  toasts.slice(0, max).forEach((t) => {
    const age = time - t.born, inT = clamp(age / .35, 0, 1), out = clamp((life - age) / .6, 0, 1);
    const x = 30 - (1 - easeOutBack(inT)) * 700, h = t.small ? 78 : 104, w = 650;
    ctx.globalAlpha = out;
    const pulse = t.pulse ? Math.max(0, 1 - (time - t.pulse) * 3) : 0;
    roundRect(x, y, w, h, 24, 'rgba(15,15,30,.78)', t.color, 4 + pulse * 6);
    ctx.fillStyle = '#fff'; ctx.font = `${t.small ? 44 : 58}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(t.emoji, x + 52, y + h / 2 + 3);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    const fs = t.small ? 24 : 28; ctx.font = `700 ${fs}px ${FONT}`;
    wrapText(t.text, x + 98, y + h / 2, w - 118, fs * 1.18, 2);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    y += h + 14;
  });
}
function wrapText(text, x, cy, maxW, lh, maxLines) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '…'; }
  const y0 = cy - (lines.length - 1) * lh / 2; lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
}
function drawBanners() {
  banners = banners.filter(b => time - b.born < 3.8);
  const b = banners[0]; if (!b) return;
  const age = time - b.born, s = age < .5 ? easeOutBack(age / .5) : 1, a = clamp((3.8 - age) / .5, 0, 1);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 760); ctx.scale(s, s);
  const gr = ctx.createLinearGradient(-480, 0, 480, 0); gr.addColorStop(0, 'rgba(255,45,111,.92)'); gr.addColorStop(1, 'rgba(255,140,0,.92)');
  roundRect(-480, -110, 960, 220, 40, gr, 'rgba(255,255,255,.9)', 5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = `110px ${FONT}`; ctx.fillText(b.emoji, -380, 0);
  ctx.fillStyle = '#fff'; ctx.font = `900 50px ${FONT}`; let tt = b.title; while (ctx.measureText(tt).width > 700 && tt.length > 5) tt = tt.slice(0, -2); ctx.fillText(tt, 60, -32);
  ctx.font = `700 34px ${FONT}`; let st = b.sub; if (ctx.measureText(st).width > 700) { while (ctx.measureText(st + '…').width > 700 && st.length > 5) st = st.slice(0, -1); st += '…'; } ctx.fillText(st, 60, 38);
  ctx.restore(); ctx.textBaseline = 'alphabetic';
}
function drawLegend() {
  if (CFG.layout?.showLegend === false) return;
  const gifts = Object.entries(CFG.gifts).filter(([, g]) => g.legend !== false).slice(0, 9);
  const y0 = 1555, cols = 3, cw = 330, ch = 82;
  roundRect(30, y0, 1020, 340, 30, 'rgba(15,15,30,.7)');
  ctx.font = `800 28px ${FONT}`; ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🎁 Schick ein Geschenk – baue die Stadt!', W / 2, y0 + 34);
  gifts.forEach(([k, g], i) => {
    const cx = 45 + (i % cols) * (cw + 0), cy = y0 + 64 + Math.floor(i / cols) * ch;
    roundRect(cx, cy, cw - 10, ch - 10, 18, 'rgba(255,255,255,.08)');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `44px ${FONT}`; ctx.fillText(g.emoji || '🎁', cx + 38, cy + 37);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 23px ${FONT}`; ctx.fillText(g.de || k, cx + 72, cy + 22);
    ctx.font = `600 19px ${FONT}`; ctx.fillStyle = '#9fe7ff';
    let d = '→ ' + describe(g.actions); while (ctx.measureText(d).width > cw - 92 && d.length > 4) d = d.slice(0, -2); if (d !== '→ ' + describe(g.actions)) d += '…';
    ctx.fillText(d, cx + 72, cy + 50);
  });
  ctx.textAlign = 'center'; ctx.font = `600 21px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
  const cmds = CFG.commands?.enabled ? Object.keys(CFG.commands.list).slice(0, 3).join(' ') : '';
  ctx.fillText(`❤️ Likes = Spaziergänger  ·  ➕ Folgen = dein eigenes Haus${cmds ? '  ·  💬 ' + cmds : ''}`, W / 2, y0 + 316);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}
function drawLabels(now) {
  for (const b of S.buildings) {
    if (!b.labelUntil || now > b.labelUntil) continue;
    const a = clamp((b.labelUntil - now) / 600, 0, 1), n = BUILD[b.t].size || 1;
    const s = toScreen(P(b.x + (n - 1) / 2, b.y + (n - 1) / 2, fullHeight(b) + 12));
    ctx.globalAlpha = a; ctx.font = `800 24px ${FONT}`; const text = '👤 ' + b.o, tw = ctx.measureText(text).width + 26;
    const yy = s.y - 20 - (1 - a) * 20;
    roundRect(s.x - tw / 2, yy - 20, tw, 40, 20, 'rgba(255,45,111,.92)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, s.x, yy + 1);
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}
function drawSkyFx(dt) {
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rockets) {
    if (r.delay > 0) { r.delay -= dt; continue; }
    if (!r.launched) { r.launched = true; if (Math.random() < .5) Sound.fx.launch(); }
    if (!r.burst) {
      r.y += r.vy * dt; r.vy *= .985;
      skyParticles.push({ x: r.x + rand(-2, 2), y: r.y + 10, vx: rand(-15, 15), vy: rand(20, 60), g: 0, life: .4, max: .4, size: 3, color: 'rgba(255,220,150,A)', kind: 'dot' });
      if (r.y <= r.ty) { r.burst = true; Sound.fx.bang(); const n = 70; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, sp = rand(180, 360); skyParticles.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, drag: .975, life: rand(1, 1.7), max: 1.7, size: rand(2.5, 4.5), color: hexA(r.color), kind: 'dot' }); } glowFlash.push({ x: r.x, y: r.y, t: .4, c: r.color }); }
    }
  }
  rockets = rockets.filter(r => !r.burst);
  for (const f of glowFlash) { glow(f.x, f.y, 180, hexA(f.c), f.t * 1.2); f.t -= dt; }
  glowFlash = glowFlash.filter(f => f.t > 0);
  ctx.globalCompositeOperation = 'source-over';
  for (const p of skyParticles) {
    p.vy += (p.g || 0) * dt; if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; } p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'text') { ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.font = `${p.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x + Math.sin(p.life * 6) * 6, p.y); ctx.globalAlpha = 1; }
    else if (p.kind === 'confetti') { p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x + Math.sin(p.life * 3) * 20, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.color.replace('A', a.toFixed(2)); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.5 + a * .5), 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  }
  skyParticles = skyParticles.filter(p => p.life > 0);
  if (skyParticles.length > 3000) skyParticles.splice(0, skyParticles.length - 3000);
}
let glowFlash = [];
function hexA(c) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},A)`; }

// ---------- Hauptschleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; time += dt;
  // Bauen aus der Warteschlange
  const interval = 1000 / (CFG.buildSpeedPerSecond || 5);
  if (queue.length && now - lastBuildAt > interval) { lastBuildAt = now; build(queue.shift()); }
  // Kamera passt sich der Stadtgröße an
  const target = Math.min(2.1, 1000 / ((2 * S.R + 1) * TW));
  camScale += (target - camScale) * Math.min(1, dt * 2);
  nightT += ((S.night ? 1 : 0) - nightT) * Math.min(1, dt * 1.2); window.tiktokStadtNight = nightT;
  for (const m of walkers) stepMover(m, dt);
  for (const m of cars) stepMover(m, dt);
  for (const p of particles) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);

  drawSky();
  drawCity(now);
  drawSkyFx(dt);
  drawLabels(now);
  drawHeader();
  drawLeaderboard();
  drawToasts();
  drawBanners();
  drawLegend();
  if (dirty && Math.floor(time * 2) !== Math.floor((time - dt) * 2)) save();
  requestAnimationFrame(frame);
}

// ---------- Verbindung zum Server ----------
function connectWS() {
  const url = (params.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) + (params.get('key') ? '?key=' + encodeURIComponent(params.get('key')) : '');
  try { ws = new WebSocket(url); } catch { conn = { mode: 'noserver' }; return setTimeout(connectWS, 3000); }
  ws.onmessage = (m) => { try { const ev = JSON.parse(m.data); handleEvent(ev); if (ev.type === 'status') updateAdminUI(); } catch (e) { console.warn(e); } };
  ws.onopen = () => { clearInterval(ws._ping); ws._ping = setInterval(() => sendServer({ type: 'ping' }), 60000); };
  ws.onclose = () => { conn = { mode: 'noserver', text: 'Server nicht erreichbar' }; setTimeout(connectWS, 3000); };
}

// ---------- Test-Panel ----------
function setupSim() {
  const panel = document.getElementById('simPanel');
  if (params.has('sim')) panel.classList.remove('hidden');
  const nameEl = document.getElementById('simName'), countEl = document.getElementById('simCount');
  const nm = () => nameEl.value.trim() || 'Testzuschauer';
  const uidOf = (n) => n.toLowerCase().replace(/\s+/g, '_');
  const gifts = Object.entries(CFG.gifts).sort((a, b) => (a[1].legend === false) - (b[1].legend === false) || a[1].diamonds - b[1].diamonds);
  const sendGift = (k, count) => handleEvent({ type: 'gift', user: uidOf(nm()), nickname: nm(), giftName: k, diamonds: CFG.gifts[k].diamonds, count, combo: count });
  const box = document.getElementById('simGifts');
  gifts.forEach(([k, g], i) => {
    const bt = document.createElement('button');
    bt.textContent = `${i < 9 ? (i + 1) + ' ' : ''}${g.emoji} ${g.de} (${g.diamonds}💎)`;
    bt.onclick = () => sendGift(k, Math.max(1, +countEl.value || 1));
    box.appendChild(bt);
  });
  const names = ['Lena', 'Max', 'Sophie', 'Jonas', 'Mia', 'Paul', 'Emma', 'Ben', 'Hannah', 'Leon'];
  const actions = {
    like: () => handleEvent({ type: 'like', user: uidOf(nm()), nickname: nm(), likeCount: 50 }),
    like500: () => handleEvent({ type: 'like', user: uidOf(nm()), nickname: nm(), likeCount: 500 }),
    follow: () => { const n = nm() === 'Testzuschauer' ? pick(names) + Math.floor(Math.random() * 100) : nm(); handleEvent({ type: 'follow', user: uidOf(n), nickname: n }); },
    share: () => handleEvent({ type: 'share', user: uidOf(nm()), nickname: nm() }),
    park: () => { cooldowns.clear(); handleEvent({ type: 'chat', user: uidOf(nm()), nickname: nm(), comment: '!park' }); },
    baum: () => { cooldowns.clear(); handleEvent({ type: 'chat', user: uidOf(nm()), nickname: nm(), comment: '!baum' }); },
    random: () => { for (let i = 0; i < 15; i++) setTimeout(() => { const n = pick(names), r = Math.random(); if (r < .6) { const [k, g] = pick(gifts.filter(x => x[1].diamonds <= 1000)); handleEvent({ type: 'gift', user: uidOf(n), nickname: n, giftName: k, diamonds: g.diamonds, count: g.diamonds <= 5 ? 1 + Math.floor(Math.random() * 5) : 1 }); } else if (r < .85) handleEvent({ type: 'like', user: uidOf(n), nickname: n, likeCount: 30 }); else handleEvent({ type: 'follow', user: uidOf(n) + i, nickname: n + i }); }, i * 200); },
    night: () => { S.night = !S.night; dirty = true; },
    fireworks: () => launchFireworks(10, 3),
    reset: () => { if (confirm('Stadt wirklich komplett zurücksetzen?')) resetCity(); },
  };
  panel.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.sim; if (a && actions[a]) actions[a](); });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 's') panel.classList.toggle('hidden');
    else if (/^[1-9]$/.test(k) && gifts[+k - 1]) sendGift(gifts[+k - 1][0], Math.max(1, +countEl.value || 1));
    else if (k === 'l') actions.like(); else if (k === 'f') actions.follow(); else if (k === 'p') actions.park(); else if (k === 'n') actions.night();
  });
  // Ton-Einstellungen
  const A = Sound.settings;
  const muteBtn = document.getElementById('simMute');
  const refreshMute = () => { muteBtn.textContent = A.muted ? '🔇 Ton ist AUS – einschalten' : '🔊 Ton an – stummschalten'; };
  muteBtn.onclick = () => { Sound.start(); Sound.toggleMute(); refreshMute(); }; refreshMute();
  for (const k of ['master', 'music', 'sfx']) { const el = document.getElementById('vol_' + k); el.value = Math.round(A[k] * 100); el.oninput = () => { Sound.start(); Sound.set(k, el.value / 100); }; }
  document.getElementById('simUserBtn').onclick = () => { const n = document.getElementById('simUser').value.trim(); if (n && sendServer({ type: 'setUser', name: n })) addToast({ emoji: '🔌', text: `Verbinde mit @${n.replace(/^@/, '')} …`, color: '#0984e3', small: true }); };
  window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && e.key.toLowerCase() === 'm') { Sound.start(); Sound.toggleMute(); refreshMute(); } });
  // Für Tests/Automatisierung
  window.tiktokStadt = { handleEvent, resetCity, state: () => S, queueLength: () => queue.length, sound: Sound };
}

// ---------- Start ----------
async function init() {
  try { CFG = await (await fetch('game-config.json', { cache: 'no-store' })).json(); }
  catch { CFG = null; }
  if (!CFG) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('config.json nicht gefunden.', W / 2, H / 2 - 30); ctx.fillText('Bitte mit "npm start" starten.', W / 2, H / 2 + 30); return; }
  CFG.likes = Object.assign({ likesPerWalker: 20, likesPerGrowth: 200, maxWalkers: 160, growthBuild: 'flowers' }, CFG.likes);
  CFG.maxQueue = CFG.maxQueue || 300;
  S = load();
  if (params.has('reset')) { S = freshState(); save(); params.delete('reset'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); }
  S.buildings = S.buildings.filter(b => BUILD[b.t]); S.buildings.forEach(b => { delete b.born; delete b.labelUntil; });
  rebuildOcc(); nightT = S.night ? 1 : 0;
  camScale = Math.min(2.1, 1000 / ((2 * S.R + 1) * TW));
  ensureCars(); ensureWalkers();
  Sound.loadSettings(CFG.audio); Sound.init();
  setupSim(); connectWS(); setupStartOverlay();
  requestAnimationFrame(frame);
}
init();

// ---------- Start-Overlay (Autoplay-Sperre der Browser) + TikTok-Name ----------
function updateAdminUI() {
  const box = document.getElementById('userBox'), panelBox = document.getElementById('simUserRow');
  if (panelBox) panelBox.style.display = conn.admin ? '' : 'none';
  if (box) box.style.display = conn.admin ? '' : 'none';
  const cur = document.getElementById('userCurrent');
  if (cur) cur.textContent = conn.username ? `Verbunden mit: @${conn.username} (${conn.text || ''})` : 'Noch kein TikTok-Name eingetragen.';
  const inp = document.getElementById('userInput'); if (inp && conn.username && !inp.value) inp.value = conn.username;
  const si = document.getElementById('simUser'); if (si && conn.username && !si.value) si.value = conn.username;
}
function setupStartOverlay() {
  const ov = document.getElementById('startOverlay');
  const A = Sound.settings;
  const wantOverlay = A.enabled !== false && A.showStartOverlay !== false && !params.has('autostart');
  const hide = () => ov.classList.add('hidden');
  const go = async (e) => {
    if (e && e.target.closest('#userBox')) return;
    await Sound.start();
    // Handy: Vollbild + Bildschirm wach halten (nicht in OBS)
    if (!window.obsstudio) { try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { } }
    try { if (navigator.wakeLock) { const lock = async () => { try { await navigator.wakeLock.request('screen'); } catch { } }; lock(); document.addEventListener('visibilitychange', () => { if (!document.hidden) lock(); }); } } catch { }
    hide();
  };
  ov.addEventListener('click', go);
  document.getElementById('userBtn').onclick = (e) => { e.stopPropagation(); const n = document.getElementById('userInput').value.trim(); if (n) { sendServer({ type: 'setUser', name: n }); document.getElementById('userCurrent').textContent = `Verbinde mit @${n.replace(/^@/, '')} …`; } };
  // Läuft der Ton schon (z. B. OBS / TikTok LIVE Studio erlauben Autoplay)? Dann kein Overlay.
  setTimeout(async () => {
    await Sound.start();
    if (Sound.isRunning() || !wantOverlay) { if (!(conn.admin && !conn.username)) hide(); }
    else ov.classList.remove('hidden');
  }, 300);
  // Fallback: erster Klick/Tipp/Tastendruck irgendwo startet den Ton
  const first = () => { Sound.start(); };
  window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
}
