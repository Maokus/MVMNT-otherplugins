import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Rectangle } from "@mvmnt-app/plugin-sdk/render";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function featureValue(
  value: number | readonly number[] | Readonly<Record<string, number>>,
): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value[0] ?? 0;
  return Object.values(value)[0] ?? 0;
}

export const audioInertia = definePluginElement({
  type: "audio-inertia",
  metadata: {
    name: "Audio Inertia",
    description: "A fixed-step inertial meter driven by analyzed RMS audio",
    category: "Simulation Pack 1",
  },
  schema: {
    tabs: [
      tab.content([
        group("input", "Input", [
          prop.audioTrack("audioTrackId", "Audio Track"),
          prop.number("seed", "Seed", 1, { step: 1 }),
        ]),
        group("response", "Response", [
          prop.number("gain", "Gain", 4, { min: 0, max: 20 }),
          prop.number("stiffness", "Stiffness", 55, { min: 1, max: 160 }),
          prop.number("damping", "Damping", 12, { min: 0, max: 40 }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.number("width", "Width", 120, { min: 10, max: 600 }),
          prop.number("height", "Height", 320, { min: 10, max: 1000 }),
          prop.colorAlpha("color", "Meter Color", "#38BDF8FF"),
          prop.colorAlpha("backgroundColor", "Background", "#0F172AFF"),
        ]),
      ]),
    ],
  },
  audioFeatureDemands(props) {
    return [{ id: "rms", trackId: props.audioTrackId, feature: "rms" }];
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize: ({ seed }) => ({
      level: ((seed | 0) & 15) / 1500,
      velocity: 0,
    }),
    step({ state, props, time, context, deltaSeconds }) {
      const sampled = props.audioTrackId
        ? context.audio?.sampleFeature({
            trackId: props.audioTrackId,
            feature: "rms",
            timeSeconds: time.seconds,
          })
        : undefined;
      const target = sampled?.ok
        ? clamp(featureValue(sampled.value.value) * props.gain, 0, 1)
        : 0;
      const stiffness = clamp(props.stiffness, 1, 160);
      const damping = clamp(props.damping, 0, 40);
      const acceleration =
        stiffness * (target - state.level) - damping * state.velocity;
      const velocity = state.velocity + acceleration * deltaSeconds;
      return {
        level: clamp(state.level + velocity * deltaSeconds, 0, 1),
        velocity,
      };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(0, 0, 120, 320, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      background: new Rectangle(0, 0, 120, 320, {
        layoutParticipation: "exclude",
      }),
      meter: new Rectangle(0, 320, 120, 0, {
        layoutParticipation: "exclude",
      }),
    };
  },
  render({ props, resources, simulation }) {
    const level = clamp(simulation.state.level, 0, 1);
    const meterHeight = props.height * level;
    resources.bounds.setSize(props.width, props.height);
    resources.background
      .setSize(props.width, props.height)
      .setFill(props.backgroundColor);
    resources.meter
      .setPosition(0, props.height - meterHeight)
      .setSize(props.width, meterHeight)
      .setFill(props.color);
    return [resources.bounds, resources.background, resources.meter];
  },
});

export default audioInertia;
