import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { paint } from '../scripts/paint.mjs';
import { load, defaults, fixtures, context, frame } from './harness.mjs';

const { languages } = load('model');
function pixels(language, props, notes, seconds, margin = 0) {
    const canvas = createCanvas(props.width + margin * 2, props.height + margin * 2), ctx = canvas.getContext('2d');
    ctx.translate(margin, margin);
    for (const object of frame(load(language).default, props, context(notes), seconds)) paint(ctx, object);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
const coverage = data => data.reduce((total, value, i) => total + (i % 4 === 3 && value > 0 ? 1 : 0), 0);

test('sparse MIDI has visibly more ink at higher visual density in all ten languages', () => {
    for (const language of languages) {
        const props = { ...defaults(language), midiTrackId: 'midi', width: 320, height: 180, transition: 'none', motionAmount: 0, accentMode: 'none' };
        const low = pixels(language, props, fixtures.sparse, 1);
        const high = pixels(language, { ...props, visualDensity: 4 }, fixtures.sparse, 1);
        assert.ok(coverage(high) > coverage(low), `${language} gains visible detail`);
    }
});

test('transitioning primitives remain clipped in all modes and both orientations', () => {
    const notes = [...fixtures.dense, ...fixtures.dense.map(n => ({ ...n, startSeconds: n.startSeconds + 8, endSeconds: n.endSeconds + 8 }))];
    for (const transition of ['slide', 'scale', 'draw']) for (const orientation of ['horizontal', 'vertical']) {
        const props = { ...defaults('decesare'), midiTrackId: 'midi', width: 320, height: 180, transition, transitionTravel: 64, orientation, visualDensity: 4 };
        const data = pixels('decesare', props, notes, 7.9, 10), width = 340, height = 200;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            if (x < 10 || x >= 330 || y < 10 || y >= 190) assert.equal(data[(y * width + x) * 4 + 3], 0);
        }
    }
});

test('a phrase boundary has no raster discontinuity when old and new layers overlap', () => {
    const notes = [...fixtures.chordal, ...fixtures.chordal.map(n => ({ ...n, note: n.note + 5, startSeconds: n.startSeconds + 8, endSeconds: n.endSeconds + 8 }))];
    for (const transition of ['slide', 'scale', 'draw']) {
        const props = { ...defaults('decesare'), midiTrackId: 'midi', width: 320, height: 180, transition, motionAmount: 0, accentMode: 'none' };
        const before = pixels('decesare', props, notes, 8 - 1e-8), after = pixels('decesare', props, notes, 8 + 1e-8);
        const delta = before.reduce((sum, value, i) => sum + Math.abs(value - after[i]), 0);
        assert.ok(delta < 200, `${transition} boundary pixel difference ${delta}`);
    }
});
