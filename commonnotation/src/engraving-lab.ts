import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Rectangle, type RenderObject } from "@mvmnt-app/plugin-sdk/render";
import {
  adaptMidiNotes,
  layoutScore,
  NotationRenderer,
  keyName,
  constantTimeMap,
  type Score,
  type ScoreLayout,
  type Clef,
  type MidiOptions,
} from "./notation";
import {
  jitteredBeamFixture,
  compoundFixture,
  keyFixture,
  voiceFixture,
  explicitLabVoices,
  rhythmFixture,
  timingFixture,
  labTimeMap,
} from "./example-fixtures";
import { frame, label, select, when, inspectionProperties } from "./controls";
const kinds = [
  "all",
  "beams",
  "compound",
  "keys",
  "voices",
  "rhythm",
  "timing",
] as const;
const visibleFor = (kind: string) =>
  kinds
    .filter((k) => k !== "all" && k !== kind)
    .map((k) => ({ key: "fixture", notEquals: k }));
export interface LabScore {
  label: string;
  score: Score;
  layout: ScoreLayout;
}
export interface EngravingPanel {
  id: string;
  title: string;
  description: string;
  scores: LabScore[];
}
interface Resources {
  key: string;
  panels: EngravingPanel[];
  renderer: NotationRenderer;
}
export default definePluginElement({
  type: "commonnotation-engraving-lab",
  metadata: {
    name: "Notation · Engraving Lab",
    description:
      "Self-contained studies of beams, beat groups, keys, voices, ties and tempo-map conversion.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      { id: "all", label: "All engraving studies", values: { fixture: "all" } },
      {
        id: "compound",
        label: "Compare 7/8 beat groups",
        values: { fixture: "compound", beatGrouping: "2+2+3" },
      },
      {
        id: "voices",
        label: "Explicit voice overrides",
        values: { fixture: "voices", voiceMode: "explicit" },
      },
      {
        id: "timing",
        label: "Tempo-map comparison",
        values: { fixture: "timing", clock: "manual", previewTime: 3.1 },
      },
    ],
    tabs: [
      tab.content([
        group("fixtures", "Study", [
          select("fixture", "Study", "all", kinds),
          prop.select(
            "keySignature",
            "Key study signature",
            "1",
            Array.from({ length: 15 }, (_, i) => ({
              value: String(i - 7),
              label: keyName({ fifths: i - 7 }),
            })),
            { visibleWhen: visibleFor("keys") },
          ),
          select(
            "beatGrouping",
            "First 7/8 grouping",
            "2+2+3",
            ["2+2+3", "3+2+2"],
            visibleFor("compound"),
          ),
          select(
            "voiceMode",
            "Voice assignment",
            "automatic",
            ["automatic", "explicit"],
            visibleFor("voices"),
          ),
          select(
            "clock",
            "Timing study clock",
            "manual",
            ["manual", "playback"],
            visibleFor("timing"),
          ),
          prop.number("previewTime", "Timing study time (s)", 3.1, {
            min: 0,
            max: 4,
            step: 0.01,
            visibleWhen: [...visibleFor("timing"), ...when("clock", "manual")],
          }),
        ]),
      ]),
      tab.appearance([
        group("style", "Appearance", [
          select("clef", "Clef", "treble", ["treble", "bass"]),
          prop.color("color", "Notation and labels", "#E2E8F0"),
          prop.color("accent", "Active notes and upper voice", "#34D399"),
          prop.color("background", "Background", "#111827"),
          prop.boolean("showExplanations", "Show study explanations", true),
          ...inspectionProperties(),
        ]),
      ]),
    ],
  },
  createResources(): Resources {
    return { key: "", panels: [], renderer: new NotationRenderer() };
  },
  disposeResources(resources) {
    resources.panels = [];
    resources.key = "";
  },
  render({ props, time, resources }) {
    const key = JSON.stringify([
      props.clef,
      props.keySignature,
      props.beatGrouping,
      props.voiceMode,
    ]);
    if (resources.key !== key || !resources.panels.length) {
      const base: MidiOptions = {
        tempo: 120,
        numerator: 4,
        denominator: 4,
        measureCount: 1,
        voices: true,
      };
      const study = (
        name: string,
        notes: Parameters<typeof adaptMidiNotes>[0],
        options: Partial<MidiOptions> = {},
        beaming = true,
        height = 105,
      ): LabScore => {
        const score = adaptMidiNotes(notes, { ...base, ...options });
        return {
          label: name,
          score,
          layout: layoutScore(score, {
            clef: props.clef as Clef,
            width: 620,
            height,
            staffSize: 20,
            measuresPerSystem: 2,
            beaming,
            beatSpacing: 3,
          }),
        };
      };
      const grouping = props.beatGrouping === "2+2+3" ? [2, 2, 3] : [3, 2, 2];
      resources.panels = [
        {
          id: "beams",
          title: "01  BEAMS AND FLAGS",
          description:
            "Jittered MIDI snaps to sixteenths; compare shared/partial beams with flags.",
          scores: [
            study(
              "Beamed · 0.015 s input → beat 0",
              jitteredBeamFixture,
              {},
              true,
            ),
            study(
              "Flagged · original performance seconds retained",
              jitteredBeamFixture,
              {},
              false,
            ),
          ],
        },
        {
          id: "compound",
          title: "02  EXPLICIT BEAT GROUPS",
          description:
            "Fourteen sixteenths in 7/8; grouping changes the beams, not the performance.",
          scores: [
            study(props.beatGrouping, compoundFixture, {
              numerator: 7,
              denominator: 8,
              beatGroups: grouping,
            }),
            study(
              props.beatGrouping === "2+2+3" ? "3+2+2" : "2+2+3",
              compoundFixture,
              {
                numerator: 7,
                denominator: 8,
                beatGroups: grouping.slice().reverse(),
              },
            ),
          ],
        },
        {
          id: "keys",
          title: "03  KEY SIGNATURE AND CANCELLATION",
          description:
            "MIDI 66 → 65 → 66 → 67: signature-aware spelling and measure accidentals.",
          scores: [
            study(
              keyName({ fifths: Number(props.keySignature) }),
              keyFixture,
              { keySignature: { fifths: Number(props.keySignature) } },
              true,
              225,
            ),
          ],
        },
        {
          id: "voices",
          title: "04  OVERLAPPING VOICES",
          description:
            "Sustained lower chord + moving upper line; lane identity controls grouping and color.",
          scores: [
            study(
              props.voiceMode === "explicit"
                ? "Explicit: lower / upper"
                : "Automatic: two interval lanes",
              voiceFixture,
              {
                voiceIds:
                  props.voiceMode === "explicit"
                    ? explicitLabVoices()
                    : undefined,
              },
              true,
              225,
            ),
          ],
        },
        {
          id: "rhythm",
          title: "05  METRICAL SPLITTING AND TIES",
          description:
            "A half-note duration starting on beat 2 is written across the stronger division.",
          scores: [
            study("Legacy duration", rhythmFixture, { rhythm: "legacy" }),
            study("Metrical grouping", rhythmFixture, { rhythm: "metrical" }),
          ],
        },
        {
          id: "timing",
          title: "06  TEMPO MAP, SAME PERFORMANCE",
          description:
            "Identical onset seconds become different beat positions after a tempo change.",
          scores: [
            study("Constant 120 BPM", timingFixture, {
              measureCount: 2,
              timeMap: constantTimeMap(120),
            }),
            study("120 → 60 BPM at 2 s", timingFixture, {
              measureCount: 2,
              timeMap: labTimeMap,
            }),
          ],
        },
      ];
      resources.key = key;
    }
    const panels = resources.panels.filter(
        (p) => props.fixture === "all" || props.fixture === p.id,
      ),
      columns = props.fixture === "all" ? 2 : 1,
      cardW = 660,
      cardH = 360;
    const objects: RenderObject[] = [
      frame(
        columns * cardW,
        Math.ceil(panels.length / columns) * cardH,
        props.background,
      ),
    ];
    const preview = props.clock === "manual" ? props.previewTime : time.seconds;
    panels.forEach((panel, index) => {
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
      objects.push(label(x + 20, y + 33, panel.title, props.color, 14));
      if (props.showExplanations)
        objects.push(label(x + 20, y + 56, panel.description, props.color, 11));
      panel.scores.forEach((example, row) => {
        const offset = y + 90 + row * 125;
        let caption = example.label;
        if (panel.id === "timing") {
          const map = row === 0 ? constantTimeMap(120) : labTimeMap;
          caption += `  ·  ${preview.toFixed(2)}s → ${map.secondsToBeats(preview).toFixed(2)} beats`;
        }
        if (panel.id === "voices")
          caption += `  ·  ${[...new Set(example.score.measures.flatMap((m) => m.events.filter((e) => e.notes.length).map((e) => e.voiceId)))].join(" / ")}`;
        objects.push(label(x + 20, offset, caption, props.color, 12));
        const options = {
          time: preview,
          color: props.color,
          activeColor: props.accent,
          reveal: 0,
          release: 0,
          animate: panel.id === "timing",
          upcomingOpacity: 0.5,
          completedOpacity: 1,
          activeScale: 1,
          showBounds: props.showBounds,
          showAnchors: props.showAnchors,
          componentStyle: (node: import("./notation").LayoutNode) =>
            panel.id === "voices" &&
            node.role === "chord" &&
            (String(node.metadata?.voiceId).endsWith(":1") ||
              node.metadata?.voiceId === "upper")
              ? { color: props.accent }
              : {},
        };
        objects.push(
          ...resources.renderer.render(example.layout, options).map((o) => {
            o.x += x + 20;
            o.y += offset + 8;
            o.setLayoutParticipation("exclude");
            return o;
          }),
        );
      });
    });
    return objects;
  },
});
