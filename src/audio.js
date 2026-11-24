// Every sound is synthesized with Web Audio. There are no audio files.
let ctx, master, music, noiseBuf, musicOn = false;
let muted = false;
try { muted = localStorage.getItem('purr.mute') === '1'; } catch {}
const last = {};
const VOL = 0.7;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = 0.14;
    music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') ctx.resume();
  if (!musicOn) { musicOn = true; startMusic(); }
}

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('purr.mute', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.05);
  return muted;
}
export function suspend(on) {
  if (!ctx) return;
  (on ? ctx.suspend() : ctx.resume()).catch(() => {});
}

function tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.2, at = 0, attack = 0.006, dest = master }) {
  const t = ctx.currentTime + Math.max(0, at);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, f = 1500, type = 'bandpass', q = 1 }) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

function meow(p = 1, vol = 0.5) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520 * p, t);
  o.frequency.linearRampToValueAtTime(800 * p, t + 0.12);
  o.frequency.linearRampToValueAtTime(450 * p, t + 0.42);
  f.type = 'bandpass'; f.Q.value = 5;
  f.frequency.setValueAtTime(700 * p, t);
  f.frequency.linearRampToValueAtTime(1600 * p, t + 0.14);
  f.frequency.linearRampToValueAtTime(800 * p, t + 0.42);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.5);
}

function purr() {
  const t = ctx.currentTime, dur = 0.9;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), am = ctx.createGain();
  const lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
  s.buffer = noiseBuf;
  fl.type = 'lowpass'; fl.frequency.value = 240;
  am.gain.value = 0.5;
  lfo.frequency.value = 26; depth.gain.value = 0.5;
  lfo.connect(depth); depth.connect(am.gain);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(am); am.connect(g); g.connect(master);
  s.start(t); lfo.start(t); s.stop(t + dur); lfo.stop(t + dur);
}

const notes = (fs, o = {}) => fs.forEach((f, i) => tone({ f0: f, dur: 0.22, vol: 0.1, at: i * 0.08, type: 'triangle', ...o }));

const S = {
  pop: () => tone({ f0: 700, f1: 1300, dur: 0.07, vol: 0.08 }),
  boing: () => tone({ f0: 240, f1: 600, dur: 0.13, vol: 0.14 }),
  sparkle: () => notes([1319, 1568, 2093], { type: 'sine', vol: 0.07, dur: 0.25 }),
  splash: () => noise({ dur: 0.35, vol: 0.3, f: 1100, q: 0.7 }),
  zap: () => tone({ type: 'square', f0: 1500, f1: 700, dur: 0.12, vol: 0.035 }),
  nom: () => tone({ type: 'triangle', f0: 420, f1: 200, dur: 0.3, vol: 0.2 }),
  nope: () => tone({ type: 'triangle', f0: 300, f1: 220, dur: 0.16, vol: 0.12 }),
  build: () => { tone({ f0: 300, f1: 120, dur: 0.12, vol: 0.25 }); meow(1.25, 0.4); },
  upgrade: () => notes([660, 880, 1175]),
  wave: () => notes([523, 659, 784, 1047]),
  win: () => notes([784, 988, 1175, 1568], { dur: 0.3 }),
  boss: () => { tone({ type: 'sawtooth', f0: 110, f1: 70, dur: 1.0, vol: 0.08 }); tone({ f0: 55, f1: 45, dur: 1.0, vol: 0.25 }); },
  party: () => notes([784, 659, 523, 659, 784], { dur: 0.18 }),
  grandma: () => meow(0.8, 0.5),
  purr,
};

export function sfx(name, minGap = 0.05) {
  if (!ctx || muted || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - (last[name] ?? -1) < minGap) return;
  last[name] = now;
  S[name]();
}

// A soft pentatonic melody with a slow bass line, scheduled a little ahead of time.
function startMusic() {
  const scale = [0, 2, 4, 7, 9], base = 392, beat = 60 / 92 / 2;
  const bass = [0, -3, -7, -5];
  let next = ctx.currentTime + 0.1, step = 0, note = 4;
  const pluck = (f, at, vol, dur = 0.5) => tone({ f0: f, dur, vol, at: at - ctx.currentTime, attack: 0.004, dest: music });
  setInterval(() => {
    if (ctx.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.3) {
      if (step % 2 === 0 || Math.random() < 0.25) {
        note = Math.max(0, Math.min(9, note + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        if (Math.random() < 0.8) pluck(base * 2 ** ((scale[note % 5] + 12 * Math.floor(note / 5)) / 12), next, 0.5);
      }
      if (step % 8 === 0) pluck(98 * 2 ** (bass[(step / 8) % 4] / 12), next, 0.9, 1.6);
      next += beat;
      step++;
    }
  }, 100);
}
