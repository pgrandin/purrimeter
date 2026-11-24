// The living-room diorama: floor, walls, furniture, the critter path, cushions (tower pads) and the treat jar.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { part, mat, makeCat, GEO } from './models.js';

// Path corners on the floor (x, z). Critters come out of the mouse hole and head for the treat jar.
const WAY = [[-7, -8.7], [-7, -3.5], [7, -3.5], [7, 1], [-4, 1], [-4, 5.5], [9.2, 5.5]];
const PADS = [[-4, -6], [1, -6], [-9.5, -1], [-4, -1.25], [0, -1.25], [4, -1.25], [9.5, -1.25],
  [-6.5, 3.25], [-1.5, 3.25], [2.5, 3.25], [6.5, 3.25], [1, 7.6], [6, 7.6]];
const STEP = 0.1;
const EMPTY = '#e6daf6';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

const pawTex = () => canvasTex(128, 128, g => {
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(64, 82, 28, 24, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[28, 48, 11], [50, 28, 12], [78, 28, 12], [100, 48, 11]]) {
    g.beginPath(); g.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2); g.fill();
  }
});

function rb(w, h, d, r, material, p, rot) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material.isMaterial ? material : mat(material));
  m.position.set(...p);
  if (rot) m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function buildPath() {
  const P = WAY.map(([x, z]) => new THREE.Vector2(x, z));
  const R = 1.3, pts = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const p1 = b.clone().add(a.clone().sub(b).setLength(R)), p2 = b.clone().add(c.clone().sub(b).setLength(R));
    for (let s = 0; s <= 10; s++) {
      const t = s / 10, u = 1 - t;
      pts.push(new THREE.Vector2(u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, u * u * p1.y + 2 * u * t * b.y + t * t * p2.y));
    }
  }
  pts.push(P.at(-1));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const n = Math.floor(cum.at(-1) / STEP) + 1;
  const px = new Float32Array(n), pz = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const d = i * STEP;
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const f = Math.min(1, (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]));
    px[i] = pts[j].x + (pts[j + 1].x - pts[j].x) * f;
    pz[i] = pts[j].y + (pts[j + 1].y - pts[j].y) * f;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  return {
    n, px, pz, tx, tz, len: (n - 1) * STEP,
    // Position and heading at distance d along the path.
    at(d, o) {
      const f = Math.min(n - 1.001, Math.max(0, d / STEP)), i = Math.floor(f), k = f - i;
      o.x = px[i] + (px[i + 1] - px[i]) * k;
      o.z = pz[i] + (pz[i + 1] - pz[i]) * k;
      o.tx = tx[i]; o.tz = tz[i];
      return o;
    },
  };
}

// A flat ribbon that follows the path, w is the half width.
function strip(path, w, y) {
  const { n, px, pz, tx, tz } = path, pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const nx = -tz[i], nz = tx[i];
    pos.push(px[i] + nx * w, y, pz[i] + nz * w, px[i] - nx * w, y, pz[i] - nz * w);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, i * STEP, 1, i * STEP);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildWorld(scene) {
  const add = (...o) => { scene.add(...o); return o[0]; };

  // Floor slab with wooden planks on top.
  const wood = canvasTex(512, 512, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const l = 82 + (r * 37 % 7) - 3;
      g.fillStyle = `hsl(32 62% ${l}%)`;
      g.fillRect(0, r * rh, w, rh);
      g.strokeStyle = 'rgba(150,100,60,.12)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 16) g.lineTo(x, r * rh + 12 + k * 13 + Math.sin(x / 40 + r * 3 + k) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(120,80,50,.35)';
      g.fillRect(0, r * rh, w, 3);
      g.fillRect(((r * 197) % w), r * rh, 3, rh);
    }
  }, [3, 2.2]);
  const side = mat('#f1d7bf');
  const floor = add(new THREE.Mesh(new THREE.BoxGeometry(24.4, 0.8, 17.8),
    [side, side, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75 }), side, side, side]));
  floor.position.set(0, -0.4, 0);
  floor.receiveShadow = true;

  // Two walls, cut away like a dollhouse.
  const paper = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cdeee2'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [x, y] of [[64, 64], [192, 192], [192, 64], [64, 192]]) {
      g.beginPath(); g.arc(x, y, x === y ? 14 : 9, 0, Math.PI * 2); g.fill();
    }
  }, [6, 1.6]);
  const wallM = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 });
  const back = add(new THREE.Mesh(new THREE.BoxGeometry(24.4, 6.5, 0.4), wallM));
  back.position.set(0, 3.25, -9.1);
  const left = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.5, 18.2), wallM));
  left.position.set(-12.4, 3.25, -0.1);
  for (const w of [back, left]) w.castShadow = w.receiveShadow = true;
  add(part('box', '#ffffff', [0, 0.25, -8.84], [24.4, 0.5, 0.12]), part('box', '#ffffff', [-12.14, 0.25, 0], [0.12, 0.5, 17.8]));

  // Mouse hole where the critters come in.
  const hole = add(new THREE.Mesh(new THREE.CircleGeometry(0.95, 24, 0, Math.PI), mat('#3b2c3f', { roughness: 1 })));
  hole.position.set(-7, 0.01, -8.76);
  const trim = add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.09, 8, 24, Math.PI), mat('#b7835a')));
  trim.position.set(-7, 0.01, -8.74);

  // Window with curtains, and a patch of sunlight on the floor.
  const win = add(new THREE.Group());
  win.position.set(1, 3.7, -8.86);
  win.add(part('box', '#bfe6ff', [0, 0, 0], [3.2, 2.6, 0.05], null, { emissive: '#bfe6ff', emissiveIntensity: 0.6 }));
  for (const [x, y, sx, sy] of [[0, 1.35, 3.5, 0.18], [0, -1.35, 3.5, 0.18], [-1.66, 0, 0.18, 2.8], [1.66, 0, 0.18, 2.8], [0, 0, 0.1, 2.6], [0, 0, 3.2, 0.1]]) {
    win.add(part('box', '#ffffff', [x, y, 0.06], [sx, sy, 0.12]));
  }
  win.add(part('box', '#ffffff', [0, -1.5, 0.2], [3.8, 0.14, 0.4]));
  for (const s of [-1, 1]) win.add(rb(0.9, 3.4, 0.2, 0.09, '#ffb3c7', [s * 2.15, 0.05, 0.2]));
  const beam = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })));
  beam.position.set(1.3, 0.025, -6.5);

  // Picture frame with a fish.
  const pic = canvasTex(128, 128, g => {
    g.fillStyle = '#ffe9a8'; g.fillRect(0, 0, 128, 128);
    g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐟', 64, 70);
  });
  add(part('box', '#c98b5b', [-3.2, 3.9, -8.86], [1.9, 1.9, 0.12]));
  const picM = add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: pic, roughness: 0.9 })));
  picM.position.set(-3.2, 3.9, -8.79);

  // Pink sofa against the back wall.
  const sofa = add(new THREE.Group());
  sofa.position.set(7.6, 0, -7.75);
  const pink = mat('#f7a8c0'), pink2 = mat('#fbc4d4');
  sofa.add(rb(6.6, 0.9, 2.0, 0.25, pink, [0, 0.55, 0]), rb(6.6, 1.7, 0.6, 0.25, pink, [0, 1.15, -0.75]));
  for (const s of [-1, 1]) {
    sofa.add(rb(0.6, 1.3, 2.0, 0.25, pink, [s * 3.3, 0.75, 0]), rb(3.0, 0.35, 1.5, 0.15, pink2, [s * 1.52, 1.12, 0.15]));
    for (const z of [-0.8, 0.8]) sofa.add(part('cyl', '#b7835a', [s * 3.2, 0.06, z], [0.12, 0.12, 0.12]));
  }
  sofa.add(rb(0.9, 0.9, 0.3, 0.15, '#9ee0cf', [-2.1, 1.6, -0.3], [-0.2, 0.2, 0.3]));
  add(part('sphere', mat('#ffd166'), [11.1, 0.35, -4.6], 0.35));

  // Potted plant in the corner.
  add(part('cyl', '#e38b62', [-10.8, 0.5, -7.8], [0.6, 1.0, 0.6]), part('cyl', '#ef9e78', [-10.8, 1.02, -7.8], [0.68, 0.14, 0.68]));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    add(part('sphere', i % 2 ? '#6cc07a' : '#58ad69', [-10.8 + Math.cos(a) * 0.45, 1.9, -7.8 + Math.sin(a) * 0.45], [0.22, 0.9, 0.22], [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]));
  }

  // Bookshelf on the left wall.
  const shelf = add(new THREE.Group());
  shelf.position.set(-11.55, 0, 3.2);
  shelf.add(rb(1.1, 3.4, 3.6, 0.08, '#e9c8a0', [0, 1.7, 0]));
  const bookColors = ['#ff8fb1', '#7ec8ff', '#ffd166', '#9ee0cf', '#b69cff', '#ff9a6a'];
  for (let r = 0; r < 3; r++) {
    shelf.add(part('box', '#d6ad80', [0.15, 0.25 + r * 1.05, 0], [0.9, 0.08, 3.4]));
    let z = -1.55;
    for (let b = 0; z < 1.4; b++) {
      const t = 0.22 + ((r * 7 + b * 3) % 4) * 0.05, h = 0.6 + ((r + b * 5) % 3) * 0.12;
      shelf.add(part('box', bookColors[(r * 2 + b) % 6], [0.2, 0.3 + r * 1.05 + h / 2, z + t / 2], [0.7, h, t]));
      z += t + 0.03;
    }
  }

  // Grandma Cat naps in her bed and wakes up to help.
  add(part('cyl', '#fff3e6', [-9.4, 0.1, 6.2], [1.15, 0.2, 1.15]));
  add(part('donut', '#c4adeb', [-9.4, 0.32, 6.2], [1.0, 1.0, 0.75], [Math.PI / 2, 0, 0]));
  const grandma = makeCat('grandma');
  grandma.setLevel(2);
  grandma.group.position.set(-9.4, 0.14, 6.2);
  grandma.group.rotation.y = 0.7;
  add(grandma.group);

  // Round rug.
  const rug = canvasTex(256, 256, g => {
    const cs = ['#f9c9d6', '#fff3e6', '#d9c8f0', '#fff3e6'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cs[i % 4]; g.beginPath(); g.arc(128, 128, 128 - i * 16, 0, Math.PI * 2); g.fill(); }
  });
  const rugM = add(new THREE.Mesh(new THREE.CircleGeometry(4.2, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rug, roughness: 1 })));
  rugM.position.set(1.5, 0.012, -1.1);
  rugM.receiveShadow = true;

  // The path: a teal runner with paw prints.
  const path = buildPath();
  const run1 = add(new THREE.Mesh(strip(path, 1.05, 0.03), mat('#6cbfb3', { side: THREE.DoubleSide, roughness: 1 })));
  const run2 = add(new THREE.Mesh(strip(path, 0.88, 0.035), mat('#a8ded6', { side: THREE.DoubleSide, roughness: 1 })));
  run1.receiveShadow = run2.receiveShadow = true;
  const paw = pawTex();
  const prints = [];
  for (let d = 1.4; d < path.len - 1; d += 1.4) prints.push(d);
  const pm = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: paw, transparent: true, opacity: 0.5, depthWrite: false }), prints.length));
  const o = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  prints.forEach((d, i) => {
    path.at(d, o);
    const side = i % 2 ? 0.22 : -0.22;
    q.setFromAxisAngle(UP, Math.atan2(o.tx, o.tz) + Math.PI);
    pm.setMatrixAt(i, m4.compose(new THREE.Vector3(o.x - o.tz * side, 0.045, o.z + o.tx * side), q, one));
  });

  // Cushions: the places where cats can sit.
  const cushionGeo = new THREE.CylinderGeometry(0.88, 0.92, 0.32, 32);
  const hitGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12);
  const pawMat = new THREE.MeshBasicMaterial({ map: paw, color: '#a98ad9', transparent: true, depthWrite: false });
  const pawGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
  const pads = PADS.map(([x, z], i) => {
    const g = add(new THREE.Group());
    g.position.set(x, 0, z);
    const m = new THREE.MeshStandardMaterial({ color: EMPTY, roughness: 0.9, emissive: '#b89cff', emissiveIntensity: 0 });
    const base = new THREE.Mesh(cushionGeo, m);
    base.position.y = 0.16;
    const top = new THREE.Mesh(GEO.sphere, m);
    top.scale.set(0.86, 0.12, 0.86);
    top.position.y = 0.3;
    for (const c of [base, top]) c.castShadow = c.receiveShadow = true;
    const pw = new THREE.Mesh(pawGeo, pawMat);
    pw.position.y = 0.43;
    pw.rotation.y = 0.5;
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.y = 1;
    hit.userData.pad = i;
    g.add(base, top, pw, hit);
    return { x, z, g, m, paw: pw, hit };
  });

  // Treat jar at the end of the path.
  const jar = add(new THREE.Group());
  jar.position.set(10.4, 0, 5.5);
  const glass = part('cyl', mat('#dff4ff', { transparent: true, opacity: 0.35, roughness: 0.1 }), [0, 0.85, 0], [0.85, 1.7, 0.85]);
  glass.castShadow = false;
  jar.add(part('cyl', '#ff9fbf', [0, 1.78, 0], [0.9, 0.18, 0.9]), part('sphere', '#ff9fbf', [0, 1.95, 0], 0.18));
  const cookies = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group(), a = i * 2.1, layer = Math.floor(i / 3);
    c.position.set(Math.cos(a) * 0.34, 0.14 + layer * 0.24, Math.sin(a) * 0.34);
    c.rotation.set(Math.sin(i) * 0.5, a, Math.cos(i * 1.7) * 0.5);
    c.add(part('cyl', '#d9a066', [0, 0, 0], [0.3, 0.08, 0.3]));
    for (let k = 0; k < 3; k++) c.add(part('lo', '#6b4430', [Math.cos(k * 2.1) * 0.15, 0.04, Math.sin(k * 2.1) * 0.15], 0.04));
    jar.add(c);
    cookies.push(c);
  }
  jar.add(glass);

  // Range preview, shown while a cushion's menu is open.
  const range = add(new THREE.Group());
  const rDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
  const rEdge = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
  range.add(rDisc, rEdge);
  range.visible = false;

  let t = 0, wig = 0, hop = 0;
  return {
    path, pads, jar, grandma,
    padHits: pads.map(p => p.hit),
    hole: new THREE.Vector3(-7, 0, -8.7),
    showRange(i, r, color) {
      range.position.set(pads[i].x, 0.06, pads[i].z);
      range.scale.set(r, 1, r);
      rDisc.material.color.set(color);
      range.visible = true;
    },
    hideRange() { range.visible = false; },
    setPad(i, color) { pads[i].m.color.set(color || EMPTY); },
    jarWiggle() { wig = 1; },
    grandmaHop() { hop = 0.5; },
    update(dt, G) {
      t += dt;
      const can = G.phase !== 'title' && G.gold >= 50;
      pads.forEach((p, i) => {
        const empty = !G.towers[i], glow = empty && can;
        p.paw.visible = empty;
        p.m.emissiveIntensity = glow ? 0.22 + 0.18 * Math.sin(t * 4 + i) : 0;
        p.paw.position.y = 0.43 + (glow ? 0.04 * (1 + Math.sin(t * 4 + i)) : 0);
      });
      wig = Math.max(0, wig - dt * 1.5);
      jar.rotation.z = Math.sin(t * 40) * wig * 0.1;
      const showN = Math.ceil(G.treats / 2);
      cookies.forEach((c, i) => { c.visible = i < showN; });
      hop = Math.max(0, hop - dt);
      grandma.body.position.y = hop > 0 ? Math.sin(hop / 0.5 * Math.PI) * 0.5 : 0;
      grandma.body.scale.y = 1 + Math.sin(t * 1.5) * 0.03;
      grandma.tail.rotation.z = Math.sin(t * 1.2) * 0.3;
      beam.material.opacity = 0.2 + Math.sin(t * 0.7) * 0.04;
    },
  };
}
