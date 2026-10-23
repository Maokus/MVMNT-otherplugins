import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import {
  Arc,
  Rectangle,
  type RenderObject,
} from "@mvmnt-app/plugin-sdk/render";
import { clampNumber, resolveJarBounds, timeUnitIndex } from "./ball-jar-logic";
import { parseTimeUnitBars, TIME_UNIT_OPTIONS } from "./musical-grid";

const MAX_BALLS = 128;

function clearBalls(active: Uint8Array): void {
  active.fill(0);
}

export const ballJar = definePluginElement({
  type: "ball-jar",
  metadata: {
    name: "Ball Jar",
    description:
      "Drops a simulated ball into an open jar for every MIDI note onset.",
    category: "us.maok.sillyideas1",
  },
  schema: {
    tabs: [
      tab.content([
        group("source", "MIDI Source", [
          prop.midiTrack("midiTrackId", "MIDI Track"),
          prop.number("seed", "Seed", 1, { step: 1 }),
          prop.select("timeUnitBars", "Clear Every", "1", TIME_UNIT_OPTIONS),
          prop.number("maxBalls", "Maximum Balls", 64, {
            min: 1,
            max: MAX_BALLS,
            step: 1,
          }),
        ]),
        group("jar", "Jar", [
          prop.number("width", "Width (px)", 420, {
            min: 1,
            step: 1,
          }),
          prop.number("height", "Height (px)", 420, {
            min: 1,
            step: 1,
          }),
          prop.number("wallThickness", "Wall Thickness (px)", 12, {
            min: 1,
            step: 1,
          }),
          prop.number("ballRadius", "Ball Radius (px)", 14, {
            min: 2,
            step: 1,
          }),
        ]),
        group("physics", "Physics", [
          prop.number("gravity", "Gravity", 900, {
            min: 0,
            step: 10,
          }),
          prop.number("airDrag", "Air Drag", 0.12, {
            min: 0,
            step: 0.01,
          }),
          prop.number("restitution", "Bounciness", 0.35, {
            min: 0,
            max: 1,
            step: 0.01,
          }),
          prop.number("friction", "Floor Friction", 4, {
            min: 0,
            step: 0.1,
          }),
          prop.number("dropSpeed", "Drop Speed", 40, {
            min: 0,
            step: 5,
          }),
        ]),
      ]),
      tab.appearance([
        group("appearance", "Appearance", [
          prop.colorAlpha("jarColor", "Jar Color", "#E2E8F0FF"),
          prop.colorAlpha("ballColor", "Ball Color", "#38BDF8FF"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize() {
      return {
        timeUnit: -1,
        nextSlot: 0,
        active: new Uint8Array(MAX_BALLS),
        positions: new Float32Array(MAX_BALLS * 2),
        velocities: new Float32Array(MAX_BALLS * 2),
      };
    },
    step({ state, props, time, context, deltaSeconds }) {
      const active = new Uint8Array(state.active);
      const positions = new Float32Array(state.positions);
      const velocities = new Float32Array(state.velocities);
      const width = clampNumber(props.width, 1, Infinity, 420);
      const height = clampNumber(props.height, 1, Infinity, 420);
      const wallThickness = clampNumber(
        props.wallThickness,
        1,
        Math.min(width, height) / 3,
        12,
      );
      const radius = clampNumber(
        props.ballRadius,
        2,
        Math.max(2, (width - wallThickness * 2) / 2),
        14,
      );
      const maxBalls = Math.round(
        clampNumber(props.maxBalls, 1, MAX_BALLS, 64),
      );
      const gravity = clampNumber(props.gravity, 0, Infinity, 900);
      const restitution = clampNumber(props.restitution, 0, 1, 0.35);
      const drag = Math.exp(
        -clampNumber(props.airDrag, 0, Infinity, 0.12) * deltaSeconds,
      );
      const floorFriction = Math.exp(
        -clampNumber(props.friction, 0, Infinity, 4) * deltaSeconds,
      );
      const dropSpeed = clampNumber(props.dropSpeed, 0, Infinity, 40);
      const signature = context.timing?.getTimeSignature();
      const stepEndBeat = context.timing?.secondsToBeats(
        time.seconds + deltaSeconds,
      );
      const bars = parseTimeUnitBars(props.timeUnitBars);
      const currentTimeUnit =
        signature?.ok && stepEndBeat?.ok
          ? timeUnitIndex(
              stepEndBeat.value,
              signature.value.numerator,
              signature.value.denominator,
              bars,
            )
          : state.timeUnit;
      let nextSlot = state.nextSlot;
      if (currentTimeUnit !== state.timeUnit) {
        clearBalls(active);
        nextSlot = 0;
      }

      for (let index = 0; index < maxBalls; index += 1) {
        if (!active[index]) continue;
        const offset = index * 2;
        let velocityX = velocities[offset] * drag;
        let velocityY = velocities[offset + 1] * drag + gravity * deltaSeconds;
        let x = positions[offset] + velocityX * deltaSeconds;
        let y = positions[offset + 1] + velocityY * deltaSeconds;
        const bounded = resolveJarBounds(
          x,
          y,
          velocityX,
          velocityY,
          width,
          height,
          wallThickness,
          radius,
          restitution,
        );
        x = bounded.x;
        y = bounded.y;
        velocityX = bounded.velocityX;
        velocityY = bounded.velocityY;
        const floorY = height - wallThickness - radius;
        if (Math.abs(y - floorY) < 1e-4) {
          velocityX *= floorFriction;
          if (Math.abs(velocityY) < 8) velocityY = 0;
        }
        positions[offset] = x;
        positions[offset + 1] = y;
        velocities[offset] = velocityX;
        velocities[offset + 1] = velocityY;
      }

      for (let iteration = 0; iteration < 2; iteration += 1) {
        for (let first = 0; first < maxBalls; first += 1) {
          if (!active[first]) continue;
          for (let second = first + 1; second < maxBalls; second += 1) {
            if (!active[second]) continue;
            const firstOffset = first * 2;
            const secondOffset = second * 2;
            const deltaX = positions[secondOffset] - positions[firstOffset];
            const deltaY =
              positions[secondOffset + 1] - positions[firstOffset + 1];
            const minimumDistance = radius * 2;
            const distanceSquared = deltaX * deltaX + deltaY * deltaY;
            if (distanceSquared >= minimumDistance * minimumDistance) continue;
            const distance = Math.sqrt(Math.max(distanceSquared, 1e-8));
            const normalX =
              distanceSquared > 1e-8
                ? deltaX / distance
                : first % 2 === 0
                  ? 1
                  : -1;
            const normalY = distanceSquared > 1e-8 ? deltaY / distance : 0;
            const correction = (minimumDistance - distance) / 2;
            positions[firstOffset] -= normalX * correction;
            positions[firstOffset + 1] -= normalY * correction;
            positions[secondOffset] += normalX * correction;
            positions[secondOffset + 1] += normalY * correction;
            const relativeVelocity =
              (velocities[secondOffset] - velocities[firstOffset]) * normalX +
              (velocities[secondOffset + 1] - velocities[firstOffset + 1]) *
                normalY;
            if (relativeVelocity < 0) {
              const impulse = (-(1 + restitution) * relativeVelocity) / 2;
              velocities[firstOffset] -= impulse * normalX;
              velocities[firstOffset + 1] -= impulse * normalY;
              velocities[secondOffset] += impulse * normalX;
              velocities[secondOffset + 1] += impulse * normalY;
            }
          }
        }
      }

      for (let index = 0; index < maxBalls; index += 1) {
        if (!active[index]) continue;
        const offset = index * 2;
        const bounded = resolveJarBounds(
          positions[offset],
          positions[offset + 1],
          velocities[offset],
          velocities[offset + 1],
          width,
          height,
          wallThickness,
          radius,
          restitution,
        );
        positions[offset] = bounded.x;
        positions[offset + 1] = bounded.y;
        velocities[offset] = bounded.velocityX;
        velocities[offset + 1] = bounded.velocityY;
      }

      const noteOns = props.midiTrackId
        ? context.noteOns([props.midiTrackId])
        : undefined;
      const notes = noteOns?.ok ? noteOns.value : [];
      for (const [noteIndex, note] of notes.entries()) {
        const noteBeat = context.timing?.secondsToBeats(note.startSeconds);
        const noteTimeUnit =
          signature?.ok && noteBeat?.ok
            ? timeUnitIndex(
                noteBeat.value,
                signature.value.numerator,
                signature.value.denominator,
                bars,
              )
            : currentTimeUnit;
        if (noteTimeUnit !== currentTimeUnit) continue;
        const slot = nextSlot % maxBalls;
        const offset = slot * 2;
        const horizontalRange = Math.max(
          0,
          width - wallThickness * 2 - radius * 2,
        );
        positions[offset] =
          wallThickness +
          radius +
          context.random.float(`ball-${noteIndex}-x`) * horizontalRange;
        positions[offset + 1] = -radius;
        velocities[offset] =
          (context.random.float(`ball-${noteIndex}-vx`) - 0.5) * dropSpeed;
        velocities[offset + 1] = dropSpeed;
        active[slot] = 1;
        nextSlot += 1;
      }

      for (let index = maxBalls; index < MAX_BALLS; index += 1)
        active[index] = 0;
      return {
        timeUnit: currentTimeUnit,
        nextSlot,
        active,
        positions,
        velocities,
      };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(0, -120, 420, 540, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      leftWall: new Rectangle(0, 0, 12, 420, {
        layoutParticipation: "exclude",
      }),
      bottomWall: new Rectangle(0, 408, 420, 12, {
        layoutParticipation: "exclude",
      }),
      rightWall: new Rectangle(408, 0, 12, 420, {
        layoutParticipation: "exclude",
      }),
      balls: Array.from(
        { length: MAX_BALLS },
        () =>
          new Arc(0, 0, 14, {
            startAngle: 0,
            endAngle: Math.PI * 2,
            layoutParticipation: "exclude",
          }),
      ),
    };
  },
  render({ props, resources, simulation }) {
    const width = clampNumber(props.width, 1, Infinity, 420);
    const height = clampNumber(props.height, 1, Infinity, 420);
    const wallThickness = clampNumber(
      props.wallThickness,
      1,
      Math.min(width, height) / 3,
      12,
    );
    const radius = clampNumber(
      props.ballRadius,
      2,
      Math.max(2, (width - wallThickness * 2) / 2),
      14,
    );
    const maxBalls = Math.round(clampNumber(props.maxBalls, 1, MAX_BALLS, 64));
    resources.bounds
      .setPosition(0, -radius * 3)
      .setSize(width, height + radius * 3);
    resources.leftWall
      .setPosition(0, 0)
      .setSize(wallThickness, height)
      .setFill(props.jarColor);
    resources.bottomWall
      .setPosition(0, height - wallThickness)
      .setSize(width, wallThickness)
      .setFill(props.jarColor);
    resources.rightWall
      .setPosition(width - wallThickness, 0)
      .setSize(wallThickness, height)
      .setFill(props.jarColor);
    const objects: RenderObject[] = [
      resources.bounds,
      resources.leftWall,
      resources.bottomWall,
      resources.rightWall,
    ];
    for (let index = 0; index < maxBalls; index += 1) {
      if (!simulation.state.active[index]) continue;
      const offset = index * 2;
      const ball = resources.balls[index];
      ball
        .setPosition(
          simulation.state.positions[offset],
          simulation.state.positions[offset + 1],
        )
        .setRadius(radius)
        .setFill(props.ballColor);
      objects.push(ball);
    }
    return objects;
  },
});

export default ballJar;
