import { rollDuration } from "./combat-timing.js";
import { groundHeight, groundKind, heroMotion } from "./valley.js";
import { run, distanceTo, cut, combatStance } from "./journey.js";
import { roadZ } from "./world3d.js";
import { ease, mix } from "./wanderer.js";

// Feet are stored on the ground in world coordinates. Only the swinging group
// gets a new landing point. Paired diagonals form the hound's trot.
const humanFeet = [
    [-4, -5.5, 0],
    [4, 5.5, 1],
  ],
  knightFeet = [
    [-10, -11, 0],
    [10, 11, 1],
  ];
const houndFeet = [
  [-23, -9, 0],
  [16, -9, 1],
  [-23, 9, 1],
  [16, 9, 0],
];
function advanceFeet(b, dt) {
  const actor = b.ref,
    hero = actor === heroMotion;
  if (!hero && (actor.type === undefined || actor.type === 1)) return;
  if (hero && run.phase - run.rollAt < rollDuration) {
    actor.feet = null;
    return;
  }
  const pattern = hero ? humanFeet : actor.type === 0 ? houndFeet : knightFeet;
  const scale = actor.type === 3 ? 1.17 : 1;
  const dx = b.x - b.oldX,
    dz = b.z - b.oldZ,
    speed = Math.hypot(dx, dz) / dt;
  let angle = hero
    ? Math.atan2(run.heading.y, run.heading.x)
    : Math.atan2(roadZ(run.depth) - b.z, run.pos - b.x);
  if (!hero && distanceTo(actor.home, actor.homeY) > 350 && speed > 4)
    angle = Math.atan2(dz, dx);
  if (hero && run.phase - run.attackAt < cut().duration)
    angle = Math.atan2(run.attackDir.y, run.attackDir.x);
  let rig = actor.feet;
  if (rig) {
    const delta = Math.atan2(
      Math.sin(angle - rig.angle),
      Math.cos(angle - rig.angle),
    );
    angle = rig.angle + Math.max(-dt * 10, Math.min(dt * 10, delta));
  }
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const attackAge = run.phase-run.attackAt;
  const entry = hero && attackAge < cut().end ? cut().entry : null;
  const braced = hero && attackAge < cut().end;
  const stance = hero && !braced ? combatStance() : 0;
  const along = (dx*c + dz*s) / (speed*dt || 1);
  const sideways = (-dx*s + dz*c) / (speed*dt || 1);
  const homes = pattern.map(([f, z]) => {
    f += Math.sign(z) * stance * 4;
    z += Math.sign(z) * stance * 4;
    if (braced) {
      f += Math.sign(z) * 9;
      z += Math.sign(z) * 2;
    }
    return [b.x + scale * (f * c - z * s), b.z + scale * (f * s + z * c)];
  });
  if (!rig || Math.hypot(b.x - rig.x, b.z - rig.z) > 80) {
    rig = actor.feet = {
      feet: homes.map(([x, z]) => ({ x, z, h: 0 })),
      group: 0,
      time: 1,
      duration: 0.15,
    };
  }
  Object.assign(rig, { angle, x: b.x, z: b.z, scale });
  // A rolling or contact correction can move the pelvis past a planted heel.
  // Recover the stance immediately after a displacement larger than one stride.
  if (hero && Math.hypot(dx, dz) > 19) {
    rig.feet = homes.map(([x, z]) => ({ x, z, h: 0 }));
    rig.time = rig.duration;
    return;
  }
  if ((entry || (hero && cut().queued !== undefined && run.attackAt >= 0)) && rig.time >= rig.duration) return;
  if (rig.time >= rig.duration) {
    let error = 0;
    rig.feet.forEach((f, i) => {
      error = Math.max(error, Math.hypot(f.x - homes[i][0], f.z - homes[i][1]));
    });
    if (error < 4) {
      if (speed < 3) rig.hasStepped = false;
      return;
    }
    if (hero && (braced || speed < 12 || !rig.hasStepped)) {
      // Step with the foot furthest from its next support point, including pivots.
      const lead = Math.min(0.09, 12 / Math.max(speed, 1));
      const errors = rig.feet.map((f, i) =>
        Math.hypot(
          f.x - homes[i][0] - (dx / dt) * lead,
          f.z - homes[i][1] - (dz / dt) * lead,
        ),
      );
      if (stance > .5 && !rig.hasStepped && speed > 3) {
        const leading = Math.abs(sideways) > Math.abs(along) ? sideways : along;
        rig.group = leading > 0 ? 1 : 0;
      } else rig.group = errors[0] > errors[1] ? 0 : 1;
    } else rig.group = 1 - rig.group;
    rig.hasStepped = true;
    const surface = groundKind(b.x, b.z);
    const surfaceTime = [0.36, 0.335, 0.41][surface];
    const guardTempo = mix(.57, .74, Math.max(0, along));
    rig.duration = hero && !braced ? surfaceTime * mix(1, guardTempo, stance) : Math.max(0.075, Math.min(0.21, 25 / (speed + 55)));
    rig.time = 0;
    rig.feet.forEach((f, i) => {
      if (pattern[i][2] !== rig.group) return;
      const catchStep =
        !hero && run.phase - (actor.balanceAt ?? -10) < 0.35 ? 1.9 : 1;
      // The landing target includes both pelvis travel during swing and the
      // forward half of the following support phase.
      const predict = hero && !braced ? Math.min(rig.duration * 1.46, 47 / Math.max(1, speed)) : Math.min(
        rig.duration * (hero ? 1 : 1.3) * catchStep,
        ((hero ? 16 : 30) * catchStep) / Math.max(1, speed),
      );
      let toX = homes[i][0] + (dx / dt) * predict;
      let toZ = homes[i][1] + (dz / dt) * predict;
      if (stance > .5) {
        // Maintain space between the landing foot and the planted one during a strafe.
        const planted = rig.feet[1-i], side = Math.sign(pattern[i][1]);
        const gap = side * (-(toX-planted.x)*s + (toZ-planted.z)*c);
        const correction = Math.max(0, 7*stance-gap)*side;
        toX -= s*correction;
        toZ += c*correction;
      }
      Object.assign(f, {
        walking: hero && !braced,
        fromHeight: 0,
        fromX: f.x,
        fromZ: f.z,
        toX, toZ,
        clearance: mix(1, .53, stance) * Math.min(
          hero ? [8,6,12][groundKind(toX,toZ)] : 10,
          Math.hypot(toX-f.x,toZ-f.z)*.24,
        ),
      });
    });
  }
  rig.time = Math.min(rig.duration, rig.time + dt*(entry?.footRate ?? 1));
  const t = rig.time / rig.duration;
  rig.feet.forEach((f, i) => {
    if (pattern[i][2] !== rig.group) return;
    const u = f.walking ? ease((t-.055)/.89) : ease(t);
    f.x = mix(f.fromX, f.toX, u);
    f.z = mix(f.fromZ, f.toZ, u);
    f.h =
      t === 1
        ? 0
        : (f.fromHeight || 0)*(1-ease(t)) + Math.sin((f.walking ? ease(t) : t) * Math.PI) *
          f.clearance;
    if (hero && t === 1 && speed > 6) soundStep(groundKind(f.x, f.z));

  });
}
let stepNoise;
function soundStep(surface) {
  const audio = run.audio;
  if (!run.sound || !audio || audio.state !== "running") return;
  if (!stepNoise || stepNoise.sampleRate !== audio.sampleRate) {
    stepNoise = audio.createBuffer(1, Math.ceil(audio.sampleRate * .19), audio.sampleRate);
    const data = stepNoise.getChannelData(0);
    for (let i=0; i<data.length; i++) data[i]=Math.random()*2-1;
  }
  const source=audio.createBufferSource(), filter=audio.createBiquadFilter(), gain=audio.createGain();
  const now=audio.currentTime, duration=[.11,.065,.18][surface];
  source.buffer=stepNoise;
  filter.type="bandpass";
  filter.frequency.setValueAtTime([530,1450,2700][surface],now);
  filter.frequency.exponentialRampToValueAtTime([210,680,650][surface],now+duration);
  gain.gain.setValueAtTime(.001, now);
  gain.gain.exponentialRampToValueAtTime(.15, now+.006);
  gain.gain.exponentialRampToValueAtTime(.001, now+duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
  source.start(now);source.stop(now+duration);
}
function localFoot(actor, i, pattern) {
  const rig = actor.feet;
  if (!rig) return [pattern[i][0], 0, pattern[i][1]];
  const f = rig.feet[i],
    x = f.x - rig.x,
    z = f.z - rig.z,
    c = Math.cos(rig.angle),
    s = Math.sin(rig.angle);
  let forward = (x * c + z * s) / rig.scale,
    lateral = (z * c - x * s) / rig.scale;
  if (actor === heroMotion) {
    const hipZ = pattern[i][1],
      offset = lateral - hipZ;
    const reach = Math.min(1, 23 / (Math.hypot(forward, offset) || 1));
    forward *= reach;
    lateral = hipZ + offset * reach;
  }
  return [forward, (f.h + groundHeight(f.x,f.z) - groundHeight(rig.x,rig.z)) / rig.scale, lateral];
}

export { advanceFeet, localFoot, humanFeet, houndFeet, knightFeet };
