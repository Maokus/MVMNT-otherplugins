// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    Arc,
    ensureFontLoaded,
    parseFontSelection,
    Rectangle,
    CallbackElementRenderer,
    Text,
    insertElementConfig,
    prop,
    tab,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import * as af from '@mvmnt-app/plugin-sdk/animation';

const PITCH_CLASSES = [
    { value: '0', label: 'C' },
    { value: '1', label: 'C♯ / D♭' },
    { value: '2', label: 'D' },
    { value: '3', label: 'D♯ / E♭' },
    { value: '4', label: 'E' },
    { value: '5', label: 'F' },
    { value: '6', label: 'F♯ / G♭' },
    { value: '7', label: 'G' },
    { value: '8', label: 'G♯ / A♭' },
    { value: '9', label: 'A' },
    { value: '10', label: 'A♯ / B♭' },
    { value: '11', label: 'B' },
] as const;

// Ordered clockwise from the tonic: each step is an ascending perfect fifth.
const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
const DEGREE_COLORS = [
    '#F97316',
    '#EF4444',
    '#EC4899',
    '#A855F7',
    '#6366F1',
    '#3B82F6',
    '#06B6D4',
    '#14B8A6',
    '#22C55E',
    '#84CC16',
    '#EAB308',
    '#F59E0B',
];
// Palette entries are indexed by chromatic semitone (C, C♯/D♭, D, …), while
// their source order follows the circle of fifths (C, G, D, …, F).
const COLOR_SCHEMES: Record<string, string[]> = {
    spectralWheel: [
        '#E63946',
        '#279AC1',
        '#F8961E',
        '#5A4FCF',
        '#A7C957',
        '#D45087',
        '#2A9D8F',
        '#F06432',
        '#3A6EA5',
        '#F9C74F',
        '#9B5DE5',
        '#43AA6C',
    ],
    perceptuallyBalanced: [
        '#D95F59',
        '#4685A8',
        '#C99836',
        '#806BB1',
        '#63A45B',
        '#C05778',
        '#388F91',
        '#D97948',
        '#6278B5',
        '#9AA343',
        '#A35F9D',
        '#3C9B75',
    ],
    pastelHarmonicWheel: [
        '#F3A6A0',
        '#96C4DC',
        '#F4CA88',
        '#BCA9DC',
        '#C5D794',
        '#E5A3B7',
        '#91CFCA',
        '#F5B58C',
        '#A9B6E1',
        '#E8DB8F',
        '#D1A5CE',
        '#9FD3AE',
    ],
    darkNeon: [
        '#FF4D6D',
        '#26BDEB',
        '#FFB627',
        '#795CFF',
        '#8FEA45',
        '#ED4DB6',
        '#20D6C7',
        '#FF7849',
        '#4D82FF',
        '#E9F542',
        '#B657F2',
        '#32DB85',
    ],
    // Retain these identifiers for scenes created before the new palettes.
    spectrum: DEGREE_COLORS,
    ocean: [
        '#F4D35E',
        '#EE964B',
        '#F95738',
        '#D1495B',
        '#A442A0',
        '#5C4B99',
        '#3F6DB5',
        '#277DA1',
        '#1C9A9A',
        '#43AA8B',
        '#90BE6D',
        '#C7D36F',
    ],
    twilight: [
        '#F9C74F',
        '#F9844A',
        '#F94144',
        '#C83E8C',
        '#8E5EA2',
        '#577590',
        '#277DA1',
        '#43AA8B',
        '#90BE6D',
        '#B5C95A',
        '#E9C46A',
        '#F4A261',
    ],
};
const PRE_ONSET_DURATION_SECONDS = 0.12;
const PRE_ONSET_NODE_SCALE = 0.86;

type NoteAnimationState = {
    phase: 'pre-onset' | 'active' | 'release';
    haloReveal: number;
    nodeScale: number;
    priority: number;
};

function pitchClass(note: number): number {
    return ((note % 12) + 12) % 12;
}

function excludeFromLayout<T extends RenderObject>(object: T): T {
    return object.setLayoutParticipation('exclude');
}

function progressForDuration(elapsed: number, duration: number): number {
    if (duration <= 0) return elapsed >= 0 ? 1 : 0;
    return Math.min(1, Math.max(0, elapsed / duration));
}

function onsetNodeScale(progress: number): number {
    return PRE_ONSET_NODE_SCALE + (1 - PRE_ONSET_NODE_SCALE) * af.easings.easeOutBack(progress);
}

class SonofieldCircleElement extends CallbackElementRenderer {
    constructor(id: string = 'sonofield-circle', config: Record<string, unknown> = {}) {
        super('sonofield-circle', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Sonofield Circle',
                description: 'A circle-of-fifths map of the tonal function of active MIDI notes.',
                category: 'us.maok.circleoffifths',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'Track whose active notes highlight scale degrees.',
                            }),
                            prop.select('tonicPitchClass', 'Tonic', '0', [...PITCH_CLASSES], {
                                description: 'Set the tonal centre manually; MIDI octave does not matter.',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'circleAppearance',
                        label: 'Circle',
                        collapsed: false,
                        properties: [
                            prop.number('radius', 'Radius (px)', 220, { min: 40, max: 1000, step: 1 }),
                            prop.number('nodeRadius', 'Node Radius (px)', 25, { min: 3, max: 100, step: 1 }),
                            prop.number('ringWidth', 'Ring Width (px)', 2, { min: 0, max: 20, step: 1 }),
                        ],
                    },
                    {
                        id: 'colors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('ringColor', 'Ring Color', '#FFFFFF33'),
                            prop.colorAlpha('backgroundColor', 'Background', '#0F172A00'),
                            prop.select('colorScheme', 'Color Scheme', 'perceptuallyBalanced', [
                                { value: 'spectralWheel', label: 'Colorful' },
                                { value: 'perceptuallyBalanced', label: 'Darkish' },
                                { value: 'pastelHarmonicWheel', label: 'Pastel' },
                                { value: 'darkNeon', label: 'Neonish' },
                                { value: 'manual', label: 'Manual' },
                            ]),
                            ...DEGREE_LABELS.map((label, semitones) =>
                                prop.colorAlpha(`degreeColor${semitones}`, `${label} Color`, DEGREE_COLORS[semitones], {
                                    visibleWhen: [{ key: 'colorScheme', equals: 'manual' }],
                                })
                            ),
                        ],
                    },
                    {
                        id: 'labels',
                        label: 'Labels',
                        collapsed: false,
                        properties: [
                            prop.boolean('showDegreeLabels', 'Show Degree Labels', true),
                            prop.font('labelFontFamily', 'Label Font', 'Inter'),
                            prop.number('labelSize', 'Label Size (px)', 16, { min: 6, max: 72, step: 1 }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.select('animationType', 'Activation Animation', 'stroke', [
                                { value: 'stroke', label: 'Stroke' },
                                { value: 'arc', label: 'Arc' },
                            ]),
                            prop.number('attackDuration', 'Note-on Duration (s)', 0.24, {
                                min: 0,
                                max: 5,
                                step: 0.01,
                            }),
                            prop.number('releaseDuration', 'Note-off Duration (s)', 0.3, {
                                min: 0,
                                max: 5,
                                step: 0.01,
                            }),
                            prop.number('activeHaloWidth', 'Active Halo Width (px)', 8, { min: 1, max: 40, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const radius = props.radius as number;
        const nodeRadius = props.nodeRadius as number;
        const tonic = Number(props.tonicPitchClass ?? 0);
        const attackDuration = props.attackDuration as number;
        const releaseDuration = props.releaseDuration as number;
        const noteStates = new Map<number, NoteAnimationState>();
        const visualExtent = radius + nodeRadius + (props.activeHaloWidth as number) + 28;

        // This is the sole layout participant. Animated objects must never alter an
        // element's measured bounds or cause it to shift while notes are played.
        const layoutRect = new Rectangle(-visualExtent, -visualExtent, visualExtent * 2, visualExtent * 2, {
            fillColor: '#00000000',
        }).setLayoutParticipation('include');
        const objects: RenderObject[] = [
            layoutRect,
            excludeFromLayout(
                new Rectangle(-visualExtent, -visualExtent, visualExtent * 2, visualExtent * 2, {
                    fillColor: props.backgroundColor as string,
                })
            ),
            excludeFromLayout(
                new Arc(0, 0, radius, {
                    fillColor: '#00000000',
                    strokeColor: props.ringColor as string,
                    strokeWidth: props.ringWidth as number,
                })
            ),
        ];

        if (props.midiTrackId) {
            const notesResult = this.context.timeline?.selectNotes({
                trackIds: [props.midiTrackId as string],
                startSeconds: targetTime - releaseDuration,
                endSeconds: targetTime + PRE_ONSET_DURATION_SECONDS,
            });
            if (!notesResult?.ok) return [];

            // Include imminent starts and recent endings so pre-onset and release
            // animations render even when notes are shorter than either duration.
            notesResult.value
                .map((note) => ({ ...note, startTime: note.startSeconds, endTime: note.endSeconds }))
                .forEach((note) => {
                    if (
                        targetTime < note.startTime - PRE_ONSET_DURATION_SECONDS ||
                        targetTime > note.endTime + releaseDuration
                    ) {
                        return;
                    }
                    const notePitchClass = pitchClass(note.note);
                    let state: NoteAnimationState;

                    if (targetTime < note.startTime) {
                        const preOnsetProgress = progressForDuration(
                            targetTime - (note.startTime - PRE_ONSET_DURATION_SECONDS),
                            PRE_ONSET_DURATION_SECONDS
                        );
                        state = {
                            phase: 'pre-onset',
                            haloReveal: 0,
                            nodeScale: 1 - (1 - PRE_ONSET_NODE_SCALE) * af.easings.easeInCubic(preOnsetProgress),
                            priority: 1,
                        };
                    } else if (targetTime < note.endTime) {
                        const attackProgress = progressForDuration(targetTime - note.startTime, attackDuration);
                        state = {
                            phase: 'active',
                            haloReveal: af.easings.easeOutCubic(attackProgress),
                            nodeScale: onsetNodeScale(attackProgress),
                            priority: 3,
                        };
                    } else {
                        const attackAtNoteOff = progressForDuration(note.endTime - note.startTime, attackDuration);
                        const releaseProgress = progressForDuration(targetTime - note.endTime, releaseDuration);
                        const releaseEase = af.easings.easeOutCubic(releaseProgress);
                        state = {
                            phase: 'release',
                            haloReveal: af.easings.easeOutCubic(attackAtNoteOff) * (1 - releaseEase),
                            nodeScale: onsetNodeScale(attackAtNoteOff) * (1 - releaseEase) + releaseEase,
                            priority: 2,
                        };
                    }

                    const existing = noteStates.get(notePitchClass);
                    if (
                        !existing ||
                        state.priority > existing.priority ||
                        (state.priority === existing.priority && state.haloReveal > existing.haloReveal)
                    ) {
                        noteStates.set(notePitchClass, state);
                    }
                });
        }

        const fontSelection = (props.labelFontFamily as string | undefined) ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const labelFont = `${fontWeight} ${props.labelSize as number}px ${fontFamily || 'Inter'}, sans-serif`;
        const colorScheme = props.colorScheme as string;
        const colors =
            colorScheme === 'manual'
                ? DEGREE_COLORS.map(
                      (fallback, semitones) => (props[`degreeColor${semitones}`] as string | undefined) ?? fallback
                  )
                : (COLOR_SCHEMES[colorScheme] ?? COLOR_SCHEMES.perceptuallyBalanced);

        CIRCLE_OF_FIFTHS.forEach((semitonesFromTonic, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / CIRCLE_OF_FIFTHS.length;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const color = colors[semitonesFromTonic];
            const noteState = noteStates.get((tonic + semitonesFromTonic) % 12);

            if (noteState && noteState.haloReveal > 0) {
                const reveal = noteState.haloReveal;
                const haloWidth = props.activeHaloWidth as number;
                const isStrokeAnimation = props.animationType === 'stroke';
                const halo = excludeFromLayout(
                    new Arc(x, y, nodeRadius + 7 + haloWidth, {
                        startAngle: -Math.PI / 2,
                        endAngle: isStrokeAnimation ? -Math.PI / 2 + Math.PI * 2 : -Math.PI / 2 + Math.PI * 2 * reveal,
                        fillColor: '#00000000',
                        strokeColor: color,
                        strokeWidth: isStrokeAnimation ? haloWidth * reveal : haloWidth,
                    })
                );
                halo.setOpacity(0.55 + reveal * 0.45);
                halo.setShadow(color, 18, 0, 0);
                objects.push(halo);
            }

            const node = excludeFromLayout(
                new Arc(x, y, nodeRadius * (noteState?.nodeScale ?? 1), {
                    fillColor: color,
                    strokeColor: '#00000000',
                })
            );
            if (noteState?.phase === 'active') node.setShadow(color, 12, 0, 0);
            objects.push(node);

            if (props.showDegreeLabels) {
                objects.push(
                    excludeFromLayout(
                        new Text(
                            x,
                            y + 1,
                            DEGREE_LABELS[semitonesFromTonic],
                            labelFont,
                            { color: '#FFFFFFFF', align: 'center', baseline: 'middle' }
                        )
                    )
                );
            }
        });

        return objects;
    }
}

export const sonofieldCircle = defineRendererElement(
    { type: 'sonofield-circle', capabilities: { required: ['timeline.read'], optional: [] } },
    SonofieldCircleElement
);
export default sonofieldCircle;
