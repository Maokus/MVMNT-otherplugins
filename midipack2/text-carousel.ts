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
                                    'Each line of text separated by a newline. Advances to the next line on each note onset.',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
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

        // Count note onsets up to targetTime; each onset advances to the next line
        const EPS = 1e-3;
        const notes = host.api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: 0,
            endSec: targetTime + EPS,
        });
        const lineIndex = notes.length % lines.length;
        const currentLine = lines[lineIndex];

        const fontFamilyRaw = (props.fontFamily as string | null) ?? 'Inter';
        const fontSize = props.fontSize as number;
        const textColor = props.textColor as string;

        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontFamilyRaw);
        const fontWeight = (weightPart || '400').toString();
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const fontString = `${fontWeight} ${fontSize}px ${fontFamily ?? 'Inter'}, sans-serif`;

        return [
            new Rectangle(0, 0, 1, 1, null, 'transparent', 1),
            new Text(0, 0, currentLine, fontString, textColor, 'center', 'middle'),
        ];
    }
}
