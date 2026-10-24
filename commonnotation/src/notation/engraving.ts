import type { LayoutNode } from "./layout";
import type { ScoreEvent, Clef, ScoreNote } from "./model";
import { defaultGlyphs, type GlyphRegistry } from "./glyphs";
import type { KeySignature } from "./keys";
import { keyAlterations } from "./keys";
import { measureNodes } from "./geometry";
export function buildKeySignature(
  id: string,
  key: KeySignature,
  clef: Clef,
  registry: GlyphRegistry = defaultGlyphs,
): LayoutNode {
  keyAlterations(key);
  const sharp = [0, 1.5, -0.5, 1, 2.5, 0.5, 2],
    flat = [2, 0.5, 2.5, 1, 3, 1.5, 3.5];
  const children = Array.from({ length: Math.abs(key.fifths) }, (_, i) => {
    const glyph = key.fifths > 0 ? "accidentalSharp" : "accidentalFlat",
      g = registry.get(glyph);
    return {
      id: `${id}:${i}`,
      role: "key-signature",
      x: i * 0.95,
      y: (key.fifths > 0 ? sharp : flat)[i] + (clef === "bass" ? 1 : 0),
      bounds: { ...g.bounds },
      anchors: { ...g.anchors },
      glyph,
    };
  });
  return {
    id,
    role: "key-signature",
    x: 0,
    y: 0,
    children,
    bounds: measureNodes(children),
    anchors: {},
  };
}
export interface BeamItem {
  event: ScoreEvent;
  node: LayoutNode;
}
/** Conservative: only contiguous, non-overlapping events in the same voice and beat group. */
export function beamGroups(
  items: readonly BeamItem[],
  groups: readonly number[],
  barStart: number,
): LayoutNode[] {
  const beams: LayoutNode[] = [];
  const voices = [...new Set(items.map((i) => i.event.voiceId ?? "default"))];
  const boundary = (beat: number) => {
    let sum = barStart;
    for (let i = 0; i < groups.length; i++) {
      sum += groups[i];
      if (beat < sum - 1e-7) return i;
    }
    return groups.length - 1;
  };
  for (const voice of voices) {
    let run: BeamItem[] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const up =
        run.reduce((s, i) => s + (i.node.metadata?.stemUp ? 1 : -1), 0) >= 0;
      const first = run[0].node,
        last = run[run.length - 1].node;
      const base = (n: LayoutNode) =>
        n.anchors[up ? "stemBaseUp" : "stemBaseDown"] ?? n.anchors.stemBase;
      const slope = Math.max(
        -0.2,
        Math.min(
          0.2,
          (base(last).y - base(first).y) / Math.max(1, last.x - first.x),
        ),
      );
      const baseline = up
        ? Math.min(
            ...run.map(
              (i) => base(i.node).y + (up ? -3.5 : 3.5) - slope * i.node.x,
            ),
          )
        : Math.max(
            ...run.map(
              (i) => base(i.node).y + (up ? -3.5 : 3.5) - slope * i.node.x,
            ),
          );
      for (const item of run) {
        const n = item.node,
          stem = n.children?.find((c) => c.role === "stem");
        if (!stem) continue;
        n.children = n.children?.filter((c) => c.role !== "flag");
        const attachment = base(n);
        stem.x = attachment.x;
        stem.y = attachment.y;
        n.metadata = { ...n.metadata, stemUp: up };
        const target = baseline + slope * n.x;
        stem.line = { ...stem.line!, y: target - stem.y };
        stem.bounds = {
          x: -0.06,
          y: Math.min(0, target - stem.y),
          width: 0.12,
          height: Math.abs(target - stem.y) + 0.12,
        };
        n.anchors.stemTip = { x: stem.x, y: target };
        n.bounds = measureNodes(n.children ?? []);
      }
      const timing = run.flatMap((i) => i.event.notes);
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i],
          b = run[i + 1];
        const create = (level: number, partial = false, reverse = false) => {
          const from = { id: (reverse ? b : a).node.id, anchor: "stemTip" },
            to = { id: (reverse ? a : b).node.id, anchor: "stemTip" };
          beams.push({
            id: `beam:${a.node.id}:${b.node.id}:${level}${partial ? "p" : ""}`,
            role: "beam",
            x: 0,
            y: 0,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            anchors: {},
            timing,
            connection: {
              from,
              to,
              kind: "beam",
              thickness: up ? 0.45 : -0.45,
              offset: level * (up ? 0.75 : -0.75),
              fraction: partial ? 0.4 : 1,
            },
          });
        };
        create(0);
        const a16 = a.event.duration.denominator === 16,
          b16 = b.event.duration.denominator === 16;
        if (a16 && b16) create(1);
        else if (
          a16 &&
          (i === 0 || run[i - 1].event.duration.denominator !== 16)
        )
          create(1, true);
        else if (
          b16 &&
          (i === run.length - 2 || run[i + 2].event.duration.denominator !== 16)
        )
          create(1, true, true);
      }
      run = [];
    };
    const events = items
      .filter((i) => (i.event.voiceId ?? "default") === voice)
      .slice()
      .sort((a, b) => a.event.beat - b.event.beat);
    for (const item of events) {
      const previous = run[run.length - 1],
        e = item.event;
      if (!e.notes.length || e.duration.denominator < 8) {
        flush();
        continue;
      }
      if (
        previous &&
        (Math.abs(
          previous.event.beat + previous.event.duration.beats - e.beat,
        ) > 1e-7 ||
          boundary(previous.event.beat) !== boundary(e.beat))
      )
        flush();
      run.push(item);
    }
    flush();
  }
  return beams;
}
export function aggregateTiming(
  notes: readonly ScoreNote[],
  time: number,
): { start: number; end: number } | undefined {
  if (!notes.length) return;
  const active = notes.filter(
    (n) => n.startSeconds <= time && time < n.endSeconds,
  );
  if (active.length)
    return {
      start: Math.min(...active.map((n) => n.startSeconds)),
      end: Math.max(...active.map((n) => n.endSeconds)),
    };
  const past = notes.filter((n) => n.endSeconds <= time);
  if (past.length)
    return {
      start: Math.min(...past.map((n) => n.startSeconds)),
      end: Math.max(...past.map((n) => n.endSeconds)),
    };
  return {
    start: Math.min(...notes.map((n) => n.startSeconds)),
    end: Math.min(...notes.map((n) => n.endSeconds)),
  };
}
