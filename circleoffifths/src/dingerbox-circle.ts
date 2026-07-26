import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    Arc,
    CallbackElementRenderer,
    ensureFontLoaded,
    insertElementConfig,
    Line,
    parseFontSelection,
    Poly,
    Rectangle,
    Text,
    prop,
    tab,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import * as af from '@mvmnt-app/plugin-sdk/animation';

const TAU = Math.PI * 2;
const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH_CLASS_OPTIONS = SHARP_NOTE_NAMES.map((sharpName, pitch) => ({
    value: String(pitch),
    label: sharpName === FLAT_NOTE_NAMES[pitch] ? sharpName : `${sharpName} / ${FLAT_NOTE_NAMES[pitch]}`,
}));

type Point = { x: number; y: number };

function pitchClass(note: number): number {
    return ((note % 12) + 12) % 12;
}

function circleOfFifthsFrom(topPitchClass: number): number[] {
    return Array.from({ length: 12 }, (_, index) => (topPitchClass + index * 7) % 12);
}

function excludeFromLayout<T extends RenderObject>(object: T): T {
    return object.setLayoutParticipation('exclude');
}

function clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function fadeProgress(elapsed: number, duration: number): number {
    if (duration <= 0) return 1;
    return af.easings.easeOutCubic(clamp(elapsed / duration));
}

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(color: string): Rgba | null {
    const hex = color.trim().replace(/^#/, '');
    if (!/^[0-9a-f]{3,4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(hex)) return null;
    const expanded = hex.length <= 4 ? [...hex].map((character) => character + character).join('') : hex;
    return {
        r: Number.parseInt(expanded.slice(0, 2), 16),
        g: Number.parseInt(expanded.slice(2, 4), 16),
        b: Number.parseInt(expanded.slice(4, 6), 16),
        a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
}

function blendColor(from: string, to: string, progress: number, transparent = false): string {
    const start = parseColor(from);
    const end = parseColor(to);
    if (!start || !end) return progress >= 0.5 ? to : from;
    const mix = (a: number, b: number) => a + (b - a) * progress;
    const alpha = transparent ? end.a * progress : mix(start.a, end.a);
    return `rgba(${Math.round(mix(start.r, end.r))}, ${Math.round(mix(start.g, end.g))}, ${Math.round(
        mix(start.b, end.b)
    )}, ${alpha})`;
}

/** The circular node state at a given time, collapsed across MIDI octaves. */
function activePitchClasses(
    notes: readonly { note: number; startSeconds: number; endSeconds: number }[],
    targetTime: number,
    releaseDuration: number
): Map<number, number> {
    const states = new Map<number, number>();
    for (const note of notes) {
        if (targetTime < note.startSeconds || targetTime > note.endSeconds + releaseDuration) continue;
        const intensity =
            targetTime < note.endSeconds ? 1 : 1 - fadeProgress(targetTime - note.endSeconds, releaseDuration);
        const pc = pitchClass(note.note);
        states.set(pc, Math.max(states.get(pc) ?? 0, intensity));
    }
    return states;
}

class DingerboxCircleElement extends CallbackElementRenderer {
    constructor(id = 'dingerbox-circle', config: Record<string, unknown> = {}) {
        super('dingerbox-circle', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Dingerbox Circle',
                description: 'A minimal circle of fifths that highlights active MIDI notes.',
                category: 'us.maok.circleoffifths',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track'),
                            prop.select('noteSpelling', 'Accidental Style', 'sharps', [
                                { value: 'sharps', label: 'Sharps (C#)' },
                                { value: 'flats', label: 'Flats (Db)' },
                            ]),
                            prop.select('topPitchClass', 'Top Note', '0', PITCH_CLASS_OPTIONS, {
                                description: 'The selected note is placed at the top of the circle.',
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
                            prop.number('radius', 'Circle Radius (px)', 180, { min: 40, max: 1000, step: 1 }),
                            prop.number('nodeRadius', 'Note Circle Radius (px)', 24, { min: 4, max: 160, step: 1 }),
                            prop.number('strokeWidth', 'Stroke Width (px)', 2, { min: 1, max: 20, step: 1 }),
                        ],
                    },
                    {
                        id: 'style',
                        label: 'Style',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('idleColor', 'Idle Stroke & Text', '#D1D5DBFF'),
                            prop.colorAlpha('activeColor', 'Active Fill & Stroke', '#000000FF'),
                            prop.colorAlpha('activeTextColor', 'Active Text', '#FFFFFFFF'),
                            prop.number('polygonWidth', 'Polygon Stroke Width (px)', 2, {
                                min: 1,
                                max: 20,
                                step: 1,
                            }),
                            prop.font('labelFontFamily', 'Label Font', 'Inter'),
                            prop.number('labelSize', 'Label Size (px)', 18, { min: 6, max: 120, step: 1 }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.number('releaseDuration', 'Note-off Fade (s)', 0.35, {
                                min: 0,
                                max: 5,
                                step: 0.01,
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

        const radius = props.radius as number;
        const nodeRadius = props.nodeRadius as number;
        const strokeWidth = props.strokeWidth as number;
        const releaseDuration = props.releaseDuration as number;
        const idleColor = props.idleColor as string;
        const activeColor = props.activeColor as string;
        const activeTextColor = props.activeTextColor as string;
        const circleOfFifths = circleOfFifthsFrom(Number(props.topPitchClass ?? 0));
        const noteNames = props.noteSpelling === 'flats' ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
        const extent = radius + nodeRadius + strokeWidth + 2;
        const objects: RenderObject[] = [
            new Rectangle(-extent, -extent, extent * 2, extent * 2, { fillColor: '#00000000' }).setLayoutParticipation(
                'include'
            ),
        ];

        const notesResult = props.midiTrackId
            ? this.context.timeline?.selectNotes({
                  trackIds: [props.midiTrackId as string],
                  startSeconds: targetTime - releaseDuration,
                  endSeconds: targetTime + 0.001,
              })
            : undefined;
        const noteStates = notesResult?.ok ? activePitchClasses(notesResult.value, targetTime, releaseDuration) : new Map();
        const livePitchClasses = new Set<number>();
        if (notesResult?.ok) {
            for (const note of notesResult.value) {
                if (note.startSeconds <= targetTime && targetTime < note.endSeconds) livePitchClasses.add(pitchClass(note.note));
            }
        }

        const points: Point[] = circleOfFifths.map((pitch, index) => {
            const angle = -Math.PI / 2 + (index * TAU) / circleOfFifths.length;
            return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        });

        // Arc segments leave clear space for each note circle while visually joining
        // every node into one ring.
        const angularGap = Math.min(
            (TAU / points.length) * 0.45,
            Math.asin(Math.min(0.95, (nodeRadius + strokeWidth) / radius))
        );
        for (let index = 0; index < points.length; index += 1) {
            const centreAngle = -Math.PI / 2 + (index * TAU) / points.length;
            objects.push(
                excludeFromLayout(
                    new Arc(0, 0, radius, {
                        startAngle: centreAngle + angularGap,
                        endAngle: centreAngle + TAU / points.length - angularGap,
                        fillColor: null,
                        strokeColor: idleColor,
                        strokeWidth,
                    })
                )
            );
        }

        // circleOfFifths already orders points around the perimeter, producing a
        // simple (non-self-intersecting) polygon for every simultaneous chord.
        const livePoints = circleOfFifths.flatMap((pitch, index) =>
            livePitchClasses.has(pitch) ? [points[index]] : []
        );
        if (livePoints.length === 2) {
            objects.push(
                excludeFromLayout(
                    new Line(livePoints[0].x, livePoints[0].y, livePoints[1].x, livePoints[1].y, {
                        color: activeColor,
                        lineWidth: props.polygonWidth as number,
                    })
                )
            );
        } else if (livePoints.length > 2) {
            objects.push(
                excludeFromLayout(
                    new Poly(livePoints, {
                        fillColor: '#00000000',
                        strokeColor: activeColor,
                        strokeWidth: props.polygonWidth as number,
                    }).setClosed(true)
                )
            );
        }

        const fontSelection = (props.labelFontFamily as string | undefined) ?? 'Inter';
        const { family, weight } = parseFontSelection(fontSelection);
        const fontWeight = (weight || '400').toString();
        if (family) ensureFontLoaded(family, fontWeight);
        const font = `${fontWeight} ${props.labelSize as number}px ${family || 'Inter'}, sans-serif`;

        circleOfFifths.forEach((pitch, index) => {
            const state = noteStates.get(pitch) ?? 0;
            const point = points[index];
            const node = excludeFromLayout(
                new Arc(point.x, point.y, nodeRadius, {
                    fillColor: blendColor(activeColor, activeColor, state, true),
                    strokeColor: blendColor(idleColor, activeColor, state),
                    strokeWidth,
                })
            );
            objects.push(node);

            const label = excludeFromLayout(
                new Text(point.x, point.y + 1, noteNames[pitch], font, {
                    color: blendColor(idleColor, activeTextColor, state),
                    align: 'center',
                    baseline: 'middle',
                })
            );
            objects.push(label);
        });

        return objects;
    }
}

export const dingerboxCircle = defineRendererElement(
    { type: 'dingerbox-circle', capabilities: { required: ['timeline.read', 'midi.utils'], optional: [] } },
    DingerboxCircleElement
);

export default dingerboxCircle;
