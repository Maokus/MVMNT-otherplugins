import { expect, test } from "vitest";
import { resolveJarBounds, timeUnitIndex } from "../src/ball-jar-logic.ts";

test("time-unit indices respect meter and configured bar count", () => {
  expect(timeUnitIndex(3.99, 4, 4, 1)).toBe(0);
  expect(timeUnitIndex(4, 4, 4, 1)).toBe(1);
  expect(timeUnitIndex(7.99, 4, 4, 2)).toBe(0);
  expect(timeUnitIndex(8, 4, 4, 2)).toBe(1);
  expect(timeUnitIndex(3, 6, 8, 1)).toBe(1);
});

test("jar walls contain balls while leaving the top open", () => {
  expect(resolveJarBounds(-20, -30, -100, 20, 200, 300, 10, 5, 0.5)).toEqual({
    x: 15,
    y: -30,
    velocityX: 50,
    velocityY: 20,
  });
  expect(resolveJarBounds(100, 400, 0, 100, 200, 300, 10, 5, 0.5)).toEqual({
    x: 100,
    y: 285,
    velocityX: 0,
    velocityY: -50,
  });
});
