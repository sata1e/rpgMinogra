import { cut, run, depthRatio } from "./journey.js";
import { impactTilt, roadZ } from "./world3d.js";
const motion = {};
motion.gait = 0;
motion.stride = 0;
motion.lastPick = -10;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  v = clamp01(v);
  return v * v * (3 - 2 * v);
};
// Coordinates within a pose are forward, lateral, and height. The scabbard
// slides backwards under the left hand as the right hand draws the blade.
const steelLength = 55;
const mix = (a, b, t) => a + (b - a) * t;
const blend3 = (a, b, t) => a.map((n, i) => mix(n, b[i], t));
const bladeAxis = (yaw, pitch) => [
  Math.cos(yaw) * Math.cos(pitch),
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
];
const lightArcs = [
  {high: 74, low: 48, fromPitch: 0.62, toPitch: -0.48},
  {high: 45, low: 72, fromPitch: -0.66, toPitch: 0.55},
  {high: 61, low: 58, fromPitch: 0.07, toPitch: -0.12},
];
function katanaPose(age) {
  const move = cut(),
    midCut = age >= 0 && age < move.duration;
  const parryAge = run.phase - run.guardAt,
    blocking = parryAge >= 0 && parryAge < 0.32 && !midCut;
  const transition = clamp01((run.phase - run.bladeChanged) / 0.48);
  const carry = run.bladeOut ? transition : 1 - transition;
  const readyHand = [19, 2, 57],
    axis = bladeAxis(-1.72, -1.02);
  let exposed = ease((carry - 0.12) / 0.55),
    ready = ease((carry - 0.67) / 0.33),
    reach = ease(carry / 0.12);
  let shift = 0,
    drop = 0,
    turn = 0,
    coil = 0,
    load = 0,
    lateral = 0,
    shrug = 0;
  if (midCut) {
    const impact = ease((age - move.start) / (move.end - move.start));
    const recover = ease((age - move.end) / (move.duration - move.end));
    const side = run.fromSheath ? 1 : run.slashSide;
    coil =
      side *
      (-0.35 * ease(age / move.start) +
        0.96 * ease((age - move.start + 0.035) / (move.end - move.start))) *
      (1 - recover);
    const prepare = ease(age / move.start);
    const transfer = ease((age - move.start + 0.045) / (move.end - move.start));
    load = prepare * (1 - recover);
    shift = load * mix(run.combo ? -6 : -3, run.combo ? 8 : 5, transfer);
    lateral = side * load * mix(-3.4, 3.4, transfer);
    shrug = load * (run.combo ? 5 : 2) * (1 - impact);
    turn = impact * (1 - recover);
    drop = load * ((run.combo ? 5 : 3) + 2 * impact);
    const draw = clamp01(age / (move.start * 0.66));
    exposed = run.fromSheath ? ease((draw - 0.2) / 0.8) : 1;
    reach = run.fromSheath ? ease(draw / 0.2) : 1;
    ready = run.fromSheath ? 0 : 1;
  }
  const mouth = [-8 + shift * 0.35, 10, 79 - drop].map(
    (n, i) => n + axis[i] * 30 * exposed * (1 - ready),
  );
  const drawn = mouth.map(
    (n, i) =>
      n - axis[i] * steelLength * exposed - (i === 2 ? 2.3 * exposed : 0),
  );
  let hand = blend3(drawn, readyHand, ready),
    yaw = mix(-1.72, 0.16, ready),
    pitch = mix(-1.02, 0.67, ready);
  if (midCut) {
    const side = run.fromSheath ? 1 : run.slashSide;
    // Move the grip around the body. The tip travels farther than the hands.
    const chamberAt = run.fromSheath ? move.start * 0.66 : 0;
    const wind = ease((age - chamberAt) / (move.start - chamberAt));
    const strike = ease((age - move.start) / (move.end - move.start));
    const recoverAt = move.end + 0.035;
    const settle = ease((age - recoverAt) / (move.duration - recoverAt));
    const handAngle = side * mix(-0.9, 0.97, strike);
    const edge = ease((age - move.start - 0.012) / (move.end - move.start));
    let arcHand, arcYaw, arcPitch;
    if (run.combo) {
      const armAngle = mix(1.55, -0.88, strike);
      arcHand = [
        5 + shift + 28 * Math.cos(armAngle),
        2 + lateral + side * 2 * Math.sin(Math.PI * strike),
        75 - drop + shrug + 28 * Math.sin(armAngle),
      ];
      arcYaw = side * 0.12;
      arcPitch = mix(3.86, -0.41, edge);
    } else {
      // Each row defines grip height and edge pitch at the two ends of the cut.
      const profile = lightArcs[run.fromSheath ? 0 : run.lightVariant];
      arcHand = [
        5 + shift + 18 * Math.cos(handAngle),
        lateral + 18 * Math.sin(handAngle),
        mix(profile.high, profile.low, strike) - drop + shrug,
      ];
      arcYaw = side * mix(-1.72, 1.48, edge);
      arcPitch = mix(profile.fromPitch, profile.toPitch, edge);
    }
    hand = blend3(blend3(hand, arcHand, wind), readyHand, settle);
    yaw = mix(mix(yaw, arcYaw, wind), 0.16, settle);
    pitch = mix(
      mix(pitch, arcPitch, run.combo ? ease((wind - 0.18) / 0.82) : wind),
      0.67,
      settle,
    );
    for (let i = 0; i < 3; i++)
      mouth[i] -= axis[i] * 30 * exposed * (1 - ready) * wind;
  } else if (blocking) {
    const guard = Math.sin((Math.PI * parryAge) / 0.32);
    hand = blend3(hand, [21, 3, 73], guard);
    exposed = Math.max(exposed, guard);
    reach = Math.max(reach, guard);
    yaw = mix(yaw, -0.9, guard);
    pitch = mix(pitch, 1, guard);
  } else if (
    run.bladeOut &&
    run.windAt === null &&
    run.phase >= run.cleanAt &&
    run.phase - run.cleanAt < 0.49
  ) {
    const t = run.phase - run.cleanAt,
      raise = ease(t / 0.16),
      snap = ease((t - 0.16) / 0.075),
      back = ease((t - 0.25) / 0.24);
    hand = blend3(
      blend3(blend3(readyHand, [18, 5, 72], raise), [20, 21, 48], snap),
      readyHand,
      back,
    );
    yaw = mix(mix(0.16, 1.27, snap), 0.16, back);
    pitch = mix(mix(mix(0.67, 0.97, raise), -0.64, snap), 0.67, back);
  }
  // Gather the second hand after the blade clears its carrier.
  const supportGrip = midCut
    ? run.fromSheath
      ? ease((age - move.start * 0.66) / (move.start * 0.34))
      : 1
    : blocking
      ? 0
      : ready;
  return {
    supportGrip,
    reach,
    exposed,
    mouth,
    tsuba: hand,
    yaw,
    pitch,
    sheathAxis: axis,
    shift,
    drop,
    turn,
    coil,
    load,
    lateral,
    shrug,
  };
}
function weaponGeometry(p, dir, x, y) {
  const axis = bladeAxis(p.yaw, p.pitch);
  const world = ([f, s, h]) => ({
    x: x + dir.x * f - dir.y * s,
    y: y / depthRatio + dir.y * f + dir.x * s,
    z: h,
  });
  const along = (origin, v, t, bend = 0) =>
    world(origin.map((n, i) => n + v[i] * t + (i === 2 ? bend : 0)));
  const length = steelLength * p.exposed;
  return {
    mouth: world(p.mouth),
    shoe: along(p.mouth, p.sheathAxis, steelLength + 2, 2.5),
    rear: along(p.tsuba, axis, -14),
    grip: along(p.tsuba, axis, -5),
    guard: world(p.tsuba),
    middle: along(p.tsuba, axis, length * 0.55, 0.7 * p.exposed * p.exposed),
    tip: along(p.tsuba, axis, length, 2.3 * p.exposed * p.exposed),
  };
}
function bladeSweep(age, dt, oldX, oldY, previousAim = run.attackDir) {
  if (run.spent || age < cut().start || age - dt > cut().end) return [];
  const from = Math.max(cut().start, age - dt),
    to = Math.min(age, cut().end);
  const steps = Math.max(1, Math.ceil((to - from) * 180)),
    edges = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps,
      f = clamp01(1 - (age - t) / Math.max(0.0001, dt));
    const start = Math.atan2(previousAim.y, previousAim.x);
    const delta = Math.atan2(
      previousAim.x * run.attackDir.y - previousAim.y * run.attackDir.x,
      previousAim.x * run.attackDir.x + previousAim.y * run.attackDir.y,
    );
    const yaw = start + delta * f;
    const w = weaponGeometry(
      katanaPose(t),
      { x: Math.cos(yaw), y: Math.sin(yaw) },
      oldX + (run.pos - oldX) * f,
      oldY + (run.depth - oldY) * f,
    );
    edges.push([w.guard, w.middle], [w.middle, w.tip]);
  }
  edges.sampleTime = (to - from) / steps;
  return edges;
}
function edgeHits([a, b], d) {
  const radius = d.hitRadius ?? [28, 20, 25, 31][d.type],
    bottom = d.type === 1 ? 18 : 0,
    top = d.hitHeight ?? [53, 101, 108, 127][d.type];
  const dz = b.z - a.z,
    dx = b.x - a.x,
    dy = b.y - a.y;
  let lo = 0,
    hi = 1;
  if (Math.abs(dz) < 0.001) {
    if (a.z < bottom || a.z > top) return false;
  } else {
    const t0 = (bottom - a.z) / dz,
      t1 = (top - a.z) / dz;
    lo = Math.max(0, Math.min(t0, t1));
    hi = Math.min(1, Math.max(t0, t1));
    if (lo > hi) return false;
  }
  const t = Math.max(
    lo,
    Math.min(
      hi,
      ((d.x - a.x) * dx + (d.y / depthRatio - a.y) * dy) /
        (dx * dx + dy * dy || 1),
    ),
  );
  return (
    Math.hypot(a.x + t * dx - d.x, a.y + t * dy - d.y / depthRatio) < radius
  );
}
// Hit volumes share the lean of the rendered body. Returned coordinates use the
// blade convention (x and y on the ground, z above it).
function swordContact(edges, d) {
  const height = [54, 100, 108, 127][d.type],
    width = [16, 13, 17, 21][d.type];
  const tilt = impactTilt(d, d.type === 0 ? 12 : 24);
  const facing =
    d.feet?.angle ?? Math.atan2(roadZ(run.depth) - roadZ(d.y), run.pos - d.x);
  const zones =
    d.type === 0
      ? [
          [0.22, 0.68, -16],
          [0.22, 0.68, 14],
          [0.6, 1.12, -7],
          [0.7, 1.1, 12],
          [0.9, 0.78, 32],
        ]
      : [
          [0.19, 0.77, 0],
          [0.4, 0.93, 0],
          [0.59, 1.02, 0],
          [0.76, 1.12, 0],
          [0.92, 0.75, 2],
        ];
  let earliest = null;
  for (const [level, size, forward] of zones) {
    const limb = level < 0.25 && d.type !== 1;
    for (const side of limb ? [-1, 1] : [0]) {
      const lateral = side * width * 0.52;
      let x = forward * Math.cos(facing) - lateral * Math.sin(facing),
        y = forward * Math.sin(facing) + lateral * Math.cos(facing),
        z = height * level;
      if (tilt && z > tilt.pivot) {
        const h = z - tilt.pivot,
          along = x * tilt.nx + y * tilt.nz,
          off = along * (tilt.cos - 1) + h * tilt.sin;
        x += tilt.nx * off;
        y += tilt.nz * off;
        z = Math.max(1, tilt.pivot + h * tilt.cos - along * tilt.sin);
      }
      x += d.x;
      y += d.y / depthRatio;
      for (let i = 0; i < edges.length && (!earliest || i <= earliest.i); i++) {
        const [a, b] = edges[i],
          dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
        const t = clamp01(
          ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) /
            (dx * dx + dy * dy + dz * dz || 1),
        );
        const px = a.x + t * dx,
          py = a.y + t * dy,
          pz = a.z + t * dz;
        const dist = Math.hypot(px - x, py - y, pz - z) / (width * size);
        if (dist <= 1 && (!earliest || i < earliest.i || dist < earliest.dist))
          earliest = { i, t, dist, level, x: px, y: py, z: pz };
      }
    }
  }
  return earliest;
}

export {
  motion,
  ease,
  bladeSweep,
  swordContact,
  mix,
  weaponGeometry,
  katanaPose,
  blend3,
  edgeHits,
  clamp01,
};
