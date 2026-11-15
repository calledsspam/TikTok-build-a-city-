/* TikTok-Stadt – Sound & Musik.
   ALLES wird live im Browser per WebAudio erzeugt (Synthese, kein einziges Audiofile, keine fremde Musik)
   → 100 % eigene, lizenzfreie Klänge, sicher für TikTok. */
'use strict';

const Sound = (() => {
  let ac = null, analyser = null, master, musicBus, sfxBus, reverb, noiseBuf, started = false, musicOn = false;
  const S = { enabled: true, master: .8, music: .35, sfx: .7, musicEnabled: true, muted: false };
  const LS = 'tiktokStadt.audio';
  const last = {};

  function loadSettings(cfg) {
    Object.assign(S, cfg || {});
    try { Object.assign(S, JSON.parse(localStorage.getItem(LS)) || {}); } catch { }
  }
  function saveSettings() { try { localStorage.setItem(LS, JSON.stringify({ master: S.master, music: S.music, sfx: S.sfx, muted: S.muted, musicEnabled: S.musicEnabled })); } catch { } }
  function apply() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(S.enabled && !S.muted ? S.master : 0, t, .05);
    musicBus.gain.setTargetAtTime(S.musicEnabled ? S.music : 0, t, .3);
    sfxBus.gain.setTargetAtTime(S.sfx, t, .05);
  }

  function init() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
    analyser = ac.createAnalyser(); analyser.fftSize = 2048; comp.connect(analyser);
    musicBus = ac.createGain(); musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    // Hall (selbst erzeugte Impulsantwort)
    reverb = ac.createConvolver();
    const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    reverb.buffer = ir; const rg = ac.createGain(); rg.gain.value = .35; reverb.connect(rg); rg.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    apply();
    return ac;
  }
  const running = () => ac && ac.state === 'running';
  async function start() {
    init(); if (!ac) return false;
    try { await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 250))]); } catch { }
    if (running() && !started) { started = true; startMusic(); }
    return running();
  }

  // ---------- Bausteine ----------
  function env(g, t, a, peak, d, sus = 0) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(.0001, sus || .0001), t + a + d); }
  function osc(type, f, t, dur, peak, dest, { a = .005, f2, glide = dur, detune = 0, rev = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + glide); o.detune.value = detune;
    env(g, t, a, peak, dur); o.connect(g); g.connect(dest); if (rev) { const s = ac.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
    o.start(t); o.stop(t + a + dur + .05); return o;
  }
  function noise(t, dur, peak, dest, { type = 'bandpass', f = 1000, f2, q = 1, a = .003, rev = 0 } = {}) {
    const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = ac.createGain(); env(g, t, a, peak, dur);
    n.connect(fl); fl.connect(g); g.connect(dest); if (rev) { const s = ac.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
    n.start(t, Math.random()); n.stop(t + a + dur + .05); return { n, g, fl };
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function ok(name, minGap) { // Drosselung, damit Combos nicht zu laut werden
    if (!running() || !S.enabled || S.muted) return false;
    const now = performance.now(); if (last[name] && now - last[name] < minGap) return false; last[name] = now; return true;
  }

  // ---------- Hintergrundmusik (generativ, Lo-Fi/Chill, 78 BPM) ----------
  const BPM = 78, STEP = 60 / BPM / 4;
  const CHORDS = [ // Cmaj7 – Am7 – Fmaj7 – G6
    { root: 48, tones: [60, 64, 67, 71] }, { root: 45, tones: [57, 60, 64, 67] },
    { root: 41, tones: [57, 60, 64, 65] }, { root: 43, tones: [59, 62, 64, 67] }];
  let step = 0, nextT = 0, timer = null;
  function startMusic() {
    if (musicOn) return; musicOn = true; nextT = ac.currentTime + .1; step = 0;
    timer = setInterval(sched, 25);
  }
  function sched() {
    if (!running()) return;
    while (nextT < ac.currentTime + .15) { playStep(step, nextT); step++; nextT += STEP * (step % 2 ? 1.08 : .92); } // leichter Swing
  }
  const arpRnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  function playStep(s, t) {
    if (!S.musicEnabled || S.music <= 0) return;
    const bar = Math.floor(s / 16), pos = s % 16, ch = CHORDS[bar % 4];
    const night = (window.tiktokStadtNight || 0);
    if (pos === 0) { // Flächenklang
      for (const n of ch.tones) for (const dt of [-7, 7]) {
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = dt; f.type = 'lowpass'; f.frequency.value = 700 - night * 250; f.Q.value = .4;
        const dur = STEP * 16;
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.022, t + .8); g.gain.setValueAtTime(.022, t + dur - .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .3);
        o.connect(f); f.connect(g); g.connect(musicBus); const sR = ac.createGain(); sR.gain.value = .5; g.connect(sR); sR.connect(reverb);
        o.start(t); o.stop(t + dur + .4);
      }
    }
    if (pos === 0 || pos === 6 || pos === 10) osc('triangle', mtof(ch.root), t, pos === 0 ? .9 : .45, .16, musicBus, { a: .01 }); // Bass
    if (pos === 0 || pos === 10) osc('sine', 110, t, .28, .5, musicBus, { f2: 42, glide: .2 }); // Kick
    if (pos === 4 || pos === 12) noise(t, .16, .07, musicBus, { f: 1800, q: .8 }); // Snare (weich)
    if (pos % 2 === 0) noise(t, .04, pos % 4 === 2 ? .03 : .018, musicBus, { type: 'highpass', f: 7500 }); // Hi-Hat
    if (pos % 2 === 0 && arpRnd() < .62) { // Spieluhr-Melodie
      const n = ch.tones[Math.floor(arpRnd() * 4)] + 12 + (arpRnd() < .2 ? 12 : 0);
      osc('sine', mtof(n), t, .5, .05, musicBus, { a: .004, rev: .7 }); osc('triangle', mtof(n) * 2, t, .15, .012, musicBus);
    }
    // Vinyl-Knistern
    if (arpRnd() < .25) noise(t + arpRnd() * STEP, .01, .02, musicBus, { type: 'highpass', f: 3000 });
  }

  // ---------- Effekte ----------
  const fx = {
    pop() { if (!ok('pop', 70)) return; const t = ac.currentTime, f = 500 + Math.random() * 300; osc('sine', f, t, .14, .55, sfxBus, { f2: f * 2.2, glide: .05 }); noise(t, .03, .08, sfxBus, { f: 3000 }); },
    sparkle() { if (!ok('sparkle', 150)) return; const t = ac.currentTime; [84, 88, 91].forEach((n, i) => osc('sine', mtof(n), t + i * .05, .35, .06, sfxBus, { rev: .8 })); },
    hammer(hits = 3, pitch = 1) {
      if (!ok('hammer', 180)) return; const t0 = ac.currentTime;
      for (let i = 0; i < hits; i++) {
        const t = t0 + i * .15 + Math.random() * .02;
        osc('sine', 180 * pitch, t, .12, .75, sfxBus, { f2: 60, glide: .08 }); // Schlag
        osc('square', 1900 * pitch, t, .06, .035, sfxBus); osc('square', 2710 * pitch, t, .05, .025, sfxBus); // Metall
        noise(t, .05, .2, sfxBus, { f: 2400, q: 2 });
      }
    },
    bell() { if (!ok('bell', 200)) return; const t = ac.currentTime + .45; [88, 93].forEach((n, i) => { osc('sine', mtof(n), t + i * .12, .6, .12, sfxBus, { rev: .6 }); osc('sine', mtof(n) * 2.76, t + i * .12, .2, .03, sfxBus); }); },
    whooshChime() {
      if (!ok('whoosh', 400)) return; const t = ac.currentTime;
      noise(t, .9, .35, sfxBus, { f: 250, f2: 3500, q: 1.2, a: .45 });
      [72, 76, 79, 84, 88].forEach((n, i) => { osc('sine', mtof(n), t + .55 + i * .09, 1.3, .1, sfxBus, { rev: .9 }); osc('sine', mtof(n) * 3, t + .55 + i * .09, .3, .02, sfxBus); });
    },
    cheer() {
      if (!ok('cheer', 1500)) return; const t = ac.currentTime, dur = 3.2;
      for (let i = 0; i < 6; i++) {
        const { g } = noise(t, dur, .09, sfxBus, { f: 700 + i * 260, q: 1.6, a: .5 });
        const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 3 + Math.random() * 6; lg.gain.value = .04;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur + .5);
      }
      for (let i = 0; i < 5; i++) { const f = 300 + Math.random() * 300, s = t + .2 + Math.random() * 1.5; osc('sawtooth', f, s, .7, .02, sfxBus, { f2: f * 1.5, glide: .5, a: .1 }); } // "Wooo"-Rufe
      const w = ac.createOscillator(), wg = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain(); // Pfiff
      w.frequency.value = 2900; v.frequency.value = 28; vg.gain.value = 120; v.connect(vg); vg.connect(w.frequency);
      env(wg, t + .3, .02, .05, .6); w.connect(wg); wg.connect(sfxBus); w.start(t + .3); v.start(t + .3); w.stop(t + 1.1); v.stop(t + 1.1);
      fx.fanfare(true);
    },
    launch() { if (!ok('launch', 120)) return; const t = ac.currentTime; osc('sine', 500, t, .7, .03, sfxBus, { f2: 1700, glide: .6, a: .05 }); noise(t, .6, .06, sfxBus, { type: 'highpass', f: 2500, a: .05 }); },
    bang() {
      if (!ok('bang', 90)) return; const t = ac.currentTime + Math.random() * .03;
      noise(t, .9, .55, sfxBus, { type: 'lowpass', f: 2200, f2: 160, q: .5, rev: .5 });
      osc('sine', 90, t, .4, .5, sfxBus, { f2: 35, glide: .3 });
      for (let i = 0; i < 9; i++) noise(t + .25 + Math.random() * .7, .015, .1, sfxBus, { type: 'highpass', f: 4000 }); // Knistern
    },
    confetti() { if (!ok('confetti', 400)) return; const t = ac.currentTime; noise(t, .25, .4, sfxBus, { f: 1500, f2: 400 }); for (let i = 0; i < 6; i++) osc('sine', 700 + Math.random() * 900, t + .1 + i * .05, .08, .1, sfxBus, { f2: 1800 }); },
    like() { if (!ok('like', 140)) return; const t = ac.currentTime; osc('sine', 880 + Math.random() * 200, t, .08, .07, sfxBus, { f2: 1400, glide: .06 }); },
    follow() { if (!ok('follow', 300)) return; const t = ac.currentTime; osc('triangle', mtof(81), t, .25, .18, sfxBus, { rev: .5 }); osc('triangle', mtof(88), t + .11, .45, .18, sfxBus, { rev: .5 }); },
    chat() { if (!ok('chat', 200)) return; const t = ac.currentTime; osc('square', 660, t, .05, .04, sfxBus); osc('square', 990, t + .06, .06, .04, sfxBus); },
    fanfare(quiet) {
      if (!ok('fanfare' + (quiet ? 'q' : ''), 800)) return; const t = ac.currentTime, v = quiet ? .05 : .09;
      [[60, 0], [64, .12], [67, .24], [72, .36], [67, .56], [72, .68]].forEach(([n, d], i) => {
        const dur = i === 5 ? .9 : .18;
        for (const dt of [-8, 8]) { const o = osc('sawtooth', mtof(n), t + d, dur, v, sfxBus, { a: .02, detune: dt, rev: .4 }); }
      });
    },
    levelUp() { if (!ok('level', 1500)) return; const t = ac.currentTime; [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => osc('triangle', mtof(n), t + i * .07, .5, .1, sfxBus, { rev: .6 })); },
  };
  function build(type) {
    if (!running()) return;
    switch (type) {
      case 'tree': case 'flowers': fx.pop(); break;
      case 'park': fx.pop(); fx.sparkle(); break;
      case 'house': case 'familyHouse': case 'followerHouse': fx.hammer(3, 1); break;
      case 'shop': fx.hammer(3, 1.1); fx.bell(); break;
      case 'apartment': fx.hammer(4, .85); break;
      case 'skyscraper': case 'tower': fx.whooshChime(); break;
      case 'stadium': fx.cheer(); break;
      default: fx.pop();
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && started) ac.resume().catch(() => { }); });

  return {
    loadSettings, init, start, build, fx, apply, saveSettings, settings: S,
    isRunning: running, isStarted: () => started,
    set(k, v) { S[k] = v; apply(); saveSettings(); },
    toggleMute() { S.muted = !S.muted; apply(); saveSettings(); return S.muted; },
    debug: () => { let rms = 0; if (analyser) { const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); rms = Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length); } return { state: ac && ac.state, started, musicOn, step, rms: +rms.toFixed(4) }; },
  };
})();
