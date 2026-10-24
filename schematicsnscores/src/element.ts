import { definePluginElement, type ElementSchema } from '@mvmnt-app/plugin-sdk';
import { schema, descriptions, titles } from './controls';
import { generate, type Drawing } from './geometry';
import { settings, type Language, type Page, type Props, type Settings } from './model';
import { readPhraseLayers } from './phrases';
import { renderComposition } from './render';

export interface Cache {
    pages: Map<number, { key: string; drawing: Drawing }>;
    /** Current-page aliases are useful when inspecting an instance during development. */
    key?: string; drawing?: Drawing;
}
export function geometryKey(page: Page, s: Settings): string {
    const { ink, accent, guide, background, accentMode, accentStrength, release, motion, playhead, stroke,
        transition, transitionDuration, stagger, travel, ...geometrySettings } = s;
    return JSON.stringify([page, geometrySettings]);
}
export function createScoreElement(language: Language) {
    return definePluginElement<Props, Cache, ElementSchema>({
        type: `sns-${language}`,
        metadata: { name: titles[language], description: descriptions[language], category: 'Schematics n’ Scores' },
        schema: schema(language),
        createResources: () => ({ pages: new Map() }),
        disposeResources(cache) { cache.pages.clear(); cache.key = undefined; cache.drawing = undefined; },
        render({ props, time, context, resources }) {
            if (props.visible === false) return [];
            const phrases = readPhraseLayers(props, time.seconds, context);
            if (!phrases.length) { resources.pages.clear(); resources.key = undefined; resources.drawing = undefined; return []; }
            const s = settings(props), active = new Set(phrases.map(p => p.page.index));
            for (const index of resources.pages.keys()) if (!active.has(index)) resources.pages.delete(index);
            const layers = phrases.map(({ page, lifecycle }) => {
                const key = geometryKey(page, s);
                let cached = resources.pages.get(page.index);
                if (!cached || cached.key !== key) {
                    cached = { key, drawing: generate(language, page, s) };
                    resources.pages.set(page.index, cached);
                }
                if (time.seconds >= page.start && time.seconds < page.end) {
                    resources.key = key; resources.drawing = cached.drawing;
                }
                return { page, lifecycle, drawing: cached.drawing };
            });
            const page = phrases.find(p => time.seconds >= p.page.start && time.seconds < p.page.end)!.page;
            const beat = context.timing!.secondsToBeats(time.seconds);
            const progress = beat.ok ? (beat.value - page.startBeat) / page.beats : 0;
            return renderComposition(layers, s, time.seconds, progress);
        },
    });
}
