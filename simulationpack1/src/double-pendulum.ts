import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Arc, Poly, Rectangle } from "@mvmnt-app/plugin-sdk/render";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

export const doublePendulum = definePluginElement({
  type: "double-pendulum",
  metadata: {
    name: "Double Pendulum",
    description: "A simple deterministic double-pendulum simulation",
    category: "Simulation Pack 1",
  },
  schema: {
    tabs: [
      tab.content([
        group("initial", "Initial State", [
          prop.number("seed", "Seed", 1, { step: 1 }),
          prop.number("angle1", "Upper Angle", 115, {
            min: -179,
            max: 179,
          }),
          prop.number("angle2", "Lower Angle", 70, {
            min: -179,
            max: 179,
          }),
        ]),
        group("physics", "Physics", [
          prop.number("length1", "Upper Length", 160, {
            min: 20,
            max: 300,
          }),
          prop.number("length2", "Lower Length", 140, {
            min: 20,
            max: 300,
          }),
          prop.number("mass1", "Upper Mass", 1, { min: 0.1, max: 10 }),
          prop.number("mass2", "Lower Mass", 1, { min: 0.1, max: 10 }),
          prop.number("gravity", "Gravity", 980, { min: 0, max: 3000 }),
          prop.number("damping", "Damping", 0.03, {
            min: 0,
            max: 2,
            step: 0.01,
          }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.number("bobRadius", "Bob Radius", 20, {
            min: 2,
            max: 60,
          }),
          prop.number("rodWidth", "Rod Width", 5, { min: 1, max: 20 }),
          prop.colorAlpha("rodColor", "Rod Color", "#CBD5E1FF"),
          prop.colorAlpha("upperColor", "Upper Bob", "#38BDF8FF"),
          prop.colorAlpha("lowerColor", "Lower Bob", "#F97316FF"),
          prop.colorAlpha("pivotColor", "Pivot", "#F8FAFCFF"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize: ({ props }) => ({
      angle1: radians(clamp(props.angle1, -179, 179)),
      angle2: radians(clamp(props.angle2, -179, 179)),
      velocity1: 0,
      velocity2: 0,
    }),
    step({ state, props, deltaSeconds }) {
      const length1 = clamp(props.length1, 20, 300);
      const length2 = clamp(props.length2, 20, 300);
      const mass1 = clamp(props.mass1, 0.1, 10);
      const mass2 = clamp(props.mass2, 0.1, 10);
      const gravity = clamp(props.gravity, 0, 3000);
      const difference = state.angle1 - state.angle2;
      const denominator =
        2 * mass1 + mass2 - mass2 * Math.cos(2 * difference);

      const acceleration1 =
        (-gravity * (2 * mass1 + mass2) * Math.sin(state.angle1) -
          mass2 * gravity * Math.sin(state.angle1 - 2 * state.angle2) -
          2 *
            Math.sin(difference) *
            mass2 *
            (state.velocity2 * state.velocity2 * length2 +
              state.velocity1 *
                state.velocity1 *
                length1 *
                Math.cos(difference))) /
        (length1 * denominator);
      const acceleration2 =
        (2 *
          Math.sin(difference) *
          (state.velocity1 * state.velocity1 * length1 * (mass1 + mass2) +
            gravity * (mass1 + mass2) * Math.cos(state.angle1) +
            state.velocity2 *
              state.velocity2 *
              length2 *
              mass2 *
              Math.cos(difference))) /
        (length2 * denominator);

      const damping = Math.exp(
        -clamp(props.damping, 0, 2) * deltaSeconds,
      );
      const velocity1 =
        (state.velocity1 + acceleration1 * deltaSeconds) * damping;
      const velocity2 =
        (state.velocity2 + acceleration2 * deltaSeconds) * damping;
      return {
        angle1: state.angle1 + velocity1 * deltaSeconds,
        angle2: state.angle2 + velocity2 * deltaSeconds,
        velocity1,
        velocity2,
      };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(-350, -50, 700, 700, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      rods: new Poly([], {
        fillColor: null,
        layoutParticipation: "exclude",
      })
        .setClosed(false)
        .setLineCap("round"),
      pivot: new Arc(0, 0, 7, { layoutParticipation: "exclude" }),
      upperBob: new Arc(0, 0, 20, { layoutParticipation: "exclude" }),
      lowerBob: new Arc(0, 0, 20, { layoutParticipation: "exclude" }),
    };
  },
  render({ props, resources, simulation }) {
    const length1 = clamp(props.length1, 20, 300);
    const length2 = clamp(props.length2, 20, 300);
    const upperX = Math.sin(simulation.state.angle1) * length1;
    const upperY = Math.cos(simulation.state.angle1) * length1;
    const lowerX = upperX + Math.sin(simulation.state.angle2) * length2;
    const lowerY = upperY + Math.cos(simulation.state.angle2) * length2;
    const radius = clamp(props.bobRadius, 2, 60);

    resources.rods
      .setPoints([
        { x: 0, y: 0 },
        { x: upperX, y: upperY },
        { x: lowerX, y: lowerY },
      ])
      .setStroke(props.rodColor, clamp(props.rodWidth, 1, 20));
    resources.pivot.setFill(props.pivotColor);
    resources.upperBob
      .setPosition(upperX, upperY)
      .setRadius(radius * Math.sqrt(clamp(props.mass1, 0.1, 10)))
      .setFill(props.upperColor);
    resources.lowerBob
      .setPosition(lowerX, lowerY)
      .setRadius(radius * Math.sqrt(clamp(props.mass2, 0.1, 10)))
      .setFill(props.lowerColor);
    return [
      resources.bounds,
      resources.rods,
      resources.pivot,
      resources.upperBob,
      resources.lowerBob,
    ];
  },
});

export default doublePendulum;
