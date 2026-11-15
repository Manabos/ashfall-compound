# Ashfall Compound — a round-based tactical FPS

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Manabos/ashfall-compound/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Manabos/ashfall-compound/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A round-based tactical shooter in three.js. Two sides, short rounds, credits between rounds,
and a rifle that only hits when you stand still.

## The loop

1. **Buy phase** — spend credits on one of four weapons. Credits carry over; you keep the gun.
2. **Live round** — five raiders push from the north side. Clear them, and the round is yours;
   go down, and it is theirs. 90 seconds on the clock.
3. **Round result** — the winner banks credits, the loser banks fewer.
4. First side to **four rounds** takes the match.

## Why accuracy beats speed

Aim spread is a function of movement speed: full sprint opens the cone to 2.8× the standing
value, and the crosshair visibly widens as you run. Walking (`Shift`) is slower but tightens
it again, and the bolt-action's scope cuts spread to a quarter. Every bot's accuracy also
settles the longer it has eyes on you, so the player who keeps moving is harder to hit.

## The arsenal

| weapon | cost | damage (torso) | rounds | role |
|---|---|---|---|---|
| MK3 Sidearm | free | 26 | 12 | what you fall back to |
| SL-9 SMG | $1500 | 21 | 30 | close quarters, pays $600 a kill |
| VK-11 Rifle | $2700 | 32 | 30 | the all-rounder |
| Longview 7 | $3200 | 95 | 5 | one shot, if you can stand still |

## The map

A 30 × 26 m compound: a mid wall with two doorways, two long lanes of cover, a raised
objective deck on the north side. Boxes only, no textures — all shading comes from one
shadow-casting key light, a low ambient and a fill, with ACES tone mapping.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
node main.ts           # copies game/ + screenshots/ to $MAKEFUN_OUTPUT_DIR, writes dossier.json
```

Controls: **WASD** move · **Mouse** aim · **Click** fire · **R** reload · **Shift** walk ·
**Ctrl** crouch · **Right-click** scope · **1–4** buy.

## Files

- `game/index.html` — the page, the HUD markup and its one stylesheet
- `game/src/main.js` — the fixed-step loop, match flow and the deterministic screenshot frames
- `game/src/world.js` — the map, its materials and the light rig
- `game/src/targets.js` — the bots' behaviour and the round economy
- `game/src/player.js` — movement, crouch, walk and collision
- `game/src/weapon.js` — the four weapons and the spread model
- `game/src/hud.js` — everything the HUD draws
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/vendor/three/` — three.js, vendored (the only third-party code)
