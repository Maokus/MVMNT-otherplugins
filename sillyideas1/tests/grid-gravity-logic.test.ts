import { expect, test } from "vitest";
import { stepMark } from "../src/grid-gravity-logic";

test("held attraction moves a mark toward the onset and falloff weakens distant pull", () => {
  const close = stepMark(0, 0, 0, 0, 0, 0, [{ x: 2, y: 0 }], 80, 1, 25, 8, 1 / 120);
  const steep = stepMark(0, 0, 0, 0, 0, 0, [{ x: 2, y: 0 }], 80, 3, 25, 8, 1 / 120);
  expect(close.x).toBeGreaterThan(0);
  expect(steep.x).toBeGreaterThan(0);
  expect(steep.x).toBeLessThan(close.x);
});

test("when attraction stops, the grid spring pulls a displaced mark home", () => {
  const next = stepMark(1, 0, 0, 0, 0, 0, [], 80, 1, 25, 8, 1 / 120);
  expect(next.x).toBeLessThan(1);
  expect(next.vx).toBeLessThan(0);
});

test("simultaneous notes combine forces", () => {
  const balanced = stepMark(0, 0, 0, 0, 0, 0,
    [{ x: -2, y: 0 }, { x: 2, y: 0 }], 80, 1, 25, 8, 1 / 120);
  expect(balanced.x).toBeCloseTo(0);
});
