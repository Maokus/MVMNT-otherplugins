import { expect, it, vi } from "vitest";
vi.mock("@mvmnt-app/plugin-sdk/render", async () => ({
  ...(await import("../../../MVMNT/src/core/render/render-objects/bezier")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/empty")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/line")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/rectangle")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/text")),
  ...(await import("../../../MVMNT/src/core/render/render-objects/clip-layer")),
}));
import definition, {
  type SchematicResources,
} from "../src/schematic-structure";
import { schematicDemo } from "../src/schematic-demo";
import {
  buildSchematicStructure,
  schematicPlanes,
  type StructureOptions,
} from "../src/notation/schematic";
import {
  projectScene,
  IntervalIndex,
  normalizeMidiNotes,
  walkNodes,
} from "../src/notation";
const props = Object.fromEntries(
  definition.schema.tabs.flatMap((t) =>
    t.groups.flatMap((g) => g.properties.map((p) => [p.key, p.default])),
  ),
);
const resources = (): SchematicResources => ({
  key: "",
  sources: [],
  timeSamples: [],
});
const render = (
  r: SchematicResources,
  time: number,
  overrides: Record<string, unknown> = {},
  context: unknown = {},
) =>
  definition.render({
    props: { ...props, ...overrides },
    time: { seconds: time, beats: null, ticks: null, frame: null },
    resources: r,
    context,
  } as never);
const options: StructureOptions = {
  startSeconds: 0,
  endSeconds: 64,
  tempo: 120,
  numerator: 4,
  denominator: 4,
  keySignature: { fifths: 0 },
  spelling: "sharps",
  clef: "auto",
  beaming: true,
  seed: 42,
  measuresPerStrip: 4,
  planeSpacing: 35,
  planeTilt: 0.7,
  notationSize: 1.25,
  density: 0.65,
  detailBudget: 256,
  overviewBudget: 2048,
};
const frame = {
  time: 8,
  focusTime: 8,
  focusMeasures: 4,
  showNotation: true,
  showPoints: true,
  showRibbons: true,
  showConnectors: true,
  showAnnotations: true,
  futureOpacity: 0.38,
  completedOpacity: 0.65,
  annotationDensity: 0.1,
  ink: "#272822",
  accent: "#A33B28",
};
it("builds one stable plane per track and retains the complete time range", () => {
  const structure = buildSchematicStructure(schematicDemo, options),
    planes = schematicPlanes(structure, frame),
    later = schematicPlanes(structure, { ...frame, time: 40, focusTime: 40 });
  expect(planes).toHaveLength(3);
  expect(planes.map((p) => p.transform)).toEqual(later.map((p) => p.transform));
  expect(structure.sourceNotes).toBe(
    schematicDemo.reduce((s, t) => s + t.notes.length, 0),
  );
  expect(structure.tracks.every((t) => t.cells.some((c) => c.end > 60))).toBe(
    true,
  );
  expect(
    structure.tracks.reduce((s, t) => s + t.cells.length, 0),
  ).toBeLessThanOrEqual(2048);
  let details = 0;
  for (const plane of planes)
    walkNodes(plane.nodes, (n) => {
      if (n.role === "chord") details++;
    });
  expect(details).toBeLessThanOrEqual(256);
});
it("queries exact active performance intervals efficiently", () => {
  const notes = normalizeMidiNotes(schematicDemo[0].notes).notes,
    index = new IntervalIndex(notes);
  for (const time of [0, 0.125, 2, 14, 64])
    expect([...index.active(time)].sort()).toEqual(
      notes
        .filter((n) => n.startSeconds <= time && time < n.endSeconds)
        .map((n) => n.id)
        .sort(),
    );
});
it("retains cached structure across camera/playback changes and invalidates data edits", () => {
  const r = resources();
  render(r, 8);
  const structure = r.structure;
  expect(structure).toBeDefined();
  render(r, 20, { yaw: 40, showRibbons: false });
  expect(r.structure).toBe(structure);
  const first = render(r, 8);
  render(r, 900);
  expect(render(r, 8)).toEqual(first);
  let notes = schematicDemo[0].notes.slice();
  const context = {
    timeline: {
      getMetadata: () => ({
        ok: true,
        value: {
          durationSeconds: 64,
          tempoBpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
        },
      }),
      getTrack: (id: string) => ({ ok: true, value: { id, name: id } }),
      selectNotes: () => ({ ok: true, value: notes }),
    },
  };
  render(r, 8, { source: "tracks", track1: "one", track2: "one" }, context);
  expect(r.structure!.tracks).toHaveLength(1);
  const previous = r.structure;
  notes = notes.map((n, i) => (i ? n : { ...n, velocity: 1 }));
  render(r, 8, { source: "tracks", track1: "one", track2: "one" }, context);
  expect(r.structure).not.toBe(previous);
  definition.disposeResources!(r, {} as never);
  expect(r.sources).toEqual([]);
  expect(r.structure).toBeUndefined();
});
it("handles absent and missing selected tracks without substituting demo notes", () => {
  expect(render(resources(), 0, { source: "tracks" })[1]).toMatchObject({
    text: "MIDI timeline unavailable",
  });
  const context = {
    timeline: {
      getMetadata: () => ({
        ok: true,
        value: {
          durationSeconds: 10,
          tempoBpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
        },
      }),
      getTrack: () => ({ ok: false }),
    },
  };
  expect(
    render(resources(), 0, { source: "tracks", track1: "missing" }, context)[1],
  ).toMatchObject({ text: "Selected track unavailable: missing" });
  expect(
    render(resources(), 0, {
      rangeMode: "custom",
      rangeStart: 9,
      rangeEnd: 2,
    })[1],
  ).toMatchObject({
    text: "Range end must be finite and between 9.001 and 100000000",
  });
});
it("changes actual camera geometry, layer roles, and manual focus selection", () => {
  const structure = buildSchematicStructure(schematicDemo, options);
  const a = schematicPlanes(structure, frame),
    b = schematicPlanes(structure, {
      ...frame,
      showPoints: false,
      showRibbons: false,
      showConnectors: false,
      showAnnotations: false,
    });
  const roles = new Set<string>();
  for (const plane of b) walkNodes(plane.nodes, (n) => roles.add(n.role));
  expect(roles.has("point")).toBe(false);
  expect(roles.has("ribbon")).toBe(false);
  expect(roles.has("connector")).toBe(false);
  expect(roles.has("annotation")).toBe(false);
  const camera = {
      width: 800,
      height: 600,
      yaw: 0,
      pitch: 0.1,
      distance: structure.radius * 2.8,
      focalLength: 660,
      near: 1,
      zoom: 1.5,
      perspective: 0.8,
    },
    opts = {
      time: 8,
      color: frame.ink,
      activeColor: frame.accent,
      reveal: 0.4,
      release: 0.8,
    };
  expect(projectScene(a, camera, opts)).not.toEqual(
    projectScene(a, { ...camera, yaw: 0.7 }, opts),
  );
  const r = resources();
  const at8 = render(r, 8, { focusMode: "manual", focusTime: 24 });
  const ids = r.structure!.tracks.map((t) => [...t.cache.keys()]);
  render(r, 16, { focusMode: "manual", focusTime: 24 });
  expect(r.structure!.tracks.map((t) => [...t.cache.keys()])).toEqual(ids);
  expect(at8.length).toBeGreaterThan(1);
});
it("renders spatial preview matrices through the actual host drawing classes", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(".build/previews", { recursive: true });
  for (const [name, overrides] of [
    ["schematic-paper", {}],
    [
      "schematic-night",
      { ink: "#DDD4BD", background: "#10110F", accent: "#E0A46B", yaw: 24 },
    ],
    [
      "schematic-flat",
      {
        perspective: 0,
        yaw: 0,
        pitch: 0,
        planeTilt: 0,
        planeSpacing: 10,
        zoom: 1.3,
      },
    ],
    [
      "schematic-detailed",
      {
        focusMode: "manual",
        focusTime: 20,
        focusMeasures: 12,
        detailBudget: 512,
        zoom: 2,
        yaw: -34,
      },
    ],
  ] as const) {
    const objects = render(resources(), 8, overrides),
      canvas = createCanvas(1600, 1000),
      ctx = canvas.getContext("2d");
    for (const object of objects)
      (
        object as unknown as {
          render: (c: unknown, o: unknown, t: number) => void;
        }
      ).render(ctx, {}, 8);
    writeFileSync(`.build/previews/${name}.png`, canvas.toBuffer("image/png"));
  }
});

it("benchmarks a 20,000-note eight-track composition at 1080p", async () => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const sources = Array.from({ length: 8 }, (_, track) => ({
    id: `bench:${track}`,
    name: `Track ${track + 1}`,
    notes: Array.from({ length: 2500 }, (_, i) => ({
      trackId: `bench:${track}`,
      channel: track,
      note: 48 + ((i * 7 + track * 3) % 36),
      startSeconds: i * 0.125,
      endSeconds: i * 0.125 + 0.1 + (i % 7 === 0 ? 0.2 : 0),
      durationSeconds: 0.1,
      velocity: 50 + (i % 70),
    })),
  }));
  const coldStart = performance.now(),
    memoryBefore = process.memoryUsage().heapUsed;
  const structure = buildSchematicStructure(sources, {
    ...options,
    endSeconds: 313,
  });
  const coldMs = performance.now() - coldStart,
    heapMB = (process.memoryUsage().heapUsed - memoryBefore) / 1048576;
  const camera = {
    width: 1920,
    height: 1080,
    yaw: -0.4,
    pitch: 0.2,
    distance: structure.radius * 2.8,
    focalLength: 1188,
    near: 1,
    zoom: 2,
    perspective: 0.8,
  };
  const opts = {
    time: 100,
    color: frame.ink,
    activeColor: frame.accent,
    reveal: 0.4,
    release: 0.8,
  };
  const samples: number[] = [];
  let primitives = 0;
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    const planes = schematicPlanes(structure, {
      ...frame,
      time: 100 + i / 60,
      focusTime: 100 + i / 60,
    });
    const result = projectScene(planes, camera, {
      ...opts,
      time: 100 + i / 60,
    });
    primitives = result.length;
    if (i > 2) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const r = resources(),
    context = {
      timeline: {
        getMetadata: () => ({
          ok: true,
          value: {
            durationSeconds: 313,
            tempoBpm: 120,
            timeSignature: { numerator: 4, denominator: 4 },
          },
        }),
        getTrack: (id: string) => ({ ok: true, value: { id, name: id } }),
        selectNotes: ({ trackIds }: any) => ({
          ok: true,
          value: sources.find((s) => s.id === trackIds[0])!.notes,
        }),
      },
    };
  const overrides: Record<string, unknown> = {
    source: "tracks",
    width: 1920,
    height: 1080,
  };
  sources.forEach((s, i) => (overrides[`track${i + 1}`] = s.id));
  render(r, 100, overrides, context);
  const fullSamples: number[] = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    render(r, 100 + i / 60, overrides, context);
    fullSamples.push(performance.now() - start);
  }
  fullSamples.sort((a, b) => a - b);
  const report = {
    notes: 20000,
    tracks: 8,
    coldMs,
    heapUsedMB: process.memoryUsage().heapUsed / 1048576,
    rssMB: process.memoryUsage().rss / 1048576,
    heapDeltaMB: heapMB,
    medianProjectionMs: samples[Math.floor(samples.length / 2)],
    medianElementMs: fullSamples[4],
    primitives,
  };
  mkdirSync(".build", { recursive: true });
  writeFileSync(".build/benchmark.json", JSON.stringify(report, null, 2));
  expect(structure.sourceNotes).toBe(20000);
  expect(primitives).toBeLessThan(25000);
});

const schemaProperties = definition.schema.tabs.flatMap((t) =>
  t.groups.flatMap((g) => g.properties),
);
const contextForProperties = {
  timeline: {
    getMetadata: () => ({
      ok: true,
      value: {
        durationSeconds: 64,
        tempoBpm: 120,
        timeSignature: { numerator: 4, denominator: 4 },
      },
    }),
    getTrack: (id: string) => ({ ok: true, value: { id, name: id } }),
    selectNotes: ({ trackIds }: any) => ({
      ok: true,
      value: schematicDemo[Number(trackIds[0].slice(-1)) % 3].notes.map(
        (n) => ({ ...n, trackId: trackIds[0] }),
      ),
    }),
  },
};
for (const property of schemaProperties) {
  it(`schematic control ${property.key} changes its relevant output`, () => {
    const setup: Record<string, unknown> = {};
    for (const c of property.visibleWhen ?? []) {
      if ("equals" in c) setup[c.key] = c.equals;
    }
    if (property.key === "overrideMeter") setup.numerator = 3;
    if (property.key === "rangeMode") setup.rangeEnd = 32;
    if (property.key === "source") setup.track1 = "track0";
    if (property.key === "detailBudget") {
      setup.focusMeasures = 32;
      setup.focusMode = "manual";
      setup.focusTime = 32;
    }
    let value: unknown;
    if (property.options)
      value = property.options.find((o) => o.value !== property.default)!.value;
    else if (property.type === "timelineTrackRef") value = "track0";
    else if (typeof property.default === "boolean") value = !property.default;
    else if (typeof property.default === "number")
      value =
        property.key === "tempoOverride"
          ? 90
          : property.key === "rangeStart"
            ? 4
            : property.key === "rangeEnd"
              ? 48
              : property.key === "detailBudget"
                ? 512
                : property.default === property.max
                  ? property.default - 0.2
                  : Math.min(
                      property.max ?? Infinity,
                      property.default +
                        Math.max(0.2, Math.abs(property.default) * 0.3),
                    );
    else value = "#CC3333";
    const times = [
      "reveal",
      "release",
      "futureOpacity",
      "completedOpacity",
      "focusMode",
    ].includes(property.key)
      ? [0.2, 0.7, 8.2]
      : [8];
    const differs = times.some(
      (t) =>
        JSON.stringify(render(resources(), t, setup, contextForProperties)) !==
        JSON.stringify(
          render(
            resources(),
            t,
            { ...setup, [property.key]: value },
            contextForProperties,
          ),
        ),
    );
    expect(differs, `${property.key} must change relevant output`).toBe(true);
  });
}

it("keeps all overview regions within a small budget and adds strip continuation ties", () => {
  const source = {
    id: "long",
    name: "Long sustain",
    notes: [
      {
        trackId: "long",
        channel: 0,
        note: 60,
        startSeconds: 0,
        endSeconds: 24,
        durationSeconds: 24,
      },
    ],
  };
  const structure = buildSchematicStructure([source], {
    ...options,
    overviewBudget: 16,
    measuresPerStrip: 1,
    detailBudget: 256,
  });
  const planes = schematicPlanes(structure, {
    ...frame,
    focusTime: 12,
    focusMeasures: 32,
  });
  const ties: any[] = [];
  walkNodes(planes[0].nodes, (n) => {
    if (n.role === "tie") ties.push(n);
  });
  expect(ties.some((n) => n.id.includes("continuation:in"))).toBe(true);
  expect(ties.some((n) => n.id.includes("continuation:out"))).toBe(true);
  expect(structure.tracks[0].cells.length).toBeLessThanOrEqual(16);
});
it("invalidates engraving after tempo-map edits but reuses it for arrangement changes", () => {
  let rate = 2;
  const r = resources();
  const context = {
    ...contextForProperties,
    timing: {
      secondsToBeats: (s: number) => ({ ok: true, value: s * rate }),
      beatsToSeconds: (b: number) => ({ ok: true, value: b / rate }),
    },
  };
  render(r, 8, { source: "tracks", track1: "track0" }, context);
  const first = r.structure;
  render(
    r,
    8,
    {
      source: "tracks",
      track1: "track0",
      seed: 99,
      density: 0.1,
      planeSpacing: 50,
    },
    context,
  );
  expect(r.structure).toBe(first);
  rate = 1;
  render(r, 8, { source: "tracks", track1: "track0" }, context);
  expect(r.structure).not.toBe(first);
});
