import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
export type Clef = "treble" | "bass";
export type Spelling = "sharps" | "flats";
export interface Pitch {
  midi: number;
  step: number;
  octave: number;
  accidental: number;
}
export interface WrittenDuration {
  beats: number;
  denominator: 1 | 2 | 4 | 8 | 16;
  dotted: boolean;
}
export interface ScoreNote {
  id: string;
  sourceId: string;
  pitch: Pitch;
  startSeconds: number;
  endSeconds: number;
  tieIn: boolean;
  tieOut: boolean;
  accidental?: number;
}
export interface ScoreEvent {
  id: string;
  beat: number;
  duration: WrittenDuration;
  notes: ScoreNote[];
}
export interface Measure {
  index: number;
  events: ScoreEvent[];
}
export interface Score {
  measures: Measure[];
  beatsPerMeasure: number;
  numerator: number;
  denominator: number;
}
export interface MidiOptions {
  tempo: number;
  numerator: number;
  denominator: number;
  startSeconds?: number;
  firstMeasure?: number;
  measureCount?: number;
  spelling?: Spelling;
}
const sharpSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const flatSteps = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const natural = [0, 2, 4, 5, 7, 9, 11];
export function spellPitch(midi: number, spelling: Spelling = "sharps"): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const step = (spelling === "flats" ? flatSteps : sharpSteps)[pc];
  return {
    midi,
    step,
    octave: Math.floor(midi / 12) - 1,
    accidental: pc - natural[step],
  };
}
/** Half-space staff steps, positive upwards from the bottom line. */
export function staffPosition(pitch: Pitch, clef: Clef): number {
  return (
    pitch.octave * 7 + pitch.step - (clef === "treble" ? 4 * 7 + 2 : 2 * 7 + 4)
  );
}
export const durations: readonly WrittenDuration[] = [
  { beats: 6, denominator: 1, dotted: true },
  { beats: 4, denominator: 1, dotted: false },
  { beats: 3, denominator: 2, dotted: true },
  { beats: 2, denominator: 2, dotted: false },
  { beats: 1.5, denominator: 4, dotted: true },
  { beats: 1, denominator: 4, dotted: false },
  { beats: 0.75, denominator: 8, dotted: true },
  { beats: 0.5, denominator: 8, dotted: false },
  { beats: 0.25, denominator: 16, dotted: false },
];
export function decomposeDuration(beats: number): WrittenDuration[] {
  let ticks = Math.max(0, Math.round(beats * 4));
  const result: WrittenDuration[] = [];
  while (ticks) {
    const d = durations.find((d) => d.beats * 4 <= ticks)!;
    result.push({ ...d });
    ticks -= d.beats * 4;
  }
  return result;
}
export function adaptMidiNotes(
  input: readonly MidiNoteEvent[],
  options: MidiOptions,
): Score {
  const { tempo, numerator, denominator } = options;
  if (
    !Number.isFinite(tempo) ||
    tempo <= 0 ||
    !Number.isInteger(numerator) ||
    numerator < 1 ||
    ![1, 2, 4, 8, 16].includes(denominator)
  )
    throw new Error("Invalid score tempo or meter");
  const bar = (numerator * 4) / denominator,
    origin = options.startSeconds ?? 0;
  const first = Math.max(0, Math.floor(options.firstMeasure ?? 0)),
    count = Math.max(1, Math.floor(options.measureCount ?? 4));
  const measures: Measure[] = Array.from({ length: count }, (_, i) => ({
    index: first + i,
    events: [],
  }));
  const sorted = input
    .filter(
      (n) =>
        Number.isInteger(n.note) &&
        n.note >= 0 &&
        n.note <= 127 &&
        Number.isFinite(n.startSeconds) &&
        Number.isFinite(n.endSeconds) &&
        n.endSeconds > n.startSeconds,
    )
    .slice()
    .sort(
      (a, b) =>
        a.startSeconds - b.startSeconds ||
        a.note - b.note ||
        a.endSeconds - b.endSeconds ||
        a.trackId.localeCompare(b.trackId) ||
        a.channel - b.channel ||
        (a.clipId ?? "").localeCompare(b.clipId ?? ""),
    );
  const occurrences = new Map<string, number>();
  for (const n of sorted) {
    const key = JSON.stringify([
      n.trackId,
      n.clipId,
      n.sourceId,
      n.channel,
      n.note,
      n.startSeconds,
      n.endSeconds,
    ]);
    const ordinal = occurrences.get(key) ?? 0;
    occurrences.set(key, ordinal + 1);
    const sourceId = `${key}:${ordinal}`;
    const start =
      Math.round((((n.startSeconds - origin) * tempo) / 60) * 4) / 4;
    const end = Math.max(
      start + 0.25,
      Math.round((((n.endSeconds - origin) * tempo) / 60) * 4) / 4,
    );
    for (const measure of measures) {
      const left = measure.index * bar,
        right = left + bar;
      let cursor = Math.max(start, left);
      const stop = Math.min(end, right);
      if (cursor >= stop) continue;
      for (const duration of decomposeDuration(stop - cursor)) {
        const note: ScoreNote = {
          id: `${sourceId}@${cursor}`,
          sourceId,
          pitch: spellPitch(n.note, options.spelling),
          startSeconds: n.startSeconds,
          endSeconds: n.endSeconds,
          tieIn: cursor > start,
          tieOut: cursor + duration.beats < end,
        };
        let event = measure.events.find(
          (e) => e.beat === cursor && e.duration.beats === duration.beats,
        );
        if (!event) {
          event = {
            id: `m${measure.index}:${cursor}:${duration.beats}`,
            beat: cursor,
            duration,
            notes: [],
          };
          measure.events.push(event);
        }
        event.notes.push(note);
        cursor += duration.beats;
      }
    }
  }
  for (const measure of measures) {
    measure.events.sort(
      (a, b) => a.beat - b.beat || b.duration.beats - a.duration.beats,
    );
    let cursor = measure.index * bar;
    const gaps: ScoreEvent[] = [];
    const rest = (from: number, to: number) => {
      for (const duration of decomposeDuration(to - from)) {
        gaps.push({ id: `rest:${from}`, beat: from, duration, notes: [] });
        from += duration.beats;
      }
    };
    const accidentals = new Map<number, number>();
    for (const event of measure.events) {
      if (event.beat > cursor) rest(cursor, event.beat);
      cursor = Math.max(cursor, event.beat + event.duration.beats);
      event.notes.sort(
        (a, b) => a.pitch.midi - b.pitch.midi || a.id.localeCompare(b.id),
      );
      for (const note of event.notes) {
        const p = note.pitch,
          key = p.octave * 7 + p.step;
        const previous = accidentals.get(key) ?? 0;
        if (!note.tieIn) {
          if (previous !== p.accidental) note.accidental = p.accidental;
          accidentals.set(key, p.accidental);
        }
      }
    }
    rest(cursor, (measure.index + 1) * bar);
    measure.events.push(...gaps);
    measure.events.sort((a, b) => a.beat - b.beat);
  }
  return { measures, beatsPerMeasure: bar, numerator, denominator };
}
