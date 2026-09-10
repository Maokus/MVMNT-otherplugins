import { definePluginElement, group, prop, tab } from "@mvmnt-app/plugin-sdk";
import { Arc, Poly, Rectangle, Text } from "@mvmnt-app/plugin-sdk/render";

const GRAPH_WIDTH = 360;
const GRAPH_HEIGHT = 210;
const GRAPH_SAMPLES = 64;
const PANEL_GAP = 24;
const PANEL_TEXT_HEIGHT = 112;
const SCALE_MIN = -2;
const SCALE_MAX = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const excluded = { layoutParticipation: "exclude" as const };

export const bouncyBallLab = definePluginElement({
  type: "bouncy-ball-lab",
  metadata: {
    name: "Bouncy Ball Automation Lab",
    description:
      "A deterministic box simulation with an automation graph and property integral diagnostics",
    category: "Simulation Pack 1",
  },
  schema: {
    tabs: [
      tab.content([
        group("initial", "Initial State", [
          prop.number("seed", "Seed", 1, { step: 1 }),
          prop.number("initialSpeed", "Initial Speed", 260, {
            min: 0,
            max: 1200,
          }),
          prop.number("initialDirection", "Initial Direction", -35, {
            min: -180,
            max: 180,
          }),
        ]),
        group("physics", "Physics", [
          prop.number("gravityStrength", "Gravity Strength", 700, {
            min: 0,
            max: 3000,
          }),
          prop.number("gravityDirection", "Gravity Direction", 90, {
            min: -180,
            max: 180,
            description: "Degrees: 0 points right and 90 points down.",
          }),
          prop.number("gravityScale", "Automated Gravity Scale", 1, {
            min: SCALE_MIN,
            max: SCALE_MAX,
            step: 0.05,
            description:
              "Add keyframes to this value. It drives the simulation and the diagnostic graph.",
          }),
          prop.number("restitution", "Restitution", 0.88, {
            min: 0,
            max: 1.1,
            step: 0.01,
          }),
          prop.number("airDrag", "Air Drag", 0.05, {
            min: 0,
            max: 3,
            step: 0.01,
          }),
        ]),
        group("diagnostics", "Automation Diagnostics", [
          prop.number("graphWindow", "Graph Window", 6, {
            min: 0.25,
            max: 30,
            step: 0.25,
            description:
              "Seconds shown around the current time and used for the displayed integral.",
          }),
        ]),
      ]),
      tab.appearance([
        group("layout", "Layout", [
          prop.number("boxWidth", "Box Width", 480, {
            min: 120,
            max: 1200,
          }),
          prop.number("boxHeight", "Box Height", 360, {
            min: 120,
            max: 1000,
          }),
          prop.number("ballRadius", "Ball Radius", 24, {
            min: 4,
            max: 80,
          }),
        ]),
        group("colors", "Colors", [
          prop.colorAlpha("boxColor", "Box", "#0F172AFF"),
          prop.colorAlpha("borderColor", "Border", "#64748BFF"),
          prop.colorAlpha("collisionColor", "Collision Flash", "#FBBF24FF"),
          prop.colorAlpha("ballColor", "Ball", "#38BDF8FF"),
          prop.colorAlpha("gravityColor", "Gravity Arrow", "#F97316FF"),
          prop.colorAlpha("graphColor", "Graph", "#A78BFAFF"),
          prop.colorAlpha("textColor", "Text", "#E2E8F0FF"),
        ]),
      ]),
    ],
  },
  simulation: {
    stepSeconds: 1 / 120,
    initialize({ props, random }) {
      const width = clamp(props.boxWidth, 120, 1200);
      const height = clamp(props.boxHeight, 120, 1000);
      const radius = clamp(
        props.ballRadius,
        4,
        Math.max(4, Math.min(width, height) / 2 - 1),
      );
      const direction = radians(props.initialDirection);
      const speed = clamp(props.initialSpeed, 0, 1200);
      return {
        x: radius + random.float("initial-x") * (width - radius * 2),
        y: radius + random.float("initial-y") * (height - radius * 2),
        velocityX: Math.cos(direction) * speed,
        velocityY: Math.sin(direction) * speed,
        collisions: 0,
        lastCollisionStep: -1,
      };
    },
    step({ state, props, time, deltaSeconds }) {
      const width = clamp(props.boxWidth, 120, 1200);
      const height = clamp(props.boxHeight, 120, 1000);
      const radius = clamp(
        props.ballRadius,
        4,
        Math.max(4, Math.min(width, height) / 2 - 1),
      );
      const gravityDirection = radians(props.gravityDirection);
      const gravity =
        clamp(props.gravityStrength, 0, 3000) *
        clamp(props.gravityScale, SCALE_MIN, SCALE_MAX);
      const drag = Math.exp(-clamp(props.airDrag, 0, 3) * deltaSeconds);
      const restitution = clamp(props.restitution, 0, 1.1);

      let velocityX =
        (state.velocityX +
          Math.cos(gravityDirection) * gravity * deltaSeconds) *
        drag;
      let velocityY =
        (state.velocityY +
          Math.sin(gravityDirection) * gravity * deltaSeconds) *
        drag;
      let x = state.x + velocityX * deltaSeconds;
      let y = state.y + velocityY * deltaSeconds;
      let collisions = state.collisions;
      let collided = false;

      if (x < radius) {
        x = radius;
        velocityX = Math.abs(velocityX) * restitution;
        collisions += 1;
        collided = true;
      } else if (x > width - radius) {
        x = width - radius;
        velocityX = -Math.abs(velocityX) * restitution;
        collisions += 1;
        collided = true;
      }
      if (y < radius) {
        y = radius;
        velocityY = Math.abs(velocityY) * restitution;
        collisions += 1;
        collided = true;
      } else if (y > height - radius) {
        y = height - radius;
        velocityY = -Math.abs(velocityY) * restitution;
        collisions += 1;
        collided = true;
      }

      return {
        x,
        y,
        velocityX,
        velocityY,
        collisions,
        lastCollisionStep: collided ? time.stepIndex : state.lastCollisionStep,
      };
    },
  },
  createResources() {
    return {
      bounds: new Rectangle(0, 0, 864, 360, {
        fillColor: null,
        layoutParticipation: "include",
      }),
      box: new Rectangle(0, 0, 480, 360, {
        ...excluded,
        cornerRadius: 8,
      }),
      ball: new Arc(0, 0, 24, excluded),
      gravityArrow: new Poly([], { ...excluded, fillColor: null })
        .setClosed(false)
        .setLineCap("round"),
      graphBackground: new Rectangle(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT, {
        ...excluded,
        fillColor: "#020617DD",
        strokeColor: "#475569FF",
        strokeWidth: 1,
        cornerRadius: 8,
      }),
      graphZero: new Poly([], { ...excluded, fillColor: null }).setClosed(
        false,
      ),
      graphCurve: new Poly([], { ...excluded, fillColor: null }).setClosed(
        false,
      ),
      graphMarker: new Poly([], { ...excluded, fillColor: null }).setClosed(
        false,
      ),
      graphDot: new Arc(0, 0, 5, excluded),
      title: new Text(0, 0, "gravityScale automation", "bold 15px sans-serif", {
        ...excluded,
      }),
      valueText: new Text(0, 0, "", "13px monospace", excluded),
      integralText: new Text(0, 0, "", "13px monospace", excluded),
      stateText: new Text(0, 0, "", "13px monospace", excluded),
      rangeText: new Text(0, 0, "", "12px monospace", excluded),
    };
  },
  render({ props, resources, simulation, time, context }) {
    const width = clamp(props.boxWidth, 120, 1200);
    const height = clamp(props.boxHeight, 120, 1000);
    const radius = clamp(
      props.ballRadius,
      4,
      Math.max(4, Math.min(width, height) / 2 - 1),
    );
    const panelX = width + PANEL_GAP;
    const totalHeight = Math.max(height, GRAPH_HEIGHT + PANEL_TEXT_HEIGHT);
    const gravityScale = clamp(props.gravityScale, SCALE_MIN, SCALE_MAX);
    const gravityDirection =
      radians(props.gravityDirection) + (gravityScale < 0 ? Math.PI : 0);
    const arrowLength = (Math.abs(gravityScale) / SCALE_MAX) * 58;
    const arrowX = width / 2;
    const arrowY = height / 2;
    const arrowEndX = arrowX + Math.cos(gravityDirection) * arrowLength;
    const arrowEndY = arrowY + Math.sin(gravityDirection) * arrowLength;
    const collisionIsRecent =
      simulation.state.lastCollisionStep >= 0 &&
      simulation.stepIndex - simulation.state.lastCollisionStep <= 12;

    resources.bounds.setSize(width + PANEL_GAP + GRAPH_WIDTH, totalHeight);
    resources.box
      .setSize(width, height)
      .setFill(props.boxColor)
      .setStroke(
        collisionIsRecent ? props.collisionColor : props.borderColor,
        collisionIsRecent ? 5 : 2,
      );
    resources.ball
      .setPosition(simulation.state.x, simulation.state.y)
      .setRadius(radius)
      .setFill(props.ballColor);
    resources.gravityArrow
      .setVisible(arrowLength > 1)
      .setPoints([
        { x: arrowX, y: arrowY },
        { x: arrowEndX, y: arrowEndY },
        {
          x: arrowEndX - Math.cos(gravityDirection - 0.55) * 14,
          y: arrowEndY - Math.sin(gravityDirection - 0.55) * 14,
        },
        { x: arrowEndX, y: arrowEndY },
        {
          x: arrowEndX - Math.cos(gravityDirection + 0.55) * 14,
          y: arrowEndY - Math.sin(gravityDirection + 0.55) * 14,
        },
      ])
      .setStroke(props.gravityColor, 3);

    const graphWindow = clamp(props.graphWindow, 0.25, 30);
    const rangeStart = Math.max(0, time.seconds - graphWindow / 2);
    const rangeEnd = rangeStart + graphWindow;
    const graphPoints: Array<{ x: number; y: number }> = [];
    let graphError: string | undefined;
    for (let index = 0; index <= GRAPH_SAMPLES; index += 1) {
      const sampleTime =
        rangeStart + (index / GRAPH_SAMPLES) * (rangeEnd - rangeStart);
      const sample = context.properties.valueAt("gravityScale", sampleTime);
      if (!sample.ok) {
        graphError = sample.error.message;
        break;
      }
      const normalized =
        (clamp(sample.value, SCALE_MIN, SCALE_MAX) - SCALE_MIN) /
        (SCALE_MAX - SCALE_MIN);
      graphPoints.push({
        x: panelX + (index / GRAPH_SAMPLES) * GRAPH_WIDTH,
        y: GRAPH_HEIGHT - normalized * GRAPH_HEIGHT,
      });
    }
    const integral = context.properties.integrate("gravityScale", {
      startSeconds: rangeStart,
      endSeconds: rangeEnd,
    });
    const markerNormalized = clamp(
      (time.seconds - rangeStart) / graphWindow,
      0,
      1,
    );
    const currentNormalized =
      (clamp(props.gravityScale, SCALE_MIN, SCALE_MAX) - SCALE_MIN) /
      (SCALE_MAX - SCALE_MIN);
    const markerX = panelX + markerNormalized * GRAPH_WIDTH;
    const currentY = GRAPH_HEIGHT - currentNormalized * GRAPH_HEIGHT;
    const speed = Math.hypot(
      simulation.state.velocityX,
      simulation.state.velocityY,
    );

    resources.graphBackground.setPosition(panelX, 0);
    resources.graphZero
      .setPoints([
        { x: panelX, y: GRAPH_HEIGHT / 2 },
        { x: panelX + GRAPH_WIDTH, y: GRAPH_HEIGHT / 2 },
      ])
      .setStroke(props.borderColor, 1);
    resources.graphCurve
      .setPoints(graphPoints)
      .setStroke(graphError ? props.collisionColor : props.graphColor, 3);
    resources.graphMarker
      .setPoints([
        { x: markerX, y: 0 },
        { x: markerX, y: GRAPH_HEIGHT },
      ])
      .setStroke(props.textColor, 1);
    resources.graphDot.setPosition(markerX, currentY).setFill(props.graphColor);
    resources.title
      .setPosition(panelX, GRAPH_HEIGHT + 24)
      .setColor(props.textColor);
    resources.valueText
      .setPosition(panelX, GRAPH_HEIGHT + 48)
      .setText(
        graphError
          ? `valueAt error: ${graphError}`
          : `current gravityScale = ${props.gravityScale.toFixed(4)}`,
      )
      .setColor(graphError ? props.collisionColor : props.textColor);
    resources.integralText
      .setPosition(panelX, GRAPH_HEIGHT + 68)
      .setText(
        integral.ok
          ? `integral = ${integral.value.toFixed(6)} value·s`
          : `integral error: ${integral.error.message}`,
      )
      .setColor(integral.ok ? props.textColor : props.collisionColor);
    resources.stateText
      .setPosition(panelX, GRAPH_HEIGHT + 88)
      .setText(
        `step ${simulation.stepIndex}  collisions ${simulation.state.collisions}  speed ${speed.toFixed(2)}`,
      )
      .setColor(props.textColor);
    resources.rangeText
      .setPosition(panelX, GRAPH_HEIGHT - 8)
      .setText(`${rangeStart.toFixed(2)}s — ${rangeEnd.toFixed(2)}s`)
      .setColor(props.textColor);

    return [
      resources.bounds,
      resources.box,
      resources.gravityArrow,
      resources.ball,
      resources.graphBackground,
      resources.graphZero,
      resources.graphCurve,
      resources.graphMarker,
      resources.graphDot,
      resources.title,
      resources.valueText,
      resources.integralText,
      resources.stateText,
      resources.rangeText,
    ];
  },
});

export default bouncyBallLab;
