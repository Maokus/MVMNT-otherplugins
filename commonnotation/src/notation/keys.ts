import type { Pitch, Spelling } from "./model";
export interface KeySignature {
  readonly fifths: number;
  readonly mode?: "major" | "minor";
}
const natural = [0, 2, 4, 5, 7, 9, 11],
  sharpOrder = [3, 0, 4, 1, 5, 2, 6],
  flatOrder = [6, 2, 5, 1, 4, 0, 3];
export function keyAlterations(key: KeySignature = { fifths: 0 }): number[] {
  if (!Number.isInteger(key.fifths) || Math.abs(key.fifths) > 7)
    throw new RangeError("Key signature must contain -7 through +7 fifths");
  const result = Array(7).fill(0);
  for (const step of (key.fifths >= 0 ? sharpOrder : flatOrder).slice(
    0,
    Math.abs(key.fifths),
  ))
    result[step] = Math.sign(key.fifths);
  return result;
}
export function spellInKey(
  midi: number,
  preference: Spelling,
  key: KeySignature,
): Pitch {
  const altered = keyAlterations(key),
    pc = ((midi % 12) + 12) % 12;
  const candidates: { pitch: Pitch; cost: number }[] = [];
  for (let step = 0; step < 7; step++)
    for (let accidental = -1; accidental <= 1; accidental++) {
      if ((natural[step] + accidental + 12) % 12 !== pc) continue;
      const octave = Math.round((midi - natural[step] - accidental) / 12) - 1;
      candidates.push({
        pitch: { midi, step, octave, accidental },
        cost:
          (accidental === altered[step] ? 0 : 4) +
          Math.abs(accidental) * 0.2 +
          (accidental === (preference === "sharps" ? 1 : -1) ? 0 : 0.1),
      });
    }
  return candidates.sort(
    (a, b) => a.cost - b.cost || a.pitch.step - b.pitch.step,
  )[0].pitch;
}
const majors = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
];
const minors = [
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "G#",
  "D#",
  "A#",
];
export function keyName(key: KeySignature): string {
  keyAlterations(key);
  return `${(key.mode === "minor" ? minors : majors)[key.fifths + 7]} ${key.mode ?? "major"}`;
}
