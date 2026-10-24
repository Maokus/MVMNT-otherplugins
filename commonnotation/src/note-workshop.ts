import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  buildChord,
  buildStaff,
  groupNode,
  spellPitch,
  NotationRenderer,
  type ScoreEvent,
  type Clef,
  type Spelling,
  type LayoutNode,
} from "./notation";
import { select, when, inspectionProperties, frame, label } from "./controls";
export const componentColors: Record<string, string> = {
  notehead: "#F8FAFC",
  stem: "#38BDF8",
  flag: "#A78BFA",
  dot: "#FB7185",
  accidental: "#FBBF24",
  ledger: "#4ADE80",
  rest: "#F8FAFC",
};
export function flattenNodes(nodes: readonly LayoutNode[]): LayoutNode[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children ?? [])]);
}
export default definePluginElement({
  type: "commonnotation-note-workshop",
  metadata: {
    name: "Notation · Note Workshop",
    description:
      "Layer 2: pitch and duration become assembled notes, chords and rests.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      {
        id: "parts",
        label: "Separated chord components",
        values: {
          kind: "chord",
          chord: "cluster",
          pitch: 61,
          duration: "16",
          dotted: true,
          separation: 1,
          colorParts: true,
          showExplanation: true,
        },
      },
      {
        id: "rest",
        label: "Dotted rest",
        values: { kind: "rest", duration: "8", dotted: true },
      },
      {
        id: "ledger",
        label: "Ledger lines and stem anchors",
        values: {
          kind: "note",
          pitch: 84,
          duration: "2",
          showBounds: true,
          showAnchors: true,
        },
      },
    ],
    tabs: [
      tab.content([
        group("model", "Musical model", [
          select("kind", "Build", "chord", ["note", "chord", "rest"]),
          prop.number("pitch", "Root MIDI pitch", 60, {
            min: 0,
            max: 103,
            step: 1,
            visibleWhen: [{ key: "kind", notEquals: "rest" }],
          }),
          select(
            "chord",
            "Chord",
            "major",
            ["major", "minor", "cluster", "octave"],
            when("kind", "chord"),
          ),
          select("duration", "Written duration", "4", [
            "1",
            "2",
            "4",
            "8",
            "16",
          ]),
          prop.boolean("dotted", "Dotted", false),
          select(
            "clef",
            "Clef",
            "treble",
            ["treble", "bass"],
            [{ key: "kind", notEquals: "rest" }],
          ),
          select(
            "spelling",
            "Spelling",
            "sharps",
            ["sharps", "flats"],
            [{ key: "kind", notEquals: "rest" }],
          ),
          prop.boolean("forceAccidentals", "Show explicit accidentals", true, {
            visibleWhen: [{ key: "kind", notEquals: "rest" }],
          }),
        ]),
      ]),
      tab.appearance([
        group("assembly", "Assembly", [
          prop.number("staffSize", "Staff-space size (px)", 30, {
            min: 8,
            max: 48,
          }),
          prop.number("separation", "Separate components (staff spaces)", 0, {
            min: 0,
            max: 4,
            step: 0.1,
            visibleWhen: [{ key: "kind", notEquals: "rest" }],
          }),
          prop.boolean("showStaff", "Show reference staff", true),
          prop.boolean("colorParts", "Color by component", true),
          prop.colorAlpha("color", "Notation color", "#E2E8F0FF"),
          prop.colorAlpha("background", "Background", "#111827FF"),
          prop.boolean(
            "showExplanation",
            "Show model and component labels",
            true,
          ),
          ...inspectionProperties(),
        ]),
      ]),
    ],
  },
  render({ props }) {
    const denominator = Number(props.duration) as 1 | 2 | 4 | 8 | 16;
    const intervals =
      props.kind === "rest"
        ? []
        : props.kind === "note"
          ? [0]
          : ({
              major: [0, 4, 7],
              minor: [0, 3, 7],
              cluster: [0, 1, 2],
              octave: [0, 12],
            }[props.chord] ?? [0]);
    const event: ScoreEvent = {
      id: "workshop",
      beat: 0,
      duration: {
        denominator,
        dotted: props.dotted,
        beats: (4 / denominator) * (props.dotted ? 1.5 : 1),
      },
      notes: intervals.map((interval, i) => {
        const pitch = spellPitch(
          Math.round(props.pitch) + interval,
          props.spelling as Spelling,
        );
        return {
          id: `note:${i}`,
          sourceId: `note:${i}`,
          pitch,
          startSeconds: 0,
          endSeconds: 1,
          tieIn: false,
          tieOut: false,
          accidental: props.forceAccidentals ? pitch.accidental : undefined,
        };
      }),
    };
    const chord = buildChord(event, props.clef as Clef);
    chord.x = 8;
    const nodes = [
      ...(props.showStaff ? [buildStaff("reference", 18)] : []),
      chord,
    ];
    const model = groupNode("assembly", "assembly", nodes);
    const pad = props.separation * 3,
      s = props.staffSize;
    const diagramWidth = (model.bounds.width + pad * 2) * s,
      diagramHeight = (model.bounds.height + pad * 2) * s;
    const width = Math.max(700, diagramWidth + 260),
      height = Math.max(340, diagramHeight + 150);
    const renderer = new NotationRenderer(),
      objects = [frame(width, height, props.background)];
    objects.push(
      renderer
        .renderNode(model, {
          time: 0,
          color: props.color,
          activeColor: props.color,
          reveal: 0,
          release: 0,
          animate: false,
          showBounds: props.showBounds,
          showAnchors: props.showAnchors,
          componentStyle: (n) => {
            const offsets: Record<string, [number, number]> = {
              notehead: [0, 0],
              stem: [1, 0],
              flag: [2, -1],
              dot: [3, 0],
              accidental: [-2, 0],
              ledger: [0, 1],
            };
            const offset = offsets[n.role] ?? [0, 0];
            return {
              x: offset[0] * props.separation,
              y: offset[1] * props.separation,
              ...(props.colorParts && componentColors[n.role]
                ? { color: componentColors[n.role] }
                : {}),
            };
          },
        })
        .setScale(props.staffSize)
        .setPosition(
          40 + (pad - model.bounds.x) * s,
          110 + (pad - model.bounds.y) * s,
        ),
    );
    if (props.showExplanation) {
      objects.push(
        label(
          24,
          30,
          "MUSICAL MODEL  /  pitches + duration → assembled notation",
          props.color,
        ),
      );
      const pitches =
        event.notes
          .map(
            (n) =>
              `${"CDEFGAB"[n.pitch.step]}${n.pitch.accidental === 1 ? "♯" : n.pitch.accidental === -1 ? "♭" : ""}${n.pitch.octave}`,
          )
          .join(" · ") || "Silence";
      objects.push(
        label(
          24,
          62,
          `${pitches}   |   ${event.duration.beats} quarter-note beats`,
          props.color,
          18,
        ),
      );
      const roles = [
        ...new Set(
          flattenNodes([chord])
            .map((n) => n.role)
            .filter((r) => componentColors[r]),
        ),
      ];
      roles.forEach((role, i) =>
        objects.push(
          label(
            width - 175,
            160 + i * 30,
            role,
            props.colorParts ? componentColors[role] : props.color,
            16,
          ),
        ),
      );
    }
    return objects;
  },
});
