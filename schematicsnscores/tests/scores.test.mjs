import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load, defaults, context, note, frame, flatten, fixtures, fail, Rectangle, ClipLayer, Poly, Text, Line, Arc } from './harness.mjs';

const { languages, readPage, settings, MAX_NOTES, MAX_PRIMITIVES, activity } = load('model');
const { generate } = load('geometry');
const { blend, trim, renderDrawing } = load('render');

test('manifest and ten genuine SDK definitions agree, with MIDI selectors and unique controls', () => {
    const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url)));
    assert.equal(manifest.elements.length, 10);
    for (const language of languages) {
        const definition = load(language).default;
        assert.equal(definition.kind, 'mvmnt.plugin-element.v2');
        assert.equal(definition.type, `sns-${language}`);
        assert.deepEqual(manifest.elements.find(e => e.type === definition.type).capabilities.required, ['timeline.read', 'timing.conversion']);
        const properties = definition.schema.tabs.flatMap(t => t.groups.flatMap(g => g.properties));
        assert.equal(new Set(properties.map(p => p.key)).size, properties.length);
        assert.equal(properties.find(p => p.key === 'midiTrackId').type, 'timelineTrackRef');
        assert.deepEqual(properties.find(p => p.key === 'midiTrackId').allowedTrackTypes, ['midi']);
        assert.ok(definition.metadata.description.length > 20);
    }
});

test('beat pages use tempo-map conversion, offsets, and denominator-aware bars', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi', pageBars: 1 };
    const ctx = context([note(60, 0, 20)], { tempoChange: true });
    const a = readPage(props, 3.99, ctx), b = readPage(props, 4, ctx);
    assert.deepEqual([a.index, a.start, a.end], [1, 2, 4]);
    assert.deepEqual([b.index, b.start, b.end], [2, 4, 8]);
    const sixEight = readPage(props, 1.5, context([], { signature: [6, 8] }));
    assert.deepEqual([sixEight.index, sixEight.start, sixEight.end, sixEight.beats], [1, 1.5, 3, 3]);
    const offset = readPage({ ...props, pageOffset: 1 }, .75, ctx);
    assert.deepEqual([offset.startBeat, offset.start, offset.end], [1, .5, 2.5]);
    const negative = readPage(props, -.1, ctx);
    assert.equal(negative.index, -1);
    assert.equal(negative.end, 0);
});

test('page membership is half-open and sustained notes retain real playback timing', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi', pageBars: 1 };
    const ctx = context([note(48, 1, 3), note(60, 2, .2), note(70, 4, .2), note(55, 1, 1)]);
    const page = readPage(props, 2, ctx);
    assert.equal(page.notes.length, 2);
    assert.equal(page.notes[0].start, 1);
    assert.equal(page.notes[0].x, 0);
    assert.equal(page.notes[0].extent, 1);
    assert.ok(activity(page.notes[0], 2, .45) > 0);
    assert.equal(activity(page.notes[0], .9, .45), 0);
    assert.equal(activity(page.notes[0], 4.5, .45), 0);
});

test('input validation, track isolation, pitch ranges, missing velocity, and stable ordering', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi' };
    const input = [note(70, 1, 1, undefined), note(50, 0, 1), note(64, .2, 1, 500), note(80, 1, 1, 70, { trackId: 'other' }), note(NaN, 1, 1), note(50, 0, -1), note(50, 0, 1, NaN)];
    const missing = { ...input[0] }; delete missing.velocity; input[0] = missing;
    const page = readPage(props, 1, context(input));
    assert.equal(page.notes.length, 3);
    assert.equal(page.notes.find(n => n.pitch === 70).velocity, 80 / 127);
    assert.equal(page.notes.find(n => n.pitch === 64).velocity, 1);
    assert.deepEqual(page, readPage(props, 1, context([...input].reverse())));
    const manual = readPage({ ...props, autoRange: false, minNote: 80, maxNote: 40 }, 1, context(input));
    assert.ok(manual.notes.every(n => n.y >= 0 && n.y <= 1));
    assert.equal(readPage(props, 1, context([note(60, 0, 1)])).notes[0].y, .5);
});

for (const language of languages) {
    test(`${language}: random-access rendering, MIDI edits, and a stable phrase composition`, () => {
        const definition = load(language).default;
        const props = { ...defaults(language), midiTrackId: 'midi', motionAmount: 0, accentStrength: 0 };
        const ctx = context(fixtures.sparse), cache = definition.createResources({});
        const first = frame(definition, props, ctx, .6, cache);
        const drawing = cache.drawing;
        frame(definition, props, ctx, 10, cache);
        assert.deepEqual(frame(definition, props, ctx, .6, cache), first);
        assert.deepEqual(frame(definition, props, ctx, 2.5, cache), first);
        assert.deepEqual(cache.drawing, drawing);
        const priorDrawing = cache.drawing;
        frame(definition, { ...props, inkColor: '#11000080' }, ctx, 2.5, cache);
        assert.equal(cache.drawing, priorDrawing, 'palette changes should reuse geometry');
        frame(definition, props, context([note(90, 1, 3, 127)]), 2.5, cache);
        assert.notDeepEqual(cache.drawing, priorDrawing, 'MIDI edits must invalidate cached geometry');
        definition.disposeResources(cache, {});
        assert.equal(cache.drawing, undefined);
    });

    test(`${language}: playback accents, motion disable, and missing-source behavior`, () => {
        const definition = load(language).default;
        const props = { ...defaults(language), midiTrackId: 'midi' }, ctx = context([note(60, .3, 1)]);
        assert.notDeepEqual(frame(definition, props, ctx, .1), frame(definition, props, ctx, .6));
        assert.deepEqual(frame(definition, { ...props, motionAmount: 0, accentStrength: 0 }, ctx, .1), frame(definition, { ...props, motionAmount: 0, accentStrength: 0 }, ctx, .6));
        assert.deepEqual(frame(definition, { ...props, midiTrackId: '' }, ctx, 1), []);
        assert.deepEqual(frame(definition, props, {}, 1), []);
        assert.deepEqual(frame(definition, props, { ...ctx, timeline: { selectNotes: fail } }, 1), []);
        assert.deepEqual(frame(definition, { ...props, visible: false }, ctx, 1), []);
        const silent = frame(definition, props, context([]), 1);
        assert.equal(flatten(silent).filter(o => o instanceof Text || o instanceof Line || o instanceof Arc || o instanceof Poly).length, 0);
        assert.equal(flatten(silent).filter(o => o instanceof Text).length, 0);
    });

    test(`${language}: bounded finite geometry at dense and extreme settings`, () => {
        const props = { ...defaults(language), midiTrackId: 'midi', density: 1, markScale: 4, contourCount: 16, hatchSpacing: 1, rows: 32, subdivision: 8, showGuides: true };
        const page = readPage(props, 1, context(fixtures.dense));
        assert.equal(page.notes.length, MAX_NOTES);
        const drawing = generate(language, page, settings(props));
        assert.ok(drawing.count <= MAX_PRIMITIVES);
        assert.ok(drawing.count > 0);
        const checkFinite = value => {
            if (typeof value === 'number') assert.ok(Number.isFinite(value));
            else if (Array.isArray(value)) value.forEach(checkFinite);
            else if (value && typeof value === 'object') Object.values(value).forEach(checkFinite);
        };
        checkFinite(drawing);
        const output = frame(load(language).default, props, context(fixtures.dense), 1);
        const leaves = flatten(output).filter(o => !o.children.length && !(o instanceof ClipLayer));
        assert.ok(leaves.length <= MAX_PRIMITIVES);
        for (const dims of [[16, 16], [160, 640], [8192, 32]]) {
            const panel = frame(load(language).default, { ...props, width: dims[0], height: dims[1], padding: 512, orientation: 'vertical' }, context(fixtures.sparse), 1);
            checkFinite(panel);
            assert.equal(panel[0].layoutParticipation, 'include');
            assert.equal(panel[1].clipWidth, dims[0]);
            assert.equal(panel[1].clipHeight, dims[1]);
            assert.equal(panel[1].children[0].rotation, Math.PI / 2);
        }
    });
}

test('all four MIDI dimensions condition every language', () => {
    for (const language of languages) {
        const props = { ...defaults(language), midiTrackId: 'midi', density: 1, autoRange: false, beltDetail: 1 };
        const make = notes => generate(language, readPage(props, 1, context(notes)), settings(props));
        const original = [note(55, .3, 1.4, 60), note(67, 3.2, .6, 100)];
        const base = make(original);
        const edits = [
            [note(59, .3, 1.4, 60), original[1]], [note(55, 1.1, 1.4, 60), original[1]],
            [note(55, .3, .1, 60), original[1]], [note(55, .3, 1.4, 120), original[1]],
        ];
        for (const [index, edit] of edits.entries()) assert.notDeepEqual(make(edit), base, `${language} MIDI dimension ${index}`);
    }
});

test('alpha survives activity mixing and Matrix hollow cells never paint a background', () => {
    assert.equal(blend('#11223300', '#FFEEDDFF', 1), '#ffeedd00');
    assert.equal(blend('#11223380', '#FFEEDDFF', 1), '#ffeedd80');
    assert.equal(blend('#11223380', '#FFEEDD00', 1), '#11223380');
    const props = { ...defaults('matrix'), midiTrackId: 'midi', inkColor: '#11223300', accentColor: '#FFEEDDFF', density: 1 };
    const objects = flatten(frame(load('matrix').default, props, context(fixtures.dense), 1));
    for (const o of objects.filter(o => o instanceof Rectangle && o.fillColor)) assert.ok(o.fillColor.endsWith('00'));
    assert.ok(objects.filter(o => o instanceof Rectangle && o.strokeColor && !o.fillColor).length > 0);
});

test('density zero removes MIDI marks and seeded compositions can be varied', () => {
    for (const language of languages) {
        const props = { ...defaults(language), midiTrackId: 'midi', density: 0 };
        const page = readPage(props, 1, context(fixtures.sparse));
        assert.equal(generate(language, page, settings(props)).count, 0);
    }
    for (const language of languages) {
        const props = { ...defaults(language), midiTrackId: 'midi' }, page = readPage(props, 1, context(fixtures.sparse));
        assert.notDeepEqual(generate(language, page, settings(props)), generate(language, page, settings({ ...props, seed: 24 })), `${language} responds to the seed`);
    }
});

test('trace trimming uses segment distance', () => {
    assert.deepEqual(trim([[0, 0], [1, 0], [10, 0]], .5), [[0, 0], [1, 0], [5, 0]]);
});

test('timing failures and malformed settings degrade without throwing', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi' }, ctx = context(fixtures.sparse);
    for (const key of ['secondsToBeats', 'beatsToSeconds', 'getTimeSignature']) {
        assert.equal(readPage(props, 1, { ...ctx, timing: { ...ctx.timing, [key]: fail } }), null);
    }
    assert.equal(readPage(props, NaN, ctx), null);
    assert.equal(readPage(props, 1, context([], { signature: [4, 0] })), null);
    const tiny = settings({ width: 16, height: 16, padding: NaN, density: Infinity, seed: -5 });
    assert.equal(tiny.padding, 7);
    assert.equal(tiny.density, .65);
    assert.equal(tiny.seed, 0);
});

test('hard primitive budget includes optional background, layout bounds, and playhead', () => {
    const s = settings({ ...defaults('matrix'), density: 1, rows: 32, subdivision: 8, backgroundColor: '#112233FF', showPlayhead: true });
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => ({ id: String(i), pitch: i % 32 + 40, velocity: .8, start: 0, end: 100, x: 0, extent: 1, y: (i % 32) / 31 }));
    const page = { index: 0, start: 0, end: 128, startBeat: 0, beats: 256, notes };
    const drawing = generate('matrix', page, s);
    assert.equal(drawing.count, MAX_PRIMITIVES);
    const leaves = flatten(renderDrawing(drawing, page, s, 1, .5)).filter(o => o instanceof Rectangle || o instanceof Line || o instanceof Arc || o instanceof Poly || o instanceof Text);
    assert.ok(leaves.length <= MAX_PRIMITIVES);
});
