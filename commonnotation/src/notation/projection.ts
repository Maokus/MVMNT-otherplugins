import {
  BezierPath,
  Text,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import type { BezierPathCommand } from "@mvmnt-app/plugin-sdk/render";
import { defaultGlyphs, type GlyphRegistry, type Point } from "./glyphs";
import {
  identity,
  multiply,
  transformMatrix,
  transformPoint,
  type Matrix2D,
} from "./geometry";
import type { LayoutNode } from "./layout";
import { evaluateLayoutNodes, type RenderOptions } from "./renderer";
import { finite } from "./midi";
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}
export interface PlaneTransform {
  x: number;
  y: number;
  z: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scale?: number;
}
export interface SpatialPlane {
  id: string;
  transform: PlaneTransform;
  nodes: readonly LayoutNode[];
}
export interface Camera {
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  distance: number;
  focalLength: number;
  near: number;
  zoom: number;
  perspective: number;
}
export interface ProjectionOptions extends RenderOptions {
  pixelTolerance?: number;
  registry?: GlyphRegistry;
}
interface Contour {
  points: Point[];
  closed: boolean;
}
const outlineCache = new WeakMap<
  GlyphRegistry,
  { revision: number; paths: Map<string, Contour[]> }
>();
function pointLineDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return (
    Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) /
    Math.max(1e-10, Math.hypot(dx, dy))
  );
}
/** Adaptive local flattening preserves separate closed contours and their winding. */
export function flattenPath(
  commands: readonly BezierPathCommand[],
  tolerance = 0.01,
): Contour[] {
  finite(tolerance, "Flattening tolerance", 0.00001, 100);
  const contours: Contour[] = [];
  let current: Point = { x: 0, y: 0 },
    contour: Contour | undefined;
  const add = (p: Point) => {
    if (!contour) {
      contour = { points: [current], closed: false };
      contours.push(contour);
    }
    contour.points.push(p);
    current = p;
  };
  const cubic = (a: Point, b: Point, c: Point, d: Point, depth = 0): void => {
    if (
      depth >= 12 ||
      Math.max(pointLineDistance(b, a, d), pointLineDistance(c, a, d)) <=
        tolerance
    ) {
      add(d);
      return;
    }
    const mid = (p: Point, q: Point) => ({
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
      }),
      ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      m = mid(abc, bcd);
    cubic(a, ab, abc, m, depth + 1);
    cubic(m, bcd, cd, d, depth + 1);
  };
  for (const command of commands) {
    if (command.type === "moveTo") {
      current = { x: command.x, y: command.y };
      contour = { points: [current], closed: false };
      contours.push(contour);
    } else if (command.type === "lineTo") add({ x: command.x, y: command.y });
    else if (command.type === "bezierCurveTo")
      cubic(
        current,
        { x: command.cp1x, y: command.cp1y },
        { x: command.cp2x, y: command.cp2y },
        { x: command.x, y: command.y },
      );
    else if (command.type === "quadraticCurveTo") {
      const a = current,
        q = { x: command.cpx, y: command.cpy },
        d = { x: command.x, y: command.y };
      cubic(
        a,
        { x: a.x + (2 / 3) * (q.x - a.x), y: a.y + (2 / 3) * (q.y - a.y) },
        { x: d.x + (2 / 3) * (q.x - d.x), y: d.y + (2 / 3) * (q.y - d.y) },
        d,
      );
    } else if (contour) {
      contour.closed = true;
      current = contour.points[0];
    }
  }
  return contours;
}
function glyphContours(
  name: string,
  registry: GlyphRegistry,
  tolerance: number,
): Contour[] {
  let cache = outlineCache.get(registry);
  if (!cache || cache.revision !== registry.revision) {
    cache = { revision: registry.revision, paths: new Map() };
    outlineCache.set(registry, cache);
  }
  const key = `${name}:${tolerance}`;
  let paths = cache.paths.get(key);
  if (!paths) {
    paths = flattenPath(registry.get(name).commands, tolerance);
    cache.paths.set(key, paths);
  }
  return paths;
}
function rotate(p: Vector3, x = 0, y = 0, z = 0): Vector3 {
  let a = p.x,
    b = p.y * Math.cos(x) - p.z * Math.sin(x),
    c = p.y * Math.sin(x) + p.z * Math.cos(x);
  const ax = a * Math.cos(y) + c * Math.sin(y),
    cz = -a * Math.sin(y) + c * Math.cos(y);
  return {
    x: ax * Math.cos(z) - b * Math.sin(z),
    y: ax * Math.sin(z) + b * Math.cos(z),
    z: cz,
  };
}
export function planePoint(p: Point, plane: PlaneTransform): Vector3 {
  const s = plane.scale ?? 1,
    q = rotate(
      { x: p.x * s, y: p.y * s, z: 0 },
      plane.rotationX,
      plane.rotationY,
      plane.rotationZ,
    );
  return { x: q.x + plane.x, y: q.y + plane.y, z: q.z + plane.z };
}
export function cameraPoint(p: Vector3, camera: Camera): Vector3 {
  const q = rotate(p, camera.pitch, camera.yaw, 0);
  return { ...q, z: q.z + camera.distance };
}
export function projectPoint(p: Vector3, camera: Camera): Point | undefined {
  if (p.z < camera.near) return;
  const denominator =
    camera.distance + (p.z - camera.distance) * camera.perspective;
  const scale =
    (camera.focalLength * camera.zoom) / Math.max(camera.near, denominator);
  return {
    x: camera.width / 2 + p.x * scale,
    y: camera.height / 2 + p.y * scale,
  };
}
export function clipNear(
  points: readonly Vector3[],
  near: number,
  closed: boolean,
): Vector3[] {
  if (!points.length) return [];
  const output: Vector3[] = [];
  const intersection = (a: Vector3, b: Vector3) => {
    const t = (near - a.z) / (b.z - a.z);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near };
  };
  if (!closed) {
    if (points.length !== 2) return points.filter((p) => p.z >= near);
    const [a, b] = points;
    if (a.z < near && b.z < near) return [];
    return [
      a.z < near ? intersection(a, b) : a,
      b.z < near ? intersection(a, b) : b,
    ];
  }
  let previous = points[points.length - 1];
  for (const current of points) {
    if (previous.z >= near !== current.z >= near)
      output.push(intersection(previous, current));
    if (current.z >= near) output.push(current);
    previous = current;
  }
  return output;
}
export interface ProjectedPrimitive {
  id: string;
  depth: number;
  object: RenderObject;
}
/** Canvas painter ordering is intentional for transparent score structures. */
export function projectScene(
  planes: readonly SpatialPlane[],
  camera: Camera,
  options: ProjectionOptions,
): RenderObject[] {
  return projectPrimitives(planes, camera, options).map((p) => p.object);
}
export function projectPrimitives(
  planes: readonly SpatialPlane[],
  camera: Camera,
  options: ProjectionOptions,
): ProjectedPrimitive[] {
  for (const [name, v] of Object.entries(camera)) finite(v, `Camera ${name}`);
  finite(camera.distance, "Camera distance", 0.01, 1e8);
  finite(camera.near, "Near plane", 0.0001, camera.distance);
  finite(camera.zoom, "Camera zoom", 0.001, 100);
  finite(camera.perspective, "Perspective", 0, 1);
  const registry = options.registry ?? defaultGlyphs,
    objects: ProjectedPrimitive[] = [],
    pixelTolerance = options.pixelTolerance ?? 0.6;
  for (const plane of planes) {
    for (const [name, value] of Object.entries(plane.transform))
      if (value !== undefined) finite(value, `Plane ${name}`);
    const visit = (
      node: LayoutNode,
      parent: Matrix2D,
      inheritedColor: string,
      inheritedOpacity: number,
    ) => {
      const matrix = multiply(parent, transformMatrix(node)),
        color = node.color ?? inheritedColor,
        opacity = inheritedOpacity * (node.opacity ?? 1);
      if (opacity < 0.002) return;
      const cameraLocal = (point: Point) =>
        cameraPoint(
          planePoint(transformPoint(matrix, point), plane.transform),
          camera,
        );
      const origin = cameraLocal({ x: 0, y: 0 }),
        unit = cameraLocal({ x: 1, y: 0 });
      const po = projectPoint(origin, camera),
        pu = projectPoint(unit, camera);
      const magnification =
        po && pu ? Math.max(0.01, Math.hypot(pu.x - po.x, pu.y - po.y)) : 10;
      const tolerance = Math.max(
        0.00001,
        Math.min(0.03, pixelTolerance / (magnification * 2)),
      );
      let contours: Contour[] | undefined;
      if (node.glyph) {
        const bucket = Math.max(0.00001, 2 ** Math.floor(Math.log2(tolerance)));
        contours = glyphContours(node.glyph, registry, bucket);
      } else if (node.path) contours = flattenPath(node.path, tolerance);
      else if (node.line)
        contours = [
          {
            points: [
              { x: 0, y: 0 },
              { x: node.line.x, y: node.line.y },
            ],
            closed: false,
          },
        ];
      if (contours) {
        const commands: BezierPathCommand[] = [];
        let depthSum = 0,
          depthCount = 0;
        for (const contour of contours) {
          const points = clipNear(
            contour.points.map(cameraLocal),
            camera.near,
            contour.closed,
          );
          if (points.length < 2) continue;
          points.forEach((p, i) => {
            const q = projectPoint(p, camera)!;
            commands.push({ type: i === 0 ? "moveTo" : "lineTo", ...q });
            depthSum += p.z;
            depthCount++;
          });
          if (contour.closed) commands.push({ type: "closePath" });
        }
        if (commands.length) {
          const width = node.line
            ? Math.max(0.25, node.line.width * magnification)
            : 0;
          const path = new BezierPath(0, 0, commands, {
            fillColor: node.line ? null : color,
            strokeColor: node.line ? color : null,
            strokeWidth: width,
            fillRule: "nonzero",
          })
            .setOpacity(opacity)
            .setLayoutParticipation("exclude");
          objects.push({
            id: `${plane.id}:${node.id}`,
            depth: depthSum / Math.max(1, depthCount),
            object: path,
          });
        }
      }
      if (node.text && po && pu) {
        const pv = projectPoint(cameraLocal({ x: 0, y: 1 }), camera);
        if (pv) {
          const ux = pu.x - po.x,
            uy = pu.y - po.y,
            vx = pv.x - po.x,
            vy = pv.y - po.y,
            len = Math.hypot(ux, uy),
            cross = ux * vy - uy * vx;
          const text = new Text(po.x, po.y, node.text.value, node.text.font, {
            color,
          })
            .setRotation(Math.atan2(uy, ux))
            .setScale(len, cross / Math.max(0.0001, len))
            .setSkew(
              Math.atan((ux * vx + uy * vy) / Math.max(0.0001, len * len)),
              0,
            )
            .setOpacity(opacity)
            .setLayoutParticipation("exclude");
          objects.push({
            id: `${plane.id}:${node.id}`,
            depth: origin.z,
            object: text,
          });
        }
      }
      if (options.showBounds && (node.glyph || node.path)) {
        const b = node.bounds;
        const pts = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
          { x: b.x, y: b.y + b.height },
        ];
        const commands: BezierPathCommand[] = [];
        clipNear(pts.map(cameraLocal), camera.near, true).forEach((p, i) =>
          commands.push({
            type: i ? "lineTo" : "moveTo",
            ...projectPoint(p, camera)!,
          }),
        );
        if (commands.length) {
          commands.push({ type: "closePath" });
          objects.push({
            id: `${plane.id}:${node.id}:bounds`,
            depth: origin.z - 0.0001,
            object: new BezierPath(0, 0, commands, {
              strokeColor: "#38BDF8",
              strokeWidth: 0.5,
              fillColor: null,
            }).setLayoutParticipation("exclude"),
          });
        }
      }
      if (options.showAnchors && (node.glyph || node.note))
        for (const [name, p] of Object.entries(node.anchors)) {
          const q = projectPoint(cameraLocal(p), camera);
          if (q)
            objects.push({
              id: `${plane.id}:${node.id}:anchor:${name}`,
              depth: origin.z - 0.0002,
              object: new Text(q.x, q.y, "+", `8px sans-serif`, {
                color: "#D97706",
              }).setLayoutParticipation("exclude"),
            });
        }
      for (const child of node.children ?? [])
        visit(child, matrix, color, opacity);
    };
    for (const node of evaluateLayoutNodes(plane.nodes, options))
      visit(node, identity, options.color, 1);
  }
  return objects.sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id));
}
