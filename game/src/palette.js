// The look plan, in one place. Every shade the game needs comes from these values plus the
// lighting, so no other colour appears in the code. The same names are the CSS custom
// properties in index.html, which keeps the HUD and the 3D scene in one palette.
//
// These sit lighter than a "dark theme" would: ACES tone mapping crushes deep darks toward
// black, so a near-black wall renders as a void. Lifting the surfaces is what lets the
// directional light show as a gradient instead of a flat slab.
export const PALETTE = {
  canvas: '#2f353d',
  surface: '#6c7482',
  hairline: '#8b93a1',
  floor: '#565e6b',
  ink: '#f5f2ea',
  muted: '#aab2bd',
  accent: '#f2a93b',
  accentDim: '#a06a22',
  sky: '#5b7e9e',
  ally: '#4fa3e0',
  enemy: '#e05a50',
};

export function shade(name) {
  return PALETTE[name];
}
