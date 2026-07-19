import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,
    parseFontSelection,
    ensureFontLoaded,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import { Text, Rectangle } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import { applyAnimation, FLIP_PRE } from './animations';

let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, fontString: string): number {
    if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d')!;
    ctx.font = fontString;
    return ctx.measureText(text).width;
}

// ─────────────────────────────────────────────────────────────────────────────

class TextCarouselElement extends CallbackElementRenderer {
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
                        id: 'background',
                        label: 'Background',
                        collapsed: false,
                        properties: [
                            prop.boolean('bgEnabled', 'Enable Background', false),
                            prop.colorAlpha('bgColor', 'Color', '#00000080', {
                                visibleWhen: [{ key: 'bgEnabled', equals: true }],
                            }),
                            prop.number('bgPadding', 'Padding', 8, {
                                min: 0,
                                step: 1,
                                visibleWhen: [{ key: 'bgEnabled', equals: true }],
                            }),
                            prop.number('bgCornerRadius', 'Corner Radius', 4, {
                                min: 0,
                                step: 1,
                                visibleWhen: [{ key: 'bgEnabled', equals: true }],
                            }),
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
                            prop.number('animDuration', 'Duration (s)', 0.3, {
                                min: 0.01,
                                step: 0.01,
                                visibleWhen: [{ key: 'animation', notEquals: 'none' }],
                            }),
                            prop.number('animAmount', 'Amount', 10, {
                                min: 0,
                                step: 0.5,
                                visibleWhen: [{ key: 'animation', notEquals: 'none' }],
                            }),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', {
                color: '#94a3b8', align: 'left', baseline: 'top',
            })];
        }

        const rawLines = ((props.lines as string | null) ?? '').split('\n');
        const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

        if (lines.length === 0) {
            return [new Text(0, 0, 'Enter some lines of text', '14px Inter, sans-serif', {
                color: '#94a3b8', align: 'left', baseline: 'top',
            })];
        }

        const animation = props.animation as string;
        const animDuration = (props.animDuration as number) ?? 0.3;
        const animAmount = (props.animAmount as number) ?? 10;
        const EPS = 1e-3;
        const lookahead = animation === 'flipy' || animation === 'flipx' ? FLIP_PRE + EPS : EPS;

        const notesResult = this.context.timeline?.selectNotes({
            trackIds: [props.midiTrackId],
            startSeconds: 0,
            endSeconds: targetTime + lookahead,
        });
        if (!notesResult?.ok) return [];
        const notes = notesResult.value.map((note) => ({ ...note, startTime: note.startSeconds }));

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
        const bgEnabled = props.bgEnabled as boolean;
        const bgColor = (props.bgColor as string) ?? '#00000080';
        const bgPadding = (props.bgPadding as number) ?? 8;
        const bgCornerRadius = (props.bgCornerRadius as number) ?? 4;

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

        const textObj = new Text(textX, 0, lines[lineIndex], fontString, {
            color: textColor, align: textAlign, baseline: 'middle', maxWidth: lw,
        });
        textObj.setLayoutParticipation('exclude');

        applyAnimation(textObj, animation, elapsed, timeToNext, animDuration, animAmount);

        const result: RenderObject[] = [new Rectangle(-lw / 2, -lh / 2, lw, lh, { fillColor: null, strokeColor: 'transparent' })];

        if (bgEnabled) {
            const measuredWidth = measureTextWidth(lines[lineIndex], fontString);
            const clampedWidth = Math.min(measuredWidth, lw);
            const bgW = clampedWidth + bgPadding * 2;
            const bgH = baseFontSize + bgPadding * 2;
            let bgX: number;
            if (textAlign === 'center') {
                bgX = textX - bgW / 2;
            } else if (textAlign === 'left') {
                bgX = textX - bgPadding;
            } else {
                bgX = textX - clampedWidth - bgPadding;
            }
            const bgRect = new Rectangle(bgX, -bgH / 2, bgW, bgH, {
                fillColor: bgColor,
                strokeColor: null,
                cornerRadius: bgCornerRadius,
            });
            bgRect.setLayoutParticipation('exclude');
            result.push(bgRect);
        }

        result.push(textObj);
        return result;
    }
}

export const textCarousel = defineRendererElement({ type: 'text-carousel', capabilities: { required: ['timeline.read'], optional: [] }, }, TextCarouselElement);
export default textCarousel;
