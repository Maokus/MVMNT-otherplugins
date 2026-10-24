import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { load, defaults, context, frame, fixtures, Rectangle, ClipLayer, Line, Arc, Poly, Text } from '../tests/harness.mjs';

// Exercise the same element definitions and SDK adapter as the automated tests.
// The harness records SDK objects; this renderer paints those objects onto a CPU canvas.
export function paint(ctx, object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(object.rotation);
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

const { languages } = load('model'), { titles } = load('controls');
const out = fileURLToPath(new URL('../dist/review/', import.meta.url));
mkdirSync(out, { recursive: true });
for (const [fixture, notes] of Object.entries(fixtures)) {
    const canvas = createCanvas(1040, 80 + languages.length * 248);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#141719'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F5F1E8'; ctx.font = '22px sans-serif'; ctx.fillText(`Schematics n’ Scores / ${fixture}`, 24, 32);
    ctx.fillStyle = '#9caaa9'; ctx.font = '12px monospace'; ctx.fillText('640 × 160 transparent strip                     280 × 200 paper panel / same MIDI phrase', 24, 58);
    for (const [i, language] of languages.entries()) {
        const top = 80 + i * 248;
        ctx.fillStyle = '#C76760'; ctx.font = '13px monospace'; ctx.fillText(`${String(i + 1).padStart(2, '0')} ${titles[language]}`, 24, top + 15);
        const definition = load(language).default;
        const props = { ...defaults(language), midiTrackId: 'midi', motionAmount: .5 };
        const ctxMidi = context(notes), time = fixture === 'sparse' ? .7 : 2.3;
        ctx.save(); ctx.translate(24, top + 45);
        for (const object of frame(definition, props, ctxMidi, time)) paint(ctx, object);
        ctx.restore();
        ctx.save(); ctx.translate(720, top + 28);
        const panelProps = { ...props, width: 280, height: 200, inkColor: '#191715FF', accentColor: '#B64E49FF', guideColor: '#19171530', backgroundColor: '#F1EBDDFF' };
        for (const object of frame(definition, panelProps, ctxMidi, time)) paint(ctx, object);
        ctx.restore();
        ctx.strokeStyle = '#394145'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(24, top + 240); ctx.lineTo(1000, top + 240); ctx.stroke();
    }
    writeFileSync(`${out}/${fixture}.png`, canvas.toBuffer('image/png'));
}
writeFileSync(`${out}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Schematics n’ Scores — review</title>
<style>body{background:#141719;color:#f5f1e8;font:16px system-ui;margin:32px}nav{display:flex;gap:24px}a{color:#c76760}img{max-width:100%;height:auto}section{margin-top:40px;max-width:1040px}</style>
<h1>Schematics n’ Scores</h1><p>All ten SDK element definitions rendered with sparse, chordal, and dense MIDI. Each row compares a transparent strip and a paper panel.</p>
<nav>${Object.keys(fixtures).map(name => `<a href="#${name}">${name}</a>`).join('')}</nav>
${Object.keys(fixtures).map(name => `<section id="${name}"><h2>${name}</h2><img src="${name}.png" alt="All ten languages, ${name} MIDI"></section>`).join('')}</html>`);
console.log(`Review sheets: ${out}index.html`);
