import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
import type { TimingApi } from "@mvmnt-app/plugin-sdk/timing";
export interface NormalizedMidiNote extends MidiNoteEvent {
  readonly id: string;
}
export interface MidiDiagnostic {
  readonly index: number;
  readonly message: string;
}
export interface NormalizedMidi {
  readonly notes: readonly NormalizedMidiNote[];
  readonly diagnostics: readonly MidiDiagnostic[];
}
export interface TimeMap {
  secondsToBeats(seconds: number): number;
  beatsToSeconds(beats: number): number;
}
export function finite(
  value: number,
  name: string,
  min = -Infinity,
  max = Infinity,
): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(
      `${name} must be finite and between ${min} and ${max}`,
    );
  return value;
}
export function constantTimeMap(tempo: number): TimeMap {
  finite(tempo, "Tempo", 0.001, 10000);
  return {
    secondsToBeats: (s) => (finite(s, "Seconds") * tempo) / 60,
    beatsToSeconds: (b) => (finite(b, "Beats") * 60) / tempo,
  };
}
export function sdkTimeMap(timing: TimingApi): TimeMap {
  const convert = (result: ReturnType<TimingApi["secondsToBeats"]>): number => {
    if (!result.ok) throw new Error(result.error.message);
    return finite(result.value, "Converted time");
  };
  return {
    secondsToBeats: (s) => convert(timing.secondsToBeats(s)),
    beatsToSeconds: (b) => convert(timing.beatsToSeconds(b)),
  };
}
/** Identity uses source fields, never the current visible-window ordering. */
export function normalizeMidiNotes(
  input: readonly MidiNoteEvent[],
): NormalizedMidi {
  const diagnostics: MidiDiagnostic[] = [],
    valid: MidiNoteEvent[] = [];
  input.forEach((n, index) => {
    if (
      !Number.isInteger(n.note) ||
      n.note < 0 ||
      n.note > 127 ||
      !Number.isFinite(n.startSeconds) ||
      !Number.isFinite(n.endSeconds) ||
      n.endSeconds <= n.startSeconds ||
      typeof n.trackId !== "string" ||
      !Number.isInteger(n.channel) ||
      n.channel < 0 ||
      n.channel > 15
    ) {
      diagnostics.push({
        index,
        message: "Invalid pitch, channel, source or performance interval",
      });
      return;
    }
    valid.push({
      ...n,
      durationSeconds: n.endSeconds - n.startSeconds,
      velocity:
        n.velocity === undefined
          ? undefined
          : Math.max(
              0,
              Math.min(127, Number.isFinite(n.velocity) ? n.velocity : 0),
            ),
    });
  });
  const key = (n: MidiNoteEvent) =>
    JSON.stringify([
      n.trackId,
      n.clipId ?? "",
      n.sourceId ?? "",
      n.channel,
      n.note,
      n.startSeconds,
      n.endSeconds,
    ]);
  valid.sort(
    (a, b) =>
      a.startSeconds - b.startSeconds ||
      a.note - b.note ||
      a.endSeconds - b.endSeconds ||
      key(a).localeCompare(key(b)) ||
      (a.velocity ?? 0) - (b.velocity ?? 0),
  );
  const occurrences = new Map<string, number>();
  const notes = valid.map((n) => {
    const k = key(n),
      ordinal = occurrences.get(k) ?? 0;
    occurrences.set(k, ordinal + 1);
    return Object.freeze({ ...n, id: `${k}:${ordinal}` });
  });
  return { notes, diagnostics };
}
/** Linear comparison avoids serializing a whole composition on every frame. */
export function sameMidiNotes(
  a: readonly MidiNoteEvent[],
  b: readonly MidiNoteEvent[],
): boolean {
  return (
    a.length === b.length &&
    a.every((n, i) => {
      const m = b[i];
      return (
        Object.is(n.note, m.note) &&
        Object.is(n.startSeconds, m.startSeconds) &&
        Object.is(n.endSeconds, m.endSeconds) &&
        Object.is(n.velocity, m.velocity) &&
        n.channel === m.channel &&
        n.trackId === m.trackId &&
        n.clipId === m.clipId &&
        n.sourceId === m.sourceId
      );
    })
  );
}
