import { describe, it, expect } from "vitest";
import {
  adaptMidiNotes,
  spellPitch,
  staffPosition,
  decomposeDuration,
} from "../src/notation/model";
import {
  layoutScore,
  buildChord,
  type LayoutNode,
} from "../src/notation/layout";
import { evaluateNotePhase } from "../src/notation/effects";
import { defaultGlyphs } from "../src/notation/glyphs";
import { exampleNotes } from "../src/example";
const note = (pitch: number, start: number, end: number) => ({
  trackId: "t",
  channel: 0,
  note: pitch,
  startSeconds: start / 2,
  endSeconds: end / 2,
  durationSeconds: (end - start) / 2,
});
const options = { tempo: 120, numerator: 4, denominator: 4, measureCount: 2 };
const flatten = (nodes: LayoutNode[]): LayoutNode[] =>
  nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
describe("MIDI notation", () => {
  it("maps pitches to both staves and spells enharmonics", () => {
    expect(staffPosition(spellPitch(64), "treble")).toBe(0);
    expect(staffPosition(spellPitch(43), "bass")).toBe(0);
    expect(spellPitch(61, "flats")).toMatchObject({ step: 1, accidental: -1 });
    expect(spellPitch(61)).toMatchObject({ step: 0, accidental: 1 });
  });
  it("quantizes, groups chords, fills gaps and preserves performance timing", () => {
    const score = adaptMidiNotes(
      [note(60, 0.04, 1.03), note(64, 0.04, 1.03), note(67, 2, 3.5)],
      options,
    );
    expect(
      score.measures[0].events.map((e) => [
        e.beat,
        e.duration.beats,
        e.notes.length,
      ]),
    ).toEqual([
      [0, 1, 2],
      [1, 1, 0],
      [2, 1.5, 1],
      [3.5, 0.5, 0],
    ]);
    expect(score.measures[0].events[0].notes[0].startSeconds).toBe(0.02);
  });
  it("ties across bars and independently requested pages", () => {
    const input = [note(60, 3, 9)];
    const a = adaptMidiNotes(input, { ...options, measureCount: 1 });
    const b = adaptMidiNotes(input, {
      ...options,
      firstMeasure: 1,
      measureCount: 1,
    });
    expect(
      a.measures[0].events[a.measures[0].events.length - 1].notes[0].tieOut,
    ).toBe(true);
    expect(b.measures[0].events[0].notes[0]).toMatchObject({
      tieIn: true,
      tieOut: true,
    });
    expect(b.measures[0].events[0].notes[0].sourceId).toBe(
      a.measures[0].events[a.measures[0].events.length - 1].notes[0].sourceId,
    );
  });
  it("emits cancellation naturals and resets accidental state at bars", () => {
    const score = adaptMidiNotes(
      [note(61, 0, 1), note(61, 1, 2), note(60, 2, 3), note(61, 4, 5)],
      options,
    );
    expect(
      score.measures.flatMap((m) =>
        m.events.flatMap((e) => e.notes.map((n) => n.accidental)),
      ),
    ).toEqual([1, undefined, 0, 1]);
  });
  it("does not insert rests under overlapping notes and is order independent", () => {
    const input = [note(60, 0, 4), note(67, 1, 2), note(69, 2, 3)];
    expect(adaptMidiNotes(input, options)).toEqual(
      adaptMidiNotes([...input].reverse(), options),
    );
    expect(
      adaptMidiNotes(input, options).measures[0].events.every(
        (e) => e.notes.length,
      ),
    ).toBe(true);
  });
  it("rejects invalid meter and ignores malformed notes", () => {
    expect(() => adaptMidiNotes([], { ...options, tempo: 0 })).toThrow();
    expect(
      adaptMidiNotes([note(60, 1, 1), note(200, 0, 1)], options).measures[0]
        .events[0].notes,
    ).toEqual([]);
    expect(decomposeDuration(3.75).reduce((s, d) => s + d.beats, 0)).toBe(3.75);
  });
});
describe("layout and animation", () => {
  it("fits dense, high and low notes without clipping the page", () => {
    const score = adaptMidiNotes(
      [
        ...exampleNotes,
        ...Array.from({ length: 18 }, (_, i) => note(36 + i * 3, 0, 2)),
      ],
      { ...options, measureCount: 4 },
    );
    const layout = layoutScore(score, {
      clef: "treble",
      width: 800,
      height: 400,
      staffSize: 20,
      measuresPerSystem: 2,
    });
    const page = layout.nodes[0],
      scale = page.anchors.scale.x;
    for (const system of page.children!) {
      expect((system.x + system.bounds.x) * scale).toBeGreaterThanOrEqual(0);
      expect((system.y + system.bounds.y) * scale).toBeGreaterThanOrEqual(0);
      expect(
        (system.x + system.bounds.x + system.bounds.width) * scale,
      ).toBeLessThanOrEqual(800);
      expect(
        (system.y + system.bounds.y + system.bounds.height) * scale,
      ).toBeLessThanOrEqual(400);
    }
    const ids = flatten(layout.nodes).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("displaces adjacent chord heads and provides glyph anchors", () => {
    const event = adaptMidiNotes([note(64, 0, 1), note(65, 0, 1)], options)
      .measures[0].events[0];
    const chord = buildChord(event, "treble");
    expect(chord.children![0].x).not.toBe(chord.children![1].x);
    expect(defaultGlyphs.get("noteheadBlack").anchors.stemUpSE).toBeDefined();
    expect(
      defaultGlyphs
        .get("noteheadHalf")
        .commands.filter((c) => c.type === "closePath").length,
    ).toBeGreaterThan(1);
  });
  it("evaluates exact boundaries, zero effects and random-access frames", () => {
    const opts = { reveal: 0.5, release: 0.5 };
    expect(evaluateNotePhase(0.4, 1, 2, opts).phase).toBe("upcoming");
    expect(evaluateNotePhase(0.75, 1, 2, opts)).toEqual({
      phase: "reveal",
      amount: 0.5,
    });
    expect(evaluateNotePhase(1, 1, 2, opts).phase).toBe("active");
    expect(evaluateNotePhase(2, 1, 2, opts)).toEqual({
      phase: "release",
      amount: 1,
    });
    expect(evaluateNotePhase(2, 1, 2, { reveal: 0, release: 0 }).phase).toBe(
      "completed",
    );
    const before = evaluateNotePhase(1.5, 1, 2, opts);
    evaluateNotePhase(99, 1, 2, opts);
    expect(evaluateNotePhase(1.5, 1, 2, opts)).toEqual(before);
  });
});

it("assembles chords around one stem and flag, even across the staff middle", () => {
  const event = adaptMidiNotes(
    [note(69, 0, 0.5), note(71, 0, 0.5), note(72, 0, 0.5)],
    options,
  ).measures[0].events[0];
  const nodes = flatten([buildChord(event, "treble")]);
  expect(nodes.filter((n) => n.role === "stem")).toHaveLength(1);
  expect(nodes.filter((n) => n.role === "flag")).toHaveLength(1);
});

it("places copies on continuous paths with correct tangents", async () => {
  const { pathPosition, placeOnPath } =
    await import("../src/notation/placement");
  const options = {
    mode: "circle" as const,
    spacing: 4,
    radius: 10,
    amplitude: 3,
    cycles: 1,
    phase: 0,
    rotateToPath: true,
  };
  expect(pathPosition(0, 4, options)).toEqual({
    x: 10,
    y: 0,
    tangent: Math.PI / 2,
  });
  expect(pathPosition(1, 4, options).y).toBeCloseTo(10);
  const event = adaptMidiNotes([note(64, 0, 1)], {
    ...options,
    tempo: 120,
    numerator: 4,
    denominator: 4,
  }).measures[0].events[0];
  const node = buildChord(event, "treble"),
    before = JSON.stringify(node),
    placed = placeOnPath([node, node], options);
  expect(placed[0]).not.toBe(node);
  expect(placed[0].rotation).toBe(Math.PI / 2);
  expect(JSON.stringify(node)).toBe(before);
  expect(pathPosition(0, 1, { ...options, mode: "wave" }).x).toBe(0);
});
