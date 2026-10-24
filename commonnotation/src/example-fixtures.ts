import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
import {
  GlyphRegistry,
  normalizeMidiNotes,
  type MidiOptions,
  type TimeMap,
} from "./notation";
/** Performance values are in seconds; beat fixtures below use a reference 120 BPM. */
export function exampleNote(
  pitch: number,
  startBeat: number,
  endBeat: number,
  channel = 0,
): MidiNoteEvent {
  return {
    trackId: "lab",
    channel,
    note: pitch,
    velocity: 86,
    startSeconds: startBeat / 2,
    endSeconds: endBeat / 2,
    durationSeconds: (endBeat - startBeat) / 2,
  };
}
export const labTimeMap: TimeMap = {
  secondsToBeats: (s) => (s <= 2 ? s * 2 : 4 + (s - 2)),
  beatsToSeconds: (b) => (b <= 4 ? b / 2 : 2 + (b - 4)),
};
export const beamFixture = [
  exampleNote(64, 0, 0.5),
  exampleNote(67, 0.5, 0.75),
  exampleNote(69, 0.75, 1),
  exampleNote(71, 1, 1.25),
  exampleNote(69, 1.25, 1.75),
  exampleNote(67, 1.75, 2),
  exampleNote(65, 3, 3.5),
  exampleNote(64, 3.5, 4),
];
export const jitteredBeamFixture = beamFixture.map((note, i) => {
  const offset = [0.015, -0.018, 0.012, -0.01][i % 4];
  return {
    ...note,
    startSeconds: note.startSeconds + offset,
    endSeconds: note.endSeconds + offset,
  };
});
export const compoundFixture = Array.from({ length: 14 }, (_, i) =>
  exampleNote(64 + [0, 2, 4, 7][i % 4], i * 0.25, (i + 1) * 0.25),
);
export const keyFixture = [66, 65, 66, 67].map((pitch, i) =>
  exampleNote(pitch, i, i + 1),
);
export const voiceFixture = [
  exampleNote(48, 0, 4),
  exampleNote(55, 0, 4),
  exampleNote(72, 0, 1),
  exampleNote(71, 1, 2),
  exampleNote(69, 2, 3),
  exampleNote(67, 3, 4),
];
export function explicitLabVoices(): NonNullable<MidiOptions["voiceIds"]> {
  return Object.fromEntries(
    normalizeMidiNotes(voiceFixture).notes.map((n) => [
      n.id,
      n.note < 60 ? "lower" : "upper",
    ]),
  );
}
export const rhythmFixture = [exampleNote(64, 1, 3)];
export const timingFixture = [60, 62, 64, 67].map((pitch, i) => ({
  ...exampleNote(pitch, 0, 1),
  startSeconds: i,
  endSeconds: i + 0.45,
  durationSeconds: 0.45,
}));
export const engravingExample: readonly MidiNoteEvent[] = [
  ...beamFixture,
  ...voiceFixture.map((n) => ({
    ...n,
    startSeconds: n.startSeconds + 2,
    endSeconds: n.endSeconds + 2,
  })),
  ...keyFixture.map((n) => ({
    ...n,
    startSeconds: n.startSeconds + 4,
    endSeconds: n.endSeconds + 4,
  })),
  exampleNote(64, 13, 15),
  exampleNote(67, 15, 17),
];
/** Each example owns its registry; registration never changes the shared default registry. */
export function makeExampleRegistry(): GlyphRegistry {
  const registry = new GlyphRegistry();
  registry.register("exampleDiamond", {
    advance: 1.3,
    bounds: { x: 0, y: -0.55, width: 1.3, height: 1.1 },
    anchors: { stemUpSE: { x: 1.3, y: 0 }, stemDownNW: { x: 0, y: 0 } },
    commands: [
      { type: "moveTo", x: 0, y: 0 },
      { type: "lineTo", x: 0.65, y: -0.55 },
      { type: "lineTo", x: 1.3, y: 0 },
      { type: "lineTo", x: 0.65, y: 0.55 },
      { type: "closePath" },
    ],
  });
  return registry;
}
