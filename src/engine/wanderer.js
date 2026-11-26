import { loweredHeight, impactDrop } from "./demon-fall.js";
import { chargeDuration, parryTiming, riposteWindow } from "./combat-timing.js";
import { groundHeight } from "./valley.js";
import { weapon } from "./weapons.js";
import { bladeProgress, cut, run, depthRatio, trackY } from "./journey.js";
import { impactTilt, demonFacing, demonAttackPose, houndBackHeight } from "./world3d.js";
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

const mix = (a, b, t) => a + (b - a) * t;
const blend3 = (a, b, t) => a.map((n, i) => mix(n, b[i], t));
const bladeAxis = (yaw, pitch) => [
  Math.cos(yaw) * Math.cos(pitch),
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
];
const carryYaw = -2.93, carryPitch = -.23;
const lightArcs = [
  {high: 74, low: 48, fromPitch: 0.62, toPitch: -0.48},
  {high: 45, low: 72, fromPitch: -0.66, toPitch: 0.55},
  {high: 61, low: 58, fromPitch: 0.07, toPitch: -0.12},
];
// The sweep sampler and the renderer interpolate from the same contact-time pose.
function ripostePose(age, move) {
  const {originPose: p, side, low} = move.riposte;
  const drive = ease(age / move.end);
  const settle = ease((age - move.end) / (move.duration - move.end));
  const channel = (from, through, rest) => mix(mix(from, through, drive), rest, settle);
  const grip = blend3(blend3(p.tsuba, [36, -side * 6, low ? 46 : 62], drive), [19, 2, 57], settle);
  return {
    ...p, tsuba: grip,
    yaw: channel(p.yaw, -.16 * side, .16),
    pitch: channel(p.pitch, low ? -.44 : -.16, .67),
    coil: channel(p.coil, -.32 * side, 0),
    shift: channel(p.shift, 7, 0), lateral: channel(p.lateral, -side * 2, 0),
    shrug: channel(p.shrug, 0, 0), drop: channel(p.drop, low ? 9 : 4, 0),
    supportGrip: channel(p.supportGrip, 1, 1)
  };
}
function katanaPose(age) {
  const move = cut();
  if (move.hold && age >= move.hold.begin && !move.interrupted && run.attackAt >= 0) {
    if (move.queued !== undefined && move.releasePose) return {...move.releasePose, heldAttack:true};
    if (run.windAt === move.hold.at) {
      const p = move.hold.pose;
      const elapsed = age-move.hold.begin;
      if (move.link?.returnFromDraw) {
        const buffered = Math.max(0,run.attackAt+move.hold.begin-move.hold.at);
        const lift = ease((elapsed-.055)/Math.max(.08,chargeDuration-buffered-.055));
        const raised = {...p, tsuba:[1,0,100], yaw:0, pitch:2.53, coil:.12,
          shift:-3, lateral:move.entry.leadSide*2.5, shrug:3, drop:3, carryReady:0,
          mouth:[9-.82*3,-14+move.entry.leadSide*2.5,48], supportGrip:1, sheathHold:0};
        if (lift === 1) return {...raised,heldAttack:true};
        const pose = blendCutPose(p,raised,lift);
        // Carry the grip outside the shoulder before bringing it over the crown.
        const around = Math.sin(Math.PI*lift);
        pose.tsuba[0] += 7*around;
        pose.tsuba[1] -= 6*around;
        return {...pose,heldAttack:true};
      }
      const lift = ease((elapsed-.075)/(.75*chargeDuration));
      const raised = {...p, tsuba:[5,2,104+weapon.lift], pitch:2.2, yaw:0,
        coil:0, shift:-4, lateral:p.lateral*.5, shrug:4, drop:4};
      return {...blendCutPose(p,raised,lift), heldAttack:true};
    }
  }
  if (move.link?.overheadFinish && age >= 0 && age < move.duration) return overheadFinishPose(age,move);
  if (move.link?.returnFromDraw && age >= 0 && age < move.duration) return returnCutPose(age,move);
  if (!move.link || age < 0 || age >= move.start) return baseKatanaPose(age);
  return blendCutPose(move.link.pose,baseKatanaPose(move.start),ease(age/move.start));
}
function overheadFinishPose(age,move) {
  const p = move.link.pose;
  const {entry,start,end,duration} = move;
  const impact = move.impact;
  if (impact && age >= impact.sampleAge) {
    const resume = impact.at+.07;
    // Hold the sampled contact frame. Rejoin the original clock by recovery.
    const finish = end+.17;
    const progress = clamp01((age-resume)/(finish-resume));
    if (age < finish) age = mix(impact.sampleAge,finish,progress*progress*(2-progress));
  }
  const overrun = impact ? 0 : ease((age-end)/.11)*(1-ease((age-end-.11)/.23));
  const drive = ease(age/end);
  const edge = ease((age-start*.4)/(end-start*.4));
  const plant = ease((age-entry.landAt*.6)/(end-entry.landAt*.6));
  const settle = ease((age-end)/(duration-end));
  const shift = mix(mix(p.shift,9,drive),0,settle)+5*overrun;
  const lateral = mix(mix(p.lateral,entry.leadSide*4.5,plant),0,settle);
  const drop = mix(mix(p.drop,8+4*move.lowAim,plant),0,settle)+3*overrun;
  const hand = blend3(p.tsuba,[29,0,49-12*move.lowAim],drive);
  hand[0] += 10*Math.sin(Math.PI*drive)+5*overrun;
  hand[2] -= 4*overrun;
  return {...p, heldAttack:false, supportGrip:1, sheathHold:0, carryReady:settle,
    tsuba:blend3(hand,[19,2,57],settle), mouth:[9+.82*shift,-14+lateral,51-drop],
    yaw:mix(mix(p.yaw,0,ease(age/start)),.16,settle),
    pitch:mix(mix(p.pitch,-.59-.25*move.lowAim,edge),.67,settle)-.18*overrun,
    shift,lateral,drop, coil:mix(p.coil,0,drive), shrug:p.shrug*(1-drive),
    load:mix(p.load,1,drive)*(1-settle), turn:edge*(1-settle)};
}
function blendCutPose(origin,target,t) {
  const next = {...target};
  for (const key of ["mouth","tsuba"]) next[key] = blend3(origin[key],next[key],t);
  for (const key of ["shift","drop","coil","load","lateral","shrug","turn","reach","exposed","supportGrip","carryReady","sheathHold"]) {
    next[key] = mix(origin[key],next[key],t);
  }
  for (const key of ["yaw","pitch"]) {
    const delta = next[key]-origin[key];
    next[key] = origin[key] + Math.atan2(Math.sin(delta),Math.cos(delta))*t;
  }
  return next;
}
// A walking draw follows the current footfall. Keep the tip in the mouth
// until clearance; carry the outward velocity of the grip into the cut.
function steppingDraw(age, move) {
  const {start, end, duration, entry} = move;
  const clear = start * .77;
  const graspAt = start*.18;
  const reach = ease(age/graspAt);
  const pull = clamp01((age-graspAt)/(clear-graspAt));
  const retreat = Math.max(weapon.length*.2,sheathTravel());
  const exitSlope = .24;
  const exposed = ease(pull) + exitSlope*pull*pull*(pull-1);
  const sweep = clamp01((age-clear)/(end-clear));
  const arc = ease(sweep);
  const settle = ease((age-end)/(duration-end));
  const planted = ease((age-entry.landAt)/Math.max(.04,end-entry.landAt));
  const load = ease(age/clear)*(1-settle);
  const lateral = entry.leadSide*load*mix(-1.6,4.8,planted);
  const shift = load*mix(-2,7,planted);
  const drop = load*(2+2*planted);
  const axis = bladeAxis(carryYaw,carryPitch);
  const slide = retreat*exposed*(1-settle);
  const mouth = [9+shift*.82,-14+lateral,51-drop].map((v,i)=>v+axis[i]*slide);
  const drawn = mouth.map((v,i)=>v-axis[i]*weapon.length*exposed);
  drawn[2] -= weapon.curve*exposed*exposed;
  // A short tangent at clearance rounds the path without a second wind-up.
  const follow = exitSlope*(end-clear)/(clear-graspAt)*sweep*(1-sweep)*(1-sweep);
  const through = [25+shift,17+lateral,64+weapon.lift-16*(move.lowAim||0)-drop];
  const grip = blend3(drawn,through,arc);
  for (let i=0;i<3;i++) grip[i] -= (axis[i]*(weapon.length-retreat)+(i===2 ? 2*weapon.curve : 0))*follow;
  const support = ease((age-end)/(Math.max(.01,duration-end)*.68));
  return {
    mouth, sheathAxis:axis, tsuba:blend3(grip,[19,2,57],settle),
    yaw:mix(mix(carryYaw,1.16*weapon.arc,arc),.16,settle),
    pitch:mix(mix(carryPitch,.43-.40*(move.lowAim||0),arc),.67,settle),
    coil:load*mix(-.30,.52,arc), lateral, shift, drop, load, turn:arc*(1-settle),
    shrug:load*arc, reach, exposed, carryReady:settle,
    sheathHold:1-support, supportGrip:support,
  };
}
function sheathTravel() {
  return Math.min(weapon.length*.49,Math.max(0,weapon.length-30));
}
function returnCutPose(age, move) {
  const origin = move.link.pose;
  const {start,end,duration,entry} = move;
  const gather = ease(age/start);
  const sweep = ease((age-start*.45)/(end-start*.45));
  const settle = ease((age-end)/(duration-end));
  const plant = ease((age-entry.landAt*.76)/(end-entry.landAt*.76));
  const through = (from,to,rest,t)=>mix(mix(from,to,t),rest,settle);
  const shift = through(origin.shift,8,0,plant);
  const lateral = through(origin.lateral,entry.leadSide*4.8,0,plant);
  const drop = through(origin.drop,5,0,plant);
  // Bring the hilt within reach of the left hand as the free foot advances.
  // Both hands then carry it across the body on the same descending arc.
  const grip = blend3(origin.tsuba,[25,9,64-10*move.lowAim],gather);
  const hand = blend3(grip,[22+shift,-14+lateral,53-14*move.lowAim],sweep);
  const mouth = [9+.82*shift,-14+lateral,51-drop];
  return {
    ...origin, heldAttack:false, exposed:1, reach:1, carryReady:mix(origin.carryReady,1,settle),
    mouth:blend3(origin.mouth,mouth,gather), tsuba:blend3(hand,[19,2,57],settle),
    sheathHold:origin.sheathHold*(1-gather), supportGrip:mix(origin.supportGrip,1,gather),
    yaw:through(origin.yaw,-1.52,.16,sweep),
    pitch:through(origin.pitch,-.38-.27*move.lowAim,.67,sweep),
    coil:through(origin.coil,-.46,0,sweep), shift, lateral, drop,
    load:mix(origin.load,1,gather)*(1-settle), shrug:origin.shrug*(1-sweep),
    turn:mix(origin.turn,1,sweep)*(1-settle),
  };
}
function baseKatanaPose(age) {
  const move = cut(),
    midCut = age >= 0 && age < move.duration;
  if (midCut && move.riposte) return ripostePose(age, move);
  if (midCut && move.entry?.steppingDraw) return steppingDraw(age, move);
  const parryAge = run.phase - run.guardAt;
  const sinceContact = run.phase - run.deflectedAt;
  const blocking = run.guardAt > run.rollAt && !midCut &&
    (parryAge < parryTiming.recover || sinceContact < riposteWindow);
  const transition = bladeProgress();
  const carry = blocking && run.guardDraw
    ? clamp01(parryAge / parryTiming.open)
    : run.bladeOut ? transition : 1 - transition;
  const readyHand = [19, 2, 57],
    axis = bladeAxis(carryYaw, carryPitch);
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
    if (move.entry) {
      const planted = ease((age-move.entry.landAt) /
        Math.max(.04, move.end-move.entry.landAt));
      lateral = move.entry.leadSide * load * mix(-1.7, 4.8, planted);
      shift += 2.2 * load * planted;
    } else lateral = side * load * mix(-3.4, 3.4, transfer);
    shrug = load * (run.combo ? 5 : 2) * (1 - impact);
    turn = impact * (1 - recover);
    drop = load * ((run.combo ? 5 : 3) + 2 * impact);
    const draw = clamp01(age / (move.start * 0.66));
    exposed = run.fromSheath ? ease((draw - 0.2) / 0.8) : 1;
    reach = run.fromSheath ? ease(draw / 0.2) : 1;
    ready = run.fromSheath ? 0 : 1;
  }
  const slide = sheathTravel() * exposed * (1 - ready);
  const mouth = [9 + shift * .82, -14 + lateral, 51 - drop].map(
    (n, i) => n + axis[i] * slide,
  );
  const drawn = mouth.map(
    (n, i) =>
      n - axis[i] * weapon.length * exposed - (i === 2 ? weapon.curve * exposed * exposed : 0),
  );
  let hand = blend3(drawn, readyHand, ready),
    yaw = mix(carryYaw, 0.16, ready),
    pitch = mix(carryPitch, 0.67, ready);
  if (midCut) {
    const side = run.fromSheath ? 1 : run.slashSide;
    // Move the grip around the body. The tip travels farther than the hands.
    const chamberAt = run.fromSheath ? move.start * 0.66 : 0;
    const wind = ease((age - chamberAt) / (move.start - chamberAt));
    const strike = ease((age - move.start) / (move.end - move.start));
    const recoverAt = move.end + 0.035;
    const settle = ease((age - recoverAt) / (move.duration - recoverAt));
    const handAngle = side * weapon.arc * mix(-0.9, 0.97, strike);
    const edge = ease((age - move.start - 0.012) / (move.end - move.start));
    let arcHand, arcYaw, arcPitch;
    if (run.combo) {
      const armAngle = mix(1.55, -0.88, strike);
      arcHand = [
        5 + shift + 28 * Math.cos(armAngle),
        2 + lateral + side * 2 * Math.sin(Math.PI * strike),
        75 + weapon.lift - drop + shrug + 28 * Math.sin(armAngle),
      ];
      arcYaw = move.finisher ? 0 : side * 0.12;
      arcPitch = mix(move.finisher ? 2.2 : 3.86, -0.41, edge);
    } else {
      // Each row defines grip height and edge pitch at the two ends of the cut.
      const profile = lightArcs[run.fromSheath ? 0 : run.lightVariant];
      arcHand = [
        5 + shift + 18 * Math.cos(handAngle),
        lateral + 18 * Math.sin(handAngle),
        mix(profile.high, profile.low, strike) + weapon.lift - drop + shrug,
      ];
      arcYaw = side * weapon.arc * mix(-1.72, 1.48, edge);
      arcPitch = mix(profile.fromPitch, profile.toPitch, edge);
    }
    // Lower the actual swing toward a short opponent, including the visible grip and edge.
    const low = move.lowAim || 0;
    const descend = run.combo ? strike : 1;
    arcHand[2] -= 14 * low * descend;
    arcPitch -= .31 * low * descend;
    drop += 5 * low * wind * (1 - settle) * descend;
    hand = blend3(blend3(hand, arcHand, wind), readyHand, settle);
    yaw = mix(mix(yaw, arcYaw, wind), 0.16, settle);
    pitch = mix(
      mix(pitch, arcPitch, run.combo ? ease((wind - 0.18) / 0.82) : wind),
      0.67,
      settle,
    );
    for (let i = 0; i < 3; i++)
      mouth[i] -= axis[i] * slide * wind;
  } else if (blocking) {
    const guard = ready * ease(parryAge / parryTiming.open) * (1 - ease((parryAge - parryTiming.close) / (parryTiming.recover - parryTiming.close)));
    coil = -0.32 * guard;
    drop = 3 * guard;
    hand = blend3(hand, [20, -7, 70], guard);
    exposed = Math.max(exposed, guard);
    reach = Math.max(reach, guard);
    yaw = mix(yaw, -0.9, guard);
    pitch = mix(pitch, 1, guard);
    if (sinceContact >= 0 && sinceContact < riposteWindow) {
      const beat = ease(sinceContact / .115) * (1 - ease((sinceContact - .76) / (riposteWindow - .76)));
      const side = run.deflectSide;
      hand = blend3(hand, [27, 15 * side, 66], beat);
      yaw += 1.35 * side * beat;
      pitch -= .48 * beat;
      coil += .65 * side * beat;
      lateral += 3.5 * side * beat;
    }
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
    carryReady: midCut ? mix(ready,1,ease((age-move.end)/(move.duration-move.end))) : ready,
    sheathHold: midCut ? (run.fromSheath ? 1-supportGrip : 0) : 1-ready,
    supportGrip: supportGrip,
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
  const length = weapon.length * p.exposed;
  return {
    mouth: world(p.mouth),
    shoe: along(p.mouth, p.sheathAxis, weapon.length + 2, weapon.curve),
    rear: along(p.tsuba, axis, -weapon.grip),
    grip: along(p.tsuba, axis, -Math.min(5,weapon.grip * .36)),
    guard: world(p.tsuba),
    middle: along(p.tsuba, axis, length * 0.55, weapon.curve * .30 * p.exposed * p.exposed),
    tip: along(p.tsuba, axis, length, weapon.curve * p.exposed * p.exposed),
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
  const elevation = groundHeight(d.x,(d.y-trackY)/depthRatio) - groundHeight(run.pos,(run.depth-trackY)/depthRatio);
  const facing = demonFacing(d);
  let back = 32, chest = 0;
  if (d.type === 0) {
    const { load, snap } = demonAttackPose(d);
    back = houndBackHeight(d, load, snap);
    if (tilt?.fall) chest = 6 * tilt.fall.brace * Math.min(1, tilt.fall.rise * 4);
  }
  const zones = d.type === 0
      ? [
          [.2, .47, -21, 11], [.2, .47, 14, 11],
          [.23, .4, -20, back-10], [.23, .4, 13, back-10],
          [.58, .72, -22, back + 2], [.6, .64, -9, back + 1],
          [.65, .86, 3, back + 2], [.72, .85, 14, back + 4 + chest],
          [.84, .59, 23, back + 11 + chest], [.91, .56, 30, back + 14 + chest],
          [.94, .37, 39, back + 10 + chest],
        ]
      : [
          [0.19, 0.77, 0],
          [0.4, 0.93, 0],
          [0.59, 1.02, 0],
          [0.76, 1.12, 0],
          [0.92, 0.75, 2],
        ];
  const sink = d.type === 0 ? 0 : impactDrop(d,run.phase)*(d.type===3 ? 1.17 : 1);
  let earliest = null;
  if (d.type>=2) zones.push([.62,.43,10,undefined,true]);
  for (const [level, size, forward, centerHeight, arm] of zones) {
    const limb = level < 0.25 && d.type !== 1;
    for (const side of limb || arm ? [-1, 1] : [0]) {
      const paw = d.type===0 && limb ? (side>0?2:0)+(forward>0?1:0) : null;
      if ((arm && d.missingArm===side) || (paw!==null && d.missingPaw===paw)) continue;
      const lateral = side * width * (arm ? 1.28 : .52);
      let x = forward * Math.cos(facing) - lateral * Math.sin(facing),
        y = forward * Math.sin(facing) + lateral * Math.cos(facing),
        z = centerHeight ?? height * level;
      z -= sink*Math.min(1,level/.45);
      if (tilt?.fall) z = loweredHeight(z, tilt.fall, d.type === 3 ? 1.17 : 1);
      if (tilt && z > tilt.pivot) {
        const h = z - tilt.pivot,
          along = x * tilt.nx + y * tilt.nz,
          off = along * (tilt.cos - 1) + h * tilt.sin;
        x += tilt.nx * off;
        y += tilt.nz * off;
        z = Math.max(1, tilt.pivot + h * tilt.cos - along * tilt.sin);
      }
      z += elevation;
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
          earliest = { i, t, dist, level, paw, arm:arm ? side : 0, x: px, y: py, z: pz };
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
