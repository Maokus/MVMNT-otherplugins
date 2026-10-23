import fs from "node:fs";
import opentype from "opentype.js";
const root = new URL("../", import.meta.url);
const font = opentype.loadSync(new URL("vendor/Bravura.otf", root).pathname);
const metadata = JSON.parse(
  fs.readFileSync(new URL("vendor/bravura_metadata.json", root)),
);
const names = {
  gClef: 0xe050,
  fClef: 0xe062,
  noteheadWhole: 0xe0a2,
  noteheadHalf: 0xe0a3,
  noteheadBlack: 0xe0a4,
  augmentationDot: 0xe1e7,
  accidentalFlat: 0xe260,
  accidentalNatural: 0xe261,
  accidentalSharp: 0xe262,
  flag8thUp: 0xe240,
  flag8thDown: 0xe241,
  flag16thUp: 0xe242,
  flag16thDown: 0xe243,
  restWhole: 0xe4e3,
  restHalf: 0xe4e4,
  restQuarter: 0xe4e5,
  rest8th: 0xe4e6,
  rest16th: 0xe4e7,
};
for (let i = 0; i < 10; i++) names[`timeSig${i}`] = 0xe080 + i;
const glyphs = {};
for (const [name, code] of Object.entries(names)) {
  const glyph = font.charToGlyph(String.fromCodePoint(code));
  if (!glyph.index) throw Error(`Missing ${name}`);
  const path = glyph.getPath(0, 0, 4); // One em is four staff spaces.
  const commands = path.commands.map((c) =>
    c.type === "M"
      ? { type: "moveTo", x: c.x, y: c.y }
      : c.type === "L"
        ? { type: "lineTo", x: c.x, y: c.y }
        : c.type === "C"
          ? {
              type: "bezierCurveTo",
              cp1x: c.x1,
              cp1y: c.y1,
              cp2x: c.x2,
              cp2y: c.y2,
              x: c.x,
              y: c.y,
            }
          : c.type === "Q"
            ? { type: "quadraticCurveTo", cpx: c.x1, cpy: c.y1, x: c.x, y: c.y }
            : { type: "closePath" },
  );
  const b = path.getBoundingBox();
  const anchors = Object.fromEntries(
    Object.entries(metadata.glyphsWithAnchors?.[name] ?? {}).map(([k, v]) => [
      k,
      { x: v[0], y: -v[1] },
    ]),
  );
  glyphs[name] = {
    commands,
    bounds: { x: b.x1, y: b.y1, width: b.x2 - b.x1, height: b.y2 - b.y1 },
    anchors,
    advance: (glyph.advanceWidth / font.unitsPerEm) * 4,
  };
}
fs.writeFileSync(
  new URL("src/notation/glyph-data.json", root),
  JSON.stringify(glyphs),
);
