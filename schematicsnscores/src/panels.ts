import { definePluginElement, type ElementSchema } from '@mvmnt-app/plugin-sdk';
import { ClipLayer, EmptyRenderObject, Rectangle } from '@mvmnt-app/plugin-sdk/render';
import { descriptions, schema, titles } from './controls';
import { geometryKey } from './element';
import { generate, type Drawing } from './geometry';
import { number, settings, type Page, type Props, type Settings } from './model';
import { panelLayout, partitionPage, type Panel } from './panel-layout';
import { readPhraseLayers } from './phrases';
import { renderComposition } from './render';

export const PANEL_BUDGET = 24000;
interface Cache {
    layoutKey?: string; panels: Panel[];
    pages: Map<number, { key: string; partitions: Page[]; drawings: Drawing[] }>;
}
const panelSettings = (s: Settings, panel: Panel, index: number): Settings => ({
    ...s, width: panel.w, height: panel.h, vertical: false, background: '#00000000',
    padding: Math.min(s.padding, Math.max(0, Math.min(panel.w, panel.h) / 2 - 1)), seed: s.seed + index * 7919,
});
export default definePluginElement<Props, Cache, ElementSchema>({
    type: 'sns-panels',
    metadata: { name: titles.panels, description: descriptions.panels, category: 'Schematics n’ Scores' },
    schema: schema('panels'),
    createResources: () => ({ panels: [], pages: new Map() }),
    disposeResources(cache) { cache.pages.clear(); cache.panels = []; cache.layoutKey = undefined; },
    render({ props, time, context, resources }) {
        if (props.visible === false) return [];
        const normalized = { ...props, width: props.width ?? 1280, height: props.height ?? 720 };
        const phrases = readPhraseLayers(normalized, time.seconds, context);
        if (!phrases.length) { resources.pages.clear(); return []; }
        const s = settings(normalized);
        const width = s.vertical ? s.height : s.width, height = s.vertical ? s.width : s.height;
        const count = Math.round(number(props, 'panelCount', 10, 1, 16)), gutter = number(props, 'panelGutter', 12, 0, 64);
        const seed = Math.round(number(props, 'layoutSeed', 1998, 0, 2147483647));
        const layoutKey = JSON.stringify([width, height, s.padding, count, gutter, seed]);
        if (resources.layoutKey !== layoutKey) {
            resources.panels = panelLayout(width, height, s.padding, count, gutter, seed);
            resources.layoutKey = layoutKey; resources.pages.clear();
        }
        const { panels } = resources;
        const active = new Set(phrases.map(p => p.page.index));
        for (const index of resources.pages.keys()) if (!active.has(index)) resources.pages.delete(index);
        const frames = phrases.map(({ page, lifecycle }) => {
            const key = geometryKey(page, s) + layoutKey;
            let cached = resources.pages.get(page.index);
            if (!cached || cached.key !== key) {
                const partitions = partitionPage(page, panels.length);
                cached = { key, partitions, drawings: panels.map((panel, i) => generate(panel.language, partitions[i], panelSettings(s, panel, i))) };
                resources.pages.set(page.index, cached);
            }
            return { ...cached, lifecycle };
        });
        const bounds = new Rectangle(0, 0, s.width, s.height, { fillColor: null }).setLayoutParticipation('include');
        const clip = new ClipLayer(s.width, s.height).setLayoutParticipation('exclude');
        if (!s.background.endsWith('00')) clip.addChild(new Rectangle(0, 0, s.width, s.height, { fillColor: s.background }).setLayoutParticipation('exclude'));
        const root = new EmptyRenderObject().setLayoutParticipation('exclude');
        if (s.vertical) { root.x = s.width; root.rotation = Math.PI / 2; }
        clip.addChild(root);
        const current = phrases.find(p => time.seconds >= p.page.start && time.seconds < p.page.end)!.page;
        const beat = context.timing!.secondsToBeats(time.seconds);
        const progress = beat.ok ? (beat.value - current.startBeat) / current.beats : 0;
        const dividers = props.showDividers === true;
        const budget = Math.floor((PANEL_BUDGET - 2 - (dividers ? panels.length : 0)) / panels.length);
        for (const [i, panel] of panels.entries()) {
            const layers = frames.map(f => ({ drawing: f.drawings[i], page: f.partitions[i], lifecycle: f.lifecycle }));
            const objects = renderComposition(layers, panelSettings(s, panel, i), time.seconds, progress, budget);
            const content = objects[1]; content.x = panel.x; content.y = panel.y;
            root.addChild(content);
            if (dividers) root.addChild(new Rectangle(panel.x, panel.y, panel.w, panel.h, { fillColor: null, strokeColor: s.guide, strokeWidth: s.stroke }).setLayoutParticipation('exclude'));
        }
        return [bounds, clip];
    },
});
