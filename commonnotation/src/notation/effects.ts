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

import type { NodeStyle, RenderOptions } from "./renderer";
/** Default phase appearance is shared by ordinary rendering and spatial projection. */
export function evaluateNoteStyle(
  phase: NotePhase,
  options: RenderOptions,
): NodeStyle {
  if (options.animate === false) return {};
  const upcoming = options.upcomingOpacity ?? 0.22,
    completed = options.completedOpacity ?? 1,
    scale = options.activeScale ?? 1.06;
  const entry = options.revealStyle ?? "slide",
    exit = options.releaseStyle ?? "settle";
  const enter = options.revealDistance ?? options.motionAmount ?? 0.6,
    leave = options.releaseDistance ?? options.motionAmount ?? 0.6;
  if (phase.phase === "upcoming") return { opacity: upcoming };
  if (phase.phase === "reveal")
    return {
      opacity: upcoming + (1 - upcoming) * phase.amount,
      y: entry === "slide" ? (1 - phase.amount) * enter : 0,
      rotation: entry === "spin" ? (1 - phase.amount) * Math.PI : 0,
      scale: entry === "spin" ? 0.5 + 0.5 * phase.amount : 1,
    };
  if (phase.phase === "active") return { color: options.activeColor, scale };
  if (phase.phase === "release")
    return {
      color: blendNoteColor(options.color, options.activeColor, phase.amount),
      opacity: completed + (1 - completed) * phase.amount,
      scale:
        exit === "shrink"
          ? 0.3 + (scale - 0.3) * phase.amount
          : 1 + (scale - 1) * phase.amount,
      y: exit === "float" ? -(1 - phase.amount) * leave : 0,
    };
  return {
    opacity: completed,
    scale: exit === "shrink" ? 0.3 : 1,
    y: exit === "float" ? -leave : 0,
  };
}
