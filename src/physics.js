// Deterministic coin-flip physics — extracted verbatim from the Clickflip extension.
//
// The whole toss is driven by a single 32-bit seed. The same seed always produces the
// same trajectory and lands the same face. That lets us decide the outcome with a fair
// crypto RNG up front while still rendering a real, physically-simulated bounce.

export const FIXED_STEP = 1 / 120; // fixed simulation timestep (seconds)

const PI = Math.PI;
const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

export const COIN_RADIUS = 1.2;
export const COIN_THICKNESS = 2 * COIN_RADIUS * 0.0721;
export const HALF_THICKNESS = COIN_THICKNESS / 2; // 0.08652 — resting half-height

// Fast sine: range-reduce to [-π/2, π/2] then a 9th-order Taylor series.
function fastSin(x) {
  x = x - TWO_PI * Math.round(x / TWO_PI);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return (
    x *
    (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880)))))
  );
}

function fastCos(x) {
  return fastSin(x + HALF_PI);
}

// Distance from the coin's centre to the floor at a given tilt. The coin rests once
// posY falls to this value: radius·|sin| (on edge) + halfThickness·|cos| (lying flat).
export function groundClearance(rot) {
  return (
    COIN_RADIUS * Math.abs(fastSin(rot)) +
    HALF_THICKNESS * Math.abs(fastCos(rot))
  );
}

// mulberry32 — a small, fast, seedable PRNG.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the initial state for a toss. dropX/dropZ bias where the coin is launched from.
export function initSim(seed, dropX = 0, dropZ = 0) {
  const rand = mulberry32(seed >>> 0);
  const upVelocity = 8.4 + rand() * 2.2;
  const spinVelocity = 30 + rand() * 44;
  const wobble = (rand() - 0.5) * 2.2;

  let vx = -dropX * 1.4 + (rand() - 0.5) * 1;
  let vz = -dropZ * 1.4 + (rand() - 0.5) * 1;
  const speed = Math.sqrt(vx * vx + vz * vz);
  if (speed > 1) {
    vx *= 1 / speed;
    vz *= 1 / speed;
  }

  return {
    rotX: 0,
    posX: dropX,
    posY: HALF_THICKNESS,
    posZ: dropZ,
    velX: vx,
    velY: upVelocity,
    velZ: vz,
    velRot: spinVelocity,
    spinY: 0,
    velSpinY: wobble,
    grounded: false,
    prevBeta: 0,
    time: 0,
    acc: 0,
    done: false,
  };
}

// Advance the simulation by one fixed step, sub-stepping so a fast spin never tunnels.
export function step(s) {
  s.time += FIXED_STEP;
  let remaining = FIXED_STEP;

  while (remaining > 1e-9 && !s.done) {
    const dt = Math.min(remaining, 0.03 / Math.max(0.001, Math.abs(s.velRot)));
    remaining -= dt;
    s.rotX += s.velRot * dt;
    s.spinY += s.velSpinY * dt;

    if (s.grounded) {
      // Settle towards the nearest flat orientation (a multiple of π).
      const nearest = Math.round(s.rotX / PI) * PI;
      const beta = s.rotX - nearest;
      if (
        s.prevBeta * beta < 0 &&
        Math.abs(beta) < 0.4 &&
        Math.abs(s.prevBeta) < 0.4
      ) {
        s.velRot *= 0.25; // damp the rock-back-and-forth
      }
      s.prevBeta = beta;
      s.velRot += -42 * Math.sign(beta) * dt; // restoring torque
      s.velRot -= s.velRot * Math.min(1, 6 * dt);
      s.velSpinY -= s.velSpinY * Math.min(1, 4 * dt);
      s.posY = groundClearance(s.rotX);

      if (Math.abs(beta) < 0.02 && Math.abs(s.velRot) < 0.35) {
        s.rotX = nearest;
        s.posY = HALF_THICKNESS;
        s.velRot = s.velY = s.velX = s.velZ = s.velSpinY = 0;
        s.done = true;
      }
    } else {
      // Airborne: gravity + linear motion, with a bouncy floor.
      s.velY += -19 * dt;
      s.posY += s.velY * dt;
      s.posX += s.velX * dt;
      s.posZ += s.velZ * dt;

      const floor = groundClearance(s.rotX);
      if (s.posY < floor) {
        s.posY = floor;
        if (s.velY < 0) {
          s.velY = -s.velY * 0.4; // restitution
          s.velRot *= 0.45;
          s.velSpinY *= 0.6;
          s.velX *= 0.6;
          s.velZ *= 0.6;
          if (Math.abs(s.velY) < 1.2) {
            s.grounded = true;
            s.velY = s.velX = s.velZ = 0;
          }
        } else {
          s.velRot *= 0.9;
        }
      }
    }
  }

  // Safety net: force a resolved result if it somehow never settles.
  if (!s.done && s.time > 6) {
    s.rotX = Math.round(s.rotX / PI) * PI;
    s.posY = HALF_THICKNESS;
    s.done = true;
  }
}

// Advance by a real-time delta, consuming whole fixed steps (capped per frame).
export function advance(s, dt, maxSteps = 8) {
  s.acc += dt;
  let n = 0;
  while (s.acc >= FIXED_STEP && !s.done && n++ < maxSteps) {
    step(s);
    s.acc -= FIXED_STEP;
  }
}

// Run a toss to completion with no rendering and return its parity (rotX / π, rounded).
export function simulateResult(seed) {
  const s = initSim(seed);
  let guard = 0;
  while (!s.done && guard++ < 2e5) step(s);
  return Math.round(s.rotX / PI);
}

// The face a seed lands on, computed purely (no rendering). Odd parity = Tails.
export function faceForSeed(seed) {
  return simulateResult(seed) & 1 ? "Tails" : "Heads";
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Pick a seed whose deterministic outcome matches a cryptographically-fair coin toss.
// This keeps the odds a true 50/50 even though the physics itself is deterministic.
export function fairFlip() {
  const face = randomSeed() & 1 ? "Tails" : "Heads";
  const wantParity = face === "Heads" ? 0 : 1;
  for (let i = 0; i < 200; i++) {
    const seed = randomSeed();
    if ((simulateResult(seed) & 1) === wantParity) return { seed, face };
  }
  // Extremely unlikely fallback: accept whatever this seed produces.
  const seed = randomSeed();
  return { seed, face: faceForSeed(seed) };
}
