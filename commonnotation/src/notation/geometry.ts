import type { Bounds, Point } from "./glyphs";
import type { LayoutNode } from "./layout";
import { finite } from "./midi";
export type Matrix2D = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];
export const identity: Matrix2D = [1, 0, 0, 1, 0, 0];
export interface Transform2D {
  x?: number;
  y?: number;
  rotation?: number;
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
}
export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transformMatrix(node: Transform2D): Matrix2D {
  const angle = finite(node.rotation ?? 0, "Rotation"),
    sx = finite(node.scaleX ?? 1, "Scale"),
    sy = finite(node.scaleY ?? node.scaleX ?? 1, "Scale"),
    c = Math.cos(angle),
    s = Math.sin(angle),
    ox = finite(node.originX ?? 0, "Origin X"),
    oy = finite(node.originY ?? 0, "Origin Y");
  return [
    c * sx,
    s * sx,
    -s * sy,
    c * sy,
    finite(node.x ?? 0, "Position X") - c * sx * ox + s * sy * oy,
    finite(node.y ?? 0, "Position Y") - s * sx * ox - c * sy * oy,
  ];
}
export function transformPoint(matrix: Matrix2D, p: Point): Point {
  return {
    x: p.x * matrix[0] + p.y * matrix[2] + matrix[4],
    y: p.x * matrix[1] + p.y * matrix[3] + matrix[5],
  };
}
export function transformBounds(bounds: Bounds, matrix: Matrix2D): Bounds {
  const pts = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map((p) => transformPoint(matrix, p));
  const x = Math.min(...pts.map((p) => p.x)),
    y = Math.min(...pts.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...pts.map((p) => p.x)) - x,
    height: Math.max(...pts.map((p) => p.y)) - y,
  };
}
export function unionBounds(bounds: readonly Bounds[]): Bounds {
  if (!bounds.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...bounds.map((b) => b.x)),
    y = Math.min(...bounds.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...bounds.map((b) => b.x + b.width)) - x,
    height: Math.max(...bounds.map((b) => b.y + b.height)) - y,
  };
}
export function measureNodes(nodes: readonly LayoutNode[]): Bounds {
  return unionBounds(
    nodes.map((n) => transformBounds(n.bounds, transformMatrix(n))),
  );
}
export function walkNodes(
  nodes: readonly LayoutNode[],
  visit: (node: LayoutNode, matrix: Matrix2D, parent?: LayoutNode) => void,
  parentMatrix: Matrix2D = identity,
  parent?: LayoutNode,
): void {
  for (const node of nodes) {
    const matrix = multiply(parentMatrix, transformMatrix(node));
    visit(node, matrix, parent);
    walkNodes(node.children ?? [], visit, matrix, node);
  }
}
export function resolveAnchor(
  nodes: readonly LayoutNode[],
  id: string,
  anchor: string,
): Point | undefined {
  let result: Point | undefined;
  walkNodes(nodes, (n, m) => {
    if (n.id === id && n.anchors[anchor])
      result = transformPoint(m, n.anchors[anchor]);
  });
  return result;
}
/** Cached/restyled copies can always recompute parent geometry using the same transform rules. */
export function remeasure(node: LayoutNode): LayoutNode {
  const children = node.children?.map(remeasure);
  return {
    ...node,
    ...(children ? { children, bounds: measureNodes(children) } : {}),
  };
}
