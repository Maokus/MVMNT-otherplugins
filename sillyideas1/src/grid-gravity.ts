import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  Arc,
  EmptyRenderObject,
  Poly,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import { anchorCell, expandedGrid, onsetColumn } from "./dissolver-logic";
import { markPolygonPoints, type GridMarkShape } from "./dissolver-shapes";
import { stepMark, type Attractor } from "./grid-gravity-logic";
import {
  buildMusicalSlots,
  parseTimeUnitBars,
  subdivisionBeats,
  TIME_UNIT_OPTIONS,
  timeUnitStartBeat,
} from "./musical-grid";

const STEPS = [
  { label: "1/4 note", value: "1/4" },
  { label: "1/8 note", value: "1/8" },
  { label: "1/16 note", value: "1/16" },
  { label: "1/32 note", value: "1/32" },
];
const MARK_SHAPES = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Diamond", value: "diamond" },
  { label: "Triangle", value: "triangle" },
  { label: "Hexagon", value: "hexagon" },
];

interface HeldNote {
  readonly note: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function gridSettings(props: Record<string, unknown>, beatsPerBar: number) {
  const lowestNote = Math.round(bounded(props.lowestNote, 0, 127, 48));
  const noteCount = Math.min(128 - lowestNote, Math.round(bounded(props.noteCount, 1, 64, 24)));
  const beatsPerUnit = beatsPerBar * parseTimeUnitBars(props.timeUnitBars);
  const stepBeats = subdivisionBeats(props.timestep);
  const baseColumns = buildMusicalSlots(beatsPerUnit, stepBeats).length;
  const geometry = expandedGrid(
    baseColumns,
    noteCount,
    Math.round(bounded(props.horizontalDensity, 1, 4, 3)),
    Math.round(bounded(props.verticalDensity, 1, 4, 1)),
    Math.round(bounded(props.padding, 0, 8, 0)),
  );
  return { lowestNote, noteCount, beatsPerUnit, stepBeats, baseColumns, geometry };
}

function homePositions(columns: number, rows: number): Float32Array<ArrayBuffer> {
  const positions = new Float32Array(columns * rows * 2);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const offset = (row * columns + column) * 2;
      positions[offset] = column + 0.5;
      positions[offset + 1] = row + 0.5;
    }
  }
  return positions;
}

export const gridGravity = definePluginElement({
  type: "grid-gravity",
  metadata: {
    name: "Grid Gravity",
    description: "Held MIDI notes pull a spring-mounted grid of marks toward their onset locations.",
    category: "us.maok.sillyideas1",
  },
  schema: {
    tabs: [
      tab.content([
        group("source", "MIDI Source", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number("seed", "Seed", 1, { step: 1 }),
          prop.number("lowestNote", "Lowest MIDI Note", 48, { min: 0, max: 127, step: 1 }),
          prop.number("noteCount", "Number of Notes", 24, { min: 1, max: 64, step: 1 }),
        ]),
        group("timing", "Musical Grid", [
          prop.select("timeUnitBars", "Time Unit", "1", TIME_UNIT_OPTIONS),
          prop.select("timestep", "Time Step", "1/16", STEPS),
        ]),
        group("physics", "Forces", [
          prop.number("forceStrength", "Pull Strength", 80, { min: 0, step: 1 }),
          prop.number("forceFalloff", "Pull Falloff", 1, { min: 0, step: 0.05 }),
          prop.number("springStiffness", "Grid Spring", 25, { min: 0, step: 1 }),
          prop.number("damping", "Damping", 8, { min: 0, step: 0.1 }),
        ]),
        group("layout", "Layout", [
          prop.number("horizontalDensity", "Density (Horizontal)", 3, { min: 1, max: 4, step: 1 }),
          prop.number("verticalDensity", "Density (Vertical)", 1, { min: 1, max: 4, step: 1 }),
          prop.number("padding", "Padding (marks per edge)", 0, { min: 0, max: 8, step: 1 }),
          prop.number("width", "Width (px)", 800, { min: 1, step: 1 }),
          prop.number("height", "Height (px)", 360, { min: 1, step: 1 }),
          prop.number("markSize", "Mark Size (%)", 68, { min: 0, step: 1 }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.select("markShape", "Grid Mark Shape", "circle", MARK_SHAPES),
          prop.number("markRotation", "Grid Mark Rotation (°)", 0, {
            step: 1,
            visibleWhen: [{ key: "markShape", notEquals: "circle" }],
          }),
          prop.colorAlpha("markColor", "Mark Color", "#F8FAFCFF"),
          prop.colorAlpha("backgroundColor", "Background", "#0F172A00"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize() {
      return {
        columns: 0, rows: 0, positions: new Float32Array(),
        velocities: new Float32Array(), heldNotes: [] as HeldNote[], trackId: null as string | null,
      };
    },
    step({ state, props, time, context, deltaSeconds }) {
      const signature = context.timing?.getTimeSignature();
      if (!signature?.ok || !context.timing) return {
        columns: state.columns, rows: state.rows,
        positions: new Float32Array(state.positions),
        velocities: new Float32Array(state.velocities),
        heldNotes: [...state.heldNotes],
        trackId: state.trackId,
      };
      const beatsPerBar = signature.value.numerator * 4 / signature.value.denominator;
      const { lowestNote, noteCount, beatsPerUnit, stepBeats, baseColumns, geometry } = gridSettings(props, beatsPerBar);
      const { columns, rows } = geometry;
      if (columns <= 0 || rows <= 0) return {
        columns: state.columns, rows: state.rows,
        positions: new Float32Array(state.positions),
        velocities: new Float32Array(state.velocities),
        heldNotes: [...state.heldNotes],
        trackId: state.trackId,
      };
      const sameGrid = state.columns === columns && state.rows === rows;
      const positions = sameGrid ? new Float32Array(state.positions) : homePositions(columns, rows);
      const velocities = sameGrid ? new Float32Array(state.velocities) : new Float32Array(positions.length);
      const now = time.seconds + deltaSeconds;
      const attractors: Attractor[] = [];
      const heldNotes = (state.trackId === props.midiTrackId ? state.heldNotes : [])
        .filter(note => note.endSeconds > now);
      const noteOns = props.midiTrackId ? context.noteOns([props.midiTrackId]) : undefined;
      if (noteOns?.ok) {
        for (const note of noteOns.value) {
          if (note.endSeconds > now) heldNotes.push({
            note: note.note, startSeconds: note.startSeconds, endSeconds: note.endSeconds,
          });
        }
      }
      for (const note of heldNotes) {
        if (note.note < lowestNote || note.note >= lowestNote + noteCount) continue;
        const onsetBeat = context.timing.secondsToBeats(note.startSeconds);
        if (!onsetBeat.ok) continue;
        const unitStart = timeUnitStartBeat(onsetBeat.value, beatsPerUnit);
        const anchor = anchorCell(
          onsetColumn(onsetBeat.value, unitStart, stepBeats, baseColumns),
          lowestNote + noteCount - 1 - note.note,
          geometry,
        );
        attractors.push({ x: anchor.column + 0.5, y: anchor.row + 0.5 });
      }
      const strength = bounded(props.forceStrength, 0, Infinity, 80);
      const falloff = bounded(props.forceFalloff, 0, Infinity, 1);
      const stiffness = bounded(props.springStiffness, 0, Infinity, 25);
      const damping = bounded(props.damping, 0, Infinity, 8);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const offset = (row * columns + column) * 2;
          const next = stepMark(
            positions[offset], positions[offset + 1], velocities[offset], velocities[offset + 1],
            column + 0.5, row + 0.5, attractors, strength, falloff, stiffness, damping, deltaSeconds,
          );
          positions[offset] = next.x;
          positions[offset + 1] = next.y;
          velocities[offset] = next.vx;
          velocities[offset + 1] = next.vy;
        }
      }
      return { columns, rows, positions, velocities, heldNotes, trackId: props.midiTrackId };
    },
  },
  render({ props, context, simulation }): readonly RenderObject[] {
    const width = bounded(props.width, 1, Infinity, 800);
    const height = bounded(props.height, 1, Infinity, 360);
    const objects: RenderObject[] = [new Rectangle(0, 0, width, height, {
      fillColor: props.backgroundColor, layoutParticipation: "include",
    })];
    const signature = context.timing?.getTimeSignature();
    if (!signature?.ok) return objects;
    const { geometry } = gridSettings(props, signature.value.numerator * 4 / signature.value.denominator);
    const { columns, rows } = geometry;
    if (columns <= 0 || rows <= 0) return objects;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const radius = Math.max(0.1, Math.min(cellWidth, cellHeight) * bounded(props.markSize, 0, Infinity, 68) / 200);
    const shape: GridMarkShape = props.markShape === "square" || props.markShape === "diamond" ||
      props.markShape === "triangle" || props.markShape === "hexagon" ? props.markShape : "circle";
    const rotation = bounded(props.markRotation, -Infinity, Infinity, 0) * Math.PI / 180;
    const positions = simulation.state.columns === columns && simulation.state.rows === rows
      ? simulation.state.positions : null;
    const grid = new EmptyRenderObject(0, 0, 1, 1, 1, { layoutParticipation: "exclude" });
    objects.push(grid);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const offset = (row * columns + column) * 2;
        const x = (positions ? positions[offset] : column + 0.5) * cellWidth;
        const y = (positions ? positions[offset + 1] : row + 0.5) * cellHeight;
        if (shape === "circle") {
          grid.addChild(new Arc(x, y, radius, {
            startAngle: 0, endAngle: Math.PI * 2,
            fillColor: props.markColor, layoutParticipation: "exclude",
          }));
        } else {
          grid.addChild(new Poly(markPolygonPoints(shape, x, y, radius, rotation), {
            fillColor: props.markColor, layoutParticipation: "exclude",
          }).setClosed(true));
        }
      }
    }
    return objects;
  },
});

export default gridGravity;
