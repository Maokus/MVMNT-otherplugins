import { expect, it, vi } from "vitest";
// Use the same primitive implementations the host injects, without importing app state.
vi.mock("@mvmnt-app/plugin-sdk/render", async () => ({
  ...(await import("../../../MVMNT/src/core/render/render-objects/bezier")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/empty")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/line")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/rectangle")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/text")),
}));
import definition from "../src/score";
import { adaptMidiNotes, layoutScore, NotationRenderer } from "../src/notation";
import { exampleNotes } from "../src/example";
const defaults = Object.fromEntries(
  definition.schema.tabs.flatMap((t) =>
    t.groups.flatMap((g) => g.properties.map((p) => [p.key, p.default])),
  ),
);
const makeResources = () => ({
  key: "",
  layout: undefined as ReturnType<typeof layoutScore> | undefined,
  renderer: new NotationRenderer(),
});
function render(
  resources: ReturnType<typeof makeResources>,
  seconds: number,
  overrides: Record<string, unknown> = {},
  timeline?: unknown,
) {
  return definition.render({
    props: { ...defaults, ...overrides },
    time: { seconds, beats: null, ticks: null, frame: null },
    resources,
    context: { timeline },
  } as never);
}
it("renders the demo with real host primitives and stable layout across seeks", () => {
  const resources = makeResources();
  const first = render(resources, 0);
  expect(first.length).toBe(3);
  const layout = resources.layout;
  render(resources, 2);
  expect(resources.layout).toBe(layout);
  render(resources, 9);
  expect(resources.layout).not.toBe(layout);
  expect(render(resources, 0)).toEqual(first);
  expect(
    render(resources, 9, { pageMode: "fixed", fixedPage: 1 })[2],
  ).toMatchObject({ text: "Built-in example · Page 1" });
});
it("handles timeline errors, empty tracks and changed notes without stale caches", () => {
  const resources = makeResources();
  expect(render(resources, 0, { midiTrackId: "x" })[0]).toMatchObject({
    text: "MIDI timeline unavailable",
  });
  let notes = exampleNotes.slice();
  const timeline = {
    getMetadata: () => ({
      ok: true,
      value: { tempoBpm: 120, timeSignature: { numerator: 4, denominator: 4 } },
    }),
    selectNotes: () => ({ ok: true, value: notes }),
  };
  render(resources, 0, { midiTrackId: "x" }, timeline);
  const previous = resources.layout;
  notes = [];
  expect(render(resources, 0, { midiTrackId: "x" }, timeline)[2]).toMatchObject(
    { text: "Page 1 · No notes on this page" },
  );
  expect(resources.layout).not.toBe(previous);
  definition.disposeResources!(resources, {} as never);
  expect(resources.layout).toBeUndefined();
});
it("supports per-note/component transforms without mutating layout", () => {
  const layout = layoutScore(
    adaptMidiNotes(exampleNotes, { tempo: 120, numerator: 4, denominator: 4 }),
    {
      clef: "bass",
      width: 800,
      height: 400,
      staffSize: 16,
      measuresPerSystem: 2,
    },
  );
  const before = JSON.stringify(layout);
  let called = 0;
  new NotationRenderer().render(layout, {
    time: 1,
    color: "#ffffff",
    activeColor: "#00ff00",
    reveal: 0.5,
    release: 0.5,
    noteStyle: () => {
      called++;
      return { rotation: 0.2, x: 1 };
    },
    componentStyle: (n) => (n.role === "notehead" ? { color: "#ff0000" } : {}),
  });
  expect(called).toBeGreaterThan(0);
  expect(JSON.stringify(layout)).toBe(before);
});

it("draws readable vector previews through the host canvas renderer", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(".build/previews", { recursive: true });
  for (const [name, seconds, overrides] of [
    ["treble", 0, { animate: false }],
    ["bass", 0, { animate: false, clef: "bass" }],
    ["active", 0.1, {}],
    ["page-two", 8.2, { animate: false }],
  ] as const) {
    const canvas = createCanvas(1040, 540),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#151923";
    ctx.fillRect(0, 0, 1040, 540);
    ctx.translate(20, 20);
    for (const object of render(makeResources(), seconds, overrides)) {
      (
        object as unknown as {
          render: (ctx: unknown, config: unknown, time: number) => void;
        }
      ).render(ctx, {}, seconds);
    }
    const pixels = ctx.getImageData(0, 0, 1040, 540).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 100) bright++;
    expect(bright).toBeGreaterThan(1500);
    writeFileSync(`.build/previews/${name}.png`, canvas.toBuffer("image/png"));
  }
});

it("does not apply the SDK default white stroke to engraved outlines", () => {
  const objects = render(makeResources(), 0);
  const walk = (nodes: readonly unknown[]): any[] =>
    nodes.flatMap((n: any) => [n, ...walk(n.children ?? [])]);
  const paths = walk(objects).filter(
    (n) => typeof n.getCommands === "function",
  );
  expect(paths.length).toBeGreaterThan(10);
  expect(paths.every((n) => n.strokeWidth === 0)).toBe(true);
});
