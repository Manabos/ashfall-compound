// The arsenal. Three weapons with different jobs: a rifle for the mid range, a lighter
// SMG that pays for its fire rate in damage per round, and a bolt-action that rewards a
// still hand. Buying happens between rounds; what you carry into a round is what you have.
import * as THREE from 'three';

/**
 * `cost` is in credits, `killReward` what a kill with it pays back, so a good round with a
 * cheap gun still leaves you able to buy next round. `spreadStill` is the cone in radians
 * at rest; `spreadMoving` is added at full sprint, which is the whole point of the game:
// standing still is how you hit.
 */
export const WEAPONS = [
  {
    id: 'pistol',
    name: 'MK3 Sidearm',
    cost: 0,
    killReward: 300,
    magSize: 12,
    reserve: 48,
    fireGap: 0.16,
    reloadTime: 1.35,
    damage: { head: 78, torso: 26, limb: 16 },
    spreadStill: 0.0035,
    spreadMoving: 0.022,
    recoil: 0.010,
    zoom: 1.0,
    automatic: false,
    range: 60,
  },
  {
    id: 'rifle',
    name: 'VK-11 Rifle',
    cost: 2700,
    killReward: 300,
    magSize: 30,
    reserve: 90,
    fireGap: 0.096,
    reloadTime: 1.9,
    damage: { head: 100, torso: 32, limb: 21 },
    spreadStill: 0.0022,
    spreadMoving: 0.028,
    recoil: 0.009,
    zoom: 1.0,
    automatic: true,
    range: 80,
  },
  {
    id: 'smg',
    name: 'SL-9 SMG',
    cost: 1500,
    killReward: 600,
    magSize: 30,
    reserve: 120,
    fireGap: 0.072,
    reloadTime: 1.6,
    damage: { head: 62, torso: 21, limb: 13 },
    spreadStill: 0.006,
    spreadMoving: 0.020,
    recoil: 0.006,
    zoom: 1.0,
    automatic: true,
    range: 45,
  },
  {
    id: 'scout',
    name: 'Longview 7',
    cost: 3200,
    killReward: 300,
    magSize: 5,
    reserve: 25,
    fireGap: 1.15,
    reloadTime: 2.6,
    damage: { head: 200, torso: 95, limb: 60 },
    spreadStill: 0.0006,
    spreadMoving: 0.055,
    recoil: 0.030,
    zoom: 3.2,
    automatic: false,
    range: 120,
  },
];

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

const MUZZLE_TIME = 0.055;

/** The view model: a simple box gun that kicks, so the player has feedback without assets. */
export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a313b'), roughness: 0.72, metalness: 0.18 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e8e5de'), roughness: 0.48, metalness: 0.34 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  model.add(receiver, barrel, stock);
  model.position.set(0.22, -0.19, -0.4);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.17, -0.9);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color('#ffb347'), 0, 6);
  flashLight.position.set(0.22, -0.15, -0.55);
  camera.add(flashLight);

  const state = {
    current: WEAPON_BY_ID.get('pistol'),
    mag: 12,
    reserve: 48,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    zoomed: false,
  };

  function equip(id) {
    const weapon = WEAPON_BY_ID.get(id);
    if (!weapon) return;
    state.current = weapon;
    state.mag = weapon.magSize;
    state.reserve = weapon.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    // a longer barrel reads as a longer gun
    barrel.scale.z = weapon.id === 'scout' ? 1.5 : weapon.id === 'smg' ? 0.7 : 1;
    receiver.scale.z = weapon.id === 'smg' ? 0.8 : 1;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.4 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 16 : 0;

    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.current.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    equip,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    pullTrigger() {
      state.cooldown = state.current.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = state.current.recoil * 5.5;
    },
    reload() {
      const w = state.current;
      if (state.reloadLeft > 0 || state.mag === w.magSize || state.reserve === 0) return;
      state.reloadLeft = w.reloadTime;
    },
    spread(speed) {
      const w = state.current;
      const moving = Math.min(1, speed / 5.2) * w.spreadMoving;
      const zoomFactor = state.zoomed ? 0.25 : 1;
      return (w.spreadStill + moving) * zoomFactor;
    },
    refill() {
      const w = state.current;
      state.mag = w.magSize;
      state.reserve = w.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    toggleZoom() {
      state.zoomed = !state.zoomed && state.current.zoom > 1;
      return state.zoomed ? state.current.zoom : 1;
    },
  };
}
