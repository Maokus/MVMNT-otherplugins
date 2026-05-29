import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    parseFontSelection,
    ensureFontLoaded,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import { Text, Rectangle } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';
import { applyAnimation, FLIP_PRE } from './carousel-animate';

// ─────────────────────────────────────────────────────────────────────────────

export class TextCarouselElement extends SceneElement {
    constructor(id: string = 'text-carousel', config: Record<string, unknown> = {}) {
        super('text-carousel', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Text Carousel',
                description: 'Cycles through lines of text on each MIDI note onset',
                category: 'us.maok.midipack2',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'MIDI track to monitor for note onsets',
                            }),
                        ],
                    },
                    {
                        id: 'textContent',
                        label: 'Text',
                        collapsed: false,
                        properties: [
                            prop.longString('lines', 'Lines', 'Line one\nLine two\nLine three', {
                                description:
                                    'Each line separated by a newline. Advances to the next line on each note onset.',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('layoutWidth', 'Width', 400, { min: 10, step: 1 }),
                            prop.number('layoutHeight', 'Height', 100, { min: 10, step: 1 }),
                            prop.select('justification', 'Justification', 'center', [
                                { value: 'left', label: 'Left' },
                                { value: 'center', label: 'Center' },
                                { value: 'right', label: 'Right' },
                            ]),
                        ],
                    },
                    {
                        id: 'textAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.font('fontFamily', 'Font', 'Inter', {
                                description: 'Font family (Google Fonts supported)',
                            }),
                            prop.number('fontSize', 'Font Size', 48, { min: 8, max: 300, step: 1 }),
                            prop.colorAlpha('textColor', 'Text Color', '#FFFFFFFF'),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.select('animation', 'Animation', 'none', [
                                { value: 'none', label: 'None' },
                                { value: 'bounce', label: 'Bounce' },
                                { value: 'jump', label: 'Jump' },
                                { value: 'flipy', label: 'Flip Y' },
                                { value: 'flipx', label: 'Flip X' },
                            ]),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        const rawLines = ((props.lines as string | null) ?? '').split('\n');
        const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

        if (lines.length === 0) {
            return [new Text(0, 0, 'Enter some lines of text', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (!host.ok) return host.renderFallback();

        const animation = props.animation as string;
        const EPS = 1e-3;
        const lookahead = animation === 'flipy' || animation === 'flipx' ? FLIP_PRE + EPS : EPS;

        const notes = host.api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: 0,
            endSec: targetTime + lookahead,
        });

        const pastNotes = notes.filter((n) => n.startTime <= targetTime);
        const lineIndex = pastNotes.length % lines.length;

        const lastNote = pastNotes.length > 0 ? pastNotes[pastNotes.length - 1] : null;
        const elapsed = lastNote ? Math.max(0, targetTime - lastNote.startTime) : Infinity;

        const nextNote = notes.find((n) => n.startTime > targetTime);
        const timeToNext = nextNote ? nextNote.startTime - targetTime : null;

        const baseFontSize = props.fontSize as number;
        const fontFamilyRaw = (props.fontFamily as string | null) ?? 'Inter';
        const textColor = props.textColor as string;
        const lw = props.layoutWidth as number;
        const lh = props.layoutHeight as number;
        const justification = props.justification as string;

        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontFamilyRaw);
        const fontWeight = (weightPart || '400').toString();
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);

        const fontString = `${fontWeight} ${Math.max(1, Math.round(baseFontSize))}px ${fontFamily ?? 'Inter'}, sans-serif`;

        let textX: number;
        let textAlign: 'left' | 'center' | 'right';
        if (justification === 'left') {
            textX = -lw / 2;
            textAlign = 'left';
        } else if (justification === 'right') {
            textX = lw / 2;
            textAlign = 'right';
        } else {
            textX = 0;
            textAlign = 'center';
        }

        const textObj = new Text(textX, 0, lines[lineIndex], fontString, textColor, textAlign, 'middle');
        textObj.setMaxWidth(lw);
        (textObj as any).setIncludeInLayoutBounds?.(false);

        applyAnimation(textObj, animation, elapsed, timeToNext);

        return [new Rectangle(-lw / 2, -lh / 2, lw, lh, { fillColor: null, strokeColor: 'transparent' }), textObj];
    }
}
