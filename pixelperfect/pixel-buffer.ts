// ── Bayer 4×4 ordered dither matrix, values normalised to [0, 1) ─────────────

export const BAYER4: readonly (readonly number[])[] = [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

// ── Color parsing helpers ─────────────────────────────────────────────────────

export function parseHexRGBA(hex: string): [number, number, number, number] {
    const c = hex.replace('#', '');
    if (c.length === 8) {
        return [
            parseInt(c.slice(0, 2), 16),
            parseInt(c.slice(2, 4), 16),
            parseInt(c.slice(4, 6), 16),
            parseInt(c.slice(6, 8), 16),
        ];
    }
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16), 255];
}

export function parseHex6(hex: string): [number, number, number] {
    const c = hex.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// ── PixelBuffer ───────────────────────────────────────────────────────────────

/**
 * RGBA pixel buffer over a cols×rows grid.
 * Each pixel occupies 4 consecutive bytes (R, G, B, A) in `data`.
 */
export class PixelBuffer {
    readonly cols: number;
    readonly rows: number;
    readonly data: Uint8ClampedArray;

    constructor(cols: number, rows: number) {
        this.cols = cols;
        this.rows = rows;
        this.data = new Uint8ClampedArray(cols * rows * 4);
    }

    /** Fill every pixel with the given RGBA colour. */
    fill(r: number, g: number, b: number, a: number = 255): void {
        const { data, cols, rows } = this;
        for (let i = 0; i < cols * rows; i++) {
            data[i * 4] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
            data[i * 4 + 3] = a;
        }
    }

    /** Write a single pixel at (col, row). No bounds checking. */
    setPixel(col: number, row: number, r: number, g: number, b: number, a: number): void {
        const idx = (row * this.cols + col) * 4;
        this.data[idx] = r;
        this.data[idx + 1] = g;
        this.data[idx + 2] = b;
        this.data[idx + 3] = a;
    }

    /**
     * Draw a pixel with Bayer-dithered alpha blending.
     * Rounds fractional coordinates, clips to buffer bounds, and uses the 4×4
     * Bayer threshold to decide whether to write the pixel at sub-1 alpha.
     * Written pixels always get alpha 255 — transparency is encoded via dithering.
     */
    drawPixelDithered(col: number, row: number, rgb: [number, number, number], alpha: number): void {
        const c = Math.round(col);
        const r = Math.round(row);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
        if (alpha < 1 && alpha <= BAYER4[r & 3][c & 3]) return;
        const idx = (r * this.cols + c) * 4;
        this.data[idx] = rgb[0];
        this.data[idx + 1] = rgb[1];
        this.data[idx + 2] = rgb[2];
        this.data[idx + 3] = 255;
    }

    /** Zero out all pixels (transparent black). */
    clear(): void {
        this.data.fill(0);
    }
}
