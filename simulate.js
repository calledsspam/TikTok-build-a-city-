// Fake-Events an das laufende Spiel schicken (Server muss laufen: npm start)
// Beispiele:
//   node simulate.js                       → zufällige Mischung (30 Events)
//   node simulate.js gift Rose 10 Lena     → Lena schickt 10x Rose (Combo)
//   node simulate.js gift Lion 1 Max
//   node simulate.js like 100 Mia
//   node simulate.js follow Jonas
//   node simulate.js chat "!park" Emma
//   node simulate.js showcase              → schöne Demo-Abfolge mit allen Gebäuden
//   node simulate.js reset                 → Stadt zurücksetzen
import WebSocket from 'ws';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url)));
const port = process.env.PORT || config.port || 8080;
const ws = new WebSocket(`ws://localhost:${port}/ws`);
const [cmd = 'random', ...rest] = process.argv.slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const send = (event) => ws.send(JSON.stringify({ type: 'inject', event }));
const uid = (n) => n.toLowerCase().replace(/\s+/g, '_');
const gift = (giftName, count, n) => send({ type: 'gift', user: uid(n), nickname: n, giftName, diamonds: config.gifts[giftName]?.diamonds ?? 1, count, combo: count });
const names = ['Lena', 'Max', 'Sophie', 'Jonas', 'Mia', 'Paul', 'Emma', 'Ben', 'Hannah', 'Leon'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

ws.on('error', () => { console.error('❌ Kein Server auf Port ' + port + ' – zuerst "npm start" ausführen.'); process.exit(1); });
ws.on('open', async () => {
  if (cmd === 'gift') gift(rest[0] || 'Rose', Number(rest[1] || 1), rest[2] || pick(names));
  else if (cmd === 'like') send({ type: 'like', user: uid(rest[1] || 'Mia'), nickname: rest[1] || 'Mia', likeCount: Number(rest[0] || 50) });
  else if (cmd === 'follow') { const n = rest[0] || pick(names); send({ type: 'follow', user: uid(n), nickname: n }); }
  else if (cmd === 'chat') { const n = rest[1] || pick(names); send({ type: 'chat', user: uid(n), nickname: n, comment: rest[0] || '!park' }); }
  else if (cmd === 'share') { const n = rest[0] || pick(names); send({ type: 'share', user: uid(n), nickname: n }); }
  else if (cmd === 'reset') ws.send(JSON.stringify({ type: 'command', name: 'reset' }));
  else if (cmd === 'showcase') {
    const steps = [
      () => gift('Rose', 8, 'Lena'), () => gift('TikTok', 4, 'Max'), () => gift('Finger Heart', 3, 'Sophie'),
      () => send({ type: 'like', user: 'mia', nickname: 'Mia', likeCount: 400 }),
      () => gift('Doughnut', 3, 'Jonas'), () => gift('Hand Hearts', 3, 'Emma'), () => gift('Confetti', 2, 'Paul'),
      () => send({ type: 'follow', user: 'neuer_fan', nickname: 'NeuerFan' }), () => send({ type: 'follow', user: 'ben', nickname: 'Ben' }),
      () => send({ type: 'chat', user: 'hannah', nickname: 'Hannah', comment: '!park' }),
      () => gift('Rose', 12, 'Leon'), () => gift('Galaxy', 2, 'Max'), () => gift('Lion', 1, 'Lena'),
      () => gift('Hand Hearts', 2, 'Sophie'), () => gift('Doughnut', 4, 'Ben'), () => gift('Interstellar', 1, 'Emma'),
    ];
    for (const s of steps) { s(); await sleep(700); }
  } else {
    const giftNames = Object.keys(config.gifts);
    for (let i = 0; i < 30; i++) {
      const r = Math.random(), n = pick(names);
      if (r < 0.6) { const g = pick(giftNames); gift(g, config.gifts[g].diamonds <= 5 ? 1 + Math.floor(Math.random() * 6) : 1, n); }
      else if (r < 0.85) send({ type: 'like', user: uid(n), nickname: n, likeCount: 20 + Math.floor(Math.random() * 80) });
      else send({ type: 'follow', user: uid(n) + i, nickname: n + i });
      await sleep(250);
    }
  }
  console.log('✅ Gesendet:', cmd, rest.join(' '));
  setTimeout(() => process.exit(0), 300);
});
