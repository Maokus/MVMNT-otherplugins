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
  private readonly glyphs = new Map<string, Glyph>();
  private version = 0;
  constructor() {
    for (const [name, glyph] of Object.entries(data))
      this.register(name, glyph as Glyph);
  }
  get revision(): number {
    return this.version;
  }
  names(): string[] {
    return [...this.glyphs.keys()];
  }
  get(name: string): Glyph {
    const glyph = this.glyphs.get(name);
    if (!glyph) throw new Error(`Unknown notation glyph: ${name}`);
    return glyph;
  }
  register(name: string, glyph: Glyph): void {
    const owned = {
      ...glyph,
      commands: Object.freeze(
        glyph.commands.map((c) => Object.freeze({ ...c })),
      ),
      bounds: Object.freeze({ ...glyph.bounds }),
      anchors: Object.freeze(
        Object.fromEntries(
          Object.entries(glyph.anchors).map(([k, p]) => [
            k,
            Object.freeze({ ...p }),
          ]),
        ),
      ),
    };
    this.glyphs.set(name, Object.freeze(owned));
    this.version++;
  }
}
export const defaultGlyphs = new GlyphRegistry();
