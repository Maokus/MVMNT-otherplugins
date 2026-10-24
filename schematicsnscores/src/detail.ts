import { shapeBounds, unionBounds } from './bounds';
import { clamp, hash, MAX_PRIMITIVES, random, type Language, type Page, type Settings } from './model';
import type { Drawing, MarkGroup, Shape, Point } from './geometry';

/** Only a few purposeful primitives receive playback emphasis; no group-wide tint. */
export function markAccents(language: Language, drawing: Drawing): void {
    for (const group of drawing.groups) {
        if (!group.owners.length) continue;
        const shapes = group.shapes;
        let target: Shape | undefined;
        let emphasis: Shape['emphasis'] = 'weight';
        switch (language) {
            case 'cage': target = shapes.find(s => s.kind === 'circle' && s.fill); emphasis = 'ring'; break;
            case 'penderecki': target = [...shapes].reverse().find(s => s.kind === 'line'); break;
            case 'decesare': target = shapes.find(s => s.kind === 'rect'); break;
            case 'notation': target = shapes.find(s => s.kind === 'poly' && s.closed); emphasis = target?.fill ? 'weight' : 'fill'; break;
            case 'schematic': target = shapes.find(s => s.kind === 'circle' && s.fill); emphasis = 'tick'; break;
            case 'isometric': target = shapes.find(s => s.kind === 'circle'); emphasis = 'ring'; break;
            case 'wall': target = shapes.find(s => s.kind === 'poly'); emphasis = 'trace'; break;
            case 'mechanism': target = shapes.find(s => s.kind === 'circle' && s.fill); emphasis = 'tick'; break;
            case 'field': target = shapes.find(s => s.kind !== 'text'); emphasis = target?.fill ? 'weight' : 'fill'; break;
            case 'matrix': target = shapes.find(s => s.kind === 'rect'); emphasis = target?.fill ? 'weight' : 'fill'; break;
        }
        if (target) target.emphasis = emphasis;
    }
}

/** Additive detail passes have independent seeds: existing marks never move or reseed. */
export function enrich(language: Language, drawing: Drawing, page: Page, s: Settings): Drawing {
    if (s.visualDensity <= 1 || !page.notes.length) return drawing;
    const primary = [...drawing.groups];
    for (let pass = 0; pass < 6 && drawing.count < MAX_PRIMITIVES; pass++) {
        const amount = clamp((s.visualDensity - 1) * 2 - pass, 0, 1);
        if (amount <= 0) break;
        for (const [i, source] of primary.entries()) {
            if (!source.owners.length || !source.shapes.length || drawing.count >= MAX_PRIMITIVES) continue;
            const rng = random(hash(`detail:${language}:${s.seed}:${page.index}:${i}:${pass}`));
            if (rng() >= amount) continue;
            const n = page.notes[source.owners[0]], b = unionBounds(source.shapes);
            const group: MarkGroup = { ...source, shapes: [], phase: source.phase + pass * .13 };
            const add = (shape: Shape) => {
                if (drawing.count >= MAX_PRIMITIVES) return;
                group.shapes.push({ opacity: .45, weight: .45, ...shape, detail: true }); drawing.count++;
            };
            const line = (a: Point, b: Point) => add({ kind: 'line', a, b });
            const poly = (points: Point[], closed = false) => add({ kind: 'poly', points, closed });
            const circle = (center: Point, radius: number, fill = false) => add({ kind: 'circle', center, radius: Math.max(.2, radius), fill });
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2, step = (pass + 1) * 2 * s.scale;
            switch (language) {
                case 'cage': {
                    const point = source.shapes.find(shape => shape.kind === 'circle');
                    if (point?.kind !== 'circle') break;
                    for (let j = 0; j < 3; j++) {
                        const a = rng() * Math.PI * 2, r = step + 2 + rng() * (3 + n.extent * 30);
                        circle([point.center[0] + Math.cos(a) * r, point.center[1] + Math.sin(a) * r], (.3 + rng() * .5) * s.scale, true);
                    }
                    if (pass % 2 === 0) poly(Array.from({ length: 16 }, (_, k): Point => {
                        const t = k / 15;
                        return [point.center[0] - step * 3 + step * 7 * t, cy + step * .3 - Math.sin(t * Math.PI) * step * .8];
                    }));
                    break;
                }
                case 'penderecki': {
                    const count = Math.min(80, Math.max(2, Math.ceil(b.w / Math.max(2, s.hatchSpacing * 1.5))));
                    for (let k = 0; k < count; k++) {
                        const xx = b.x + (k + (pass + 1) / 7) / count * b.w;
                        line([xx, b.y + b.h * .05], [Math.min(b.x + b.w, xx + (pass % 2 ? -1 : 1) * step), b.y + b.h * .9]);
                    }
                    line([b.x, b.y + b.h * (pass + 1) / 7], [b.x + b.w, b.y + b.h * (pass + 1) / 7]);
                    break;
                }
                case 'decesare': {
                    const t = (pass + 1) / 7, xx = b.x + b.w * t;
                    line([xx, b.y], [xx, b.y + b.h]);
                    const r = Math.max(.5, Math.min(2 * s.scale, b.h * .1));
                    poly([[xx + r, b.y + r * 2], [xx + r * 2, b.y + r * 3], [xx + r, b.y + r * 4]]);
                    if (pass % 2 === 0) add({ kind: 'text', x: xx, y: b.y + b.h - 2, text: String((n.pitch + pass) % 100), size: Math.max(4, 5 * s.scale) });
                    break;
                }
                case 'notation': {
                    const head = source.shapes.find(shape => shape.kind === 'poly' && shape.closed);
                    if (!head) break;
                    const hb = shapeBounds(head), ex = Math.min(drawing.width - s.padding, hb.x + Math.max(8 * s.scale, n.extent * (drawing.width - 2 * s.padding)));
                    if (pass % 2 === 0) poly(Array.from({ length: 16 }, (_, k): Point => {
                        const t = k / 15;
                        return [hb.x + (ex - hb.x) * t, hb.y - step - Math.sin(t * Math.PI) * 3 * s.scale];
                    }));
                    else { circle([hb.x + hb.w / 2, hb.y - step], .65 * s.scale, true); line([hb.x, hb.y + hb.h + step], [hb.x + hb.w, hb.y + hb.h + step]); }
                    break;
                }
                case 'schematic': {
                    const xx = b.x + b.w * (pass + 1) / 7;
                    line([xx, b.y + 3], [xx, b.y + b.h - 3]);
                    line([b.x, cy + pass], [b.x + b.w, cy + pass]);
                    const r = 2 * s.scale;
                    line([xx - r, cy - r], [xx + r, cy + r]);
                    add({ kind: 'text', x: xx + 2, y: b.y + b.h, text: `${String.fromCharCode(97 + pass)}${n.pitch % 12}`, size: 5 * s.scale, opacity: .55 });
                    break;
                }
                case 'isometric': {
                    const front = source.shapes.find(shape => shape.kind === 'poly' && shape.closed);
                    if (front?.kind !== 'poly' || front.points.length < 4) break;
                    const [a, b, c, d] = front.points, t = (pass + 1) / 7;
                    line([a[0] + (b[0] - a[0]) * t, a[1]], [d[0] + (c[0] - d[0]) * t, d[1]]);
                    if (pass % 2 === 0) line(a, c);
                    else line([a[0], a[1] + (d[1] - a[1]) * t], [b[0], b[1] + (c[1] - b[1]) * t]);
                    break;
                }
                case 'wall': {
                    const curve = source.shapes.find(shape => shape.kind === 'poly');
                    if (curve?.kind === 'poly') poly(curve.points.map(([x, y]): Point => [x, y + (pass % 2 ? -1 : 1) * (1 + Math.floor(pass / 2)) * s.scale * .65]));
                    break;
                }
                case 'mechanism': {
                    const rim = source.shapes.find(shape => shape.kind === 'circle');
                    if (rim?.kind !== 'circle' || !source.shapes.some(shape => shape.kind === 'circle' && shape.fill)) break;
                    circle(rim.center, rim.radius * (.3 + pass * .09));
                    const count = 4 + n.pitch % 5;
                    for (let k = 0; k < count; k++) {
                        const a = k / count * Math.PI * 2 + pass * .12;
                        line([rim.center[0] + Math.cos(a) * rim.radius * .9, rim.center[1] + Math.sin(a) * rim.radius * .9], [rim.center[0] + Math.cos(a) * rim.radius * 1.06, rim.center[1] + Math.sin(a) * rim.radius * 1.06]);
                    }
                    break;
                }
                case 'field': {
                    for (let k = 0; k < 3; k++) {
                        const xx = cx + (rng() - .5) * Math.max(8, b.w), yy = cy + (rng() - .5) * Math.max(8, b.h), r = (1 + rng()) * s.scale;
                        if ((n.pitch + k + pass) % 2) { line([xx - r, yy], [xx + r, yy]); line([xx, yy - r], [xx, yy + r]); }
                        else circle([xx, yy], r, k === 0);
                    }
                    break;
                }
                case 'matrix': {
                    const rect = source.shapes.find(shape => shape.kind === 'rect');
                    if (rect?.kind !== 'rect') break;
                    const xx = rect.x + rect.w * (pass + 1) / 7;
                    line([xx, rect.y], [xx, rect.y + rect.h]);
                    // Outline detailing sits around occupied cells; no paper-colored knockouts.
                    line([xx, rect.y - 1.5 * s.scale], [xx, rect.y - 1.5 * s.scale - Math.min(3 * s.scale, rect.h * .3)]);
                    line([rect.x, rect.y + rect.h + (pass + 1) * .7 * s.scale], [rect.x + rect.w, rect.y + rect.h + (pass + 1) * .7 * s.scale]);
                    break;
                }
            }
            if (group.shapes.length) drawing.groups.push(group);
        }
    }
    return drawing;
}
