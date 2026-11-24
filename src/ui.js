// HUD, cushion menus, floating numbers and overlays. Built for fingers: no reading needed to play.
import * as THREE from 'three';
import * as game from './game.js';
import * as audio from './audio.js';
import { CAT_LOOK } from './models.js';

const { G, CATS } = game;
const $ = id => document.getElementById(id);
const v = new THREE.Vector3();
const pops = [], shown = {};
let W, cam, menuPad = -1, sellArm = false, cardT = 0;

export function init(world, camera) {
  W = world;
  cam = camera;
  $('play').onclick = play;
  $('go').onclick = () => { audio.unlock(); game.startWave(); };
  $('grandma').onclick = () => {
    audio.unlock();
    if (game.help() < 0) { nope($('grandma')); return; }
    G.idle = 0;
    if (menuPad >= 0) renderMenu();
  };
  $('pause').onclick = () => { audio.unlock(); setPaused(!G.paused); };
  $('speed').onclick = () => { G.speed = G.speed === 1 ? 2 : 1; $('speed').textContent = G.speed + '×'; };
  $('mute').onclick = () => { audio.unlock(); $('mute').textContent = audio.toggleMute() ? '🔇' : '🔊'; };
  $('mute').textContent = audio.isMuted() ? '🔇' : '🔊';
  game.hooks.pop = pop;
  game.hooks.card = card;
  game.hooks.lost = () => { closeMenu(); overlay('lost'); };
  document.addEventListener('keydown', key);
}

function wake() {
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch {}
}

function play() {
  audio.unlock();
  if (G.phase === 'title') game.begin();
  else if (G.phase === 'lost') game.retry();
  G.paused = false;
  $('pause').textContent = '⏸';
  $('overlay').hidden = true;
  wake();
}

const PANELS = {
  title: ['🐱🍪', 'Purrimeter', 'Help the cats keep the critters away from the treat jar!'],
  lost: ['🐭🎉🐰', 'Snack party!', 'The critters got the treats. Let’s try that wave again!'],
  pause: ['😴', 'Cat nap', 'Tap to keep playing.'],
};
function overlay(kind) {
  const [logo, h, p] = PANELS[kind];
  $('overlay').innerHTML = `<div class="panel"><div class="logo">${logo}</div><h1>${h}</h1><p>${p}</p>` +
    `<button id="play" class="big" aria-label="${kind === 'lost' ? 'Try again' : 'Play'}">${kind === 'lost' ? '↻' : '▶'}</button></div>`;
  $('play').onclick = play;
  $('overlay').hidden = false;
}

export function setPaused(p) {
  if (G.phase === 'title' || G.phase === 'lost') return;
  if (!p) { play(); return; }
  G.paused = true;
  $('pause').textContent = '▶';
  closeMenu();
  overlay('pause');
}

function nope(el) {
  el.classList.remove('nope');
  void el.offsetWidth; // restart the animation
  el.classList.add('nope');
  audio.sfx('nope', 0.15);
}

export const menuOpen = () => menuPad >= 0;

export function openMenu(i) {
  if (G.phase === 'title' || G.paused) return;
  audio.sfx('pop');
  menuPad = i;
  sellArm = false;
  G.idle = 0;
  renderMenu();
}

export function closeMenu() {
  menuPad = -1;
  $('menu').hidden = true;
  W.hideRange();
}

function renderMenu() {
  const i = menuPad, t = G.towers[i], m = $('menu');
  m.innerHTML = '';
  const add = (icon, color, cost, label, fn) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ic" style="--c:${color}">${icon}</span><span class="cost">${cost}</span>`;
    b.setAttribute('aria-label', label);
    b.onclick = e => { e.stopPropagation(); audio.unlock(); fn(b); };
    m.append(b);
    return b;
  };
  if (!t) {
    for (const [k, d] of Object.entries(CATS)) {
      const b = add(d.icon, CAT_LOOK[k].fur, `🐟${d.cost}`, `${d.name}, ${d.cost} fish`, b => { if (game.build(i, k)) closeMenu(); else nope(b); });
      b.dataset.cost = d.cost;
    }
    W.showRange(i, 3.8, '#ffffff');
  } else {
    if (t.lvl < 3) {
      const c = t.def.up[t.lvl - 1];
      const b = add('⬆️', CAT_LOOK[t.kind].accent, `🐟${c}`, `Make ${t.def.name} bigger, ${c} fish`, b => { if (game.upgrade(i)) renderMenu(); else nope(b); });
      b.dataset.cost = c;
    }
    const lvl = document.createElement('div');
    lvl.className = 'lvl';
    lvl.textContent = '⭐'.repeat(t.lvl) + '☆'.repeat(3 - t.lvl);
    lvl.setAttribute('aria-label', `Level ${t.lvl} of 3`);
    m.append(lvl);
    const r = game.refund(t);
    add('🏠', '#ffe0e0', `+🐟${r}`, `Send ${t.def.name} home for ${r} fish (tap twice)`, b => {
      if (!sellArm) { sellArm = true; b.classList.add('arm'); b.querySelector('.ic').textContent = '✔️'; audio.sfx('pop'); }
      else { game.sell(i); closeMenu(); }
    });
    W.showRange(i, t.def.range[t.lvl - 1], CAT_LOOK[t.kind].accent);
  }
  m.hidden = false;
  placeMenu();
}

function screen(x, y, z) {
  v.set(x, y, z).project(cam);
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z < 1];
}

function placeMenu() {
  if (menuPad < 0) return;
  const p = W.pads[menuPad], m = $('menu');
  const [x, y] = screen(p.x, 1.7, p.z), w = m.offsetWidth, h = m.offsetHeight;
  let top = y - h - 12;
  if (top < 84) top = y + 80;
  const left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2));
  top = Math.max(8, Math.min(innerHeight - h - 8, top));
  m.style.transform = `translate(${left}px, ${top}px)`;
}

export function pop(text, x, y, z, cls = '') {
  if (pops.length > 40) pops.shift().el.remove();
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  $('pops').append(el);
  pops.push({ el, x, y, z, t: 0, life: cls.includes('huge') ? 1.8 : 1.1 });
}

function card(def) {
  $('card').innerHTML = `<span class="ic">${def.icon}</span><div>${def.name}<small>${def.tip}</small></div>`;
  $('card').classList.remove('hide');
  cardT = 4;
}

function set(id, val) {
  if (shown[id] !== val) { shown[id] = val; $(id).textContent = val; }
}

function key(e) {
  if (e.key === ' ') { e.preventDefault(); game.startWave(); }
  else if (e.key === 'm') $('mute').click();
  else if (e.key === 'p') $('pause').click();
  else if (e.key === 'Escape') closeMenu();
  else if (menuPad >= 0 && '1234'.includes(e.key)) $('menu').querySelectorAll('button')[+e.key - 1]?.click();
}

export function update(dt) {
  set('gold', Math.floor(G.gold));
  set('treats', G.treats);
  set('wave', G.wave);
  const go = $('go');
  go.hidden = G.phase !== 'build' || G.paused;
  go.style.setProperty('--p', Math.max(0, Math.min(1, 1 - G.nextT / G.nextMax)).toFixed(3));
  $('grandma').classList.toggle('hint', G.phase !== 'title' && G.gold >= 50 && G.idle > 12);
  if (menuPad >= 0) {
    for (const b of $('menu').querySelectorAll('button[data-cost]')) b.classList.toggle('poor', +b.dataset.cost > G.gold);
    placeMenu();
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt;
    if (p.t >= p.life) { p.el.remove(); pops.splice(i, 1); continue; }
    const [sx, sy, vis] = screen(p.x, p.y + p.t * 1.2, p.z), k = p.t / p.life;
    p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${0.7 + Math.min(1, p.t * 8) * 0.3})`;
    p.el.style.opacity = vis ? String(1 - Math.max(0, (k - 0.6) / 0.4)) : '0';
  }
  if (cardT > 0 && (cardT -= dt) <= 0) $('card').classList.add('hide');
}
