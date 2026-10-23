export interface EffectOptions {
  reveal: number;
  release: number;
}
export interface NotePhase {
  phase: "upcoming" | "reveal" | "active" | "release" | "completed";
  amount: number;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function evaluateNotePhase(
  time: number,
  start: number,
  end: number,
  options: EffectOptions,
): NotePhase {
  if (time < start) {
    if (options.reveal > 0 && time >= start - options.reveal)
      return {
        phase: "reveal",
        amount: clamp((time - start + options.reveal) / options.reveal),
      };
    return { phase: "upcoming", amount: 0 };
  }
  if (time < end) return { phase: "active", amount: 1 };
  if (options.release > 0 && time < end + options.release)
    return {
      phase: "release",
      amount: 1 - clamp((time - end) / options.release),
    };
  return { phase: "completed", amount: 0 };
}
/** Interpolate SDK hex colors; unfamiliar CSS colors retain the base color. */
export function blendNoteColor(
  base: string,
  active: string,
  amount: number,
): string {
  const parse = (value: string) => {
    let hex = value.replace(/^#/, "");
    if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
    if (hex.length < 5) hex = [...hex].map((c) => c + c).join("");
    if (hex.length === 6) hex += "ff";
    return [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16));
  };
  const a = parse(base),
    b = parse(active);
  if (!a || !b) return amount >= 1 ? active : base;
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * clamp(amount))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
