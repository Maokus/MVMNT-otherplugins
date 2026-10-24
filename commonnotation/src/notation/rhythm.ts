import type { WrittenDuration } from "./model";
import { finite } from "./midi";
export function meterGroups(
  numerator: number,
  denominator: number,
  override?: readonly number[],
): number[] {
  finite(numerator, "Meter numerator", 1, 256);
  if (!Number.isInteger(numerator) || ![1, 2, 4, 8, 16].includes(denominator))
    throw new RangeError("Invalid meter");
  const groups = override
    ? [...override]
    : denominator >= 8 && numerator >= 6 && numerator % 3 === 0
      ? Array(numerator / 3).fill(3)
      : denominator === 8 && numerator === 5
        ? [2, 3]
        : denominator === 8 && numerator === 7
          ? [2, 2, 3]
          : Array(numerator).fill(1);
  if (
    groups.some((g) => !Number.isInteger(g) || g < 1) ||
    groups.reduce((s, g) => s + g, 0) !== numerator
  )
    throw new RangeError(
      "Beat groups must be positive integers summing to the meter numerator",
    );
  return groups.map((g) => (g * 4) / denominator);
}
export function splitMetrically(
  start: number,
  length: number,
  groups: readonly number[],
  durations: readonly WrittenDuration[],
): WrittenDuration[] {
  finite(start, "Start beat");
  finite(length, "Duration", 0, 100000);
  if (
    !groups.length ||
    groups.some((g) => !Number.isFinite(g) || g <= 0) ||
    !durations.length ||
    durations.some(
      (d) =>
        !Number.isFinite(d.beats) ||
        d.beats < 0.25 ||
        !Number.isInteger(d.beats * 4),
    )
  )
    throw new RangeError("Invalid rhythm values");
  const bar = groups.reduce((s, g) => s + g, 0);
  finite(bar, "Bar length", 0.25, 256);
  const result: WrittenDuration[] = [];
  let cursor = Math.round(start * 4),
    remaining = Math.round(length * 4);
  while (remaining > 0) {
    const local = ((cursor % (bar * 4)) + bar * 4) % (bar * 4);
    let boundary = 0;
    for (const group of groups) {
      boundary += group * 4;
      if (boundary > local) break;
    }
    const available = Math.min(remaining, boundary - local);
    // Values starting off a strong division cannot conceal that division.
    const boundaries = [0];
    for (const g of groups)
      boundaries.push(boundaries[boundaries.length - 1] + g * 4);
    const d =
      durations.find((d) => {
        const ticks = d.beats * 4;
        return (
          ticks <= remaining &&
          ticks <= bar * 4 - local &&
          (local % ticks === 0 || d.beats <= 0.25) &&
          (ticks <= available ||
            (boundaries.includes(local) && boundaries.includes(local + ticks)))
        );
      }) ?? durations[durations.length - 1];
    result.push({ ...d });
    cursor += d.beats * 4;
    remaining -= d.beats * 4;
  }
  return result;
}
