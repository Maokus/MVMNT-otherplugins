import { expect, it, vi } from "vitest";
vi.mock("@mvmnt-app/plugin-sdk/render", async () => ({
  ...(await import("../../../MVMNT/src/core/render/render-objects/bezier")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/empty")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/line")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/rectangle")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/text")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/arc")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/clip-layer")),
}));
import engraving, { type EngravingPanel } from "../src/engraving-lab";
import utilities, { buildUtilityStudies } from "../src/utility-lab";
import score from "../src/score";
import atlas from "../src/glyph-atlas";
import workshop from "../src/note-workshop";
import study from "../src/layout-study";
import orbit from "../src/notation-orbit";
import schematic from "../src/schematic-structure";
import {
  NotationRenderer,
  walkNodes,
  resolveAnchor,
  defaultGlyphs,
  evaluateNotePhase,
  type LayoutNode,
} from "../src/notation";
import { labTimeMap } from "../src/example-fixtures";
const definitions = [
  engraving,
  utilities,
  score,
  atlas,
  workshop,
  study,
  orbit,
  schematic,
];
const defaults = (d: (typeof definitions)[number]) =>
  Object.fromEntries(
    d.schema.tabs.flatMap((t) =>
      t.groups.flatMap((g) => g.properties.map((p) => [p.key, p.default])),
    ),
  );
const resources = () => ({
  key: "",
  panels: [] as EngravingPanel[],
  renderer: new NotationRenderer(),
  sources: [],
  timeSamples: [],
  studies: undefined as ReturnType<typeof buildUtilityStudies> | undefined,
  layout: undefined as import("../src/notation").ScoreLayout | undefined,
});
function render(
  d: (typeof definitions)[number],
  r = resources(),
  overrides: Record<string, unknown> = {},
  seconds = 3.1,
) {
  return d.render({
    props: { ...defaults(d), ...overrides },
    resources: r,
    time: { seconds, beats: null, ticks: null, frame: null },
    context: {},
  } as never);
}
const nodes = (roots: readonly LayoutNode[]) => {
  const result: LayoutNode[] = [];
  walkNodes(roots, (n) => result.push(n));
  return result;
};
it("makes beams, partial beams and flags directly comparable without MIDI import", () => {
  const r = resources();
  render(engraving, r);
  expect(r.panels.map((p) => p.id)).toEqual([
    "beams",
    "compound",
    "keys",
    "voices",
    "rhythm",
    "timing",
  ]);
  const first = r.panels[0].scores[0].score.measures[0].events.find(
    (e) => e.notes.length,
  )!;
  expect(first.beat).toBe(0);
  expect(first.notes[0].startSeconds).toBeCloseTo(0.015);
  const [beamed, flagged] = r.panels[0].scores.map((s) =>
    nodes(s.layout.nodes),
  );
  expect(beamed.some((n) => n.role === "beam")).toBe(true);
  expect(beamed.some((n) => n.connection?.fraction === 0.4)).toBe(true);
  expect(flagged.some((n) => n.role === "beam")).toBe(false);
  expect(flagged.filter((n) => n.role === "flag").length).toBeGreaterThan(
    beamed.filter((n) => n.role === "flag").length,
  );
});
it("demonstrates explicit beat-group changes rather than only relabeling a score", () => {
  const r = resources();
  render(engraving, r);
  const [a, b] = r.panels.find((p) => p.id === "compound")!.scores;
  expect(a.score.beatGroups).toEqual([1, 1, 1.5]);
  expect(b.score.beatGroups).toEqual([1.5, 1, 1]);
  const connections = (layout: typeof a.layout) =>
    nodes(layout.nodes)
      .filter((n) => n.role === "beam")
      .map((n) => [n.connection!.from.id, n.connection!.to.id]);
  expect(connections(a.layout)).not.toEqual(connections(b.layout));
});
it("shows signature accidentals, explicit voice overrides, metrical ties and real tempo conversion", () => {
  const r = resources();
  render(engraving, r, { voiceMode: "explicit" });
  const key = r.panels.find((p) => p.id === "keys")!.scores[0];
  expect(
    nodes(key.layout.nodes).filter(
      (n) => n.role === "key-signature" && n.glyph,
    ),
  ).toHaveLength(1);
  expect(
    key.score.measures.flatMap((m) =>
      m.events.flatMap((e) => e.notes.map((n) => n.accidental)),
    ),
  ).toEqual([undefined, 0, 1, undefined]);
  const voices = r.panels.find((p) => p.id === "voices")!.scores[0].score;
  expect(
    [
      ...new Set(
        voices.measures.flatMap((m) => m.events.map((e) => e.voiceId)),
      ),
    ].sort(),
  ).toEqual(["lower", "upper"]);
  const [legacy, metrical] = r.panels.find((p) => p.id === "rhythm")!.scores;
  expect(nodes(legacy.layout.nodes).some((n) => n.role === "tie")).toBe(false);
  expect(nodes(metrical.layout.nodes).some((n) => n.role === "tie")).toBe(true);
  const [constant, mapped] = r.panels.find((p) => p.id === "timing")!.scores;
  const attacks = (s: typeof constant) =>
    s.score.measures.flatMap((m) =>
      m.events.filter((e) => e.notes.length).map((e) => e.beat),
    );
  expect(attacks(constant)).toEqual([0, 2, 4, 6]);
  expect(attacks(mapped)).toEqual([0, 2, 4, 5]);
  expect(
    mapped.score.measures.flatMap((m) =>
      m.events.flatMap((e) => e.notes.map((n) => n.startSeconds)),
    ),
  ).toEqual([0, 1, 2, 3]);
});
it("shows transformed anchor connections and every schematic primitive in the utility study", () => {
  const studies = buildUtilityStudies({
    rotation: 35,
    scaleX: 1.4,
    scaleY: 0.7,
    seed: 42,
    customHead: true,
    showConnector: true,
  });
  const a = resolveAnchor([studies.geometry], "a", "stemTip")!,
    b = resolveAnchor([studies.geometry], "b", "stemTip")!,
    connector = nodes([studies.geometry]).find(
      (n) => n.id === "stem-connector",
    )!;
  expect({ x: connector.x, y: connector.y }).toEqual(a);
  expect(connector.x + connector.line!.x).toBeCloseTo(b.x);
  expect(connector.y + connector.line!.y).toBeCloseTo(b.y);
  const roles = new Set(nodes([studies.marks]).map((n) => n.role));
  for (const role of ["bracket", "point", "ribbon", "connector"])
    expect(roles.has(role)).toBe(true);
  const reseeded = buildUtilityStudies({
    rotation: 35,
    scaleX: 1.4,
    scaleY: 0.7,
    seed: 99,
    customHead: true,
    showConnector: true,
  });
  expect(nodes([reseeded.marks]).filter((n) => n.role === "point")).toEqual(
    nodes([studies.marks]).filter((n) => n.role === "point"),
  );
});
it("demonstrates custom glyph assembly with matching stem anchors and isolated registries", () => {
  const revision = defaultGlyphs.revision,
    originalCommands = defaultGlyphs.get("noteheadBlack").commands;
  const studies = buildUtilityStudies({
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    seed: 42,
    customHead: true,
    showConnector: false,
  });
  expect(studies.registry.get("noteheadBlack").commands).toEqual(
    studies.registry.get("exampleDiamond").commands,
  );
  expect(studies.custom.anchors.stemBaseUp.x).toBe(
    studies.registry.get("exampleDiamond").anchors.stemUpSE.x,
  );
  expect(studies.original.anchors.stemBaseUp.x).not.toBe(
    studies.custom.anchors.stemBaseUp.x,
  );
  expect(defaultGlyphs.get("noteheadBlack").commands).toBe(originalCommands);
  expect(defaultGlyphs.revision).toBe(revision);
});
it("visibly samples all five note phases, including their actual release transforms", () => {
  const rendered = render(utilities, resources(), {
    study: "phases",
    releaseStyle: "float",
    completedOpacity: 0.3,
  });
  const wrappers = rendered.filter(
    (o: any) => o.children?.length && [48, 160, 272, 384, 496].includes(o.x),
  ) as any[];
  expect(wrappers).toHaveLength(5);
  const roots = wrappers.map((o) => o.children[0]);
  expect(roots[0].opacity).toBe(0.22);
  expect(roots[1].opacity).toBeCloseTo(0.61);
  expect(roots[2].scaleX).toBe(1.15);
  expect(roots[3].y).toBeCloseTo(-1);
  expect(roots[4].opacity).toBeCloseTo(0.3);
  expect(roots[4].y).toBe(-2);
});
it("uses the built-in tempo map in the score preset without requiring host timing", () => {
  const r = resources();
  render(score, r, {
    demoExample: "tempo-map",
    measuresPerSystem: 2,
    systemsPerPage: 1,
    animate: false,
  });
  const notes = nodes(r.layout!.nodes)
    .filter((n) => n.note)
    .map((n) => n.note!);
  expect(notes.some((n) => n.startSeconds === 3)).toBe(true);
  expect(labTimeMap.secondsToBeats(3)).toBe(5);
});
for (const d of definitions) {
  it(`${d.type}: every preset uses valid properties and renders a real example`, () => {
    const properties = d.schema.tabs.flatMap((t) =>
      t.groups.flatMap((g) => g.properties),
    );
    const keys = new Set(properties.map((p) => p.key));
    expect(d.schema.presets?.length).toBeGreaterThan(0);
    for (const preset of d.schema.presets ?? []) {
      for (const [key, value] of Object.entries(preset.values)) {
        expect(keys.has(key), `${d.type}/${preset.id}: ${key}`).toBe(true);
        const p = properties.find((p) => p.key === key)!;
        if (p.options)
          expect(p.options.some((o) => o.value === value)).toBe(true);
      }
      const result = render(d, resources(), preset.values);
      expect(result.length).toBeGreaterThan(1);
      expect(JSON.stringify(result)).not.toContain("NaN");
    }
  });
}
for (const d of [engraving, utilities]) {
  for (const p of d.schema.tabs.flatMap((t) =>
    t.groups.flatMap((g) => g.properties),
  )) {
    it(`${d.type}: study control ${p.key} affects the shown content`, () => {
      const setup: Record<string, unknown> = {};
      // 'all' satisfies exclusion-based conditions while still showing the target panel.
      for (const c of p.visibleWhen ?? [])
        if ("equals" in c) setup[c.key] = c.equals;
      let value: unknown;
      if (p.options)
        value = p.options.find((o) => o.value !== p.default)!.value;
      else if (typeof p.default === "boolean") value = !p.default;
      else if (typeof p.default === "number")
        value =
          p.default === p.max
            ? p.default - 0.2
            : Math.min(
                p.max ?? Infinity,
                p.default + Math.max(0.1, Math.abs(p.default) * 0.25),
              );
      else value = "#ED5577";
      const seconds = p.key === "clock" ? 0.7 : 3.1;
      expect(JSON.stringify(render(d, resources(), setup, seconds))).not.toBe(
        JSON.stringify(
          render(d, resources(), { ...setup, [p.key]: value }, seconds),
        ),
      );
    });
  }
}
it("writes gallery previews using the host renderer", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".build/previews", { recursive: true });
  for (const [d, name, overrides] of [
    [engraving, "engraving-lab", {}],
    [utilities, "utility-lab", {}],
    [
      utilities,
      "utility-phases",
      { study: "phases", revealStyle: "spin", releaseStyle: "float" },
    ],
    [atlas, "custom-glyph", atlas.schema.presets![1].values],
  ] as const) {
    const objects = render(d, resources(), overrides),
      bounds = objects[0] as any,
      scale = Math.min(1, 1500 / bounds.width, 1200 / bounds.height),
      canvas = createCanvas(
        Math.ceil(bounds.width * scale),
        Math.ceil(bounds.height * scale),
      ),
      ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    for (const object of objects) (object as any).render(ctx, {}, 3.1);
    writeFileSync(`.build/previews/${name}.png`, canvas.toBuffer("image/png"));
  }
});
