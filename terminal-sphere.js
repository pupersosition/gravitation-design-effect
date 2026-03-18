#!/usr/bin/env node
"use strict";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DOT_COUNT = 900;
const DEFAULT_FPS = 24;
const DEFAULT_SPEED = 1;
const SHADE_RAMP = " .:-=+*#%@";

const args = process.argv.slice(2);
const options = {
  fps: readNumberFlag(args, "--fps", DEFAULT_FPS),
  frames: readNumberFlag(args, "--frames", 0),
  speed: readNumberFlag(args, "--speed", DEFAULT_SPEED),
  color: !args.includes("--no-color"),
  label: !args.includes("--no-label"),
  altScreen: !args.includes("--no-alt-screen"),
};

if (!process.stdout.isTTY) {
  console.error("This renderer needs a TTY. Run it directly in a terminal.");
  process.exit(1);
}

const spherePoints = buildSphere(DOT_COUNT);
const state = {
  frameCount: 0,
  timer: null,
  cleanedUp: false,
  width: 0,
  height: 0,
  brightness: new Float32Array(0),
  depth: new Float32Array(0),
};

function readNumberFlag(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1 || index === argv.length - 1) {
    return fallback;
  }

  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildSphere(count) {
  const points = [];

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const theta = GOLDEN_ANGLE * i;

    points.push({
      x: Math.cos(theta) * ringRadius,
      y,
      z: Math.sin(theta) * ringRadius,
      phase: ((Math.sin(i * 12.9898) + 1) * 0.5) * Math.PI * 2,
      drift: 0.45 + ((Math.sin(i * 7.531) + 1) * 0.5) * 0.7,
    });
  }

  return points;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rotatePoint(point, rotationY, rotationX) {
  const sinY = Math.sin(rotationY);
  const cosY = Math.cos(rotationY);
  const sinX = Math.sin(rotationX);
  const cosX = Math.cos(rotationX);

  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  return { x: x1, y: y1, z: z2 };
}

function ensureBuffers(width, height) {
  if (state.width === width && state.height === height) {
    state.brightness.fill(0);
    state.depth.fill(-Infinity);
    return;
  }

  state.width = width;
  state.height = height;
  state.brightness = new Float32Array(width * height);
  state.depth = new Float32Array(width * height);
  state.depth.fill(-Infinity);
}

function splat(x, y, depth, brightness) {
  const weights = [
    [0.2, 0.45, 0.2],
    [0.45, 1, 0.45],
    [0.2, 0.45, 0.2],
  ];

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const py = y + offsetY;
    if (py < 0 || py >= state.height) {
      continue;
    }

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const px = x + offsetX;
      if (px < 0 || px >= state.width) {
        continue;
      }

      const index = py * state.width + px;
      const weightedBrightness = brightness * weights[offsetY + 1][offsetX + 1];

      if (depth + 0.02 < state.depth[index]) {
        continue;
      }

      state.depth[index] = Math.max(state.depth[index], depth);
      state.brightness[index] = Math.max(state.brightness[index], weightedBrightness);
    }
  }
}

function colorize(char, brightness) {
  if (!options.color || char === " ") {
    return char;
  }

  const amount = clamp(brightness, 0, 1);
  const red = Math.round(84 + amount * 162);
  const green = Math.round(58 + amount * 124);
  const blue = Math.round(18 + amount * 54);
  return `\x1b[38;2;${red};${green};${blue}m${char}`;
}

function toShadeLines(cols, rows) {
  const lines = [];

  for (let row = 0; row < rows; row += 1) {
    let line = "";

    for (let col = 0; col < cols; col += 1) {
      const brightness = state.brightness[row * state.width + col];
      const shadeIndex = Math.round(clamp(brightness, 0, 1) * (SHADE_RAMP.length - 1));
      line += colorize(SHADE_RAMP[shadeIndex], brightness);
    }

    lines.push(`${line}\x1b[0m`);
  }

  return lines;
}

function buildLabel(cols) {
  if (!options.label) {
    return "";
  }

  const progress = options.frames
    ? `frame ${Math.min(state.frameCount, options.frames)}/${options.frames}`
    : "live";
  const text = ` terminal sphere | ${progress} | ctrl+c to exit `;
  const trimmed = text.length > cols ? text.slice(0, cols) : text.padEnd(cols, " ");
  return `\x1b[2m${trimmed}\x1b[0m`;
}

function renderFrame(time) {
  const cols = Math.max(20, process.stdout.columns || 80);
  const totalRows = Math.max(10, process.stdout.rows || 24);
  const drawableRows = Math.max(8, totalRows - (options.label ? 1 : 0));
  const radius = Math.min(cols * 0.34, drawableRows * 0.78);
  const cameraDistance = radius * 3.2;
  const centerX = cols * 0.5;
  const centerY = drawableRows * 0.5;
  const rotationY = time * 0.65 * options.speed;
  const rotationX = Math.sin(time * 0.3 * options.speed) * 0.35;
  const xScale = radius * 1.1;
  const yScale = radius * 0.58;

  ensureBuffers(cols, drawableRows);

  for (const point of spherePoints) {
    const rotated = rotatePoint(point, rotationY, rotationX);
    const pulse = 1 + Math.sin(time * point.drift + point.phase) * 0.02;
    const px = rotated.x * xScale * pulse;
    const py = rotated.y * yScale * pulse;
    const pz = rotated.z * radius;
    const perspective = cameraDistance / (cameraDistance - pz);
    const screenX = Math.round(centerX + px * perspective);
    const screenY = Math.round(centerY + py * perspective);
    const depth = clamp((rotated.z + 1) * 0.5, 0, 1);
    const brightness = 0.08 + depth * 0.92;

    splat(screenX, screenY, depth, brightness);
  }

  const lines = toShadeLines(cols, drawableRows);

  if (options.label) {
    lines.push(buildLabel(cols));
  }

  process.stdout.write(`\x1b[H${lines.join("\n")}`);
}

function cleanup(exitCode, error) {
  if (state.cleanedUp) {
    return;
  }

  state.cleanedUp = true;

  if (state.timer) {
    clearTimeout(state.timer);
  }

  process.stdout.write("\x1b[0m\x1b[?25h");
  if (options.altScreen) {
    process.stdout.write("\x1b[?1049l");
  } else {
    process.stdout.write("\n");
  }

  if (error) {
    console.error(error.stack || error.message || String(error));
  }

  process.exit(exitCode);
}

function tick() {
  state.frameCount += 1;
  renderFrame((state.frameCount - 1) / options.fps);

  if (options.frames && state.frameCount >= options.frames) {
    cleanup(0);
    return;
  }

  state.timer = setTimeout(tick, 1000 / options.fps);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("uncaughtException", (error) => cleanup(1, error));

if (options.altScreen) {
  process.stdout.write("\x1b[?1049h");
}

process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
tick();
