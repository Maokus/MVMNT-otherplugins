import { expect, it, vi } from "vitest";
vi.mock("@mvmnt-app/plugin-sdk/render", async () => ({
  ...(await import("../../../MVMNT/src/core/render/render-objects/bezier")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/empty")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/line")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/rectangle")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/text")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/arc")),
}));
import type { ElementPropertyDefinition } from "@mvmnt-app/plugin-sdk";
import score from "../src/score";
import atlas from "../src/glyph-atlas";
import workshop from "../src/note-workshop";
import study from "../src/layout-study";
import orbit from "../src/notation-orbit";
import { exampleNotes } from "../src/example";
import { NotationRenderer } from "../src/notation";
const definitions = [score, atlas, workshop, study, orbit];
const timeline = {
  getMetadata: () => ({
    ok: true,
    value: { tempoBpm: 120, timeSignature: { numerator: 4, denominator: 4 } },
  }),
  selectNotes: ({ startSeconds, endSeconds }: any) => ({
    ok: true,
    value: [
      ...exampleNotes,
      { ...exampleNotes[0], endSeconds: 4, durationSeconds: 4 },
    ]
      .filter((n) => n.startSeconds < endSeconds && n.endSeconds > startSeconds)
      .map((n) => ({ ...n, note: n.note + 2 })),
  }),
};
const properties = (definition: (typeof definitions)[number]) =>
  definition.schema.tabs.flatMap((t) =>
    t.groups.flatMap((g) => g.properties),
  ) as ElementPropertyDefinition[];
function draw(
  definition: (typeof definitions)[number],
  time: number,
  overrides: Record<string, unknown> = {},
) {
  const props = Object.fromEntries(
    properties(definition).map((p) => [p.key, p.default]),
  );
  return definition.render({
    props: { ...props, ...overrides },
    time: { seconds: time, beats: null, ticks: null, frame: null },
    context: { timeline },
    resources: { key: "", renderer: new NotationRenderer() },
  } as never);
}
function alternate(p: ElementPropertyDefinition) {
  if (p.options) return p.options.find((o) => o.value !== p.default)!.value;
  if (p.type === "timelineTrackRef") return "selected-track";
  if (typeof p.default === "boolean") return !p.default;
  if (typeof p.default === "number" && p.default === p.max)
    return Math.max(p.min ?? 0, p.default - 1);
  if (typeof p.default === "number")
    return p.key === "maxNotes"
      ? 1
      : p.key === "lookAhead" || p.key === "history"
        ? 0.1
        : Math.min(
            p.max ?? Infinity,
            Math.max(
              p.min ?? -Infinity,
              p.default + Math.max(1, Math.abs(p.default) * 0.4),
            ),
          );
  if (typeof p.default === "string") return "#EF4444FF";
  throw Error(`No test value for ${p.key} (${p.type})`);
}
for (const definition of definitions) {
  const props = properties(definition);
  it(`${definition.type}: has unique property keys`, () =>
    expect(new Set(props.map((p) => p.key)).size).toBe(props.length));
  for (const property of props) {
    it(`${definition.type}: ${property.key} affects its intended output`, () => {
      const conditions: Record<string, unknown> = {};
      for (const condition of property.visibleWhen ?? []) {
        if ("equals" in condition) conditions[condition.key] = condition.equals;
        else if ("falsy" in condition) conditions[condition.key] = null;
        else if ("notEquals" in condition) {
          const dependent = props.find((p) => p.key === condition.key)!;
          conditions[condition.key] = dependent.options?.find(
            (o) => o.value !== condition.notEquals,
          )!.value;
        }
      }
      // A chromatic fixture is necessary to observe enharmonic spelling.
      if (definition === workshop && property.key === "spelling")
        conditions.pitch = 61;
      if (property.key === "voices") conditions.midiTrackId = "selected-track";
      if (property.key === "overrideMeter") conditions.numerator = 3;
      const alternateValue = alternate(property);
      const times =
        definition === score || definition === orbit
          ? [-0.2, 0.1, 0.7, 2.2, 8.2, 16.2]
          : [0];
      const changes = times.some(
        (t) =>
          JSON.stringify(draw(definition, t, conditions)) !==
          JSON.stringify(
            draw(definition, t, {
              ...conditions,
              [property.key]: alternateValue,
            }),
          ),
      );
      expect(changes, `${property.key} is inert for ${definition.type}`).toBe(
        true,
      );
    });
  }
}
it("all elements render deterministically after arbitrary seeking", () => {
  for (const definition of definitions) {
    const a = draw(definition, 0.7);
    draw(definition, 900);
    expect(draw(definition, 0.7)).toEqual(a);
  }
});
it("animation master switch disables every note motion parameter", () => {
  for (const definition of [score, orbit]) {
    const baseline = draw(definition, 0.7, { animate: false });
    for (const [key, value] of Object.entries({
      reveal: 2,
      release: 2,
      revealStyle: "spin",
      releaseStyle: "shrink",
      activeScale: 2,
      upcomingOpacity: 0,
      completedOpacity: 0,
      revealDistance: 4,
      releaseDistance: 4,
    }))
      expect(draw(definition, 0.7, { animate: false, [key]: value })).toEqual(
        baseline,
      );
  }
});
it("selected track errors remain distinct from the example", () => {
  const result = orbit.render({
    props: {
      ...Object.fromEntries(properties(orbit).map((p) => [p.key, p.default])),
      midiTrackId: "missing",
    },
    time: { seconds: 0 },
    context: { timeline: { selectNotes: () => ({ ok: false }) } },
  } as never);
  expect(result[0]).toMatchObject({
    text: "Unable to read selected MIDI track",
  });
});
it("writes visual previews of every library layer", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(".build/previews", { recursive: true });
  for (const [definition, name, overrides] of [
    [score, "score-expanded", { animate: false, showBounds: true }],
    [atlas, "glyph-atlas", { showBounds: true, showAnchors: true }],
    [
      workshop,
      "note-workshop",
      { pitch: 61, duration: "16", dotted: true, separation: 1 },
    ],
    [study, "layout-wave", {}],
    [study, "layout-circle", { layout: "circle", followTangent: true }],
    [orbit, "midi-orbit", {}],
  ] as const) {
    const objects = draw(definition, 2.2, overrides),
      bounds = objects[0] as unknown as { width: number; height: number };
    const width = bounds.width,
      height = bounds.height,
      scale = Math.min(1, 1400 / width, 1000 / height);
    const canvas = createCanvas(
        Math.ceil(width * scale),
        Math.ceil(height * scale),
      ),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    for (const object of objects)
      (
        object as unknown as {
          render: (ctx: unknown, config: unknown, time: number) => void;
        }
      ).render(ctx, {}, 2.2);
    writeFileSync(`.build/previews/${name}.png`, canvas.toBuffer("image/png"));
  }
});

it("hides dependent inspector controls when their modes are inactive", () => {
  for (const definition of [score, orbit]) {
    for (const key of [
      "reveal",
      "release",
      "revealStyle",
      "releaseStyle",
      "activeScale",
      "upcomingOpacity",
      "completedOpacity",
    ])
      expect(
        properties(definition).find((p) => p.key === key)?.visibleWhen,
      ).toContainEqual({ key: "animate", equals: true });
  }
  expect(
    properties(score).find((p) => p.key === "fixedPage")?.visibleWhen,
  ).toContainEqual({ key: "pageMode", equals: "fixed" });
  expect(
    properties(score).find((p) => p.key === "numerator")?.visibleWhen,
  ).toContainEqual({ key: "overrideMeter", equals: true });
});
it("renders finite geometry at the advertised numeric limits", () => {
  for (const definition of definitions) {
    for (const property of properties(definition).filter(
      (p) => typeof p.default === "number",
    )) {
      for (const value of [property.min, property.max].filter(
        (v) => v !== undefined,
      )) {
        const objects = draw(definition, 0.7, { [property.key]: value });
        const inspect = (value: unknown): void => {
          if (typeof value === "number")
            expect(
              Number.isFinite(value),
              `${definition.type}:${property.key}=${value}`,
            ).toBe(true);
          else if (Array.isArray(value)) value.forEach(inspect);
          else if (value && typeof value === "object")
            Object.values(value).forEach(inspect);
        };
        inspect(objects);
      }
    }
  }
});
