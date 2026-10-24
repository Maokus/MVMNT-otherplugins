import { Rectangle, ClipLayer, Line, Arc, Poly, Text } from '../tests/harness.mjs';

export function paint(ctx, object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(object.rotation);
    ctx.scale(object.scaleX, object.scaleY);
    ctx.globalAlpha *= object.opacity;
    if (object instanceof ClipLayer) { ctx.beginPath(); ctx.rect(0, 0, object.clipWidth, object.clipHeight); ctx.clip(); }
    else if (object instanceof Line) {
        ctx.beginPath(); ctx.moveTo(object.x1, object.y1); ctx.lineTo(object.x2, object.y2);
        ctx.strokeStyle = object.color; ctx.lineWidth = object.lineWidth; ctx.lineCap = object.lineCap ?? 'butt';
        ctx.setLineDash(object.lineDash ?? []); ctx.stroke();
    } else if (object instanceof Text) {
        ctx.font = object.font; ctx.fillStyle = object.color; ctx.textBaseline = object.baseline; ctx.fillText(object.text, 0, 0);
    } else if (object instanceof Rectangle || object instanceof Arc || object instanceof Poly) {
        ctx.beginPath();
        if (object instanceof Rectangle) ctx.rect(0, 0, object.width, object.height);
        if (object instanceof Arc) ctx.arc(0, 0, object.radius, object.startAngle, object.endAngle);
        if (object instanceof Poly) {
            object.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            if (object.closed) ctx.closePath();
        }
        if (object.fillColor) { ctx.fillStyle = object.fillColor; ctx.fill(); }
        if (object.strokeColor && object.strokeWidth > 0) {
            ctx.strokeStyle = object.strokeColor; ctx.lineWidth = object.strokeWidth; ctx.lineJoin = 'round'; ctx.stroke();
        }
    }
    object.children.forEach(child => paint(ctx, child));
    ctx.restore();
}

