import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { ClipLayer } from "@mvmnt-app/plugin-sdk/render";
import {
  buildSchematicStructure,
  schematicPlanes,
  type SchematicStructure,
  type StructureOptions,
  type SchematicSource,
} from "./notation/schematic";
import {
  sdkTimeMap,
  constantTimeMap,
  sameMidiNotes,
  projectScene,
  keyName,
  type TimeMap,
} from "./notation";
import { schematicDemo } from "./schematic-demo";
import { select, when, frame, label, inspectionProperties } from "./controls";
export interface SchematicResources {
  structure?: SchematicStructure;
  key: string;
  sources: SchematicSource[];
  timeSamples: number[];
}
const keyChoices = Array.from({ length: 15 }, (_, i) => ({
  value: String(i - 7),
  label: keyName({ fifths: i - 7 }),
}));
const trackProperties = Array.from({ length: 8 }, (_, i) =>
  prop.midiTrack(`track${i + 1}`, `Plane ${i + 1} track`, {
    visibleWhen: when("source", "tracks"),
  }),
);
export default definePluginElement({
  type: "commonnotation-schematic-structure",
  metadata: {
    name: "Notation · Schematic Structure",
    description:
      "A whole-piece musical structure on layered planes, with engraved focus and data-derived schematics.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      {
        id: "overview",
        label: "Whole-piece overview",
        values: {
          source: "demo",
          showNotation: false,
          showPoints: true,
          showRibbons: true,
          showConnectors: true,
          showAnnotations: true,
        },
      },
      {
        id: "engraving",
        label: "Detailed engraving focus",
        values: {
          source: "demo",
          showNotation: true,
          focusMode: "manual",
          focusTime: 8,
          focusMeasures: 8,
          detailBudget: 512,
        },
      },
      {
        id: "depth",
        label: "Inspect depth and attachment anchors",
        values: {
          source: "demo",
          showBounds: true,
          showAnchors: true,
          yaw: 35,
          pitch: 25,
        },
      },
      {
        id: "paper",
        label: "Ink on paper",
        values: { ink: "#272822", background: "#F4F1E7", accent: "#A33B28" },
      },
      {
        id: "night",
        label: "Night study",
        values: { ink: "#DDD4BD", background: "#10110F", accent: "#E0A46B" },
      },
    ],
    tabs: [
      tab.content([
        group("source", "Source and range", [
          select("source", "Source", "demo", ["demo", "tracks"]),
          ...trackProperties,
          select("rangeMode", "Range", "project", ["project", "custom"]),
          prop.number("rangeStart", "Start (seconds)", 0, {
            min: 0,
            max: 100000,
            step: 0.01,
            visibleWhen: when("rangeMode", "custom"),
          }),
          prop.number("rangeEnd", "End (seconds)", 64, {
            min: 0.01,
            max: 100000,
            step: 0.01,
            visibleWhen: when("rangeMode", "custom"),
          }),
          prop.number("tempoOverride", "Tempo override (0 = project map)", 0, {
            min: 0,
            max: 400,
          }),
          prop.boolean("overrideMeter", "Override time signature", false),
          prop.number("numerator", "Meter numerator", 4, {
            min: 1,
            max: 16,
            step: 1,
            visibleWhen: when("overrideMeter"),
          }),
          select(
            "denominator",
            "Meter denominator",
            "4",
            ["1", "2", "4", "8", "16"],
            when("overrideMeter"),
          ),
          prop.select("keySignature", "Key signature", "0", keyChoices),
          select("keyMode", "Key label", "major", ["major", "minor"]),
          select("spelling", "Chromatic preference", "sharps", [
            "sharps",
            "flats",
          ]),
          select("clef", "Clef", "auto", ["auto", "treble", "bass"]),
          prop.boolean("beaming", "Beam rhythmic groups", true),
        ]),
      ]),
      tab.appearance([
        group("structure", "Structure", [
          prop.number("seed", "Arrangement seed", 42, {
            min: 0,
            max: 1000000,
            step: 1,
          }),
          prop.number("measuresPerStrip", "Measures per strip", 4, {
            min: 1,
            max: 32,
            step: 1,
          }),
          prop.number("planeSpacing", "Plane spacing", 35, {
            min: 0,
            max: 100,
          }),
          prop.number("planeTilt", "Plane angle variation (degrees)", 40, {
            min: 0,
            max: 90,
          }),
          prop.number("notationSize", "Notation size", 1.25, {
            min: 0.5,
            max: 2.5,
            step: 0.05,
          }),
          prop.number("density", "Secondary mark density", 0.65, {
            min: 0,
            max: 1,
            step: 0.01,
          }),
        ]),
        group("layers", "Visual layers", [
          prop.boolean("showNotation", "Engraved notation", true),
          prop.boolean("showPoints", "Overview point fields", true),
          prop.boolean("showRibbons", "Duration and density ribbons", true),
          prop.boolean("showConnectors", "Musical connectors", true),
          prop.boolean("showAnnotations", "Musical annotations", true),
          prop.number("annotationDensity", "Annotation density", 0.1, {
            min: 0,
            max: 1,
            step: 0.01,
            visibleWhen: when("showAnnotations"),
          }),
          prop.boolean("showCaption", "Source and focus caption", true),
          prop.color("ink", "Ink", "#272822"),
          prop.color("background", "Background", "#F4F1E7"),
          prop.color("accent", "Playback accent", "#A33B28"),
          ...inspectionProperties(),
        ]),
      ]),
      tab.animation([
        group("camera", "Camera", [
          prop.number("yaw", "Yaw (degrees)", -24, { min: -180, max: 180 }),
          prop.number("pitch", "Pitch (degrees)", 15, { min: -75, max: 75 }),
          prop.number("perspective", "Perspective", 0.8, {
            min: 0,
            max: 1,
            step: 0.01,
          }),
          prop.number("zoom", "Zoom", 2, { min: 0.25, max: 4, step: 0.01 }),
          prop.boolean("rotateCamera", "Rotate camera", false),
          prop.number("rotationSpeed", "Camera rotation (degrees/s)", 2, {
            min: -20,
            max: 20,
            step: 0.1,
            visibleWhen: when("rotateCamera"),
          }),
        ]),
        group("focus", "Playback and focus", [
          select("focusMode", "Focus", "playback", ["playback", "manual"]),
          prop.number("focusTime", "Focus time (seconds)", 8, {
            min: 0,
            max: 100000,
            step: 0.1,
            visibleWhen: when("focusMode", "manual"),
          }),
          prop.number("focusMeasures", "Focus span (measures)", 4, {
            min: 1,
            max: 32,
            step: 1,
          }),
          prop.number("reveal", "Reveal before onset (s)", 0.4, {
            min: 0,
            max: 5,
            step: 0.01,
          }),
          prop.number("release", "Release after note-off (s)", 0.8, {
            min: 0,
            max: 5,
            step: 0.01,
          }),
          prop.number("futureOpacity", "Future opacity", 0.38, {
            min: 0,
            max: 1,
            step: 0.01,
          }),
          prop.number("completedOpacity", "Completed opacity", 0.65, {
            min: 0,
            max: 1,
            step: 0.01,
          }),
        ]),
      ]),
      tab.advanced([
        group("budget", "Detail budgets", [
          prop.number("detailBudget", "Detailed events", 256, {
            min: 16,
            max: 1024,
            step: 16,
          }),
          prop.number("overviewBudget", "Overview marks", 2048, {
            min: 128,
            max: 8192,
            step: 128,
          }),
          prop.number("width", "Container width", 1600, {
            min: 320,
            max: 3840,
          }),
          prop.number("height", "Container height", 1000, {
            min: 240,
            max: 2160,
          }),
        ]),
      ]),
    ],
  },
  createResources(): SchematicResources {
    return { key: "", sources: [], timeSamples: [] };
  },
  disposeResources(resources) {
    resources.structure = undefined;
    resources.sources = [];
    resources.timeSamples = [];
    resources.key = "";
  },
  render({ props, time, context, resources }) {
    const base = () => frame(props.width, props.height, props.background);
    try {
      let sources: readonly SchematicSource[] = schematicDemo,
        duration = 64,
        tempo = 120,
        meter = { numerator: 4, denominator: 4 };
      if (props.source === "tracks") {
        const timeline = context.timeline;
        if (!timeline)
          return [
            base(),
            label(24, 32, "MIDI timeline unavailable", props.ink),
          ];
        const metadata = timeline.getMetadata();
        if (!metadata.ok)
          return [base(), label(24, 32, metadata.error.message, props.ink)];
        duration = metadata.value.durationSeconds;
        tempo = metadata.value.tempoBpm;
        meter = metadata.value.timeSignature;
        const ids = [
          ...new Set(
            Array.from(
              { length: 8 },
              (_, i) =>
                (props as Readonly<Record<string, unknown>>)[`track${i + 1}`],
            ).filter((id): id is string => typeof id === "string" && !!id),
          ),
        ];
        if (!ids.length)
          return [
            base(),
            label(
              24,
              32,
              "Choose a MIDI track for one or more planes",
              props.ink,
            ),
          ];
        const start = props.rangeMode === "custom" ? props.rangeStart : 0,
          end = props.rangeMode === "custom" ? props.rangeEnd : duration;
        if (end <= start)
          throw new Error("The source range must end after it starts");
        sources = ids.map((id) => {
          const track = timeline.getTrack(id);
          if (!track.ok) throw new Error(`Selected track unavailable: ${id}`);
          const selected = timeline.selectNotes({
            trackIds: [id],
            startSeconds: start,
            endSeconds: end,
          });
          if (!selected.ok) throw new Error(selected.error.message);
          return { id, name: track.value.name, notes: selected.value };
        });
      }
      if (props.overrideMeter)
        meter = {
          numerator: Math.round(props.numerator),
          denominator: Number(props.denominator),
        };
      const start = props.rangeMode === "custom" ? props.rangeStart : 0,
        end = props.rangeMode === "custom" ? props.rangeEnd : duration;
      const map: TimeMap =
        props.tempoOverride > 0
          ? constantTimeMap(props.tempoOverride)
          : props.source === "tracks" && context.timing
            ? sdkTimeMap(context.timing)
            : constantTimeMap(tempo);
      const options: StructureOptions = {
        startSeconds: start,
        endSeconds: end,
        tempo: props.tempoOverride > 0 ? props.tempoOverride : tempo,
        ...meter,
        timeMap: map,
        keySignature: {
          fifths: Number(props.keySignature),
          mode: props.keyMode as "major" | "minor",
        },
        spelling: props.spelling as "sharps" | "flats",
        clef: props.clef as "treble" | "bass" | "auto",
        beaming: props.beaming,
        seed: props.seed,
        measuresPerStrip: Math.round(props.measuresPerStrip),
        planeSpacing: props.planeSpacing,
        planeTilt: (props.planeTilt * Math.PI) / 180,
        notationSize: props.notationSize,
        density: props.density,
        detailBudget: Math.round(props.detailBudget),
        overviewBudget: Math.round(props.overviewBudget),
      };
      const key = JSON.stringify({
        ...options,
        timeMap: undefined,
        seed: undefined,
        planeSpacing: undefined,
        planeTilt: undefined,
        notationSize: undefined,
        density: undefined,
        detailBudget: undefined,
        beaming: undefined,
        sources: sources.map((s) => [s.id, s.name]),
      });
      const samples = sources.flatMap((s) =>
        s.notes
          .filter(
            (n) =>
              Number.isFinite(n.startSeconds) && Number.isFinite(n.endSeconds),
          )
          .flatMap((n) => [
            map.secondsToBeats(n.startSeconds),
            map.secondsToBeats(n.endSeconds),
          ]),
      );
      samples.push(map.secondsToBeats(start), map.secondsToBeats(end));
      if (
        !resources.structure ||
        key !== resources.key ||
        sources.length !== resources.sources.length ||
        sources.some(
          (s, i) => !sameMidiNotes(s.notes, resources.sources[i]?.notes ?? []),
        ) ||
        samples.length !== resources.timeSamples.length ||
        samples.some((s, i) => s !== resources.timeSamples[i])
      ) {
        resources.structure = buildSchematicStructure(sources, options);
        resources.key = key;
        resources.sources = sources.map((s) => ({
          ...s,
          notes: s.notes.map((n) => ({ ...n })),
        }));
        resources.timeSamples = samples;
      }
      resources.structure.options = {
        ...options,
        timeMap: resources.structure.timeMap,
      };
      const reach = Math.max(1, resources.structure.tracks.length - 1) / 2;
      resources.structure.radius =
        Math.hypot(
          resources.structure.width / 2 + 20 + reach * 20,
          resources.structure.height / 2 + 20 + reach * 8,
          reach * options.planeSpacing,
        ) + 20;
      const structure = resources.structure,
        focusTime =
          props.focusMode === "manual" ? props.focusTime : time.seconds;
      const planes = schematicPlanes(structure, {
        time: time.seconds,
        focusTime,
        focusMeasures: props.focusMeasures,
        showNotation: props.showNotation,
        showPoints: props.showPoints,
        showRibbons: props.showRibbons,
        showConnectors: props.showConnectors,
        showAnnotations: props.showAnnotations,
        futureOpacity: props.futureOpacity,
        completedOpacity: props.completedOpacity,
        annotationDensity: props.annotationDensity,
        ink: props.ink,
        accent: props.accent,
      });
      const camera = {
        width: props.width,
        height: props.height,
        yaw:
          ((props.yaw +
            (props.rotateCamera ? time.seconds * props.rotationSpeed : 0)) *
            Math.PI) /
          180,
        pitch: (props.pitch * Math.PI) / 180,
        distance: structure.radius * 2.8,
        focalLength: Math.min(props.width, props.height) * 1.1,
        near: Math.max(1, structure.radius * 0.02),
        zoom: props.zoom,
        perspective: props.perspective,
      };
      const objects = projectScene(planes, camera, {
        time: time.seconds,
        color: props.ink,
        activeColor: props.accent,
        reveal: props.reveal,
        release: props.release,
        revealStyle: "fade",
        releaseStyle: "settle",
        activeScale: 1.04,
        upcomingOpacity: props.futureOpacity,
        completedOpacity: props.completedOpacity,
        showBounds: props.showBounds,
        showAnchors: props.showAnchors,
      });
      const clip = new ClipLayer(props.width, props.height)
        .addChildren(objects)
        .setLayoutParticipation("exclude");
      const result = [base(), clip];
      if (props.showCaption) {
        const invalid = structure.tracks.reduce((s, t) => s + t.invalid, 0);
        result.push(
          label(
            24,
            30,
            `SCHEMATIC STRUCTURE  ·  ${props.source === "demo" ? "demonstration" : `${sources.length} tracks`}  ·  ${structure.sourceNotes.toLocaleString()} notes  ·  focus ${focusTime.toFixed(1)}s${invalid ? `  ·  ${invalid} invalid records omitted` : ""}`,
            props.ink,
            13,
          ),
        );
        if (
          props.source === "tracks" &&
          !context.timing &&
          props.tempoOverride === 0
        )
          result.push(
            label(
              24,
              50,
              "Constant-tempo fallback: timeline conversion is unavailable",
              props.ink,
              11,
            ),
          );
      }
      return result;
    } catch (error) {
      return [
        base(),
        label(
          24,
          32,
          error instanceof Error ? error.message : String(error),
          props.ink,
        ),
      ];
    }
  },
});
