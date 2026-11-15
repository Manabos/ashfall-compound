// The bots and the round. Five enemies spawn on the north side, the player holds the south;
// a round ends when one side is wiped or the timer runs out. Kills pay credits, credits buy
// guns, and the side that wins four rounds takes the match.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_HEALTH = 100;
const ROUND_SECONDS = 90;
const ROUNDS_TO_WIN = 4;
const SPAWNS = [
  { x: -8.5, z: -9.5 },
  { x: -3.0, z: -11.0 },
  { x: 2.5, z: -11.2 },
  { x: 8.2, z: -8.6 },
  { x: 0.0, z: -6.5 },
];

/**
 * A bot is a capsule with a head, a patrol point and three behaviours: advance toward the
 * player while it cannot see them, stop and fire when it can, and back off when hurt. Its
 * aim is deliberately imperfect and settles the longer it has been watching, so a player who
 * keeps moving is harder to hit: that is the accuracy-over-speed rule the bounty asks for.
 */
export function createBots(scene, world) {
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0c9a0'), roughness: 0.55 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });

  const torsoGeo = new THREE.BoxGeometry(0.5, 0.75, 0.32);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.8, 0.2);

  const bots = [];
  const hitMeshes = [];

  function build(index) {
    const group = new THREE.Group();
    const legs = new THREE.Mesh(legGeo, legMat);
    legs.position.y = 0.4;
    const leftLeg = legs.clone();
    leftLeg.position.x = -0.14;
    const rightLeg = legs.clone();
    rightLeg.position.x = 0.14;
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.68;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), legMat);
    gun.position.set(0.26, 1.2, -0.3);

    group.add(leftLeg, rightLeg, torso, head, gun);
    group.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      index,
      group,
      torso,
      head,
      legs: [leftLeg, rightLeg],
      health: BOT_HEALTH,
      alive: true,
      watch: 0,
      cooldown: 0,
      strafe: (index % 2 === 0 ? 1 : -1),
      spawn: SPAWNS[index % SPAWNS.length],
      fall: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < SPAWNS.length; i += 1) build(i);

  function reset() {
    for (const bot of bots) {
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.watch = 0;
      bot.cooldown = 0;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.set(bot.spawn.x, 0, bot.spawn.z);
      bot.group.visible = true;
    }
  }
  reset();

  /** Apply damage; returns 'kill' | 'hit' | null. */
  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return null;
    bot.health -= amount;
    if (bot.health > 0) return 'hit';
    bot.alive = false;
    bot.fall = 0;
    return 'kill';
  }

  /** One simulation step: see, chase, shoot. Called from the fixed 60 Hz loop. */
  function step(dt, playerPos, onShoot) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.45);
        bot.group.rotation.x = -bot.fall * 1.5;
        bot.group.position.y = -bot.fall * 0.1;
        continue;
      }

      const toPlayer = new THREE.Vector3(
        playerPos.x - bot.group.position.x,
        0,
        playerPos.z - bot.group.position.z,
      );
      const distance = toPlayer.length() || 1;
      toPlayer.divideScalar(distance);

      // face the player
      bot.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z) + Math.PI;

      const eye = new THREE.Vector3(bot.group.position.x, 1.55, bot.group.position.z);
      const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerPos.z);
      const sees = !world.blocked(eye, target) && distance < 42;

      if (sees) {
        bot.watch = Math.min(2.5, bot.watch + dt);
        // hold a firing distance: closer than 6 m it backs off, farther than 14 it closes
        const closing = distance > 14 ? 1 : distance < 6 ? -1 : 0;
        const strafeDir = Math.sin(bot.index * 2.1 + bot.watch * 0.7) * bot.strafe;
        const move = new THREE.Vector3()
          .addScaledVector(toPlayer, closing * 1.5 * dt)
          .addScaledVector(new THREE.Vector3(-toPlayer.z, 0, toPlayer.x), strafeDir * 1.2 * dt);
        bot.group.position.add(move);

        bot.cooldown -= dt;
        if (bot.cooldown <= 0 && distance < 38) {
          bot.cooldown = 0.55 + (bot.index % 3) * 0.12;
          // accuracy settles with watch time; a strafing player is simply harder to lead
          const accuracy = Math.min(0.62, 0.18 + bot.watch * 0.16);
          onShoot(bot, accuracy, distance);
        }
      } else {
        bot.watch = Math.max(0, bot.watch - dt * 0.6);
        // no line of sight: walk the south lane looking for one
        const drift = new THREE.Vector3(toPlayer.x * 0.35, 0, 0.85).normalize();
        bot.group.position.addScaledVector(drift, 1.7 * dt);
        bot.cooldown = Math.max(bot.cooldown, 0.25);
      }

      // legs swing with the walk, purely cosmetic
      const swing = Math.sin(performance.now() * 0.012 + bot.index) * 0.35;
      bot.legs[0].rotation.x = swing;
      bot.legs[1].rotation.x = -swing;

      // stay in the map
      bot.group.position.x = Math.max(-14, Math.min(14, bot.group.position.x));
      bot.group.position.z = Math.max(-12, Math.min(12, bot.group.position.z));
    }
  }

  return {
    bots,
    hitMeshes,
    damage,
    step,
    reset,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
  };
}

/** Round and match bookkeeping, kept apart from the rendering. */
export function createMatch() {
  const state = {
    phase: 'buy',          // buy | live | roundEnd | matchEnd
    round: 1,
    allyScore: 0,
    enemyScore: 0,
    timer: ROUND_SECONDS,
    credits: 800,
    message: '',
  };

  const CREDIT_START = 800;
  const CREDIT_CAP = 9000;
  const CREDIT_WIN = 3250;
  const CREDIT_LOSS = 1900;
  const CREDIT_SURVIVE = 800;

  function bank(amount) {
    state.credits = Math.min(CREDIT_CAP, state.credits + amount);
  }

  function spend(amount) {
    if (state.credits < amount) return false;
    state.credits -= amount;
    return true;
  }

  function beginRound() {
    state.phase = 'buy';
    state.timer = ROUND_SECONDS;
    state.message = `Round ${state.round} — buy phase`;
  }

  function goLive() {
    state.phase = 'live';
    state.message = '';
  }

  function endRound(winner) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    if (winner === 'ally') {
      state.allyScore += 1;
      bank(CREDIT_WIN);
      state.message = 'Round won';
    } else if (winner === 'enemy') {
      state.enemyScore += 1;
      bank(CREDIT_LOSS);
      state.message = 'Round lost';
    } else {
      bank(CREDIT_LOSS);
      state.message = 'Time — round drawn';
    }
    state.phase = state.allyScore >= ROUNDS_TO_WIN || state.enemyScore >= ROUNDS_TO_WIN ? 'matchEnd' : 'roundEnd';
    if (state.phase === 'matchEnd') {
      state.message = state.allyScore > state.enemyScore ? 'Match won' : 'Match lost';
    }
  }

  function nextRound() {
    state.round += 1;
    bank(CREDIT_SURVIVE);
    beginRound();
  }

  function reset() {
    state.phase = 'buy';
    state.round = 1;
    state.allyScore = 0;
    state.enemyScore = 0;
    state.timer = ROUND_SECONDS;
    state.credits = CREDIT_START;
    state.message = 'Round 1 — buy phase';
  }

  return { state, bank, spend, beginRound, goLive, endRound, nextRound, reset };
}
