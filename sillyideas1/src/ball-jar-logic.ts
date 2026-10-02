export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

export function timeUnitIndex(
  beat: number,
  numerator: number,
  denominator: number,
  timeUnitBars: number,
): number {
  const quarterNotesPerBar =
    (Math.max(1, numerator) * 4) / Math.max(1, denominator);
  const beatsPerUnit = quarterNotesPerBar * Math.max(0.25, timeUnitBars);
  return Math.floor((beat + 1e-9) / beatsPerUnit);
}

export function resolveJarBounds(
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  width: number,
  height: number,
  wallThickness: number,
  radius: number,
  restitution: number,
): Readonly<{ x: number; y: number; velocityX: number; velocityY: number }> {
  const left = wallThickness + radius;
  const right = width - wallThickness - radius;
  const bottom = height - wallThickness - radius;
  let nextX = x;
  let nextY = y;
  let nextVelocityX = velocityX;
  let nextVelocityY = velocityY;

  if (nextX < left) {
    nextX = left;
    nextVelocityX = Math.abs(nextVelocityX) * restitution;
  } else if (nextX > right) {
    nextX = right;
    nextVelocityX = -Math.abs(nextVelocityX) * restitution;
  }
  if (nextY > bottom) {
    nextY = bottom;
    nextVelocityY = -Math.abs(nextVelocityY) * restitution;
  }
  return {
    x: nextX,
    y: nextY,
    velocityX: nextVelocityX,
    velocityY: nextVelocityY,
  };
}
