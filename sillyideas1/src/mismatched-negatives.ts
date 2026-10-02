import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Rectangle, type RenderObject } from "@mvmnt-app/plugin-sdk/render";
import {
  animationProgress,
  applyEasing,
  buildMusicalSlots,
  fitExitTiming,
  hasMidiOnsetInRange,
  parseTimeUnitBars,
  resolveSlotSettlement,
  staggerDelay,
  subdivisionBeats,
  type MusicalSlot,
} from "./mismatched-negatives-logic";

const EASING_OPTIONS = [
  { label: "Linear", value: "linear" },
  { label: "Ease In Cubic", value: "easeInCubic" },
  { label: "Ease Out Cubic", value: "easeOutCubic" },
  { label: "Ease In/Out Cubic", value: "easeInOutCubic" },
  { label: "Ease Out Quint", value: "easeOutQuint" },
  { label: "Ease Out Back", value: "easeOutBack" },
] as const;

const SUBDIVISION_OPTIONS = [
  { label: "1/4 note", value: "1/4" },
  { label: "Dotted 1/4", value: "1/4-dotted" },
  { label: "1/4 triplet", value: "1/4-triplet" },
  { label: "1/8 note", value: "1/8" },
  { label: "Dotted 1/8", value: "1/8-dotted" },
  { label: "1/8 triplet", value: "1/8-triplet" },
  { label: "1/16 note", value: "1/16" },
  { label: "Dotted 1/16", value: "1/16-dotted" },
  { label: "1/16 triplet", value: "1/16-triplet" },
  { label: "1/32 note", value: "1/32" },
  { label: "Dotted 1/32", value: "1/32-dotted" },
  { label: "1/32 triplet", value: "1/32-triplet" },
  { label: "1/64 note", value: "1/64" },
  { label: "Dotted 1/64", value: "1/64-dotted" },
  { label: "1/64 triplet", value: "1/64-triplet" },
] as const;

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

function addPair(
  objects: RenderObject[],
  args: {
    x: number;
    width: number;
    rowHeight: number;
    rowGap: number;
    displacement: number;
    slotIndex: number;
    color: string;
  },
): void {
  const topOffset =
    args.slotIndex % 2 === 0 ? -args.displacement : args.displacement;
  const bottomOffset =
    args.slotIndex % 2 === 0 ? args.displacement : -args.displacement;
  objects.push(
    new Rectangle(args.x, topOffset, args.width, args.rowHeight, {
      fillColor: args.color,
      layoutParticipation: "exclude",
    }),
    new Rectangle(
      args.x,
      args.rowHeight + args.rowGap + bottomOffset,
      args.width,
      args.rowHeight,
      {
        fillColor: args.color,
        layoutParticipation: "exclude",
      },
    ),
  );
}

export const mismatchedNegatives = definePluginElement({
  type: "mismatched-negatives",
  metadata: {
    name: "Mismatched Negatives",
    description:
      "Interlocking rows that reveal missing MIDI onsets in a repeating musical window.",
    category: "us.maok.sillyideas1",
  },
  schema: {
    tabs: [
      tab.content([
        group("source", "MIDI Source", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
        ]),
        group("timing", "Musical Timing", [
          prop.select(
            "subdivision",
            "Slide Every",
            "1/16",
            SUBDIVISION_OPTIONS,
          ),
          prop.select("timeUnitBars", "Time Unit", "1", [
            { label: "1/2 bar", value: "0.5" },
            { label: "1 bar", value: "1" },
            { label: "2 bars", value: "2" },
            { label: "4 bars", value: "4" },
          ]),
        ]),
        group("animation", "Animation", [
          prop.number("slideInDuration", "Slide In Duration (s)", 0.12, {
            min: 0,
            max: 10,
            step: 0.01,
          }),
          prop.select(
            "slideInEasing",
            "Slide In Interpolation",
            "easeOutCubic",
            EASING_OPTIONS,
          ),
          prop.number("slideOutDuration", "Slide Out Duration (s)", 0.2, {
            min: 0,
            max: 10,
            step: 0.01,
          }),
          prop.number("slideOutStagger", "Slide Out Stagger (s)", 0.2, {
            min: 0,
            max: 10,
            step: 0.01,
          }),
          prop.select(
            "slideOutEasing",
            "Slide Out Interpolation",
            "easeOutCubic",
            EASING_OPTIONS,
          ),
        ]),
        group("layout", "Layout", [
          prop.number("width", "Width (px)", 800, {
            min: 32,
            max: 8192,
            step: 1,
          }),
          prop.number("height", "Height (px)", 300, {
            min: 32,
            max: 8192,
            step: 1,
          }),
          prop.number("rowGap", "Row Gap (px)", 18, {
            min: 0,
            max: 512,
            step: 1,
          }),
          prop.number("cellGap", "Cell Gap (px)", 0, {
            min: 0,
            max: 64,
            step: 0.5,
          }),
          prop.number("misalignment", "Misalignment (px)", 32, {
            min: 0,
            max: 512,
            step: 1,
          }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.colorAlpha("color", "Rectangle Color", "#F8FAFCFF"),
          prop.colorAlpha("backgroundColor", "Background", "#0F172A00"),
        ]),
      ]),
    ],
  },
  render({ props, time, context }): readonly RenderObject[] {
    const width = clamp(props.width, 32, 8192, 800);
    const height = clamp(props.height, 32, 8192, 300);
    const rowGap = clamp(props.rowGap, 0, height - 2, 18);
    const cellGap = clamp(props.cellGap, 0, width, 0);
    const misalignment = clamp(props.misalignment, 0, height, 32);
    const slideInDuration = clamp(props.slideInDuration, 0, 10, 0.12);
    const slideOutDuration = clamp(props.slideOutDuration, 0, 10, 0.2);
    const slideOutStagger = clamp(props.slideOutStagger, 0, 10, 0.2);
    const color = typeof props.color === "string" ? props.color : "#F8FAFCFF";
    const backgroundColor =
      typeof props.backgroundColor === "string"
        ? props.backgroundColor
        : "#0F172A00";
    const timing = context.timing;
    const timeline = context.timeline;
    const beatPosition = timing?.secondsToBeats(time.seconds);
    const signature = timing?.getTimeSignature();
    const objects: RenderObject[] = [
      new Rectangle(0, 0, width, height, {
        fillColor: null,
        strokeColor: null,
        layoutParticipation: "include",
      }),
      new Rectangle(0, 0, width, height, {
        fillColor: backgroundColor,
        layoutParticipation: "exclude",
      }),
    ];
    if (!timing || !timeline || !beatPosition?.ok || !signature?.ok)
      return objects;

    const beatsPerBar =
      (signature.value.numerator * 4) / signature.value.denominator;
    const beatsPerTimeUnit =
      beatsPerBar * parseTimeUnitBars(props.timeUnitBars);
    const timeUnitStartBeat =
      Math.floor(beatPosition.value / beatsPerTimeUnit) * beatsPerTimeUnit;
    const previousTimeUnitStartBeat = timeUnitStartBeat - beatsPerTimeUnit;
    const slots = buildMusicalSlots(
      beatsPerTimeUnit,
      subdivisionBeats(props.subdivision),
    );
    const timeUnitStart = timing.beatsToSeconds(timeUnitStartBeat);
    const timeUnitEnd = timing.beatsToSeconds(
      timeUnitStartBeat + beatsPerTimeUnit,
    );
    const previousTimeUnitStart = timing.beatsToSeconds(
      previousTimeUnitStartBeat,
    );
    if (!timeUnitStart.ok || !timeUnitEnd.ok || !previousTimeUnitStart.ok)
      return objects;

    const notesResult = props.midiTrackId
      ? timeline.selectNotes({
          trackIds: [props.midiTrackId as string],
          startSeconds: previousTimeUnitStart.value,
          endSeconds: timeUnitEnd.value,
        })
      : { ok: true as const, value: [] as const };
    const notes = notesResult.ok ? notesResult.value : [];
    const rowHeight = Math.max(1, (height - rowGap) / 2);
    const timeUnitDuration = timeUnitEnd.value - timeUnitStart.value;
    const exitTiming = fitExitTiming(
      slideOutDuration,
      slideOutStagger,
      timeUnitDuration,
    );
    const elapsedSinceBoundary = time.seconds - timeUnitStart.value;
    const slotGeometry = (slot: MusicalSlot) => {
      const startX = (slot.startBeat / beatsPerTimeUnit) * width;
      const endX = (slot.endBeat / beatsPerTimeUnit) * width;
      return {
        x: startX + cellGap / 2,
        width: Math.max(0, endX - startX - cellGap),
      };
    };

    for (const [slotIndex, slot] of slots.entries()) {
      const slotStart = timing.beatsToSeconds(
        timeUnitStartBeat + slot.startBeat,
      );
      const slotEnd = timing.beatsToSeconds(timeUnitStartBeat + slot.endBeat);
      if (!slotStart.ok || !slotEnd.ok) continue;
      const blocked = hasMidiOnsetInRange(
        notes,
        slotStart.value,
        slotEnd.value,
      );
      const delay = staggerDelay(
        slotIndex,
        slots.length,
        exitTiming.staggerSeconds,
      );
      let settlement: number;
      if (timeUnitStartBeat <= 0) {
        settlement = blocked
          ? 0
          : applyEasing(
              props.slideInEasing,
              animationProgress(
                time.seconds - slotStart.value,
                slideInDuration,
              ),
            );
      } else {
        const previousSlotStart = timing.beatsToSeconds(
          previousTimeUnitStartBeat + slot.startBeat,
        );
        const previousSlotEnd = timing.beatsToSeconds(
          previousTimeUnitStartBeat + slot.endBeat,
        );
        if (!previousSlotStart.ok || !previousSlotEnd.ok) continue;
        const previousBlocked = hasMidiOnsetInRange(
          notes,
          previousSlotStart.value,
          previousSlotEnd.value,
        );
        const exitEnd = delay + exitTiming.durationSeconds;
        const previousEntranceStart = Math.max(
          previousSlotStart.value,
          previousTimeUnitStart.value + exitEnd,
        );
        const entranceStart = Math.max(
          slotStart.value - timeUnitStart.value,
          exitEnd,
        );
        settlement = resolveSlotSettlement({
          elapsedSinceBoundary,
          previousEntranceElapsed: timeUnitStart.value - previousEntranceStart,
          previousBlocked,
          exitDelay: delay,
          exitDuration: exitTiming.durationSeconds,
          entranceStart,
          entranceDuration: slideInDuration,
          blocked,
          exitEasing: props.slideOutEasing,
          entranceEasing: props.slideInEasing,
        });
      }
      addPair(objects, {
        ...slotGeometry(slot),
        rowHeight,
        rowGap,
        displacement: misalignment * (1 - settlement),
        slotIndex,
        color,
      });
    }

    return objects;
  },
});

export default mismatchedNegatives;
