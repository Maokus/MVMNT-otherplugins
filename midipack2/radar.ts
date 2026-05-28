// Radar — a sweeping playhead rotates around the centre. When it crosses a note's
// phase position an "X" mark appears at the corresponding pitch radius and fades out.

import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import { Arc, Line, Rectangle, Text, GlowLayer } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ── Helpers ──────────────────────────────────────────────────────────────────

function noLayout<T extends RenderObject>(obj: T): T {
    (obj as any).setIncludeInLayoutBounds?.(false);
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

function makeX(cx: number, cy: number, half: number, baseColor: string, alpha: number): RenderObject[] {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    const color = (baseColor.length >= 7 ? baseColor.slice(0, 7) : baseColor) + a;
    return [
        noLayout(new Line(cx - half, cy - half, cx + half, cy + half, color, 2)),
        noLayout(new Line(cx - half, cy + half, cx + half, cy - half, color, 2)),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────

export class RadarElement extends SceneElement {
    constructor(id: string = 'radar', config: Record<string, unknown> = {}) {
        super('radar', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Radar',
                description: 'Sweeping playhead marks note hits with X at their pitch radius.',
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
                            prop.number('radius', 'Outer Radius (px)', 200, { min: 20, step: 5 }),
                            prop.number('innerRadius', 'Inner Radius (px)', 40, { min: 5, step: 5 }),
                            prop.number('minNote', 'Min MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Lowest pitch shown. -1 = auto-detect from track.',
                            }),
                            prop.number('maxNote', 'Max MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Highest pitch shown. -1 = auto-detect from track.',
                            }),
                            prop.number('numBars', 'Bars per Revolution', 1, { min: 1, max: 16, step: 1 }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'marks',
                        label: 'X Marks',
                        collapsed: false,
                        properties: [
                            prop.select('colorMode', 'Color Mode', 'pitch', [
                                { value: 'pitch', label: 'By Pitch (Hue)' },
                                { value: 'single', label: 'Single Color' },
                            ]),
                            prop.colorAlpha('noteColor', 'Mark Color', '#FF6B6BFF', {
                                visibleWhen: [{ key: 'colorMode', equals: 'single' }],
                            }),
                            prop.number('xSize', 'Mark Size (px)', 8, { min: 2, max: 40, step: 1 }),
                            prop.number('xFadeDuration', 'Fade Duration (s)', 0.5, {
                                min: 0.05,
                                max: 5,
                                step: 0.05,
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
                            prop.boolean('showTicks', 'Show Note Ticks', true, {
                                description: 'Faint tick marks showing note positions in the current bar.',
                            }),
                            prop.colorAlpha('tickColor', 'Tick Color', '#FFFFFF30', {
                                visibleWhen: [{ key: 'showTicks', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'sweep',
                        label: 'Sweep',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('sweepColor', 'Sweep Color', '#FFFFFFFF'),
                            prop.number('bloomRadius', 'Bloom', 0, { min: 0, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        if (!p.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px sans-serif', '#94a3b8', 'left', 'top')];
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (!host.ok) return host.renderFallback();

        // ── Config ───────────────────────────────────────────────────────────
        const radius = Math.max(20, p.radius as number);
        const innerRadius = Math.max(5, Math.min(radius - 10, p.innerRadius as number));
        const numBars = Math.max(1, Math.round(p.numBars as number));
        const xFadeDuration = Math.max(0.05, p.xFadeDuration as number);
        const xHalf = Math.max(2, (p.xSize as number) / 2);
        const colorMode = p.colorMode as string;
        const noteColor = (p.noteColor as string).slice(0, 7);
        const showRing = p.showRing as boolean;
        const ringColor = p.ringColor as string;
        const showTicks = p.showTicks as boolean;
        const tickColor = p.tickColor as string;
        const sweepColor = p.sweepColor as string;
        const bloomRadius = Math.max(0, p.bloomRadius as number);

        // ── BPM / period ─────────────────────────────────────────────────────
        const snap = host.api.timeline.getStateSnapshot();
        const bpm = snap?.timeline.globalBpm ?? 120;
        const beatsPerBar = snap?.timeline.beatsPerBar ?? 4;
        const period = numBars * beatsPerBar * (60 / bpm);

        // ── Note range ───────────────────────────────────────────────────────
        const rawMin = Math.floor(p.minNote as number);
        const rawMax = Math.floor(p.maxNote as number);
        let minNote: number;
        let maxNote: number;

        if (rawMin === -1 || rawMax === -1) {
            const pitches = host.api.timeline.selectDistinctNoteNumbers({
                trackIds: [p.midiTrackId as string],
            });
            const autoMin = pitches.length > 0 ? pitches[0] : 36;
            const autoMax = pitches.length > 0 ? pitches[pitches.length - 1] : 84;
            minNote = rawMin === -1 ? autoMin : Math.max(0, Math.min(127, rawMin));
            maxNote = rawMax === -1 ? autoMax : Math.max(0, Math.min(127, rawMax));
        } else {
            minNote = Math.max(0, Math.min(127, rawMin));
            maxNote = Math.max(0, Math.min(127, rawMax));
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
                    new Arc(0, 0, midR, 0, Math.PI * 2, false, {
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
            const barNotes = host.api.timeline.selectNotesInWindow({
                trackIds: [p.midiTrackId as string],
                startSec: barStart,
                endSec: barStart + period,
            });
            for (const n of barNotes) {
                if (n.note < minNote || n.note > maxNote) continue;
                const angle = clockToRad(((n.startTime - barStart) / period) * 360);
                const r = noteRadius(n.note);
                objects.push(
                    noLayout(
                        new Arc(r * Math.cos(angle), r * Math.sin(angle), 2, 0, Math.PI * 2, false, {
                            fillColor: tickColor,
                        })
                    )
                );
            }
        }

        // ── Hit X marks ───────────────────────────────────────────────────────
        // A note shows an X if: (1) it has played (startTime <= targetTime), and
        // (2) the radar sweep most recently passed its phase within xFadeDuration.
        // timeSinceHit = (targetTime - n.startTime) mod period
        const EPS = 1e-3;
        const allPastNotes = host.api.timeline.selectNotesInWindow({
            trackIds: [p.midiTrackId as string],
            startSec: 0,
            endSec: targetTime + EPS,
        });

        for (const n of allPastNotes) {
            if (n.startTime > targetTime) continue;
            if (n.note < minNote || n.note > maxNote) continue;

            const timeSinceHit = targetTime - n.startTime;
            if (timeSinceHit > xFadeDuration) continue;

            const alpha = 1 - timeSinceHit / xFadeDuration;
            const angle = clockToRad(((n.startTime % period) / period) * 360);
            const r = noteRadius(n.note);
            const color = colorMode === 'pitch' ? pitchToColor(n.note) : noteColor;
            objects.push(...makeX(r * Math.cos(angle), r * Math.sin(angle), xHalf, color, alpha));
        }

        // ── Sweep line ────────────────────────────────────────────────────────
        objects.push(
            noLayout(
                new Line(
                    innerRadius * Math.cos(sweepAngle),
                    innerRadius * Math.sin(sweepAngle),
                    radius * Math.cos(sweepAngle),
                    radius * Math.sin(sweepAngle),
                    sweepColor,
                    2
                )
            )
        );

        // ── Layout sentinel ───────────────────────────────────────────────────
        // All other render objects opt out of layout bounds via noLayout() /
        // layoutBoundsMode: 'none', so this rectangle is the sole layout anchor.
        const d = radius + 4;
        const layoutRect = new Rectangle(-d, -d, d * 2, d * 2, null, null, 0);
        (layoutRect as any).setIncludeInLayoutBounds?.(true);

        if (bloomRadius > 0) {
            const glow = new GlowLayer({ glowBlur: bloomRadius });
            glow.addChildren(objects);
            // layoutRect must stay at the top level — GlowLayer is excluded from bounds traversal
            return [layoutRect, glow];
        }

        return [layoutRect, ...objects];
    }
}
