import { definePluginElement, type ElementSchema } from '@mvmnt-app/plugin-sdk';
import { schema, descriptions, titles } from './controls';
import { generate, type Drawing } from './geometry';
import { readPage, settings, type Language, type Props } from './model';
import { renderDrawing } from './render';

interface Cache { key?: string; drawing?: Drawing }
export function createScoreElement(language: Language) {
    return definePluginElement<Props, Cache, ElementSchema>({
        type: `sns-${language}`,
        metadata: { name: titles[language], description: descriptions[language], category: 'Schematics n’ Scores' },
        schema: schema(language),
        createResources: () => ({}),
        disposeResources(cache) { cache.key = undefined; cache.drawing = undefined; },
        render({ props, time, context, resources }) {
            if (props.visible === false) return [];
            const page = readPage(props, time.seconds, context);
            if (!page) { resources.key = undefined; resources.drawing = undefined; return []; }
            const s = settings(props);
            // Colors and animation are deliberately absent: these update without rebuilding geometry.
            const { ink, accent, guide, background, accentStrength, release, motion, playhead, stroke, ...geometrySettings } = s;
            const key = JSON.stringify([page, geometrySettings]);
            if (resources.key !== key || !resources.drawing) {
                resources.drawing = generate(language, page, s);
                resources.key = key;
            }
            const beat = context.timing!.secondsToBeats(time.seconds);
            const progress = beat.ok ? (beat.value - page.startBeat) / page.beats : 0;
            return renderDrawing(resources.drawing, page, s, time.seconds, progress);
        },
    });
}
