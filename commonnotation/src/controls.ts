import {
  prop,
  type ElementPropertyVisibilityCondition,
} from "@mvmnt-app/plugin-sdk";
import {
  Rectangle,
  Text,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import type { RenderOptions } from "./notation";
export const select = <K extends string>(
  key: K,
  label: string,
  value: string,
  values: readonly string[],
  visibleWhen?: readonly ElementPropertyVisibilityCondition[],
) =>
  prop.select(
    key,
    label,
    value,
    values.map((v) => ({ value: v, label: v })),
    { visibleWhen },
  );
export const when = (key: string, equals: unknown = true) => [{ key, equals }];
export const inspectionProperties = () => [
  prop.boolean("showBounds", "Show component bounds", false),
  prop.boolean("showAnchors", "Show attachment anchors", false),
];
export const effectProperties = () => [
  prop.boolean("animate", "Animate notes", true),
  prop.number("reveal", "Reveal duration (s)", 0.4, {
    min: 0,
    max: 5,
    step: 0.01,
    visibleWhen: when("animate"),
  }),
  prop.number("release", "Release duration (s)", 0.6, {
    min: 0,
    max: 5,
    step: 0.01,
    visibleWhen: when("animate"),
  }),
  select(
    "revealStyle",
    "Reveal motion",
    "slide",
    ["fade", "slide", "spin"],
    when("animate"),
  ),
  select(
    "releaseStyle",
    "Release motion",
    "settle",
    ["settle", "float", "shrink"],
    when("animate"),
  ),
  prop.number("revealDistance", "Slide distance (staff spaces)", 2, {
    min: 0,
    max: 12,
    step: 0.1,
    visibleWhen: [...when("animate"), ...when("revealStyle", "slide")],
  }),
  prop.number("releaseDistance", "Float distance (staff spaces)", 2, {
    min: 0,
    max: 12,
    step: 0.1,
    visibleWhen: [...when("animate"), ...when("releaseStyle", "float")],
  }),
  prop.number("activeScale", "Active note scale", 1.15, {
    min: 0.1,
    max: 3,
    step: 0.01,
    visibleWhen: when("animate"),
  }),
  prop.number("upcomingOpacity", "Upcoming opacity", 0.22, {
    min: 0,
    max: 1,
    step: 0.01,
    visibleWhen: when("animate"),
  }),
  prop.number("completedOpacity", "Completed opacity", 1, {
    min: 0,
    max: 1,
    step: 0.01,
    visibleWhen: when("animate"),
  }),
];
export interface EffectProps {
  animate: boolean;
  reveal: number;
  release: number;
  revealStyle: string;
  releaseStyle: string;
  revealDistance: number;
  releaseDistance: number;
  activeScale: number;
  upcomingOpacity: number;
  completedOpacity: number;
}
export function effects(p: EffectProps): Partial<RenderOptions> {
  return {
    animate: p.animate,
    reveal: p.reveal,
    release: p.release,
    revealStyle: p.revealStyle as RenderOptions["revealStyle"],
    releaseStyle: p.releaseStyle as RenderOptions["releaseStyle"],
    revealDistance: p.revealDistance,
    releaseDistance: p.releaseDistance,
    activeScale: p.activeScale,
    upcomingOpacity: p.upcomingOpacity,
    completedOpacity: p.completedOpacity,
  };
}
export function frame(
  width: number,
  height: number,
  color = "#00000000",
): RenderObject {
  return new Rectangle(0, 0, width, height, {
    fillColor: color,
    strokeWidth: 0,
  }).setLayoutParticipation("include");
}
export function label(
  x: number,
  y: number,
  text: string,
  color = "#D1D5DB",
  size = 13,
): RenderObject {
  return new Text(x, y, text, `${size}px sans-serif`, {
    color,
  }).setLayoutParticipation("exclude");
}
