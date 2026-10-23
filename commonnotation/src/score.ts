import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Text } from "@mvmnt-app/plugin-sdk/render";
import {
  adaptMidiNotes,
  layoutScore,
  NotationRenderer,
  type ScoreLayout,
  type Clef,
  type Spelling,
} from "./notation";
import { exampleNotes } from "./example";
interface Resources {
  key: string;
  layout?: ScoreLayout;
  renderer: NotationRenderer;
}
import { select, when, effectProperties, effects, inspectionProperties, frame } from './controls';
export default definePluginElement({
  type: "commonnotation-score",
  metadata: {
    name: "Common Notation Score",
    description: "Paged musical notation with independently animated notes.",
    category: "us.maok.commonnotation",
  },
  schema: {
    tabs: [
      tab.content([
        group("source", "Score source", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number('transpose','Transpose (semitones)',0,{min:-48,max:48,step:1}),
          select("clef", "Clef", "treble", ["treble", "bass"]),
          select("spelling", "Accidental preference", "sharps", [
            "sharps",
            "flats",
          ]),
          prop.number("tempoOverride", "Tempo override (0 = timeline)", 0, {
            min: 0,
            max: 400,
          }),
          prop.boolean("overrideMeter", "Override time signature", false),
          prop.number("numerator", "Beats per bar", 4, {
            min: 1,
            max: 16,
            step: 1,
            visibleWhen:when("overrideMeter"),
          }),
          select("denominator", "Beat unit", "4", ["1", "2", "4", "8", "16"],when("overrideMeter")),
          prop.number("scoreStart", "Score start (seconds)", 0, {
            min: 0,
            max: 36000,
            step: 0.01,
          }),
          select("pageMode", "Page mode", "follow", ["follow", "fixed"]),
          prop.number("fixedPage", "Preview page", 1, {
            min: 1,
            max: 10000,
            step: 1,
            visibleWhen:when("pageMode","fixed"),
          }),
        ]),
      ]),
      tab.appearance([
        group("layout", "Page layout", [
          prop.number("pageWidth", "Page width", 1000, { min: 200, max: 4000 }),
          prop.number("pageHeight", "Page height", 500, {
            min: 100,
            max: 4000,
          }),
          prop.number('beatSpacing','Beat spacing (staff spaces)',3,{min:1,max:12,step:.1}),
          prop.number('systemGap','System gap (staff spaces)',4,{min:0,max:16,step:.1}),
          prop.number("staffSize", "Staff space (px)", 16, { min: 4, max: 80 }),
          prop.number("measuresPerSystem", "Measures per system", 2, {
            min: 1,
            max: 8,
            step: 1,
          }),
          prop.number("systemsPerPage", "Systems per page", 2, {
            min: 1,
            max: 8,
            step: 1,
          }),
        ]),
        group('components','Notation components',[
          prop.boolean('showStaff','Show staff and barlines',true),
          prop.boolean('showClef','Show clefs and meters',true),
          prop.boolean('showRests','Show rests',true),
          prop.boolean('showAccidentals','Show accidentals',true),
          prop.boolean('showStems','Show stems and flags',true),
          prop.boolean('showTies','Show ties',true),
          prop.colorAlpha('staffColor','Staff color','#94A3B8FF',{visibleWhen:when('showStaff')}),
          prop.colorAlpha('restColor','Rest color','#D1D5DBFF',{visibleWhen:when('showRests')}),
          prop.colorAlpha('accidentalColor','Accidental color','#FBBF24FF',{visibleWhen:when('showAccidentals')}),
          prop.boolean('showPageLabel','Show page label',true),
          ...inspectionProperties(),
        ]),
        group("style", "Style and animation", [
          prop.colorAlpha("color", "Score color", "#D1D5DBFF"),
          prop.colorAlpha("activeColor", "Active note color", "#34D399FF"),
          prop.colorAlpha('background','Page background','#00000000'),
          ...effectProperties(),
        ]),
      ]),
    ],
  },
  createResources(): Resources {
    return { key: "", renderer: new NotationRenderer() };
  },
  disposeResources(resources) {
    resources.key = "";
    resources.layout = undefined;
  },
  render({ props, time, context, resources }) {
    const demo = !props.midiTrackId;
    const metadata = context.timeline?.getMetadata();
    if (!demo && !metadata?.ok)
      return [
        new Text(0, 0, "MIDI timeline unavailable", "16px sans-serif", {
          color: props.color,
        }),
      ];
    const tempo =
      props.tempoOverride > 0
        ? props.tempoOverride
        : demo
          ? 120
          : metadata!.ok
            ? metadata!.value.tempoBpm
            : 120;
    const meter = props.overrideMeter
      ? {
          numerator: Math.round(props.numerator),
          denominator: Number(props.denominator),
        }
      : demo
        ? { numerator: 4, denominator: 4 }
        : metadata!.ok
          ? metadata!.value.timeSignature
          : { numerator: 4, denominator: 4 };
    if (
      !(tempo > 0) ||
      !Number.isFinite(tempo) ||
      !Number.isInteger(meter.numerator) ||
      meter.numerator < 1 ||
      ![1, 2, 4, 8, 16].includes(meter.denominator)
    )
      return [
        new Text(
          0,
          0,
          "Set a supported tempo and time signature override",
          "16px sans-serif",
          { color: props.color },
        ),
      ];
    const per = Math.max(1, Math.round(props.measuresPerSystem)),
      count = per * Math.max(1, Math.round(props.systemsPerPage));
    const bar = (meter.numerator * 4) / meter.denominator,
      pageSeconds = (count * bar * 60) / tempo;
    const page =
      props.pageMode === "fixed"
        ? Math.max(0, Math.round(props.fixedPage) - 1)
        : Math.max(
            0,
            Math.floor((time.seconds - props.scoreStart) / pageSeconds),
          );
    const start = props.scoreStart + page * pageSeconds,
      end = start + pageSeconds;
    // Half a quantization cell of padding includes onsets rounded onto the page.
    const padding = 60 / tempo / 8;
    const selected = demo
      ? { ok: true as const, value: exampleNotes }
      : context.timeline?.selectNotes({
          trackIds: [props.midiTrackId!],
          startSeconds: start - padding,
          endSeconds: end + padding,
        });
    if (!selected?.ok)
      return [
        new Text(
          0,
          0,
          "Unable to read selected MIDI track",
          "16px sans-serif",
          { color: props.color },
        ),
      ];
    const notes = selected.value
      .map(n=>({...n,note:Math.max(0,Math.min(127,n.note+Math.round(props.transpose)))}))
      .sort(
        (a, b) =>
          a.startSeconds - b.startSeconds ||
          a.note - b.note ||
          a.endSeconds - b.endSeconds ||
          a.channel - b.channel ||
          (a.clipId ?? "").localeCompare(b.clipId ?? ""),
      );
    const options = {
      tempo,
      ...meter,
      startSeconds: props.scoreStart,
      firstMeasure: page * count,
      measureCount: count,
      spelling: props.spelling as Spelling,
    };
    const layoutOptions = {
      clef: props.clef as Clef,
      width: props.pageWidth,
      height: Math.max(1, props.pageHeight - 30),
      staffSize: props.staffSize,
      measuresPerSystem: per,
      beatSpacing:props.beatSpacing,
      systemGap:props.systemGap,
    };
    const key = JSON.stringify([notes, options, layoutOptions]);
    if (resources.key !== key || !resources.layout) {
      resources.layout = layoutScore(
        adaptMidiNotes(notes, options),
        layoutOptions,
      );
      resources.key = key;
    }
    const objects = resources.renderer.render(resources.layout, {
      time: time.seconds,
      color: props.color,
      activeColor: props.activeColor,
      reveal: props.reveal,
      release: props.release,
      ...effects(props),
      showBounds:props.showBounds,
      showAnchors:props.showAnchors,
      componentStyle:node=>{
        const role=node.role;
        if((!props.showStaff && ['staff','barline','ledger'].includes(role)) ||
          (!props.showClef && ['clef','meter'].includes(role)) ||
          (!props.showRests && role==='rest-group') ||
          (!props.showAccidentals && role==='accidental') ||
          (!props.showStems && ['stem','flag'].includes(role)) ||
          (!props.showTies && role==='tie'))return {opacity:0};
        if(['staff-line','barline','ledger'].includes(role))return {color:props.staffColor};
        if(role==='rest-group')return {color:props.restColor};
        if(role==='accidental')return {color:props.accidentalColor};
        return {};
      },
    });
    objects[0]=frame(props.pageWidth,props.pageHeight,props.background);
    const hasNotes = notes.some(
      (n) => n.endSeconds > start && n.startSeconds < end,
    );
    if(props.showPageLabel) objects.push(
      new Text(
        0,
        props.pageHeight - 12,
        `${demo ? "Built-in example · " : ""}Page ${page + 1}${hasNotes ? "" : " · No notes on this page"}`,
        "12px sans-serif",
        { color: props.color },
      ).setLayoutParticipation("exclude"),
    );
    return objects;
  },
});
