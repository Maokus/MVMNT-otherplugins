import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import { BoxRenderObject, type RenderConfig } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ── Bayer 4×4 ordered dither matrix (normalised to [0, 1)) ───────────────────
const BAYER4: readonly (readonly number[])[] = [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

// ── Palette definitions ──────────────────────────────────────────────────────
// Index 0: background, 1: tail, 2: note head, 3: ripple/accent
const NAMED_PALETTES: Record<string, readonly string[]> = {
    seafoam: ['#2D505A', '#439B87', '#6EE4E3', '#EEF2A9'],
    sakura: ['#2A1A2E', '#7B3F6E', '#E85D75', '#FFD6E0'],
    lemon: ['#1A2A1A', '#3D7A3D', '#A8D84A', '#FFFFF0'],
    dusk: ['#1A0D2E', '#4A1A6E', '#CC44CC', '#FFE04A'],
};

function parseHex6(hex: string): [number, number, number] {
    const c = hex.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// ── Pixel grid render object ─────────────────────────────────────────────────
class PixelGridRenderer extends BoxRenderObject {
    readonly cols: number;
    readonly rows: number;
    readonly cellSize: number;
    private _off: OffscreenCanvas;
    private _ctx: OffscreenCanvasRenderingContext2D;
    private _img: ImageData;

    constructor(x: number, y: number, cols: number, rows: number, cellSize: number, pixels: Uint8ClampedArray) {
        super(x, y, cols * cellSize, rows * cellSize);
        this.cols = cols;
        this.rows = rows;
        this.cellSize = cellSize;
        this._off = new OffscreenCanvas(cols, rows);
        this._ctx = this._off.getContext('2d')!;
        this._img = new ImageData(cols, rows);
        this.updatePixels(pixels);
    }

    updatePixels(pixels: Uint8ClampedArray): void {
        this._img.data.set(pixels);
        this._ctx.putImageData(this._img, 0, 0);
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        const prev = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._off, 0, 0, this.width, this.height);
        ctx.imageSmoothingEnabled = prev;
    }
}

// ── Element ──────────────────────────────────────────────────────────────────
export class AmurulikePianorollElement extends SceneElement {
    private _grid: PixelGridRenderer | null = null;

    constructor(id: string = 'amurulike-pianoroll', config: Record<string, unknown> = {}) {
        super('amurulike-pianoroll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Amurulike Pianoroll',
                description: 'Pixel-art piano roll with projectile notes and ripple effects.',
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
                        ],
                    },
                    {
                        id: 'behavior',
                        label: 'Behavior',
                        collapsed: false,
                        properties: [
                            prop.number('tailLength', 'Tail Length (cells)', 10, { min: 1, max: 40, step: 1 }),
                            prop.number('tailOscFreq', 'Tail Osc. Frequency', 4, { min: 0.5, max: 20, step: 0.5 }),
                            prop.number('tailOscAmp', 'Tail Osc. Amplitude', 2.5, { min: 0, max: 10, step: 0.5 }),
                            prop.number('slowFactor', 'Post-Playhead Speed Factor', 0.1, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                            prop.number('fadeOutDuration', 'Fade Duration (s)', 1.2, { min: 0.1, max: 5, step: 0.1 }),
                            prop.number('rippleExpandSpeed', 'Ripple Expand Speed', 10, { min: 1, max: 40, step: 1 }),
                            prop.number('rippleDuration', 'Ripple Duration (s)', 0.8, { min: 0.1, max: 3, step: 0.1 }),
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
                            prop.color('customColor0', 'Color 0 (Background)', '#2D505A', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor1', 'Color 1 (Tail)', '#439B87', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor2', 'Color 2 (Head)', '#6EE4E3', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                            prop.color('customColor3', 'Color 3 (Ripple)', '#EEF2A9', {
                                visibleWhen: [{ key: 'palette', equals: 'custom' }],
                            }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        // ── Props ────────────────────────────────────────────────────────────
        const cols = Math.max(1, Math.round(p.cols as number));
        const rows = Math.max(1, Math.round(p.rows as number));
        const cellSize = Math.max(1, Math.round(p.cellSize as number));
        const minNote = Math.max(0, Math.min(127, Math.round(p.minNote as number)));
        const maxNote = Math.max(0, Math.min(127, Math.round(p.maxNote as number)));
        const noteRange = Math.max(1, maxNote - minNote);
        const windowDuration = Math.max(0.1, p.windowDuration as number);
        const playheadFraction = Math.max(0.01, Math.min(0.99, p.playheadFraction as number));
        const playheadCol = Math.round(cols * playheadFraction);

        const tailLength = Math.max(1, Math.round(p.tailLength as number));
        const tailOscFreq = p.tailOscFreq as number;
        const tailOscAmp = p.tailOscAmp as number;
        const slowFactor = Math.max(0, Math.min(1, p.slowFactor as number));
        const fadeOutDuration = Math.max(0.01, p.fadeOutDuration as number);
        const rippleExpandSpeed = Math.max(1, p.rippleExpandSpeed as number);
        const rippleDuration = Math.max(0.01, p.rippleDuration as number);

        // ── Palette ──────────────────────────────────────────────────────────
        const paletteName = p.palette as string;
        const paletteHex =
            paletteName === 'custom'
                ? [
                      (p.customColor0 as string) ?? '#2D505A',
                      (p.customColor1 as string) ?? '#439B87',
                      (p.customColor2 as string) ?? '#6EE4E3',
                      (p.customColor3 as string) ?? '#EEF2A9',
                  ]
                : [...(NAMED_PALETTES[paletteName] ?? NAMED_PALETTES.seafoam)];

        const [bg, tailRgb, headRgb, rippleRgb] = paletteHex.map(parseHex6) as [
            [number, number, number],
            [number, number, number],
            [number, number, number],
            [number, number, number],
        ];

        // ── Pixel buffer ─────────────────────────────────────────────────────
        const pixels = new Uint8ClampedArray(cols * rows * 4);
        for (let i = 0; i < cols * rows; i++) {
            pixels[i * 4] = bg[0];
            pixels[i * 4 + 1] = bg[1];
            pixels[i * 4 + 2] = bg[2];
            pixels[i * 4 + 3] = 255;
        }

        // Bayer-dithered pixel write — maintains 4-colour constraint for transparency
        const drawPixel = (col: number, row: number, rgb: [number, number, number], alpha: number): void => {
            const c = Math.round(col);
            const r = Math.round(row);
            if (c < 0 || c >= cols || r < 0 || r >= rows) return;
            if (alpha < 1 && alpha <= BAYER4[r & 3][c & 3]) return;
            const idx = (r * cols + c) * 4;
            pixels[idx] = rgb[0];
            pixels[idx + 1] = rgb[1];
            pixels[idx + 2] = rgb[2];
            pixels[idx + 3] = 255;
        };

        // ── Draw notes ───────────────────────────────────────────────────────
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        if (api && status === 'ok' && p.midiTrackId) {
            const normalColsPerSec = cols / windowDuration;
            const slowColsPerSec = normalColsPerSec * slowFactor;

            const queryStart = targetTime - playheadFraction * windowDuration - rippleDuration - fadeOutDuration;
            const queryEnd = targetTime + (1 - playheadFraction) * windowDuration;

            const notes = api.timeline.selectNotesInWindow({
                trackIds: [p.midiTrackId as string],
                startSec: queryStart,
                endSec: queryEnd,
            });

            // Sort so lower-velocity notes render first (higher velocity draws on top)
            notes.sort((a, b) => (a.velocity ?? 64) - (b.velocity ?? 64));

            const tailPhase = targetTime * tailOscFreq * Math.PI * 2;

            for (const n of notes) {
                if (n.note < minNote || n.note > maxNote) continue;

                const timeToNote = n.startTime - targetTime;
                const elapsed = -timeToNote;

                // X: normal speed before playhead, slowed after
                const noteCol =
                    timeToNote >= 0
                        ? playheadCol + timeToNote * normalColsPerSec
                        : playheadCol - elapsed * slowColsPerSec;

                // Y: pitch mapped to row (high note → top row)
                const noteRow = Math.round(((maxNote - n.note) / noteRange) * (rows - 1));

                // Alpha: fade out after crossing playhead
                const fadeAlpha = elapsed <= 0 ? 1.0 : Math.max(0, 1 - elapsed / fadeOutDuration);
                if (fadeAlpha <= 0) continue;

                // ── Tail — trails rightward (direction note came from) ────────
                for (let i = 1; i <= tailLength; i++) {
                    const tailCol = noteCol + i;
                    const rowOff = Math.sin(tailPhase - i * 0.6) * tailOscAmp;
                    const tailAlpha = fadeAlpha * (1 - i / (tailLength + 1));
                    drawPixel(tailCol, noteRow + rowOff, tailRgb, tailAlpha);
                }

                // ── Head pixel ───────────────────────────────────────────────
                drawPixel(noteCol, noteRow, headRgb, fadeAlpha);

                // ── Ripple at playhead when note crosses ─────────────────────
                if (elapsed >= 0 && elapsed < rippleDuration) {
                    const rippleAlpha = (1 - elapsed / rippleDuration) * fadeAlpha;
                    const outerRadius = Math.floor(elapsed * rippleExpandSpeed);
                    const innerRadius = outerRadius - 3;

                    // Outer diamond ring
                    if (outerRadius >= 1) {
                        for (let dc = -outerRadius; dc <= outerRadius; dc++) {
                            for (let dr = -outerRadius; dr <= outerRadius; dr++) {
                                if (Math.abs(dc) + Math.abs(dr) === outerRadius) {
                                    drawPixel(playheadCol + dc, noteRow + dr, rippleRgb, rippleAlpha);
                                }
                            }
                        }
                    }

                    // Inner trailing ring (subtler)
                    if (innerRadius >= 1) {
                        for (let dc = -innerRadius; dc <= innerRadius; dc++) {
                            for (let dr = -innerRadius; dr <= innerRadius; dr++) {
                                if (Math.abs(dc) + Math.abs(dr) === innerRadius) {
                                    drawPixel(playheadCol + dc, noteRow + dr, rippleRgb, rippleAlpha * 0.5);
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Create / update grid render object ───────────────────────────────
        const totalW = cols * cellSize;
        const totalH = rows * cellSize;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        const needNew =
            !this._grid || this._grid.cols !== cols || this._grid.rows !== rows || this._grid.cellSize !== cellSize;

        if (needNew) {
            this._grid = new PixelGridRenderer(ox, oy, cols, rows, cellSize, pixels);
        } else {
            this._grid!.updatePixels(pixels);
        }

        return [this._grid!];
    }
}
