// The map: a two-lane compound with an objective site, built from boxes only.
// Every box is a collider for the player, a surface a bullet stops on, and a ray the bots
// steer around. No models, no textures: lighting does all the shading.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

/**
 * The layout is written as data so the bots and the collision test read the same numbers.
 * `kind` decides the material and whether the piece blocks sight:
 *   wall   — full-height perimeter, never walked through
 *   cover  — chest-high, blocks shots but a crouched player sees over it
 *   block  — tall crate stack, blocks both
 *   pad    — the raised objective platform
 */
const LAYOUT = [
  // perimeter, 30 x 26 m, 5 m tall
  { w: 30.4, h: 5, d: 0.5, x: 0, y: 2.5, z: -13.2, kind: 'wall' },
  { w: 30.4, h: 5, d: 0.5, x: 0, y: 2.5, z: 13.2, kind: 'wall' },
  { w: 0.5, h: 5, d: 26.4, x: -15.2, y: 2.5, z: 0, kind: 'wall' },
  { w: 0.5, h: 5, d: 26.4, x: 15.2, y: 2.5, z: 0, kind: 'wall' },

  // the mid wall with two doorways: the only crossing, so both sites must be fought for
  { w: 10, h: 3.4, d: 0.5, x: -8, y: 1.7, z: 0, kind: 'wall' },
  { w: 10, h: 3.4, d: 0.5, x: 8, y: 1.7, z: 0, kind: 'wall' },
  { w: 4, h: 1.1, d: 0.5, x: -11.5, y: 0.55, z: 0, kind: 'cover' },
  { w: 4, h: 1.1, d: 0.5, x: 11.5, y: 0.55, z: 0, kind: 'cover' },

  // long lane cover, north
  { w: 3.2, h: 1.15, d: 1.2, x: -6.5, y: 0.575, z: -6.4, kind: 'cover' },
  { w: 1.2, h: 1.15, d: 3.2, x: -2.4, y: 0.575, z: -8.6, kind: 'cover' },
  { w: 2.2, h: 2.6, d: 2.2, x: 4.2, y: 1.3, z: -7.4, kind: 'block' },
  { w: 3.4, h: 1.15, d: 1.2, x: 9.6, y: 0.575, z: -5.2, kind: 'cover' },

  // long lane cover, south
  { w: 1.2, h: 1.15, d: 3.4, x: -9.8, y: 0.575, z: 5.6, kind: 'cover' },
  { w: 2.2, h: 2.6, d: 2.2, x: -4.6, y: 1.3, z: 7.8, kind: 'block' },
  { w: 3.2, h: 1.15, d: 1.2, x: 2.8, y: 0.575, z: 6.2, kind: 'cover' },
  { w: 3.2, h: 1.15, d: 1.2, x: 8.4, y: 0.575, z: 8.4, kind: 'cover' },

  // the objective pad, north side: a raised deck a team can hold
  { w: 5.6, h: 0.55, d: 4.2, x: 0, y: 0.275, z: -10.2, kind: 'pad' },
  { w: 1.1, h: 1.0, d: 1.1, x: -2.9, y: 0.5, z: -12.0, kind: 'cover' },
  { w: 1.1, h: 1.0, d: 1.1, x: 2.9, y: 0.5, z: -12.0, kind: 'cover' },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Each kind gets its own surface response, so the one directional light reads as a
  // gradient across a wall instead of a flat slab: walls are matte and light, crates are
  // darker and slightly glossy, the objective pad picks up the accent colour.
  const SURFACES = {
    wall: { color: PALETTE.surface, roughness: 0.88, metalness: 0.04 },
    cover: { color: PALETTE.hairline, roughness: 0.62, metalness: 0.10 },
    block: { color: PALETTE.canvas, roughness: 0.70, metalness: 0.16 },
    pad: { color: PALETTE.accentDim, roughness: 0.55, metalness: 0.12 },
  };
  const material = (kind) => {
    const spec = SURFACES[kind] ?? SURFACES.wall;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
    });
  };

  const materials = new Map();
  const colliders = [];
  const shootables = [];
  const boxes = [];

  for (const piece of LAYOUT) {
    const mat = materials.get(piece.kind) ?? material(piece.kind);
    materials.set(piece.kind, mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.w, piece.h, piece.d), mat);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    shootables.push(mesh);
    boxes.push({ box, kind: piece.kind, tall: piece.h >= 2.2 });
  }

  // floor: a single plane, so the player never falls through a seam
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 26, 15, 13),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.floor), roughness: 0.92, metalness: 0.03 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);
  shootables.push(floor);

  // a grid on the floor gives the eye a sense of distance while moving
  const grid = new THREE.GridHelper(30, 30, new THREE.Color(PALETTE.hairline), new THREE.Color(PALETTE.surface));
  grid.position.y = 0.005;
  grid.material.opacity = 0.55;
  grid.material.transparent = true;
  group.add(grid);

  // sky dome: a cheap gradient so the walls have something to silhouette against
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sky), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Ambient is kept low on purpose: at 1.25 it flooded every surface and the key light's
  // shadow became invisible. This is the ratio that lets a shadow read as a shadow.
  const hemi = new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.floor), 0.22);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 5.2);
  key.position.set(12, 18, 9);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2.5;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.15);
  fill.position.set(-10, 8, -12);
  scene.add(fill);

  /** True when a straight line between two points is broken by a tall piece. */
  function blocked(from, to) {
    const ray = new THREE.Ray(from, new THREE.Vector3().subVectors(to, from).normalize());
    const distance = from.distanceTo(to);
    for (const piece of boxes) {
      if (!piece.tall) continue;
      const hit = ray.intersectBox(piece.box, new THREE.Vector3());
      if (hit !== null && from.distanceTo(hit) < distance - 0.35) return true;
    }
    return false;
  }

  return { colliders, shootables, group, blocked, boxes, floor };
}
