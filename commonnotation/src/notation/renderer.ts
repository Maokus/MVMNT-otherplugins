import {
  BezierPath,
  EmptyRenderObject,
  Line,
  Rectangle,
  Text,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import { defaultGlyphs, type GlyphRegistry } from "./glyphs";
import type { LayoutNode, ScoreLayout } from "./layout";
import {
  evaluateNotePhase,
  evaluateNoteStyle,
  type NotePhase,
} from "./effects";
import { aggregateTiming } from "./engraving";
import { resolveAnchor, measureNodes } from "./geometry";
export interface NodeStyle {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  opacity?: number;
  color?: string;
}
export interface StyleContext {
  readonly phase?: NotePhase;
  readonly sourceIds: readonly string[];
}
export interface RenderOptions {
  time: number;
  color: string;
  activeColor: string;
  reveal: number;
  release: number;
  animate?: boolean;
  revealStyle?: "fade" | "slide" | "spin";
  releaseStyle?: "settle" | "float" | "shrink";
  motionAmount?: number;
  revealDistance?: number;
  releaseDistance?: number;
  activeScale?: number;
  upcomingOpacity?: number;
  completedOpacity?: number;
  showBounds?: boolean;
  showAnchors?: boolean;
  noteStyle?: (node: LayoutNode, phase: NotePhase) => NodeStyle;
  componentStyle?: (node: LayoutNode, context: StyleContext) => NodeStyle;
}
/** Evaluate a fresh geometric scene; source layouts remain immutable. */
export function evaluateLayoutNodes(
  nodes: readonly LayoutNode[],
  options: RenderOptions,
  context: StyleContext = { sourceIds: [] },
): LayoutNode[] {
  const result = nodes.map((node) => {
    const timing = node.timing ?? (node.note ? [node.note] : []),
      interval = aggregateTiming(timing, options.time);
    const phase = interval
      ? evaluateNotePhase(options.time, interval.start, interval.end, options)
      : context.phase;
    const next: StyleContext = {
      phase,
      sourceIds: timing.length
        ? timing.map((n) => n.sourceId)
        : context.sourceIds,
    };
    let style: NodeStyle = {};
    if (interval && phase) {
      const defaults = evaluateNoteStyle(phase, {
        ...options,
        color: node.color ?? options.color,
      });
      // Pitch parts within a chord inherit its motion; their color can still follow individual timing.
      style = node.connection
        ? { color: defaults.color, opacity: defaults.opacity }
        : node.note && context.sourceIds.length
          ? { color: defaults.color ?? node.color ?? options.color }
          : defaults;
      if (node.note) style = { ...style, ...options.noteStyle?.(node, phase) };
    }
    style = { ...style, ...options.componentStyle?.(node, next) };
    const out: LayoutNode = {
      ...node,
      x: node.x + (style.x ?? 0),
      y: node.y + (style.y ?? 0),
      rotation: (node.rotation ?? 0) + (style.rotation ?? 0),
      scaleX:
        (node.scaleX ??
          (node.role === "page" ? node.anchors.scale?.x : undefined) ??
          1) * (style.scale ?? 1),
      scaleY:
        (node.scaleY ??
          node.scaleX ??
          (node.role === "page" ? node.anchors.scale?.y : undefined) ??
          1) * (style.scale ?? 1),
      color: style.color ?? node.color,
      opacity: (node.opacity ?? 1) * (style.opacity ?? 1),
    };
    if (node.children)
      out.children = evaluateLayoutNodes(node.children, options, next);
    return out;
  });
  // Relationships are resolved after all sibling motion has been evaluated.
  for (const node of result) {
    const connection = node.connection;
    if (!connection) continue;
    const from = resolveAnchor(
        result,
        connection.from.id,
        connection.from.anchor,
      ),
      end = resolveAnchor(result, connection.to.id, connection.to.anchor);
    if (!from || !end) {
      node.opacity = 0;
      continue;
    }
    const fraction = connection.fraction ?? 1,
      to = {
        x: from.x + (end.x - from.x) * fraction,
        y: from.y + (end.y - from.y) * fraction,
      };
    const offset = connection.offset ?? 0;
    from.y += offset;
    to.y += offset;
    node.x = 0;
    node.y = 0;
    node.scaleX = 1;
    node.scaleY = 1;
    node.rotation = 0;
    if (connection.kind === "beam") {
      const t = connection.thickness ?? 0.45;
      node.path = [
        { type: "moveTo", ...from },
        { type: "lineTo", ...to },
        { type: "lineTo", x: to.x, y: to.y + t },
        { type: "lineTo", x: from.x, y: from.y + t },
        { type: "closePath" },
      ];
    } else {
      const w = to.x - from.x;
      node.path = [
        { type: "moveTo", ...from },
        {
          type: "bezierCurveTo",
          cp1x: from.x + w * 0.25,
          cp1y: from.y + 0.8,
          cp2x: from.x + w * 0.75,
          cp2y: to.y + 0.8,
          ...to,
        },
        {
          type: "bezierCurveTo",
          cp1x: from.x + w * 0.75,
          cp1y: to.y + 0.55,
          cp2x: from.x + w * 0.25,
          cp2y: from.y + 0.55,
          ...from,
        },
        { type: "closePath" },
      ];
    }
    node.bounds = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y) + 1,
    };
  }
  return result;
}
export class NotationRenderer {
  constructor(readonly glyphs: GlyphRegistry = defaultGlyphs) {}
  renderNode(
    node: LayoutNode,
    options: RenderOptions,
    inheritedColor = options.color,
  ): RenderObject {
    return this.renderPrepared(
      evaluateLayoutNodes([node], options)[0],
      options,
      inheritedColor,
    );
  }
  private renderPrepared(
    node: LayoutNode,
    options: RenderOptions,
    inheritedColor: string,
  ): RenderObject {
    const color = node.color ?? inheritedColor,
      object = new EmptyRenderObject(node.x, node.y);
    object
      .setOrigin(node.originX ?? 0, node.originY ?? 0)
      .setScale(node.scaleX ?? 1, node.scaleY ?? node.scaleX ?? 1)
      .setRotation(node.rotation ?? 0)
      .setOpacity(node.opacity ?? 1)
      .setLayoutParticipation("exclude");
    if (node.glyph)
      object.addChild(
        new BezierPath(0, 0, [...this.glyphs.get(node.glyph).commands], {
          fillColor: color,
          strokeWidth: 0,
          fillRule: "nonzero",
        }),
      );
    if (node.path)
      object.addChild(
        new BezierPath(0, 0, node.path, { fillColor: color, strokeWidth: 0 }),
      );
    if (node.line)
      object.addChild(
        new Line(0, 0, node.line.x, node.line.y, {
          color,
          lineWidth: node.line.width,
        }),
      );
    if (node.text)
      object.addChild(
        new Text(0, 0, node.text.value, node.text.font, { color }),
      );
    for (const child of node.children ?? [])
      object.addChild(this.renderPrepared(child, options, color));
    if (options.showBounds && (node.glyph || node.line || node.path))
      object.addChild(
        new Rectangle(
          node.bounds.x,
          node.bounds.y,
          node.bounds.width,
          node.bounds.height,
          { fillColor: null, strokeColor: "#38BDF8AA", strokeWidth: 0.045 },
        ),
      );
    if (options.showAnchors && (node.glyph || node.note))
      for (const p of [{ x: 0, y: 0 }, ...Object.values(node.anchors)]) {
        object.addChild(
          new Line(p.x - 0.18, p.y, p.x + 0.18, p.y, {
            color: "#FBBF24",
            lineWidth: 0.055,
          }),
        );
        object.addChild(
          new Line(p.x, p.y - 0.18, p.x, p.y + 0.18, {
            color: "#FBBF24",
            lineWidth: 0.055,
          }),
        );
      }
    return object;
  }
  render(layout: ScoreLayout, options: RenderOptions): RenderObject[] {
    return [
      new Rectangle(0, 0, layout.width, layout.height, {
        fillColor: "#00000000",
      }).setLayoutParticipation("include"),
      ...evaluateLayoutNodes(layout.nodes, options).map((n) =>
        this.renderPrepared(n, options, options.color),
      ),
    ];
  }
}
