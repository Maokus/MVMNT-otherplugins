import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
// Radar — a sweeping playhead rotates around the centre. When it crosses a note's
// phase position a marker appears at the corresponding pitch radius and fades out.

import {
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import { Arc, Line, Rectangle, Text, GlowLayer } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import * as af from '@mvmnt-app/plugin-sdk/animation';
import { applyAnimation } from './animations';

// ── Helpers ──────────────────────────────────────────────────────────────────

function noLayout<T extends RenderObject>(obj: T): T {
    obj.setLayoutParticipation('exclude');
    return obj;
}

/** Standard math radians from clock-degrees (0 = top, clockwise). */
const clockToRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (x: number) =>
        Math.round(x * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function pitchToColor(note: number): string {
    return hslToHex(((note % 12) / 12) * 360, 75, 60);
}

function withAlpha(hex: string, alpha: number): string {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return (hex.length >= 7 ? hex.slice(0, 7) : hex) + a;
}

function makeMarker(
    cx: number,
    cy: number,
    type: string,
    customText: string,
    color: string,
    alpha: number,
    size: number
): RenderObject | null {
    if (type === 'none') return null;
    const colorA = withAlpha(color, alpha);
    let char: string;
    if (type === 'cross') char = '✕';
    else if (type === 'diamond') char = '◆';
    else if (type === 'note') char = '♪';
    else char = customText || '?';
    const fontSize = Math.max(8, Math.round(size));
    return noLayout(new Text(cx, cy, char, `bold ${fontSize}px sans-serif`, {
        color: colorA, align: 'center', baseline: 'middle',
    }));
}

function makeRipple(
    cx: number,
    cy: number,
    type: string,
    progress: number,
    rippleRadius: number,
    color: string
): RenderObject[] {
    if (type === 'none' || progress >= 1) return [];
    const alpha = Math.max(0, 1 - progress * 1.5);
    const colorA = withAlpha(color, alpha);

    if (type === 'circle') {
        const r = Math.max(1, rippleRadius * progress);
        return [
            noLayout(
                new Arc(cx, cy, r, {
                    fillColor: null,
                    strokeColor: colorA,
                    strokeWidth: 2,
                    startAngle: 0,
                    endAngle: Math.PI * 2,
                })
            ),
        ];
    }

    if (type === 'burst') {
        const numRays = 8;
        const inner = rippleRadius * 0.1;
        const outer = Math.max(inner + 1, rippleRadius * (0.1 + 0.9 * af.easings.easeOutExpo(progress)));
        const result: RenderObject[] = [];
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;
            result.push(
                noLayout(
                    new Line(
                        cx + Math.cos(angle) * inner,
                        cy + Math.sin(angle) * inner,
                        cx + Math.cos(angle) * outer,
                        cy + Math.sin(angle) * outer,
                        { color: colorA, lineWidth: 2 }
                    )
                )
            );
        }
        return result;
    }

    return [];
}

// ─────────────────────────────────────────────────────────────────────────────

class RadarElement extends CallbackElementRenderer {
    constructor(id: string = 'radar', config: Record<string, unknown> = {}) {
        super('radar', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Radar',
                description: 'Sweeping playhead marks note hits with a marker at their pitch radius.',
                category: 'us.maok.midipack2',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [prop.midiTrack('midiTrackId', 'MIDI Track')],
                    },
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('radius', 'Outer Radius (px)', 600, { min: 20, step: 5 }),
                            prop.number('innerRadius', 'Inner Radius (px)', 40, { min: 5, step: 5 }),
                            prop.boolean('autoRange', 'Auto Note Range', true, {
                                description: 'Automatically derive the note range from the track.',
                            }),
                            prop.number('minNote', 'Min MIDI Note', 36, {
                                min: 0,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'autoRange', equals: false }],
                            }),
                            prop.number('maxNote', 'Max MIDI Note', 84, {
                                min: 0,
                                max: 127,
                                step: 1,
                                visibleWhen: [{ key: 'autoRange', equals: false }],
                            }),
                            prop.number('numBars', 'Bars per Revolution', 1, { min: 1, max: 16, step: 1 }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'marker',
                        label: 'Marker',
                        collapsed: false,
                        properties: [
                            prop.select('markerType', 'Marker', 'cross', [
                                { value: 'cross', label: 'Cross' },
                                { value: 'diamond', label: 'Diamond' },
                                { value: 'note', label: 'Note' },
                                { value: 'text', label: 'Text' },
                            ]),
                            prop.string('markerText', 'Marker Text', '★', {
                                visibleWhen: [{ key: 'markerType', equals: 'text' }],
                            }),
                            prop.select('colorMode', 'Color Mode', 'pitch', [
                                { value: 'pitch', label: 'By Pitch (Hue)' },
                                { value: 'single', label: 'Single Color' },
                            ]),
                            prop.colorAlpha('noteColor', 'Mark Color', '#FF6B6BFF', {
                                visibleWhen: [{ key: 'colorMode', equals: 'single' }],
                            }),
                            prop.number('markerSize', 'Marker Size (px)', 30, { min: 4, max: 64, step: 1 }),
                            prop.number('markerDuration', 'Fade Duration (s)', 2, {
                                min: 0.05,
                                max: 5,
                                step: 0.05,
                            }),
                            prop.boolean('showTicks', 'Show Note Ticks', false, {
                                description: 'Faint tick marks showing note positions in the current bar.',
                            }),
                            prop.colorAlpha('tickColor', 'Tick Color', '#FFFFFF30', {
                                visibleWhen: [
                                    { key: 'showTicks', truthy: true },
                                    { key: 'colorMode', equals: 'single' },
                                ],
                            }),
                            prop.number('tickSize', 'Tick Size (px)', 10, {
                                min: 1,
                                step: 0.5,
                                visibleWhen: [{ key: 'showTicks', truthy: true }],
                            }),
                            prop.boolean('faceCentre', 'Face Centre', false, {
                                description: 'Rotate markers so they face the centre of the radar.',
                            }),
                        ],
                    },
                    {
                        id: 'ring',
                        label: 'Ring',
                        collapsed: false,
                        properties: [
                            prop.boolean('showRing', 'Show Background Ring', true),
                            prop.colorAlpha('ringColor', 'Ring Color', '#FFFFFF18'),
                        ],
                    },
                    {
                        id: 'playhead',
                        label: 'Playhead',
                        collapsed: false,
                        properties: [prop.colorAlpha('sweepColor', 'Playhead Color', '#FFFFFFFF')],
                    },
                    {
                        id: 'ripple',
                        label: 'Ripple',
                        collapsed: false,
                        properties: [
                            prop.select('rippleType', 'Ripple', 'circle', [
                                { value: 'none', label: 'None' },
                                { value: 'circle', label: 'Circle' },
                                { value: 'burst', label: 'Burst' },
                            ]),
                            prop.number('rippleRadius', 'Ripple Radius (px)', 120, {
                                min: 5,
                                step: 1,
                                visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                            }),
                            prop.colorAlpha('rippleColor', 'Ripple Color', '#FFFFFFFF', {
                                visibleWhen: [
                                    { key: 'rippleType', notEquals: 'none' },
                                    { key: 'colorMode', equals: 'single' },
                                ],
                            }),
                            prop.number('rippleDuration', 'Ripple Duration (s)', 2, {
                                min: 0.05,
                                max: 5,
                                step: 0.05,
                                visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                            }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.select('animationType', 'Animation', 'bounce', [
                                { value: 'none', label: 'None' },
                                { value: 'bounce', label: 'Bounce' },
                                { value: 'jump', label: 'Jump' },
                            ]),
                            prop.number('animDuration', 'Duration (s)', 0.5, {
                                min: 0.01,
                                step: 0.01,
                                visibleWhen: [{ key: 'animationType', notEquals: 'none' }],
                            }),
                            prop.number('animAmount', 'Scale', 5, {
                                min: 0,
                                step: 0.5,
                                visibleWhen: [{ key: 'animationType', notEquals: 'none' }],
                            }),
                        ],
                    },
                    {
                        id: 'bloom',
                        label: 'Bloom',
                        collapsed: true,
                        properties: [prop.number('bloomRadius', 'Bloom', 0, { min: 0, step: 1 })],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        if (!p.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px sans-serif', {
                color: '#94a3b8', align: 'left', baseline: 'top',
            })];
        }

        const timeline = this.context.timeline;
        if (!timeline) return [];

        // ── Config ───────────────────────────────────────────────────────────
        const radius = Math.max(20, p.radius as number);
        const innerRadius = Math.max(5, Math.min(radius - 10, p.innerRadius as number));
        const numBars = Math.max(1, Math.round(p.numBars as number));
        const markerDuration = Math.max(0.05, p.markerDuration as number);
        const markerSize = Math.max(4, p.markerSize as number);
        const markerType = p.markerType as string;
        const markerText = String(p.markerText ?? '★');
        const colorMode = p.colorMode as string;
        const noteColor = (p.noteColor as string).slice(0, 7);
        const showRing = p.showRing as boolean;
        const ringColor = p.ringColor as string;
        const showTicks = p.showTicks as boolean;
        const tickColor = p.tickColor as string;
        const tickSize = Math.max(1, (p.tickSize as number) ?? 2);
        const sweepColor = p.sweepColor as string;
        const bloomRadius = Math.max(0, p.bloomRadius as number);
        const rippleType = p.rippleType as string;
        const rippleRadius = Math.max(5, (p.rippleRadius as number) ?? 30);
        const rippleColor = (p.rippleColor as string) ?? '#FFFFFFFF';
        const rippleDuration = Math.max(0.05, (p.rippleDuration as number) ?? 0.5);
        const animationType = p.animationType as string;
        const animDuration = (p.animDuration as number) ?? 0.3;
        const animAmount = (p.animAmount as number) ?? 10;
        const faceCentre = p.faceCentre as boolean;

        // ── BPM / period ─────────────────────────────────────────────────────
        const metadata = timeline.getMetadata();
        const bpm = metadata.ok ? metadata.value.tempoBpm : 120;
        const beatsPerBar = metadata.ok ? metadata.value.timeSignature.numerator : 4;
        const period = numBars * beatsPerBar * (60 / bpm);

        // ── Note range ───────────────────────────────────────────────────────
        let minNote: number;
        let maxNote: number;

        if (p.autoRange as boolean) {
            const selected = timeline.selectNotes({
                trackIds: [p.midiTrackId as string],
                startSeconds: 0,
                endSeconds: metadata.ok ? metadata.value.durationSeconds : 86400,
            });
            const pitches = selected.ok
                ? [...new Set(selected.value.map((note) => note.note))].sort((a, b) => a - b)
                : [];
            minNote = pitches.length > 0 ? pitches[0] : 36;
            maxNote = pitches.length > 0 ? pitches[pitches.length - 1] : 84;
        } else {
            minNote = Math.max(0, Math.min(127, Math.floor(p.minNote as number)));
            maxNote = Math.max(0, Math.min(127, Math.floor(p.maxNote as number)));
        }
        if (maxNote <= minNote) maxNote = minNote + 1;

        const radialSpan = radius - innerRadius;
        const noteRadius = (note: number) => innerRadius + ((note - minNote) / (maxNote - minNote + 1)) * radialSpan;

        // ── Sweep angle (clock-degrees → radians) ─────────────────────────────
        const sweepAngle = clockToRad(((targetTime % period) / period) * 360);

        const objects: RenderObject[] = [];

        // ── Background ring ───────────────────────────────────────────────────
        if (showRing) {
            const midR = (innerRadius + radius) / 2;
            objects.push(
                noLayout(
                    new Arc(0, 0, midR, {
                        startAngle: 0,
                        endAngle: Math.PI * 2,
                        fillColor: null,
                        strokeColor: ringColor,
                        strokeWidth: radialSpan,
                    })
                )
            );
        }

        // ── Static tick marks (notes in the current bar) ──────────────────────
        if (showTicks) {
            const barStart = Math.floor(targetTime / period) * period;
            const selected = timeline.selectNotes({
                trackIds: [p.midiTrackId as string],
                startSeconds: barStart,
                endSeconds: barStart + period,
            });
            const barNotes = selected.ok ? selected.value : [];
            for (const n of barNotes) {
                if (n.note < minNote || n.note > maxNote) continue;
                const angle = clockToRad(((n.startSeconds - barStart) / period) * 360);
                const r = noteRadius(n.note);
                const tColor = colorMode === 'pitch' ? withAlpha(pitchToColor(n.note), 0.5) : tickColor;
                objects.push(
                    noLayout(
                        new Arc(r * Math.cos(angle), r * Math.sin(angle), tickSize, {
                            startAngle: 0,
                            endAngle: Math.PI * 2,
                            fillColor: tColor,
                        })
                    )
                );
            }
        }

        // ── Hit markers & effects ─────────────────────────────────────────────
        const maxEffectDuration = rippleType !== 'none' ? Math.max(markerDuration, rippleDuration) : markerDuration;
        const EPS = 1e-3;
        const selectedPast = timeline.selectNotes({
            trackIds: [p.midiTrackId as string],
            startSeconds: 0,
            endSeconds: targetTime + EPS,
        });
        const allPastNotes = selectedPast.ok ? selectedPast.value : [];

        for (const n of allPastNotes) {
            if (n.startSeconds > targetTime) continue;
            if (n.note < minNote || n.note > maxNote) continue;

            const timeSinceHit = targetTime - n.startSeconds;
            if (timeSinceHit > maxEffectDuration) continue;

            const angle = clockToRad(((n.startSeconds % period) / period) * 360);
            const r = noteRadius(n.note);
            const cx = r * Math.cos(angle);
            const cy = r * Math.sin(angle);
            const color = colorMode === 'pitch' ? pitchToColor(n.note) : noteColor;

            if (timeSinceHit <= markerDuration) {
                const alpha = 1 - timeSinceHit / markerDuration;
                const marker = makeMarker(cx, cy, markerType, markerText, color, alpha, markerSize);
                if (marker) {
                    if (faceCentre) {
                        marker.rotation = angle + Math.PI;
                    }
                    if (animationType !== 'none') {
                        applyAnimation(marker, animationType, timeSinceHit, null, animDuration, animAmount);
                    }
                    objects.push(marker);
                }
            }

            if (rippleType !== 'none' && timeSinceHit <= rippleDuration) {
                const rawProgress = timeSinceHit / rippleDuration;
                const progress = af.easings.easeOutExpo(rawProgress);
                const rColor = colorMode === 'pitch' ? pitchToColor(n.note) : rippleColor;
                objects.push(...makeRipple(cx, cy, rippleType, progress, rippleRadius, rColor));
            }
        }

        // ── Sweep line ────────────────────────────────────────────────────────
        objects.push(
            noLayout(
                new Line(
                    innerRadius * Math.cos(sweepAngle),
                    innerRadius * Math.sin(sweepAngle),
                    radius * Math.cos(sweepAngle),
                    radius * Math.sin(sweepAngle),
                    { color: sweepColor, lineWidth: 2 }
                )
            )
        );

        // ── Layout sentinel ───────────────────────────────────────────────────
        const d = radius + 4;
        const layoutRect = new Rectangle(-d, -d, d * 2, d * 2, { fillColor: null });
        layoutRect.setLayoutParticipation('include');

        if (bloomRadius > 0) {
            const glow = new GlowLayer({ glowBlur: bloomRadius });
            glow.addChildren(objects);
            return [layoutRect, glow];
        }

        return [layoutRect, ...objects];
    }
}

export const radar = defineRendererElement({ type: 'radar', capabilities: { required: ['timeline.read'], optional: [] }, }, RadarElement);
export default radar;
