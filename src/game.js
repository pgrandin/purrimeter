// Game rules: cats (towers), critters, waves, shots and Grandma Cat's help.
import * as THREE from 'three';
import { makeCat, makeCritter, makeYarn, makeNip, CAT_LOOK, GEO } from './models.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';

// Per-level values are [level 1, level 2, level 3]. Rate is seconds between attacks.
export const CATS = {
  yarn: { name: 'Yarn Tabby', icon: '🧶', cost: 50, up: [45, 80], range: [3.6, 3.9, 4.3], dmg: [9, 15, 24], rate: [0.9, 0.75, 0.6] },
  catnip: { name: 'Catnip Cat', icon: '🌿', cost: 80, up: [70, 110], range: [3.8, 4.1, 4.5], dmg: [14, 24, 38], rate: [2.0, 1.8, 1.6], splash: [1.4, 1.6, 1.9] },
  laser: { name: 'Laser Cat', icon: '🔴', cost: 90, up: [75, 120], range: [4.0, 4.3, 4.7], dmg: [12, 20, 32], rate: [2.2, 2.0, 1.8], zap: [0.8, 1.0, 1.2] },
  chonk: { name: 'Chonk', icon: '💤', cost: 100, up: [80, 120], range: [2.8, 3.1, 3.5], dmg: [6, 10, 16], rate: [3.5, 3.0, 2.5], slow: [0.25, 0.32, 0.4], nap: [0.7, 0.9, 1.1] },
};

export const CRITTERS = {
  bunny: { name: 'Dust Bunny', icon: '🐰', hp: 32, speed: 1.5, gold: 4, bite: 1, tip: 'Poofs into two little ones!' },
  mini: { name: 'Little Dust Bunny', icon: '🐰', hp: 10, speed: 1.9, gold: 1, bite: 1 },
  mouse: { name: 'Snack Mouse', icon: '🐭', hp: 22, speed: 2.6, gold: 3, bite: 1, tip: 'Super speedy!' },
  vacuum: { name: 'Robo Vac', icon: '🤖', hp: 120, speed: 0.95, gold: 10, bite: 2, armor: true, tip: 'Yarn bounces off! Try catnip or lasers.' },
  pigeon: { name: 'Pigeon', icon: '🐦', hp: 40, speed: 1.8, gold: 5, bite: 1, fly: true, tip: 'Flies over catnip!' },
  boss: { name: 'The Big Vroomba', icon: '👑', hp: 1400, speed: 0.6, gold: 120, bite: 5, armor: true, boss: true, tip: 'The boss! All cats together!' },
};

export function waveList(w) {
  const L = [], add = (k, n, gap) => { for (let i = 0; i < n; i++) L.push([k, gap]); };
  if (w % 5 === 0) {
    add('bunny', 3 + w, 0.9);
    add('boss', 1, 2.5);
    add('mouse', 2 + w, 0.6);
    return L;
  }
  add('bunny', 4 + w, 1.2);
  if (w >= 2) add('mouse', 2 + w, 0.6);
  if (w >= 3) add('vacuum', Math.ceil(w / 3), 2.2);
  if (w >= 4) add('pigeon', w, 0.9);
  return L;
}

const TREATS = 20;
export const hooks = { pop() {}, card() {}, lost() {} };
export const G = {
  gold: 150, treats: TREATS, wave: 0, phase: 'title', speed: 1, paused: false, t: 0, idle: 0,
  queue: [], spawnT: 0, nextT: 0, nextMax: 1, critters: [], towers: [], shots: [], fading: [],
  seen: new Set(), stats: { defeated: 0, built: 0, bites: 0, waves: 0, helps: 0 },
};

let S, W, cam;
const o = { x: 0, z: 0, tx: 0, tz: 1 };
const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const BEAM = new THREE.MeshBasicMaterial({ color: '#ff4f64', transparent: true, opacity: 0.75 });
const DOT = new THREE.MeshBasicMaterial({ color: '#ff2d4a' });
const DOT_G = new THREE.CircleGeometry(0.17, 20).rotateX(-Math.PI / 2);

export function init(scene, world, camera) {
  S = scene; W = world; cam = camera;
  G.towers = W.pads.map(() => null);
  fx.init(scene);
}

export function begin() {
  G.phase = 'build';
  G.nextT = G.nextMax = 20;
}

const hpScale = w => 1 + 0.17 * (w - 1) + 0.012 * (w - 1) ** 2;
const d2 = (c, t) => (c.x - t.pad.x) ** 2 + (c.z - t.pad.z) ** 2;
const backOut = x => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const lerpAngle = (a, b, k) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * k;

function spawn(kind, d = 0, lane) {
  const def = CRITTERS[kind], m = makeCritter(kind);
  const hp = def.hp * hpScale(G.wave) * (def.boss ? 1 + 0.6 * (Math.floor(G.wave / 5) - 1) : 1);
  const c = {
    kind, def, m, hp, max: hp, d, alive: true, ph: Math.random() * 6,
    lane: def.boss ? 0 : Math.max(-0.45, Math.min(0.45, lane ?? (Math.random() - 0.5) * 0.7)),
    x: 0, y: 0, z: 0, slowT: 0, slowF: 0, napT: 0, chaseT: 0, auraSlow: 0, hit: 0, back: false,
  };
  S.add(m.root);
  G.critters.push(c);
  place(c);
  if (def.tip && !G.seen.has(kind)) { G.seen.add(kind); hooks.card(def); }
  if (def.boss) sfx('boss');
  return c;
}

function place(c) {
  W.path.at(c.d, o);
  c.x = o.x - o.tz * c.lane;
  c.z = o.z + o.tx * c.lane;
  c.m.root.position.set(c.x, c.y, c.z);
  const yaw = Math.atan2(o.tx, o.tz) + (c.back ? Math.PI : 0);
  c.m.model.rotation.y = yaw + (c.slowT > 0 ? Math.sin(G.t * 14) * 0.5 : 0);
}

function updCritter(c, dt) {
  const def = c.def;
  let sp = def.speed * (1 - c.auraSlow);
  c.auraSlow = 0;
  if (c.slowT > 0) { c.slowT -= dt; sp *= 1 - c.slowF; }
  c.back = false;
  if (c.chaseT > 0) { c.chaseT -= dt; sp = def.boss ? 0 : -0.6 * def.speed; c.back = !def.boss; }
  if (c.napT > 0) { c.napT -= dt; sp = 0; }
  c.d = Math.max(0, c.d + sp * dt);
  if (c.d >= W.path.len) { bite(c); return; }

  const m = c.m, k = c.kind, T = G.t + c.ph;
  let y = 0, sq = 1;
  if (c.napT > 0) m.body.rotation.z = 0.35;
  else {
    m.body.rotation.z = 0;
    if (k === 'bunny' || k === 'mini') { const h = Math.abs(Math.sin(T * 7)); y = h * 0.28; sq = h < 0.2 ? 0.88 : 1.04; }
    else if (k === 'mouse') y = Math.abs(Math.sin(T * 18)) * 0.05;
  }
  if (k === 'pigeon') {
    y = 1.7 + Math.sin(T * 3) * 0.15;
    m.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(T * 20) * 0.7; });
  }
  if (m.spin) m.spin.rotation.y += dt * 18;
  c.y = y;
  c.hit = Math.max(0, c.hit - dt);
  const hs = c.hit > 0 ? 1.15 : 1;
  m.body.scale.set(hs, sq * (c.hit > 0 ? 0.85 : 1), hs);
  place(c);
  m.bar.visible = c.hp < c.max;
  m.fill.scale.x = Math.max(0.001, c.hp / c.max);
  m.bar.quaternion.copy(cam.quaternion);
}

function hurt(c, dmg, src) {
  if (!c.alive) return;
  if (c.def.armor && src === 'yarn') dmg *= 0.5;
  c.hp -= dmg;
  if (src !== 'laser') c.hit = 0.12;
  if (c.hp <= 0) defeat(c);
}

function defeat(c) {
  c.alive = false;
  G.gold += c.def.gold;
  G.stats.defeated++;
  hooks.pop(`+${c.def.gold}🐟`, c.x, c.y + c.m.h, c.z, 'gold');
  const boss = c.def.boss;
  fx.burst(c.x, c.y + 0.4, c.z, ['#ffd166', '#ff8fb1', '#ffffff', '#9be7ff'], boss ? 70 : 10, boss ? { speed: 5, up: 7, size: 0.15, life: 1.5 } : {});
  sfx(boss ? 'win' : 'sparkle', 0.06);
  if (boss) hooks.pop('🎉', c.x, 3.2, c.z, 'big');
  else if (Math.random() < 0.3) hooks.pop('💖', c.x, c.y + c.m.h + 0.4, c.z);
  if (c.kind === 'bunny') for (const s of [-1, 1]) spawn('mini', Math.max(0, c.d + s * 0.3), c.lane + s * 0.25);
  fade(c);
}

function bite(c) {
  c.alive = false;
  G.treats = Math.max(0, G.treats - c.def.bite);
  G.stats.bites += c.def.bite;
  W.jarWiggle();
  sfx('nom', 0.1);
  hooks.pop(`-${c.def.bite}🍪`, W.jar.position.x, 2.6, W.jar.position.z, 'bad');
  fade(c);
  if (G.treats <= 0 && G.phase === 'wave') lose();
}

function fade(c) {
  c.m.bar.visible = false;
  G.fading.push({ m: c.m, t: 0, s0: c.m.model.scale.x });
}

function updFading(dt) {
  for (let i = G.fading.length - 1; i >= 0; i--) {
    const f = G.fading[i];
    f.t += dt;
    const k = f.t / 0.35;
    f.m.model.scale.setScalar(f.s0 * Math.max(0.001, 1 - k));
    f.m.model.rotation.y += dt * 12;
    f.m.root.position.y += dt * 1.5;
    if (k >= 1) { S.remove(f.m.root); G.fading.splice(i, 1); }
  }
}

function pickTarget(t, R, groundOnly, skip) {
  let best = null, bd = -1;
  for (const c of G.critters) {
    if (!c.alive || c === skip || (groundOnly && c.def.fly)) continue;
    if (d2(c, t) <= R * R && c.d > bd) { bd = c.d; best = c; }
  }
  return best;
}

function paw(t) {
  const s = t.cat.group.scale.x;
  return tmp.set(t.pad.x + Math.sin(t.yaw) * 0.35 * s, 0.33 + 0.75 * s, t.pad.z + Math.cos(t.yaw) * 0.35 * s);
}

function shoot(t, c, L) {
  const nip = t.kind === 'catnip', dur = nip ? 0.8 : 0.42, m = nip ? makeNip() : makeYarn();
  let to;
  if (nip) {
    W.path.at(Math.min(W.path.len, c.d + c.def.speed * dur * 0.8), o);
    to = new THREE.Vector3(o.x - o.tz * c.lane, 0.1, o.z + o.tx * c.lane);
  } else to = new THREE.Vector3(c.x, c.y + 0.4, c.z);
  const from = paw(t).clone();
  m.position.copy(from);
  S.add(m);
  G.shots.push({ kind: t.kind, m, from, to, c: nip ? null : c, k: 0, dur, dmg: t.def.dmg[L], arc: nip ? 2.2 : 0.9, R: nip ? t.def.splash[L] : 0 });
  sfx('pop', 0.08);
}

function updShots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.k += dt / s.dur;
    if (s.c && s.c.alive) s.to.set(s.c.x, s.c.y + 0.4 * (s.c.def.boss ? 2 : 1), s.c.z);
    const k = Math.min(1, s.k);
    s.m.position.lerpVectors(s.from, s.to, k);
    s.m.position.y += s.arc * 4 * k * (1 - k);
    s.m.rotation.x += dt * 10;
    s.m.rotation.z += dt * 7;
    if (s.k < 1) continue;
    S.remove(s.m);
    G.shots.splice(i, 1);
    if (s.kind === 'yarn') {
      fx.burst(s.to.x, s.to.y, s.to.z, ['#ff8fb1', '#7ec8ff', '#ffd166'], 6, { speed: 1.5, size: 0.06, up: 1.5 });
      if (s.c && s.c.alive) { hurt(s.c, s.dmg, 'yarn'); sfx('boing', 0.07); }
    } else {
      fx.ring(s.to.x, s.to.z, 0.3, s.R, '#9be08f', 0.5);
      fx.burst(s.to.x, 0.2, s.to.z, ['#7ccf6b', '#b6ec9c', '#ffffff'], 16, { speed: 2.5, up: 2 });
      sfx('splash', 0.1);
      for (const c of [...G.critters]) {
        if (!c.alive || c.def.fly || (c.x - s.to.x) ** 2 + (c.z - s.to.z) ** 2 > s.R * s.R) continue;
        hurt(c, s.dmg, 'nip');
        c.slowT = 1.6;
        c.slowF = 0.5;
      }
    }
  }
}

function updTower(t, dt) {
  const L = t.lvl - 1, R = t.def.range[L], g = t.cat.group;
  if (t.grow < 1) t.grow = Math.min(1, t.grow + dt * 3.5);
  g.scale.setScalar(t.cat.base * backOut(t.grow));
  g.rotation.y = lerpAngle(g.rotation.y, t.yaw, Math.min(1, dt * 8));
  t.act = Math.max(0, t.act - dt);
  t.cat.body.position.y = t.act > 0 ? Math.sin((1 - t.act / 0.25) * Math.PI) * 0.18 : 0;
  t.cat.body.scale.y = 1 + Math.sin(G.t * 2.2 + t.i) * 0.025;
  t.cat.tail.rotation.z = Math.sin(G.t * 1.8 + t.i) * 0.3;
  t.cd -= dt;

  if (t.kind === 'chonk') {
    let any = false;
    for (const c of G.critters) if (c.alive && d2(c, t) <= R * R) { c.auraSlow = Math.max(c.auraSlow, t.def.slow[L]); any = true; }
    if (t.cd > 0) return;
    if (!any) { t.cd = 0.2; return; }
    t.cd = t.def.rate[L];
    t.act = 0.25;
    fx.ring(t.pad.x, t.pad.z, 0.5, R, '#ffd9a0', 0.9);
    sfx('purr', 0.3);
    let n = 0;
    for (const c of [...G.critters]) {
      if (!c.alive || d2(c, t) > R * R) continue;
      hurt(c, t.def.dmg[L], 'purr');
      if (!c.alive) continue;
      c.napT = Math.max(c.napT, t.def.nap[L] * (c.def.boss ? 0.4 : 1));
      if (n++ < 3) hooks.pop('💤', c.x, c.y + c.m.h + 0.3, c.z);
    }
    return;
  }

  if (t.kind === 'laser' && t.zapT > 0) {
    t.zapT -= dt;
    const c = t.zapC;
    if (!c || !c.alive || d2(c, t) > (R + 0.6) ** 2 || t.zapT <= 0) {
      t.zapT = 0; t.zapC = null; t.beam.visible = t.dot.visible = false;
      return;
    }
    t.yaw = Math.atan2(c.x - t.pad.x, c.z - t.pad.z);
    const from = paw(t), to = tmp2.set(c.x, c.y + 0.25, c.z);
    const len = from.distanceTo(to);
    t.beam.position.copy(from).add(to).multiplyScalar(0.5);
    t.beam.scale.set(0.035, len, 0.035);
    t.beam.quaternion.setFromUnitVectors(UP, to.sub(from).normalize());
    t.dot.position.set(c.x, c.def.fly ? c.y - 0.15 : 0.07, c.z);
    t.beam.visible = t.dot.visible = true;
    c.chaseT = Math.max(c.chaseT, 0.15);
    hurt(c, t.def.dmg[L] * dt, 'laser');
    return;
  }

  if (t.cd > 0) return;
  const c = pickTarget(t, R, t.kind === 'catnip');
  if (!c) { t.cd = 0.1; return; }
  t.yaw = Math.atan2(c.x - t.pad.x, c.z - t.pad.z);
  t.cd = t.def.rate[L];
  t.act = 0.25;
  if (t.kind === 'laser') { t.zapT = t.def.zap[L]; t.zapC = c; sfx('zap', 0.1); return; }
  shoot(t, c, L);
  if (t.kind === 'yarn' && L === 2) { const c2 = pickTarget(t, R, false, c); if (c2) shoot(t, c2, L); }
}

export function build(i, kind) {
  const d = CATS[kind];
  if (G.towers[i] || G.gold < d.cost || G.phase === 'title') return false;
  G.gold -= d.cost;
  G.idle = 0;
  G.stats.built++;
  const p = W.pads[i], cat = makeCat(kind), yaw = 0.55;
  cat.group.position.set(p.x, 0.33, p.z);
  cat.group.rotation.y = yaw;
  cat.group.scale.setScalar(0.001);
  S.add(cat.group);
  const t = { kind, def: d, lvl: 1, i, pad: p, cat, cd: 0.4, spent: d.cost, yaw, act: 0, grow: 0, zapT: 0, zapC: null };
  if (kind === 'laser') {
    t.beam = new THREE.Mesh(GEO.cyl, BEAM);
    t.dot = new THREE.Mesh(DOT_G, DOT);
    t.beam.visible = t.dot.visible = false;
    S.add(t.beam, t.dot);
  }
  G.towers[i] = t;
  W.setPad(i, CAT_LOOK[kind].pad);
  fx.burst(p.x, 0.6, p.z, ['#ffffff', CAT_LOOK[kind].accent, '#ffd166'], 18, { up: 3 });
  sfx('build');
  return true;
}

export function upgrade(i) {
  const t = G.towers[i];
  if (!t || t.lvl >= 3) return false;
  const c = t.def.up[t.lvl - 1];
  if (G.gold < c) return false;
  G.gold -= c;
  G.idle = 0;
  t.spent += c;
  t.lvl++;
  t.cat.setLevel(t.lvl);
  t.grow = 0.55;
  fx.burst(t.pad.x, 1.2, t.pad.z, ['#ffd166', '#ffffff', CAT_LOOK[t.kind].accent], 20, { up: 4 });
  sfx('upgrade');
  return true;
}

export const refund = t => Math.floor(t.spent * 0.7);

export function sell(i) {
  const t = G.towers[i];
  if (!t) return;
  G.gold += refund(t);
  S.remove(t.cat.group);
  if (t.beam) S.remove(t.beam, t.dot);
  G.towers[i] = null;
  W.setPad(i, null);
  fx.burst(t.pad.x, 0.6, t.pad.z, ['#ffffff', '#ffd166'], 12);
  sfx('pop');
}

export function startWave() {
  if (G.phase !== 'build') return;
  if (G.wave > 0 && G.nextT > 1) G.gold += Math.floor(G.nextT); // a small bonus for not waiting
  G.wave++;
  G.queue = waveList(G.wave);
  G.spawnT = 0.6;
  G.phase = 'wave';
  sfx('wave');
}

function endWave() {
  G.phase = 'build';
  G.nextT = G.nextMax = 10;
  const b = 10 + 4 * G.wave;
  G.gold += b;
  G.stats.waves++;
  hooks.pop(`+${b}🐟`, W.jar.position.x, 3.2, W.jar.position.z, 'gold big');
  sfx('win');
  try { if (G.wave > +(localStorage.getItem('purr.best') || 0)) localStorage.setItem('purr.best', G.wave); } catch {}
}

function lose() {
  G.phase = 'lost';
  sfx('party');
  hooks.lost();
}

// Kid-friendly retry: refill the jar and replay the same wave, keeping every cat.
export function retry() {
  for (const c of G.critters) S.remove(c.m.root);
  for (const s of G.shots) S.remove(s.m);
  G.critters = [];
  G.shots = [];
  for (const t of G.towers) if (t && t.beam) { t.zapT = 0; t.zapC = null; t.beam.visible = t.dot.visible = false; }
  G.treats = TREATS;
  G.wave = Math.max(0, G.wave - 1);
  G.queue = [];
  G.phase = 'build';
  G.nextT = G.nextMax = 8;
}

// Grandma Cat: a greedy helper that spends the fish where they cover the most path.
const WT = { yarn: 1, catnip: 1.2, laser: 1.1, chonk: 1.05 };
const coverCache = new Map();
function cover(i, r) {
  const key = i + ':' + r;
  if (!coverCache.has(key)) {
    const p = W.pads[i], P = W.path;
    let v = 0;
    for (let j = 0; j < P.n; j += 4) if ((P.px[j] - p.x) ** 2 + (P.pz[j] - p.z) ** 2 <= r * r) v++;
    coverCache.set(key, v);
  }
  return coverCache.get(key);
}

export function help() {
  if (G.phase === 'title') return -1;
  const count = {};
  for (const k in CATS) count[k] = 0;
  for (const t of G.towers) if (t) count[t.kind]++;
  let best = -1, bs = 0, act;
  W.pads.forEach((p, i) => {
    const t = G.towers[i];
    if (!t) {
      for (const k in CATS) {
        const d = CATS[k];
        if (d.cost > G.gold) continue;
        const sc = cover(i, d.range[0]) * WT[k] * 0.7 ** count[k] / d.cost;
        if (sc > bs) { bs = sc; best = i; act = () => build(i, k); }
      }
    } else if (t.lvl < 3) {
      const c = t.def.up[t.lvl - 1];
      if (c > G.gold) return;
      const sc = cover(i, t.def.range[t.lvl]) * WT[t.kind] * 0.85 / c;
      if (sc > bs) { bs = sc; best = i; act = () => upgrade(i); }
    }
  });
  if (best < 0) return -1;
  act();
  G.stats.helps++;
  W.grandmaHop();
  sfx('grandma', 0.2);
  const gp = W.grandma.group.position;
  fx.burst(gp.x, 1.4, gp.z, ['#d9c2ff', '#ffffff'], 10, { up: 3 });
  return best;
}

export function update(dt) {
  G.t += dt;
  G.idle += dt;
  if (G.phase === 'build') {
    G.nextT -= dt;
    if (G.nextT <= 0) startWave();
  } else if (G.phase === 'wave') {
    G.spawnT -= dt;
    while (G.queue.length && G.spawnT <= 0) {
      spawn(G.queue.shift()[0]);
      if (G.queue.length) G.spawnT += G.queue[0][1];
    }
    if (!G.queue.length && !G.critters.length) endWave();
  }
  if (G.phase !== 'lost') {
    for (const t of G.towers) if (t) updTower(t, dt);
    for (const c of G.critters) if (c.alive) updCritter(c, dt);
    G.critters = G.critters.filter(c => c.alive);
    updShots(dt);
  }
  updFading(dt);
  fx.update(dt);
  W.update(dt, G);
}
