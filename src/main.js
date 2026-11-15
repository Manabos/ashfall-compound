// Main loop: a fixed 60 Hz simulation feeding a render at the display's rate.
//
// Match flow, as the bounty describes it: a buy phase where credits are spent, a live round
// where the player and five bots fight, then a round result, four times over. A round ends
// when the bots are all down (the player takes it) or the player is down (the bots take it);
// the timer running out hands it to whoever is still standing, or draws it.
//
// ?shot=buy|play|fire|win with &seed=N sets up a deterministic frame for a capture, renders
// it twice, freezes it and sets window.__shotReady, so a screenshot script needs no timing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots, createMatch } from './targets.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const SPAWN = { x: 0, z: 10.5, yaw: 0 };
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Tone mapping is what stops the scene reading as a flat grey box: without it every wall
// sits at the material's raw colour and the directional light has nothing to fall off into.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders, SPAWN);
const match = createMatch();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const direction = new THREE.Vector3();
const body = player.state;

let frozen = false;
let started = false;
let busy = shot !== null;
let elapsed = 0;

hud.setScore(0, 0, 1);
hud.setClock(match.state.timer);
hud.setHealth(100);
hud.setCredits(match.state.credits);
hud.setAlive(bots.aliveCount());
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.current.name);
weapon.equip('pistol');

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'matchEnd') restartMatch();
  if (match.state.phase === 'buy') {
    openBuy();
    return;
  }
  input.requestLock();
});

function restartMatch() {
  match.reset();
  bots.reset();
  player.respawn(SPAWN);
  weapon.equip('pistol');
  weapon.refill();
  syncHud();
  openBuy();
}

function openBuy() {
  hud.showBuy(WEAPONS, match.state.credits, (choice) => {
    if (!match.spend(choice.cost)) return;
    weapon.equip(choice.id);
    weapon.refill();
    hud.setCredits(match.state.credits);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, choice.name);
    hud.hideBuy();
    match.goLive();
    input.requestLock();
  });
  hud.setCredits(match.state.credits);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (match.state.phase !== 'matchEnd') {
    hud.showOverlay('Paused', 'The round is still running.', 'Click to resume');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncHud() {
  hud.setScore(match.state.allyScore, match.state.enemyScore, match.state.round);
  hud.setClock(match.state.timer);
  hud.setHealth(body.health);
  hud.setCredits(match.state.credits);
  hud.setAlive(bots.aliveCount());
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.current.name);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

/** One shot from the player: a ray, a damage roll and a recoil kick. */
function shoot(spreadOverride) {
  if (!weapon.takeRound()) return false;
  const spread = spreadOverride ?? weapon.spread(player.groundSpeed());
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(world.shootables.concat(bots.hitMeshes), false)[0];

  if (hit && hit.object.userData.bot) {
    const part = hit.object.userData.part === 'head' ? 'head' : 'torso';
    const result = bots.damage(hit.object, weapon.state.current.damage[part]);
    if (result === 'kill') {
      const victim = hit.object.userData.bot;
      match.bank(weapon.state.current.killReward);
      hud.addFeed('You', `Raider ${victim.index + 1}`, part === 'head');
      hud.hitMarker();
      hud.setCredits(match.state.credits);
    } else if (result === 'hit') {
      hud.hitMarker();
    }
  }

  weapon.pullTrigger();
  player.recoil(weapon.state.current.recoil + random() * 0.003, (random() * 2 - 1) * 0.003);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

/** A bot's shot at the player: a probability roll, not a ray, so aim is legible. */
function botShoot(bot, accuracy) {
  if (!body.alive) return;
  if (random() < accuracy) {
    const damage = 8 + Math.floor(random() * 14);
    body.health -= damage;
    hud.flashHurt();
    hud.setHealth(body.health);
    if (body.health <= 0) {
      body.alive = false;
      hud.addFeed(`Raider ${bot.index + 1}`, 'You', false);
      match.endRound('enemy');
      showRoundResult();
    }
  }
}

function showRoundResult() {
  const won = match.state.message === 'Round won';
  const done = match.state.phase === 'matchEnd';
  hud.showOverlay(
    done ? match.state.message : won ? 'Round secured' : 'Round lost',
    done
      ? `${match.state.allyScore} — ${match.state.enemyScore}. ${match.state.message === 'Match won' ? 'The compound is yours.' : 'The raiders hold it.'}`
      : `${match.state.allyScore} — ${match.state.enemyScore}. ${match.state.message}.`,
    done ? 'Play again' : 'Next round',
  );
  hud.showOverlay = hud.showOverlay;
}

function step(dt) {
  elapsed += dt;
  weapon.step(dt);
  hud.step(dt);

  if (match.state.phase === 'live') {
    player.step(dt, input.state.keys);
    bots.step(dt, { x: body.position.x, y: body.position.y + body.eye, z: body.position.z }, botShoot);
    match.state.timer -= dt;
    hud.setClock(match.state.timer);

    if (bots.aliveCount() === 0) {
      match.endRound('ally');
      showRoundResult();
    } else if (match.state.timer <= 0) {
      match.endRound(bots.aliveCount() > 0 && !body.alive ? 'enemy' : 'ally');
      showRoundResult();
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) return;

  const look = input.takeLook();
  player.look(look.x, look.y, 0.0022, weapon.state.zoomed ? weapon.state.current.zoom : 1);

  if (match.state.phase === 'live') {
    const w = weapon.state.current;
    if (input.state.firing && weapon.ready() && body.alive) {
      shoot(shot ? 0 : undefined);
      if (!w.automatic) input.state.firing = false;
    }
  }
  if (input.state.keys.has('KeyR')) weapon.reload();

  let steps = 0;
  accumulator += dt;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;

  hud.setSpread(weapon.spread(player.groundSpeed()));
  syncCamera();
  renderer.render(scene, camera);
}

/** Deterministic frames for the screenshot script. */
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    hud.setSpread(0.001);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.position.set(SPAWN.x, 0, SPAWN.z);
  body.pitch = 0;
  body.yaw = 0;
  match.goLive();

  if (name === 'buy') {
    match.state.phase = 'buy';
    hud.setScore(0, 0, 1);
    syncCamera();
    hud.showBuy(WEAPONS, match.state.credits, () => {});
    hud.setCredits(match.state.credits);
    paintTwiceThenReady();
    return;
  }

  weapon.equip('rifle');
  weapon.refill();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.current.name);

  if (name === 'play' || name === 'fire') {
    // Stand off-axis from the key light so the cover throws visible shadows across the
    // floor: a shot taken straight down a lane lands in the lit half and reads flat.
    body.position.set(-6.5, 0, -3.0);
    settle(30);
    aimAt(new THREE.Vector3(-2.0, 1.3, -8.5));
    settle(6);
    if (name === 'fire') {
      shoot(0);
      settle(2);
      hud.addFeed('You', 'Raider 3', true);
      hud.hitMarker();
      bots.damage(bots.bots[2].head, 100);
      settle(10);
    }
    hud.setScore(2, 1, 3);
    hud.setCredits(4200);
    hud.setHealth(72);
    hud.setAlive(bots.aliveCount());
    settle(4);
  } else if (name === 'win') {
    body.position.set(-6.5, 0, -3.0);
    for (const bot of bots.bots) {
      bots.damage(bot.torso, 100);
    }
    settle(24);
    aimAt(new THREE.Vector3(-2.0, 1.2, -9.0));
    hud.setScore(4, 1, 5);
    hud.setCredits(6100);
    hud.setHealth(88);
    hud.setAlive(0);
    hud.showOverlay('Match won', '4 — 1. The compound is yours.', 'Play again');
    settle(6);
  }

  paintTwiceThenReady();
}

let accumulator = 0;
let lastTime = performance.now();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// exposed so a screenshot script can inspect the live scene it just captured
window.__scene = { scene, renderer, camera, world, bots, match, player, weapon };

syncCamera();
if (shot) {
  runShot(shot);
} else {
  // The first round opens in the buy phase; the overlay explains the controls.
  hud.showOverlay(
    'Ashfall Compound',
    'Five raiders hold the north side. Clear them to take the round — keep still to shoot straight.',
    'Click to play',
  );
  requestAnimationFrame(frame);
}
