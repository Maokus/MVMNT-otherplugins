import type { ElementContext } from '@mvmnt-app/plugin-sdk';
import type { MidiNoteEvent } from '@mvmnt-app/plugin-sdk/timeline';

export const languages = ['cage', 'penderecki', 'decesare', 'notation', 'schematic', 'isometric', 'wall', 'mechanism', 'field', 'matrix'] as const;
export type Language = typeof languages[number];
export type Props = Readonly<Record<string, unknown>>;
export const MAX_NOTES = 256;
export const MAX_PRIMITIVES = 6000;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const number = (p: Props, key: string, fallback: number, lo: number, hi: number) =>
    typeof p[key] === 'number' && Number.isFinite(p[key]) ? clamp(p[key] as number, lo, hi) : clamp(fallback, lo, hi);

export interface Settings {
    width: number; height: number; padding: number; vertical: boolean;
    density: number; seed: number; autoRange: boolean; minNote: number; maxNote: number;
    stroke: number; scale: number; ink: string; accent: string; guide: string; background: string;
    guides: boolean; accentStrength: number; release: number; motion: number; playhead: boolean;
    pointSize: number; connections: number; bandThickness: number; hatchSpacing: number;
    cellSize: number; boxes: boolean; staffCount: number; noteScale: number;
    diagramScale: number; annotations: boolean; depth: number; nodeSize: number;
    contourCount: number; spread: number; pulleySize: number; beltDetail: number;
    markSize: number; scatter: number; rows: number; subdivision: number;
}
const color = (p: Props, key: string, fallback: string) =>
    typeof p[key] === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(p[key] as string) ? p[key] as string : fallback;

export function settings(p: Props): Settings {
    const width = number(p, 'width', 640, 16, 8192), height = number(p, 'height', 160, 16, 8192);
    return {
        width, height, padding: number(p, 'padding', 12, 0, Math.min(width, height) / 2 - 1), vertical: p.orientation === 'vertical',
        density: number(p, 'density', .65, 0, 1), seed: Math.round(number(p, 'seed', 1998, 0, 2147483647)),
        autoRange: p.autoRange !== false, minNote: number(p, 'minNote', 36, 0, 127), maxNote: number(p, 'maxNote', 84, 0, 127),
        stroke: number(p, 'strokeWidth', .8, .1, 8), scale: number(p, 'markScale', 1, .25, 4),
        ink: color(p, 'inkColor', '#F5F1E8FF'), accent: color(p, 'accentColor', '#C76760FF'),
        guide: color(p, 'guideColor', '#F5F1E830'), background: color(p, 'backgroundColor', '#00000000'),
        guides: p.showGuides === true, accentStrength: number(p, 'accentStrength', .55, 0, 1),
        release: number(p, 'release', .45, .01, 5), motion: number(p, 'motionAmount', .5, 0, 8), playhead: p.showPlayhead === true,
        pointSize: number(p, 'pointSize', 1.6, .3, 8), connections: number(p, 'connections', .35, 0, 1),
        bandThickness: number(p, 'bandThickness', 1, .2, 3), hatchSpacing: number(p, 'hatchSpacing', 4, 1, 20),
        cellSize: number(p, 'cellSize', 22, 8, 80), boxes: p.showBoxes !== false,
        staffCount: Math.round(number(p, 'staffCount', 1, 1, 4)), noteScale: number(p, 'noteScale', 1, .5, 2),
        diagramScale: number(p, 'diagramScale', 1, .4, 2), annotations: p.showAnnotations !== false,
        depth: number(p, 'projectionDepth', 20, 2, 80), nodeSize: number(p, 'nodeSize', 2.2, .5, 8),
        contourCount: Math.round(number(p, 'contourCount', 5, 1, 16)), spread: number(p, 'contourSpread', 3, .5, 10),
        pulleySize: number(p, 'pulleySize', 1, .3, 2), beltDetail: number(p, 'beltDetail', .6, 0, 1),
        markSize: number(p, 'markSize', 3, 1, 12), scatter: number(p, 'scatter', .7, 0, 1),
        rows: Math.round(number(p, 'rows', 12, 2, 32)), subdivision: Math.round(number(p, 'subdivision', 2, 1, 8)),
    };
}

export interface Note {
    id: string; pitch: number; velocity: number; start: number; end: number;
    /** Positions within the current page, measured in beats. */
    x: number; extent: number; y: number;
}
export interface Page {
    index: number; start: number; end: number; startBeat: number; beats: number; notes: Note[];
}

/** Content seed, never render order or wall-clock time. */
export function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}
export function random(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ state >>> 15, state | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function sample<T>(items: readonly T[], count: number): T[] {
    if (items.length <= count) return [...items];
    if (count <= 0) return [];
    if (count === 1) return [items[Math.floor(items.length / 2)]];
    return Array.from({ length: count }, (_, i) => items[Math.round(i * (items.length - 1) / (count - 1))]);
}

export function readPage(p: Props, seconds: number, context: ElementContext<Props>): Page | null {
    if (typeof p.midiTrackId !== 'string' || !p.midiTrackId || !context.timeline || !context.timing || !Number.isFinite(seconds)) return null;
    const timing = context.timing;
    const beat = timing.secondsToBeats(seconds), signature = timing.getTimeSignature();
    if (!beat.ok || !signature.ok || !Number.isFinite(beat.value)) return null;
    const { numerator, denominator } = signature.value;
    if (!(numerator > 0 && denominator > 0)) return null;
    const beats = Math.round(number(p, 'pageBars', 4, 1, 16)) * numerator * 4 / denominator;
    const offset = number(p, 'pageOffset', 0, -4096, 4096);
    const index = Math.floor((beat.value - offset) / beats);
    const startBeat = index * beats + offset;
    const start = timing.beatsToSeconds(startBeat), end = timing.beatsToSeconds(startBeat + beats);
    if (!start.ok || !end.ok || !Number.isFinite(start.value) || !Number.isFinite(end.value) || end.value <= start.value) return null;
    const selected = context.timeline.selectNotes({ trackIds: [p.midiTrackId], startSeconds: start.value, endSeconds: end.value });
    if (!selected.ok) return null;
    const s = settings(p);
    const valid = selected.value.filter(n => validNote(n) && n.trackId === p.midiTrackId && n.startSeconds < end.value && n.endSeconds > start.value)
        .slice().sort((a, b) => a.startSeconds - b.startSeconds || a.note - b.note || a.endSeconds - b.endSeconds || (a.velocity ?? 80) - (b.velocity ?? 80) || a.channel - b.channel || String(a.clipId ?? '').localeCompare(String(b.clipId ?? '')));
    let lo = Math.min(s.minNote, s.maxNote), hi = Math.max(s.minNote, s.maxNote);
    if (s.autoRange && valid.length) {
        lo = 127; hi = 0;
        for (const n of valid) { lo = Math.min(lo, n.note); hi = Math.max(hi, n.note); }
    }
    const notes: Note[] = [];
    for (const [i, n] of sample(valid, MAX_NOTES).entries()) {
        const a = timing.secondsToBeats(Math.max(start.value, n.startSeconds));
        const b = timing.secondsToBeats(Math.min(end.value, n.endSeconds));
        if (!a.ok || !b.ok || !Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
        notes.push({
            id: `${n.clipId ?? ''}:${n.channel}:${n.note}:${n.startSeconds}:${n.endSeconds}:${i}`,
            pitch: n.note, velocity: n.velocity === undefined ? 80 / 127 : clamp(n.velocity, 0, 127) / 127,
            start: n.startSeconds, end: n.endSeconds,
            x: clamp((a.value - startBeat) / beats, 0, 1), extent: clamp((b.value - a.value) / beats, 0, 1),
            y: hi === lo ? .5 : 1 - clamp((n.note - lo) / (hi - lo), 0, 1),
        });
    }
    return { index, start: start.value, end: end.value, startBeat, beats, notes };
}
function validNote(n: MidiNoteEvent) {
    return Number.isFinite(n.note) && n.note >= 0 && n.note <= 127 && Number.isFinite(n.startSeconds) && Number.isFinite(n.endSeconds) && n.endSeconds > n.startSeconds && (n.velocity === undefined || Number.isFinite(n.velocity));
}

/** A short attack and release around the real note, including sustained notes on a later page. */
export function activity(n: Pick<Note, 'start' | 'end' | 'velocity'>, seconds: number, release: number): number {
    if (seconds < n.start || seconds >= n.end + release) return 0;
    const attack = clamp((seconds - n.start) / .035, 0, 1);
    const tail = seconds <= n.end ? 1 : 1 - (seconds - n.end) / release;
    return attack * tail * (.35 + .65 * n.velocity);
}
