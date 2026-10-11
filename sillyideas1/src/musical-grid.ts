/** Musical-window helpers shared by the grid-based MIDI elements. */
export const TIME_UNIT_OPTIONS = [
  { label: "1/2 bar", value: "0.5" },
  { label: "1 bar", value: "1" },
  { label: "2 bars", value: "2" },
  { label: "4 bars", value: "4" },
];

const SUBDIVISION_BEATS: Readonly<Record<string, number>> = {
  "1/4": 1,
  "1/4-dotted": 1.5,
  "1/4-triplet": 2 / 3,
  "1/8": 1 / 2,
  "1/8-dotted": 3 / 4,
  "1/8-triplet": 1 / 3,
  "1/16": 1 / 4,
  "1/16-dotted": 3 / 8,
  "1/16-triplet": 1 / 6,
  "1/32": 1 / 8,
  "1/32-dotted": 3 / 16,
  "1/32-triplet": 1 / 12,
  "1/64": 1 / 16,
  "1/64-dotted": 3 / 32,
  "1/64-triplet": 1 / 24,
};

export interface MusicalSlot {
  readonly startBeat: number;
  readonly endBeat: number;
}

export function subdivisionBeats(value: unknown): number {
  return SUBDIVISION_BEATS[String(value)] ?? SUBDIVISION_BEATS["1/16"];
}

export function parseTimeUnitBars(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(4, parsed) : 1;
}

export function buildMusicalSlots(
  totalBeats: number,
  slotBeats: number,
): readonly MusicalSlot[] {
  if (!(totalBeats > 0) || !(slotBeats > 0)) return [];
  const count = Math.ceil(totalBeats / slotBeats - 1e-9);
  return Array.from({ length: count }, (_, index) => ({
    startBeat: index * slotBeats,
    endBeat: Math.min(totalBeats, (index + 1) * slotBeats),
  }));
}

export function timeUnitStartBeat(beat: number, beatsPerUnit: number): number {
  return Math.floor((beat + 1e-9) / beatsPerUnit) * beatsPerUnit;
}
