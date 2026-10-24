import { clamp, hash, MAX_PRIMITIVES, random, sample, type Language, type Note, type Page, type Settings } from './model';
import { enrich, markAccents } from './detail';

export type Point = [number, number];
export type Role = 'ink' | 'accent' | 'guide';
export interface Style { role?: Role; opacity?: number; weight?: number; fill?: boolean; dash?: number[]; detail?: boolean; emphasis?: 'weight' | 'fill' | 'ring' | 'tick' | 'trace' }
export type Shape = Style & (
    { kind: 'line'; a: Point; b: Point } |
    { kind: 'poly'; points: Point[]; closed: boolean } |
    { kind: 'circle'; center: Point; radius: number } |
    { kind: 'rect'; x: number; y: number; w: number; h: number } |
    { kind: 'text'; x: number; y: number; text: string; size: number; italic?: boolean }
);
export interface MarkGroup {
    owners: number[]; shapes: Shape[]; phase: number;
    motion: 'float' | 'spin' | 'trace' | 'none'; pivot: Point;
}
export interface Drawing { groups: MarkGroup[]; width: number; height: number; count: number }

class Pen {
    readonly groups: MarkGroup[] = [];
    count = 0;
    group(owners: number[] = [], motion: MarkGroup['motion'] = 'float', pivot: Point = [0, 0]): MarkGroup {
        const group: MarkGroup = { owners, motion, pivot, shapes: [], phase: hash(owners.join(':') + ':' + this.groups.length) / 0xffffffff * Math.PI * 2 };
        this.groups.push(group);
        return group;
    }
    add(g: MarkGroup, shape: Shape) {
        if (this.count >= MAX_PRIMITIVES) return;
        g.shapes.push(shape); this.count++;
    }
    line(g: MarkGroup, a: Point, b: Point, style: Style = {}) { this.add(g, { kind: 'line', a, b, ...style }); }
    poly(g: MarkGroup, points: Point[], closed = false, style: Style = {}) { this.add(g, { kind: 'poly', points, closed, ...style }); }
    circle(g: MarkGroup, center: Point, radius: number, style: Style = {}) { this.add(g, { kind: 'circle', center, radius: Math.max(.1, radius), ...style }); }
    rect(g: MarkGroup, x: number, y: number, w: number, h: number, style: Style = {}) { this.add(g, { kind: 'rect', x, y, w: Math.max(.1, w), h: Math.max(.1, h), ...style }); }
    text(g: MarkGroup, x: number, y: number, text: string, size: number, style: Style = {}) { this.add(g, { kind: 'text', x, y, text, size, ...style }); }
    arrow(g: MarkGroup, a: Point, b: Point, style: Style = {}) {
        this.line(g, a, b, style);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]), r = 3;
        this.line(g, b, [b[0] - Math.cos(angle - .45) * r, b[1] - Math.sin(angle - .45) * r], style);
        this.line(g, b, [b[0] - Math.cos(angle + .45) * r, b[1] - Math.sin(angle + .45) * r], style);
    }
}

export function generate(language: Language, page: Page, s: Settings): Drawing {
    const p = new Pen();
    // Draw in horizontal logical coordinates; rotate the whole panel for vertical use.
    const width = s.vertical ? s.height : s.width, height = s.vertical ? s.width : s.height;
    const pad = s.padding, w = Math.max(1, width - pad * 2), h = Math.max(1, height - pad * 2);
    const rand = random(hash(`${language}:${s.seed}:${page.index}`));
    const between = (a: number, b: number) => a + rand() * (b - a);
    const x = (n: Note) => pad + n.x * w;
    const y = (n: Note) => pad + h * (.12 + n.y * .76);
    const endX = (n: Note) => Math.min(pad + w, x(n) + Math.max(2, n.extent * w));
    const scale = s.scale;
    const source = page.notes.map((note, index) => ({ note, index }));
    const notes = sample(source, s.density === 0 ? 0 : Math.max(1, Math.ceil(source.length * s.density)));
    const guide = p.group([], 'none');
    if (s.guides) {
        p.line(guide, [pad, pad + h / 2], [pad + w, pad + h / 2], { role: 'guide', weight: .6 });
        for (let i = 0; i <= Math.min(64, Math.ceil(page.beats)); i++) {
            const xx = pad + w * i / Math.ceil(page.beats);
            p.line(guide, [xx, pad], [xx, pad + (i % 4 ? 3 : 7)], { role: 'guide', weight: .7 });
        }
    }

    switch (language) {
        case 'cage': {
            for (let i = 0; i < notes.length; i++) {
                const { note: n, index } = notes[i], g = p.group([index]);
                const xx = x(n), yy = y(n) + between(-h * .05, h * .05);
                p.circle(g, [xx, yy], s.pointSize * scale * (.4 + n.velocity), { fill: true, opacity: .85 });
                if (rand() < .18) p.circle(g, [xx + between(-6, 6), yy - 6], 3 * scale, { weight: .6 });
                const satellites = Math.floor((2 + n.extent * 24) * s.density);
                for (let k = 0; k < satellites; k++) p.circle(g, [xx + between(-8, 8) * scale, yy + between(-10, 10) * scale], between(.35, .8) * scale, { fill: true, opacity: .45 });
                if (i > 0 && rand() < s.connections) {
                    const prev = notes[i - 1];
                    const arc = p.group([prev.index, index], 'trace');
                    const a: Point = [x(prev.note), y(prev.note)], b: Point = [xx, yy];
                    const bend = between(-h * .25, h * .25) * Math.min(1, .2 + n.extent * 10);
                    p.poly(arc, Array.from({ length: 25 }, (_, k) => {
                        const t = k / 24;
                        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * bend];
                    }), false, { weight: .6, opacity: .7 });
                }
            }
            break;
        }
        case 'penderecki': {
            // Connected overlap components become masses, rather than unrelated piano-roll bars.
            const clusters: typeof notes[] = [];
            let lastEnd = -Infinity;
            for (const item of notes) {
                if (!clusters.length || item.note.start >= lastEnd) clusters.push([]);
                clusters[clusters.length - 1].push(item);
                lastEnd = Math.max(lastEnd, item.note.end);
            }
            for (const cluster of clusters) {
                const g = p.group(cluster.map(n => n.index));
                const xx = Math.min(...cluster.map(n => x(n.note))), ex = Math.max(...cluster.map(n => endX(n.note)));
                const low = Math.min(...cluster.map(n => y(n.note))), high = Math.max(...cluster.map(n => y(n.note)));
                const velocity = cluster.reduce((v, n) => v + n.note.velocity, 0) / cluster.length;
                const band = Math.min(h * .65, (6 + velocity * 12) * s.bandThickness * scale);
                const top = low - band / 2, bottom = high + band / 2;
                if (rand() < .45) p.rect(g, xx, top, Math.max(3, ex - xx), bottom - top, { fill: true, opacity: .25 + velocity * .4 });
                else p.poly(g, [[xx, top], [ex, (top + bottom) / 2 - 1], [ex, (top + bottom) / 2 + 1], [xx, bottom]], true, { fill: true, opacity: .7 });
                const spacing = Math.max(1, s.hatchSpacing / (.5 + s.density));
                // Local cap ensures one very long band cannot consume the whole page budget.
                const count = Math.min(160, Math.ceil((ex - xx) / spacing));
                for (let i = 0; i <= count; i++) {
                    const hx = xx + i / Math.max(1, count) * (ex - xx);
                    p.line(g, [hx, top], [hx + 1.5 * scale, bottom], { weight: .55, opacity: .45 + velocity * .4 });
                }
                p.line(g, [xx, bottom + 3], [ex, bottom + 3], { weight: .5 });
            }
            break;
        }
        case 'decesare': {
            for (const { note: n, index } of notes) {
                const g = p.group([index]), sz = s.cellSize * scale;
                const cw = Math.min(w, sz * (.65 + Math.min(2, n.extent * 12))), ch = Math.min(h, sz * between(.65, 1.4));
                const xx = clamp(x(n), pad, pad + w - cw), yy = clamp(y(n) - ch / 2, pad, pad + h - ch);
                if (s.boxes) p.rect(g, xx, yy, cw, ch, { weight: .45 + n.velocity, opacity: .65 });
                const glyph = Math.round(n.pitch) % 7;
                const cx = xx + cw / 2, cy = yy + ch / 2, r = Math.min(cw, ch) * .26;
                drawGlyph(p, g, glyph, cx, cy, r, { fill: glyph === 2 || glyph === 5, role: rand() < .2 ? 'accent' : 'ink' });
                if (rand() < .3) p.text(g, xx + 2, yy - 3, String.fromCharCode(65 + n.pitch % 26) + (index % 10), 7 * scale, { opacity: .7 });
            }
            break;
        }
        case 'notation': {
            const staffH = h / s.staffCount;
            const gap = Math.min(7 * scale * s.noteScale, staffH / 10);
            // Structural staff lines remain useful even on a silent page.
            if (notes.length || s.guides) for (let staff = 0; staff < s.staffCount; staff++) {
                const center = pad + staffH * (staff + .5);
                for (let line = -2; line <= 2; line++) p.line(guide, [pad, center + line * gap], [pad + w, center + line * gap], { role: s.guides ? 'guide' : 'ink', opacity: .35, weight: .55 });
            }
            const diatonic = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
            let previousEnd = 0;
            for (const { note: n, index } of notes) {
                const staff = Math.min(s.staffCount - 1, Math.floor(n.x * s.staffCount));
                const xx = pad + (n.x * s.staffCount - staff) * w;
                const center = pad + staffH * (staff + .5);
                const step = Math.floor(n.pitch / 12) * 7 + diatonic[Math.round(n.pitch) % 12] - 41; // B4 is the middle staff line.
                const yy = center - clamp(step, -12, 12) * gap / 2;
                const g = p.group([index]), r = Math.max(.6, gap * .58);
                const durationBeats = n.extent * page.beats;
                const tilt = between(.12, .3);
                p.poly(g, Array.from({ length: 16 }, (_, k) => {
                    const angle = k / 16 * Math.PI * 2;
                    return [xx + Math.cos(angle) * r, yy + Math.sin(angle) * r * .65 - Math.cos(angle) * r * tilt];
                }), true, { fill: durationBeats < 2, weight: .8 });
                if ([1, 3, 6, 8, 10].includes(Math.round(n.pitch) % 12)) p.text(g, xx - r * 3, yy + gap * .5, '#', gap * 1.8, { opacity: .85 });
                for (let ledger = 6; ledger <= Math.abs(step) && ledger <= 12; ledger += 2) {
                    const ly = center - Math.sign(step) * ledger * gap / 2;
                    p.line(g, [xx - r * 1.7, ly], [xx + r * 1.7, ly], { weight: .6 });
                }
                if (durationBeats < 4) {
                    const dir = step >= 0 ? 1 : -1, sx = xx - dir * r * .8, sy = yy + dir * gap * 3;
                    p.line(g, [sx, yy], [sx, sy], { weight: .75 });
                    if (durationBeats < 1) p.poly(g, [[sx, sy], [sx + 5 * scale, sy - dir * gap], [sx + 2 * scale, sy - dir * gap * 2]], false, { weight: 1 });
                }
                if (n.x - previousEnd > 1 / page.beats) {
                    const rx = Math.max(pad + 3, xx - w / page.beats / 2);
                    p.poly(g, [[rx, center - gap], [rx + gap * .6, center], [rx, center + gap], [rx + gap * .4, center + gap * 1.5]], false, { weight: 1 });
                }
                previousEnd = Math.max(previousEnd, n.x + n.extent);
                if (index % 5 === 0) p.text(g, xx, center + gap * 4.5, n.velocity > .75 ? 'f' : n.velocity < .4 ? 'p' : 'mf', gap * 1.6, { role: 'accent' });
            }
            break;
        }
        case 'schematic': {
            for (const { note: n, index } of sample(notes, 40)) {
                const g = p.group([index]), size = Math.min(h * .2, 16 * scale * s.diagramScale * between(.9, 1.1));
                const len = Math.min(w * .2, Math.max(size, n.extent * w));
                // Leave room for annotation baselines and load arrows inside the panel.
                const xx = clamp(x(n), pad, pad + w - len);
                const yy = clamp(y(n), pad + size * 2, Math.max(pad + size * 2, pad + h - size - 12 * scale));
                const kind = Math.round(n.pitch) % 4;
                const a: Point = [xx, yy], b: Point = [Math.min(pad + w, xx + len), yy];
                p.circle(g, a, 1.8 * scale, { fill: true });
                if (kind === 0) { // A braced truss with a load arrow.
                    p.poly(g, [a, [xx + len / 2, yy - size], b, a], false, { weight: .7 });
                    p.line(g, [xx + len / 2, yy - size], [xx + len / 2, yy], { weight: .5 });
                    p.arrow(g, [xx + len / 2, yy - size * 1.9], [xx + len / 2, yy - size - 2], { role: 'accent' });
                } else if (kind === 1) {
                    p.circle(g, [xx + size, yy], size, { weight: .65 });
                    p.line(g, [xx - 4, yy], [xx + size * 2 + 4, yy], { weight: .5, dash: [3, 2] });
                    p.arrow(g, [xx + size, yy], [xx + size * 1.7, yy - size * .6], { role: 'accent' });
                } else if (kind === 2) {
                    p.poly(g, Array.from({ length: 24 }, (_, k) => {
                        const t = k / 23;
                        return [xx + len * t, yy + Math.sin(t * Math.PI * (1 + n.pitch % 3)) * size * (.3 + n.velocity * .7)];
                    }), false, { weight: .8 });
                    p.arrow(g, [xx - 2, yy + size], [xx - 2, yy - size], { opacity: .6 });
                } else {
                    p.rect(g, xx, yy - size / 2, len, size, { weight: .6 });
                    for (let i = 1; i < 4; i++) p.arrow(g, [xx + len * i / 4, yy - size * (1 + n.velocity)], [xx + len * i / 4, yy - size / 2], { weight: .5 });
                }
                const dy = yy + size + 6;
                p.line(g, [xx, dy - 3], [xx, dy + 3], { weight: .5 });
                p.line(g, [b[0], dy - 3], [b[0], dy + 3], { weight: .5 });
                p.arrow(g, [xx, dy], [b[0], dy], { weight: .45, opacity: .75 });
                if (s.annotations) {
                    p.text(g, xx + 3, dy + 10 * scale, `Δt=${(n.end - n.start).toFixed(2)}s`, 8 * scale, { opacity: .8 });
                    p.text(g, xx, yy - size * 2, `${['λ', 'σ', 'ω', 'F'][kind]}${n.pitch % 12}=${n.pitch}`, 8 * scale, { role: 'accent' });
                }
            }
            break;
        }
        case 'isometric': {
            let prev: { point: Point; index: number } | null = null;
            for (const { note: n, index } of sample(notes, 80)) {
                const g = p.group([index]);
                const xx = x(n), yy = pad + h * .68;
                const d = Math.min(s.depth * scale * between(.9, 1.1), h * .3), elevation = d * (.3 + (1 - n.y) * 1.8);
                const len = Math.max(3, Math.min(d * 1.7, n.extent * w));
                const front: Point[] = [[xx, yy], [xx + len, yy], [xx + len, yy - elevation], [xx, yy - elevation]];
                const back = front.map(([a, b]): Point => [a + d * .65, b - d * .4]);
                p.poly(g, front, true, { opacity: .75, weight: .65 });
                p.poly(g, back, true, { opacity: .45, weight: .5 });
                for (let i = 0; i < 4; i++) p.line(g, front[i], back[i], { opacity: .65, weight: .65 });
                const point: Point = [xx, yy - elevation];
                p.circle(g, point, s.nodeSize * scale * (.5 + n.velocity), { fill: true });
                if (prev) p.line(p.group([prev.index, index], 'trace'), prev.point, point, { role: 'accent', opacity: .5, weight: .65 });
                prev = { point, index };
            }
            break;
        }
        case 'wall': {
            // Collapse simultaneous notes to a chord centroid before building continuous contours.
            const anchors: { xx: number; yy: number; indices: number[]; extent: number; velocity: number }[] = [];
            for (const { note: n, index } of notes) {
                const prev = anchors[anchors.length - 1];
                if (prev && Math.abs(prev.xx - x(n)) < .01) {
                    prev.yy = (prev.yy * prev.indices.length + y(n)) / (prev.indices.length + 1);
                    prev.indices.push(index); prev.extent = Math.max(prev.extent, endX(n));
                } else anchors.push({ xx: x(n), yy: y(n), indices: [index], extent: endX(n), velocity: n.velocity });
            }
            for (let layer = 0; layer < s.contourCount; layer++) {
                const offset = (layer - (s.contourCount - 1) / 2) * s.spread * scale;
                for (let i = 0; i < anchors.length; i++) {
                    const a = anchors[i], b = anchors[i + 1];
                    const toX = b ? b.xx : a.extent;
                    const toY = b ? b.yy : a.yy;
                    const g = p.group([...a.indices, ...(b?.indices ?? [])], 'trace');
                    const hold = b ? clamp((a.extent - a.xx) / Math.max(1, toX - a.xx), 0, .85) : 0;
                    const bend = ((a.velocity - .5) * 3 + between(-.6, .6)) * scale;
                    p.poly(g, Array.from({ length: 20 }, (_, k) => {
                        const t = k / 19, transition = clamp((t - hold) / (1 - hold), 0, 1);
                        const ease = transition * transition * (3 - 2 * transition);
                        return [a.xx + (toX - a.xx) * t, a.yy + (toY - a.yy) * ease + offset + Math.sin(t * Math.PI) * bend];
                    }), false, { weight: layer === Math.floor(s.contourCount / 2) ? 1.2 : .55, opacity: .35 + a.velocity * .55 });
                }
            }
            break;
        }
        case 'mechanism': {
            let prev: { xx: number; yy: number; r: number; index: number } | null = null;
            for (const { note: n, index } of sample(notes, 48)) {
                const xx = x(n), yy = y(n), r = Math.min(h * .25, (5 + (1 - n.y) * 12) * scale * s.pulleySize);
                const g = p.group([index], 'none');
                p.circle(g, [xx, yy], r, { weight: .85 });
                p.circle(g, [xx, yy], r * .72, { weight: .5, opacity: .7 });
                p.circle(g, [xx, yy], 1.5 * scale * (.5 + n.velocity), { fill: true });
                const spokes = p.group([index], 'spin', [xx, yy]);
                const count = 3 + Math.round(n.pitch) % 5;
                const initialAngle = between(0, Math.PI * 2);
                for (let k = 0; k < count; k++) {
                    const angle = initialAngle + k / count * Math.PI * 2;
                    p.line(spokes, [xx + Math.cos(angle) * r * .2, yy + Math.sin(angle) * r * .2], [xx + Math.cos(angle) * r * .68, yy + Math.sin(angle) * r * .68], { weight: .55 });
                }
                if (prev) {
                    const belts = p.group([prev.index, index], 'none');
                    const dx = xx - prev.xx, dy = yy - prev.yy, distance = Math.hypot(dx, dy);
                    // External common tangents; nested/identical pulleys cannot support this belt.
                    if (distance > Math.abs(r - prev.r) + .01) {
                        const angle = Math.atan2(dy, dx), tangent = Math.acos(clamp((prev.r - r) / distance, -1, 1));
                        for (const sign of [-1, 1]) {
                            const nx = Math.cos(angle + sign * tangent), ny = Math.sin(angle + sign * tangent);
                            p.line(belts, [prev.xx + nx * prev.r, prev.yy + ny * prev.r], [xx + nx * r, yy + ny * r], { weight: .65, opacity: .8 });
                        }
                        if (s.beltDetail > .3) p.line(belts, [prev.xx, prev.yy], [xx, yy], { role: 'guide', weight: .5, dash: [3, 3] });
                    }
                }
                if (s.beltDetail > .65) p.text(g, xx - r, yy + r + 10, `${Math.round((n.end - n.start) * 1000)}ms`, 7 * scale, { opacity: .6 });
                prev = { xx, yy, r, index };
            }
            break;
        }
        case 'field': {
            for (const { note: n, index } of notes) {
                const g = p.group([index]);
                const count = Math.ceil(1 + n.velocity * s.density * 8);
                const dx = (8 + n.extent * w * .5) * s.scatter, dy = h * .25 * s.scatter;
                for (let i = 0; i < count; i++) {
                    const xx = x(n) + between(-dx, dx), yy = y(n) + between(-dy, dy);
                    const size = s.markSize * scale * between(.5, 1.2);
                    drawGlyph(p, g, (Math.round(n.pitch) + i) % 7, xx, yy, size, { fill: i % 3 === 0, weight: .65, opacity: between(.45, .95), role: rand() < .12 ? 'accent' : 'ink' });
                }
            }
            break;
        }
        case 'matrix': {
            const cols = Math.max(1, Math.min(256, Math.round(page.beats * s.subdivision)));
            const cw = w / cols, ch = h / s.rows;
            const grid = p.group([], 'none');
            if (s.guides) {
                for (let row = 0; row <= s.rows; row++) p.line(grid, [pad, pad + row * ch], [pad + w, pad + row * ch], { role: 'guide', weight: .5 });
                for (let col = 0; col <= cols; col++) p.line(grid, [pad + col * cw, pad], [pad + col * cw, pad + h], { role: 'guide', weight: .4 });
            }
            const cells = new Map<string, { row: number; col: number; owners: number[]; velocity: number }>();
            for (const { note: n, index } of notes) {
                const row = Math.min(s.rows - 1, Math.floor(n.y * s.rows));
                const first = Math.min(cols - 1, Math.floor(n.x * cols));
                const last = Math.min(cols, Math.max(first + 1, Math.ceil((n.x + n.extent) * cols)));
                for (let col = first; col < last; col++) {
                    const key = `${row}:${col}`, existing = cells.get(key);
                    if (existing) { existing.owners.push(index); existing.velocity = Math.max(existing.velocity, n.velocity); }
                    else cells.set(key, { row, col, owners: [index], velocity: n.velocity });
                }
            }
            for (const { row, col, owners, velocity } of cells.values()) {
                const g = p.group(owners, 'none'), inset = Math.min(cw, ch) * clamp(.22 / scale, .04, .4);
                const xx = pad + col * cw + inset, yy = pad + row * ch + inset, sw = cw - inset * 2, sh = ch - inset * 2;
                // Hollow cells are actual outlines: never paint paper over transparency.
                if (rand() < .17) p.rect(g, xx, yy, sw, sh, { weight: .6, opacity: .65 });
                else if (rand() < .35) p.rect(g, xx + sw * .3, yy, sw * .4, sh, { fill: true, opacity: .35 + velocity * .65 });
                else p.rect(g, xx, yy, sw, sh, { fill: true, opacity: .35 + velocity * .65 });
            }
            break;
        }
    }
    const drawing = { groups: p.groups.filter(g => g.shapes.length), width, height, count: p.count };
    markAccents(language, drawing);
    return enrich(language, drawing, page, s);
}

function drawGlyph(p: Pen, g: MarkGroup, kind: number, cx: number, cy: number, r: number, style: Style) {
    switch (kind) {
        case 0: p.line(g, [cx - r, cy], [cx + r, cy], style); p.line(g, [cx, cy - r], [cx, cy + r], style); break;
        case 1: p.circle(g, [cx, cy], r, { ...style, fill: false }); break;
        case 2: p.poly(g, [[cx, cy - r], [cx + r, cy + r], [cx - r, cy + r]], true, style); break;
        case 3: p.poly(g, [[cx - r, cy + r], [cx - r, cy - r], [cx + r, cy - r]], false, style); break;
        case 4: p.poly(g, [[cx - r, cy - r], [cx + r, cy], [cx - r, cy + r]], false, style); break;
        case 5: p.rect(g, cx - r, cy - r, r * 2, r * 2, style); break;
        default:
            for (let i = -1; i <= 1; i++) p.line(g, [cx + i * r * .7, cy - r], [cx + i * r * .7, cy + r], style);
    }
}
