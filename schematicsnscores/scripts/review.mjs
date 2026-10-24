import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { load, defaults, context, frame, fixtures, Rectangle, ClipLayer, Line, Arc, Poly, Text } from '../tests/harness.mjs';

// Exercise the same element definitions and SDK adapter as the automated tests.
// The harness records SDK objects; this renderer paints those objects onto a CPU canvas.
import { paint } from './paint.mjs';

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
        ctx.fillStyle = '#A4ADA7'; ctx.font = '13px monospace'; ctx.fillText(`${String(i + 1).padStart(2, '0')} ${titles[language]}`, 24, top + 15);
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
// Comparative sheets and animated phrase-boundary reviews.
function sheet(width, height, title) {
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#141719'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#EAE7DD'; ctx.font = '20px sans-serif'; ctx.fillText(title, 24, 30);
    return { canvas, ctx };
}
function draw(ctx, language, props, notes, seconds, x, y) {
    ctx.save(); ctx.translate(x, y);
    const definition = load(language).default;
    for (const object of frame(definition, { ...defaults(language), midiTrackId: 'midi', ...props }, context(notes), seconds)) paint(ctx, object);
    ctx.restore();
}
const base = { width: 304, height: 160, transition: 'none', motionAmount: 0, inkColor: '#242824FF', backgroundColor: '#EAE7DDFF', accentColor: '#254E81FF', guideColor: '#24282440' };
for (const comparison of ['density', 'accents']) {
    const { canvas, ctx } = sheet(1016, 90 + languages.length * 204, comparison === 'density' ? 'Visual Density / same sparse MIDI, unchanged primary marks' : 'Playback accents / selective marks, no group-wide tint');
    const choices = comparison === 'density' ? [1, 2, 4] : ['none', 'ink', 'spot'];
    for (const [column, choice] of choices.entries()) {
        ctx.fillStyle = '#A4ADA7'; ctx.font = '12px monospace'; ctx.fillText(String(choice), 24 + column * 328, 58);
        for (const [row, language] of languages.entries()) {
            const y = 80 + row * 204;
            if (!column) { ctx.fillStyle = '#A4ADA7'; ctx.fillText(titles[language], 24, y + 12); }
            draw(ctx, language, { ...base, ...(comparison === 'density' ? { visualDensity: choice } : { accentMode: choice, accentStrength: 1 }) }, comparison === 'density' ? fixtures.sparse : fixtures.chordal, comparison === 'density' ? .7 : .8, 24 + column * 328, y + 24);
        }
    }
    writeFileSync(`${out}/${comparison}.png`, canvas.toBuffer('image/png'));
}
const phraseNotes = [...fixtures.chordal, ...fixtures.chordal.map(n => ({ ...n, note: n.note + 5, startSeconds: n.startSeconds + 8, endSeconds: n.endSeconds + 8 }))];
const modes = ['slide', 'scale', 'draw'], frames = 24, fw = 640, fh = 200;
const contact = sheet(1440, 700, 'Phrase boundary / accelerating exits, decelerating entries');
for (const [row, mode] of modes.entries()) {
    const sprite = createCanvas(fw, fh * frames), ctx = sprite.getContext('2d');
    for (let i = 0; i < frames; i++) {
        const seconds = 7.35 + i / (frames - 1) * 1.3;
        ctx.fillStyle = '#EAE7DD'; ctx.fillRect(0, i * fh, fw, fh);
        draw(ctx, 'decesare', { ...base, width: fw, height: fh, visualDensity: 2, transition: mode, transitionDuration: 1.2, transitionStagger: .55 }, phraseNotes, seconds, 0, i * fh);
    }
    writeFileSync(`${out}/transition-${mode}.png`, sprite.toBuffer('image/png'));
    contact.ctx.fillStyle = '#A4ADA7'; contact.ctx.font = '12px monospace'; contact.ctx.fillText(mode, 24, 70 + row * 210);
    for (let col = 0; col < 4; col++) {
        const f = [0, 8, 14, 23][col];
        contact.ctx.drawImage(sprite, 0, f * fh, fw, fh, 24 + col * 352, 80 + row * 210, 336, 150);
    }
}
writeFileSync(`${out}/transitions.png`, contact.canvas.toBuffer('image/png'));
for (const seed of [1998, 47, 3201]) {
    const canvas = createCanvas(1280, 720), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#EAE7DD'; ctx.fillRect(0, 0, 1280, 720);
    draw(ctx, 'panels', { ...base, width: 1280, height: 720, visualDensity: 2.5, layoutSeed: seed, showDividers: true, guideColor: '#24282425' }, fixtures.dense, 2.3, 0, 0);
    writeFileSync(`${out}/panels-${seed}.png`, canvas.toBuffer('image/png'));
}
writeFileSync(`${out}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Schematics n’ Scores — review</title>
<style>body{background:#141719;color:#eae7dd;font:16px system-ui;margin:32px}nav{display:flex;gap:24px;flex-wrap:wrap}a{color:#b6c2c0}img{max-width:100%;height:auto}section{margin-top:48px;max-width:1280px}select,button,input{font:inherit;margin:8px}canvas{max-width:100%;height:auto}label{display:inline-block}</style>
<h1>Schematics n’ Scores 1.1</h1><p>Eleven SDK definitions rendered through the shared adapter. Compare accents and density, play the three phrase transitions, and inspect seeded layouts.</p>
<nav>${['accents', 'density', 'transitions', 'panels', ...Object.keys(fixtures)].map(name => `<a href="#${name}">${name}</a>`).join('')}</nav>
<section id="accents"><h2>Accents</h2><img src="accents.png" alt="None, Ink, and Spot Color accents for all ten languages"></section>
<section id="density"><h2>Visual Density</h2><img src="density.png" alt="Detail levels one, two, and four using identical sparse MIDI"></section>
<section id="transitions"><h2>Phrase transitions</h2><p>Incoming and outgoing phrases overlap around the boundary at 8 seconds. The timeline can also be scrubbed.</p>
<label>Style <select id="style"><option value="slide">Slide &amp; Fade</option><option value="scale">Shrink &amp; Grow</option><option value="draw">Retract &amp; Draw</option></select></label><button id="toggle">Pause</button><input id="scrub" type="range" min="0" max="23" value="0"><output id="time"></output><br><canvas id="player" width="640" height="200"></canvas><img src="transitions.png" alt="Four phases of each transition style"></section>
<section id="panels"><h2>Score Panels</h2><p>Ten fixed panels, each assigned a different language. MIDI onset groups are partitioned round-robin. Visual Density is 2.5.</p>${[1998, 47, 3201].map(seed => `<h3>Layout seed ${seed}</h3><img src="panels-${seed}.png" alt="Score Panels, layout seed ${seed}">`).join('')}</section>
${Object.keys(fixtures).map(name => `<section id="${name}"><h2>${name}</h2><img src="${name}.png" alt="All ten languages, ${name} MIDI"></section>`).join('')}
<script>
const sprites={}, canvas=document.getElementById('player'),ctx=canvas.getContext('2d'),style=document.getElementById('style'),scrub=document.getElementById('scrub');
for(const mode of ['slide','scale','draw']){const img=new Image();img.src='transition-'+mode+'.png';sprites[mode]=img;}
let playing=true,start=performance.now(),current=0;
document.getElementById('toggle').onclick=()=>{playing=!playing;document.getElementById('toggle').textContent=playing?'Pause':'Play';start=performance.now()-current/24*2200;};
scrub.oninput=()=>{playing=false;current=Number(scrub.value);document.getElementById('toggle').textContent='Play';};
function tick(now){if(playing){current=Math.floor(((now-start)%2200)/2200*24);scrub.value=String(current);}const img=sprites[style.value];if(img.complete&&img.naturalWidth){ctx.clearRect(0,0,640,200);ctx.drawImage(img,0,current*200,640,200,0,0,640,200);}document.getElementById('time').textContent=(7.35+current/23*1.3).toFixed(2)+' s';requestAnimationFrame(tick);}requestAnimationFrame(tick);
</script></html>`);
console.log(`Review sheets and transition player: ${out}index.html`);
