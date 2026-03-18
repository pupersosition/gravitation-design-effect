const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const pointer = {
  x: 0,
  y: 0,
  easedX: 0,
  easedY: 0,
  active: false,
  energy: 0,
  motion: 0,
};

const spherePoints = [];
const starfield = [];
const renderedPoints = [];

let width = 0;
let height = 0;
let dpr = 1;
let sphereRadius = 0;
let cameraDistance = 0;
let sphereCenterX = 0;
let sphereCenterY = 0;

const DOT_COUNT = 1800;
const STAR_COUNT = 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function buildSphere() {
  spherePoints.length = 0;

  for (let i = 0; i < DOT_COUNT; i += 1) {
    const y = 1 - (i / (DOT_COUNT - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const theta = GOLDEN_ANGLE * i;

    spherePoints.push({
      x: Math.cos(theta) * ringRadius,
      y,
      z: Math.sin(theta) * ringRadius,
      phase: Math.random() * Math.PI * 2,
      drift: 0.5 + Math.random() * 1.2,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
    });
  }
}

function buildStars() {
  starfield.length = 0;

  for (let i = 0; i < STAR_COUNT; i += 1) {
    starfield.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.8 + 0.4,
      alpha: 0.15 + Math.random() * 0.4,
      drift: 0.2 + Math.random() * 0.6,
    });
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  sphereRadius = Math.min(width, height) * (width < 720 ? 0.24 : 0.22);
  cameraDistance = sphereRadius * 3.25;
  sphereCenterX = width * 0.5;
  sphereCenterY = height * 0.5;

  if (!pointer.active) {
    pointer.x = sphereCenterX;
    pointer.y = sphereCenterY;
    pointer.easedX = sphereCenterX;
    pointer.easedY = sphereCenterY;
  }
}

function rotatePoint(point, rotY, rotX) {
  const sinY = Math.sin(rotY);
  const cosY = Math.cos(rotY);
  const sinX = Math.sin(rotX);
  const cosX = Math.cos(rotX);

  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  return { x: x1, y: y1, z: z2 };
}

function drawBackground(time) {
  ctx.clearRect(0, 0, width, height);

  for (const star of starfield) {
    const twinkle = 0.65 + Math.sin(time * star.drift + star.x * 10) * 0.35;
    const sx = star.x * width;
    const sy = (star.y * height + time * star.drift * 8) % (height + 40) - 20;

    ctx.beginPath();
    ctx.fillStyle = `rgba(28, 20, 11, ${star.alpha * twinkle * 0.55})`;
    ctx.arc(sx, sy, star.size * twinkle, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updatePointer() {
  pointer.easedX += (pointer.x - pointer.easedX) * 0.12;
  pointer.easedY += (pointer.y - pointer.easedY) * 0.12;
  pointer.motion *= 0.84;

  const distanceToSphere = Math.hypot(
    pointer.easedX - sphereCenterX,
    pointer.easedY - sphereCenterY,
  );
  const hoverThreshold = sphereRadius * 1.15;
  const hoverTarget = pointer.active && distanceToSphere < hoverThreshold ? 1 : 0;

  pointer.energy += (hoverTarget - pointer.energy) * 0.08;
}

function drawSphere(time) {
  renderedPoints.length = 0;

  const rotationY = time * 0.28;
  const rotationX = Math.sin(time * 0.23) * 0.35;
  const pullRadius = sphereRadius * 0.62;
  const maxDisplacement = sphereRadius * 0.035;
  const maxVelocity = 1.9;

  for (const point of spherePoints) {
    const rotated = rotatePoint(point, rotationY, rotationX);

    point.velocityX += -point.offsetX * 0.045;
    point.velocityY += -point.offsetY * 0.045;
    point.velocityZ += -point.offsetZ * 0.045;
    point.velocityX *= 0.9;
    point.velocityY *= 0.9;
    point.velocityZ *= 0.9;
    point.velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, point.velocityX));
    point.velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, point.velocityY));
    point.velocityZ = Math.max(-maxVelocity, Math.min(maxVelocity, point.velocityZ));
    point.offsetX += point.velocityX;
    point.offsetY += point.velocityY;
    point.offsetZ += point.velocityZ;
    const offsetMagnitude = Math.hypot(
      point.offsetX,
      point.offsetY,
      point.offsetZ,
    );

    if (offsetMagnitude > maxDisplacement) {
      const scale = maxDisplacement / offsetMagnitude;
      point.offsetX *= scale;
      point.offsetY *= scale;
      point.offsetZ *= scale;
    }

    const surfaceRipple =
      Math.sin(time * point.drift + point.phase + rotated.y * 4) * 7;
    const breathing = Math.sin(time * 1.2 + point.phase) * 5;
    let px =
      rotated.x * (sphereRadius + surfaceRipple + breathing * 0.15) +
      point.offsetX;
    let py =
      rotated.y * (sphereRadius + surfaceRipple + breathing * 0.15) +
      point.offsetY;
    let pz =
      rotated.z * (sphereRadius + surfaceRipple * 0.7) +
      breathing +
      point.offsetZ;

    const perspective = cameraDistance / (cameraDistance - pz);
    const screenX = sphereCenterX + px * perspective;
    const screenY = sphereCenterY + py * perspective;
    const cursorDistance = Math.hypot(
      screenX - pointer.easedX,
      screenY - pointer.easedY,
    );
    const influence =
      pointer.energy * Math.max(0, 1 - cursorDistance / pullRadius);

    if (influence > 0.001 && pointer.active) {
      const dx = screenX - pointer.easedX;
      const dy = screenY - pointer.easedY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const normalLength = Math.hypot(rotated.x, rotated.y, rotated.z) || 1;
      const nx = rotated.x / normalLength;
      const ny = rotated.y / normalLength;
      const nz = rotated.z / normalLength;
      const softMotion = 1 - Math.exp(-pointer.motion * 1.2);
      const impulse = influence * softMotion * 2.1;
      const swirl = Math.sin(time * 3.1 + point.phase) * impulse * 0.05;

      point.velocityX += (dx / distance) * impulse + nx * impulse * 0.14;
      point.velocityY += (dy / distance) * impulse + ny * impulse * 0.14;
      point.velocityZ += nz * impulse * 0.22 + swirl;

      px += point.velocityX;
      py += point.velocityY;
      pz += point.velocityZ;
    }

    const depth = cameraDistance / (cameraDistance - pz);
    const finalX = sphereCenterX + px * depth;
    const finalY = sphereCenterY + py * depth;
    const displacement = Math.hypot(
      point.offsetX,
      point.offsetY,
      point.offsetZ,
    );
    const brightness =
      0.38 + (depth - 0.7) * 0.9 + Math.min(0.32, displacement * 0.015);

    renderedPoints.push({
      x: finalX,
      y: finalY,
      size: depth * 1.55 + Math.min(1.2, displacement * 0.03),
      glow: 6 + depth * 10 + Math.min(14, displacement * 0.45),
      alpha: Math.min(0.95, brightness),
      influence,
      depth,
    });
  }

  renderedPoints.sort((a, b) => a.depth - b.depth);

  for (const point of renderedPoints) {
    const glowAlpha = 0.04 + point.influence * 0.08;
    ctx.beginPath();
    ctx.fillStyle = `rgba(15, 11, 7, ${point.alpha})`;
    ctx.shadowBlur = point.glow * 0.18;
    ctx.shadowColor = `rgba(42, 31, 16, ${glowAlpha + 0.08})`;
    ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  const haloRadius = sphereRadius * (1.12 + pointer.energy * 0.08);
  const halo = ctx.createRadialGradient(
    sphereCenterX,
    sphereCenterY,
    sphereRadius * 0.15,
    sphereCenterX,
    sphereCenterY,
    haloRadius,
  );

  halo.addColorStop(0, "rgba(44, 31, 14, 0)");
  halo.addColorStop(0.55, `rgba(72, 52, 24, ${0.03 + pointer.energy * 0.04})`);
  halo.addColorStop(1, "rgba(44, 31, 14, 0)");

  ctx.beginPath();
  ctx.fillStyle = halo;
  ctx.arc(sphereCenterX, sphereCenterY, haloRadius, 0, Math.PI * 2);
  ctx.fill();
}

function frame(now) {
  const time = now * 0.001;

  updatePointer();
  drawBackground(time);
  drawSphere(time);
  requestAnimationFrame(frame);
}

function onPointerMove(event) {
  const deltaX = event.clientX - pointer.x;
  const deltaY = event.clientY - pointer.y;

  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
  pointer.motion = Math.min(1.2, Math.hypot(deltaX, deltaY) / 26);
}

function onPointerLeave() {
  pointer.active = false;
  pointer.motion = 0;
}

window.addEventListener("resize", resize);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerleave", onPointerLeave);

buildSphere();
buildStars();
resize();
requestAnimationFrame(frame);
