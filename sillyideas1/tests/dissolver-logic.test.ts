import { expect, test } from "vitest";
import {
  anchorCell,
  cellScale,
  DEFAULT_EXPANSION_FIELD,
  dissolvedScale,
  easeInOut,
  expandedGrid,
  fieldDistance,
  fitReturnTiming,
  onsetColumn,
} from "../src/dissolver-logic.ts";
import {
  buildMusicalSlots,
  subdivisionBeats,
  timeUnitStartBeat,
} from "../src/musical-grid.ts";

test("projects onsets into equally spaced one-bar sixteenth-note columns", () => {
  const columns = buildMusicalSlots(4, subdivisionBeats("1/16")).length;
  expect(columns).toBe(16);
  expect(onsetColumn(4, 4, 0.25, columns)).toBe(0);
  expect(onsetColumn(5.24, 4, 0.25, columns)).toBe(4);
  expect(onsetColumn(7.99, 4, 0.25, columns)).toBe(15);
  expect(timeUnitStartBeat(7.99, 4)).toBe(4);
  expect(timeUnitStartBeat(8, 4)).toBe(8);
});

test("density inserts circles between time and note anchors", () => {
  const grid = expandedGrid(3, 2, 2, 3, 0);
  expect(grid.columns).toBe(5);
  expect(grid.rows).toBe(4);
  expect(anchorCell(0, 0, grid)).toEqual({ column: 0, row: 0 });
  expect(anchorCell(1, 1, grid)).toEqual({ column: 2, row: 3 });
  expect(anchorCell(2, 1, grid)).toEqual({ column: 4, row: 3 });
  expect(expandedGrid(3, 2, 1, 1, 0)).toMatchObject({ columns: 3, rows: 2 });
});

test("padding adds equally spaced cells on every edge without moving anchors off-grid", () => {
  const grid = expandedGrid(3, 2, 2, 3, 2);
  expect(grid.columns).toBe(9);
  expect(grid.rows).toBe(8);
  expect(anchorCell(0, 0, grid)).toEqual({ column: 2, row: 2 });
  expect(anchorCell(2, 1, grid)).toEqual({ column: 6, row: 5 });
  const onset = [{ ...anchorCell(0, 0, grid), seconds: 0 }];
  expect(dissolvedScale(0, 0, onset, 1, 1, grid.columns, grid.rows)).toBe(0);
  expect(dissolvedScale(8, 7, onset, 1, 1, grid.columns, grid.rows)).toBe(0);
  expect(dissolvedScale(2, 2, onset, 1, 1, grid.columns, grid.rows)).toBe(1);
});

test("each circle scales smoothly in and out", () => {
  expect(easeInOut(0)).toBe(0);
  expect(easeInOut(0.25)).toBeCloseTo(0.15625);
  expect(easeInOut(0.5)).toBe(0.5);
  expect(easeInOut(0.75)).toBeCloseTo(0.84375);
  expect(easeInOut(1)).toBe(1);
});

test("a ripple reaches every non-onset circle at the unit boundary", () => {
  const onsets = [{ column: 1, row: 1, seconds: 0.5 }];
  const scale = (column: number, row: number, seconds: number) =>
    dissolvedScale(column, row, onsets, seconds, 2, 4, 3);
  expect(scale(1, 1, 1.5)).toBe(1);
  expect(scale(2, 1, 0.5)).toBe(1);
  expect(scale(2, 1, 0.6)).toBeLessThan(1);
  expect(scale(3, 2, 1)).toBe(1);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      expect(scale(column, row, 2)).toBe(column === 1 && row === 1 ? 1 : 0);
    }
  }
});

test("overlapping ripples keep every played center full size", () => {
  const onsets = [
    { column: 0, row: 0, seconds: 0 },
    { column: 1, row: 0, seconds: 1 },
  ];
  expect(dissolvedScale(1, 0, onsets, 0.9, 2, 3, 1)).toBeLessThan(1);
  expect(dissolvedScale(1, 0, onsets, 1, 2, 3, 1)).toBe(1);
  expect(dissolvedScale(0, 0, onsets, 1.5, 2, 3, 1)).toBe(1);
  expect(dissolvedScale(2, 0, onsets, 2, 2, 3, 1)).toBe(0);
});

test("a late onset still reaches the far corner and a one-cell grid stays visible", () => {
  const late = [{ column: 0, row: 0, seconds: 1.99 }];
  expect(dissolvedScale(3, 2, late, 1.99, 2, 4, 3)).toBe(1);
  expect(dissolvedScale(3, 2, late, 2, 2, 4, 3)).toBe(0);
  expect(dissolvedScale(0, 0, late, 2, 2, 1, 1)).toBe(1);
});

test("diamond uses taxicab distance and noisy field is stable", () => {
  const onset = { column: 0, row: 0, seconds: 0 };
  const circle = DEFAULT_EXPANSION_FIELD;
  const diamond = { ...circle, shape: "diamond" as const };
  const noisy = { ...circle, shape: "noisy" as const, noiseAmount: 2 };
  expect(fieldDistance(2, 2, onset, circle)).toBeCloseTo(Math.SQRT2 * 2);
  expect(fieldDistance(2, 2, onset, diamond)).toBe(4);
  const textured = fieldDistance(2, 2, onset, noisy);
  expect(textured).toBe(fieldDistance(2, 2, onset, noisy));
  expect(textured).not.toBe(fieldDistance(2, 2, onset, circle));
  expect(dissolvedScale(2, 2, [onset], 0.5, 1, 4, 4, diamond)).toBeGreaterThan(
    dissolvedScale(2, 2, [onset], 0.5, 1, 4, 4, circle),
  );
});

test("speed changes expansion timing while every field completes at the boundary", () => {
  const onsets = [{ column: 0, row: 0, seconds: 0 }];
  for (const shape of ["circle", "diamond", "noisy"] as const) {
    const slow = { ...DEFAULT_EXPANSION_FIELD, shape, speed: 0.5 };
    const fast = { ...DEFAULT_EXPANSION_FIELD, shape, speed: 3 };
    expect(dissolvedScale(2, 0, onsets, 0.5, 1, 5, 2, fast)).toBeLessThan(
      dissolvedScale(2, 0, onsets, 0.5, 1, 5, 2, slow),
    );
    expect(dissolvedScale(4, 1, onsets, 1, 1, 5, 2, slow)).toBe(0);
    expect(dissolvedScale(4, 1, onsets, 1, 1, 5, 2, fast)).toBe(0);
  }
});

test("gradient softens the front without changing its endpoint", () => {
  const onsets = [{ column: 0, row: 0, seconds: 0 }];
  const sharp = { ...DEFAULT_EXPANSION_FIELD, gradient: 0.1 };
  const soft = { ...DEFAULT_EXPANSION_FIELD, gradient: 2 };
  expect(dissolvedScale(1, 0, onsets, 0.1, 1, 4, 1, sharp)).toBeLessThan(
    dissolvedScale(1, 0, onsets, 0.1, 1, 4, 1, soft),
  );
  expect(dissolvedScale(3, 0, onsets, 1, 1, 4, 1, sharp)).toBe(0);
  expect(dissolvedScale(3, 0, onsets, 1, 1, 4, 1, soft)).toBe(0);
});

test("return is staggered and current ripples can interrupt it", () => {
  const base = {
    columns: 3,
    rows: 1,
    row: 0,
    currentOnsets: [] as { column: number; row: number; seconds: number }[],
    previousOnsets: [{ column: 0, row: 0, seconds: 0 }],
    boundarySeconds: 2,
    currentEndSeconds: 4,
    previousStartSeconds: 0,
    returnSeconds: 0.4,
    returnStaggerSeconds: 0.4,
  };
  expect(cellScale({ ...base, column: 1, nowSeconds: 2 })).toBe(0);
  expect(cellScale({ ...base, column: 1, nowSeconds: 2.2 })).toBeCloseTo(0);
  expect(cellScale({ ...base, column: 1, nowSeconds: 2.4 })).toBeCloseTo(0.5);
  expect(cellScale({ ...base, column: 2, nowSeconds: 2.4 })).toBeCloseTo(0);
  expect(cellScale({ ...base, column: 2, nowSeconds: 2.8 })).toBe(1);
  expect(
    cellScale({
      ...base,
      column: 1,
      nowSeconds: 3,
      currentOnsets: [{ column: 2, row: 0, seconds: 2.1 }],
    }),
  ).toBeLessThan(1);
  expect(
    cellScale({
      ...base,
      column: 1,
      nowSeconds: 2.4,
      currentOnsets: [{ column: 1, row: 0, seconds: 2.1 }],
    }),
  ).toBe(1);
});

test("overlong stagger and return fit within the next time unit", () => {
  expect(fitReturnTiming(8, 8, 1)).toEqual({
    durationSeconds: 0.5,
    staggerSeconds: 0.5,
  });
  const args = {
    column: 1,
    row: 0,
    columns: 2,
    rows: 1,
    currentOnsets: [],
    previousOnsets: [{ column: 0, row: 0, seconds: 0 }],
    boundarySeconds: 1,
    currentEndSeconds: 2,
    previousStartSeconds: 0,
    returnSeconds: 8,
    returnStaggerSeconds: 8,
  };
  expect(cellScale({ ...args, nowSeconds: 1.75 })).toBeCloseTo(0.5);
  expect(cellScale({ ...args, nowSeconds: 2 })).toBe(1);
});
