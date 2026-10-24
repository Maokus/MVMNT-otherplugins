import { Arc, ClipLayer, EmptyRenderObject, Line, Poly, Rectangle, Text, type RenderObject } from '@mvmnt-app/plugin-sdk/render';
import { activity, clamp, hash, MAX_PRIMITIVES, sample, type Page, type Settings } from './model';
import { shapeBounds } from './bounds';
import { transitionFrame, type Lifecycle } from './phrases';
import type { Drawing, MarkGroup, Point, Shape } from './geometry';

const exclude = <T extends RenderObject>(object: T) => object.setLayoutParticipation('exclude');
export function groupFrame(g: MarkGroup, page: Page, s: Settings, seconds: number) {
    let pulse = 0, rotation = 0, progress = 0, latest = -Infinity;
    for (const index of g.owners) {
        const n = page.notes[index];
        if (!n) continue;
        const strength = activity(n, seconds, s.release);
        if (strength > pulse || strength === pulse && n.start > latest) {
            pulse = strength; latest = n.start;
            progress = clamp((seconds - n.start) / Math.max(.05, n.end - n.start), 0, 1);
        }
        if (g.motion === 'spin') rotation = Math.max(rotation, clamp(seconds - n.start, 0, n.end - n.start) * (.4 + n.velocity) * s.motion);
    }
    const drift = g.motion === 'float' || g.motion === 'trace' ? Math.sin(seconds * .65 + g.phase) * s.motion * (.2 + pulse * .8) : 0;
    return { pulse, rotation, progress, dx: drift * .25, dy: drift };
}

function shapeObject(shape: Shape, color: string, s: Settings, pivot: Point): RenderObject {
    const px = pivot[0], py = pivot[1], weight = s.stroke * (shape.weight ?? 1);
    let obj: RenderObject;
    switch (shape.kind) {
        case 'line': obj = new Line(shape.a[0] - px, shape.a[1] - py, shape.b[0] - px, shape.b[1] - py, { color, lineWidth: weight, lineDash: shape.dash, lineCap: 'round' }); break;
        case 'poly': obj = new Poly(shape.points.map(([x, y]) => [x - px, y - py]), { fillColor: shape.fill ? color : null, strokeColor: shape.fill ? null : color, strokeWidth: shape.fill ? 0 : weight }).setClosed(shape.closed).setLineJoin('round').setLineCap('round'); break;
        case 'circle': obj = new Arc(shape.center[0] - px, shape.center[1] - py, shape.radius, { startAngle: 0, endAngle: Math.PI * 2, fillColor: shape.fill ? color : null, strokeColor: shape.fill ? null : color, strokeWidth: shape.fill ? 0 : weight }); break;
        case 'rect': obj = new Rectangle(shape.x - px, shape.y - py, shape.w, shape.h, { fillColor: shape.fill ? color : null, strokeColor: shape.fill ? null : color, strokeWidth: shape.fill ? 0 : weight }); break;
        case 'text': obj = new Text(shape.x - px, shape.y - py, shape.text, `${shape.italic ? 'italic ' : ''}${shape.size}px ${shape.italic ? 'serif' : 'monospace'}`, { color, baseline: 'alphabetic' }); break;
    }
    obj.opacity = shape.opacity ?? 1;
    return exclude(obj);
}

/** Arc-length trimming avoids trace speed changing with the number of samples. */
export function trimRange(points: Point[], start: number, end: number): Point[] {
    if (points.length < 2) return points;
    const lengths = points.slice(1).map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0), from = total * clamp(start, 0, 1), to = total * clamp(end, 0, 1);
    const output: Point[] = [];
    let distance = 0;
    for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i], a = points[i], b = points[i + 1];
        if (length > 0 && distance + length >= from && distance <= to) {
            const t0 = clamp((from - distance) / length, 0, 1), t1 = clamp((to - distance) / length, 0, 1);
            if (!output.length) output.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
            output.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
        }
        distance += length;
        if (distance >= to) break;
    }
    return output.length ? output : [points[0], points[0]];
}
export const trim = (points: Point[], progress: number) => trimRange(points, 0, progress);

/** Localized accents are authored by the vocabulary, never applied to the whole group. */
export function accentShapes(shape: Shape, strength: number, progress: number, scale: number): Shape[] {
    if (!shape.emphasis || strength <= 0) return [];
    const b = shapeBounds(shape), opacity = (shape.opacity ?? 1) * strength;
    switch (shape.emphasis) {
        case 'ring':
            if (shape.kind === 'circle') return [{ ...shape, fill: false, radius: shape.radius + 2 * scale, weight: .75, opacity }];
            return [];
        case 'tick': {
            const x = b.x + b.w + 2 * scale, y = b.y - 2 * scale;
            return [{ kind: 'poly', points: [[x, y + 3 * scale], [x, y], [x + 3 * scale, y]], closed: false, opacity, weight: .8 }];
        }
        case 'trace':
            return shape.kind === 'poly' ? [{ ...shape, points: trimRange(shape.points, Math.max(0, progress - .16), progress), closed: false, fill: false, weight: 1.3, opacity }] : [];
        case 'fill':
            if (shape.kind === 'rect' || shape.kind === 'circle' || shape.kind === 'poly' && shape.closed) return [{ ...shape, fill: true, opacity: opacity * .7 }];
            return [{ ...shape, weight: (shape.weight ?? 1) + .8, opacity }];
        default:
            return [{ ...shape, fill: false, weight: (shape.weight ?? 1) + .9, opacity }];
    }
}

/** A separate wrapper per primitive makes the stagger visible within compound motifs. */
function animatedObject(shape: Shape, color: string, s: Settings, pivot: Point, visibility: number, shift: number): RenderObject {
    const b = shapeBounds(shape), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const wrapper = exclude(new EmptyRenderObject(cx - pivot[0], cy - pivot[1]));
    if (s.transition === 'slide') { wrapper.x += shift; wrapper.opacity = visibility; }
    if (s.transition === 'scale') { wrapper.scaleX = visibility; wrapper.scaleY = visibility; }
    if (s.transition === 'draw' && visibility < 1) {
        if (shape.fill || shape.kind === 'text') {
            // Wipe the fill/text in its own coordinates, without affecting adjacent marks.
            const wipe = exclude(new ClipLayer(Math.max(.001, b.w * visibility), Math.max(.001, b.h)));
            wipe.x = -b.w / 2; wipe.y = -b.h / 2;
            wipe.addChild(shapeObject(shape, color, s, [b.x, b.y]));
            wrapper.addChild(wipe);
            return wrapper;
        }
        if (shape.kind === 'circle') {
            const arc = shapeObject(shape, color, s, [cx, cy]) as Arc;
            arc.endAngle = Math.PI * 2 * visibility;
            wrapper.addChild(arc); return wrapper;
        }
        let points: Point[];
        if (shape.kind === 'line') points = [shape.a, shape.b];
        else if (shape.kind === 'poly') points = shape.closed ? [...shape.points, shape.points[0]] : shape.points;
        else points = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
        wrapper.addChild(shapeObject({ ...shape, kind: 'poly', points: trim(points, visibility), closed: false, fill: false }, color, s, [cx, cy]));
        return wrapper;
    }
    wrapper.addChild(shapeObject(shape, color, s, [cx, cy]));
    return wrapper;
}

interface Candidate { group: number; shape: number; id: number; rank: number; detail: boolean }
const candidateCache = new WeakMap<Drawing, Candidate[]>();
function candidates(drawing: Drawing): Candidate[] {
    const cached = candidateCache.get(drawing);
    if (cached) return cached;
    const entries: (Candidate & { order: number })[] = [];
    drawing.groups.forEach((g, gi) => g.shapes.forEach((shape, si) => {
        const b = shapeBounds(shape), id = entries.length;
        entries.push({ group: gi, shape: si, id, rank: 0, detail: !!shape.detail, order: b.x + b.w / 2 + (hash(`${gi}:${si}`) / 0xffffffff) * .001 });
    }));
    [...entries].sort((a, b) => a.order - b.order || a.id - b.id).forEach((e, i) => e.rank = entries.length < 2 ? 0 : i / (entries.length - 1));
    candidateCache.set(drawing, entries);
    return entries;
}
export interface RenderLayer { drawing: Drawing; page: Page; lifecycle?: Lifecycle }

function renderLayer(layer: RenderLayer, s: Settings, seconds: number, budget: number): RenderObject {
    const { drawing, page, lifecycle = {} } = layer;
    const root = exclude(new EmptyRenderObject());
    if (s.vertical) { root.x = s.width; root.rotation = Math.PI / 2; }
    const all = candidates(drawing), primary = all.filter(e => !e.detail), detail = all.filter(e => e.detail);
    const chosen = [...sample(primary, Math.min(budget, primary.length)), ...sample(detail, Math.min(Math.max(0, budget - primary.length), detail.length))];
    const selected = new Map(chosen.map(e => [e.id, e]));
    let overlayBudget = Math.max(0, budget - chosen.length), id = 0;
    drawing.groups.forEach(g => {
        const f = groupFrame(g, page, s, seconds);
        const group = exclude(new EmptyRenderObject(g.pivot[0] + f.dx, g.pivot[1] + f.dy));
        group.rotation = f.rotation;
        g.shapes.forEach(shape => {
            const candidate = selected.get(id++);
            if (!candidate) return;
            const t = transitionFrame(lifecycle, candidate.rank, s, seconds);
            if (t.visibility <= 0) return;
            // Annotation/accent roles use ink too. Spot color is reserved for small live overlays.
            const color = shape.role === 'guide' ? s.guide : s.ink;
            group.addChild(animatedObject(shape, color, s, g.pivot, t.visibility, t.shift));
            const strength = s.accentMode === 'none' ? 0 : f.pulse * s.accentStrength;
            for (const accent of accentShapes(shape, strength, f.progress, s.scale)) {
                if (overlayBudget <= 0) break;
                // Keep authored ink alpha even when a spot color has a stronger alpha channel.
                const inkAlpha = parseInt(s.ink.slice(7) || 'FF', 16) / 255;
                const spotAlpha = parseInt(s.accent.slice(7) || 'FF', 16) / 255;
                const accentColor = s.accentMode === 'spot' ? s.accent.slice(0, 7) + Math.round(inkAlpha * spotAlpha * 255).toString(16).padStart(2, '0') : s.ink;
                group.addChild(animatedObject(accent, accentColor, s, g.pivot, t.visibility, t.shift));
                overlayBudget--;
            }
        });
        if (group.children.length) root.addChild(group);
    });
    return root;
}

export function renderComposition(layers: RenderLayer[], s: Settings, seconds: number, beatProgress: number, totalBudget = MAX_PRIMITIVES): RenderObject[] {
    const bounds = new Rectangle(0, 0, s.width, s.height, { fillColor: null }).setLayoutParticipation('include');
    const clip = exclude(new ClipLayer(s.width, s.height));
    if (!s.background.endsWith('00')) clip.addChild(exclude(new Rectangle(0, 0, s.width, s.height, { fillColor: s.background })));
    // Share the complete budget across both phrase layers, including live accent overlays.
    const budget = Math.max(0, Math.floor((totalBudget - 3) / Math.max(1, layers.length)));
    for (const layer of layers) clip.addChild(renderLayer(layer, s, seconds, budget));
    if (s.playhead) {
        const panel = exclude(new EmptyRenderObject());
        if (s.vertical) { panel.x = s.width; panel.rotation = Math.PI / 2; }
        const width = s.vertical ? s.height : s.width, height = s.vertical ? s.width : s.height;
        const xx = s.padding + clamp(beatProgress, 0, 1) * (width - s.padding * 2);
        panel.addChild(exclude(new Line(xx, s.padding, xx, height - s.padding, { color: s.accentMode === 'spot' ? s.accent : s.ink, lineWidth: s.stroke })));
        clip.addChild(panel);
    }
    return [bounds, clip];
}
export function renderDrawing(drawing: Drawing, page: Page, s: Settings, seconds: number, beatProgress: number): RenderObject[] {
    return renderComposition([{ drawing, page }], s, seconds, beatProgress);
}
