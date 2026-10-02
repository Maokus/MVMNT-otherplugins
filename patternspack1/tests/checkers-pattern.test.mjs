import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

class Rectangle {
    constructor(x, y, width, height, options = {}) {
        Object.assign(this, { x, y, width, height, fillColor: options.fillColor });
    }
    setLayoutParticipation(value) {
        this.layoutParticipation = value;
        return this;
    }
}

class ClipLayer {
    constructor(width, height) {
        Object.assign(this, { width, height, children: [] });
    }
    setLayoutParticipation(value) {
        this.layoutParticipation = value;
        return this;
    }
    addChild(child) {
        this.children.push(child);
    }
}

const source = readFileSync(new URL('../checkers-pattern.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', compiled)(
    (specifier) => {
        if (specifier === '@mvmnt-app/plugin-sdk') return { definePluginElement: (definition) => definition };
        if (specifier === '@mvmnt-app/plugin-sdk/render') return { ClipLayer, Rectangle };
        return require(specifier);
    },
    module,
    module.exports
);

const definition = module.exports.checkersPattern;
const defaults = Object.fromEntries(
    definition.schema.tabs[0].groups.flatMap((group) =>
        group.properties.map((property) => [property.key, property.default])
    )
);
const firstCheckerX = (seconds, props, integrate) =>
    definition.render({
        props,
        time: { seconds },
        context: { properties: { integrate } },
    })[1].children[0].x;

test('automated speed accumulates distance across a ramp and after seeking', () => {
    const props = { ...defaults, motionAngle: 0, motionSpeed: 140 };
    const integrate = (_key, { startSeconds, endSeconds }) => ({
        ok: true,
        value: 60 * (endSeconds - startSeconds) + 20 * (endSeconds ** 2 - startSeconds ** 2),
    });
    assert.equal(firstCheckerX(2, props, integrate), -120);
    assert.equal(firstCheckerX(1, props, integrate), -160);
    assert.equal(firstCheckerX(2, props, integrate), -120);
    assert.equal(firstCheckerX(-1, props, integrate), -200);
});

test('unavailable integration falls back to current speed', () => {
    const props = { ...defaults, motionAngle: 0, motionSpeed: 140 };
    assert.equal(firstCheckerX(2, props, () => ({ ok: false })), -200);
});
