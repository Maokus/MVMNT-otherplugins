export type GridMarkShape =
  "circle" | "square" | "diamond" | "triangle" | "hexagon";

/** Absolute polygon vertices centred on the grid cell. */
export function markPolygonPoints(
  shape: Exclude<GridMarkShape, "circle">,
  centerX: number,
  centerY: number,
  radius: number,
  rotationRadians: number,
): number[] {
  const sides = shape === "triangle" ? 3 : shape === "hexagon" ? 6 : 4;
  const startAngle = shape === "square" ? -Math.PI / 4 : -Math.PI / 2;
  const vertexRadius = shape === "square" ? radius * Math.SQRT2 : radius;
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = startAngle + rotationRadians + (index * Math.PI * 2) / sides;
    points.push(
      centerX + Math.cos(angle) * vertexRadius,
      centerY + Math.sin(angle) * vertexRadius,
    );
  }
  return points;
}
