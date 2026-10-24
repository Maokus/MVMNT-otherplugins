import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { glyphNode, NotationRenderer } from "./notation";
import { select, when, inspectionProperties, frame, label } from "./controls";
import { makeExampleRegistry } from "./example-fixtures";
const atlasGlyphs = makeExampleRegistry();
export default definePluginElement({
  type: "commonnotation-glyph-atlas",
  metadata: {
    name: "Notation · Glyph Atlas",
    description: "Layer 1: engraved outlines, metrics and attachment anchors.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      {
        id: "metrics",
        label: "All glyph metrics and anchors",
        values: {
          mode: "gallery",
          category: "all",
          showBounds: true,
          showAnchors: true,
        },
      },
      {
        id: "custom",
        label: "Locally registered diamond glyph",
        values: {
          mode: "single",
          glyph: "exampleDiamond",
          showBounds: true,
          showAnchors: true,
        },
      },
      {
        id: "dynamics",
        label: "Performance dynamics",
        values: { mode: "gallery", category: "dynamics" },
      },
    ],
    tabs: [
      tab.content([
        group("glyphs", "Glyph selection", [
          select("mode", "Display", "gallery", ["gallery", "single"]),
          select(
            "category",
            "Glyph family",
            "all",
            [
              "all",
              "clefs",
              "noteheads",
              "accidentals",
              "flags",
              "rests",
              "meter",
              "dots",
              "dynamics",
              "custom",
            ],
            when("mode", "gallery"),
          ),
          select(
            "glyph",
            "Glyph",
            "gClef",
            atlasGlyphs.names(),
            when("mode", "single"),
          ),
        ]),
      ]),
      tab.appearance([
        group("geometry", "Geometry", [
          prop.number("glyphSize", "Staff-space size (px)", 24, {
            min: 4,
            max: 60,
          }),
          prop.number("columns", "Gallery columns", 5, {
            min: 1,
            max: 10,
            step: 1,
            visibleWhen: when("mode", "gallery"),
          }),
          prop.number("rotation", "Glyph rotation (degrees)", 0, {
            min: -180,
            max: 180,
          }),
          prop.colorAlpha("color", "Glyph color", "#E2E8F0FF"),
          prop.colorAlpha("background", "Background", "#111827FF"),
          prop.boolean("showNames", "Show glyph names", true),
          ...inspectionProperties(),
        ]),
      ]),
    ],
  },
  render({ props }) {
    const prefixes: Record<string, string> = {
      clefs: "Clef",
      noteheads: "notehead",
      accidentals: "accidental",
      flags: "flag",
      rests: "rest",
      meter: "timeSig",
      dots: "augmentation",
      dynamics: "dynamic",
      custom: "example",
    };
    const names =
      props.mode === "single"
        ? [props.glyph]
        : atlasGlyphs
            .names()
            .filter(
              (n) =>
                props.category === "all" ||
                n.includes(prefixes[props.category]),
            );
    const columns =
      props.mode === "single" ? 1 : Math.max(1, Math.round(props.columns));
    const cellW = Math.max(180, props.glyphSize * 8),
      cellH = props.glyphSize * 10 + 48;
    const objects = [
      frame(
        columns * cellW,
        Math.ceil(names.length / columns) * cellH + 45,
        props.background,
      ),
      label(18, 25, "GLYPHS  /  outlines → bounds → anchors", props.color),
    ];
    const renderer = new NotationRenderer(atlasGlyphs);
    names.forEach((name, i) => {
      const glyph = atlasGlyphs.get(name),
        b = glyph.bounds;
      const x = (i % columns) * cellW + cellW / 2,
        y = Math.floor(i / columns) * cellH + 45 + cellH / 2 - 12;
      const object = renderer.renderNode(
        glyphNode(name, name, 0, 0, "glyph", atlasGlyphs),
        {
          time: 0,
          color: props.color,
          activeColor: props.color,
          reveal: 0,
          release: 0,
          animate: false,
          showBounds: props.showBounds,
          showAnchors: props.showAnchors,
        },
      );
      object
        .setOrigin(b.x + b.width / 2, b.y + b.height / 2)
        .setScale(props.glyphSize)
        .setRotation((props.rotation * Math.PI) / 180)
        .setPosition(x, y);
      objects.push(object);
      if (props.showNames)
        objects.push(
          label(
            x - cellW / 2 + 12,
            (Math.floor(i / columns) + 1) * cellH + 27,
            name,
            props.color,
            12,
          ),
        );
    });
    return objects;
  },
});
