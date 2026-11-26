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
import { motion, ease, bladeSweep, swordContact, mix } from "./wanderer.js";
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
run.sound = false;
run.audio = undefined;
run.phase = 0;
run.last = 0;
let health = 100;
run.attackAt = -10;
run.dodgeAt = -10;
let hurtAt = -10;
let dodgeFace = 1;
let attackFace = 1;
run.spent = false;
run.depth = trackY;
let depthVelocity = 0;
run.heading = { x: 1, y: 0 };
run.attackDir = { x: 1, y: 0 };
let dashDir = { x: 1, y: 0 };
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
const cut = () => (run.fromSheath ? cuts : readyCuts)[run.combo];
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
function toggleBlade() {
  if (
    run.paused ||
    run.phase - run.bladeChanged < 0.48 ||
    run.windAt !== null ||
    run.phase - run.attackAt < cut().duration ||
    run.phase - Math.max(run.guardAt, run.dodgeAt, run.bladeChanged) < 0.48
  )
    return;
  run.cleanAt = -10;
  run.bladeOut = !run.bladeOut;
  run.bladeChanged = run.phase;
  ping(run.bladeOut ? 440 : 250);
  ui();
}
function drawSword() {
  if (
    run.paused ||
    run.phase - run.bladeChanged < 0.48 ||
    run.windAt !== null ||
    run.phase - run.attackAt < cut().duration ||
    run.phase - run.dodgeAt < 0.26 ||
    run.phase - run.guardAt < 0.24
  )
    return;
  run.windAt = run.phase;
}
function whisper(message) {
  feedback = message;
  feedbackUntil = run.phase + 1.15;
}
function parry() {
  if (
    run.paused ||
    run.phase - run.bladeChanged < 0.48 ||
    run.phase - run.guardAt < 0.68 ||
    run.phase - run.attackAt < cut().end ||
    run.phase - run.dodgeAt < 0.25 ||
    spirit < 9
  )
    return;
  run.cleanAt = -10;
  run.windAt = null;
  run.guardAt = run.phase;
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
  setText("#bladeState", run.bladeOut ? "Клинок обнажён" : "Клинок в ножнах");
  setText(
    "#notice",
    run.phase < feedbackUntil
      ? feedback
      : run.windAt !== null && run.phase - run.windAt >= 0.48
        ? "Отпустите · сильный разрез"
        : bellHint(),
  );
}
function interact() {
  if (run.paused) return;
  ringNearbyBell();
  ui();
}
function attack(requestedStyle) {
  if (run.windAt === null) return;
  const held = run.phase - run.windAt;
  run.windAt = null;
  if (run.paused) return;
  const style = requestedStyle ?? (held >= 0.48 ? 1 : 0);
  if (spirit < cuts[style].cost) {
    whisper("Дайте дыханию восстановиться");
    return;
  }
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
  const target = view.mouseLook
    ? { x: -Math.sin(view.cameraYaw), y: -Math.cos(view.cameraYaw) }
    : combatFacing(run.heading);
  strikeStartYaw = Math.atan2(run.heading.y, run.heading.x);
  const delta = Math.atan2(target.y, target.x) - strikeStartYaw;
  strikeTurn = Math.atan2(Math.sin(delta), Math.cos(delta));
  run.attackDir = { ...run.heading };
  attackFace = Math.sign(run.attackDir.x) || face;
  run.attackAt = run.phase;
  run.spent = false;
  ping(style ? 165 : 225);
}
function dodge() {
  if (
    run.paused ||
    run.phase - run.dodgeAt < 0.84 ||
    run.phase - run.attackAt < cut().end ||
    run.phase - run.guardAt < 0.25 ||
    spirit < 19
  )
    return;
  run.windAt = null;
  spirit -= 19;
  run.dodgeAt = run.phase;
  dodgeFace = face;
  const travelIntent = movementInput();
  dashDir =
    Math.hypot(travelIntent.x, travelIntent.y) > 0.1
      ? { ...travelIntent }
      : { ...run.heading };
  ping(170);
}
function modal(open) {
  resetMouse();
  run.windAt = null;
  run.paused = open;
  keys.clear();
  $(".overlay").hidden = !open;
  document.dispatchEvent(new CustomEvent("game:pause", { detail: open }));
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
function resume() {
  starting = false;
  if (won || dead) {
    const fallen = won ? [] : guards.map((d) => d.hp === 0);
    run.cleanAt = -10;
    run.fromSheath = true;
    run.impactPause = 0;
    heroMotion.recoil = null;
    run.bladeOut = false;
    run.bladeChanged = -10;
    run.opponent = null;
    resetScenery();
    spawnGuards();
    fallen.forEach((dead, i) => {
      if (dead) guards[i].hp = 0;
    });
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
      run.dodgeAt =
      hurtAt =
      motion.lastPick =
        -10;
    feedbackUntil = 0;
    run.spent = true;
    won = dead = false;
  }
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
  if (d.hp && d.fellAt !== undefined) return;
  const down = !d.hp || d.balanceDebt > 210;
  const duration = down ? 1.12 : leg ? 0.48 : 0.25;
  d.stunned = Math.max(d.stunned, run.phase + duration);
  d.wind = -10;
  d.chain = 0;
  d.ready = Math.max(d.ready, d.stunned + 0.12);
  d.turnAt = run.phase;
  d.hitTwist = Math.max(-0.65, Math.min(0.65, torque));
  if (down) {
    d.fellAt = run.phase;
    d.fallAngle = Math.atan2(z, x) + (leg ? 0.37 * torque : 0);
    d.fallTime = leg ? 0.32 : high ? 0.49 : 0.42;
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
  expireCombatFx();
  const bodies = startMotion(dt);
  if (run.phase - Math.max(run.attackAt, run.dodgeAt, run.guardAt) > 0.52)
    spirit = Math.min(100, spirit + dt * difficulty.breath);
  const dash = run.phase - run.dodgeAt < 0.26,
    swing = run.phase - run.attackAt < cut().end;
  const travel = movementInput();
  const norm = travel.x !== 0 || travel.y !== 0;
  const previousAim = run.attackDir;
  const attackAge = run.phase - run.attackAt;
  if (attackAge < cut().duration) {
    const yaw = strikeStartYaw + strikeTurn * ease(attackAge / cut().start);
    run.heading = run.attackDir = { x: Math.cos(yaw), y: Math.sin(yaw) };
  } else {
    run.heading = combatFacing(norm && !dash ? travel : run.heading);
  }
  face = Math.sign(run.heading.x) || face;
  const direction = dash ? dashDir : swing ? run.attackDir : travel;
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
  const speed = dash
    ? 920 * (1 - ease((run.phase - run.dodgeAt) / 0.26))
    : swing
      ? (push * cut().step * Math.PI) / (2 * (cut().end - cut().start))
      : run.windAt !== null
        ? 72
        : 196;
  const facingDot = direction.x * run.heading.x + direction.y * run.heading.y;
  const travelSpeed =
    (run.opponent || view.mouseLook) && !dash && !swing
      ? speed * (0.84 + 0.16 * facingDot)
      : speed;
  const vx = direction.x * travelSpeed,
    vz = direction.y * travelSpeed;
  const reversing = velocity * vx + depthVelocity * vz < 0;
  const rate = !norm && !swing ? 2300 : reversing ? 2700 : swing ? 1850 : 1560;
  const fraction = Math.min(
    1,
    (rate * dt) / (Math.hypot(vx - velocity, vz - depthVelocity) || 1),
  );
  velocity = dash ? vx : velocity + (vx - velocity) * fraction;
  depthVelocity = dash ? vz : depthVelocity + (vz - depthVelocity) * fraction;
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
  for (const d of guards) {
    if (!d.hp || !activeGuard(d)) continue;
    const traits = enemies[d.kind],
      dx = d.x - run.pos,
      dy = (d.y - run.depth) / depthRatio,
      dist = Math.hypot(dx, dy);
    const contact =
      !run.spent && !struck.has(d) && sweep.length
        ? swordContact(sweep, d)
        : null;
    if (contact) {
      struck.add(d);
      if (run.combo === 1) run.spent = true;
      const counter = run.phase < riposteUntil;
      const blocked =
        difficulty !== difficulties.easy &&
        d.type === 2 &&
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
        riposteUntil = -10;
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
    if (run.phase < d.stunned) continue;
    if (d.wind >= 0) {
      const windup = enemyWindup(d);
      if (d.type === 0 && run.phase - d.wind > windup * 0.52) {
        d.x += (d.aimX * dt * 215) / difficulty.windup;
        d.y = d.y + ((d.aimY * dt * 215) / difficulty.windup) * depthRatio;
      }
      if (run.phase - d.wind >= windup) {
        const inStrike =
          d.type === 1
            ? distanceTo(d.aimX, d.aimY) < 47
            : dist < traits.range + 20 && -dx * d.aimX - dy * d.aimY > -10;
        const canParry =
          d.type !== 1 &&
          run.phase - run.guardAt < 0.23 &&
          dx * run.heading.x + dy * run.heading.y > -15;
        if (inStrike && canParry) {
          impactFx(
            null,
            {
              x: run.pos + run.heading.x * 18,
              y: run.depth / depthRatio + run.heading.y * 18,
              z: 65,
            },
            run.heading.x,
            run.heading.y,
          );
          d.wind = -10;
          d.chain = 0;
          d.exposed = run.phase + 1.1;
          d.ready = d.exposed;
          spirit = Math.min(100, spirit + 23);
          riposteUntil = run.phase + 0.88;
          whisper("Парирование · ответьте катаной");
          ping(780);
          continue;
        }
        if (inStrike && !dash && run.phase - hurtAt > 0.42) {
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
          hurtAt = run.phase;
          ping(88);
          if (!health) {
            dead = true;
            modal(true);
            break;
          }
        }
        d.wind = -10;
        d.exposed = run.phase + traits.rest * difficulty.rest;
        d.ready = d.exposed;
        if (d.type === 3 && d.chain > 0) {
          d.chain--;
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
    (Math.min(1, distance / (dt * 180)) - motion.stride) *
    (1 - Math.exp(-dt * 14));
  if (!dash) motion.gait += (distance * Math.PI) / 48;
  settleRecoil(heroMotion, dt);
  for (const d of guards) {
    settleRecoil(d, dt);
    if (d.hp && d.fellAt !== undefined && run.phase - d.fellAt >= 1.12) {
      delete d.fellAt;
      d.feet = null;
    }
  }
  ui();
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
  dodge,
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
