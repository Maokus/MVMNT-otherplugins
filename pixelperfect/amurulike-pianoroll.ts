import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    timeToTicks,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import { PixelGrid } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';
import { parseHex6, BAYER4 } from './pixel-buffer';
import * as af from '@mvmnt/plugin-sdk/animation';
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

export class AmurulikePianorollElement extends SceneElement {
    private _grid: PixelGrid | null = null;
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

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const cols = Math.max(1, Math.round(p.cols as number));
        const rows = Math.max(1, Math.round(p.rows as number));
        const cellSize = Math.max(1, Math.round(p.cellSize as number));
        const minNote = Math.max(0, Math.min(127, Math.round(p.minNote as number)));
        const maxNote = Math.max(0, Math.min(127, Math.round(p.maxNote as number)));
        const noteRange = Math.max(1, maxNote - minNote);
        const windowDuration = Math.max(0.1, p.windowDuration as number);
        const playheadFraction = Math.max(0.01, Math.min(0.99, p.playheadFraction as number));
        const playheadCol = Math.round(cols * playheadFraction);
        const maxColsPerSec = cols / windowDuration;
        const postHitSlowFactor = Math.max(0, Math.min(1, p.postHitSlowFactor as number));

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

        // ── Build logical model and accumulate intensities ────────────────────
        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (!host.ok) return host.renderFallback();

        if (p.midiTrackId) {
            const queryStart = targetTime - playheadFraction * windowDuration - 4;
            const queryEnd = targetTime + (1 - playheadFraction) * windowDuration;

            const notes = host.api.timeline.selectNotesInWindow({
                trackIds: [p.midiTrackId as string],
                startSec: queryStart,
                endSec: queryEnd,
            });

            notes.sort((a, b) => (a.velocity ?? 64) - (b.velocity ?? 64));

            for (const n of notes) {
                if (n.note < minNote || n.note > maxNote) continue;

                const timeToNote = n.startTime - targetTime;
                const elapsed = -timeToNote;

                let noteId = `${n.startTime}_${n.note}`;

                let colsPerSec = timeToNote >= 0 ? maxColsPerSec : maxColsPerSec * postHitSlowFactor;

                // Before playhead: travel at colsPerSec. After: slow by postHitSlowFactor.
                const noteCol = playheadCol + timeToNote * colsPerSec;

                const noteRow = Math.round(((maxNote - n.note) / noteRange) * (rows - 1));

                const info: NoteRenderInfo = {
                    col: noteCol,
                    row: noteRow,
                    elapsed,
                    note: n.note,
                    velocity: n.velocity ?? 64,
                };

                // Draw Head
                let fadeOutDuration = 10;

                let headIntensity =
                    elapsed >= 0 ? af.remap(0, 1, 1, 0, af.clamp(1 / fadeOutDuration, 0, 1) * elapsed) : 1;
                this._writeIntensity(matrix, cols, rows, info.col, info.row, headIntensity);

                // Draw Tail
                let exhaustSpeed = 8;
                let tailLengthFactor = 0.2;
                let tailWidth = 4;
                let tailFadeStagger = 5;

                let tailTaper = new af.FloatCurve([
                    [0, 0, af.easings.linear],
                    [1, 1, af.easings.linear],
                ]);

                let tailIntensityCurve = new af.FloatCurve([
                    [0, 0.5, af.easings.linear],
                    [0.9, 0.25, af.easings.linear],
                    [1, 0, af.easings.linear],
                ]);

                for (let i = 1; i < maxColsPerSec * tailLengthFactor; i++) {
                    let rng = alea(`${noteId}_${Math.round(info.col) + i - Math.round(targetTime * exhaustSpeed)}`);
                    let tailProgress = i / (maxColsPerSec * tailLengthFactor);
                    let tailEnv = tailTaper.valAt(tailProgress) * tailWidth;
                    let tailBlockIntensity =
                        elapsed >= 0
                            ? tailIntensityCurve.valAt(af.clamp(elapsed - tailProgress * tailFadeStagger, 0, 1))
                            : 0.5;
                    this._writeIntensity(
                        matrix,
                        cols,
                        rows,
                        info.col + i,
                        info.row + Math.round(af.remap(0, 1, -1, 1, rng()) * tailEnv),
                        tailBlockIntensity
                    );
                }

                // Draw Ripple
                const rippleThickness = 4;
                let rippleSize = 16;
                let probeRadius = 20;
                let rippleTime = 1;

                let rippleProgress = elapsed / rippleTime;

                let radiusTimeCurve = new af.FloatCurve([
                    [0, 0, af.easings.easeOutExpo],
                    [1, rippleSize, af.easings.easeOutExpo],
                ]);

                let intensityTimeCurve = new af.FloatCurve([
                    [0, 1, af.easings.linear],
                    [1, 0, af.easings.linear],
                ]);

                function rot45(x: number, y: number): [number, number] {
                    const cos45 = Math.cos(Math.PI / 4);
                    const sin45 = Math.sin(Math.PI / 4);
                    return [x * cos45 - y * sin45, x * sin45 + y * cos45];
                }

                function squareFunct(length: number, x: number, y: number) {
                    let newXY = rot45(x, y);
                    return Math.abs(length / 2 - Math.max(Math.abs(newXY[0]), Math.abs(newXY[1])));
                }

                function distToIntensity(dist: number, thickness: number) {
                    return af.clamp(1 - dist / thickness, 0, 1);
                }

                if (elapsed >= 0 && elapsed < rippleTime) {
                    for (let i = -probeRadius; i <= probeRadius; i++) {
                        for (let j = -probeRadius; j <= probeRadius; j++) {
                            this._writeIntensity(
                                matrix,
                                cols,
                                rows,
                                playheadCol + i,
                                info.row + j,
                                intensityTimeCurve.valAt(rippleProgress) *
                                    distToIntensity(
                                        squareFunct(radiusTimeCurve.valAt(rippleProgress), i, j),
                                        rippleThickness
                                    )
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
            !this._grid || this._grid.cols !== cols || this._grid.rows !== rows || this._grid.width !== cols * cellSize;

        const totalW = cols * cellSize;
        const totalH = rows * cellSize;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        if (needNew) {
            this._grid = new PixelGrid(ox, oy, cols, rows, cellSize, { pixels: pixelData });
        } else {
            this._grid!.updatePixels(pixelData);
        }

        return [this._grid!];
    }
}
