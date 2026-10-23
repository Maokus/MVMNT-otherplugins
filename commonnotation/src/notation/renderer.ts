import {
  BezierPath,
  EmptyRenderObject,
  Line,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import { defaultGlyphs, type GlyphRegistry } from "./glyphs";
import type { LayoutNode, ScoreLayout } from "./layout";
import { evaluateNotePhase, blendNoteColor, type NotePhase } from "./effects";
export interface NodeStyle {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  opacity?: number;
  color?: string;
}
export interface RenderOptions {
  time: number;
  color: string;
  activeColor: string;
  reveal: number;
  release: number;
  animate?: boolean;
  revealStyle?: 'fade' | 'slide' | 'spin';
  releaseStyle?: 'settle' | 'float' | 'shrink';
  motionAmount?: number;
  activeScale?: number;
  upcomingOpacity?: number;
  completedOpacity?: number;
  showBounds?: boolean;
  showAnchors?: boolean;
  noteStyle?: (node: LayoutNode, phase: NotePhase) => NodeStyle;
  componentStyle?: (node: LayoutNode) => NodeStyle;
}
export class NotationRenderer {
  constructor(readonly glyphs: GlyphRegistry = defaultGlyphs) {}
  renderNode(
    node: LayoutNode,
    options: RenderOptions,
    inheritedColor = options.color,
  ): RenderObject {
    let style: NodeStyle = {};
    if (node.note) {
      const phase = evaluateNotePhase(
        options.time,
        node.note.startSeconds,
        node.note.endSeconds,
        options,
      );
      if (options.animate !== false) {
        const upcoming=options.upcomingOpacity ?? .22, completed=options.completedOpacity ?? 1;
        const scale=options.activeScale ?? 1.06, motion=options.motionAmount ?? .6;
        const entry=options.revealStyle ?? 'slide', exit=options.releaseStyle ?? 'settle';
        if(phase.phase==='upcoming') style={opacity:upcoming};
        if(phase.phase==='reveal') style={opacity:upcoming+(1-upcoming)*phase.amount,
          y:entry==='slide'?(1-phase.amount)*motion:0,
          rotation:entry==='spin'?(1-phase.amount)*Math.PI:0,
          scale:entry==='spin'?.5+.5*phase.amount:1};
        if(phase.phase==='active')style={color:options.activeColor,scale};
        if(phase.phase==='release')style={
          color:blendNoteColor(options.color,options.activeColor,phase.amount),
          opacity:completed+(1-completed)*phase.amount,
          scale:exit==='shrink'?.3+(scale-.3)*phase.amount:1+(scale-1)*phase.amount,
          y:exit==='float'?-(1-phase.amount)*motion:0};
        if(phase.phase==='completed')style={opacity:completed,
          scale:exit==='shrink'?.3:1,y:exit==='float'?-motion:0};
      }
      style = { ...style, ...options.noteStyle?.(node, phase) };
    }
    style = { ...style, ...options.componentStyle?.(node) };
    const color = style.color ?? inheritedColor;
    const object = new EmptyRenderObject(
      node.x + (style.x ?? 0),
      node.y + (style.y ?? 0),
    );
    object
      .setScale(style.scale ?? 1)
      .setRotation((node.rotation ?? 0) + (style.rotation ?? 0))
      .setOpacity(style.opacity ?? 1)
      .setLayoutParticipation("exclude");
    if (node.role === "page")
      object.setScale(node.anchors.scale.x * (style.scale ?? 1));
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
    for (const child of node.children ?? [])
      object.addChild(this.renderNode(child, options, color));
    if (options.showBounds && (node.glyph || node.line || node.path)) {
      const b=node.bounds;
      object.addChild(new Rectangle(b.x,b.y,b.width,b.height,{fillColor:null,strokeColor:'#38BDF8AA',strokeWidth:.045}));
    }
    if(options.showAnchors && (node.glyph || node.note)) {
      for(const p of [{x:0,y:0},...Object.values(node.anchors)]) {
        object.addChild(new Line(p.x-.18,p.y,p.x+.18,p.y,{color:'#FBBF24',lineWidth:.055}));
        object.addChild(new Line(p.x,p.y-.18,p.x,p.y+.18,{color:'#FBBF24',lineWidth:.055}));
      }
    }
    return object;
  }
  render(layout: ScoreLayout, options: RenderOptions): RenderObject[] {
    return [
      new Rectangle(0, 0, layout.width, layout.height, {
        fillColor: "#00000000",
      }).setLayoutParticipation("include"),
      ...layout.nodes.map((n) => this.renderNode(n, options)),
    ];
  }
}
