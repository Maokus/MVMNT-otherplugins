import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  Arc,
  EmptyRenderObject,
  Poly,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import {
  anchorCell,
  cellScale,
  expandedGrid,
  onsetColumn,
  type ExpansionField,
  type ExpansionShape,
  type GridOnset,
} from "./dissolver-logic";
import { markPolygonPoints, type GridMarkShape } from "./dissolver-shapes";
import {
  buildMusicalSlots,
  parseTimeUnitBars,
  subdivisionBeats,
  TIME_UNIT_OPTIONS,
  timeUnitStartBeat,
} from "./musical-grid";

function bounded(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

const STEPS = [
  { label: "1/4 note", value: "1/4" },
  { label: "1/8 note", value: "1/8" },
  { label: "1/16 note", value: "1/16" },
  { label: "1/32 note", value: "1/32" },
];

const EXPANSION_SHAPES = [
  { label: "Circle", value: "circle" },
  { label: "Diamond", value: "diamond" },
  { label: "Noisy", value: "noisy" },
  { label: "Square", value: "square" },
  { label: "Cross", value: "cross" },
  { label: "Five-Point Star", value: "star" },
  { label: "Spiral", value: "spiral" },
  { label: "Wide Oval", value: "horizontal" },
  { label: "Tall Oval", value: "vertical" },
];

function expansionShape(value: unknown): ExpansionShape {
  switch (value) {
    case "circle":
    case "diamond":
    case "noisy":
    case "square":
    case "cross":
    case "star":
    case "spiral":
    case "horizontal":
    case "vertical":
      return value;
    default:
      return "noisy";
  }
}

const MARK_SHAPES = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Diamond", value: "diamond" },
  { label: "Triangle", value: "triangle" },
  { label: "Hexagon", value: "hexagon" },
];

export const dissolver = definePluginElement({
  type: "dissolver",
  metadata: {
    name: "Dissolver",
    description:
      "MIDI onsets send expanding dissolves through a repeating grid of marks.",
    category: "us.maok.sillyideas1",
  },
  schema: {
    tabs: [
      tab.content([
        group("source", "MIDI Source", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number("lowestNote", "Lowest MIDI Note", 48, {
            min: 0,
            max: 127,
            step: 1,
          }),
          prop.number("noteCount", "Number of Notes", 24, {
            min: 1,
            max: 64,
            step: 1,
          }),
        ]),
        group("timing", "Musical Grid", [
          prop.select("timeUnitBars", "Time Unit", "1", TIME_UNIT_OPTIONS),
          prop.select("timestep", "Time Step", "1/16", STEPS),
        ]),
        group("animation", "Dissolve", [
          prop.number("expansionSpeed", "Expansion Speed (×)", 1, {
            min: 0,
            step: 0.05,
          }),
          prop.number("initialBurst", "Initial Burst (cells)", 1.5, {
            min: 0,
            step: 0.1,
          }),
          prop.number("burstDecaySeconds", "Burst Decay (s)", 0.2, {
            min: 0,
            step: 0.01,
            visibleWhen: [{ key: "initialBurst", notEquals: 0 }],
          }),
          prop.select(
            "expansionShape",
            "Expansion Shape",
            "noisy",
            EXPANSION_SHAPES,
          ),
          prop.number("gradient", "Gradient (cells)", 0.75, {
            min: 0,
            step: 0.05,
          }),
          prop.number("noiseAmount", "Noise Amount (cells)", 2.75, {
            min: 0,
            step: 0.05,
            visibleWhen: [{ key: "expansionShape", equals: "noisy" }],
          }),
          prop.number("noiseScale", "Noise Texture Scale", 0.55, {
            min: 0,
            step: 0.05,
            visibleWhen: [{ key: "expansionShape", equals: "noisy" }],
          }),
          prop.number("returnSeconds", "Return Duration (s)", 0.25, {
            min: 0,
            step: 0.01,
          }),
          prop.number("returnStaggerSeconds", "Return Stagger (s)", 0.3, {
            min: 0,
            step: 0.01,
          }),
        ]),
        group("layout", "Layout", [
          prop.number("horizontalDensity", "Density (Horizontal)", 3, {
            min: 1,
            max: 4,
            step: 1,
          }),
          prop.number("verticalDensity", "Density (Vertical)", 1, {
            min: 1,
            max: 4,
            step: 1,
          }),
          prop.number("padding", "Padding (circles per edge)", 0, {
            min: 0,
            max: 8,
            step: 1,
          }),
          prop.number("width", "Width (px)", 800, {
            min: 1,
            step: 1,
          }),
          prop.number("height", "Height (px)", 360, {
            min: 1,
            step: 1,
          }),
          prop.number("circleSize", "Mark Size (%)", 68, {
            min: 0,
            step: 1,
          }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.select("markShape", "Grid Mark Shape", "circle", MARK_SHAPES),
          prop.number("markRotation", "Grid Mark Rotation (°)", 0, {
            step: 1,
            visibleWhen: [{ key: "markShape", notEquals: "circle" }],
          }),
          prop.colorAlpha("circleColor", "Mark Color", "#F8FAFCFF"),
          prop.colorAlpha("backgroundColor", "Background", "#0F172A00"),
        ]),
      ]),
    ],
  },
  render({ props, time, context }): readonly RenderObject[] {
    const width = bounded(props.width, 1, Infinity, 800);
    const height = bounded(props.height, 1, Infinity, 360);
    const lowestNote = Math.round(bounded(props.lowestNote, 0, 127, 48));
    const rows = Math.min(
      128 - lowestNote,
      Math.round(bounded(props.noteCount, 1, 64, 24)),
    );
    const horizontalDensity = Math.round(
      bounded(props.horizontalDensity, 1, 4, 3),
    );
    const verticalDensity = Math.round(bounded(props.verticalDensity, 1, 4, 1));
    const padding = Math.round(bounded(props.padding, 0, 8, 0));
    const cellSize = bounded(props.circleSize, 0, Infinity, 68) / 100;
    const shape = expansionShape(props.expansionShape);
    const field: ExpansionField = {
      shape,
      speed: bounded(props.expansionSpeed, 0, Infinity, 1),
      burstDistance: bounded(props.initialBurst, 0, Infinity, 1.5),
      burstDecaySeconds: bounded(props.burstDecaySeconds, 0, Infinity, 0.2),
      gradient: bounded(props.gradient, 0, Infinity, 0.75),
      noiseAmount: bounded(props.noiseAmount, 0, Infinity, 2.75),
      noiseScale: bounded(props.noiseScale, 0, Infinity, 0.55),
    };
    const returnSeconds = bounded(props.returnSeconds, 0, Infinity, 0.25);
    const returnStaggerSeconds = bounded(props.returnStaggerSeconds, 0, Infinity, 0.3);
    const circleColor =
      typeof props.circleColor === "string" ? props.circleColor : "#F8FAFCFF";
    const backgroundColor =
      typeof props.backgroundColor === "string"
        ? props.backgroundColor
        : "#0F172A00";
    const markShape: GridMarkShape =
      props.markShape === "square" ||
      props.markShape === "diamond" ||
      props.markShape === "triangle" ||
      props.markShape === "hexagon"
        ? props.markShape
        : "circle";
    const markRotation =
      (bounded(props.markRotation, -Infinity, Infinity, 0) * Math.PI) / 180;
    const objects: RenderObject[] = [
      new Rectangle(0, 0, width, height, {
        fillColor: backgroundColor,
        layoutParticipation: "include",
      }),
    ];
    const timing = context.timing;
    const timeline = context.timeline;
    const beat = timing?.secondsToBeats(time.seconds);
    const signature = timing?.getTimeSignature();
    if (!timing || !timeline || !beat?.ok || !signature?.ok) return objects;

    const beatsPerBar =
      (signature.value.numerator * 4) / signature.value.denominator;
    const beatsPerUnit = beatsPerBar * parseTimeUnitBars(props.timeUnitBars);
    const stepBeats = subdivisionBeats(props.timestep);
    const baseColumns = buildMusicalSlots(beatsPerUnit, stepBeats).length;
    if (baseColumns === 0) return objects;
    const gridGeometry = expandedGrid(
      baseColumns,
      rows,
      horizontalDensity,
      verticalDensity,
      padding,
    );
    const { columns, rows: gridRows } = gridGeometry;
    const startBeat = timeUnitStartBeat(beat.value, beatsPerUnit);
    const start = timing.beatsToSeconds(startBeat);
    const end = timing.beatsToSeconds(startBeat + beatsPerUnit);
    const previousStart = timing.beatsToSeconds(startBeat - beatsPerUnit);
    if (!start.ok || !end.ok || !previousStart.ok) return objects;

    const selected = props.midiTrackId
      ? timeline.selectNotes({
          trackIds: [props.midiTrackId as string],
          startSeconds: Math.max(0, previousStart.value),
          endSeconds: end.value,
        })
      : null;
    const currentOnsets: GridOnset[] = [];
    const previousOnsets: GridOnset[] = [];
    if (selected?.ok) {
      for (const note of selected.value) {
        if (note.note < lowestNote || note.note >= lowestNote + rows) continue;
        const noteBeat = timing.secondsToBeats(note.startSeconds);
        if (!noteBeat.ok) continue;
        const previous = note.startSeconds < start.value;
        const unitStart = previous ? startBeat - beatsPerUnit : startBeat;
        const unitStartSeconds = previous ? previousStart.value : start.value;
        const unitEndSeconds = previous ? start.value : end.value;
        if (
          note.startSeconds < unitStartSeconds ||
          note.startSeconds >= unitEndSeconds
        )
          continue;
        const anchor = anchorCell(
          onsetColumn(noteBeat.value, unitStart, stepBeats, baseColumns),
          lowestNote + rows - 1 - note.note,
          gridGeometry,
        );
        (previous ? previousOnsets : currentOnsets).push({
          ...anchor,
          seconds: note.startSeconds,
        });
      }
    }

    const cellWidth = width / columns;
    const cellHeight = height / gridRows;
    const circleRadius = Math.max(
      0.1,
      (Math.min(cellWidth, cellHeight) * cellSize) / 2,
    );
    const grid = new EmptyRenderObject(0, 0, 1, 1, 1, {
      layoutParticipation: "exclude",
    });
    objects.push(grid);
    for (let row = 0; row < gridRows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const scale = cellScale({
          column,
          row,
          columns,
          rows: gridRows,
          currentOnsets,
          previousOnsets,
          nowSeconds: time.seconds,
          boundarySeconds: start.value,
          currentEndSeconds: end.value,
          previousStartSeconds: previousStart.value,
          returnSeconds,
          returnStaggerSeconds,
          field,
        });
        if (scale <= 1e-6) continue;
        const centerX = (column + 0.5) * cellWidth;
        const centerY = (row + 0.5) * cellHeight;
        if (markShape === "circle") {
          grid.addChild(
            new Arc(centerX, centerY, circleRadius * scale, {
              startAngle: 0,
              endAngle: Math.PI * 2,
              fillColor: circleColor,
              layoutParticipation: "exclude",
            }),
          );
        } else {
          grid.addChild(
            new Poly(
              markPolygonPoints(
                markShape,
                centerX,
                centerY,
                circleRadius * scale,
                markRotation,
              ),
              { fillColor: circleColor, layoutParticipation: "exclude" },
            ).setClosed(true),
          );
        }
      }
    }
    return objects;
  },
});

export default dissolver;
