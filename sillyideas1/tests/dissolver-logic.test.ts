import { expect, test } from "vitest";
import {
  anchorCell,
  cellScale,
  DEFAULT_EXPANSION_FIELD,
  dissolvedScale,
  easeInOut,
  expandedGrid,
  expansionFront,
  fieldDistance,
  fitReturnTiming,
  onsetColumn,
} from "../src/dissolver-logic.ts";
import { markPolygonPoints } from "../src/dissolver-shapes.ts";
import { dissolver } from "../src/dissolver.ts";
import {
  buildMusicalSlots,
  subdivisionBeats,
  timeUnitStartBeat,
} from "../src/musical-grid.ts";

test("projects onsets onto an equally spaced grid with density and padding", () => {
  const columns = buildMusicalSlots(4, subdivisionBeats("1/16")).length;
  expect(columns).toBe(16);
  expect(onsetColumn(5.24, 4, 0.25, columns)).toBe(4);
  expect(timeUnitStartBeat(8, 4)).toBe(8);
  const grid = expandedGrid(3, 2, 2, 3, 2);
  expect(grid).toMatchObject({ columns: 9, rows: 8 });
  expect(anchorCell(0, 0, grid)).toEqual({ column: 2, row: 2 });
  expect(anchorCell(1, 1, grid)).toEqual({ column: 4, row: 5 });
  expect(anchorCell(2, 1, grid)).toEqual({ column: 6, row: 5 });
  expect(expandedGrid(3, 2, 1, 1, 0)).toMatchObject({ columns: 3, rows: 2 });
});

test("inspector defaults to noisy and shows shape-specific controls when relevant", () => {
  const properties = dissolver.schema.tabs.flatMap((tab) =>
    tab.groups.flatMap((group) => group.properties),
  );
  const property = (key: string) =>
    properties.find((candidate) => candidate.key === key);
  expect(property("expansionShape")?.default).toBe("noisy");
  expect(property("horizontalDensity")?.default).toBe(3);
  expect(property("noiseAmount")?.default).toBe(2.75);
  expect(property("noiseAmount")?.visibleWhen).toEqual([
    { key: "expansionShape", equals: "noisy" },
  ]);
  expect(property("noiseScale")?.visibleWhen).toEqual([
    { key: "expansionShape", equals: "noisy" },
  ]);
  expect(property("burstDecaySeconds")?.visibleWhen).toEqual([
    { key: "initialBurst", notEquals: 0 },
  ]);
  expect(property("markRotation")?.visibleWhen).toEqual([
    { key: "markShape", notEquals: "circle" },
  ]);
});

test("grid marks have distinct centered shapes and configurable rotation", () => {
  expect(markPolygonPoints("square", 10, 20, 2, 0)).toHaveLength(8);
  expect(markPolygonPoints("diamond", 10, 20, 2, 0)).toHaveLength(8);
  expect(markPolygonPoints("triangle", 10, 20, 2, 0)).toHaveLength(6);
  expect(markPolygonPoints("hexagon", 10, 20, 2, 0)).toHaveLength(12);
  expect(markPolygonPoints("diamond", 10, 20, 2, 0).slice(0, 2)).toEqual([
    10, 18,
  ]);
  const rotated = markPolygonPoints("diamond", 10, 20, 2, Math.PI / 2);
  expect(rotated[0]).toBeCloseTo(12);
  expect(rotated[1]).toBeCloseTo(20);
  const small = markPolygonPoints("hexagon", 10, 20, 1, 0);
  const large = markPolygonPoints("hexagon", 10, 20, 2, 0);
  expect(Math.hypot(small[0] - 10, small[1] - 20)).toBeCloseTo(1);
  expect(Math.hypot(large[0] - 10, large[1] - 20)).toBeCloseTo(2);
});

test("the front begins faster and settles to a constant speed", () => {
  const field = DEFAULT_EXPANSION_FIELD;
  const early = expansionFront(0.05, field) - expansionFront(0, field);
  const late = expansionFront(0.55, field) - expansionFront(0.5, field);
  expect(early).toBeGreaterThan(late);
  expect(late).toBeGreaterThan(0.6);
  const later = expansionFront(2.05, field) - expansionFront(2, field);
  expect(later).toBeCloseTo(0.6, 3);
  expect(expansionFront(1, { ...field, burstDistance: 0 })).toBe(13);
});

test("late notes do not accelerate to the edge before the unit resets", () => {
  const late = [{ column: 0, row: 0, seconds: 1.9 }];
  expect(dissolvedScale(1, 0, late, 2)).toBeLessThan(1);
  expect(dissolvedScale(20, 0, late, 2)).toBe(1);
  const base = {
    row: 0,
    columns: 21,
    rows: 1,
    currentOnsets: [],
    previousOnsets: late,
    boundarySeconds: 2,
    currentEndSeconds: 4,
    previousStartSeconds: 0,
    returnSeconds: 0.4,
    returnStaggerSeconds: 0.4,
  };
  expect(
    cellScale({
      ...base,
      column: 20,
      nowSeconds: 2,
    }),
  ).toBe(1);
  expect(cellScale({ ...base, column: 1, nowSeconds: 2 })).toBeLessThan(1);
  expect(cellScale({ ...base, column: 1, nowSeconds: 2.8 })).toBe(1);
});

test("ripples remain smooth, overlap safely, and preserve played centers", () => {
  expect(easeInOut(0.25)).toBeCloseTo(0.15625);
  expect(easeInOut(0.5)).toBe(0.5);
  const onsets = [
    { column: 0, row: 0, seconds: 0 },
    { column: 1, row: 0, seconds: 0.5 },
  ];
  expect(dissolvedScale(1, 0, onsets, 0.4)).toBeLessThan(1);
  expect(dissolvedScale(1, 0, onsets, 0.5)).toBe(1);
  expect(dissolvedScale(0, 0, onsets, 1)).toBe(1);
  expect(dissolvedScale(3, 0, onsets, 1)).toBe(0);
});

test("distance field shapes, speed, and gradient affect the front", () => {
  const onset = { column: 0, row: 0, seconds: 0 };
  const circle = { ...DEFAULT_EXPANSION_FIELD, shape: "circle" as const };
  const diamond = { ...circle, shape: "diamond" as const };
  const noisy = { ...circle, shape: "noisy" as const, noiseAmount: 2 };
  expect(fieldDistance(2, 2, onset, circle)).toBeCloseTo(Math.SQRT2 * 2);
  expect(fieldDistance(2, 2, onset, diamond)).toBe(4);
  const textured = fieldDistance(2, 2, onset, noisy);
  expect(textured).toBe(fieldDistance(2, 2, onset, noisy));
  expect(textured).not.toBe(fieldDistance(2, 2, onset, circle));
  expect(dissolvedScale(2, 2, [onset], 0.15, diamond)).toBeGreaterThan(
    dissolvedScale(2, 2, [onset], 0.15, circle),
  );
  expect(
    dissolvedScale(6, 0, [onset], 0.2, { ...circle, speed: 3 }),
  ).toBeLessThan(dissolvedScale(6, 0, [onset], 0.2, { ...circle, speed: 0.5 }));
  expect(
    dissolvedScale(4, 0, [onset], 0.2, { ...circle, gradient: 0.1 }),
  ).toBeLessThan(
    dissolvedScale(4, 0, [onset], 0.2, { ...circle, gradient: 2 }),
  );
});

test("additional distance fields have distinct contours", () => {
  const onset = { column: 0, row: 0, seconds: 0 };
  const field = DEFAULT_EXPANSION_FIELD;
  const at = (shape: typeof field.shape, column: number, row: number) =>
    fieldDistance(column, row, onset, { ...field, shape });
  expect(at("square", 3, 3)).toBe(3);
  expect(at("cross", 3, 0)).toBe(3);
  expect(at("cross", 3, 3)).toBeGreaterThan(at("diamond", 3, 3));
  expect(at("horizontal", 4, 0)).toBeLessThan(at("vertical", 4, 0));
  expect(at("vertical", 0, 4)).toBeLessThan(at("horizontal", 0, 4));
  expect(at("star", 4, 0)).not.toBe(at("circle", 4, 0));
  expect(at("spiral", 4, 0)).not.toBe(at("circle", 4, 0));
});

test("previous ripple continues after the boundary until each cell starts returning", () => {
  const field = {
    ...DEFAULT_EXPANSION_FIELD,
    shape: "circle" as const,
    speed: 0.25,
    burstDistance: 0,
  };
  const base = {
    column: 5,
    row: 0,
    columns: 6,
    rows: 1,
    currentOnsets: [],
    previousOnsets: [{ column: 0, row: 0, seconds: 0 }],
    boundarySeconds: 1,
    currentEndSeconds: 3,
    previousStartSeconds: 0,
    returnSeconds: 0.5,
    returnStaggerSeconds: 1,
    field,
  };
  expect(cellScale({ ...base, nowSeconds: 1 })).toBe(1);
  expect(cellScale({ ...base, nowSeconds: 1.4 })).toBeLessThan(1);
  expect(cellScale({ ...base, nowSeconds: 2 })).toBe(0);
  expect(cellScale({ ...base, nowSeconds: 2.25 })).toBeCloseTo(0.5);
  expect(cellScale({ ...base, nowSeconds: 2.5 })).toBe(1);
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
