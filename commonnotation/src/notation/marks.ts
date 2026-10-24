import { finite } from "./midi";
import type { Point } from "./glyphs";
import type { LayoutNode } from "./layout";
import { resolveAnchor } from "./geometry";
export function seededValue(seed: number | string, id: string): number {
  let h = 2166136261;
  const s = `${seed}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function lineNode(
  id: string,
  a: Point,
  b: Point,
  width = 0.08,
  role = "connector",
): LayoutNode {
  finite(a.x, "Line X");
  finite(a.y, "Line Y");
  finite(b.x, "Line X");
  finite(b.y, "Line Y");
  finite(width, "Line width", 0, 100000);
  return {
    id,
    role,
    x: a.x,
    y: a.y,
    bounds: {
      x: Math.min(0, b.x - a.x) - width / 2,
      y: Math.min(0, b.y - a.y) - width / 2,
      width: Math.abs(b.x - a.x) + width,
      height: Math.abs(b.y - a.y) + width,
    },
    anchors: { start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y } },
    line: { x: b.x - a.x, y: b.y - a.y, width },
  };
}
export function ribbonNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  role = "ribbon",
): LayoutNode {
  finite(width, "Ribbon width", 0, 100000);
  finite(height, "Ribbon height", 0, 100000);
  finite(x, "Ribbon X");
  finite(y, "Ribbon Y");
  return {
    id,
    role,
    x,
    y,
    bounds: { x: 0, y: 0, width, height },
    anchors: {
      start: { x: 0, y: height / 2 },
      end: { x: width, y: height / 2 },
    },
    path: [
      { type: "moveTo", x: 0, y: 0 },
      { type: "lineTo", x: width, y: 0 },
      { type: "lineTo", x: width, y: height },
      { type: "lineTo", x: 0, y: height },
      { type: "closePath" },
    ],
  };
}
export function bracketNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): LayoutNode {
  return {
    id,
    role: "bracket",
    x,
    y,
    bounds: { x: 0, y: 0, width, height },
    anchors: {},
    children: [
      lineNode(`${id}:top`, { x: 0, y: 0 }, { x: width, y: 0 }),
      lineNode(`${id}:left`, { x: 0, y: 0 }, { x: 0, y: height }),
      lineNode(`${id}:right`, { x: width, y: 0 }, { x: width, y: height }),
    ],
  };
}
export function pointNode(
  id: string,
  x: number,
  y: number,
  radius = 0.12,
): LayoutNode {
  finite(radius, "Point radius", 0, 10000);
  finite(x, "Point X");
  finite(y, "Point Y");
  const k = 0.55228475 * radius;
  return {
    id,
    role: "point",
    x,
    y,
    bounds: { x: -radius, y: -radius, width: radius * 2, height: radius * 2 },
    anchors: { centre: { x: 0, y: 0 } },
    path: [
      { type: "moveTo", x: radius, y: 0 },
      {
        type: "bezierCurveTo",
        cp1x: radius,
        cp1y: k,
        cp2x: k,
        cp2y: radius,
        x: 0,
        y: radius,
      },
      {
        type: "bezierCurveTo",
        cp1x: -k,
        cp1y: radius,
        cp2x: -radius,
        cp2y: k,
        x: -radius,
        y: 0,
      },
      {
        type: "bezierCurveTo",
        cp1x: -radius,
        cp1y: -k,
        cp2x: -k,
        cp2y: -radius,
        x: 0,
        y: -radius,
      },
      {
        type: "bezierCurveTo",
        cp1x: k,
        cp1y: -radius,
        cp2x: radius,
        cp2y: -k,
        x: radius,
        y: 0,
      },
      { type: "closePath" },
    ],
  };
}
export function pointField(
  id: string,
  points: readonly (Point & { radius?: number; id?: string })[],
): LayoutNode[] {
  return points.map((p, i) =>
    pointNode(`${id}:${p.id ?? i}`, p.x, p.y, p.radius),
  );
}
export function anchorConnector(
  id: string,
  nodes: readonly LayoutNode[],
  from: { id: string; anchor: string },
  to: { id: string; anchor: string },
  width = 0.08,
): LayoutNode | undefined {
  const a = resolveAnchor(nodes, from.id, from.anchor),
    b = resolveAnchor(nodes, to.id, to.anchor);
  return a && b ? lineNode(id, a, b, width) : undefined;
}
