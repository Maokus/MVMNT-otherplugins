import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
import {
  normalizeMidiNotes,
  constantTimeMap,
  finite,
  type TimeMap,
} from "./midi";
import { keyAlterations, spellInKey, type KeySignature } from "./keys";
import { meterGroups, splitMetrically } from "./rhythm";
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
  velocity?: number;
  channel?: number;
  trackId?: string;
  voiceId?: string;
}
export interface ScoreEvent {
  id: string;
  beat: number;
  duration: WrittenDuration;
  notes: ScoreNote[];
  voiceId?: string;
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
  keySignature?: KeySignature;
  beatGroups?: readonly number[];
}
export interface MidiOptions {
  tempo: number;
  numerator: number;
  denominator: number;
  startSeconds?: number;
  firstMeasure?: number;
  measureCount?: number;
  spelling?: Spelling;
  timeMap?: TimeMap;
  keySignature?: KeySignature;
  rhythm?: "legacy" | "metrical";
  beatGroups?: readonly number[];
  voices?: boolean;
  voiceIds?: Readonly<Record<string, string>>;
}
const sharpSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const flatSteps = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const natural = [0, 2, 4, 5, 7, 9, 11];
export function spellPitch(
  midi: number,
  spelling: Spelling = "sharps",
  key?: KeySignature,
): Pitch {
  finite(midi, "MIDI pitch", 0, 127);
  if (!Number.isInteger(midi))
    throw new RangeError("MIDI pitch must be integral");
  if (key) return spellInKey(midi, spelling, key);
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
  finite(beats, "Duration", 0, 100000);
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
  finite(count, "Measure count", 1, 4096);
  const measures: Measure[] = Array.from({ length: count }, (_, i) => ({
    index: first + i,
    events: [],
  }));
  finite(origin, "Score start");
  finite(first, "First measure", 0, 10000000);
  finite(count, "Measure count", 1, 4096);
  if (
    !Number.isFinite(options.firstMeasure ?? 0) ||
    !Number.isFinite(options.measureCount ?? 4)
  )
    throw new RangeError("Invalid measure range");
  const map = options.timeMap ?? constantTimeMap(tempo),
    originBeat = finite(map.secondsToBeats(origin), "Origin beat");
  const groups = meterGroups(numerator, denominator, options.beatGroups);
  const split = (start: number, beats: number) =>
    options.rhythm === "metrical"
      ? splitMetrically(start, beats, groups, durations)
      : decomposeDuration(beats);
  const sorted = normalizeMidiNotes(input).notes;
  const lanes = new Map<string, { end: number; voice: string }[]>(),
    assignments = new Map<string, string>(),
    usedVoices = new Set<string>();
  for (const n of sorted) {
    const sourceId = n.id;
    const start =
      Math.round(
        (finite(map.secondsToBeats(n.startSeconds), "Note beat") - originBeat) *
          4,
      ) / 4;
    const end = Math.max(
      start + 0.25,
      Math.round(
        (finite(map.secondsToBeats(n.endSeconds), "Note end beat") -
          originBeat) *
          4,
      ) / 4,
    );
    const partition = `${n.trackId}:${n.channel}`,
      chordKey = `${partition}:${start}:${end}`;
    let voice = options.voiceIds?.[sourceId] ?? assignments.get(chordKey);
    if (!voice) {
      const list = lanes.get(partition) ?? [];
      let lane = list.findIndex((l) => l.end <= start);
      if (lane < 0) {
        lane = list.length;
        list.push({ end, voice: `${partition}:${lane}` });
      } else list[lane].end = end;
      lanes.set(partition, list);
      voice = list[lane].voice;
      assignments.set(chordKey, voice);
    }
    usedVoices.add(voice);
    for (
      let measureIndex = Math.max(0, Math.floor(start / bar) - first);
      measureIndex < Math.min(count, Math.ceil(end / bar) - first);
      measureIndex++
    ) {
      const measure = measures[measureIndex];
      const left = measure.index * bar,
        right = left + bar;
      let cursor = Math.max(start, left);
      const stop = Math.min(end, right);
      if (cursor >= stop) continue;
      for (const duration of split(cursor, stop - cursor)) {
        const note: ScoreNote = {
          id: `${sourceId}@${cursor}`,
          sourceId,
          pitch: spellPitch(n.note, options.spelling, options.keySignature),
          velocity: n.velocity,
          channel: n.channel,
          trackId: n.trackId,
          voiceId: options.voices ? voice : undefined,
          startSeconds: n.startSeconds,
          endSeconds: n.endSeconds,
          tieIn: cursor > start,
          tieOut: cursor + duration.beats < end,
        };
        let event = measure.events.find(
          (e) =>
            e.beat === cursor &&
            e.duration.beats === duration.beats &&
            (!options.voices || e.voiceId === voice),
        );
        if (!event) {
          event = {
            id: `m${measure.index}:${cursor}:${duration.beats}${options.voices ? `:${voice}` : ""}`,
            beat: cursor,
            duration,
            notes: [],
            voiceId: options.voices ? voice : undefined,
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
      for (const duration of split(from, to - from)) {
        gaps.push({ id: `rest:${from}`, beat: from, duration, notes: [] });
        from += duration.beats;
      }
    };
    const accidentals = new Map<number, number>();
    const alterations = new Map<string, Set<number>>();
    for (const event of measure.events)
      for (const note of event.notes) {
        const key = `${event.beat}:${note.pitch.octave * 7 + note.pitch.step}`,
          set = alterations.get(key) ?? new Set<number>();
        set.add(note.pitch.accidental);
        alterations.set(key, set);
      }
    const defaults = keyAlterations(options.keySignature);
    for (const event of measure.events) {
      if (event.beat > cursor) rest(cursor, event.beat);
      cursor = Math.max(cursor, event.beat + event.duration.beats);
      event.notes.sort(
        (a, b) => a.pitch.midi - b.pitch.midi || a.id.localeCompare(b.id),
      );
      for (const note of event.notes) {
        const p = note.pitch,
          key = p.octave * 7 + p.step;
        const previous = accidentals.get(key) ?? defaults[p.step];
        if ((alterations.get(`${event.beat}:${key}`)?.size ?? 0) > 1) {
          note.accidental = p.accidental;
          accidentals.set(key, NaN);
        } else if (!note.tieIn) {
          if (previous !== p.accidental) note.accidental = p.accidental;
          accidentals.set(key, p.accidental);
        }
      }
    }
    rest(cursor, (measure.index + 1) * bar);
    measure.events.push(...gaps);
    measure.events.sort((a, b) => a.beat - b.beat);
  }
  if (options.voices) {
    const voices = [...usedVoices];
    for (const measure of measures) {
      measure.events = measure.events.filter((e) => e.notes.length);
      for (const voice of voices) {
        let cursor = measure.index * bar;
        const events = measure.events.filter((e) => e.voiceId === voice);
        const rests: ScoreEvent[] = [];
        const rest = (end: number) => {
          for (const duration of split(cursor, end - cursor)) {
            rests.push({
              id: `rest:${voice}:${cursor}`,
              beat: cursor,
              duration,
              notes: [],
              voiceId: voice,
            });
            cursor += duration.beats;
          }
        };
        for (const event of events) {
          if (event.beat > cursor) rest(event.beat);
          cursor = Math.max(cursor, event.beat + event.duration.beats);
        }
        rest((measure.index + 1) * bar);
        measure.events.push(...rests);
      }
      measure.events.sort(
        (a, b) =>
          a.beat - b.beat || (a.voiceId ?? "").localeCompare(b.voiceId ?? ""),
      );
    }
  }
  return {
    measures,
    beatsPerMeasure: bar,
    numerator,
    denominator,
    keySignature: options.keySignature,
    beatGroups: groups,
  };
}
