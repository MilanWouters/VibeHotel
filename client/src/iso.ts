export type Vec2 = { x: number; y: number };

export const TILE_W = 64;
export const TILE_H = 32;

/** grid -> screen (isometric diamond) */
export function gridToScreen(g: Vec2): Vec2 {
  const x = (g.x - g.y) * (TILE_W / 2);
  const y = (g.x + g.y) * (TILE_H / 2);
  return { x, y };
}

/** screen -> grid (approx inverse). Works for click picking. */
export function screenToGrid(s: Vec2): Vec2 {
  const gx = (s.y / (TILE_H / 2) + s.x / (TILE_W / 2)) / 2;
  const gy = (s.y / (TILE_H / 2) - s.x / (TILE_W / 2)) / 2;
  return { x: gx, y: gy };
}
