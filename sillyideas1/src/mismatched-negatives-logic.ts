export type EasingName =
  | "linear"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeOutQuint"
  | "easeOutBack";

export {
  subdivisionBeats,
  parseTimeUnitBars,
  buildMusicalSlots,
  type MusicalSlot,
} from "./musical-grid";

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
