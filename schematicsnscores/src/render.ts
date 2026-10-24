import { Arc, ClipLayer, EmptyRenderObject, Line, Poly, Rectangle, Text, type RenderObject } from '@mvmnt-app/plugin-sdk/render';
import { activity, clamp, MAX_PRIMITIVES, type Page, type Settings } from './model';
import type { Drawing, MarkGroup, Point, Shape } from './geometry';

/** Blend RGB only: author-specified transparency is always preserved. */
export function blend(base: string, accent: string, amount: number): string {
    const t = clamp(amount, 0, 1) * parseInt(accent.slice(7) || 'FF', 16) / 255;
    const rgb = [1, 3, 5].map(i => Math.round(parseInt(base.slice(i, i + 2), 16) * (1 - t) + parseInt(accent.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
    return `#${rgb}${base.slice(7) || 'FF'}`;
}
const exclude = <T extends RenderObject>(object: T) => object.setLayoutParticipation('exclude');

export function groupFrame(g: MarkGroup, page: Page, s: Settings, seconds: number) {
    let pulse = 0, rotation = 0, progress = 0;
    for (const index of g.owners) {
        const n = page.notes[index];
        if (!n) continue;
        pulse = Math.max(pulse, activity(n, seconds, s.release));
        if (g.motion === 'spin') rotation = Math.max(rotation, clamp(seconds - n.start, 0, n.end - n.start) * (.4 + n.velocity) * s.motion);
        progress = Math.max(progress, clamp((seconds - n.start) / Math.max(.05, n.end - n.start), 0, 1));
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

/** Arc-length trimming avoids trace speed changing with the number of polyline samples. */
export function trim(points: Point[], progress: number): Point[] {
    if (points.length < 2) return points;
    const lengths = points.slice(1).map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
    let remaining = lengths.reduce((a, b) => a + b, 0) * clamp(progress, 0, 1);
    const output: Point[] = [points[0]];
    for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i], a = points[i], b = points[i + 1];
        if (remaining >= length) { output.push(b); remaining -= length; }
        else { const t = length ? remaining / length : 0; output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); break; }
    }
    return output;
}

export function renderDrawing(drawing: Drawing, page: Page, s: Settings, seconds: number, beatProgress: number): RenderObject[] {
    const bounds = new Rectangle(0, 0, s.width, s.height, { fillColor: null }).setLayoutParticipation('include');
    const clip = exclude(new ClipLayer(s.width, s.height));
    if (!s.background.endsWith('00')) clip.addChild(exclude(new Rectangle(0, 0, s.width, s.height, { fillColor: s.background })));
    const panel = exclude(new EmptyRenderObject());
    if (s.vertical) { panel.x = s.width; panel.rotation = Math.PI / 2; }
    clip.addChild(panel);
    // Reserve primitive slots for layout bounds, optional background, and playhead.
    let budget = MAX_PRIMITIVES - 3;
    const accentAlpha = parseInt(s.accent.slice(7) || 'FF', 16) / 255;
    for (const g of drawing.groups) {
        const f = groupFrame(g, page, s, seconds);
        const group = exclude(new EmptyRenderObject(g.pivot[0] + f.dx, g.pivot[1] + f.dy));
        group.rotation = f.rotation;
        for (const shape of g.shapes) {
            if (budget-- <= 0) break;
            const role = shape.role ?? 'ink', base = role === 'accent' ? s.accent : role === 'guide' ? s.guide : s.ink;
            const color = role === 'guide' ? base : blend(base, s.accent, f.pulse * s.accentStrength);
            group.addChild(shapeObject(shape, color, s, g.pivot));
            if (budget > 0 && g.motion === 'trace' && shape.kind === 'poly' && !shape.closed && f.pulse > 0 && s.accentStrength * accentAlpha > 0 && f.progress > 0) {
                const trace = shapeObject({ ...shape, points: trim(shape.points, f.progress), opacity: (shape.opacity ?? 1) * f.pulse * s.accentStrength * accentAlpha, weight: (shape.weight ?? 1) + .7 }, blend(base, s.accent, 1), s, g.pivot);
                group.addChild(trace); budget--;
            }
        }
        if (group.children.length) panel.addChild(group);
        if (budget <= 0) break;
    }
    if (s.playhead) {
        const xx = s.padding + clamp(beatProgress, 0, 1) * (drawing.width - s.padding * 2);
        panel.addChild(exclude(new Line(xx, s.padding, xx, drawing.height - s.padding, { color: s.accent, lineWidth: s.stroke })));
    }
    return [bounds, clip];
}
