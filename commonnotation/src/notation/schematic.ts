import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
import {
  normalizeMidiNotes,
  constantTimeMap,
  type NormalizedMidiNote,
  type TimeMap,
  finite,
} from "./midi";
import {
  adaptMidiNotes,
  type Clef,
  type ScoreEvent,
  type ScoreNote,
  type Spelling,
} from "./model";
import type { KeySignature } from "./keys";
import { keyName } from "./keys";
import { buildChord, buildStaff, groupNode, type LayoutNode } from "./layout";
import { beamGroups, buildKeySignature } from "./engraving";
import { lineNode, ribbonNode, pointNode, seededValue } from "./marks";
import type { SpatialPlane } from "./projection";
import { meterGroups } from "./rhythm";
import { resolveAnchor } from "./geometry";
import { defaultGlyphs } from "./glyphs";
export interface SchematicSource {
  id: string;
  name: string;
  notes: readonly MidiNoteEvent[];
}
export interface StructureOptions {
  startSeconds: number;
  endSeconds: number;
  tempo: number;
  numerator: number;
  denominator: number;
  timeMap?: TimeMap;
  keySignature: KeySignature;
  spelling: Spelling;
  clef: Clef | "auto";
  beaming: boolean;
  seed: number;
  measuresPerStrip: number;
  planeSpacing: number;
  planeTilt: number;
  notationSize: number;
  density: number;
  detailBudget: number;
  overviewBudget: number;
}
interface OverviewCell {
  id: string;
  node: LayoutNode;
  sourceIds: string[];
  start: number;
  end: number;
  beat: number;
  row: number;
  count: number;
  duration: number;
  beatDuration: number;
  velocity: number;
  pitchSum: number;
  pitchClasses: Set<number>;
}
interface TrackStructure {
  id: string;
  name: string;
  notes: readonly NormalizedMidiNote[];
  events: ScoreEvent[];
  cells: OverviewCell[];
  staticNodes: LayoutNode[];
  clef: Clef;
  cache: Map<string, LayoutNode>;
  height: number;
  invalid: number;
  activeIndex: IntervalIndex;
}
export interface SchematicStructure {
  tracks: TrackStructure[];
  options: StructureOptions;
  timeMap: TimeMap;
  originBeat: number;
  totalBeats: number;
  bar: number;
  stripBeats: number;
  stripCount: number;
  width: number;
  height: number;
  radius: number;
  sourceNotes: number;
}
export interface StructureFrameOptions {
  time: number;
  focusTime: number;
  focusMeasures: number;
  showNotation: boolean;
  showPoints: boolean;
  showRibbons: boolean;
  showConnectors: boolean;
  showAnnotations: boolean;
  futureOpacity: number;
  completedOpacity: number;
  annotationDensity: number;
  ink: string;
  accent: string;
}
export class IntervalIndex {
  private ends: number[] = [];
  constructor(readonly notes: readonly NormalizedMidiNote[]) {
    let max = -Infinity;
    for (const note of notes) {
      max = Math.max(max, note.endSeconds);
      this.ends.push(max);
    }
  }
  active(time: number): Set<string> {
    let lo = 0,
      hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.notes[mid].startSeconds <= time) lo = mid + 1;
      else hi = mid;
    }
    const ids = new Set<string>();
    for (let i = lo - 1; i >= 0 && this.ends[i] > time; i--)
      if (this.notes[i].endSeconds > time) ids.add(this.notes[i].id);
    return ids;
  }
}
function textNode(
  id: string,
  text: string,
  x: number,
  y: number,
  size = 1.6,
): LayoutNode {
  return {
    id,
    role: "annotation",
    x,
    y,
    bounds: {
      x: 0,
      y: -size,
      width: text.length * size * 0.55,
      height: size * 1.3,
    },
    anchors: {},
    text: { value: text, font: `${size}px Georgia, serif` },
  };
}
function position(
  structure: Pick<
    SchematicStructure,
    "originBeat" | "stripBeats" | "width" | "height" | "stripCount"
  >,
  beat: number,
): { x: number; y: number; row: number } {
  const row = Math.min(
    structure.stripCount - 1,
    Math.max(0, Math.floor(beat / structure.stripBeats)),
  );
  return {
    x:
      -structure.width / 2 +
      13 +
      ((beat - row * structure.stripBeats) / structure.stripBeats) *
        (structure.width - 20),
    y: -structure.height / 2 + row * 18 + 13,
    row,
  };
}
export function buildSchematicStructure(
  sources: readonly SchematicSource[],
  options: StructureOptions,
): SchematicStructure {
  finite(options.startSeconds, "Range start");
  finite(options.endSeconds, "Range end", options.startSeconds + 0.001, 1e8);
  finite(options.measuresPerStrip, "Measures per strip", 1, 32);
  finite(options.notationSize, "Notation size", 0.2, 4);
  finite(options.planeSpacing, "Plane spacing", 0, 200);
  finite(options.density, "Density", 0, 1);
  const timeMap = options.timeMap ?? constantTimeMap(options.tempo),
    originBeat = timeMap.secondsToBeats(options.startSeconds),
    totalBeats = timeMap.secondsToBeats(options.endSeconds) - originBeat,
    bar = (options.numerator * 4) / options.denominator;
  finite(totalBeats, "Range beats", 0.001, 1e8);
  const stripBeats = Math.max(
      options.measuresPerStrip * bar,
      Math.ceil(totalBeats / (16 * bar)) * bar,
    ),
    stripCount = Math.max(1, Math.ceil(totalBeats / stripBeats));
  const width = 264,
    height = stripCount * 18 + 16;
  const structure: SchematicStructure = {
    tracks: [],
    options,
    timeMap,
    originBeat,
    totalBeats,
    bar,
    stripBeats,
    stripCount,
    width,
    height,
    radius: 0,
    sourceNotes: 0,
  };
  const perTrackBudget = Math.max(
    1,
    Math.floor(options.overviewBudget / Math.max(1, sources.length)),
  );
  for (const source of sources.slice(0, 8)) {
    const normalized = normalizeMidiNotes(source.notes),
      notes = normalized.notes.filter(
        (n) =>
          n.endSeconds > options.startSeconds &&
          n.startSeconds < options.endSeconds,
      ),
      clef =
        options.clef === "auto"
          ? notes.reduce((sum, n) => sum + n.note, 0) /
              Math.max(1, notes.length) <
            58
            ? "bass"
            : "treble"
          : options.clef;
    // Engrave at most one 4096-measure block at a time for very long compositions.
    const events: ScoreEvent[] = [];
    const measures = Math.ceil(totalBeats / bar);
    for (let first = 0; first < measures; first += 4096) {
      const count = Math.min(4096, measures - first),
        blockStart = timeMap.beatsToSeconds(originBeat + first * bar),
        blockEnd = timeMap.beatsToSeconds(originBeat + (first + count) * bar);
      const blockNotes = notes.filter(
        (n) => n.endSeconds > blockStart && n.startSeconds < blockEnd,
      );
      events.push(
        ...adaptMidiNotes(blockNotes, {
          tempo: options.tempo,
          numerator: options.numerator,
          denominator: options.denominator,
          startSeconds: options.startSeconds,
          firstMeasure: first,
          measureCount: count,
          timeMap,
          keySignature: options.keySignature,
          spelling: options.spelling,
          rhythm: "metrical",
          voices: true,
        }).measures.flatMap((m) => m.events),
      );
    }
    const staticNodes: LayoutNode[] = [];
    for (let row = 0; row < stripCount; row++) {
      const pos = position(structure, row * stripBeats),
        staff = buildStaff(`${source.id}:staff:${row}`, width - 13);
      staff.x = -width / 2 + 4;
      staff.y = pos.y;
      staff.opacity = 0.42;
      staticNodes.push(staff);
      const glyph = clef === "treble" ? "gClef" : "fClef",
        g = defaultGlyphs.get(glyph);
      staticNodes.push({
        id: `${source.id}:clef:${row}`,
        role: "clef",
        x: -width / 2 + 4,
        y: pos.y + (clef === "treble" ? 3 : 1),
        glyph,
        bounds: { ...g.bounds },
        anchors: { ...g.anchors },
      });
      if (options.keySignature.fifths) {
        const key = buildKeySignature(
          `${source.id}:key:${row}`,
          options.keySignature,
          clef,
        );
        key.x = -width / 2 + 7;
        key.y = pos.y;
        key.scaleX = 0.6;
        key.scaleY = 0.6;
        staticNodes.push(key);
      }
      staticNodes.push(
        textNode(
          `${source.id}:measure:${row}`,
          `${source.name}  ·  m.${Math.floor((row * stripBeats) / bar) + 1}`,
          -width / 2 + 4,
          pos.y - 3,
          1.35,
        ),
      );
    }
    const cells = new Map<string, OverviewCell>();
    let minPitch = 127,
      maxPitch = 0;
    for (const note of notes) {
      minPitch = Math.min(minPitch, note.note);
      maxPitch = Math.max(maxPitch, note.note);
    }
    if (!notes.length) {
      minPitch = 0;
      maxPitch = 127;
    }
    const pitchBins = Math.max(
      1,
      Math.min(
        Math.ceil((maxPitch - minPitch + 1) / 4),
        Math.floor(perTrackBudget / stripCount),
      ),
    );
    const timeBins = Math.max(
      1,
      Math.floor(perTrackBudget / (stripCount * pitchBins)),
    );
    for (const note of notes) {
      const beat = Math.max(
          0,
          timeMap.secondsToBeats(note.startSeconds) - originBeat,
        ),
        p = position(structure, beat),
        bin = Math.min(
          timeBins - 1,
          Math.floor(((beat - p.row * stripBeats) / stripBeats) * timeBins),
        ),
        pitchBin = Math.min(
          pitchBins - 1,
          Math.floor(
            ((note.note - minPitch) / (maxPitch - minPitch + 1)) * pitchBins,
          ),
        ),
        id = `${source.id}:cell:${p.row}:${bin}:${pitchBin}`;
      const existing = cells.get(id),
        velocity = note.velocity ?? 80;
      if (existing) {
        existing.sourceIds.push(note.id);
        existing.start = Math.min(existing.start, note.startSeconds);
        existing.end = Math.max(existing.end, note.endSeconds);
        existing.count++;
        existing.duration = Math.max(
          existing.duration,
          note.endSeconds - note.startSeconds,
        );
        existing.beatDuration = Math.max(
          existing.beatDuration,
          timeMap.secondsToBeats(note.endSeconds) -
            timeMap.secondsToBeats(note.startSeconds),
        );
        existing.velocity += velocity;
        existing.pitchSum += note.note;
        existing.pitchClasses.add(note.note % 12);
      } else {
        const x = -width / 2 + 13 + ((bin + 0.5) / timeBins) * (width - 20),
          y =
            p.y +
            2 +
            (60 -
              (minPitch +
                ((pitchBin + 0.5) * (maxPitch - minPitch + 1)) / pitchBins)) /
              8;
        cells.set(id, {
          id,
          node: pointNode(id, x, y, 0.2 + (velocity / 127) * 0.18),
          sourceIds: [note.id],
          start: note.startSeconds,
          end: note.endSeconds,
          beat,
          row: p.row,
          count: 1,
          duration: note.endSeconds - note.startSeconds,
          beatDuration:
            timeMap.secondsToBeats(note.endSeconds) -
            timeMap.secondsToBeats(note.startSeconds),
          velocity,
          pitchSum: note.note,
          pitchClasses: new Set([note.note % 12]),
        });
      }
    }
    const cellArray = [...cells.values()];
    for (const cell of cellArray) {
      cell.node.metadata = { sourceIds: cell.sourceIds };
    }
    staticNodes.push(
      textNode(
        `${source.id}:title`,
        source.name,
        -width / 2,
        -height / 2 - 3,
        3,
      ),
    );
    staticNodes.push(
      textNode(
        `${source.id}:stats`,
        `${notes.length} notes · ${keyName(options.keySignature)} · ${options.numerator}/${options.denominator}`,
        -width / 2,
        height / 2 + 3,
        1.7,
      ),
    );
    const track: TrackStructure = {
      id: source.id,
      name: source.name,
      notes,
      events,
      cells: cellArray,
      staticNodes,
      clef,
      cache: new Map(),
      height,
      invalid: normalized.diagnostics.length,
      activeIndex: new IntervalIndex(notes),
    };
    structure.tracks.push(track);
    structure.sourceNotes += notes.length;
  }
  const reach = Math.max(1, structure.tracks.length - 1) / 2;
  structure.radius =
    Math.hypot(
      width / 2 + 20 + reach * 20,
      height / 2 + 20 + reach * 8,
      reach * options.planeSpacing,
    ) + 20;
  return structure;
}
export function schematicPlanes(
  structure: SchematicStructure,
  frame: StructureFrameOptions,
): SpatialPlane[] {
  const { options } = structure,
    focusBeat =
      structure.timeMap.secondsToBeats(frame.focusTime) - structure.originBeat,
    half = (frame.focusMeasures * structure.bar) / 2;
  const candidates = structure.tracks.flatMap((track) =>
    track.events
      .filter((event) => Math.abs(event.beat - focusBeat) <= half)
      .map((event) => ({ track, event })),
  );
  const ordered = candidates.sort(
    (a, b) =>
      seededValue(options.seed, a.event.id + a.track.id) -
      seededValue(options.seed, b.event.id + b.track.id),
  );
  const selected = ordered.slice(0, options.detailBudget),
    selectedIds = new Set(
      selected.flatMap((c) => c.event.notes.map((n) => n.sourceId)),
    );
  return structure.tracks.map((track, index) => {
    const active = track.activeIndex.active(frame.time),
      nodes: LayoutNode[] = track.staticNodes.filter(
        (n) => frame.showAnnotations || n.role !== "annotation",
      );
    const sourceStyle = (
      ids: readonly string[],
      start: number,
      end: number,
    ) => ({
      color: ids.some((id) => active.has(id)) ? frame.accent : frame.ink,
      opacity:
        frame.time < start
          ? frame.futureOpacity
          : frame.time >= end
            ? frame.completedOpacity
            : 1,
    });
    const rows = new Map<number, { node: LayoutNode; event: ScoreEvent }[]>();
    if (frame.showNotation)
      for (const { event } of selected.filter((c) => c.track === track)) {
        const pos = position(structure, event.beat),
          size = options.notationSize;
        let cached = track.cache.get(event.id);
        if (!cached) {
          cached = buildChord(event, track.clef);
          track.cache.set(event.id, cached);
          if (track.cache.size > 1024)
            track.cache.delete(track.cache.keys().next().value!);
        }
        // The copy owns its shared stem, which beam construction may extend.
        const node = {
          ...cached,
          children: cached.children?.map((c) => ({
            ...c,
            line: c.line ? { ...c.line } : undefined,
          })),
          anchors: { ...cached.anchors },
          x: pos.x / size,
          y: 0,
        };
        const fade = Math.min(
          1,
          Math.max(
            0,
            (half - Math.abs(event.beat - focusBeat)) /
              Math.max(0.25, structure.bar * 0.5),
          ),
        );
        node.opacity = fade;
        const list = rows.get(pos.row) ?? [];
        list.push({ node, event });
        rows.set(pos.row, list);
      }
    for (const [row, items] of rows) {
      const children = items.map((i) => i.node);
      if (options.beaming) {
        const measures = [
          ...new Set(
            items.map((i) => Math.floor(i.event.beat / structure.bar)),
          ),
        ];
        for (const measure of measures) {
          const group = items.filter(
            (i) => Math.floor(i.event.beat / structure.bar) === measure,
          );
          const scoreGroups = meterGroups(
            options.numerator,
            options.denominator,
          );
          children.push(
            ...beamGroups(group, scoreGroups, measure * structure.bar),
          );
        }
      }
      const bySource = new Map<
        string,
        { note: ScoreNote; node: LayoutNode; beat: number }[]
      >();
      for (const { node, event } of items)
        for (const child of node.children ?? [])
          if (child.note) {
            const list = bySource.get(child.note.sourceId) ?? [];
            list.push({ note: child.note, node: child, beat: event.beat });
            bySource.set(child.note.sourceId, list);
          }
      for (const list of bySource.values()) {
        list.sort((a, b) => a.beat - b.beat);
        for (let i = 0; i < list.length - 1; i++)
          if (list[i].note.tieOut)
            children.push({
              id: `${list[i].note.id}:tie`,
              role: "tie",
              x: 0,
              y: 0,
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              anchors: {},
              timing: [list[i].note],
              connection: {
                from: { id: list[i].node.id, anchor: "tie" },
                to: { id: list[i + 1].node.id, anchor: "tie" },
                kind: "tie",
              },
            });
      }
      for (const list of bySource.values()) {
        for (const [edge, part] of [
          ["in", list[0]],
          ["out", list[list.length - 1]],
        ] as const) {
          if (edge === "in" ? !part.note.tieIn : !part.note.tieOut) continue;
          const point = resolveAnchor(children, part.node.id, "tie");
          if (!point) continue;
          const id = `${part.note.id}:continuation:${edge}`,
            anchorId = `${id}:edge`;
          children.push({
            id: anchorId,
            role: "connection-anchor",
            x: point.x + (edge === "in" ? -2 : 2),
            y: point.y,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            anchors: { tie: { x: 0, y: 0 } },
          });
          children.push({
            id,
            role: "tie",
            x: 0,
            y: 0,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            anchors: {},
            timing: [part.note],
            connection: {
              from: {
                id: edge === "in" ? anchorId : part.node.id,
                anchor: "tie",
              },
              to: {
                id: edge === "in" ? part.node.id : anchorId,
                anchor: "tie",
              },
              kind: "tie",
            },
          });
        }
      }
      const strip = groupNode(`${track.id}:detail:${row}`, "detail", children);
      strip.scaleX = options.notationSize;
      strip.scaleY = options.notationSize;
      strip.y = position(structure, row * structure.stripBeats).y;
      nodes.push(strip);
    }
    const cells = track.cells
      .slice()
      .sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i],
        style = sourceStyle(cell.sourceIds, cell.start, cell.end),
        detail =
          frame.showNotation &&
          cell.sourceIds.every((id) => selectedIds.has(id));
      const fade = detail
        ? Math.min(
            1,
            Math.max(
              0,
              (half - Math.abs(cell.beat - focusBeat)) /
                Math.max(0.25, structure.bar * 0.5),
            ),
          )
        : 0;
      if (frame.showPoints)
        nodes.push({
          ...cell.node,
          ...style,
          opacity: style.opacity * (1 - 0.85 * fade),
        });
      if (seededValue(options.seed, cell.id) > options.density) continue;
      if (frame.showRibbons) {
        const ribbon = ribbonNode(
          `${cell.id}:ribbon`,
          cell.node.x,
          cell.node.y + 6,
          Math.min(
            12,
            (cell.beatDuration / structure.stripBeats) * (structure.width - 20),
          ),
          0.12 + Math.log2(cell.count + 1) * 0.16,
        );
        nodes.push({ ...ribbon, ...style, opacity: style.opacity * 0.28 });
      }
      if (
        frame.showAnnotations &&
        seededValue(options.seed, `${cell.id}:label`) < frame.annotationDensity
      ) {
        const previous = cells[i - 1],
          interval = previous
            ? cell.pitchSum / cell.count - previous.pitchSum / previous.count
            : 0;
        const kind = Math.floor(
          seededValue(options.seed, `${cell.id}:kind`) * 3,
        );
        const content =
          kind === 0
            ? `m.${Math.floor(cell.beat / structure.bar) + 1}  t=${(cell.start - options.startSeconds).toFixed(1)}  Δt=${cell.duration.toFixed(2)}`
            : kind === 1
              ? `pc={${[...cell.pitchClasses].sort((a, b) => a - b).join(",")}}  Δp=${interval.toFixed(1)}`
              : `v=${Math.round(cell.velocity / cell.count)}  ρ=${cell.count}/cell`;
        nodes.push({
          ...textNode(
            `${cell.id}:annotation`,
            content,
            cell.node.x,
            cell.node.y - 2,
            1.6 + seededValue(options.seed, `${cell.id}:size`),
          ),
          ...style,
          opacity: style.opacity * 0.7,
        });
      }
    }
    if (frame.showConnectors) {
      const centroids = new Map<
        string,
        {
          x: number;
          y: number;
          count: number;
          row: number;
          ids: string[];
          start: number;
          end: number;
        }
      >();
      for (const cell of cells) {
        const key = `${cell.row}:${cell.node.x}`,
          old = centroids.get(key);
        if (old) {
          old.y += cell.node.y * cell.count;
          old.count += cell.count;
          old.ids.push(...cell.sourceIds);
          old.start = Math.min(old.start, cell.start);
          old.end = Math.max(old.end, cell.end);
        } else
          centroids.set(key, {
            x: cell.node.x,
            y: cell.node.y * cell.count,
            count: cell.count,
            row: cell.row,
            ids: [...cell.sourceIds],
            start: cell.start,
            end: cell.end,
          });
      }
      const points = [...centroids.values()].sort(
        (a, b) => a.row - b.row || a.x - b.x,
      );
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i],
          b = points[i + 1],
          id = `${track.id}:centroid:${a.row}:${a.x}`;
        if (a.row !== b.row || seededValue(options.seed, id) > options.density)
          continue;
        const style = sourceStyle(a.ids, a.start, a.end);
        nodes.push({
          ...lineNode(
            id,
            { x: a.x, y: a.y / a.count },
            { x: b.x, y: b.y / b.count },
            0.05,
          ),
          ...style,
          opacity: style.opacity * 0.4,
        });
      }
    }
    const shift = index - (structure.tracks.length - 1) / 2;
    return {
      id: track.id,
      transform: {
        x: shift * 20,
        y: shift * 8,
        z: shift * options.planeSpacing,
        rotationY:
          (shift * 0.8 + seededValue(options.seed, `${track.id}:yaw`) - 0.5) *
          options.planeTilt,
        rotationX:
          (seededValue(options.seed, `${track.id}:pitch`) - 0.5) *
          options.planeTilt *
          0.5,
        rotationZ: (seededValue(options.seed, `${track.id}:roll`) - 0.5) * 0.12,
      },
      nodes,
    };
  });
}
