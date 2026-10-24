import type { BezierPathCommand } from "@mvmnt-app/plugin-sdk/render";
import {
  defaultGlyphs,
  type Bounds,
  type Point,
  type GlyphRegistry,
} from "./glyphs";
import {
  staffPosition,
  type Clef,
  type Score,
  type ScoreEvent,
  type ScoreNote,
} from "./model";
import { measureNodes } from "./geometry";
import { finite } from "./midi";
import type { KeySignature } from "./keys";
import { buildKeySignature, beamGroups } from "./engraving";
export interface LayoutNode {
  id: string;
  role: string;
  rotation?: number;
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  metadata?: Readonly<Record<string, unknown>>;
  timing?: readonly ScoreNote[];
  color?: string;
  opacity?: number;
  text?: { value: string; font: string };
  connection?: {
    from: { id: string; anchor: string };
    to: { id: string; anchor: string };
    kind: "beam" | "tie";
    thickness?: number;
    offset?: number;
    fraction?: number;
  };
  x: number;
  y: number;
  bounds: Bounds;
  anchors: Record<string, Point>;
  glyph?: string;
  line?: { x: number; y: number; width: number };
  path?: BezierPathCommand[];
  children?: LayoutNode[];
  note?: ScoreNote;
}
export interface ScoreLayout {
  nodes: LayoutNode[];
  width: number;
  height: number;
}
export interface LayoutOptions {
  clef: Clef;
  width: number;
  height: number;
  staffSize: number;
  measuresPerSystem: number;
  beatSpacing?: number;
  systemGap?: number;
  beaming?: boolean;
  registry?: GlyphRegistry;
}
const box = (x = 0, y = 0, width = 0, height = 0): Bounds => ({
  x,
  y,
  width,
  height,
});
export function glyphNode(
  id: string,
  glyph: string,
  x = 0,
  y = 0,
  role = "glyph",
  registry: GlyphRegistry = defaultGlyphs,
): LayoutNode {
  const g = registry.get(glyph);
  return {
    id,
    role,
    x,
    y,
    glyph,
    bounds: { ...g.bounds },
    anchors: { ...g.anchors },
  };
}
function line(
  id: string,
  x: number,
  y: number,
  dx: number,
  dy: number,
  width = 0.12,
  role = "line",
): LayoutNode {
  return {
    id,
    role,
    x,
    y,
    line: { x: dx, y: dy, width },
    bounds: box(
      Math.min(0, dx) - width / 2,
      Math.min(0, dy) - width / 2,
      Math.abs(dx) + width,
      Math.abs(dy) + width,
    ),
    anchors: {},
  };
}
export function groupNode(
  id: string,
  role: string,
  children: LayoutNode[],
  x = 0,
  y = 0,
): LayoutNode {
  const bounds = measureNodes(children);
  return {
    id,
    role,
    x,
    y,
    children,
    bounds,
    anchors: {},
  };
}
export function buildStaff(id: string, width: number): LayoutNode {
  finite(width, "Staff width", 0, 1000000);
  return groupNode(
    id,
    "staff",
    Array.from({ length: 5 }, (_, i) =>
      line(`${id}:${i}`, 0, i, width, 0, 0.1, "staff-line"),
    ),
  );
}
export function buildNote(
  note: ScoreNote,
  event: ScoreEvent,
  clef: Clef,
  displacement = 0,
  accidentalColumn = 0,
  stem?: { up: boolean; tipY: number; visible: boolean },
  registry: GlyphRegistry = defaultGlyphs,
): LayoutNode {
  const d = event.duration,
    pos = staffPosition(note.pitch, clef),
    y = 4 - pos / 2;
  const head =
    d.denominator === 1
      ? "noteheadWhole"
      : d.denominator === 2
        ? "noteheadHalf"
        : "noteheadBlack";
  const children = [
    glyphNode(`${note.id}:head`, head, 0, 0, "notehead", registry),
  ];
  const headGlyph = registry.get(head),
    w = headGlyph.advance;
  const up = stem?.up ?? pos < 4;
  if (d.denominator !== 1 && stem?.visible !== false) {
    const attachment = headGlyph.anchors[up ? "stemUpSE" : "stemDownNW"] ?? {
      x: up ? w : 0,
      y: 0,
    };
    const anchor = {
      x: attachment.x - (stem ? displacement : 0),
      y: attachment.y,
    };
    const tip = stem ? stem.tipY - y : up ? -3.5 : 3.5;
    children.push(
      line(
        `${note.id}:stem`,
        anchor.x,
        anchor.y,
        0,
        tip - anchor.y,
        0.12,
        "stem",
      ),
    );
    if (d.denominator >= 8)
      children.push(
        glyphNode(
          `${note.id}:flag`,
          `flag${d.denominator === 8 ? "8th" : "16th"}${up ? "Up" : "Down"}`,
          anchor.x,
          tip,
          "flag",
          registry,
        ),
      );
  }
  if (d.dotted)
    children.push(
      glyphNode(
        `${note.id}:dot`,
        "augmentationDot",
        w + 0.4,
        pos % 2 === 0 ? -0.5 : 0,
        "dot",
        registry,
      ),
    );
  if (note.accidental !== undefined)
    children.push(
      glyphNode(
        `${note.id}:accidental`,
        note.accidental === 1
          ? "accidentalSharp"
          : note.accidental === -1
            ? "accidentalFlat"
            : "accidentalNatural",
        -1.3 - accidentalColumn * 1.1,
        0,
        "accidental",
        registry,
      ),
    );
  for (let p = 10; p <= pos; p += 2)
    children.push(
      line(
        `${note.id}:ledger:${p}`,
        -0.3,
        (pos - p) / 2,
        w + 0.6,
        0,
        0.12,
        "ledger",
      ),
    );
  for (let p = -2; p >= pos; p -= 2)
    children.push(
      line(
        `${note.id}:ledger:${p}`,
        -0.3,
        (pos - p) / 2,
        w + 0.6,
        0,
        0.12,
        "ledger",
      ),
    );
  const node = groupNode(note.id, "note", children, displacement, y);
  node.note = note;
  node.anchors = { head: { x: 0, y: 0 }, tie: { x: w / 2, y: 1 } };
  return node;
}
export function buildChord(
  event: ScoreEvent,
  clef: Clef,
  registry: GlyphRegistry = defaultGlyphs,
): LayoutNode {
  if (!event.notes.length) {
    const names: Record<number, string> = {
      1: "restWhole",
      2: "restHalf",
      4: "restQuarter",
      8: "rest8th",
      16: "rest16th",
    };
    const nodes = [
      glyphNode(
        `${event.id}:rest`,
        names[event.duration.denominator],
        0,
        event.duration.denominator === 1 ? 1 : 2,
        "rest",
        registry,
      ),
    ];
    if (event.duration.dotted)
      nodes.push(
        glyphNode(
          `${event.id}:dot`,
          "augmentationDot",
          1.4,
          1.5,
          "dot",
          registry,
        ),
      );
    return groupNode(event.id, "rest-group", nodes);
  }
  const ordered = [...event.notes].sort((a, b) => a.pitch.midi - b.pitch.midi);
  const positions = ordered.map((n) => staffPosition(n.pitch, clef));
  const up = (positions[0] + positions[positions.length - 1]) / 2 < 4;
  const tipY = up
    ? 4 - positions[positions.length - 1] / 2 - 3.5
    : 4 - positions[0] / 2 + 3.5;
  let previous = -Infinity,
    displaced = false,
    acc = 0;
  const accidentalColumns: { min: number; max: number }[][] = [];
  const notes = ordered.map((note) => {
    const position = staffPosition(note.pitch, clef);
    displaced = position - previous <= 1 ? !displaced : false;
    previous = position;
    let column = 0;
    if (note.accidental !== undefined) {
      const glyph = registry.get(
          note.accidental === 1
            ? "accidentalSharp"
            : note.accidental === -1
              ? "accidentalFlat"
              : "accidentalNatural",
        ),
        min = 4 - position / 2 + glyph.bounds.y,
        max = min + glyph.bounds.height;
      while (
        accidentalColumns[column]?.some(
          (range) => !(max + 0.2 < range.min || min - 0.2 > range.max),
        )
      )
        column++;
      (accidentalColumns[column] ??= []).push({ min, max });
    }
    const offset = displaced ? (up ? 1.15 : -1.15) : 0;
    const built = buildNote(
      note,
      event,
      clef,
      offset,
      column,
      { up, tipY, visible: false },
      registry,
    );
    for (const child of built.children ?? [])
      if (child.role === "accidental") child.x -= offset;
    return built;
  });
  const shared: LayoutNode[] = [];
  if (event.duration.denominator !== 1) {
    const owner = up ? notes[0] : notes[notes.length - 1],
      head = registry.get(
        event.duration.denominator === 2 ? "noteheadHalf" : "noteheadBlack",
      );
    const attachment = head.anchors[up ? "stemUpSE" : "stemDownNW"] ?? {
      x: up ? head.advance : 0,
      y: 0,
    };
    const stemX = attachment.x,
      stemY = owner.y + attachment.y;
    shared.push(
      line(`${event.id}:stem`, stemX, stemY, 0, tipY - stemY, 0.12, "stem"),
    );
    if (event.duration.denominator >= 8)
      shared.push(
        glyphNode(
          `${event.id}:flag`,
          `flag${event.duration.denominator === 8 ? "8th" : "16th"}${up ? "Up" : "Down"}`,
          stemX,
          tipY,
          "flag",
          registry,
        ),
      );
  }
  const group = groupNode(event.id, "chord", [...notes, ...shared]);
  group.timing = event.notes;
  group.metadata = {
    voiceId: event.voiceId,
    beat: event.beat,
    duration: event.duration.beats,
    stemUp: up,
  };
  const attachmentGlyph = registry.get(
    event.duration.denominator === 2 ? "noteheadHalf" : "noteheadBlack",
  );
  group.anchors = {
    stemTip: { x: shared[0]?.x ?? 0, y: tipY },
    stemBase: { x: shared[0]?.x ?? 0, y: shared[0]?.y ?? 0 },
    stemBaseUp: {
      x: attachmentGlyph.anchors.stemUpSE?.x ?? attachmentGlyph.advance,
      y: notes[0].y + (attachmentGlyph.anchors.stemUpSE?.y ?? 0),
    },
    stemBaseDown: {
      x: attachmentGlyph.anchors.stemDownNW?.x ?? 0,
      y:
        notes[notes.length - 1].y +
        (attachmentGlyph.anchors.stemDownNW?.y ?? 0),
    },
  };
  // Identical ledger segments across chord members are redundant.
  const seen = new Set<string>();
  for (const note of notes) {
    note.children = note.children?.filter((child) => {
      if (child.role !== "ledger" && child.role !== "dot") return true;
      const key = `${child.role}:${note.x + child.x}:${note.y + child.y}:${child.line?.x}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    note.bounds = measureNodes(note.children ?? []);
  }
  return { ...group, bounds: measureNodes([...notes, ...shared]) };
}
function tieNode(id: string, x: number, y: number, width: number): LayoutNode {
  const w = Math.max(0.3, width);
  return {
    id,
    role: "tie",
    x,
    y,
    bounds: box(0, 0, w, 0.75),
    anchors: {},
    path: [
      { type: "moveTo", x: 0, y: 0 },
      {
        type: "bezierCurveTo",
        cp1x: w * 0.25,
        cp1y: 0.8,
        cp2x: w * 0.75,
        cp2y: 0.8,
        x: w,
        y: 0,
      },
      {
        type: "bezierCurveTo",
        cp1x: w * 0.75,
        cp1y: 0.55,
        cp2x: w * 0.25,
        cp2y: 0.55,
        x: 0,
        y: 0,
      },
      { type: "closePath" },
    ],
  };
}
export function layoutScore(score: Score, options: LayoutOptions): ScoreLayout {
  finite(options.width, "Page width", 1, 100000);
  finite(options.height, "Page height", 1, 100000);
  finite(options.staffSize, "Staff size", 0.01, 10000);
  finite(options.measuresPerSystem, "Measures per system", 1, 4096);
  const { clef } = options,
    per = Math.max(1, Math.floor(options.measuresPerSystem));
  const systems: LayoutNode[] = [];
  for (let offset = 0; offset < score.measures.length; offset += per) {
    const measures = score.measures.slice(offset, offset + per),
      contents: LayoutNode[] = [];
    const keyWidth = Math.abs(score.keySignature?.fifths ?? 0) * 0.95;
    let x = 8 + keyWidth;
    const placed: { node: LayoutNode; x: number; note: ScoreNote }[] = [];
    for (const measure of measures) {
      const groups = measure.events.map((event) => ({
        event,
        node: buildChord(event, clef, options.registry),
      }));
      const beats = [...new Set(groups.map((g) => g.event.beat))].sort(
        (a, b) => a - b,
      );
      const left = x;
      x += 1.5;
      for (let i = 0; i < beats.length; i++) {
        const at = groups.filter((g) => g.event.beat === beats[i]);
        const before = Math.max(0, ...at.map((g) => -g.node.bounds.x));
        x += before;
        let collision = 0,
          right = 0;
        for (const g of at) {
          g.node.x = x + collision;
          contents.push(g.node);
          for (const child of g.node.children ?? [])
            if (child.note)
              placed.push({
                node: child,
                x: g.node.x + child.x,
                note: child.note,
              });
          right = Math.max(
            right,
            collision + g.node.bounds.x + g.node.bounds.width,
          );
          collision += g.node.bounds.width + 1;
        }
        const next =
          beats[i + 1] ?? (measure.index + 1) * score.beatsPerMeasure;
        x += Math.max(
          right + 1.5,
          (next - beats[i]) * (options.beatSpacing ?? 3),
        );
      }
      if (options.beaming)
        contents.push(
          ...beamGroups(
            groups,
            score.beatGroups ??
              Array(score.numerator).fill(4 / score.denominator),
            measure.index * score.beatsPerMeasure,
          ),
        );
      x = Math.max(x, left + 12);
      contents.push(line(`bar:${measure.index}`, x, 0, 0, 4, 0.12, "barline"));
      x += 1;
    }
    for (const p of placed) {
      if (p.note.tieOut) {
        const next = placed.find(
          (q) => q.note.sourceId === p.note.sourceId && q.x > p.x,
        );
        const tie = tieNode(
          `${p.note.id}:tie-out`,
          p.x + 0.7,
          p.node.y + 1,
          next ? next.x - p.x : x - p.x - 0.8,
        );
        tie.timing = [p.note];
        if (next) {
          tie.x = 0;
          tie.y = 0;
          tie.connection = {
            from: { id: p.node.id, anchor: "tie" },
            to: { id: next.node.id, anchor: "tie" },
            kind: "tie",
          };
        }
        contents.push(tie);
      }
      if (
        p.note.tieIn &&
        !placed.some((q) => q.note.sourceId === p.note.sourceId && q.x < p.x)
      )
        contents.push(
          tieNode(
            `${p.note.id}:tie-in`,
            7,
            p.node.y + 1,
            Math.max(0.5, p.x - 7),
          ),
        );
    }
    const header = [
      buildStaff(`staff:${offset}`, x),
      glyphNode(
        `clef:${offset}`,
        clef === "treble" ? "gClef" : "fClef",
        0.6,
        clef === "treble" ? 3 : 1,
        "clef",
        options.registry,
      ),
    ];
    if (score.keySignature?.fifths) {
      const key = buildKeySignature(
        `key:${offset}`,
        score.keySignature,
        clef,
        options.registry,
      );
      key.x = 3.8;
      header.push(key);
    }
    const digits = (value: number, y: number) =>
      String(value)
        .split("")
        .map((digit, i) =>
          glyphNode(
            `meter:${offset}:${y}:${i}`,
            `timeSig${digit}`,
            4 + keyWidth + i * 1.1,
            y,
            "meter",
            options.registry,
          ),
        );
    header.push(...digits(score.numerator, 1), ...digits(score.denominator, 3));
    systems.push(
      groupNode(`system:${offset}`, "system", [...header, ...contents]),
    );
  }
  let y = 2;
  let maxWidth = 0;
  for (const s of systems) {
    s.y = y - s.bounds.y;
    s.x = 2 - s.bounds.x;
    y += s.bounds.height + (options.systemGap ?? 4);
    maxWidth = Math.max(maxWidth, s.bounds.width + 4);
  }
  const scale = Math.max(
    0.01,
    Math.min(
      options.staffSize,
      options.width / Math.max(1, maxWidth),
      options.height / Math.max(1, y),
    ),
  );
  // Layout remains in staff spaces. A wrapper records the one common scale in its bounds/anchor.
  const page = groupNode("page", "page", systems);
  page.scaleX = scale;
  page.scaleY = scale;
  page.anchors.scale = { x: scale, y: scale }; // Read compatibility for existing consumers.
  return { nodes: [page], width: options.width, height: options.height };
}
