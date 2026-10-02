export type EasingName =
  | "linear"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeOutQuint"
  | "easeOutBack";

const SUBDIVISION_BEATS: Readonly<Record<string, number>> = {
  "1/4": 1,
  "1/4-dotted": 1.5,
  "1/4-triplet": 2 / 3,
  "1/8": 1 / 2,
  "1/8-dotted": 3 / 4,
  "1/8-triplet": 1 / 3,
  "1/16": 1 / 4,
  "1/16-dotted": 3 / 8,
  "1/16-triplet": 1 / 6,
  "1/32": 1 / 8,
  "1/32-dotted": 3 / 16,
  "1/32-triplet": 1 / 12,
  "1/64": 1 / 16,
  "1/64-dotted": 3 / 32,
  "1/64-triplet": 1 / 24,
};

export interface MusicalSlot {
  readonly startBeat: number;
  readonly endBeat: number;
}

export function subdivisionBeats(value: unknown): number {
  return SUBDIVISION_BEATS[String(value)] ?? SUBDIVISION_BEATS["1/16"];
}

export function parseTimeUnitBars(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(4, parsed) : 1;
}

export function buildMusicalSlots(
  totalBeats: number,
  slotBeats: number,
): readonly MusicalSlot[] {
  if (!(totalBeats > 0) || !(slotBeats > 0)) return [];
  const count = Math.ceil(totalBeats / slotBeats - 1e-9);
  return Array.from({ length: count }, (_, index) => ({
    startBeat: index * slotBeats,
    endBeat: Math.min(totalBeats, (index + 1) * slotBeats),
  }));
}

export function hasMidiOnsetInRange(
  notes: readonly { startSeconds: number }[],
  startSeconds: number,
  endSeconds: number,
): boolean {
  return notes.some(
    (note) =>
      note.startSeconds >= startSeconds && note.startSeconds < endSeconds,
  );
}

export function animationProgress(
  elapsedSeconds: number,
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) return elapsedSeconds >= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, elapsedSeconds / durationSeconds));
}

export function staggerDelay(
  index: number,
  count: number,
  totalSeconds: number,
): number {
  return count > 1 ? (index / (count - 1)) * Math.max(0, totalSeconds) : 0;
}

export function fitExitTiming(
  durationSeconds: number,
  staggerSeconds: number,
  timeUnitSeconds: number,
): Readonly<{ durationSeconds: number; staggerSeconds: number }> {
  const duration = Math.max(0, durationSeconds);
  const stagger = Math.max(0, staggerSeconds);
  const available = Math.max(0, timeUnitSeconds);
  const requested = duration + stagger;
  if (requested <= available || requested === 0) {
    return { durationSeconds: duration, staggerSeconds: stagger };
  }
  const scale = available / requested;
  return {
    durationSeconds: duration * scale,
    staggerSeconds: stagger * scale,
  };
}

export function resolveSlotSettlement(args: {
  elapsedSinceBoundary: number;
  previousEntranceElapsed: number;
  previousBlocked: boolean;
  exitDelay: number;
  exitDuration: number;
  entranceStart: number;
  entranceDuration: number;
  blocked: boolean;
  exitEasing: unknown;
  entranceEasing: unknown;
}): number {
  const exitEnd = args.exitDelay + args.exitDuration;
  const previousSettlementAt = (elapsedAfterBoundary: number): number =>
    args.previousBlocked
      ? 0
      : applyEasing(
          args.entranceEasing,
          animationProgress(
            args.previousEntranceElapsed + elapsedAfterBoundary,
            args.entranceDuration,
          ),
        );
  if (args.elapsedSinceBoundary < args.exitDelay) {
    return previousSettlementAt(args.elapsedSinceBoundary);
  }
  if (args.elapsedSinceBoundary + 1e-9 < exitEnd) {
    const exitProgress = applyEasing(
      args.exitEasing,
      animationProgress(
        args.elapsedSinceBoundary - args.exitDelay,
        args.exitDuration,
      ),
    );
    return previousSettlementAt(args.exitDelay) * (1 - exitProgress);
  }
  if (args.blocked || args.elapsedSinceBoundary < args.entranceStart) return 0;
  return applyEasing(
    args.entranceEasing,
    animationProgress(
      args.elapsedSinceBoundary - args.entranceStart,
      args.entranceDuration,
    ),
  );
}

export function applyEasing(name: unknown, progress: number): number {
  const value = Math.min(1, Math.max(0, progress));
  switch (name as EasingName) {
    case "linear":
      return value;
    case "easeInCubic":
      return value ** 3;
    case "easeInOutCubic":
      return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
    case "easeOutQuint":
      return 1 - (1 - value) ** 5;
    case "easeOutBack": {
      const overshoot = 1.70158;
      return (
        1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2
      );
    }
    case "easeOutCubic":
    default:
      return 1 - (1 - value) ** 3;
  }
}
