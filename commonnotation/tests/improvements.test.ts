import { expect, it, vi } from "vitest";
vi.mock("@mvmnt-app/plugin-sdk/render", async () => ({
  ...(await import("../../../MVMNT/src/core/render/render-objects/bezier")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/empty")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/line")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/rectangle")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/text")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/clip-layer")),
}));
import {
  adaptMidiNotes,
  normalizeMidiNotes,
  constantTimeMap,
  spellPitch,
  keyAlterations,
  buildKeySignature,
  meterGroups,
  decomposeDuration,
  layoutScore,
  buildChord,
  groupNode,
  resolveAnchor,
  evaluateLayoutNodes,
  evaluateNoteStyle,
  evaluateNotePhase,
  defaultGlyphs,
  GlyphRegistry,
  glyphNode,
  NotationRenderer,
  flattenPath,
  projectPrimitives,
  clipNear,
  projectPoint,
  type Camera,
  type LayoutNode,
} from "../src/notation";
const n = (pitch: number, start: number, end: number, channel = 0) => ({
  trackId: "track",
  channel,
  note: pitch,
  startSeconds: start,
  endSeconds: end,
  durationSeconds: end - start,
  velocity: 80,
});
const base = { tempo: 120, numerator: 4, denominator: 4, measureCount: 2 };
const walk = (nodes: readonly LayoutNode[]): LayoutNode[] =>
  nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
it("uses stable note identities after reorder, windowing and velocity edits", () => {
  const a = n(60, 1, 2),
    b = n(62, 3, 4);
  const full = normalizeMidiNotes([b, a]);
  expect(full.notes[0].id).toBe(normalizeMidiNotes([a]).notes[0].id);
  expect(full.notes[0].id).toBe(
    normalizeMidiNotes([{ ...a, velocity: 100 }]).notes[0].id,
  );
  expect(normalizeMidiNotes([a, { ...a, note: NaN }]).diagnostics).toHaveLength(
    1,
  );
  expect(normalizeMidiNotes([a, a]).notes[0].id).not.toBe(
    normalizeMidiNotes([a, a]).notes[1].id,
  );
});
it("uses the entire time map and keeps original performance timing", () => {
  const timeMap = {
    secondsToBeats: (s: number) => (s <= 2 ? s * 2 : 4 + (s - 2)),
    beatsToSeconds: (b: number) => (b <= 4 ? b / 2 : 2 + (b - 4)),
  };
  const score = adaptMidiNotes([n(60, 2, 3)], { ...base, timeMap });
  const note = score.measures[1].events.find((e) => e.notes.length)!;
  expect(note.beat).toBe(4);
  expect(note.duration.beats).toBe(1);
  expect(note.notes[0]).toMatchObject({ startSeconds: 2, endSeconds: 3 });
  expect(() =>
    adaptMidiNotes([], { ...base, measureCount: Infinity }),
  ).toThrow();
  expect(() => decomposeDuration(Infinity)).toThrow();
  expect(() => spellPitch(2.5)).toThrow();
});
it("engraves all key signatures, including enharmonic octave boundaries", () => {
  for (let fifths = -7; fifths <= 7; fifths++) {
    expect(keyAlterations({ fifths }).filter(Boolean)).toHaveLength(
      Math.abs(fifths),
    );
    expect(buildKeySignature("k", { fifths }, "treble").children).toHaveLength(
      Math.abs(fifths),
    );
    for (let pitch = 0; pitch <= 127; pitch++) {
      const p = spellPitch(pitch, "sharps", { fifths });
      expect(
        (p.octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][p.step] + p.accidental,
      ).toBe(pitch);
    }
  }
  const score = adaptMidiNotes([n(66, 0, 0.5), n(65, 0.5, 1)], {
    ...base,
    keySignature: { fifths: 1 },
  });
  expect(
    score.measures[0].events.flatMap((e) => e.notes).map((n) => n.accidental),
  ).toEqual([undefined, 0]);
});
it("preserves long values at strong boundaries and splits syncopation", () => {
  expect(meterGroups(6, 8)).toEqual([1.5, 1.5]);
  expect(meterGroups(7, 8)).toEqual([1, 1, 1.5]);
  expect(() => meterGroups(5, 8, [2, 2])).toThrow();
  const whole = adaptMidiNotes([n(60, 0, 2)], { ...base, rhythm: "metrical" });
  expect(whole.measures[0].events[0].duration.denominator).toBe(1);
  const off = adaptMidiNotes([n(60, 0.5, 1.5)], {
    ...base,
    rhythm: "metrical",
  }).measures[0].events.filter((e) => e.notes.length);
  expect(off).toHaveLength(2);
  expect(off[0].notes[0].tieOut).toBe(true);
});
it("assigns conservative voices without splitting exact chords", () => {
  const score = adaptMidiNotes([n(60, 0, 2), n(64, 0, 2), n(67, 0.5, 1)], {
    ...base,
    voices: true,
  });
  const events = score.measures[0].events.filter((e) => e.notes.length);
  expect(events[0].notes).toHaveLength(2);
  expect(new Set(events.map((e) => e.voiceId)).size).toBe(2);
  expect(
    new Set(score.measures.flatMap((m) => m.events.map((e) => e.id))).size,
  ).toBe(score.measures.reduce((s, m) => s + m.events.length, 0));
});
it("beams sixteenths, creates partial beams and stops at rests", () => {
  const score = adaptMidiNotes(
    [n(60, 0, 0.25), n(62, 0.25, 0.5), n(64, 0.5, 0.625), n(65, 1, 1.25)],
    { ...base, numerator: 6, denominator: 8, voices: true, rhythm: "metrical" },
  );
  const layout = layoutScore(score, {
    clef: "treble",
    width: 1000,
    height: 600,
    staffSize: 20,
    measuresPerSystem: 2,
    beaming: true,
  });
  const beams = walk(layout.nodes).filter((n) => n.role === "beam");
  expect(beams.length).toBeGreaterThan(2);
  expect(beams.some((n) => n.connection?.fraction === 0.4)).toBe(true);
  const evaluated = evaluateLayoutNodes(layout.nodes, {
    time: 0.1,
    color: "#000",
    activeColor: "#f00",
    reveal: 0.2,
    release: 0.3,
  });
  expect(
    walk(evaluated)
      .filter((n) => n.role === "beam")
      .every((n) => n.path?.length),
  ).toBe(true);
});
it("shared chord geometry remains connected during whole-chord animation", () => {
  const event = adaptMidiNotes([n(60, 0, 1), n(64, 0, 1)], base).measures[0]
      .events[0],
    node = buildChord(event, "treble");
  expect(node.children!.filter((n) => n.role === "stem")).toHaveLength(1);
  expect(
    node
      .children!.filter((n) => n.note)
      .every((n) => !n.children?.some((c) => c.role === "stem")),
  ).toBe(true);
  const graph = groupNode("root", "root", [node]);
  graph.originX = 2;
  graph.scaleX = 3;
  graph.scaleY = 2;
  graph.rotation = 0.4;
  const anchor = resolveAnchor([graph], node.id, "stemTip");
  expect(anchor?.x).toBeTypeOf("number");
  const before = JSON.stringify(graph);
  evaluateLayoutNodes([graph], {
    time: 0.2,
    color: "#000",
    activeColor: "#f00",
    reveal: 1,
    release: 1,
  });
  expect(JSON.stringify(graph)).toBe(before);
  expect(
    evaluateNoteStyle(evaluateNotePhase(0.5, 0, 1, { reveal: 1, release: 1 }), {
      time: 0.5,
      color: "#000",
      activeColor: "#f00",
      reveal: 1,
      release: 1,
      activeScale: 1.5,
    }).scale,
  ).toBe(1.5);
});
it("registries own immutable copies and invalidate geometry by revision", () => {
  const registry = new GlyphRegistry(),
    revision = registry.revision;
  const glyph = defaultGlyphs.get("noteheadBlack");
  registry.register("custom", glyph);
  expect(registry.revision).toBe(revision + 1);
  expect(Object.isFrozen(registry.get("custom").commands)).toBe(true);
  expect(() => {
    (registry.get("custom").bounds as any).x = 9;
  }).toThrow();
  expect(() =>
    new NotationRenderer(registry).renderNode(
      glyphNode("c", "custom", 0, 0, "glyph", registry),
      { time: 0, color: "#000", activeColor: "#f00", reveal: 0, release: 0 },
    ),
  ).not.toThrow();
});
const camera: Camera = {
  width: 800,
  height: 600,
  yaw: 0,
  pitch: 0,
  distance: 100,
  focalLength: 500,
  near: 1,
  zoom: 1,
  perspective: 1,
};
it("projects holes, orders depth, and clips near-plane intersections", () => {
  expect(
    flattenPath(defaultGlyphs.get("noteheadWhole").commands).filter(
      (c) => c.closed,
    ).length,
  ).toBeGreaterThan(1);
  const nodes = [glyphNode("h", "noteheadWhole")];
  const primitives = projectPrimitives(
    [
      { id: "near", nodes, transform: { x: 0, y: 0, z: 0 } },
      { id: "far", nodes, transform: { x: 0, y: 0, z: 20 } },
    ],
    camera,
    { time: 0, color: "#000", activeColor: "#f00", reveal: 0, release: 0 },
  );
  expect(primitives[0].id).toContain("far");
  expect(
    clipNear(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 2 },
      ],
      1,
      false,
    ),
  ).toEqual([
    { x: 0.5, y: 0.5, z: 1 },
    { x: 1, y: 1, z: 2 },
  ]);
  expect(projectPoint({ x: 0, y: 0, z: 0 }, camera)).toBeUndefined();
  expect(() =>
    projectPrimitives(
      [],
      { ...camera, distance: 0 },
      { time: 0, color: "#000", activeColor: "#f00", reveal: 0, release: 0 },
    ),
  ).toThrow();
});

it("makes simultaneous conflicting accidentals explicit in both voices", () => {
  const score = adaptMidiNotes([n(61, 0, 0.5), n(60, 0, 0.5), n(61, 0.5, 1)], {
    ...base,
    voices: true,
  });
  const attack = score.measures[0].events
    .filter((e) => e.beat === 0)
    .flatMap((e) => e.notes);
  expect(attack.map((n) => n.accidental).sort()).toEqual([0, 1]);
  expect(
    score.measures[0].events
      .filter((e) => e.beat === 1)
      .flatMap((e) => e.notes)[0].accidental,
  ).toBe(1);
});
