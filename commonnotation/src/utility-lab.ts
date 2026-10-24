import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  EmptyRenderObject,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import {
  adaptMidiNotes,
  buildChord,
  groupNode,
  NotationRenderer,
  anchorConnector,
  resolveAnchor,
  pointNode,
  pointField,
  lineNode,
  ribbonNode,
  bracketNode,
  seededValue,
  evaluateNotePhase,
  remeasure,
  type LayoutNode,
  type ScoreEvent,
  type RenderOptions,
} from "./notation";
import { makeExampleRegistry, exampleNote } from "./example-fixtures";
import {
  frame,
  label,
  select,
  when,
  effectProperties,
  effects,
  inspectionProperties,
} from "./controls";
export interface UtilityStudies {
  geometry: LayoutNode;
  marks: LayoutNode;
  original: LayoutNode;
  custom: LayoutNode;
  phaseEvent: ScoreEvent;
  registry: ReturnType<typeof makeExampleRegistry>;
}
interface BuildOptions {
  rotation: number;
  scaleX: number;
  scaleY: number;
  seed: number;
  customHead: boolean;
  showConnector: boolean;
}
export function buildUtilityStudies(props: BuildOptions): UtilityStudies {
  const event = (pitch: number, id: string) => {
    const e = adaptMidiNotes([exampleNote(pitch, 0, 2)], {
      tempo: 120,
      numerator: 4,
      denominator: 4,
      measureCount: 1,
    }).measures[0].events[0];
    return {
      ...e,
      id,
      notes: e.notes.map((n, i) => ({ ...n, id: `${id}:note:${i}` })),
    };
  };
  const a = buildChord(event(64, "a"), "treble"),
    b = buildChord(event(72, "b"), "treble");
  a.x = 7;
  a.y = 4;
  b.x = 18;
  b.y = 3;
  b.rotation = (props.rotation * Math.PI) / 180;
  b.scaleX = props.scaleX;
  b.scaleY = props.scaleY;
  b.originX = 0.6;
  b.originY = 2;
  const geometryNodes = [a, b];
  if (props.showConnector) {
    const connector = anchorConnector(
      "stem-connector",
      geometryNodes,
      { id: a.id, anchor: "stemTip" },
      { id: b.id, anchor: "stemTip" },
      0.12,
    );
    if (connector) {
      connector.color = "#34D399";
      geometryNodes.push(connector);
    }
  }
  for (const note of [a, b]) {
    const p = resolveAnchor(geometryNodes, note.id, "stemTip");
    if (p) {
      const marker = pointNode(`${note.id}:anchor`, p.x, p.y, 0.22);
      marker.color = "#FBBF24";
      geometryNodes.push(marker);
    }
  }
  const geometry = remeasure(
    groupNode("transforms", "transforms", geometryNodes),
  );
  const samples = [
    { pitch: 60, velocity: 40, duration: 0.5 },
    { pitch: 67, velocity: 96, duration: 1.5 },
    { pitch: 64, velocity: 64, duration: 1 },
    { pitch: 72, velocity: 112, duration: 2 },
    { pitch: 65, velocity: 78, duration: 0.75 },
    { pitch: 69, velocity: 100, duration: 1.25 },
  ];
  const points = pointField(
    "field",
    samples.map((n, i) => ({
      id: String(i),
      x: 2 + i * 4,
      y: 6 - (n.pitch - 60) / 3,
      radius: 0.15 + (n.velocity / 127) * 0.4,
    })),
  );
  const marks: LayoutNode[] = [
    lineNode("baseline", { x: 1, y: 8 }, { x: 25, y: 8 }, 0.04, "guide"),
    bracketNode("group-bracket", 1, 0.3, 24, 9),
    ...points,
  ];
  samples.forEach((n, i) => {
    const ribbon = ribbonNode(
      `duration:${i}`,
      2 + i * 4,
      8,
      n.duration * 1.5,
      0.15 + (n.velocity / 127) * 0.5,
    );
    ribbon.color =
      seededValue(props.seed, ribbon.id) > 0.5 ? "#34D399" : "#A78BFA";
    marks.push(ribbon);
    if (i < points.length - 1) {
      const connector = anchorConnector(
        `point-link:${i}`,
        points,
        { id: points[i].id, anchor: "centre" },
        { id: points[i + 1].id, anchor: "centre" },
        0.055,
      );
      if (connector) {
        connector.opacity = 0.45;
        marks.push(connector);
      }
    }
  });
  const registry = makeExampleRegistry();
  if (props.customHead)
    registry.register("noteheadBlack", registry.get("exampleDiamond"));
  const chordEvent = event(64, "custom");
  chordEvent.duration = { denominator: 4, dotted: false, beats: 1 };
  chordEvent.notes.push({
    ...chordEvent.notes[0],
    id: "custom:third",
    pitch: { midi: 67, step: 4, octave: 4, accidental: 0 },
  });
  const original = buildChord({ ...chordEvent, id: "original" }, "treble"),
    custom = buildChord(chordEvent, "treble", registry);
  const phaseEvent = event(64, "phase");
  phaseEvent.notes = phaseEvent.notes.map((n) => ({
    ...n,
    startSeconds: 1,
    endSeconds: 2,
  }));
  return {
    geometry,
    marks: groupNode("marks", "marks", marks),
    original,
    custom,
    phaseEvent,
    registry,
  };
}
const studyKinds = ["all", "transforms", "marks", "custom", "phases"];
const visibleFor = (kind: string) =>
  studyKinds
    .filter((k) => k !== "all" && k !== kind)
    .map((k) => ({ key: "study", notEquals: k }));
interface Resources {
  key: string;
  studies?: UtilityStudies;
  renderer: NotationRenderer;
}
export default definePluginElement({
  type: "commonnotation-utility-lab",
  metadata: {
    name: "Notation · Utility Lab",
    description:
      "Transforms, anchor connections, schematic marks, custom glyph assembly and all five playback phases.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      { id: "all", label: "All utility studies", values: { study: "all" } },
      {
        id: "anchors",
        label: "Transformed attachment anchors",
        values: {
          study: "transforms",
          showAnchors: true,
          showBounds: true,
          rotation: 30,
          scaleX: 1.4,
          scaleY: 0.8,
        },
      },
      {
        id: "custom",
        label: "Custom notehead assembly",
        values: { study: "custom", customHead: true, showAnchors: true },
      },
      {
        id: "phases",
        label: "Spin reveal / float release",
        values: {
          study: "phases",
          revealStyle: "spin",
          releaseStyle: "float",
          upcomingOpacity: 0.15,
          completedOpacity: 0.5,
        },
      },
    ],
    tabs: [
      tab.content([
        group("study", "Study", [
          select("study", "Study", "all", [
            "all",
            "transforms",
            "marks",
            "custom",
            "phases",
          ]),
          prop.number("rotation", "Second note rotation (degrees)", 25, {
            min: -45,
            max: 45,
            visibleWhen: visibleFor("transforms"),
          }),
          prop.number("scaleX", "Second note horizontal scale", 1.2, {
            min: 0.5,
            max: 1.6,
            step: 0.05,
            visibleWhen: visibleFor("transforms"),
          }),
          prop.number("scaleY", "Second note vertical scale", 0.8, {
            min: 0.5,
            max: 1.6,
            step: 0.05,
            visibleWhen: visibleFor("transforms"),
          }),
          prop.boolean(
            "showConnector",
            "Connect transformed stem anchors",
            true,
            { visibleWhen: visibleFor("transforms") },
          ),
          prop.number("seed", "Ribbon palette seed", 42, {
            min: 0,
            max: 100000,
            step: 1,
            visibleWhen: visibleFor("marks"),
          }),
          prop.boolean("customHead", "Use local diamond noteheads", true, {
            visibleWhen: visibleFor("custom"),
          }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.color("color", "Notation and labels", "#E2E8F0"),
          prop.color("accent", "Phase accent", "#34D399"),
          prop.color("background", "Background", "#111827"),
          prop.boolean("showExplanations", "Show study explanations", true),
          ...inspectionProperties(),
        ]),
      ]),
      tab.animation([
        group("phases", "Phase comparison", [
          ...effectProperties().map((p) => ({
            ...p,
            visibleWhen: [...(p.visibleWhen ?? []), ...visibleFor("phases")],
          })),
          prop.number("phaseProgress", "Reveal / release progress", 0.5, {
            min: 0,
            max: 1,
            step: 0.01,
            visibleWhen: [...when("animate"), ...visibleFor("phases")],
          }),
        ]),
      ]),
    ],
  },
  createResources(): Resources {
    return { key: "", renderer: new NotationRenderer() };
  },
  disposeResources(resources) {
    resources.key = "";
    resources.studies = undefined;
  },
  render({ props, resources }) {
    const key = JSON.stringify([
      props.rotation,
      props.scaleX,
      props.scaleY,
      props.showConnector,
      props.seed,
      props.customHead,
    ]);
    if (resources.key !== key || !resources.studies) {
      resources.studies = buildUtilityStudies(props);
      resources.key = key;
    }
    const studies = resources.studies,
      panelKinds = ["transforms", "marks", "custom", "phases"].filter(
        (k) => props.study === "all" || props.study === k,
      ),
      columns = props.study === "all" ? 2 : 1,
      cardW = 620,
      cardH = 350;
    const objects: RenderObject[] = [
      frame(
        cardW * columns,
        Math.ceil(panelKinds.length / columns) * cardH,
        props.background,
      ),
    ];
    const options: RenderOptions = {
      time: 0,
      color: props.color,
      activeColor: props.accent,
      reveal: 0,
      release: 0,
      animate: false,
      showBounds: props.showBounds,
      showAnchors: props.showAnchors,
    };
    const diagram = (
      node: LayoutNode,
      x: number,
      y: number,
      scale: number,
      renderer = resources.renderer,
    ) =>
      new EmptyRenderObject()
        .setPosition(x, y)
        .setScale(scale)
        .addChild(renderer.renderNode(node, options))
        .setLayoutParticipation("exclude");
    panelKinds.forEach((kind, index) => {
      const x = (index % columns) * cardW,
        y = Math.floor(index / columns) * cardH;
      objects.push(
        new Rectangle(x + 8, y + 8, cardW - 16, cardH - 16, {
          fillColor: null,
          strokeColor: props.color,
          strokeWidth: 0.5,
        })
          .setOpacity(0.25)
          .setLayoutParticipation("exclude"),
      );
      const heading = {
        transforms: "01  TRANSFORMS AND LIVE ANCHORS",
        marks: "02  SCHEMATIC MARKS",
        custom: "03  LOCAL GLYPH REGISTRY",
        phases: "04  ALL FIVE NOTE PHASES",
      }[kind]!;
      objects.push(label(x + 20, y + 33, heading, props.color, 14));
      const descriptions = {
        transforms:
          "Origin, non-uniform scale and rotation; the connector resolves transformed anchors.",
        marks:
          "Pitch → height · velocity → size/thickness · duration → ribbon length.",
        custom:
          "The same chord builder, with an isolated notehead registry and its own anchors.",
        phases:
          "One performance interval, sampled at five distinct absolute times.",
      };
      if (props.showExplanations)
        objects.push(
          label(
            x + 20,
            y + 56,
            descriptions[kind as keyof typeof descriptions],
            props.color,
            11,
          ),
        );
      if (kind === "transforms") {
        objects.push(diagram(studies.geometry, x + 45, y + 110, 19));
        if (props.showExplanations)
          objects.push(
            label(
              x + 20,
              y + 320,
              `${props.rotation}°  ·  scale (${props.scaleX.toFixed(2)}, ${props.scaleY.toFixed(2)})  ·  stem-tip anchors`,
              props.color,
              12,
            ),
          );
      } else if (kind === "marks") {
        objects.push(diagram(studies.marks, x + 55, y + 105, 20));
        if (props.showExplanations)
          objects.push(
            label(
              x + 20,
              y + 320,
              "A fixed dataset; the seed changes ribbon colors without moving its points.",
              props.color,
              12,
            ),
          );
      } else if (kind === "custom") {
        objects.push(diagram(studies.original, x + 150, y + 150, 29));
        objects.push(
          diagram(
            studies.custom,
            x + 425,
            y + 150,
            29,
            new NotationRenderer(studies.registry),
          ),
        );
        objects.push(
          label(x + 95, y + 285, "Default noteheads", props.color, 13),
          label(
            x + 360,
            y + 285,
            props.customHead ? "Local diamond heads" : "Local default heads",
            props.color,
            13,
          ),
        );
      } else {
        const progress = props.phaseProgress;
        const times = [
          1 - props.reveal - 0.5,
          1 - props.reveal * (1 - progress),
          1.5,
          2 + props.release * progress,
          2 + props.release + 0.5,
        ];
        const names = ["upcoming", "reveal", "active", "release", "completed"];
        names.forEach((name, i) => {
          const node = buildChord(
            {
              ...studies.phaseEvent,
              id: `phase:${name}`,
              notes: studies.phaseEvent.notes.map((n) => ({
                ...n,
                id: `phase:${name}:note`,
              })),
            },
            "treble",
          );
          const object = resources.renderer.renderNode(node, {
            ...options,
            time: times[i],
            reveal: props.reveal,
            release: props.release,
            ...effects(props),
          });
          objects.push(
            new EmptyRenderObject()
              .setScale(24)
              .setPosition(x + 48 + i * 112, y + 120)
              .addChild(object)
              .setLayoutParticipation("exclude"),
          );
          const actual = evaluateNotePhase(times[i], 1, 2, props).phase;
          objects.push(label(x + 24 + i * 112, y + 275, name, props.color, 12));
          if (props.showExplanations)
            objects.push(
              label(
                x + 24 + i * 112,
                y + 295,
                actual === name
                  ? `${times[i].toFixed(2)}s`
                  : `${actual} · ${times[i].toFixed(2)}s`,
                props.color,
                10,
              ),
            );
        });
      }
    });
    return objects;
  },
});
