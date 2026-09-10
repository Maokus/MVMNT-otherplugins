import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  Arc,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";

const MAX_PARTICLES = 64;
const TAU = Math.PI * 2;

function randomAt(seed: number, index: number): number {
  let value = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b9);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const particleBurst = definePluginElement({
  type: "particle-burst",
  metadata: {
    name: "MIDI Particle Burst",
    description:
      "Typed-array particles spawned deterministically by MIDI note onsets",
    category: "Simulation Pack 1",
  },
  schema: {
    tabs: [
      tab.content([
        group("input", "Input", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number("seed", "Seed", 1, { step: 1 }),
        ]),
        group("simulation", "Simulation", [
          prop.number("particlesPerNote", "Particles Per Note", 8, {
            min: 1,
            max: 32,
            step: 1,
          }),
          prop.number("launchSpeed", "Launch Speed", 180, { min: 0, max: 800 }),
          prop.number("gravity", "Gravity", 220, { min: -1000, max: 1000 }),
          prop.number("drag", "Drag", 0.6, { min: 0, max: 10 }),
          prop.number("lifetime", "Lifetime", 1.5, { min: 0.1, max: 8 }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.number("radius", "Radius", 7, { min: 1, max: 40 }),
          prop.colorAlpha("color", "Color", "#F97316FF"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize({ seed }) {
      const ages = new Float32Array(MAX_PARTICLES);
      ages.fill(-1);
      return {
        seed: seed | 0,
        nextSlot: 0,
        positions: new Float32Array(MAX_PARTICLES * 2),
        velocities: new Float32Array(MAX_PARTICLES * 2),
        ages,
      };
    },
    step({ state, props, time, context, deltaSeconds }) {
      const positions = new Float32Array(state.positions);
      const velocities = new Float32Array(state.velocities);
      const ages = new Float32Array(state.ages);
      const drag = Math.exp(-clamp(props.drag, 0, 10) * deltaSeconds);
      const gravity = clamp(props.gravity, -1000, 1000);
      const lifetime = clamp(props.lifetime, 0.1, 8);

      for (let index = 0; index < MAX_PARTICLES; index += 1) {
        if (ages[index] < 0) continue;
        const offset = index * 2;
        ages[index] += deltaSeconds;
        if (ages[index] >= lifetime) {
          ages[index] = -1;
          continue;
        }
        velocities[offset] *= drag;
        velocities[offset + 1] =
          velocities[offset + 1] * drag + gravity * deltaSeconds;
        positions[offset] += velocities[offset] * deltaSeconds;
        positions[offset + 1] += velocities[offset + 1] * deltaSeconds;
      }

      const notes = props.midiTrackId
        ? context.noteOns([props.midiTrackId])
        : undefined;
      const noteCount = notes?.ok ? notes.value.length : 0;
      const spawnCount =
        noteCount * Math.round(clamp(props.particlesPerNote, 1, 32));
      const launchSpeed = clamp(props.launchSpeed, 0, 800);
      let nextSlot = state.nextSlot;

      for (let spawned = 0; spawned < spawnCount; spawned += 1) {
        const slot = nextSlot % MAX_PARTICLES;
        const offset = slot * 2;
        const randomIndex = time.stepIndex * MAX_PARTICLES + spawned;
        const angle = randomAt(state.seed, randomIndex) * TAU;
        const speed =
          launchSpeed *
          (0.55 + randomAt(state.seed ^ 0x51ed270b, randomIndex) * 0.45);
        positions[offset] = 0;
        positions[offset + 1] = 0;
        velocities[offset] = Math.cos(angle) * speed;
        velocities[offset + 1] = Math.sin(angle) * speed;
        ages[slot] = 0;
        nextSlot += 1;
      }

      return { seed: state.seed, nextSlot, positions, velocities, ages };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(-250, -250, 500, 500, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      particles: Array.from(
        { length: MAX_PARTICLES },
        () => new Arc(0, 0, 7, { layoutParticipation: "exclude" }),
      ),
    };
  },
  render({ props, resources, simulation }) {
    const objects: RenderObject[] = [resources.bounds];
    const lifetime = clamp(props.lifetime, 0.1, 8);
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      const age = simulation.state.ages[index];
      if (age < 0 || age >= lifetime) continue;
      const particle = resources.particles[index];
      const offset = index * 2;
      particle
        .setPosition(
          simulation.state.positions[offset],
          simulation.state.positions[offset + 1],
        )
        .setRadius(props.radius)
        .setFill(props.color)
        .setOpacity(1 - age / lifetime);
      objects.push(particle);
    }
    return objects;
  },
});

export default particleBurst;
