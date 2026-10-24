import type { ElementContext } from '@mvmnt-app/plugin-sdk';
import { clamp, readPage, settings, type Page, type Props, type Settings } from './model';

export interface TransitionWindow { boundary: number; duration: number }
export interface Lifecycle { enter?: TransitionWindow; exit?: TransitionWindow }
export interface PhraseLayer { page: Page; lifecycle: Lifecycle }

function windowAt(beat: number, beats: number, s: Settings, context: ElementContext<Props>): TransitionWindow | undefined {
    const a = context.timing!.beatsToSeconds(beat - beats), b = context.timing!.beatsToSeconds(beat), c = context.timing!.beatsToSeconds(beat + beats);
    if (!a.ok || !b.ok || !c.ok || ![a.value, b.value, c.value].every(Number.isFinite)) return;
    const duration = Math.min(s.transitionDuration, .5 * Math.min(b.value - a.value, c.value - b.value));
    return duration > 0 ? { boundary: b.value, duration } : undefined;
}
export function readPhraseLayers(p: Props, seconds: number, context: ElementContext<Props>): PhraseLayer[] {
    const current = readPage(p, seconds, context);
    if (!current) return [];
    const s = settings(p);
    if (s.transition === 'none' || s.transitionDuration === 0) return [{ page: current, lifecycle: {} }];
    const enter = windowAt(current.startBeat, current.beats, s, context);
    const exit = windowAt(current.startBeat + current.beats, current.beats, s, context);
    const layers: PhraseLayer[] = [{ page: current, lifecycle: { enter, exit } }];
    if (enter && seconds < enter.boundary + enter.duration / 2) {
        const previous = readPage(p, seconds, context, current.index - 1);
        if (previous) layers.unshift({ page: previous, lifecycle: { exit: enter } });
    } else if (exit && seconds > exit.boundary - exit.duration / 2) {
        const next = readPage(p, seconds, context, current.index + 1);
        if (next) layers.push({ page: next, lifecycle: { enter: exit } });
    }
    return layers;
}

export const easeIn = (t: number) => t * t * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export function transitionFrame(lifecycle: Lifecycle, rank: number, s: Settings, seconds: number) {
    const progress = (window: TransitionWindow) => {
        const start = window.boundary - window.duration / 2 + clamp(rank, 0, 1) * window.duration * s.stagger;
        return clamp((seconds - start) / Math.max(.000001, window.duration * (1 - s.stagger)), 0, 1);
    };
    if (s.transition === 'none' || s.transitionDuration === 0) return { visibility: 1, shift: 0 };
    const entry = lifecycle.enter ? easeOut(progress(lifecycle.enter)) : 1;
    const removal = lifecycle.exit ? easeIn(progress(lifecycle.exit)) : 0;
    return { visibility: entry * (1 - removal), shift: (removal - (1 - entry)) * s.travel };
}
