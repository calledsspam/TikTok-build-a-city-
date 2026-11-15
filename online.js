// Macht das Spiel per Cloudflare-Quick-Tunnel öffentlich erreichbar (HTTPS), z. B. fürs Handy.
// Start:  npm run online -- deinname     (cloudflared muss installiert sein: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
// Die Adresse gilt nur, solange dieses Programm läuft, und ändert sich bei jedem Start.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url)));
const port = Number(process.env.PORT || config.port || 8080);
const key = process.env.ADMIN_KEY || config.adminKey || crypto.randomBytes(6).toString('hex');
const bin = process.env.CLOUDFLARED || ['cloudflared', path.join(os.homedir(), 'bin', 'cloudflared')].find(p => p === 'cloudflared' || fs.existsSync(p));

const server = spawn(process.execPath, ['server.js', ...process.argv.slice(2), '--port', String(port)], { env: { ...process.env, ADMIN_KEY: key }, stdio: 'inherit' });
const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => { console.error('❌ cloudflared nicht gefunden. Bitte installieren (siehe Anleitung_Handy.md).'); server.kill(); process.exit(1); });
let shown = false;
const onData = (d) => {
  const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    const url = `${m[0]}/?key=${key}`;
    fs.writeFileSync('ONLINE_URL.txt', url + '\n');
    console.log('\n📱 HANDY-LINK (nur für dich, enthält deinen Admin-Schlüssel):\n   ' + url);
    console.log('   Zuschauer-/Ansichts-Link ohne Admin-Rechte: ' + m[0] + '/\n   (gespeichert in ONLINE_URL.txt)\n');
  }
};
tunnel.stdout.on('data', onData); tunnel.stderr.on('data', onData);
const stop = () => { tunnel.kill(); server.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
tunnel.on('exit', () => { console.log('Tunnel beendet.'); server.kill(); process.exit(0); });
