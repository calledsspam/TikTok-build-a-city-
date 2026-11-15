// TikTok-Stadt – Brücke zwischen TikTok LIVE und dem Browser-Spiel
// Start:  node server.js <tiktok-username>   (oder Username in config.json eintragen)
// Optionen: --port 8080   --demo (schickt automatisch zufällige Fake-Geschenke)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { console.error('❌ config.json konnte nicht gelesen werden:', e.message); process.exit(1); }
}
const config = loadConfig();

// ---- CLI-Argumente ----
const args = process.argv.slice(2);
let username = process.env.TIKTOK_USERNAME || config.tiktokUsername || '';
let port = Number(process.env.PORT || config.port || 8080);
let demo = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port') port = Number(args[++i]);
  else if (a === '--demo') demo = true;
  else if (a === '--user') username = args[++i];
  else if (!a.startsWith('--')) username = a;
}
const USER_FILE = path.join(__dirname, 'user.json');
if (!username) { try { username = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')).tiktokUsername || ''; } catch { } }
// Admin-Schlüssel: nötig, um aus dem Internet (Handy/Tunnel) den TikTok-Namen zu setzen oder Fake-Events zu schicken
const adminKey = process.env.ADMIN_KEY || config.adminKey || crypto.randomBytes(6).toString('hex');
const cleanName = (n) => String(n || '').replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/^@/, '').replace(/\/live\/?$/, '').replace(/[^\w.]/g, '').slice(0, 40);
username = (username || '').replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/^@/, '').replace(/\/live\/?$/, '').trim();

// ---- HTTP (liefert das Spiel aus) ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// Nur diese Dateien werden ausgeliefert (niemals config.json, user.json oder Server-Code)
const PUBLIC_FILES = new Set(['index.html', 'game.js', 'audio.js', 'style.css', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.png']);
// Einstellungen fürs Spiel, ohne geheime Werte
function publicConfig() {
  const c = loadConfig();
  for (const k of ['tiktokUsername', 'adminKey', 'signApiKey', 'port']) delete c[k];
  return JSON.stringify(c);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/game-config.json') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(publicConfig());
  }
  if (p === '/') p = '/index.html';
  const name = p.slice(1);
  if (!PUBLIC_FILES.has(name)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---- WebSocket zu den Browsern ----
const wss = new WebSocketServer({ server, path: '/ws' });
let status = { type: 'status', mode: username ? 'connecting' : 'sim', username, text: username ? `Verbinde mit @${username} …` : 'Simulationsmodus (kein TikTok-Name)' };

function broadcast(msg) {
  for (const c of wss.clients) if (c.readyState === 1) c.send(JSON.stringify(msg.type === 'status' ? { ...msg, admin: c.admin } : msg));
}
function setStatus(mode, text) {
  status = { type: 'status', mode, username, text };
  console.log(`ℹ️  ${text}`);
  broadcast(status);
}

function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  const proxied = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['cf-ray'];
  return !proxied && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
}
wss.on('connection', (ws, req) => {
  const key = new URL(req.url, 'http://x').searchParams.get('key');
  ws.admin = !!(isLocal(req) || (key && key === adminKey));
  ws.send(JSON.stringify({ ...status, admin: ws.admin }));
  ws.on('message', (raw) => {
    // Simulator (simulate.js) schickt {type:'inject', event:{...}}
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') return; // Keep-alive (z. B. für Render)
      if (!ws.admin) return; // Fremde dürfen nur zuschauen
      if (msg.type === 'setUser') {
        const n = cleanName(msg.name);
        if (n && n !== username) { username = n; try { fs.writeFileSync(USER_FILE, JSON.stringify({ tiktokUsername: n }, null, 2)); } catch { } startTikTok(); }
      } else if (msg.type === 'inject' && msg.event) {
        console.log('🧪 Simuliert:', summarize(msg.event));
        broadcast({ ...msg.event, simulated: true });
      } else if (msg.type === 'command') {
        broadcast(msg); // z.B. {type:'command', name:'reset'}
      }
    } catch { /* ignorieren */ }
  });
});

function summarize(e) {
  if (e.type === 'gift') return `${e.nickname || e.user} → ${e.giftName} x${e.count}`;
  if (e.type === 'like') return `${e.nickname || e.user} → ${e.likeCount} Likes`;
  if (e.type === 'chat') return `${e.nickname || e.user}: ${e.comment}`;
  return `${e.type} ${e.nickname || e.user || ''}`;
}

// ---- TikTok LIVE ----
const streaks = new Map(); // für Combo-Geschenke: bereits gezählte repeatCount pro Nutzer+Geschenk

function userInfo(d) {
  const u = d.user || {};
  return {
    user: u.uniqueId || u.userId || 'unbekannt',
    nickname: u.nickname || u.uniqueId || 'Unbekannt',
    avatar: u.profilePicture?.url?.[0] || u.profilePictureUrl || ''
  };
}

let activeConn = null, activeTimer = null, connGen = 0;
async function startTikTok() {
  if (!username) return;
  const gen = ++connGen;
  if (activeConn) { try { activeConn.removeAllListeners?.(); await activeConn.disconnect(); } catch { } activeConn = null; }
  clearTimeout(activeTimer);
  let mod;
  try { mod = await import('tiktok-live-connector'); }
  catch (e) { setStatus('error', 'tiktok-live-connector fehlt – bitte "npm install" ausführen'); return; }
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = mod;

  const options = { enableExtendedGiftInfo: true };
  if (process.env.SIGN_API_KEY || config.signApiKey) options.signApiKey = process.env.SIGN_API_KEY || config.signApiKey;
  const conn = new TikTokLiveConnection(username, options);
  activeConn = conn;
  const retry = (sec) => { if (gen !== connGen) return; clearTimeout(activeTimer); activeTimer = setTimeout(connect, sec * 1000); };

  async function connect() {
    if (gen !== connGen) return;
    setStatus('connecting', `Verbinde mit @${username} …`);
    try {
      const state = await conn.connect();
      setStatus('live', `LIVE verbunden mit @${username} (Raum ${state.roomId})`);
    } catch (e) {
      const msg = (e && (e.message || e.toString())) || 'Unbekannter Fehler';
      setStatus('offline', `@${username} ist nicht live oder nicht erreichbar – neuer Versuch in 30 s (${msg.slice(0, 120)})`);
      retry(30);
    }
  }

  conn.on(ControlEvent.DISCONNECTED, () => { if (gen !== connGen) return; setStatus('offline', 'Verbindung getrennt – neuer Versuch in 15 s'); retry(15); });
  conn.on(WebcastEvent.STREAM_END, () => { setStatus('offline', 'Stream beendet – warte auf neuen LIVE (60 s)'); retry(60); });
  conn.on(ControlEvent.ERROR, (err) => console.warn('⚠️ ', err?.info || err?.exception?.message || err));

  conn.on(WebcastEvent.GIFT, (d) => {
    const det = d.giftDetails || {};
    const ext = d.extendedGiftInfo || {};
    const giftName = det.giftName || ext.name || d.giftName || `Geschenk ${d.giftId}`;
    const diamonds = det.diamondCount ?? ext.diamond_count ?? d.diamondCount ?? 1;
    const giftType = det.giftType ?? d.giftType;
    const repeat = Number(d.repeatCount || 1);
    const u = userInfo(d);
    let count = repeat;
    if (giftType === 1) { // Combo-fähiges Geschenk: nur die neuen Stück zählen
      const key = `${u.user}:${d.giftId}:${d.groupId || ''}`;
      const done = streaks.get(key) || 0;
      count = repeat - done;
      if (d.repeatEnd) streaks.delete(key); else streaks.set(key, repeat);
    }
    if (count <= 0) return;
    const ev = { type: 'gift', ...u, giftId: d.giftId, giftName, diamonds, count, combo: repeat, streaking: giftType === 1 && !d.repeatEnd };
    console.log('🎁', summarize(ev));
    broadcast(ev);
  });

  conn.on(WebcastEvent.LIKE, (d) => broadcast({ type: 'like', ...userInfo(d), likeCount: d.likeCount || 1, totalLikeCount: d.totalLikeCount }));
  conn.on(WebcastEvent.FOLLOW, (d) => { const u = userInfo(d); console.log('➕ Follow:', u.nickname); broadcast({ type: 'follow', ...u }); });
  conn.on(WebcastEvent.CHAT, (d) => broadcast({ type: 'chat', ...userInfo(d), comment: d.comment || '' }));
  conn.on(WebcastEvent.SOCIAL, (d) => {
    const action = String(d.displayType || d.common?.displayText?.key || d.action || '');
    if (/share/i.test(action)) broadcast({ type: 'share', ...userInfo(d) });
  });

  connect();
}

// ---- Demo-Modus: zufällige Geschenke ohne TikTok ----
function startDemo() {
  const names = ['Lena', 'Max', 'Sophie', 'Jonas', 'Mia', 'Paul', 'Emma', 'Ben', 'Hannah', 'Leon'];
  const gifts = Object.entries(config.gifts).map(([k, g]) => ({ name: k, diamonds: g.diamonds }));
  const weighted = gifts.flatMap(g => Array(g.diamonds <= 5 ? 12 : g.diamonds <= 100 ? 5 : g.diamonds <= 1000 ? 2 : 1).fill(g));
  setInterval(() => {
    const n = names[Math.floor(Math.random() * names.length)];
    const r = Math.random();
    let ev;
    if (r < 0.55) { const g = weighted[Math.floor(Math.random() * weighted.length)]; ev = { type: 'gift', user: n.toLowerCase(), nickname: n, giftName: g.name, diamonds: g.diamonds, count: g.diamonds <= 5 ? 1 + Math.floor(Math.random() * 5) : 1 }; }
    else if (r < 0.85) ev = { type: 'like', user: n.toLowerCase(), nickname: n, likeCount: 5 + Math.floor(Math.random() * 30) };
    else if (r < 0.93) ev = { type: 'follow', user: n.toLowerCase() + Math.floor(Math.random() * 99), nickname: n + Math.floor(Math.random() * 99) };
    else ev = { type: 'chat', user: n.toLowerCase(), nickname: n, comment: ['!park', '!baum', '!blumen', 'Hallo!'][Math.floor(Math.random() * 4)] };
    broadcast({ ...ev, simulated: true });
  }, 1600);
  console.log('🧪 Demo-Modus aktiv: alle 1,6 s ein zufälliges Fake-Event');
}

server.listen(port, () => {
  console.log('');
  console.log('🏙️  TikTok-Stadt läuft!');
  console.log(`   Spiel im Browser:      http://localhost:${port}/`);
  console.log(`   Mit Test-Panel:        http://localhost:${port}/?sim=1   (oder Taste S drücken)`);
  console.log(`   TikTok-Account:        ${username ? '@' + username : '(keiner – nur Simulation)'}`);
  console.log(`   Admin-Schlüssel:       ${adminKey}   (für Handy/Internet: URL mit ?key=${adminKey})`);
  console.log('');
  if (username) startTikTok();
  else console.log('ℹ️  Kein TikTok-Name angegeben → nur Simulation. Start mit: npm start -- deinname');
  if (demo) startDemo();
});
