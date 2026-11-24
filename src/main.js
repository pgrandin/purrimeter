// Renderer, camera, touch input, the main loop and a small tilt-shift pass for the toy-diorama look.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import * as game from './game.js';
import * as ui from './ui.js';
import * as audio from './audio.js';

const { G } = game;
const flags = new URLSearchParams(location.hash.slice(1));
const TEST = flags.has('test');
const STEP = 1 / 60;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const FX = !flags.has('nofx') && ['EXT_color_buffer_float', 'EXT_color_buffer_half_float'].some(x => renderer.extensions.has(x));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#fbe6d4');
const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);

scene.add(new THREE.HemisphereLight('#fff8ee', '#dcc6b0', 1.7));
const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
sun.position.set(-9, 22, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const world = buildWorld(scene);
game.init(scene, world, camera);
ui.init(world, camera);

// Camera: orbit target, distance, fixed angles. Pinch and wheel zoom, drag pans.
const cam = { target: new THREE.Vector3(0, 0, 0.3), dist: 40, fit: 40, yaw: 0.55, pitch: 0.92, user: false };
function placeCam() {
  const { target: t, dist: d, yaw, pitch } = cam;
  camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * d, t.y + Math.sin(pitch) * d, t.z + Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(t);
  camera.updateMatrixWorld();
}
const corners = [];
for (const x of [-12.2, 12.2]) for (const z of [-8.9, 8.9]) for (const y of [0, 1]) corners.push(new THREE.Vector3(x, y, z));
function fitDist() {
  const t0 = cam.target.clone(), d0 = cam.dist, p = new THREE.Vector3();
  cam.target.set(0, 0, 0.3);
  let lo = 5, hi = 300;
  for (let i = 0; i < 22; i++) {
    cam.dist = (lo + hi) / 2;
    placeCam();
    const ok = corners.every(c => { p.copy(c).project(camera); return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.84; });
    if (ok) hi = cam.dist; else lo = cam.dist;
  }
  cam.target.copy(t0);
  cam.dist = d0;
  return hi;
}
const clampDist = d => Math.min(cam.fit * 1.15, Math.max(cam.fit * 0.38, d));
function home() { cam.target.set(0, 0, 0.3); cam.dist = cam.fit; cam.user = false; }
document.getElementById('home').onclick = home;

// Tilt-shift: blur the top and bottom of the frame so the room reads as a miniature.
let rt, post, postScene, postCam;
if (FX) {
  rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, texel: { value: new THREE.Vector2() }, strength: { value: 6 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 texel; uniform float strength; varying vec2 vUv;
      void main() {
        vec4 col = texture2D(tDiffuse, vUv);
        float r = smoothstep(0.2, 0.55, abs(vUv.y - 0.48)) * strength;
        if (r > 0.3) {
          vec4 acc = col;
          for (int i = 1; i < 16; i++) {
            float fi = float(i), a = fi * 2.39996;
            acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * sqrt(fi / 15.0) * r * texel);
          }
          col = acc / 16.0;
        }
        vec2 q = vUv - 0.5;
        col.rgb *= 1.0 - dot(q, q) * 0.3;
        gl_FragColor = col;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  }));
  post.frustumCulled = false;
  postScene = new THREE.Scene();
  postScene.add(post);
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

const size = new THREE.Vector2();
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (w * h)));
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cam.fit = fitDist();
  cam.dist = clampDist(cam.user ? cam.dist : cam.fit);
  if (post) {
    renderer.getDrawingBufferSize(size);
    rt.setSize(size.x, size.y);
    post.material.uniforms.texel.value.set(1 / size.x, 1 / size.y);
    post.material.uniforms.strength.value = 4.5 * pr;
  }
}
new ResizeObserver(resize).observe(canvas);
resize();

// Input. One finger: tap or pan. Two fingers: pinch zoom.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const A = new THREE.Vector3(), B = new THREE.Vector3();
const ptrs = new Map();
let moved = 0, pinch = null;
function aim(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pan(x0, y0, x1, y1) {
  aim(x0, y0);
  if (!ray.ray.intersectPlane(ground, A)) return;
  aim(x1, y1);
  if (!ray.ray.intersectPlane(ground, B)) return;
  cam.target.sub(B.sub(A));
  cam.target.x = Math.max(-11, Math.min(11, cam.target.x));
  cam.target.z = Math.max(-8, Math.min(8, cam.target.z));
  cam.user = true;
  placeCam();
}
function tap(x, y) {
  aim(x, y);
  const hit = ray.intersectObjects(world.padHits, false)[0];
  if (hit) ui.openMenu(hit.object.userData.pad); else ui.closeMenu();
}
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  canvas.setPointerCapture?.(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = ptrs.size > 1 ? 99 : 0;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist };
  }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  if (ptrs.size === 1) {
    moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    if (moved > 10) pan(p.x, p.y, e.clientX, e.clientY);
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    cam.dist = clampDist(pinch.dist * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)));
    cam.user = true;
  }
});
const lift = e => {
  if (!ptrs.delete(e.pointerId)) return;
  if (ptrs.size === 0 && moved <= 10 && e.type === 'pointerup') tap(e.clientX, e.clientY);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size) moved = 99;
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.dist = clampDist(cam.dist * Math.exp(e.deltaY * 0.0015));
  cam.user = true;
}, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.phase === 'build' || G.phase === 'wave') ui.setPaused(true); audio.suspend(true); }
  else audio.suspend(false);
});

function draw(dt) {
  placeCam();
  ui.update(dt);
  if (post) {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  } else renderer.render(scene, camera);
}

let last = performance.now(), acc = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!G.paused) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= STEP && n++ < 8) { game.update(STEP); acc -= STEP; }
    if (n >= 8) acc = 0;
  }
  draw(dt);
  frames++;
}

// Hooks for the CI smoke test (tools/smoke.mjs): step the game without real time, then draw one frame.
window.__p = {
  G, game, world, ready: true, resize,
  step(sec) { for (let i = 0, n = Math.round(sec / STEP); i < n; i++) game.update(STEP); ui.update(sec); },
  draw() { draw(1 / 60); },
  pad(i) {
    placeCam();
    const p = world.pads[i], v = new THREE.Vector3(p.x, 0.5, p.z).project(camera), r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  },
  run() { last = performance.now(); requestAnimationFrame(frame); },
  frames: () => frames,
};
if (!TEST) requestAnimationFrame(frame);
