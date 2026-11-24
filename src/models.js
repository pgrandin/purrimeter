// Procedural models: every cat, critter and prop is built from simple shapes.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mats = new Map();

export function mat(color, o) {
  const key = color + (o ? JSON.stringify(o) : '');
  let m = mats.get(key);
  if (!m) mats.set(key, m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
  return m;
}

export const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  lo: new THREE.SphereGeometry(1, 12, 8),
  cone: new THREE.ConeGeometry(1, 1, 18),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 28),
  box: new THREE.BoxGeometry(1, 1, 1),
  ring: new THREE.TorusGeometry(1, 0.08, 8, 32),
  donut: new THREE.TorusGeometry(1, 0.42, 14, 36),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 16),
};

// part('sphere', '#fff', [x, y, z], scale or [sx, sy, sz], [rx, ry, rz], materialOptions)
export function part(geo, color, p = [0, 0, 0], s = 1, r, o) {
  const m = new THREE.Mesh(GEO[geo] || geo, color.isMaterial ? color : mat(color, o));
  m.position.set(...p);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
  if (r) m.rotation.set(...r);
  m.castShadow = Math.max(m.scale.x, m.scale.y, m.scale.z) > 0.1;
  return m;
}

// Big shiny cartoon eyes, one group per eye so they can blink or squint.
function eyes(parent, { x, y, z, w = 0.08, h = 0.1, iris }) {
  const out = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * x, y, z);
    if (iris) {
      g.add(part('lo', iris, [0, 0, 0], [w * 1.15, h * 1.1, w * 0.7]));
      g.add(part('lo', '#1d1a22', [0, 0, w * 0.35], [w * 0.55, h * 0.8, w * 0.5]));
    } else {
      g.add(part('lo', '#1d1a22', [0, 0, 0], [w, h, w * 0.7], null, { roughness: 0.25 }));
    }
    g.add(part('lo', '#ffffff', [-w * 0.3, h * 0.35, w * 0.55], w * 0.34, null, { emissive: '#ffffff', emissiveIntensity: 0.8 }));
    parent.add(g);
    out.push(g);
  }
  return out;
}

const yarnMats = {};
export function yarnMat(c) {
  if (!yarnMats[c]) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3;
    for (let i = -64; i < 128; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 40, 64); g.stroke(); }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    yarnMats[c] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }
  return yarnMats[c];
}

export const CAT_LOOK = {
  yarn: { fur: '#f5a65b', belly: '#fff3e0', ear: '#ffb7ae', accent: '#ff7eb6', pad: '#ffd9bd' },
  catnip: { fur: '#a6b8d8', belly: '#f2f5fc', ear: '#f7c1ca', accent: '#62c262', pad: '#d3edc8' },
  laser: { fur: '#45414f', belly: '#f6f2ec', ear: '#e9a7ba', accent: '#ff4f64', iris: '#e5f27a', pad: '#ffd0d5' },
  chonk: { fur: '#fbf4ea', belly: '#ffffff', ear: '#f7b7be', accent: '#ffb347', spots: ['#f2a24e', '#4f4756'], pad: '#ffe6bd' },
  grandma: { fur: '#c2bac4', belly: '#f5f1f4', ear: '#f2b9c3', accent: '#b28dd6' },
};

let tailGeo;
export function makeCat(kind) {
  const L = CAT_LOOK[kind], w = kind === 'chonk' ? 1.3 : 1;
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);

  body.add(part('sphere', L.fur, [0, 0.5, 0], [0.47 * w, 0.52, 0.43 * w]));
  body.add(part('sphere', L.belly, [0, 0.45, 0.17 * w + 0.03], [0.32 * w, 0.4, 0.3]));
  for (const s of [-1, 1]) body.add(part('sphere', L.belly, [s * 0.17 * w, 0.08, 0.3 + 0.08 * w], [0.13, 0.09, 0.16]));
  if (L.spots) {
    body.add(part('sphere', L.spots[0], [0.55, 0.62, -0.06], [0.1, 0.22, 0.26]));
    body.add(part('sphere', L.spots[1], [-0.56, 0.42, -0.1], [0.1, 0.18, 0.2]));
  }

  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.06);
  body.add(head);
  head.add(part('sphere', L.fur, [0, 0, 0], [0.42, 0.37, 0.38]));
  for (const s of [-1, 1]) {
    head.add(part('cone', L.spots && s > 0 ? L.spots[0] : L.fur, [s * 0.25, 0.32, -0.03], [0.15, 0.3, 0.11], [0, 0, -s * 0.4]));
    head.add(part('cone', L.ear, [s * 0.245, 0.3, 0.025], [0.085, 0.19, 0.04], [0, 0, -s * 0.4]));
  }
  const ey = eyes(head, { x: 0.155, y: 0.02, z: 0.3, w: 0.085, h: 0.105, iris: L.iris });
  if (kind === 'chonk' || kind === 'grandma') ey.forEach(e => { e.scale.y = 0.4; });
  head.add(part('lo', '#f28aa2', [0, -0.07, 0.37], [0.045, 0.032, 0.03]));
  for (const s of [-1, 1]) head.add(part('lo', L.belly, [s * 0.065, -0.12, 0.33], [0.085, 0.065, 0.06]));
  for (const s of [-1, 1]) head.add(part('lo', '#ffaebb', [s * 0.27, -0.07, 0.27], [0.06, 0.035, 0.03]));

  tailGeo ||= new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.12, 0.1, -0.12), V(0.32, 0.3, -0.12), V(0.38, 0.6, -0.02)]), 20, 0.065, 8, false);
  const tail = new THREE.Group();
  tail.position.set(0.1 * w, 0.16, -0.36 * w);
  body.add(tail);
  const tm = new THREE.Mesh(tailGeo, mat(L.fur));
  tm.castShadow = true;
  tail.add(tm, part('lo', L.spots ? L.spots[1] : L.fur, [0.38, 0.6, -0.02], 0.07));

  // What each kind of cat keeps beside it.
  if (kind === 'yarn') {
    body.add(part('cyl', '#c98b5b', [0.64, 0.13, 0.2], [0.24, 0.26, 0.24]));
    body.add(part('sphere', yarnMat('#7ec8ff'), [0.58, 0.3, 0.14], 0.13), part('sphere', yarnMat('#ff8fb1'), [0.72, 0.31, 0.27], 0.12));
  } else if (kind === 'catnip') {
    body.add(part('cyl', '#e38b62', [0.64, 0.15, 0.18], [0.17, 0.3, 0.17]));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      body.add(part('sphere', '#5fbf5a', [0.64 + Math.cos(a) * 0.08, 0.42, 0.18 + Math.sin(a) * 0.08], [0.06, 0.16, 0.04], [Math.sin(a) * 0.5, a, Math.cos(a) * 0.5]));
    }
  } else if (kind === 'laser') {
    body.add(part('cyl', '#9aa0b2', [0.2, 0.2, 0.44], [0.035, 0.3, 0.035], [1.3, 0, 0]));
    body.add(part('lo', '#ff4f64', [0.2, 0.25, 0.59], 0.04, null, { emissive: '#ff4f64', emissiveIntensity: 2 }));
  } else if (kind === 'grandma') {
    for (const s of [-1, 1]) head.add(part('ring', '#8a6a4a', [s * 0.155, 0.02, 0.37], [0.1, 0.1, 0.5], null, { metalness: 0.4, roughness: 0.4 }));
    head.add(part('box', '#8a6a4a', [0, 0.04, 0.38], [0.1, 0.015, 0.015]));
  }

  // Level 2 adds a collar with a bell, level 3 a party hat (Chonk gets a crown).
  const collar = new THREE.Group();
  collar.add(part('ring', L.accent, [0, 0.72, 0], [0.44 * w, 0.42 * w, 1], [Math.PI / 2, 0, 0]));
  collar.add(part('lo', '#ffd34d', [0, 0.64, 0.42 * w], 0.065, null, { metalness: 0.5, roughness: 0.3 }));
  body.add(collar);
  const hat = new THREE.Group();
  hat.position.set(0.04, 0.36, 0);
  hat.rotation.z = -0.22;
  head.add(hat);
  if (kind === 'chonk') {
    const gold = mat('#ffd34d', { metalness: 0.5, roughness: 0.3 });
    hat.add(part('cyl', gold, [0, 0.05, 0], [0.2, 0.1, 0.2]));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      hat.add(part('cone', gold, [Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17], [0.05, 0.14, 0.05]));
    }
  } else {
    hat.add(part('cone', L.accent, [0, 0.16, 0], [0.15, 0.34, 0.15]));
    hat.add(part('ring', '#ffffff', [0, 0.08, 0], [0.12, 0.12, 0.6], [Math.PI / 2, 0, 0]));
    hat.add(part('lo', '#ffffff', [0, 0.35, 0], 0.06));
  }

  const api = { group, body, head, tail, kind, base: 1 };
  api.setLevel = l => {
    api.base = [0.74, 0.9, 1.06][l - 1];
    group.scale.setScalar(api.base);
    collar.visible = l >= 2;
    hat.visible = l >= 3;
  };
  api.setLevel(1);
  return api;
}

export function makeYarn() {
  const c = ['#ff8fb1', '#7ec8ff', '#ffd166', '#b69cff'][Math.floor(Math.random() * 4)];
  return part('sphere', yarnMat(c), [0, 0, 0], 0.17);
}

export function makeNip() {
  const g = new THREE.Group();
  g.add(part('sphere', '#7ccf6b', [0, 0, 0], [0.17, 0.15, 0.17]));
  g.add(part('cone', '#7ccf6b', [0, 0.17, 0], [0.08, 0.12, 0.08]));
  g.add(part('ring', '#ff7eb6', [0, 0.11, 0], [0.07, 0.07, 0.5], [Math.PI / 2, 0, 0]));
  g.children.forEach(m => { m.castShadow = true; });
  return g;
}

const BAR_BG = new THREE.MeshBasicMaterial({ color: '#4a3b52', transparent: true, opacity: 0.55, depthTest: false });
const BAR_FG = new THREE.MeshBasicMaterial({ color: '#7fe08f', transparent: true, depthTest: false });
const BAR_G = new THREE.PlaneGeometry(0.8, 0.09).translate(0.4, 0, 0);
const BAR_BGG = new THREE.PlaneGeometry(0.9, 0.17);

// root: positioned on the path, never rotated. model: turns to face the way it walks. body: bobs and squashes.
export function makeCritter(kind) {
  const root = new THREE.Group(), model = new THREE.Group(), body = new THREE.Group();
  root.add(model);
  model.add(body);
  const r = { root, model, body, wings: [], spin: null, h: 0.8 };

  if (kind === 'bunny' || kind === 'mini') {
    const c = '#cbc4d8';
    body.add(part('sphere', c, [0, 0.36, 0], [0.34, 0.31, 0.33]));
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      if (Math.sin(a) > 0.6) continue; // keep the face clear
      body.add(part('lo', i % 2 ? '#dcd6e6' : '#b6aec6', [Math.cos(a) * 0.27, 0.34 + Math.sin(i * 2.3) * 0.13, Math.sin(a) * 0.26], 0.13));
    }
    for (const s of [-1, 1]) {
      body.add(part('capsule', c, [s * 0.12, 0.76, -0.04], [0.13, 0.19, 0.09], [0, 0, s * 0.28]));
      body.add(part('capsule', '#f5c3d2', [s * 0.12, 0.76, 0], [0.07, 0.14, 0.04], [0, 0, s * 0.28]));
      body.add(part('lo', c, [s * 0.14, 0.06, 0.18], [0.1, 0.06, 0.13]));
    }
    eyes(body, { x: 0.11, y: 0.42, z: 0.27, w: 0.06, h: 0.075 });
    body.add(part('lo', '#f29bb0', [0, 0.34, 0.33], 0.03));
    if (kind === 'mini') { model.scale.setScalar(0.6); r.h = 0.6; } else r.h = 0.95;
  } else if (kind === 'mouse') {
    const c = '#c4b8ae', pink = '#f5b3c3';
    body.add(part('sphere', c, [0, 0.25, -0.02], [0.23, 0.21, 0.32]));
    body.add(part('sphere', c, [0, 0.33, 0.28], [0.17, 0.16, 0.18]));
    body.add(part('cone', c, [0, 0.3, 0.45], [0.09, 0.16, 0.09], [Math.PI / 2, 0, 0]));
    body.add(part('lo', pink, [0, 0.3, 0.54], 0.035));
    for (const s of [-1, 1]) {
      body.add(part('cyl', c, [s * 0.14, 0.5, 0.24], [0.12, 0.025, 0.12], [Math.PI / 2, 0, s * 0.3]));
      body.add(part('cyl', pink, [s * 0.14, 0.5, 0.255], [0.08, 0.02, 0.08], [Math.PI / 2, 0, s * 0.3]));
      for (const z of [-0.18, 0.16]) body.add(part('lo', pink, [s * 0.12, 0.04, z], [0.05, 0.03, 0.06]));
    }
    eyes(body, { x: 0.08, y: 0.38, z: 0.41, w: 0.04, h: 0.05 });
    body.add(part('box', '#ff7a7a', [0, 0.44, -0.08], [0.24, 0.22, 0.2]));
    body.add(part('box', '#ffd166', [0, 0.54, -0.08], [0.25, 0.05, 0.21]));
    body.add(part('box', '#ffd166', [0, 0.4, -0.185], [0.14, 0.08, 0.02]));
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.2, -0.3), V(0.05, 0.15, -0.5), V(-0.05, 0.25, -0.68)]), 10, 0.02, 5), mat(pink));
    body.add(tail);
    r.h = 0.75;
  } else if (kind === 'vacuum' || kind === 'boss') {
    const boss = kind === 'boss', glow = boss ? '#ff6f91' : '#64d2ff';
    body.add(part('cyl', '#f1f2f6', [0, 0.15, 0], [0.56, 0.22, 0.56], null, { roughness: 0.4 }));
    body.add(part('cyl', '#c9ccd6', [0, 0.09, 0], [0.58, 0.08, 0.58]));
    body.add(part('cyl', '#5d6373', [0, 0.27, 0], [0.5, 0.04, 0.5], null, { roughness: 0.3 }));
    body.add(part('ring', glow, [0, 0.3, 0], [0.34, 0.34, 0.8], [Math.PI / 2, 0, 0], { emissive: glow, emissiveIntensity: 1.5 }));
    for (const s of [-1, 1]) {
      body.add(part('lo', '#ffffff', [s * 0.17, 0.36, 0.3], [0.12, 0.12, 0.1], null, { roughness: 0.3 }));
      body.add(part('lo', '#1d1a22', [s * 0.17, 0.36, 0.39], [0.06, 0.06, 0.03]));
    }
    const br = new THREE.Group();
    br.position.set(0.38, 0.03, 0.38);
    for (let i = 0; i < 3; i++) br.add(part('box', '#8a90a0', [0, 0, 0], [0.36, 0.015, 0.03], [0, i * Math.PI / 3, 0]));
    body.add(br);
    r.spin = br;
    if (boss) {
      for (const s of [-1, 1]) body.add(part('box', '#4a3b52', [s * 0.17, 0.5, 0.33], [0.16, 0.035, 0.03], [0, 0, s * 0.35]));
      const gold = mat('#ffd34d', { metalness: 0.5, roughness: 0.3 });
      body.add(part('cyl', gold, [0, 0.36, -0.08], [0.2, 0.1, 0.2]));
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        body.add(part('cone', gold, [Math.cos(a) * 0.17, 0.47, -0.08 + Math.sin(a) * 0.17], [0.05, 0.13, 0.05]));
      }
      model.scale.setScalar(2.3);
      r.h = 1.6;
    } else r.h = 0.6;
  } else if (kind === 'pigeon') {
    body.add(part('sphere', '#aeb7cc', [0, 0, 0], [0.25, 0.23, 0.34]));
    body.add(part('sphere', '#9aa5bd', [0, 0.2, 0.25], 0.15));
    body.add(part('sphere', '#83cdb0', [0, 0.08, 0.2], [0.17, 0.13, 0.14], null, { roughness: 0.35, metalness: 0.2 }));
    body.add(part('cone', '#ffb347', [0, 0.18, 0.43], [0.045, 0.11, 0.045], [Math.PI / 2, 0, 0]));
    eyes(body, { x: 0.085, y: 0.25, z: 0.355, w: 0.035, h: 0.04, iris: '#ff9a3c' });
    for (const s of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(s * 0.18, 0.06, 0);
      wg.add(part('sphere', '#8f9bb4', [s * 0.16, 0, -0.02], [0.2, 0.04, 0.17]));
      body.add(wg);
      r.wings.push(wg);
      body.add(part('lo', '#ff9a6a', [s * 0.08, -0.22, 0.02], [0.04, 0.03, 0.06]));
    }
    body.add(part('box', '#7f8aa3', [0, 0.02, -0.38], [0.2, 0.04, 0.2]));
    r.h = 0.45;
  }

  const bar = new THREE.Group();
  bar.visible = false;
  bar.position.y = r.h + 0.3;
  const bg = new THREE.Mesh(BAR_BGG, BAR_BG), fill = new THREE.Mesh(BAR_G, BAR_FG);
  fill.position.set(-0.4, 0, 0.01);
  bg.renderOrder = 20;
  fill.renderOrder = 21;
  bar.add(bg, fill);
  if (kind === 'boss') bar.scale.set(2.2, 1.5, 1);
  root.add(bar);
  r.bar = bar;
  r.fill = fill;
  return r;
}
