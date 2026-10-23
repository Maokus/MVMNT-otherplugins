export interface GridOnset {
  readonly column: number;
  readonly row: number;
  readonly seconds: number;
}

export interface GridGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly horizontalDensity: number;
  readonly verticalDensity: number;
  readonly padding: number;
}

/** Density inserts circles between anchors; padding extends beyond all four edge anchors. */
export function expandedGrid(
  baseColumns: number,
  baseRows: number,
  horizontalDensity: number,
  verticalDensity: number,
  padding: number,
): GridGeometry {
  return {
    columns: (baseColumns - 1) * horizontalDensity + 1 + padding * 2,
    rows: (baseRows - 1) * verticalDensity + 1 + padding * 2,
    horizontalDensity,
    verticalDensity,
    padding,
  };
}

export function anchorCell(
  baseColumn: number,
  baseRow: number,
  grid: GridGeometry,
): { column: number; row: number } {
  return {
    column: grid.padding + baseColumn * grid.horizontalDensity,
    row: grid.padding + baseRow * grid.verticalDensity,
  };
}

export type ExpansionShape =
  | "circle"
  | "diamond"
  | "noisy"
  | "square"
  | "cross"
  | "star"
  | "spiral"
  | "horizontal"
  | "vertical";

export interface ExpansionField {
  readonly shape: ExpansionShape;
  /** Multiplier on a fixed cells-per-second rate, independent of unit length and grid size. */
  readonly speed: number;
  readonly burstDistance: number;
  readonly burstDecaySeconds: number;
  /** Width of the eased edge, measured in grid cells. */
  readonly gradient: number;
  readonly noiseAmount: number;
  readonly noiseScale: number;
}

export const DEFAULT_EXPANSION_FIELD: ExpansionField = {
  shape: "noisy",
  speed: 1,
  burstDistance: 1.5,
  burstDecaySeconds: 0.2,
  gradient: 0.75,
  noiseAmount: 2.75,
  noiseScale: 0.55,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Smooth at both ends, including each circle's shrink and return. */
export function easeInOut(progress: number): number {
  const value = clamp01(progress);
  return value * value * (3 - 2 * value);
}

export function onsetColumn(
  onsetBeat: number,
  unitStartBeat: number,
  slotBeats: number,
  columns: number,
): number {
  return Math.max(
    0,
    Math.min(
      columns - 1,
      Math.floor((onsetBeat - unitStartBeat) / slotBeats + 1e-9),
    ),
  );
}

function hash(x: number, y: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (((value ^ (value >>> 16)) >>> 0) / 0xffffffff) * 2 - 1;
}

/** Stable interpolated noise avoids frame-to-frame jitter in the ripple edge. */
function valueNoise(x: number, y: number): number {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const u = easeInOut(x - left);
  const v = easeInOut(y - top);
  const upper = hash(left, top) * (1 - u) + hash(left + 1, top) * u;
  const lower = hash(left, top + 1) * (1 - u) + hash(left + 1, top + 1) * u;
  return upper * (1 - v) + lower * v;
}

export function fieldDistance(
  column: number,
  row: number,
  onset: GridOnset,
  field: ExpansionField,
): number {
  const dx = Math.abs(column - onset.column);
  const dy = Math.abs(row - onset.row);
  if (dx === 0 && dy === 0) return 0;
  if (field.shape === "diamond") return dx + dy;
  if (field.shape === "square") return Math.max(dx, dy);
  if (field.shape === "cross") return Math.min(dx + 2.5 * dy, 2.5 * dx + dy);
  if (field.shape === "horizontal") return Math.hypot(dx * 0.6, dy * 1.5);
  if (field.shape === "vertical") return Math.hypot(dx * 1.5, dy * 0.6);
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(row - onset.row, column - onset.column);
  if (field.shape === "star")
    return Math.max(1, distance * (1 - 0.35 * Math.cos(5 * angle)));
  if (field.shape === "spiral")
    return Math.max(1, distance + 1.5 * Math.sin(3 * angle - 0.8 * distance));
  if (field.shape !== "noisy") return distance;
  return Math.max(
    1,
    distance +
      field.noiseAmount *
        valueNoise(column * field.noiseScale, row * field.noiseScale),
  );
}

/** Starts faster, then approaches a constant travel rate. */
export function expansionFront(
  elapsedSeconds: number,
  field: ExpansionField,
): number {
  const elapsed = Math.max(0, elapsedSeconds);
  const burst =
    field.burstDistance *
    (1 - Math.exp(-elapsed / Math.max(1e-6, field.burstDecaySeconds)));
  return 1 + 12 * field.speed * elapsed + burst;
}

function eventScale(
  column: number,
  row: number,
  onset: GridOnset,
  atSeconds: number,
  field: ExpansionField,
): number {
  if (atSeconds <= onset.seconds) return 1;
  const distance = fieldDistance(column, row, onset, field);
  if (distance < 1e-9) return 1;
  const front = expansionFront(atSeconds - onset.seconds, field);
  if (field.gradient <= 0) return front >= distance ? 0 : 1;
  return 1 - easeInOut((front - distance) / field.gradient);
}

/** Overlapping ripples choose the smallest scale, but every played center stays full size. */
export function dissolvedScale(
  column: number,
  row: number,
  onsets: readonly GridOnset[],
  atSeconds: number,
  field: ExpansionField = DEFAULT_EXPANSION_FIELD,
): number {
  let scale = 1;
  for (const onset of onsets) {
    if (onset.seconds > atSeconds) continue;
    if (onset.column === column && onset.row === row) return 1;
    scale = Math.min(scale, eventScale(column, row, onset, atSeconds, field));
  }
  return scale;
}

export function fitReturnTiming(
  durationSeconds: number,
  staggerSeconds: number,
  unitDurationSeconds: number,
): { durationSeconds: number; staggerSeconds: number } {
  const duration = Math.max(0, durationSeconds);
  const stagger = Math.max(0, staggerSeconds);
  const available = Math.max(0, unitDurationSeconds);
  const requested = duration + stagger;
  const factor =
    requested > available && requested > 0 ? available / requested : 1;
  return {
    durationSeconds: duration * factor,
    staggerSeconds: stagger * factor,
  };
}

/** Previous return and current dissolve compose without accumulating state across seeks. */
export function cellScale(args: {
  column: number;
  row: number;
  columns: number;
  rows: number;
  currentOnsets: readonly GridOnset[];
  previousOnsets: readonly GridOnset[];
  nowSeconds: number;
  boundarySeconds: number;
  currentEndSeconds: number;
  previousStartSeconds: number;
  returnSeconds: number;
  returnStaggerSeconds: number;
  field?: ExpansionField;
}): number {
  const {
    column,
    row,
    columns,
    rows,
    currentOnsets,
    previousOnsets,
    nowSeconds,
    boundarySeconds,
    currentEndSeconds,
    previousStartSeconds,
    returnSeconds,
    returnStaggerSeconds,
    field = DEFAULT_EXPANSION_FIELD,
  } = args;
  if (
    currentOnsets.some(
      (onset) =>
        onset.seconds <= nowSeconds &&
        onset.column === column &&
        onset.row === row,
    )
  )
    return 1;

  const current = dissolvedScale(column, row, currentOnsets, nowSeconds, field);
  if (previousStartSeconds >= boundarySeconds || previousOnsets.length === 0)
    return current;

  const timing = fitReturnTiming(
    returnSeconds,
    returnStaggerSeconds,
    currentEndSeconds - boundarySeconds,
  );
  const cellIndex = column * rows + row;
  const delay =
    columns * rows > 1
      ? (timing.staggerSeconds * cellIndex) / (columns * rows - 1)
      : 0;
  const returnStart = boundarySeconds + delay;
  if (nowSeconds < returnStart)
    return Math.min(
      current,
      dissolvedScale(column, row, previousOnsets, nowSeconds, field),
    );
  const elapsed = nowSeconds - returnStart;
  if (elapsed >= timing.durationSeconds) return current;
  const previous = dissolvedScale(
    column,
    row,
    previousOnsets,
    returnStart,
    field,
  );
  const recovery =
    previous +
    (1 - previous) *
      easeInOut(
        timing.durationSeconds <= 0 ? 0 : elapsed / timing.durationSeconds,
      );
  return Math.min(current, recovery);
}
