import { knockdownDuration } from "./demon-fall.js";
import { deathDuration } from "./death.js";
import { rollDuration, rollCost, chargeDuration, riposteWindow, parryTiming } from "./combat-timing.js";
import { weapon } from "./weapons.js";
import { W } from "./config.js";
import { view, resetMouse } from "./game.js";
import {
  bodySizes,
  confine,
  bellHint,
  ringNearbyBell,
  heroMotion,
  resetScenery,
  startMotion,
  terrainSpeed,
  strikePots,
  resolveContacts,
} from "./valley.js";
import { chapterTitle } from "./lettering.js";
import { motion, ease, katanaPose, weaponGeometry, bladeSweep, swordContact, mix } from "./wanderer.js";
import { expireCombatFx, sampleBladeTrace, impactFx } from "./combat-fx.js";
import { roadZ } from "./world3d.js";
const run = {};
const trackY = 416;
const regions = [
  {
    name: "Кедровый тракт",
    color: "#303c32",
    camps: [
      [790, 45, 0, 0],
      [1580, -410, 1, 0],
      [2240, 820, 0, 2],
      [2680, -900, 1, 1],
      [3200, 100, 2, 0],
    ],
  },
  {
    name: "Каменные сады",
    color: "#423639",
    camps: [
      [3890, -40, 2, 1],
      [4430, 900, 2, 2],
      [4810, -1030, 1, 5],
      [5330, 5, 0, 4],
      [6180, -300, 4, 4],
      [6900, 35, 3, 2],
    ],
  },
  {
    name: "Тростниковый край",
    color: "#304344",
    camps: [
      [7690, 350, 1, 4],
      [8150, -700, 4, 4],
      [8650, 1380, 1, 1],
      [9240, 40, 5, 1],
      [9870, -1550, 4, 0],
      [10540, 760, 5, 4],
    ],
  },
  {
    name: "Пепельный кряж",
    color: "#493c32",
    camps: [
      [11390, 150, 2, 5],
      [12100, -840, 4, 5],
      [12460, 1220, 2, 2],
      [13120, 10, 3, 4],
      [13650, -1150, 5, 5],
      [14310, 330, 3, 5, 4],
    ],
  },
];
const regionIndex = (x) =>
  Math.min(
    regions.length - 1,
    Math.floor((Math.max(x, 0) * regions.length) / W),
  );
const keys = new Set(),
  guards = [];
const $ = (s) => document.querySelector(s);
run.pos = 350;
let cam = 0;
let face = 1;
let velocity = 0;
run.paused = false;
let won = false;
let dead = false;
run.fall = null;
run.sound = false;
run.audio = undefined;
run.phase = 0;
run.last = 0;
let health = 100;
run.attackAt = -10;
run.rollAt = -10;
let hurtAt = -10;
let riposteTarget = null;
let parryUsed = false;
let attackFace = 1;
run.spent = false;
run.depth = trackY;
let depthVelocity = 0;
run.heading = { x: 1, y: 0 };
run.attackDir = { x: 1, y: 0 };
run.rollDir = { x: 1, y: 0 };
const depthRatio = 0.6;
const species = [
  {
    name: "Пепельная гончая",
    speed: 147,
    range: 55,
    windup: 0.37,
    damage: 14,
    rest: 0.65,
  },
  {
    name: "Плакальщица",
    speed: 95,
    range: 118,
    windup: 0.9,
    damage: 21,
    rest: 1.15,
  },
  {
    name: "Костяной рыцарь",
    speed: 64,
    range: 84,
    windup: 0.76,
    damage: 32,
    rest: 1.0,
  },
  {
    name: "Алый воевода",
    speed: 139,
    range: 99,
    windup: 0.62,
    damage: 28,
    rest: 0.8,
  },
];
function distanceTo(x, y) {
  return Math.hypot(run.pos - x, (run.depth - y) / depthRatio);
}
function depthScale(y) {
  return 0.9 + (y - 374) * 0.0025;
}
let spirit = 100;
run.guardAt = -10;
run.deflectedAt = -10;
run.deflectSide = 1;
let riposteUntil = -10;
run.combo = 0;
let feedback = "";
let feedbackUntil = 0;
const difficulties = {
  easy: {
    incoming: 0.25,
    outgoing: 3,
    windup: 1.7,
    rest: 1.7,
    speed: 0.72,
    breath: 38,
    heal: 20,
    chain: 0,
    hint: "Слабые удары врагов. Победы восстанавливают здоровье.",
  },
  medium: {
    incoming: 1,
    outgoing: 1,
    windup: 1,
    rest: 1,
    speed: 1,
    breath: 23,
    heal: 0,
    chain: 1,
    hint: "Обычный темп боя. Следите за замахом противника.",
  },
  hard: {
    incoming: 1.5,
    outgoing: 1,
    windup: 0.77,
    rest: 0.72,
    speed: 1.14,
    breath: 18,
    heal: 0,
    chain: 2,
    hint: "Опасные удары, короткие передышки и длинные серии воеводы.",
  },
};
let difficulty = difficulties.medium,
  starting = true;
function chooseDifficulty(key) {
  difficulty = difficulties[key] || difficulties.medium;
  setText("#difficultyHint", difficulty.hint);
}
const cuts = [
  { duration: 0.76, start: 0.19, end: 0.36, cost: 12, step: 4, damage: 1 },
  { duration: 1.09, start: 0.36, end: 0.64, cost: 27, step: 7, damage: 3 },
];
const readyCuts = [
  { ...cuts[0], duration: 0.49, start: 0.115, end: 0.275 },
  { ...cuts[1], duration: 0.83, start: 0.23, end: 0.51 },
];
run.fromSheath = true;
run.slashSide = 1;
run.cleanAt = -10;
let activeCut = cuts[0];
const cut = () => activeCut;
const activeGuard = (d) =>
  Math.abs(d.x - run.pos) < 1400 && Math.abs(d.y - run.depth) < 850;
const enemies = [
  ...species,
  {
    ...species[0],
    name: "Тростниковый ловец",
    speed: 187,
    windup: 0.31,
    rest: 0.85,
  },
  {
    ...species[2],
    name: "Страж обсидиана",
    damage: 38,
    speed: 52,
    windup: 1.02,
    rest: 1.3,
  },
];
run.windAt = null;
run.lightVariant = 0;
let nextLight = 0;
let strikeStartYaw = 0;
let strikeTurn = 0;
const struck = new Set();
run.opponent = null;
function combatFacing(fallback) {
  if (view.mouseLook) {
    run.opponent = null;
    return fallback;
  }
  const eligible = (d) => d.hp > 0 && activeGuard(d);
  if (
    !run.opponent ||
    !eligible(run.opponent) ||
    distanceTo(run.opponent.x, run.opponent.y) > 305
  ) {
    run.opponent = null;
    let nearest = 225;
    for (const d of guards) {
      const distance = distanceTo(d.x, d.y);
      if (eligible(d) && distance < nearest) {
        nearest = distance;
        run.opponent = d;
      }
    }
  }
  if (!run.opponent) return fallback;
  const x = run.opponent.x - run.pos,
    y = (run.opponent.y - run.depth) / depthRatio,
    d = Math.hypot(x, y);
  return d > 0.01 ? { x: x / d, y: y / d } : fallback;
}
run.bladeOut = false;
run.bladeChanged = -10;
// Manual draws and returns keep their own tempo. A step already in flight
// supplies the first support beat of the change in posture.
let supportDelay = 0, turnFrom = 0;
function bladeDuration() { return run.bladeOut ? .82 : 1.02; }
export function bladeProgress() {
  return Math.max(0, Math.min(1, (run.phase-run.bladeChanged)/bladeDuration()));
}
export function combatStance() {
  const t = bladeProgress();
  const start = (run.bladeOut ? .09 : .18) + supportDelay;
  const weight = ease((t-start)/(1-start));
  return run.bladeOut ? weight : 1-weight;
}
function toggleBlade() {
  if (
    run.paused || run.fall ||
    bladeProgress() < 1 ||
    run.windAt !== null ||
    run.phase - run.attackAt < cut().duration ||
    run.phase - run.rollAt < rollDuration || run.phase - run.guardAt < parryTiming.recover
  )
    return;
  run.cleanAt = -10;
  riposteUntil = -10;
  run.bladeOut = !run.bladeOut;
  run.bladeChanged = run.phase;
  const rig = heroMotion.feet;
  supportDelay = rig ? Math.min(.22, Math.max(0, rig.duration-rig.time)/bladeDuration()) : 0;
  turnFrom = Math.atan2(run.heading.y,run.heading.x);
  ping(run.bladeOut ? 440 : 250);
  ui();
}
function drawSword() {
  if (
    run.paused || run.fall ||
    bladeProgress() < 1 ||
    run.windAt !== null ||
    (run.phase - run.attackAt < cut().duration && (!cut().entry || cut().interrupted || cut().queued !== undefined)) ||
    run.phase - run.rollAt < rollDuration ||
    run.phase - run.guardAt < parryTiming.recover && run.phase >= riposteUntil
  )
    return;
  if (riposteTarget?.hp > 0 && run.phase < riposteUntil) {
    const target = riposteTarget;
    const originPose = katanaPose(run.phase - run.attackAt);
    const tempo = .86 + .14 * weapon.tempo;
    activeCut = {
      duration: .34 * tempo, start: .035 * tempo, end: .175 * tempo,
      step: 20, damage: 1, cost: 0,
      riposte: { target, originPose, side: run.deflectSide, low: target.type === 0 }
    };
    strikeStartYaw = Math.atan2(run.heading.y, run.heading.x);
    const yaw = Math.atan2((target.y - run.depth) / depthRatio, target.x - run.pos);
    strikeTurn = Math.atan2(Math.sin(yaw - strikeStartYaw), Math.cos(yaw - strikeStartYaw));
    run.attackDir = { ...run.heading };
    run.fromSheath = false;
    run.combo = 0;
    run.attackAt = run.phase;
    run.guardAt = -10;
    run.cleanAt = -10;
    run.spent = false;
    struck.clear();
    riposteUntil = -10;
    riposteTarget = null;
    feedbackUntil = 0;
    ping(310);
    return;
  }
  run.windAt = run.phase;
}
function whisper(message) {
  feedback = message;
  feedbackUntil = run.phase + 1.15;
}
function parry() {
  if (
    run.paused || run.fall ||
    bladeProgress() < 1 ||
    run.phase - run.guardAt < 0.68 ||
    run.phase - run.attackAt < cut().end ||
    run.phase - run.rollAt < rollDuration ||
    spirit < 9
  )
    return;
  run.cleanAt = -10;
  run.windAt = null;
  run.attackAt = -10;
  riposteUntil = -10;
  parryUsed = false;
  run.deflectedAt = -10;
  run.bladeOut = true;
  run.bladeChanged = -10;
  run.guardAt = run.phase;
  delete activeCut.queued;
  spirit -= 9;
  ping(390);
}
function spawnGuards() {
  guards.length = 0;
  regions.forEach((region, index) => {
    for (const [x, z, ...pack] of region.camps)
      pack.forEach((kind, i) => {
        const type = kind === 4 ? 0 : kind === 5 ? 2 : kind,
          hp = [4, 5, 6, 12, 3, 8][kind];
        const body = {
          x: x + i * 62,
          z: z + (i % 2) * 38,
          r: bodySizes[type][0],
        };
        confine(body);
        const homeY = trackY + body.z * depthRatio;
        guards.push({
          home: body.x,
          homeY,
          type,
          kind,
          region: index,
          x: body.x,
          y: homeY,
          hp,
          max: hp,
          aimX: 0,
          aimY: 0,
          kickX: 0,
          kickZ: 0,
          stunned: 0,
          wind: -10,
          ready: 0.18 * i,
          flash: -10,
          dir: -1,
          exposed: 0,
          chain: 0,
        });
      });
  });
}
function ping(hz) {
  if (!run.sound || !run.audio) return;
  const o = run.audio.createOscillator(),
    v = run.audio.createGain();
  o.frequency.value = hz;
  v.gain.setValueAtTime(0.055, run.audio.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, run.audio.currentTime + 0.42);
  o.connect(v);
  v.connect(run.audio.destination);
  o.start();
  o.stop(run.audio.currentTime + 0.43);
}
function setText(selector, value) {
  let el = $(selector);
  if (el.textContent !== value) el.textContent = value;
}
function ui() {
  const index = regionIndex(run.pos),
    region = regions[index],
    locals = guards.filter((d) => d.region === index);
  const alive = guards.filter((d) => d.hp),
    near = locals.filter((d) => d.hp);
  const targetGuard = (near.length ? near : alive).reduce(
    (a, b) => (!a || distanceTo(b.x, b.y) < distanceTo(a.x, a.y) ? b : a),
    null,
  );
  const target = targetGuard?.x ?? run.pos,
    targetY = targetGuard?.y ?? run.depth;
  chapterTitle(region.name);
  setText("#act", "РЕГИОН " + (index + 1) + " / " + regions.length);
  setText("#zone", region.name.toUpperCase());
  $("#spirit").value = spirit;
  $("#chargeHud").hidden = run.windAt === null;
  if (run.windAt !== null) $("#charge").value = Math.min(1, (run.phase - run.windAt) / chargeDuration);
  setText("#count", String(guards.length - alive.length));
  setText("#total", String(guards.length));
  setText("#hp", health + " / 100");
  $("#life").value = health;
  setText(
    "#quest",
    near.length
      ? "Противники в регионе · " + near.length + " / " + locals.length
      : "Регион зачищен",
  );
  setText(
    "#dots",
    regions
      .map((r, i) => (guards.some((d) => d.region === i && d.hp) ? "◇" : "◆"))
      .join(" "),
  );
  const wx = target - run.pos,
    wz = (targetY - run.depth) / depthRatio;
  const horizontal =
      wx * Math.cos(view.cameraYaw) - wz * Math.sin(view.cameraYaw),
    vertical = wx * Math.sin(view.cameraYaw) + wz * Math.cos(view.cameraYaw);
  const arrow = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"][
    (Math.round((Math.atan2(vertical, horizontal) * 4) / Math.PI) + 8) % 8
  ];
  setText("#bearing", Math.round(Math.hypot(wx, wz) / 10) + " м " + arrow);
  setText("#bladeState", weapon.name + (run.bladeOut ? " · в руке" : " · в ножнах"));
  setText(
    "#notice",
    run.phase < feedbackUntil
      ? feedback
      : run.windAt !== null && run.phase - run.windAt >= chargeDuration
        ? "Отпустите · сильный разрез"
        : bellHint(),
  );
}
function interact() {
  if (run.paused || run.fall) return;
  ringNearbyBell();
  ui();
}
function attack(requestedStyle) {
  if (run.windAt === null) return;
  const held = run.phase - run.windAt;
  run.windAt = null;
  if (run.paused || run.fall) return;
  const style = requestedStyle ?? (held >= chargeDuration ? 1 : 0);
  const age = run.phase-run.attackAt;
  if (age < cut().duration && cut().entry) {
    if (!cut().interrupted && cut().queued === undefined) cut().queued = style;
    return;
  }
  startCut(style);
}
function startCut(style, previous = null) {
  const base = (run.bladeOut ? readyCuts : cuts)[style];
  const cost = Math.round(base.cost * weapon.tempo);
  if (spirit < cost) {
    whisper("Недостаточно выносливости");
    return;
  }
  const previousAge = run.phase-run.attackAt;
  const link = previous ? {
    pose: katanaPose(previousAge),
    guard: ease((previousAge-previous.end)/(previous.duration-previous.end)),
    lead: previous.entry.leadSide > 0 ? 0 : 1,
  } : null;
  activeCut = { ...base, cost, duration: base.duration * weapon.tempo,
    start: base.start * weapon.tempo, end: base.end * weapon.tempo,
    damage: base.damage * weapon.tempo, link };
  run.fromSheath = !run.bladeOut;
  run.bladeOut = true;
  run.bladeChanged = -10;
  run.slashSide = -run.slashSide;
  run.cleanAt = -10;
  run.combo = style;
  if (!style) {
    run.lightVariant = nextLight;
    nextLight = (nextLight + 1) % 3;
  }
  struck.clear();
  spirit -= cut().cost;
  strikeStartYaw = Math.atan2(run.heading.y, run.heading.x);
  strikeTurn = 0;
  if (style === 0) {
    const target = view.mouseLook
      ? { x: -Math.sin(view.cameraYaw), y: -Math.cos(view.cameraYaw) }
      : combatFacing(run.heading);
    const delta = Math.atan2(target.y, target.x) - strikeStartYaw;
    strikeTurn = Math.atan2(Math.sin(delta), Math.cos(delta));
  }
  const yaw = strikeStartYaw + strikeTurn;
  // Use this step's actual landing points in the direction of the cut.
  // An airborne foot finishes its arc; a planted foot stays where it is.
  const rig = heroMotion.feet;
  let lead = 1, landing = 0;
  if (rig) {
    const airborne = rig.time < rig.duration;
    const projection = rig.feet.map((foot,i) => {
      const swinging = airborne && rig.group === i;
      return (swinging ? foot.toX : foot.x)*Math.cos(yaw) +
        (swinging ? foot.toZ : foot.z)*Math.sin(yaw);
    });
    lead = projection[0] > projection[1] ? 0 : 1;
    if (airborne && lead === rig.group) landing = rig.duration-rig.time;
  }
  const contactBeat = activeCut.start + .46*(activeCut.end-activeCut.start);
  if (link && rig) {
    lead = link.lead;
    landing = contactBeat;
    const side = lead ? 1 : -1;
    const foot = rig.feet[lead];
    const forward = 16 + base.step*.5;
    rig.group = lead;
    rig.time = 0;
    rig.duration = contactBeat;
    rig.hasStepped = true;
    Object.assign(foot, {
      fromX:foot.x, fromZ:foot.z, fromHeight:foot.h,
      toX:rig.x+forward*Math.cos(yaw)-side*9*Math.sin(yaw),
      toZ:rig.z+forward*Math.sin(yaw)+side*9*Math.cos(yaw),
      clearance:5, walking:false,
    });
  }
  activeCut.entry = {vx:velocity, vz:depthVelocity, leadSide:lead ? 1 : -1,
    landAt:Math.min(landing,contactBeat), footRate:Math.max(1,landing/contactBeat)};
  let nearest = weapon.length + base.step + 58;
  activeCut.lowAim = 0;
  for (const d of guards) {
    if (!d.hp || !activeGuard(d)) continue;
    const dx = d.x - run.pos, dz = (d.y - run.depth) / depthRatio;
    const distance = Math.hypot(dx, dz);
    if (distance >= nearest || dx * Math.cos(yaw) + dz * Math.sin(yaw) < .72 * distance) continue;
    nearest = distance;
    activeCut.lowAim = d.fellAt !== undefined ? 1.4 : d.type === 0 ? 1 : 0;
  }
  run.attackDir = { ...run.heading };
  attackFace = Math.sign(run.attackDir.x) || face;
  run.attackAt = run.phase;
  run.spent = false;
  ping(style ? 165 : 225);
}
function roll() {
  if (
    run.paused || run.fall ||
    run.phase - run.rollAt < 0.84 ||
    run.phase - run.attackAt < cut().end ||
    run.phase - run.guardAt < 0.25 ||
    spirit < rollCost
  )
    return;
  run.windAt = null;
  run.attackAt = -10;
  riposteUntil = -10;
  spirit -= rollCost;
  run.rollAt = run.phase;
  delete activeCut.queued;
  run.cleanAt = -10;
  const travelIntent = movementInput();
  run.rollDir =
    Math.hypot(travelIntent.x, travelIntent.y) > 0.1
      ? { ...travelIntent }
      : { ...run.heading };
  ping(170);
}
function modal(open) {
  if (open) delete activeCut.queued;
  resetMouse();
  run.windAt = null;
  run.paused = open;
  keys.clear();
  $(".overlay").hidden = !open || dead;
  $("#chargeHud").hidden = true;
  $("#armory").hidden = !(starting || won || dead);
  document.dispatchEvent(new CustomEvent("game:pause", { detail: open }));
  if (open && dead) {
    document.dispatchEvent(new Event("game:defeat"));
    return;
  }
  setText(
    "#modalTitle",
    won
      ? "Все регионы зачищены"
      : dead
        ? "Клинок пал"
        : starting
          ? "Перед дорогой"
          : "Пауза",
  );
  setText(
    "#resume",
    won
      ? "Пройти снова"
      : dead
        ? "Вернуться на тракт"
        : starting
          ? "Начать игру"
          : "Продолжить",
  );
  setText("#pause", open ? "▷" : "Ⅱ");
}
function resetRun() {
  run.cleanAt = -10;
  run.fromSheath = true;
  run.impactPause = 0;
  heroMotion.recoil = null;
  run.bladeOut = false;
  run.bladeChanged = -10;
  run.opponent = null;
  resetScenery();
  spawnGuards();
  run.pos = 350;
  cam = Math.max(0, run.pos - 350);
  run.depth = trackY;
  run.heading = { x: 1, y: 0 };
  depthVelocity = 0;
  health = 100;
  velocity = 0;
  motion.stride = 0;
  motion.gait = 0;
  face = 1;
  spirit = 100;
  run.combo = 0;
  run.guardAt =
    riposteUntil =
    run.attackAt =
    run.rollAt =
    hurtAt =
    motion.lastPick =
      -10;
  feedbackUntil = 0;
  run.spent = true;
  won = dead = false;
  run.fall = null;
  run.deflectedAt = -10;
  riposteTarget = null;
  nextLight = 0;
  struck.clear();
}
export function returnToMenu() {
  resetRun();
  starting = true;
  ui();
  modal(true);
  $("#resume").focus();
}
function resume() {
  if (won || dead) resetRun();
  starting = false;
  modal(false);
  ui();
}
run.impactPause = 0;
function bodyImpact(actor, x, z, strength) {
  const length = Math.hypot(x, z) || 1;
  x /= length;
  z /= length;
  actor.kickX += x * strength;
  actor.kickZ += z * strength;
  const recoil = (actor.recoil ??= { x: 0, z: 0, vx: 0, vz: 0 });
  recoil.vx += x * strength * 0.037;
  recoil.vz += z * strength * 0.037;
  run.impactPause = Math.max(run.impactPause, strength > 160 ? 0.045 : 0.027);
}
function settleRecoil(actor, dt) {
  const r = actor.recoil;
  if (!r) return;
  // Damped angular spring: the chest lags the shove, then settles over the feet.
  for (const [angle, rate] of [
    ["x", "vx"],
    ["z", "vz"],
  ]) {
    r[rate] -= (110 * r[angle] + 13 * r[rate]) * dt;
    r[angle] = Math.max(-0.52, Math.min(0.52, r[angle] + r[rate] * dt));
  }
  if (Math.hypot(r.x, r.z, r.vx, r.vz) < 0.007) actor.recoil = null;
}
function unbalance(d, x, z, strength, level, torque = 0) {
  const airborne = d.feet?.feet.some((f) => f.h > 2);
  const leg = level < 0.44,
    high = level > 0.84;
  const debt =
    (d.balanceDebt || 0) *
    Math.exp(-3 * (run.phase - (d.balanceAt ?? run.phase)));
  d.balanceDebt =
    debt + strength * (leg ? 1.65 : high ? 1.38 : 1) * (airborne ? 1.18 : 1);
  d.balanceAt = run.phase;
  if (!d.hp && d.diedAt === undefined) d.diedAt = run.phase;
  if (d.fellAt !== undefined) return;
  const down = !d.hp || d.balanceDebt > 210;
  if (down) {
    d.fallTime = leg ? .37 : high ? .52 : .45;
    d.fallFacing = d.feet?.angle ?? Math.atan2((run.depth - d.y) / depthRatio, run.pos - d.x);
    d.fallSide = Math.sign(z * Math.cos(d.fallFacing) - x * Math.sin(d.fallFacing)) || Math.sign(torque) || 1;
  }
  const duration = down ? knockdownDuration(d) : leg ? 0.48 : 0.25;
  d.stunned = Math.max(d.stunned, run.phase + duration);
  d.wind = -10;
  d.chain = 0;
  d.ready = Math.max(d.ready, d.stunned + 0.12);
  d.turnAt = run.phase;
  d.hitTwist = Math.max(-0.65, Math.min(0.65, torque));
  if (down) {
    d.fellAt = run.phase;
    d.fallAngle = Math.atan2(z, x) + (leg ? 0.37 * torque : 0);

    d.balanceDebt = 0;
  }
}
function movementInput() {
  const move =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const vertical =
    Number(keys.has("KeyS") || keys.has("ArrowDown")) -
    Number(keys.has("KeyW") || keys.has("ArrowUp"));
  const norm = Math.hypot(move, vertical);
  return {
    x:
      (move * Math.cos(view.cameraYaw) + vertical * Math.sin(view.cameraYaw)) /
      (norm || 1),
    y:
      (vertical * Math.cos(view.cameraYaw) - move * Math.sin(view.cameraYaw)) /
      (norm || 1),
  };
}
function update(dt) {
  if (run.fall) {
    expireCombatFx();
    settleRecoil(heroMotion, dt);
    if (run.phase - run.fall.at >= deathDuration) {
      dead = true;
      modal(true);
    }
    return;
  }
  expireCombatFx();
  const bodies = startMotion(dt);
  if (run.phase - Math.max(run.attackAt, run.rollAt, run.guardAt) > rollDuration)
    spirit = Math.min(100, spirit + dt * difficulty.breath);
  const rolling = run.phase - run.rollAt < rollDuration,
    swing = run.phase - run.attackAt < cut().end;
  const travel = movementInput();
  const norm = travel.x !== 0 || travel.y !== 0;
  const previousAim = run.attackDir;
  const attackAge = run.phase - run.attackAt;
  if (attackAge < cut().duration) {
    const yaw = strikeStartYaw + strikeTurn * ease(attackAge / cut().start);
    run.heading = run.attackDir = { x: Math.cos(yaw), y: Math.sin(yaw) };
  } else if (!rolling && run.phase - run.guardAt >= parryTiming.recover) {
    const fallback = run.bladeOut
      ? {x: -Math.sin(view.cameraYaw), y: -Math.cos(view.cameraYaw)}
      : norm ? travel : run.heading;
    const target = combatFacing(fallback);
    if (bladeProgress() < 1) {
      const delta = Math.atan2(target.y,target.x)-turnFrom;
      const yaw = turnFrom + Math.atan2(Math.sin(delta),Math.cos(delta)) * ease(bladeProgress());
      run.heading = {x:Math.cos(yaw), y:Math.sin(yaw)};
    } else run.heading = target;
  }
  face = Math.sign(run.heading.x) || face;
  const direction = rolling ? run.rollDir : swing ? run.attackDir : travel;
  const age = run.phase - run.attackAt;
  const push = swing
    ? Math.max(
        0,
        Math.sin(
          Math.PI *
            Math.max(0, (age - cut().start) / (cut().end - cut().start)),
        ),
      )
    : 0;
  const speed = rolling
    ? 420 * Math.sin(Math.PI * (run.phase - run.rollAt) / rollDuration)
    : swing
      ? (push * cut().step * Math.PI) / (2 * (cut().end - cut().start))
      : run.windAt !== null
        ? 72
        : 88;
  const facingDot = direction.x * run.heading.x + direction.y * run.heading.y;
  const relaxedSpeed =
    (run.opponent || view.mouseLook) && !rolling && !swing
      ? speed * (0.84 + 0.16 * facingDot)
      : speed;
  const guardSpeed = facingDot >= 0 ? 46 + 20 * facingDot : 46 + 8 * facingDot;
  const travelSpeed = rolling || swing ? speed :
    mix(relaxedSpeed, Math.min(speed, guardSpeed), combatStance());
  let vx = direction.x * travelSpeed, vz = direction.y * travelSpeed;
  const entry = cut().entry;
  if (!rolling && entry && attackAge < cut().duration) {
    if (swing) {
      const carry = 1-ease(attackAge/(cut().start + .24*(cut().end-cut().start)));
      vx += entry.vx*carry;
      vz += entry.vz*carry;
    } else {
      const resume = ease((attackAge-cut().end)/(.7*(cut().duration-cut().end)));
      vx *= resume;
      vz *= resume;
    }
  }
  const reversing = velocity * vx + depthVelocity * vz < 0;
  const rate = !norm && !swing ? 2300 : reversing ? 2700 : swing ? 1850 : 1560;
  const fraction = Math.min(
    1,
    (rate * dt) / (Math.hypot(vx - velocity, vz - depthVelocity) || 1),
  );
  velocity = rolling ? vx : velocity + (vx - velocity) * fraction;
  depthVelocity = rolling ? vz : depthVelocity + (vz - depthVelocity) * fraction;
  const drag = terrainSpeed(run.pos, roadZ(run.depth));
  const old = run.pos,
    oldY = run.depth;
  run.pos = Math.max(20, Math.min(W - 20, run.pos + velocity * dt * drag));
  run.depth = run.depth + depthVelocity * dt * depthRatio * drag;
  if ((run.pos === 20 && velocity < 0) || (run.pos === W - 20 && velocity > 0))
    velocity = 0;
  sampleBladeTrace(age);
  const sweep = bladeSweep(
    run.phase - run.attackAt,
    dt,
    old,
    oldY,
    previousAim,
  );
  strikePots(sweep);
  // A heavy swing stops on its first contact, even if a farther enemy spawned first.
  let firstTarget, firstContact;
  if (sweep.length && run.combo === 1 && !run.spent) {
    for (const d of guards) {
      if (!d.hp || !activeGuard(d) || struck.has(d)) continue;
      const hit = swordContact(sweep, d);
      if (hit && (!firstContact || hit.i < firstContact.i ||
          (hit.i === firstContact.i && hit.t < firstContact.t))) {
        firstTarget = d;
        firstContact = hit;
      }
    }
  }
  for (const d of guards) {
    if (!d.hp || !activeGuard(d)) continue;
    const traits = enemies[d.kind],
      dx = d.x - run.pos,
      dy = (d.y - run.depth) / depthRatio,
      dist = Math.hypot(dx, dy);
    const contact =
      !run.spent && !struck.has(d) && sweep.length
        ? run.combo === 1 ? (d === firstTarget ? firstContact : null) : swordContact(sweep, d)
        : null;
    if (contact) {
      struck.add(d);
      if (run.combo === 1) run.spent = true;
      const counter = d === cut().riposte?.target;
      const blocked =
        difficulty !== difficulties.easy &&
        d.type === 2 &&
        d.fellAt === undefined &&
        run.phase > d.exposed &&
        d.wind < 0 &&
        -dx * d.dir > 0 &&
        !counter;
      if (blocked) {
        impactFx(null, contact, run.attackDir.x, run.attackDir.y);
        whisper("Щит · зайдите со спины или парируйте");
        ping(130);
      } else {
        const damage = (counter ? 3 : cut().damage) * difficulty.outgoing;
        d.hp = Math.max(0, d.hp - damage);
        d.flash = run.phase;
        if (counter) run.spent = true;
        // Compare the same point along the blade in adjacent sweep samples.
        const i = contact.i,
          t = contact.t;
        const earlier = sweep[i >= 2 ? i - 2 : i],
          later = sweep[i >= 2 ? i : i + 2];
        const sx = mix(later[0].x - earlier[0].x, later[1].x - earlier[1].x, t);
        const sz = mix(later[0].y - earlier[0].y, later[1].y - earlier[1].y, t);
        const travel = Math.hypot(sx, sz) || 1;
        const pushX = run.attackDir.x * 0.74 + (0.55 * sx) / travel,
          pushZ = run.attackDir.y * 0.74 + (0.55 * sz) / travel;
        const verticalTravel = mix(later[0].z - earlier[0].z, later[1].z - earlier[1].z, t);
        const speed = Math.hypot(sx, sz, verticalTravel) / Math.max(0.0001, sweep.sampleTime);
        const momentum = 0.55 + 0.65 * Math.min(1, speed / 820);
        const force = momentum *
          (counter ? 320 : run.combo === 1 ? 275 : 150) * bodySizes[d.type][1];
        impactFx(d, contact, pushX, pushZ);
        bodyImpact(d, pushX, pushZ, force);
        const torque =
          ((contact.x - d.x) * pushZ - (contact.y - d.y / depthRatio) * pushX) /
          22;
        unbalance(d, pushX, pushZ, force, contact.level, torque);
        if (run.combo === 1 && d.type !== 3) {
          d.wind = -10;
          d.ready = run.phase + 0.42;
          d.exposed = d.ready;
        }
        ping(d.hp ? 185 : 95);
        if (!d.hp) {
          health = Math.min(100, health + difficulty.heal);
          run.cleanAt = run.attackAt + cut().duration;
          if (guards.every((enemy) => !enemy.hp)) {
            won = true;
            modal(true);
          }
          continue;
        }
      }
    }
    if (d.fellAt !== undefined || run.phase < d.stunned) continue;
    if (d.wind >= 0) {
      const windup = enemyWindup(d);
      if (d.type === 0 && run.phase - d.wind > windup * 0.52) {
        d.x += (d.aimX * dt * 215) / difficulty.windup;
        d.y = d.y + ((d.aimY * dt * 215) / difficulty.windup) * depthRatio;
      }
      if (run.phase - d.wind >= windup) {
        d.struckAt = run.phase;
        const inStrike =
          d.type === 1
            ? distanceTo(d.aimX, d.aimY) < 47
            : d.type === 0 ? biteReachesPlayer(d)
            : dist < traits.range + 20 && -dx * d.aimX - dy * d.aimY > -10;
        const guardAge = run.phase - run.guardAt;
        const canParry = !parryUsed && !rolling &&
          d.type !== 1 &&
          guardAge >= parryTiming.open && guardAge <= parryTiming.close &&
          dx * run.heading.x + dy * run.heading.y >= dist * 0.5;
        if (inStrike && canParry) {
          run.deflectedAt = run.phase;
          run.deflectSide = dx * run.heading.y - dy * run.heading.x >= 0 ? 1 : -1;
          const blade = weaponGeometry(katanaPose(run.phase - run.attackAt), run.heading, run.pos, run.depth);
          impactFx(null, blade.middle, run.heading.x, run.heading.y);
          d.deflectedAt = run.phase;
          d.deflectSide = run.deflectSide;
          d.turnAt = run.phase;
          d.hitTwist = run.deflectSide * .48;
          bodyImpact(d, dx + run.heading.y * run.deflectSide * 18,
            dy - run.heading.x * run.deflectSide * 18, 84);
          d.wind = -10;
          d.chain = 0;
          d.staggerX = dx / (dist || 1);
          d.staggerZ = dy / (dist || 1);
          d.exposed = run.phase + riposteWindow;
          d.ready = d.exposed;
          d.stunned = d.exposed;
          riposteTarget = d;
          parryUsed = true;
          spirit = Math.min(100, spirit + 14);
          riposteUntil = d.exposed;
          whisper("ЛКМ · контратака");
          feedbackUntil = riposteUntil;
          ping(780);
          continue;
        }
        if (inStrike && !rolling && run.phase - hurtAt > 0.42) {
          impactFx(
            heroMotion,
            {
              x: run.pos + (dx / (dist || 1)) * 9,
              y: run.depth / depthRatio + (dy / (dist || 1)) * 9,
              z: [38, 66, 73, 79][d.type],
            },
            -dx,
            -dy,
          );
          health = Math.max(
            0,
            health - Math.round(traits.damage * difficulty.incoming),
          );
          bodyImpact(heroMotion, -dx, -dy, traits.damage * 4 + 55);
          run.windAt = null;
          run.spent = true;
          activeCut.interrupted = true;
          delete activeCut.queued;
          riposteUntil = -10;
          hurtAt = run.phase;
          ping(88);
          if (!health) {
            const x = dist > .001 ? -dx / dist : -run.heading.x;
            const z = dist > .001 ? -dy / dist : -run.heading.y;
            run.fall = {
              at: run.phase, x, z, heading: { ...run.heading },
              pose: katanaPose(run.phase - run.attackAt),
            };
            d.wind = -10;
            d.chain = 0;
            keys.clear();
            feedbackUntil = 0;
            ui();
            return;
          }
        }
        d.wind = -10;
        d.exposed = run.phase + traits.rest * difficulty.rest;
        d.ready = d.exposed;
        if (d.type === 3 && d.chain > 0) {
          d.chain--;
          d.reverse = !d.reverse;
          d.wind = run.phase;
          d.aimX = -dx / (dist || 1);
          d.aimY = -dy / (dist || 1);
        }
      }
    } else if (dist < traits.range && run.phase >= d.ready) {
      d.dir = Math.sign(-dx) || d.dir;
      d.wind = run.phase;
      d.chain =
        d.type === 3 && difficulty.chain
          ? difficulty.chain + Number(d.hp <= 6)
          : 0;
      d.aimX = d.type === 1 ? run.pos : -dx / (dist || 1);
      d.aimY = d.type === 1 ? run.depth : -dy / (dist || 1);
    } else if (run.phase - d.flash > 0.22) {
      const chase = distanceTo(d.home, d.homeY) < 350;
      let tx = chase ? run.pos : d.home - 50 + Math.sin(run.phase * 0.8) * 26,
        ty = chase ? run.depth : d.homeY;
      if (chase && dist < traits.range * 0.84) continue;
      const vx = tx - d.x,
        vy = (ty - d.y) / depthRatio,
        length = Math.hypot(vx, vy) || 1;
      const step = Math.min(
        length,
        dt *
          terrainSpeed(d.x, roadZ(d.y)) *
          (chase ? traits.speed * difficulty.speed : 32),
      );
      d.dir = Math.sign(vx) || d.dir;
      d.x += (step * vx) / length;
      d.y += ((step * vy) / length) * depthRatio;
    }
  }
  resolveContacts(bodies, dt);
  const distance = Math.hypot(run.pos - old, (run.depth - oldY) / depthRatio);
  motion.stride +=
    (Math.min(1, distance / (dt * 88)) - motion.stride) *
    (1 - Math.exp(-dt * 14));
  if (!rolling) motion.gait += (distance * Math.PI) / 48;
  settleRecoil(heroMotion, dt);
  for (const d of guards) {
    settleRecoil(d, dt);
    if (d.hp && d.fellAt !== undefined && run.phase - d.fellAt >= knockdownDuration(d)) {
      delete d.fellAt;
      d.feet = null;
    }
  }
  if (!run.paused && !rolling && activeCut.queued !== undefined && attackAge >= activeCut.end &&
      run.attackAt >= 0 && run.phase-run.guardAt >= parryTiming.recover) {
    const support = heroMotion.feet?.feet[activeCut.entry.leadSide > 0 ? 1 : 0];
    if (!support || support.h === 0) {
      const style = activeCut.queued;
      delete activeCut.queued;
      startCut(style, activeCut);
    }
  }
  ui();
}
function biteReachesPlayer(d) {
  const dx = run.pos - d.x, dz = (run.depth - d.y) / depthRatio;
  const jaw = Math.max(22, Math.min(43, dx * d.aimX + dz * d.aimY));
  return Math.hypot(dx - jaw * d.aimX, dz - jaw * d.aimY) <= 24;
}
function enemyWindup(d) {
  const base =
    d.type === 3 ? (d.hp <= 6 ? 0.43 : 0.58) : enemies[d.kind].windup;
  return base * difficulty.windup;
}

export {
  resume,
  $,
  chooseDifficulty,
  toggleBlade,
  run,
  modal,
  interact,
  parry,
  roll,
  ping,
  drawSword,
  attack,
  keys,
  update,
  setText,
  cut,
  depthRatio,
  trackY,
  guards,
  activeGuard,
  whisper,
  unbalance,
  regions,
  distanceTo,
  regionIndex,
  enemyWindup,
  enemies,
  spawnGuards,
  ui,
};
