# Purrimeter

A cozy tower defense for kids. Cats sit on cushions around the living room and keep the critters away from the treat jar. Nobody gets hurt: critters get bonked with yarn, chase laser dots, get dizzy on catnip or fall asleep to a purr, and then they wander off in a puff of sparkles.

**[Play it](https://pgrandin.github.io/purrimeter/)**. On an iPad, open it in Safari and use *Share → Add to Home Screen* to get a full-screen app that also works offline.

## How to play

- Tap a cushion with a glowing paw print to pick a cat. Tap a cat to make it bigger (three levels) or send it home for some fish back.
- Tap ▶ to call the next wave early (you get a small bonus), or wait and it starts by itself.
- Stuck? Tap Grandma Cat (bottom left). She spends your fish where it helps most.
- If the critters eat all the treats, they have a snack party and you replay the same wave with all your cats.
- Drag to move around, pinch to zoom, 🎯 to see the whole room.

| Cat | What it does |
| --- | --- |
| 🧶 Yarn Tabby | Throws yarn balls. At level 3 it throws two. |
| 🌿 Catnip Cat | Lobs catnip. Everything it lands on gets dizzy and slow. Can't reach birds. |
| 🔴 Laser Cat | Critters chase the red dot backwards. The boss just stops. |
| 💤 Chonk | Everything nearby walks slower, and every purr sends them to sleep. |

Critters: dust bunnies (they split in two), speedy mice, robot vacuums (yarn bounces off), pigeons (fly over catnip), and on every fifth wave the Big Vroomba.

## How it is made

Plain ES modules and [three.js](https://threejs.org) r170 (MIT, in `vendor/`). There is no build step: GitHub Pages serves the repo as is. Every model, texture and sound is generated in code.

| File | Contents |
| --- | --- |
| `src/main.js` | Renderer, camera, touch input, main loop, tilt-shift pass |
| `src/world.js` | The living room, the path, cushions, treat jar |
| `src/models.js` | Cats and critters built from simple shapes |
| `src/game.js` | Cats, critters, waves, Grandma Cat |
| `src/ui.js` | HUD, menus, floating numbers, overlays |
| `src/audio.js` | Synthesized sound and music |
| `src/fx.js` | Particles and rings |
| `tools/smoke.mjs` | CI test: plays the game in headless Chrome and saves screenshots |

URL flags: `#nofx` turns off the tilt-shift blur, `#test` exposes `window.__p` and does not start the loop (used by the smoke test).

CI runs the smoke test on every pull request and uploads screenshots as the `shots` artifact. Pushes to `main` deploy to GitHub Pages.
