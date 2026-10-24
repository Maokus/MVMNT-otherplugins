import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Arc, Line, EmptyRenderObject } from "@mvmnt-app/plugin-sdk/render";
import type { MidiNoteEvent } from "@mvmnt-app/plugin-sdk/timeline";
import {
  buildChord,
  normalizeMidiNotes,
  spellPitch,
  durations,
  evaluateNotePhase,
  NotationRenderer,
  type ScoreEvent,
  type Clef,
  type Spelling,
} from "./notation";
import { exampleNotes } from "./example";
import {
  select,
  when,
  effectProperties,
  effects,
  inspectionProperties,
  frame,
  label,
} from "./controls";
export default definePluginElement({
  type: "commonnotation-orbit",
  metadata: {
    name: "Notation · MIDI Orbit",
    description:
      "Layer 4: timed note phases drive a circular musical visualisation.",
    category: "us.maok.commonnotation",
  },
  schema: {
    presets: [
      {
        id: "phases",
        label: "Reveal, highlight and release",
        values: {
          midiTrackId: null,
          loopExample: true,
          animate: true,
          revealStyle: "spin",
          releaseStyle: "float",
          reveal: 1,
          release: 1.5,
          releaseDistance: 3,
          upcomingOpacity: 0.1,
          completedOpacity: 0.25,
          showLabels: true,
        },
      },
      {
        id: "inspection",
        label: "Tangent notation and anchors",
        values: {
          midiTrackId: null,
          orientation: "tangent",
          showAnchors: true,
          showBounds: true,
          showLabels: true,
        },
      },
    ],
    tabs: [
      tab.content([
        group("source", "MIDI and window", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.boolean("loopExample", "Loop built-in example", true, {
            visibleWhen: [{ key: "midiTrackId", falsy: true }],
          }),
          prop.number("lookAhead", "Upcoming window (s)", 4, {
            min: 0.1,
            max: 12,
            step: 0.1,
          }),
          prop.number("history", "Past window (s)", 3, {
            min: 0.1,
            max: 12,
            step: 0.1,
          }),
          prop.number("maxNotes", "Maximum visible notes", 48, {
            min: 1,
            max: 128,
            step: 1,
          }),
          prop.number("tempo", "Notation tempo (BPM)", 120, {
            min: 20,
            max: 400,
          }),
          select("clef", "Clef", "treble", ["treble", "bass"]),
          select("spelling", "Spelling", "sharps", ["sharps", "flats"]),
        ]),
      ]),
      tab.appearance([
        group("orbit", "Orbit placement", [
          prop.number("radius", "Orbit radius (px)", 220, {
            min: 80,
            max: 600,
          }),
          prop.number("pitchSpread", "Radius per octave (px)", 24, {
            min: 0,
            max: 80,
          }),
          prop.number("travel", "Angular travel (degrees/s)", 30, {
            min: -180,
            max: 180,
          }),
          prop.number("rotation", "Orbit rotation (degrees)", -90, {
            min: -180,
            max: 180,
          }),
          select("orientation", "Note orientation", "upright", [
            "upright",
            "tangent",
          ]),
          prop.number("staffSize", "Staff-space size (px)", 16, {
            min: 4,
            max: 36,
          }),
          prop.boolean("showRing", "Show orbit guide", true),
          prop.boolean("showSpokes", "Connect active notes to centre", true),
          prop.boolean("showLabels", "Show pitch and phase labels", false),
          prop.boolean("showCaption", "Show source caption", true),
          prop.colorAlpha("color", "Note color", "#CBD5E1FF"),
          prop.colorAlpha("activeColor", "Active color", "#34D399FF"),
          prop.colorAlpha("background", "Background", "#111827FF"),
        ]),
        group("effects", "Note phases", effectProperties()),
        group("inspect", "Inspection", inspectionProperties()),
      ]),
    ],
  },
  render({ props, time, context }) {
    const demo = !props.midiTrackId,
      t = time.seconds;
    let notes: readonly MidiNoteEvent[];
    if (demo) {
      if (props.loopExample) {
        const period = 16,
          cycle = Math.floor(t / period);
        notes = [cycle - 1, cycle, cycle + 1].flatMap((c) =>
          exampleNotes.map((n) => ({
            ...n,
            startSeconds: n.startSeconds + c * period,
            endSeconds: n.endSeconds + c * period,
          })),
        );
      } else notes = exampleNotes;
    } else {
      const result = context.timeline?.selectNotes({
        trackIds: [props.midiTrackId!],
        startSeconds: t - props.history,
        endSeconds: t + props.lookAhead,
      });
      if (!result?.ok)
        return [
          label(0, 20, "Unable to read selected MIDI track", props.color),
        ];
      notes = result.value;
    }
    const selected = normalizeMidiNotes(notes)
      .notes.filter(
        (n) =>
          n.endSeconds > t - props.history &&
          n.startSeconds < t + props.lookAhead &&
          Number.isFinite(n.startSeconds) &&
          Number.isFinite(n.endSeconds) &&
          n.endSeconds > n.startSeconds,
      )
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.startSeconds - t) - Math.abs(b.startSeconds - t) ||
          a.note - b.note ||
          a.startSeconds - b.startSeconds ||
          a.endSeconds - b.endSeconds ||
          a.channel - b.channel ||
          (a.clipId ?? "").localeCompare(b.clipId ?? ""),
      )
      .slice(0, Math.max(1, Math.round(props.maxNotes)));
    const extent = props.radius + 6 * props.pitchSpread + 14 * props.staffSize;
    const size = extent * 2 + 40,
      c = size / 2,
      objects = [frame(size, size, props.background)],
      renderer = new NotationRenderer();
    if (props.showRing)
      objects.push(
        new Arc(c, c, props.radius, {
          strokeColor: props.color,
          strokeWidth: 1,
          fillColor: null,
        })
          .setOpacity(0.25)
          .setLayoutParticipation("exclude"),
      );
    selected.forEach((note, index) => {
      const pitch = spellPitch(note.note, props.spelling as Spelling),
        beats = ((note.endSeconds - note.startSeconds) * props.tempo) / 60;
      const duration = durations.reduce(
        (best, d) =>
          Math.abs(d.beats - beats) < Math.abs(best.beats - beats) ? d : best,
        durations[0],
      );
      const event: ScoreEvent = {
        id: `event:${note.id}`,
        beat: 0,
        duration,
        notes: [
          {
            id: `note:${note.id}`,
            sourceId: note.id,
            pitch,
            startSeconds: note.startSeconds,
            endSeconds: note.endSeconds,
            tieIn: false,
            tieOut: false,
            accidental: pitch.accidental || undefined,
          },
        ],
      };
      const node = buildChord(event, props.clef as Clef);
      const angle =
        ((props.rotation +
          (note.startSeconds - t) * props.travel +
          (note.note % 12) * 3) *
          Math.PI) /
        180;
      const radius = Math.max(
        30,
        props.radius + ((note.note - 60) / 12) * props.pitchSpread,
      );
      const x = c + Math.cos(angle) * radius,
        y = c + Math.sin(angle) * radius;
      if (props.showSpokes && note.startSeconds <= t && t < note.endSeconds)
        objects.push(
          new Line(c, c, x, y, { color: props.activeColor, lineWidth: 1.5 })
            .setOpacity(0.5)
            .setLayoutParticipation("exclude"),
        );
      const object = renderer.renderNode(node, {
        time: t,
        color: props.color,
        activeColor: props.activeColor,
        reveal: props.reveal,
        release: props.release,
        ...effects(props),
        showBounds: props.showBounds,
        showAnchors: props.showAnchors,
      });
      // Centre each assembled note at its orbital anchor; pitch still determines ledger lines.
      const wrapper = new EmptyRenderObject().addChild(object);
      wrapper
        .setOrigin(
          node.bounds.x + node.bounds.width / 2,
          node.bounds.y + node.bounds.height / 2,
        )
        .setScale(props.staffSize)
        .setPosition(x, y)
        .setRotation(props.orientation === "tangent" ? angle + Math.PI / 2 : 0);
      objects.push(wrapper);
      if (props.showLabels)
        objects.push(
          label(
            x + props.staffSize,
            y + props.staffSize * 3,
            `${"CDEFGAB"[pitch.step]}${pitch.accidental === 1 ? "♯" : pitch.accidental === -1 ? "♭" : ""}${pitch.octave} · ${evaluateNotePhase(t, note.startSeconds, note.endSeconds, props).phase}`,
            props.color,
            12,
          ),
        );
    });
    if (props.showCaption)
      objects.push(
        label(
          20,
          28,
          `NOTE PHASES  /  ${demo ? "Built-in example" : "MIDI track"} · ${selected.length} notes`,
          props.color,
        ),
      );
    return objects;
  },
});
