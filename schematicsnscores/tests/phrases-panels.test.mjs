import assert from 'node:assert/strict';
import test from 'node:test';
import { load, defaults, context, note, frame, flatten, fixtures, Rectangle, Line, Arc, Poly, Text, ClipLayer } from './harness.mjs';

const { settings, readPage, languages, MAX_PRIMITIVES } = load('model');
const { generate } = load('geometry');
const { readPhraseLayers, transitionFrame, easeIn, easeOut } = load('phrases');
const { renderComposition } = load('render');
const { panelLayout, partitionPage } = load('panel-layout');
const primitive = o => o instanceof Rectangle || o instanceof Line || o instanceof Arc || o instanceof Poly || o instanceof Text;
const colors = objects => flatten(objects).flatMap(o => [o.color, o.fillColor, o.strokeColor].filter(Boolean));
const twoPhrases = [...fixtures.chordal, ...fixtures.chordal.map(n => ({ ...n, note: n.note + 5, startSeconds: n.startSeconds + 8, endSeconds: n.endSeconds + 8 }))];

test('new controls retain saved keys and expose all three transition styles', () => {
    for (const kind of [...languages, 'panels']) {
        const schema = load('controls').schema(kind);
        const properties = schema.tabs.flatMap(t => t.groups.flatMap(g => g.properties));
        assert.equal(properties.find(p => p.key === 'density').label, 'Note Coverage');
        assert.deepEqual(properties.find(p => p.key === 'transition').options.map(o => o.value), ['none', 'slide', 'scale', 'draw']);
        assert.equal(defaults(kind).visualDensity, 1);
        assert.equal(defaults(kind).accentMode, 'ink');
        assert.equal(defaults(kind).transition, 'slide');
    }
    const panels = load('panels').default;
    assert.equal(panels.type, 'sns-panels');
    assert.equal(defaults('panels').width, 1280);
    assert.equal(defaults('panels').height, 720);
});

for (const language of languages) {
    test(`${language}: visual density is additive, repeatable, and preserves original MIDI marks`, () => {
        const props = { ...defaults(language), midiTrackId: 'midi' }, page = readPage(props, 1, context(fixtures.sparse));
        const base = generate(language, page, settings(props));
        const medium = generate(language, page, settings({ ...props, visualDensity: 2 }));
        const rich = generate(language, page, settings({ ...props, visualDensity: 4 }));
        assert.ok(medium.count > base.count);
        assert.ok(rich.count > medium.count);
        assert.ok(rich.count <= MAX_PRIMITIVES);
        assert.deepEqual(rich.groups.slice(0, base.groups.length), base.groups);
        assert.deepEqual(rich.groups.slice(0, medium.groups.length), medium.groups);
        assert.deepEqual(rich, generate(language, page, settings({ ...props, visualDensity: 4 })));
        assert.equal(generate(language, { ...page, notes: [] }, settings({ ...props, visualDensity: 4 })).count, 0);
        const covered = generate(language, page, settings({ ...props, visualDensity: 4, density: 0 }));
        assert.equal(covered.count, 0);
        for (const group of rich.groups) assert.ok(group.owners.every(i => i >= 0 && i < page.notes.length));
    });
}

test('ink accents are selective and monochrome; disabled accents leave geometry static', () => {
    for (const language of languages) {
        const definition = load(language).default;
        const props = { ...defaults(language), midiTrackId: 'midi', motionAmount: 0, transition: 'none', inkColor: '#29252180', accentColor: '#2468A0FF' };
        const ctx = context([note(60, .3, 1)]);
        const ink = frame(definition, props, ctx, .6);
        assert.ok(colors(ink).every(c => c === props.inkColor));
        const off = { ...props, accentMode: 'none' };
        assert.deepEqual(frame(definition, off, ctx, .1), frame(definition, off, ctx, .6));
        assert.notDeepEqual(ink, frame(definition, off, ctx, .6), `${language} ink accent appears`);
        const spot = frame(definition, { ...props, accentMode: 'spot' }, ctx, .6);
        assert.ok(colors(spot).some(c => c.toLowerCase() === '#2468a080'));
        assert.ok(colors(spot).some(c => c === props.inkColor));
        const invisible = frame(definition, { ...props, accentMode: 'spot', inkColor: '#29252100' }, ctx, .6);
        assert.ok(colors(invisible).every(c => c.endsWith('00')));
    }
});

test('phrase layers overlap around boundaries and use at most two pages', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi' }, ctx = context(twoPhrases);
    assert.deepEqual(readPhraseLayers(props, 7, ctx).map(l => l.page.index), [0]);
    assert.deepEqual(readPhraseLayers(props, 7.8, ctx).map(l => l.page.index), [0, 1]);
    assert.deepEqual(readPhraseLayers(props, 8, ctx).map(l => l.page.index), [0, 1]);
    assert.deepEqual(readPhraseLayers(props, 8.2, ctx).map(l => l.page.index), [0, 1]);
    assert.deepEqual(readPhraseLayers(props, 8.5, ctx).map(l => l.page.index), [1]);
    assert.equal(readPhraseLayers({ ...props, transition: 'none' }, 8, ctx).length, 1);
    assert.equal(readPhraseLayers({ ...props, transitionDuration: 0 }, 8, ctx).length, 1);
    for (const t of [-1, 0, .2, 7.99, 8, 100]) assert.ok(readPhraseLayers(props, t, ctx).length <= 2);
});

test('stagger is per primitive, exits accelerate and entries decelerate', () => {
    assert.ok(easeIn(.25) < .25);
    assert.ok(easeOut(.25) > .25);
    assert.ok(easeIn(.75) - easeIn(.5) > easeIn(.5) - easeIn(.25));
    assert.ok(easeOut(.75) - easeOut(.5) < easeOut(.5) - easeOut(.25));
    const s = settings({}), window = { boundary: 8, duration: .8 };
    const firstIn = transitionFrame({ enter: window }, 0, s, 7.8), lastIn = transitionFrame({ enter: window }, 1, s, 7.8);
    const firstOut = transitionFrame({ exit: window }, 0, s, 7.8), lastOut = transitionFrame({ exit: window }, 1, s, 7.8);
    assert.ok(firstIn.visibility > lastIn.visibility);
    assert.ok(firstOut.visibility < lastOut.visibility);
    assert.ok(firstIn.shift < 0 && firstOut.shift > 0);
    assert.equal(transitionFrame({ enter: window }, 1, s, 8.5).visibility, 1);
    assert.equal(transitionFrame({ exit: window }, 1, s, 8.5).visibility, 0);
});

test('tempo changes and very short phrases constrain windows without triple overlap', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi', pageBars: 1, transitionDuration: 3 };
    const layers = readPhraseLayers(props, 4, context(twoPhrases, { tempoChange: true }));
    assert.deepEqual(layers.map(l => l.page.index), [1, 2]);
    assert.equal(layers[0].lifecycle.exit.duration, 1);
    const fast = context(twoPhrases);
    fast.timing.secondsToBeats = t => ({ ok: true, value: t * 100 });
    fast.timing.beatsToSeconds = t => ({ ok: true, value: t / 100 });
    for (let t = 0; t < .2; t += .002) {
        const phases = readPhraseLayers(props, t, fast);
        assert.ok(phases.length <= 2);
        for (const l of phases) for (const w of Object.values(l.lifecycle)) if (w) assert.ok(w.duration <= .02000001);
    }
});

for (const transition of ['slide', 'scale', 'draw']) {
    test(`${transition}: compound primitives transition separately and random-access rendering is reproducible`, () => {
        const props = { ...defaults('decesare'), midiTrackId: 'midi', transition, visualDensity: 3 };
        const definition = load('decesare').default, cache = definition.createResources({}), ctx = context(twoPhrases);
        const first = frame(definition, props, ctx, 7.85, cache);
        assert.equal(cache.pages.size, 2);
        frame(definition, props, ctx, 8.6, cache);
        assert.equal(cache.pages.size, 1);
        assert.deepEqual(frame(definition, props, ctx, 7.85, cache), first);
        const moving = flatten(first).filter(o => !primitive(o) && !(o instanceof ClipLayer));
        if (transition === 'slide') assert.ok(moving.some(o => o.opacity > 0 && o.opacity < 1));
        if (transition === 'scale') assert.ok(moving.some(o => o.scaleX > 0 && o.scaleX < 1));
        if (transition === 'draw') assert.ok(flatten(first).filter(o => o instanceof ClipLayer).length > 1);
        const opaque = { ...props, backgroundColor: '#EFE9D8FF', showPlayhead: true };
        assert.ok(flatten(frame(definition, opaque, ctx, 8)).filter(primitive).length <= MAX_PRIMITIVES);
    });
}

test('draw transitions trim outlines and arc angles and wipe text and fills', () => {
    const page = { index: 0, notes: [], start: 0, end: 16, startBeat: 0, beats: 32 };
    const drawing = { width: 200, height: 100, count: 4, groups: [{ owners: [], pivot: [0, 0], phase: 0, motion: 'none', shapes: [
        { kind: 'line', a: [10, 10], b: [90, 10] },
        { kind: 'circle', center: [30, 30], radius: 10 },
        { kind: 'rect', x: 50, y: 20, w: 40, h: 20, fill: true },
        { kind: 'text', x: 10, y: 70, size: 10, text: 'SCORE' },
    ] }] };
    const s = settings({ transition: 'draw', transitionStagger: 0, width: 200, height: 100 });
    const output = renderComposition([{ drawing, page, lifecycle: { enter: { boundary: 8, duration: 1 } } }], s, 8, .5);
    const all = flatten(output);
    assert.equal(all.filter(o => o instanceof ClipLayer).length, 3);
    assert.ok(all.some(o => o instanceof Arc && o.endAngle > 0 && o.endAngle < Math.PI * 2));
    assert.ok(all.some(o => o instanceof Poly && o.points.at(-1)[0] < 40));
});

test('seeded panel rectangles fit, respect gutters, and cover all languages before repeats', () => {
    for (const seed of [1, 1998, 357]) {
        const layout = panelLayout(1280, 720, 12, 10, 12, seed);
        assert.equal(layout.length, 10);
        assert.equal(new Set(layout.map(p => p.language)).size, 10);
        assert.deepEqual(layout, panelLayout(1280, 720, 12, 10, 12, seed));
        for (const [i, a] of layout.entries()) {
            assert.ok(a.w >= 96 && a.h >= 64);
            assert.ok(a.x >= 12 && a.y >= 12 && a.x + a.w <= 1268.00001 && a.y + a.h <= 708.00001);
            for (const b of layout.slice(i + 1)) assert.ok(a.x + a.w + 11.999 <= b.x || b.x + b.w + 11.999 <= a.x || a.y + a.h + 11.999 <= b.y || b.y + b.h + 11.999 <= a.y);
        }
    }
    assert.equal(panelLayout(100, 80, 12, 10, 12, 1).length, 1);
    assert.equal(panelLayout(1280, 720, 12, 1, 12, 1).length, 1);
    const sixteen = panelLayout(1920, 1080, 12, 16, 12, 1);
    assert.equal(sixteen.length, 16);
    assert.equal(new Set(sixteen.slice(0, 10).map(p => p.language)).size, 10);
    assert.notDeepEqual(panelLayout(1280, 720, 12, 10, 12, 1), panelLayout(1280, 720, 12, 10, 12, 2));
});

test('onset partitioning is round-robin, keeps chords together, and retains normalized positions', () => {
    const props = { ...defaults('cage'), midiTrackId: 'midi' };
    const page = readPage(props, 1, context([note(60, 0, 1), note(64, .0009, 1), note(67, .0018, 1), note(72, 2, 1), note(50, 3, 1), note(55, 3, 1)]));
    const partitions = partitionPage(page, 3);
    assert.deepEqual(partitions.map(p => p.notes.map(n => n.pitch)), [[60, 64, 50, 55], [67], [72]]);
    assert.equal(partitions.flatMap(p => p.notes).length, page.notes.length);
    for (const p of partitions) for (const n of p.notes) assert.equal(page.notes.find(original => original.id === n.id), n);
    assert.ok(page.notes.some(n => n.y === 0));
    assert.ok(page.notes.some(n => n.y === 1));
});

test('Score Panels reads each phrase once, keeps the layout stable, and refreshes content after edits', () => {
    const definition = load('panels').default, props = { ...defaults('panels'), midiTrackId: 'midi' };
    const ctx = context(twoPhrases), originalSelect = ctx.timeline.selectNotes;
    let queries = 0;
    ctx.timeline.selectNotes = args => { queries++; return originalSelect(args); };
    const cache = definition.createResources({});
    frame(definition, props, ctx, 2, cache);
    assert.equal(queries, 1);
    const layout = cache.panels, drawing = cache.pages.get(0).drawings;
    frame(definition, { ...props, inkColor: '#112233FF' }, ctx, 2, cache);
    assert.equal(cache.pages.get(0).drawings, drawing);
    queries = 0;
    frame(definition, props, ctx, 8, cache);
    assert.equal(queries, 2);
    assert.equal(cache.pages.size, 2);
    assert.equal(cache.panels, layout);
    const before = frame(definition, props, ctx, 8, cache);
    frame(definition, props, ctx, 16, cache);
    assert.deepEqual(frame(definition, props, ctx, 8, cache), before);
    frame(definition, props, context([note(60, 0, 1)]), 2, cache);
    assert.notEqual(cache.pages.get(0).drawings, drawing);
    frame(definition, { ...props, width: 600 }, ctx, 2, cache);
    assert.notEqual(cache.panels, layout);
    definition.disposeResources(cache, {});
    assert.equal(cache.pages.size, 0);
});

test('Score Panels budget covers density, both phrase layers, backgrounds, and dividers', () => {
    const definition = load('panels').default;
    const notes = [...fixtures.dense, ...fixtures.dense.map(n => ({ ...n, startSeconds: n.startSeconds + 8, endSeconds: n.endSeconds + 8 }))];
    const props = { ...defaults('panels'), midiTrackId: 'midi', panelCount: 16, visualDensity: 4, density: 1, width: 1920, height: 1080, showDividers: true, showPlayhead: true, backgroundColor: '#FAF5EDFF', transition: 'draw' };
    const output = frame(definition, props, context(notes), 8);
    assert.ok(flatten(output).filter(primitive).length <= load('panels').PANEL_BUDGET);
    assert.equal(output[0].width, 1920);
    assert.equal(output[1].clipWidth, 1920);
    assert.deepEqual(frame(definition, props, {}, 1), []);
    const silent = frame(definition, { ...props, showDividers: false, showPlayhead: false, backgroundColor: '#00000000' }, context([]), 2);
    assert.equal(flatten(silent).filter(o => primitive(o) && o !== silent[0]).length, 0);
});
