import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import { PixelGrid } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import { parseHex6, BAYER4 } from './pixel-buffer';
import * as af from '@mvmnt-app/plugin-sdk/animation';
import alea from 'seedrandom';

// ── Types ────────────────────────────────────────────────────────────────────

/** Flat Float32Array of size rows×cols, values in [0, 1]. Row-major order. */
export type IntensityMatrix = Float32Array;

/** Per-note data passed into each contribution stub. */
export interface NoteRenderInfo {
    /** Note's current column position (float). */
    col: number;
    /** Note's pitch row (0 = top, rows−1 = bottom). */
    row: number;
    /** Seconds since the note crossed the playhead (negative = still approaching). */
    elapsed: number;
    /** MIDI note number. */
    note: number;
    /** MIDI velocity [0–127]. */
    velocity: number;
}

// ── Palette definitions ──────────────────────────────────────────────────────

const NAMED_PALETTES: Record<string, readonly string[]> = {
    seafoam: ['#2D505A', '#439B87', '#6EE4E3', '#EEF2A9'],
    sakura: ['#2A1A2E', '#7B3F6E', '#E85D75', '#FFD6E0'],
    lemon: ['#1A2A1A', '#3D7A3D', '#A8D84A', '#FFFFF0'],
    dusk: ['#1A0D2E', '#4A1A6E', '#CC44CC', '#FFE04A'],
};

// ── Ripple shape functions ────────────────────────────────────────────────────
// Each returns the distance from point (x, y) to the ideal ring of the given radius.
// Lower distance = more intense pixel. Feed into distToIntensity().

const SQRT1_2 = Math.SQRT1_2;

/** Square (diamond-outline) ripple. */
function squareRipple(radius: number, x: number, y: number): number {
    return Math.abs(radius - Math.max(Math.abs(x), Math.abs(y)));
}

/** Euclidean circle ripple. */
function circleRipple(radius: number, x: number, y: number): number {
    return Math.abs(radius - Math.sqrt(x * x + y * y));
}

/** Manhattan / L1 diamond ripple (axis-aligned diamond outline). */
function diamondRipple(radius: number, x: number, y: number): number {
    return Math.abs(radius - (Math.abs(x) + Math.abs(y)));
}

/** Plus / cross ripple — ring along the cardinal axes. */
function plusRipple(radius: number, x: number, y: number): number {
    const dH = Math.max(Math.abs(Math.abs(x) - radius), Math.abs(y));
    const dV = Math.max(Math.abs(Math.abs(y) - radius), Math.abs(x));
    return Math.min(dH, dV);
}

const RIPPLE_SHAPES: Record<string, (radius: number, x: number, y: number) => number> = {
    square: squareRipple,
    circle: circleRipple,
    diamond: diamondRipple,
    plus: plusRipple,
};

function distToIntensity(dist: number, thickness: number): number {
    return af.clamp(1 - dist / thickness, 0, 1);
}

// ── Intensity → pixel rendering ───────────────────────────────────────────────

/**
 * Converts an intensity matrix to RGBA pixel data using 5-level ordered dithering.
 *
 * Levels: 0 = transparent, 1–4 = palette[0..3] (darkest → brightest).
 * The Bayer 4×4 threshold creates smooth dithered gradients between levels.
 */
function intensityToPixels(
    matrix: IntensityMatrix,
    cols: number,
    rows: number,
    palette: readonly [number, number, number][]
): Uint8ClampedArray {
    const numLevels = palette.length; // 4 visible levels + transparent = 5 total
    const out = new Uint8ClampedArray(cols * rows * 4);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = matrix[r * cols + c];
            if (v <= 0) continue;
            const bayer = BAYER4[r & 3][c & 3];
            const level = Math.min(numLevels, Math.floor(v * numLevels + bayer));
            if (level === 0) continue;
            const [pr, pg, pb] = palette[level - 1];
            const idx = (r * cols + c) * 4;
            out[idx] = pr;
            out[idx + 1] = pg;
            out[idx + 2] = pb;
            out[idx + 3] = 255;
        }
    }
    return out;
}

// ── Element ──────────────────────────────────────────────────────────────────

class AmurulikePianorollElement extends CallbackElementRenderer {
    private _grid: PixelGrid | null = null;
    private _gridCols = 0;
    private _gridRows = 0;
    private _gridCellSize = 0;
    private _matrix: IntensityMatrix | null = null;

    constructor(id: string = 'amurulike-pianoroll', config: Record<string, unknown> = {}) {
        super('amurulike-pianoroll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Amurulike Pianoroll',
                description:
                    'Pixel-art piano roll with projectile notes and ripple effects. Inspired by @amuru_chiptune',
                category: 'us.maok.pixelperfect',
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
                        label: 'Layout & Range',
                        collapsed: false,
                        properties: [
                            prop.number('cols', 'Grid Columns', 160, { min: 40, max: 400, step: 1 }),
                            prop.number('rows', 'Grid Rows', 90, { min: 20, max: 200, step: 1 }),
                            prop.number('cellSize', 'Cell Size (px)', 6, { min: 1, max: 32, step: 1 }),
                            prop.number('paddingRows', 'Padding Rows', 10, {
                                min: 0,
                                max: 40,
                                step: 1,
                            }),
                            prop.number('minNote', 'Min MIDI Note', 36, { min: 0, max: 127, step: 1 }),
                            prop.number('maxNote', 'Max MIDI Note', 84, { min: 0, max: 127, step: 1 }),
                            prop.number('windowDuration', 'Time Window (s)', 4, { min: 0.5, max: 20, step: 0.5 }),
                            prop.number('playheadFraction', 'Playhead Position', 0.3, {
                                min: 0.05,
                                max: 0.95,
                                step: 0.01,
                            }),
                            prop.number('postHitSlowFactor', 'Post-Hit Slow Factor', 0.2, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'palette',
                        label: 'Palette',
                        collapsed: false,
                        properties: [
                            prop.blendMode(),
                            prop.select('palette', 'Palette', 'seafoam', [
                                { value: 'seafoam', label: 'Sea Foam' },
                                { value: 'sakura', label: 'Sakura' },
                                { value: 'lemon', label: 'Lemon' },
                                { value: 'dusk', label: 'Dusk' },
                                { value: 'custom', label: 'Custom' },
                            ]),
                            prop.color('customColor0', 'Color 0 (Dim)', '#2D505A', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor1', 'Color 1', '#439B87', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor2', 'Color 2', '#6EE4E3', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor3', 'Color 3 (Bright)', '#EEF2A9', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                        ],
                    },
                    {
                        id: 'noteHead',
                        label: 'Note Head',
                        collapsed: false,
                        properties: [
                            prop.number('fadeOutDuration', 'Fade Out Duration (s)', 10, {
                                min: 0.1,
                                max: 30,
                                step: 0.1,
                            }),
                            prop.boolean('headVelIntensity', 'vel>intensity', false),
                        ],
                    },
                    {
                        id: 'tail',
                        label: 'Tail',
                        collapsed: false,
                        properties: [
                            prop.number('tailLength', 'Tail Length (cols)', 8, { min: 0, max: 80, step: 1 }),
                            prop.number('tailWidth', 'Tail Width (rows)', 4, { min: 0, max: 20, step: 1 }),
                            prop.number('exhaustSpeed', 'Exhaust Speed', 8, { min: 0.1, max: 40, step: 0.1 }),
                            prop.number('tailFadeStagger', 'Tail Fade Stagger (s)', 5, {
                                min: 0,
                                max: 20,
                                step: 0.1,
                            }),
                            prop.boolean('tailVelIntensity', 'vel>intensity', false),
                            prop.boolean('tailVelLength', 'vel>length', false),
                        ],
                    },
                    {
                        id: 'ripple',
                        label: 'Ripple',
                        collapsed: false,
                        properties: [
                            prop.select('rippleShape', 'Ripple Shape', 'diamond', [
                                { value: 'square', label: 'Square' },
                                { value: 'circle', label: 'Circle' },
                                { value: 'diamond', label: 'Diamond' },
                                { value: 'plus', label: 'Plus' },
                            ]),
                            prop.number('rippleSize', 'Ripple Size (cols)', 10, { min: 1, max: 60, step: 1 }),
                            prop.number('rippleThickness', 'Ripple Thickness', 4, { min: 1, max: 20, step: 1 }),
                            prop.number('rippleTime', 'Ripple Duration (s)', 1, { min: 0.1, max: 5, step: 0.05 }),
                            prop.boolean('rippleVelIntensity', 'vel>intensity', false),
                            prop.boolean('rippleVelSize', 'vel>size', false),
                        ],
                    },
                ]),
            ]
        );
    }

    // ── Intensity matrix helpers ──────────────────────────────────────────────

    /**
     * Write an intensity value at (col, row), keeping the maximum of the old
     * and new value. Fractional coordinates are rounded; out-of-bounds are ignored.
     */
    protected _writeIntensity(
        matrix: IntensityMatrix,
        cols: number,
        rows: number,
        col: number,
        row: number,
        value: number
    ): void {
        const c = Math.round(col);
        const r = Math.round(row);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return;
        const idx = r * cols + c;
        matrix[idx] = Math.max(matrix[idx], value);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const cols = Math.max(1, Math.round(p.cols as number));
        const rows = Math.max(1, Math.round(p.rows as number));
        const cellSize = Math.max(1, Math.round(p.cellSize as number));
        const blendMode = ((p.blendMode as string) ?? 'source-over') as GlobalCompositeOperation;
        const paddingRows = Math.max(0, Math.round(p.paddingRows as number));
        const minNote = Math.max(0, Math.min(127, Math.round(p.minNote as number)));
        const maxNote = Math.max(0, Math.min(127, Math.round(p.maxNote as number)));
        const noteRange = Math.max(1, maxNote - minNote);
        const windowDuration = Math.max(0.1, p.windowDuration as number);
        const playheadFraction = Math.max(0.01, Math.min(0.99, p.playheadFraction as number));
        const playheadCol = Math.round(cols * playheadFraction);
        const maxColsPerSec = cols / windowDuration;
        const postHitSlowFactor = Math.max(0, Math.min(1, p.postHitSlowFactor as number));

        // Note appearance
        const fadeOutDuration = Math.max(0.1, p.fadeOutDuration as number);
        const headVelIntensity = p.headVelIntensity as boolean;

        // Tail
        const tailLength = Math.max(0, Math.round(p.tailLength as number));
        const tailWidth = Math.max(0, p.tailWidth as number);
        const exhaustSpeed = Math.max(0.1, p.exhaustSpeed as number);
        const tailFadeStagger = Math.max(0, p.tailFadeStagger as number);
        const tailVelIntensity = p.tailVelIntensity as boolean;
        const tailVelLength = p.tailVelLength as boolean;

        // Ripple
        const rippleShape = RIPPLE_SHAPES[(p.rippleShape as string) ?? 'square'] ?? squareRipple;
        const rippleSize = Math.max(1, p.rippleSize as number);
        const rippleThickness = Math.max(1, p.rippleThickness as number);
        const rippleTime = Math.max(0.1, p.rippleTime as number);
        const rippleVelIntensity = p.rippleVelIntensity as boolean;
        const rippleVelSize = p.rippleVelSize as boolean;
        const probeRadius = Math.ceil(rippleSize + rippleThickness) * 1.5;

        // ── Palette ──────────────────────────────────────────────────────────
        const paletteHex =
            (p.palette as string) === 'custom'
                ? [
                      (p.customColor0 as string) ?? '#2D505A',
                      (p.customColor1 as string) ?? '#439B87',
                      (p.customColor2 as string) ?? '#6EE4E3',
                      (p.customColor3 as string) ?? '#EEF2A9',
                  ]
                : [...(NAMED_PALETTES[p.palette as string] ?? NAMED_PALETTES.seafoam)];

        const palette = paletteHex.map(parseHex6) as [number, number, number][];

        // ── Intensity matrix ─────────────────────────────────────────────────
        const matSize = cols * rows;
        if (!this._matrix || this._matrix.length !== matSize) {
            this._matrix = new Float32Array(matSize);
        } else {
            this._matrix.fill(0);
        }
        const matrix = this._matrix;

        // ── Shared curves (allocated once per frame, not per note) ────────────
        const tailTaper = new af.FloatCurve([
            [0, 0, af.easings.linear],
            [1, 1, af.easings.linear],
        ]);

        const tailIntensityCurve = new af.FloatCurve([
            [0, 0.5, af.easings.linear],
            [0.9, 0.25, af.easings.linear],
            [1, 0, af.easings.linear],
        ]);

        const radiusTimeCurve = new af.FloatCurve([
            [0, 0, af.easings.easeOutExpo],
            [1, rippleSize, af.easings.easeOutExpo],
        ]);

        const intensityTimeCurve = new af.FloatCurve([
            [0, 1, af.easings.linear],
            [1, 0, af.easings.linear],
        ]);

        // ── Build logical model and accumulate intensities ────────────────────
        if (p.midiTrackId) {
            const queryStart = targetTime - playheadFraction * windowDuration - 4;
            const queryEnd = targetTime + (1 - playheadFraction) * windowDuration;

            const notesResult = this.context.timeline?.selectNotes({
                trackIds: [p.midiTrackId as string],
                startSeconds: queryStart,
                endSeconds: queryEnd,
            });
            if (!notesResult?.ok) return [];
            const notes = notesResult.value
                .map((note) => ({ ...note, startTime: note.startSeconds, endTime: note.endSeconds }));

            notes.sort((a, b) => (a.velocity ?? 64) - (b.velocity ?? 64));

            // Usable row range after padding — notes are mapped into [paddingRows, rows-1-paddingRows]
            const rowStart = paddingRows;
            const rowSpan = Math.max(1, rows - 1 - 2 * paddingRows);

            for (const n of notes) {
                if (n.note < minNote || n.note > maxNote) continue;

                const timeToNote = n.startTime - targetTime;
                const elapsed = -timeToNote;

                const noteId = `${n.startTime}_${n.note}`;

                const colsPerSec = timeToNote >= 0 ? maxColsPerSec : maxColsPerSec * postHitSlowFactor;
                const noteCol = playheadCol + timeToNote * colsPerSec;
                const noteRow = rowStart + Math.round(((maxNote - n.note) / noteRange) * rowSpan);

                const info: NoteRenderInfo = {
                    col: noteCol,
                    row: noteRow,
                    elapsed,
                    note: n.note,
                    velocity: n.velocity ?? 64,
                };

                // ── Head ─────────────────────────────────────────────────────
                const velNorm = info.velocity / 127;
                const headIntensity =
                    elapsed >= 0 ? af.remap(0, 1, 1, 0, af.clamp((1 / fadeOutDuration) * elapsed, 0, 1)) : 1;
                this._writeIntensity(
                    matrix, cols, rows, info.col, info.row,
                    headVelIntensity ? headIntensity * velNorm : headIntensity
                );

                // ── Tail ─────────────────────────────────────────────────────
                const effectiveTailLength = tailVelLength ? Math.round(tailLength * velNorm) : tailLength;
                for (let i = 1; i < effectiveTailLength; i++) {
                    const rng = alea(`${noteId}_${Math.round(info.col) + i - Math.round(targetTime * exhaustSpeed)}`);
                    const tailProgress = i / effectiveTailLength;
                    const tailEnv = tailTaper.valAt(tailProgress) * tailWidth;
                    const tailBlockIntensity =
                        elapsed >= 0
                            ? tailIntensityCurve.valAt(af.clamp(elapsed - tailProgress * tailFadeStagger, 0, 1))
                            : 0.5;
                    this._writeIntensity(
                        matrix,
                        cols,
                        rows,
                        info.col + i,
                        info.row + Math.round(af.remap(0, 1, -1, 1, rng()) * tailEnv),
                        tailVelIntensity ? tailBlockIntensity * velNorm : tailBlockIntensity
                    );
                }

                // ── Ripple ───────────────────────────────────────────────────
                if (elapsed >= 0 && elapsed < rippleTime) {
                    const rippleProgress = elapsed / rippleTime;
                    const velSizeScale = rippleVelSize ? velNorm : 1;
                    const currentRadius = radiusTimeCurve.valAt(rippleProgress) * velSizeScale;
                    const effectiveProbeRadius = rippleVelSize
                        ? Math.ceil(currentRadius + rippleThickness) * 1.5
                        : probeRadius;
                    const ringIntensity = intensityTimeCurve.valAt(rippleProgress);
                    const effectiveRingIntensity = rippleVelIntensity ? ringIntensity * velNorm : ringIntensity;

                    for (let i = -effectiveProbeRadius; i <= effectiveProbeRadius; i++) {
                        for (let j = -effectiveProbeRadius; j <= effectiveProbeRadius; j++) {
                            this._writeIntensity(
                                matrix,
                                cols,
                                rows,
                                playheadCol + i,
                                info.row + j,
                                effectiveRingIntensity * distToIntensity(rippleShape(currentRadius, i, j), rippleThickness)
                            );
                        }
                    }
                }
            }
        }

        // ── Convert intensity matrix → RGBA via 5-level dithering ────────────
        const pixelData = intensityToPixels(matrix, cols, rows, palette);

        // ── Create / update grid render object ────────────────────────────────
        const needNew =
            !this._grid || this._gridCols !== cols || this._gridRows !== rows || this._gridCellSize !== cellSize;

        const totalW = cols * cellSize;
        const totalH = rows * cellSize;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        if (needNew) {
            this._grid = new PixelGrid(ox, oy, cols, rows, cellSize, { pixels: pixelData });
            this._gridCols = cols;
            this._gridRows = rows;
            this._gridCellSize = cellSize;
        } else {
            this._grid!.updatePixels(pixelData);
        }
        this._grid!.blendMode = blendMode !== 'source-over' ? blendMode : null;

        return [this._grid!];
    }
}

export const amurulikePianoroll = defineRendererElement({ type: 'amurulike-pianoroll', capabilities: { required: ['timeline.read'], optional: [] }, }, AmurulikePianorollElement);
export default amurulikePianoroll;
