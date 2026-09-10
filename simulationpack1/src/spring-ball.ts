import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Arc, Line, Rectangle } from "@mvmnt-app/plugin-sdk/render";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const springBall = definePluginElement({
  type: "spring-ball",
  metadata: {
    name: "MIDI Spring Ball",
    description: "A fixed-step spring kicked by MIDI note onsets",
    category: "Simulation Pack 1",
  },
  schema: {
    tabs: [
      tab.content([
        group("input", "Input", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number("seed", "Seed", 1, { step: 1 }),
        ]),
        group("physics", "Physics", [
          prop.number("stiffness", "Stiffness", 35, { min: 1, max: 120 }),
          prop.number("damping", "Damping", 7, { min: 0, max: 30 }),
          prop.number("impulse", "MIDI Impulse", 220, {
            min: -1000,
            max: 1000,
          }),
          prop.number("travel", "Travel Scale", 1, { min: 0.1, max: 4 }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.number("radius", "Radius", 28, { min: 2, max: 100 }),
          prop.colorAlpha("color", "Ball Color", "#10B981FF"),
          prop.colorAlpha("guideColor", "Guide Color", "#64748B88"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize: ({ seed }) => ({
      position: 0,
      velocity: ((seed | 0) % 17) / 17,
    }),
    step({ state, props, context, deltaSeconds }) {
      const notes = props.midiTrackId
        ? context.noteOns([props.midiTrackId])
        : undefined;
      const impulse = notes?.ok
        ? notes.value.length * clamp(props.impulse, -1000, 1000)
        : 0;
      const stiffness = clamp(props.stiffness, 1, 120);
      const damping = clamp(props.damping, 0, 30);
      const acceleration =
        -stiffness * state.position - damping * state.velocity;
      const velocity = state.velocity + acceleration * deltaSeconds + impulse;
      return { position: state.position + velocity * deltaSeconds, velocity };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(-400, -100, 800, 200, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      guide: new Line(-300, 0, 300, 0, {
        layoutParticipation: "exclude",
      }),
      ball: new Arc(0, 0, 28, { layoutParticipation: "exclude" }),
    };
  },
  render({ props, resources, simulation }) {
    resources.guide.setStroke(props.guideColor, 2);
    resources.ball
      .setPosition(
        clamp(simulation.state.position * props.travel, -300, 300),
        0,
      )
      .setRadius(props.radius)
      .setFill(props.color);
    return [resources.bounds, resources.guide, resources.ball];
  },
});

export default springBall;
