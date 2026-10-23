export interface Attractor {
  readonly x: number;
  readonly y: number;
}

/** Advances one mark in grid-cell units. The spring always points to its home cell. */
export function stepMark(
  x: number,
  y: number,
  vx: number,
  vy: number,
  homeX: number,
  homeY: number,
  attractors: readonly Attractor[],
  strength: number,
  falloff: number,
  stiffness: number,
  damping: number,
  dt: number,
): { x: number; y: number; vx: number; vy: number } {
  let ax = stiffness * (homeX - x) - damping * vx;
  let ay = stiffness * (homeY - y) - damping * vy;
  for (const target of attractors) {
    const dx = target.x - x;
    const dy = target.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) continue;
    const pull = strength / Math.pow(1 + distance, falloff);
    ax += (dx / distance) * pull;
    ay += (dy / distance) * pull;
  }
  vx += ax * dt;
  vy += ay * dt;
  return { x: x + vx * dt, y: y + vy * dt, vx, vy };
}
