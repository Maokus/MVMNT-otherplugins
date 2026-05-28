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

// ── Animation constants ──────────────────────────────────────────────────────

const JUMP_DURATION = 0.3;
const JUMP_HEIGHT = 20;
const BOUNCE_DURATION = 0.5;
const BOUNCE_AMOUNT = 0.15;
const FLIP_PRE = 0.2;
const FLIP_POST = 0.2;

/**
 * Returns adjusted y-position and font size for the current animation state.
 * For flipy/flipx: compresses font size toward 0 (text has no independent x-axis scale).
 */
function animateText(
    animation: string,
    elapsed: number,
    timeToNext: number | null,
    y: number,
    fontSize: number
): { y: number; fontSize: number } {
    if (animation === 'jump') {
        const progress = Math.min(elapsed / JUMP_DURATION, 1);
        const env = 1 - Math.pow(progress, 3);
        return { y: y - JUMP_HEIGHT * env, fontSize };
    }

    if (animation === 'bounce') {
        const progress = Math.min(elapsed / BOUNCE_DURATION, 1);
        const scale = 1 + BOUNCE_AMOUNT * Math.exp(-progress * 6) * Math.cos(progress * Math.PI * 2.5);
        return { y, fontSize: fontSize * scale };
    }

    if (animation === 'flipy' || animation === 'flipx') {
        let scale = 1;
        if (elapsed < FLIP_POST) {
            scale = Math.pow(Math.max(0, elapsed) / FLIP_POST, 0.5);
        } else if (timeToNext !== null && timeToNext < FLIP_PRE) {
            const p = 1 - timeToNext / FLIP_PRE;
            scale = 1 - Math.pow(p, 2);
        }
        return { y, fontSize: fontSize * Math.max(0, scale) };
    }

    return { y, fontSize };
}

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

        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontFamilyRaw);
        const fontWeight = (weightPart || '400').toString();
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);

        const { y, fontSize } = animateText(animation, elapsed, timeToNext, 0, baseFontSize);
        const fontString = `${fontWeight} ${Math.max(1, Math.round(fontSize))}px ${fontFamily ?? 'Inter'}, sans-serif`;

        const textObj = new Text(0, y, lines[lineIndex], fontString, textColor, 'center', 'middle');
        (textObj as any).setIncludeInLayoutBounds?.(false);

        // Stable layout anchor — text opts out of bounds so layout stays at the point (0,0)
        return [new Rectangle(0, 0, 1, 1, null, 'transparent', 1), textObj];
    }
}
