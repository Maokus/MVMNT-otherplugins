import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
export interface SchematicSource {
  id: string;
  name: string;
  notes: readonly MidiNoteEvent[];
}
/** Thirty-two measures, three complementary voices, including chromatic and compound rhythms. */
export const schematicDemo: readonly SchematicSource[] = Array.from(
  { length: 3 },
  (_, track) => {
    const id = `demo:${track}`,
      notes: MidiNoteEvent[] = [];
    for (let bar = 0; bar < 32; bar++) {
      const harmony = [0, 5, 9, 7][Math.floor(bar / 2) % 4],
        root = (track === 2 ? 36 : 60) + harmony;
      const count = track === 2 ? 2 : track === 1 ? 4 : 8;
      for (let step = 0; step < count; step++) {
        const beat = bar * 4 + (step * 4) / count,
          degree = [0, 2, 4, 7, 9, 11, 7, 4][(step + bar) % 8];
        const pitches =
          track === 1 && step === 0
            ? [root, root + 4, root + 7]
            : [
                root +
                  (track === 2 ? step * 7 : degree) +
                  (bar % 7 === 3 && step === 2 ? 1 : 0),
              ];
        for (const note of pitches) {
          const duration =
            track === 2 ? 1.8 : step % 3 === 0 ? 0.75 : track === 0 ? 0.5 : 1;
          notes.push({
            trackId: id,
            channel: track,
            note,
            velocity: 45 + ((bar * 7 + step * 13) % 75),
            startSeconds: beat / 2,
            endSeconds: (beat + duration) / 2,
            durationSeconds: duration / 2,
          });
        }
      }
    }
    return {
      id,
      name: ["I · Motif", "II · Harmonic field", "III · Foundation"][track],
      notes,
    };
  },
);
