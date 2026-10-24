import type { Shape } from './geometry';

export interface Box { x: number; y: number; w: number; h: number }
export function shapeBounds(shape: Shape): Box {
    if (shape.kind === 'rect') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    if (shape.kind === 'circle') return { x: shape.center[0] - shape.radius, y: shape.center[1] - shape.radius, w: shape.radius * 2, h: shape.radius * 2 };
    if (shape.kind === 'text') return { x: shape.x, y: shape.y - shape.size, w: Math.max(shape.size * .6, shape.text.length * shape.size * .62), h: shape.size * 1.25 };
    const points = shape.kind === 'line' ? [shape.a, shape.b] : shape.points;
    if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function unionBounds(shapes: readonly Shape[]): Box {
    const boxes = shapes.map(shapeBounds);
    if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
