import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

class Rectangle {
  constructor(x, y, width, height, options = {}) {
    Object.assign(this, { x, y, width, height });
    this.fillColor =
      options.fillColor === undefined ? "#FFFFFF" : options.fillColor;
  }

  setLayoutParticipation(value) {
    this.layoutParticipation = value;
    return this;
  }
}

class Arc {
  constructor(x, y, radius, options = {}) {
    Object.assign(this, {
      x,
      y,
      radius,
      fillColor: options.fillColor,
      opacity: 1,
    });
  }

  setLayoutParticipation(value) {
    this.layoutParticipation = value;
    return this;
  }
}

const source = readFileSync(
  new URL("../particles-pattern.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
const require = createRequire(import.meta.url);
const sdk = { definePluginElement: (definition) => definition };
const render = { Arc, Rectangle };
new Function("require", "module", "exports", compiled)(
  (specifier) => {
    if (specifier === "@mvmnt-app/plugin-sdk") return sdk;
    if (specifier === "@mvmnt-app/plugin-sdk/render") return render;
    return require(specifier);
  },
  module,
  module.exports,
);

test("Particles Pattern keeps its layout bounds transparent and renders visible particles", () => {
  const props = Object.fromEntries(
    module.exports.particlesPattern.schema.tabs[0].groups.flatMap((group) =>
      group.properties.map((property) => [property.key, property.default]),
    ),
  );
  const objects = module.exports.particlesPattern.render({
    props,
    time: { seconds: 0 },
  });

  assert.equal(objects[0].fillColor, null);
  assert.equal(objects[0].layoutParticipation, "include");
  assert.equal(objects.length, props.particleCount + 1);
  assert.ok(
    objects.slice(1).every((particle) => particle.fillColor === "#FFFFFF"),
  );
});
