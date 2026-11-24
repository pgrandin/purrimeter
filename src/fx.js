// Confetti-style particles (one instanced mesh) and expanding floor rings.
import * as THREE from 'three';

const MAX = 500;
const P = [], rings = [];
let mesh;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

export function init(scene) {
  mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color('#ffffff')); // create the color attribute before the first compile
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const rg = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    m.visible = false;
    m.renderOrder = 2;
    scene.add(m);
    rings.push({ m, t: 1, life: 1, r0: 0, r1: 1 });
  }
}

export function burst(x, y, z, colors, n = 12, o = {}) {
  const { speed = 3, size = 0.09, up = 2.5, grav = 7, life = 0.7 } = o;
  for (let i = 0; i < n; i++) {
    if (P.length >= MAX) P.shift();
    const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
    P.push({
      x, y, z, vx: Math.cos(a) * r, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * r, grav,
      t: 0, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8),
      c: new THREE.Color(colors[i % colors.length]), rx: Math.random() * 6,
    });
  }
}

export function ring(x, z, r0, r1, color, life = 0.6) {
  const R = rings.find(r => r.t >= r.life) || rings[0];
  Object.assign(R, { t: 0, life, r0, r1 });
  R.m.position.set(x, 0.07, z);
  R.m.material.color.set(color);
  R.m.visible = true;
}

export function update(dt) {
  let n = 0;
  for (let i = P.length - 1; i >= 0; i--) if ((P[i].t += dt) >= P[i].life) P.splice(i, 1);
  for (const p of P) {
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; }
    s.setScalar(p.size * (0.3 + 0.7 * (1 - p.t / p.life)));
    q.setFromEuler(e.set(p.rx + p.t * 6, p.t * 4, 0));
    mesh.setMatrixAt(n, m4.compose(v.set(p.x, p.y, p.z), q, s));
    mesh.setColorAt(n, p.c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  for (const R of rings) {
    if (R.t >= R.life) { R.m.visible = false; continue; }
    R.t += dt;
    const k = Math.min(1, R.t / R.life);
    R.m.scale.setScalar(R.r0 + (R.r1 - R.r0) * (1 - (1 - k) ** 2));
    R.m.material.opacity = 0.75 * (1 - k);
  }
}
