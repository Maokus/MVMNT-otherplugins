import { finite } from "./midi";
import type { LayoutNode } from "./layout";
export interface PathOptions {
  mode: "line" | "wave" | "circle";
  spacing: number;
  radius: number;
  amplitude: number;
  cycles: number;
  phase: number;
  rotateToPath: boolean;
}
/** Continuous placement in staff spaces. Phase is radians; tangent is radians. */
export function pathPosition(
  index: number,
  count: number,
  options: PathOptions,
): { x: number; y: number; tangent: number } {
  finite(index, "Path index");
  finite(count, "Path count", 0, 1000000);
  finite(options.spacing, "Path spacing", 0, 100000);
  finite(options.radius, "Path radius", 0, 100000);
  finite(options.amplitude, "Path amplitude", -100000, 100000);
  finite(options.cycles, "Wave cycles", -10000, 10000);
  finite(options.phase, "Path phase");
  const t = count > 1 ? index / (count - 1) : 0.5;
  if (options.mode === "circle") {
    const angle = options.phase + (index / Math.max(1, count)) * Math.PI * 2;
    return {
      x: Math.cos(angle) * options.radius,
      y: Math.sin(angle) * options.radius,
      tangent: angle + Math.PI / 2,
    };
  }
  const x = (index - (count - 1) / 2) * options.spacing;
  if (options.mode === "wave") {
    const angle = t * options.cycles * Math.PI * 2 + options.phase;
    return {
      x,
      y: Math.sin(angle) * options.amplitude,
      tangent: Math.atan2(
        Math.cos(angle) * options.amplitude * options.cycles * Math.PI * 2,
        Math.max(0.001, (count - 1) * options.spacing),
      ),
    };
  }
  return { x, y: 0, tangent: 0 };
}
/** Repositions copies of assembled nodes without altering pitch spelling or geometry. */
export function placeOnPath(
  nodes: readonly LayoutNode[],
  options: PathOptions,
): LayoutNode[] {
  return nodes.map((node, index) => {
    const p = pathPosition(index, nodes.length, options);
    return {
      ...node,
      x: p.x,
      y: p.y,
      rotation: options.rotateToPath ? p.tangent : 0,
    };
  });
}
