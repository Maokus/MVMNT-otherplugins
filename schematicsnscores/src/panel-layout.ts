import { clamp, hash, languages, random, type Language, type Page } from './model';
import type { Box } from './bounds';

export interface Panel extends Box { language: Language }
export function panelLayout(width: number, height: number, padding: number, requested: number, gutter: number, seed: number): Panel[] {
    const rng = random(hash(`layout:${seed}`));
    const rects: Box[] = [{ x: padding, y: padding, w: Math.max(1, width - padding * 2), h: Math.max(1, height - padding * 2) }];
    const count = Math.round(clamp(requested, 1, 16));
    while (rects.length < count) {
        const eligible = rects.map((rect, i) => ({ rect, i })).filter(({ rect }) => rect.w >= 192 + gutter || rect.h >= 128 + gutter)
            .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h || a.i - b.i);
        if (!eligible.length) break;
        const { rect: r, i } = eligible[0];
        const canX = r.w >= 192 + gutter, canY = r.h >= 128 + gutter;
        const horizontal = canX && (!canY || r.w >= r.h);
        const span = (horizontal ? r.w : r.h) - gutter, min = horizontal ? 96 : 64;
        const cut = clamp(span * (.35 + rng() * .3), min, span - min);
        const a = { ...r }, b = { ...r };
        if (horizontal) { a.w = cut; b.x += cut + gutter; b.w = span - cut; }
        else { a.h = cut; b.y += cut + gutter; b.h = span - cut; }
        rects.splice(i, 1, a, b);
    }
    rects.sort((a, b) => a.y - b.y || a.x - b.x);
    const assigned: Language[] = [];
    while (assigned.length < rects.length) {
        const cycle = [...languages];
        for (let i = cycle.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
        }
        assigned.push(...cycle);
    }
    return rects.map((r, i) => ({ ...r, language: assigned[i] }));
}

/** Original normalized positions/ranges survive partitioning; chords never split across panels. */
export function partitionPage(page: Page, count: number): Page[] {
    const result = Array.from({ length: count }, () => ({ ...page, notes: [] as Page['notes'] }));
    let groupStart = -Infinity, group = -1;
    for (const note of page.notes) {
        if (group < 0 || note.start - groupStart > .001 + 1e-9) { group++; groupStart = note.start; }
        result[group % count].notes.push(note);
    }
    return result;
}
