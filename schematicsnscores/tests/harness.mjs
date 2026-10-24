import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as sdk from '@mvmnt-app/plugin-sdk';

export class EmptyRenderObject {
    constructor(x = 0, y = 0) { Object.assign(this, { x, y, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, children: [] }); }
    setLayoutParticipation(value) { this.layoutParticipation = value; return this; }
    addChild(child) { this.children.push(child); return this; }
    setClosed(value) { this.closed = value; return this; }
    setLineJoin(value) { this.lineJoin = value; return this; }
    setLineCap(value) { this.lineCap = value; return this; }
}
export class Rectangle extends EmptyRenderObject {
    constructor(x, y, width, height, options) { super(x, y); Object.assign(this, { width, height }, options); }
}
export class ClipLayer extends EmptyRenderObject {
    constructor(clipWidth, clipHeight) { super(); Object.assign(this, { clipWidth, clipHeight }); }
}
export class Line extends EmptyRenderObject {
    constructor(x1, y1, x2, y2, options) { super(); Object.assign(this, { x1, y1, x2, y2 }, options); }
}
export class Arc extends EmptyRenderObject {
    constructor(x, y, radius, options) { super(x, y); Object.assign(this, { radius }, options); }
}
export class Poly extends EmptyRenderObject {
    constructor(points, options) { super(); Object.assign(this, { points }, options); }
}
export class Text extends EmptyRenderObject {
    constructor(x, y, text, font, options) { super(x, y); Object.assign(this, { text, font }, options); }
}
const render = { EmptyRenderObject, Rectangle, ClipLayer, Line, Arc, Poly, Text };
const cache = new Map();
const nativeRequire = createRequire(import.meta.url);
export function load(name) {
    const path = name.startsWith('/') ? name : fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url));
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const require = specifier => {
        if (specifier === '@mvmnt-app/plugin-sdk') return sdk;
        if (specifier === '@mvmnt-app/plugin-sdk/render') return render;
        if (specifier.startsWith('.')) return load(resolve(dirname(path), specifier + '.ts'));
        return nativeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
    return module.exports;
}
export const defaults = language => Object.fromEntries(load('controls').schema(language).tabs.flatMap(t => t.groups.flatMap(g => g.properties.map(p => [p.key, p.default]))));
export const ok = value => ({ ok: true, value });
export const fail = () => ({ ok: false, error: { code: 'RESOURCE_UNAVAILABLE', message: 'Test failure' } });

export function note(pitch, start, duration, velocity = 80, extra = {}) {
    return { trackId: 'midi', channel: 0, note: pitch, startSeconds: start, endSeconds: start + duration, durationSeconds: duration, velocity, ...extra };
}
export function context(notes = [], { tempoChange = false, signature = [4, 4] } = {}) {
    const secondsToBeats = seconds => tempoChange && seconds > 4 ? 8 + (seconds - 4) : seconds * 2;
    const beatsToSeconds = beats => tempoChange && beats > 8 ? 4 + (beats - 8) : beats / 2;
    return {
        timeline: {
            selectNotes({ trackIds, startSeconds, endSeconds }) {
                return ok(notes.filter(n => trackIds.includes(n.trackId) && n.startSeconds < endSeconds && n.endSeconds > startSeconds));
            },
        },
        timing: {
            secondsToBeats: seconds => ok(secondsToBeats(seconds)),
            beatsToSeconds: beats => ok(beatsToSeconds(beats)),
            getTimeSignature: () => ok({ numerator: signature[0], denominator: signature[1] }),
        },
    };
}
export function frame(definition, props, ctx, seconds, resources = definition.createResources({})) {
    return definition.render({ props, context: ctx, time: { seconds }, resources });
}
export const flatten = objects => objects.flatMap(o => [o, ...flatten(o.children ?? [])]);

export const fixtures = {
    sparse: [note(55, .3, 1.8, 40), note(68, 2.2, .5, 100), note(61, 4.5, 2, 65), note(76, 6.5, .9, 115)],
    chordal: Array.from({ length: 4 }, (_, beat) => [48, 55, 60, 64, 71].map((pitch, i) => note(pitch + beat % 2 * 2, beat * 2, 1.6, 50 + i * 15))).flat(),
    dense: Array.from({ length: 320 }, (_, i) => note(42 + i * 7 % 47, i * .024, .08 + i % 8 * .07, 30 + i * 13 % 98)),
};
