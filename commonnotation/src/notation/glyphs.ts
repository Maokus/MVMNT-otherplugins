import type { BezierPathCommand } from "@mvmnt-app/plugin-sdk/render";
import data from "./glyph-data.json";
export interface Point {
  x: number;
  y: number;
}
export interface Bounds extends Point {
  width: number;
  height: number;
}
export type GlyphName = keyof typeof data;
export interface Glyph {
  commands: readonly BezierPathCommand[];
  bounds: Bounds;
  anchors: Readonly<Record<string, Point>>;
  advance: number;
}
export class GlyphRegistry {
  private readonly glyphs = new Map<string, Glyph>(
    Object.entries(data) as [string, Glyph][],
  );
  names(): string[] { return [...this.glyphs.keys()]; }
  get(name: string): Glyph {
    const glyph = this.glyphs.get(name);
    if (!glyph) throw new Error(`Unknown notation glyph: ${name}`);
    return glyph;
  }
  register(name: string, glyph: Glyph): void {
    this.glyphs.set(name, glyph);
  }
}
export const defaultGlyphs = new GlyphRegistry();
