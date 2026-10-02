import { expect, test } from "vitest";
import {
  animationProgress,
  applyEasing,
  buildMusicalSlots,
  fitExitTiming,
  hasMidiOnsetInRange,
  parseTimeUnitBars,
  resolveSlotSettlement,
  staggerDelay,
  subdivisionBeats,
} from "../src/mismatched-negatives-logic.ts";

test("normalizes persisted time-unit select values", () => {
  expect(parseTimeUnitBars("0.5")).toBe(0.5);
  expect(parseTimeUnitBars("2")).toBe(2);
  expect(parseTimeUnitBars(4)).toBe(4);
});

test("builds a visibly larger window when the time unit grows", () => {
  expect(buildMusicalSlots(4, subdivisionBeats("1/16"))).toHaveLength(16);
  expect(buildMusicalSlots(8, subdivisionBeats("1/16"))).toHaveLength(32);
});

test("supports small dotted and triplet subdivisions without dropping the final partial slot", () => {
  expect(subdivisionBeats("1/64-dotted")).toBe(3 / 32);
  expect(subdivisionBeats("1/64-triplet")).toBe(1 / 24);
  const dotted = buildMusicalSlots(4, subdivisionBeats("1/16-dotted"));
  expect(dotted).toHaveLength(11);
  expect(dotted.at(-1)?.endBeat).toBe(4);
});

test("only note onsets inside a slot block it", () => {
  expect(hasMidiOnsetInRange([{ startSeconds: 0.5 }], 1, 2)).toBe(false);
  expect(hasMidiOnsetInRange([{ startSeconds: 1 }], 1, 2)).toBe(true);
  expect(hasMidiOnsetInRange([{ startSeconds: 2 }], 1, 2)).toBe(false);
});

test("animation duration and easing control progress", () => {
  expect(animationProgress(0.25, 0.5)).toBe(0.5);
  expect(applyEasing("linear", 0.5)).toBe(0.5);
  expect(applyEasing("easeOutCubic", 0.5)).toBe(0.875);
});

test("slide-out delays are staggered across the configured span", () => {
  expect(staggerDelay(0, 5, 0.4)).toBe(0);
  expect(staggerDelay(2, 5, 0.4)).toBe(0.2);
  expect(staggerDelay(4, 5, 0.4)).toBe(0.4);
});

test("overlong exit timing is proportionally contained within one time unit", () => {
  const timing = fitExitTiming(3, 2, 2);
  expect(timing.durationSeconds).toBeCloseTo(1.2);
  expect(timing.staggerSeconds).toBeCloseTo(0.8);
});

test("a clashing entrance waits for the smooth exit to finish", () => {
  const base = {
    previousEntranceElapsed: 1,
    previousBlocked: false,
    exitDelay: 0.1,
    exitDuration: 0.2,
    entranceStart: 0.3,
    entranceDuration: 0.2,
    blocked: false,
    exitEasing: "linear",
    entranceEasing: "linear",
  } as const;
  expect(resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.1 })).toBe(1);
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.2 }),
  ).toBeCloseTo(0.5);
  expect(resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.3 })).toBe(0);
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.4 }),
  ).toBeCloseTo(0.5);
});

test("an unfinished entrance keeps moving during its stagger delay", () => {
  const base = {
    previousEntranceElapsed: 0.2,
    previousBlocked: false,
    exitDelay: 0.4,
    exitDuration: 0.2,
    entranceStart: 0.6,
    entranceDuration: 1,
    blocked: false,
    exitEasing: "linear",
    entranceEasing: "linear",
  } as const;
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0 }),
  ).toBeCloseTo(0.2);
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.2 }),
  ).toBeCloseTo(0.4);
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.4 }),
  ).toBeCloseTo(0.6);
  expect(
    resolveSlotSettlement({ ...base, elapsedSinceBoundary: 0.5 }),
  ).toBeCloseTo(0.3);
});
