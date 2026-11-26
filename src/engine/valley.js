import { loweredHeight } from "./demon-fall.js";
import { W } from "./config.js";

import { mix, edgeHits } from "./wanderer.js";
import { hitParticles, bladeTrace } from "./combat-fx.js";
import {
  trackY,
  depthRatio,
  run,
  ping,
  guards,
  activeGuard,
  whisper,
  unbalance,
  regions,
} from "./journey.js";
import { roadZ, impactTilt } from "./world3d.js";
import { advanceFeet } from "./footing.js";

const borderZ = 2280;
// One storey in the smallest shrine clears a standing, 102-unit character.
const buildings = [
  [880, -395, 3],
  [2680, -1205, 3.1],
  [4330, 1240, 2.85],
  [6930, -365, 3.8],
  [11030, 1360, 3.2],
  [14380, -490, 3.7],
];
const trails = [
  [
    [60, 0],
    [350, 0],
    [970, 60],
    [1390, -50],
    [2150, 30],
    [3140, 100],
    [3950, -35],
    [4660, 95],
    [5310, 0],
    [5850, -160],
    [6200, -300],
    [6630, -100],
    [6930, 13],
    [7310, 160],
    [7690, 350],
    [8400, 230],
    [9240, 40],
    [10150, 200],
    [11390, 150],
    [12200, -35],
    [13120, 10],
    [14310, 330],
    [14620, 400],
  ],
  [
    [970, 60],
    [1530, -370],
    [1780, -820],
    [2290, -1020],
    [2690, -910],
    [3200, -820],
    [3630, -490],
    [3950, -35],
  ],
  [
    [350, 0],
    [590, 400],
    [960, 760],
    [1640, 970],
    [2220, 830],
    [2770, 590],
    [3140, 100],
  ],
  [
    [2770, 590],
    [3370, 880],
    [3940, 1010],
    [4450, 900],
    [4740, 620],
    [5070, 370],
    [5310, 0],
  ],
  [
    [3200, -820],
    [3710, -1180],
    [4650, -1090],
    [5060, -770],
    [5510, -470],
    [5850, -160],
  ],
  [
    [5310, 0],
    [5650, 470],
    [6110, 900],
    [6610, 1080],
    [7040, 790],
    [7310, 160],
  ],
  [
    [6200, -300],
    [6010, -800],
    [6360, -1120],
    [6940, -1050],
    [7210, -680],
    [7320, -280],
    [7310, 160],
  ],
];
trails.push(
  [
    [7690, 350],
    [8150, -700],
    [8770, -1370],
    [9870, -1550],
    [10560, -670],
    [11390, 150],
  ],
  [
    [7690, 350],
    [8120, 1040],
    [8650, 1380],
    [9480, 1550],
    [10540, 760],
    [11390, 150],
  ],
  [
    [9240, 40],
    [9480, 780],
    [9480, 1550],
  ],
  [
    [11390, 150],
    [12100, -840],
    [12700, -1420],
    [13650, -1150],
    [14460, -960],
    [14620, 400],
  ],
  [
    [11390, 150],
    [11860, 810],
    [12460, 1220],
    [13420, 1540],
    [14310, 330],
  ],
);
const ponds = [
  [1190, 520, 425, 210],
  [2450, -480, 450, 230],
  [3960, 500, 560, 250],
  [4480, -660, 550, 260],
  [6450, 530, 590, 285],
  [8580, -430, 560, 355],
  [9840, -790, 670, 310],
  [8750, 810, 450, 285],
  [10420, 1450, 440, 230],
];
const gridStep = 10,
  gridW = Math.ceil(W / gridStep),
  gridH = Math.ceil((2 * borderZ) / gridStep);
const terrain = new Uint8Array(gridW * gridH);
function stampTerrain(x0, z0, x1, z1, test, kind) {
  for (
    let j = Math.max(0, Math.floor((z0 + borderZ) / gridStep));
    j < gridH && (j + 0.5) * gridStep - borderZ <= z1;
    j++
  ) {
    const z = (j + 0.5) * gridStep - borderZ;
    for (
      let i = Math.max(0, Math.floor(x0 / gridStep));
      i < gridW && (i + 0.5) * gridStep <= x1;
      i++
    ) {
      if (test((i + 0.5) * gridStep, z)) terrain[j * gridW + i] = kind;
    }
  }
}
for (const path of trails)
  for (let n = 1; n < path.length; n++) {
    const [x, z] = path[n - 1],
      [u, v] = path[n],
      dx = u - x,
      dz = v - z,
      length = dx * dx + dz * dz;
    const width = path === trails[0] ? 65 : 47;
    stampTerrain(
      Math.min(x, u) - width,
      Math.min(z, v) - width,
      Math.max(x, u) + width,
      Math.max(z, v) + width,
      (px, pz) => {
        const t = Math.max(
          0,
          Math.min(1, ((px - x) * dx + (pz - z) * dz) / length),
        );
        return (px - x - t * dx) ** 2 + (pz - z - t * dz) ** 2 < width * width;
      },
      1,
    );
  }
// Distances to the bank are sampled at grid centres and interpolated for rendering.
const shoreField = new Int16Array(gridW * gridH).fill(-160);
function bankRadius(a, x) {
  return (
    1 +
    0.055 * Math.sin(3 * a + x * 0.026) +
    0.032 * Math.sin(5 * a - x * 0.011) +
    0.018 * Math.cos(8 * a)
  );
}
for (const [x, z, rx, rz] of ponds) {
  stampTerrain(
    x - rx * 1.15 - 40,
    z - rz * 1.15 - 40,
    x + rx * 1.15 + 40,
    z + rz * 1.15 + 40,
    (px, pz) => {
      const u = (px - x) / rx,
        v = (pz - z) / rz;
      const distance =
        (bankRadius(Math.atan2(v, u), x) - Math.hypot(u, v)) * rz;
      const index =
        Math.floor((pz + borderZ) / gridStep) * gridW +
        Math.floor(px / gridStep);
      shoreField[index] = Math.max(shoreField[index], Math.round(distance));
      return distance > 0;
    },
    2,
  );
}
function bankDistance(x, z) {
  const gx = x / gridStep - 0.5,
    gz = (z + borderZ) / gridStep - 0.5,
    i = Math.floor(gx),
    j = Math.floor(gz);
  if (i < 0 || j < 0 || i + 1 >= gridW || j + 1 >= gridH) return -160;
  const k = j * gridW + i;
  if (shoreField[k] === -160) return -160;
  return mix(
    mix(shoreField[k], shoreField[k + 1], gx - i),
    mix(shoreField[k + gridW], shoreField[k + gridW + 1], gx - i),
    gz - j,
  );
}
function groundKind(x, z) {
  if (x < 0 || x >= W || Math.abs(z) >= borderZ) return 0;
  return terrain[
    Math.floor((z + borderZ) / gridStep) * gridW + Math.floor(x / gridStep)
  ];
}
// All contact distances are in world units, including the depth axis.
const bodySizes = [
  [27, 0.9],
  [20, 1.15],
  [29, 0.43],
  [33, 0.3],
];
const heroMotion = { kickX: 0, kickZ: 0 };
const bells = [
  [1300, 5],
  [2620, -876],
  [4370, 850],
  [6110, -245],
  [8120, -795],
  [10430, 720],
  [12170, -750],
  [14190, 365],
].map(([x, z]) => ({ x, z, last: -20 }));
const jars = [],
  shards = [],
  obstacles = new Map();
function addPost(x, z, r) {
  const id = Math.floor(x / 100);
  if (!obstacles.has(id)) obstacles.set(id, []);
  obstacles.get(id).push({ x, z, r });
}
function terrainSpeed(x, z) {
  return groundKind(x, z) === 2 ? 0.65 : 1;
}
const waterRings = [];
function resetScenery() {
  hitParticles.length = bladeTrace.length = 0;
  heroMotion.wounds = [];
  heroMotion.wakeAt = -10;
  waterRings.length = 0;
  heroMotion.feet = null;
  jars.length = 0;
  shards.length = 0;
  heroMotion.kickX = heroMotion.kickZ = 0;
  for (const bell of bells) {
    bell.last = -20;
    for (const [dx, dz] of [
      [-31, 22],
      [20, 28],
    ]) {
      jars.push({
        x: bell.x + dx,
        y: trackY + (bell.z + dz) * depthRatio,
        kickX: 0,
        kickZ: 0,
        broken: false,
        hitRadius: 13,
        hitHeight: 46,
      });
    }
  }
}
function nearBell() {
  return bells.find(
    (b) => Math.hypot(run.pos - b.x, roadZ(run.depth) - b.z) < 55,
  );
}
function bellHint() {
  const b = nearBell();
  return !b
    ? ""
    : run.phase - b.last >= 8
      ? "[ E ] Ударить в колокол"
      : "Колокол ещё звучит";
}
function ringNearbyBell() {
  const b = nearBell();
  if (!b) return false;
  if (run.phase - b.last < 8) return true;
  b.last = run.phase;
  ping(215);
  for (const d of guards) {
    if (!d.hp || !activeGuard(d)) continue;
    const dx = d.x - b.x,
      dz = roadZ(d.y) - b.z,
      r = Math.hypot(dx, dz);
    if (r > 165) continue;
    d.stunned = run.phase + (d.type === 3 ? 0.48 : 1.1);
    d.wind = -10;
    d.chain = 0;
    d.exposed = d.ready = d.stunned;
    const push = (125 * bodySizes[d.type][1]) / (r || 1);
    d.kickX += dx * push;
    d.kickZ += dz * push;
  }
  whisper("Звон · демоны рядом сбиты с атаки");
  return true;
}
function strikePots(sweep) {
  if (!sweep.length) return;
  for (const jar of jars) {
    if (jar.broken || !sweep.some((edge) => edgeHits(edge, jar))) continue;
    jar.broken = true;
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      shards.push({
        x: jar.x,
        z: roadZ(jar.y),
        h: 14 + i * 2,
        vx: Math.cos(a) * 58 + run.attackDir.x * 55,
        vz: Math.sin(a) * 56 + run.attackDir.y * 55,
        vh: 55 + i * 8,
        ttl: 3,
      });
    }
    ping(430);
  }
}
function startMotion(dt) {
  while (waterRings.length && run.phase - waterRings[0].at > 1)
    waterRings.shift();
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.ttl -= dt;
    if (s.ttl <= 0) {
      shards.splice(i, 1);
      continue;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.h += s.vh * dt;
    s.vh -= 360 * dt;
    if (s.h < 1) {
      s.h = 1;
      s.vh = Math.abs(s.vh) * 0.25;
      s.vx *= 0.6;
      s.vz *= 0.6;
    }
  }
  function body(ref, x, y, r, inv) {
    return {
      ref,
      oldX: x,
      oldZ: roadZ(y),
      x,
      z: roadZ(y),
      r,
      inv,
      vx: 0,
      vz: 0,
    };
  }
  const result = [body(heroMotion, run.pos, run.depth, 19, 0.72)];
  for (const d of guards)
    if ((d.hp || run.phase - (d.diedAt ?? d.fellAt) < 1) && activeGuard(d))
      result.push(body(d, d.x, d.y, ...bodySizes[d.type]));
  for (const j of jars) if (!j.broken) result.push(body(j, j.x, j.y, 13, 1.75));
  return result;
}

function confine(b) {
  b.x = Math.max(b.r, Math.min(W - b.r, b.x));
  b.z = Math.max(-borderZ + b.r, Math.min(borderZ - b.r, b.z));
  const bin = Math.floor(b.x / 100);
  for (let k = bin - 1; k <= bin + 1; k++)
    for (const p of obstacles.get(k) || []) {
      const dx = b.x - p.x,
        dz = b.z - p.z,
        r = b.r + p.r;
      if (Math.abs(dx) >= r || Math.abs(dz) >= r) continue;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        b.x += (d ? dx / d : 1) * (r - d);
        b.z += (d ? dz / d : 0) * (r - d);
      }
    }
  for (const [x, z, s] of buildings) {
    const ex = 103 * s,
      ez = 83 * s,
      dx = b.x - x,
      dz = b.z - z;
    const ox = dx - Math.max(-ex, Math.min(ex, dx)),
      oz = dz - Math.max(-ez, Math.min(ez, dz));
    const len = Math.hypot(ox, oz);
    if (len >= b.r) continue;
    if (len > 0.001) {
      b.x += (ox * (b.r - len)) / len;
      b.z += (oz * (b.r - len)) / len;
    } else if (ex - Math.abs(dx) < ez - Math.abs(dz))
      b.x = x + (Math.sign(dx) || 1) * (ex + b.r);
    else b.z = z + (Math.sign(dz) || 1) * (ez + b.r);
  }
}
// A falling body presents a second contact circle at its shoulders. Sample
// the segment between hips and shoulders so crossing bodies also make contact.
function collisionSpan(b) {
  const d = b.ref;
  if (d.fellAt === undefined) return { x: 0, z: 0 };
  const tilt = impactTilt(d, 0),
    reach = loweredHeight([37, 70, 77, 89][d.type], tilt.fall, d.type === 3 ? 1.17 : 1) * tilt.sin;
  return { x: tilt.nx * reach, z: tilt.nz * reach };
}
function confineBody(b) {
  confine(b);
  if (!b.span) return;
  for (const t of [0.5, 1]) {
    const x = b.x + t * b.span.x,
      z = b.z + t * b.span.z;
    const probe = { x, z, r: b.r * 0.87 };
    confine(probe);
    b.x += probe.x - x;
    b.z += probe.z - z;
  }
  confine(b);
}
function contactShock(d, x, z, strength) {
  if (
    d.type === undefined ||
    !d.hp ||
    run.phase - (d.bumpAt ?? -10) < 0.2 ||
    strength < 48
  )
    return;
  d.bumpAt = run.phase;
  const r = (d.recoil ??= { x: 0, z: 0, vx: 0, vz: 0 });
  r.vx += x * strength * 0.024;
  r.vz += z * strength * 0.024;
  unbalance(d, x, z, strength, 0.62);
}
function resolveContacts(snapshot = startMotion(0), dt = 0.01) {
  const bodies = snapshot.filter(
    (b) => (b.ref.hp !== 0 || run.phase - (b.ref.diedAt ?? b.ref.fellAt) < 1) && !b.ref.broken,
  );
  for (const b of bodies) {
    const r = b.ref,
      isHero = r === heroMotion;
    b.x = isHero ? run.pos : r.x;
    b.z = roadZ(isHero ? run.depth : r.y);
    b.vx = (b.x - b.oldX) / dt + r.kickX;
    b.vz = (b.z - b.oldZ) / dt + r.kickZ;
    b.x += r.kickX * dt;
    b.z += r.kickZ * dt;
    const drag = Math.exp(-dt * (groundKind(b.x, b.z) === 2 ? 13 : 8));
    r.kickX *= drag;
    r.kickZ *= drag;
    b.span = r.fellAt !== undefined ? collisionSpan(b) : null;
    const beforeX = b.x,
      beforeZ = b.z;
    confineBody(b);
    const cx = b.x - beforeX,
      cz = b.z - beforeZ,
      correction = Math.hypot(cx, cz);
    if (correction > 0.001 && (r.recoil || b.span)) {
      const nx = cx / correction,
        nz = cz / correction,
        speed = -(nx * b.vx + nz * b.vz);
      contactShock(r, nx, nz, speed);
    }
    if ((beforeX - b.x) * r.kickX > 0) r.kickX *= 0.15;
    if ((beforeZ - b.z) * r.kickZ > 0) r.kickZ *= 0.15;
  }
  for (let pass = 0; pass < 256; pass++) {
    let overlap = 0;
    for (const b of bodies) confineBody(b);
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i],
          b = bodies[j];
        let dx = b.x - a.x,
          dz = b.z - a.z,
          len = Math.hypot(dx, dz),
          gap = a.r + b.r - len;
        if (a.span || b.span) {
          for (const ta of a.span ? [0, 0.5, 1] : [0])
            for (const tb of b.span ? [0, 0.5, 1] : [0]) {
              const x =
                b.x + (b.span?.x || 0) * tb - a.x - (a.span?.x || 0) * ta;
              const z =
                b.z + (b.span?.z || 0) * tb - a.z - (a.span?.z || 0) * ta;
              const distance = Math.hypot(x, z),
                over = a.r * (ta ? 0.87 : 1) + b.r * (tb ? 0.87 : 1) - distance;
              if (over > gap) {
                dx = x;
                dz = z;
                len = distance;
                gap = over;
              }
            }
        }
        if (gap <= 0.002) continue;
        const nx = len > 0.001 ? dx / len : 0,
          nz = len > 0.001 ? dz / len : 1;
        if (pass === 0) {
          const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (closing > 0) {
            if (a.ref.recoil || a.span) contactShock(b.ref, nx, nz, closing);
            if (b.ref.recoil || b.span) contactShock(a.ref, -nx, -nz, closing);
            const impulse = Math.min(220, closing * 0.72) / (a.inv + b.inv);
            for (const [body, sign] of [
              [a, -1],
              [b, 1],
            ]) {
              const j = sign * impulse * body.inv;
              body.ref.kickX += nx * j;
              body.ref.kickZ += nz * j;
              body.vx += nx * j;
              body.vz += nz * j;
            }
          }
        }
        const shift = (gap + 0.001) / (a.inv + b.inv);
        a.x -= nx * shift * a.inv;
        a.z -= nz * shift * a.inv;
        b.x += nx * shift * b.inv;
        b.z += nz * shift * b.inv;
        // A pinned body transfers its unused displacement to its neighbour.
        const ax = a.x,
          az = a.z,
          bx = b.x,
          bz = b.z;
        confineBody(a);
        confineBody(b);
        const pinnedA = Math.max(0, (a.x - ax) * nx + (a.z - az) * nz);
        const pinnedB = Math.max(0, (bx - b.x) * nx + (bz - b.z) * nz);
        b.x += nx * pinnedA;
        b.z += nz * pinnedA;
        a.x -= nx * pinnedB;
        a.z -= nz * pinnedB;
        overlap = Math.max(overlap, gap);
      }
    if (overlap < 0.004) break;
  }
  for (const b of bodies) {
    confineBody(b);
    if (
      b.ref !== undefined &&
      (b.ref === heroMotion || b.ref.type !== undefined) &&
      Math.hypot(b.x - b.oldX, b.z - b.oldZ) > dt * 24 &&
      run.phase - (b.ref.wakeAt ?? -10) > 0.24 &&
      bankDistance(b.x, b.z) > 2
    ) {
      waterRings.push({ x: b.x, z: b.z, at: run.phase });
      b.ref.wakeAt = run.phase;
      if (waterRings.length > 24) waterRings.shift();
    }
    if (b.ref.fellAt === undefined) advanceFeet(b, dt);
    if (b.ref === heroMotion) {
      run.pos = b.x;
      run.depth = trackY + b.z * depthRatio;
    } else {
      b.ref.x = b.x;
      b.ref.y = trackY + b.z * depthRatio;
    }
  }
}
const mapCanvas = document.querySelector("#valley-map"),
  mapInk = mapCanvas.getContext("2d");
const mapX = (x) => 5 + (x / W) * (mapCanvas.width - 10),
  mapY = (z) => 5 + ((z + borderZ) / (2 * borderZ)) * (mapCanvas.height - 10);
let mapBackground;
function buildMapBackground() {
  const layer = document.createElement("canvas");
  layer.width = mapCanvas.width;
  layer.height = mapCanvas.height;
  const g = layer.getContext("2d");
  regions.forEach((region, i) => {
    const left = mapX((i * W) / regions.length),
      right = mapX(((i + 1) * W) / regions.length);
    g.fillStyle = region.color;
    g.fillRect(left, 5, right - left, mapCanvas.height - 10);
    if (i) {
      g.fillStyle = "#887e73";
      g.fillRect(left, 5, 1, mapCanvas.height - 10);
    }
  });
  for (const path of trails) {
    g.strokeStyle = "#685e60";
    g.lineWidth = 1.5;
    g.beginPath();
    path.forEach(([x, z], i) =>
      i ? g.lineTo(mapX(x), mapY(z)) : g.moveTo(mapX(x), mapY(z)),
    );
    g.stroke();
  }
  for (const [x, z, rx, rz] of ponds) {
    g.fillStyle = "#47595e";
    g.beginPath();
    for (let j = 0; j <= 48; j++) {
      const a = (j * Math.PI) / 24,
        r = bankRadius(a, x),
        px = mapX(x + rx * r * Math.cos(a)),
        py = mapY(z + rz * r * Math.sin(a));
      j ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.fill();
  }
  for (const [x, z, s] of buildings) {
    g.fillStyle = "#aa8971";
    g.fillRect(
      mapX(x - 103 * s),
      mapY(z - 83 * s),
      (206 * s * (mapCanvas.width - 10)) / W,
      (166 * s * (mapCanvas.height - 10)) / (2 * borderZ),
    );
  }
  return layer;
}
function drawMap() {
  if (
    !mapBackground ||
    mapBackground.width !== mapCanvas.width ||
    mapBackground.height !== mapCanvas.height
  )
    mapBackground = buildMapBackground();
  const g = mapInk;
  g.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  g.drawImage(mapBackground, 0, 0);
  for (const bell of bells) {
    g.fillStyle = run.phase - bell.last < 8 ? "#746558" : "#b98c62";
    g.fillRect(mapX(bell.x) - 1, mapY(bell.z) - 1, 2, 2);
  }
  for (const d of guards)
    if (d.hp) {
      g.fillStyle = d.type === 3 ? "#ffbf71" : "#a85752";
      g.fillRect(mapX(d.x) - 1, mapY(roadZ(d.y)) - 1, 3, 3);
    }
  g.save();
  g.translate(mapX(run.pos), mapY(roadZ(run.depth)));
  g.rotate(Math.atan2(run.heading.y, run.heading.x));
  g.fillStyle = "#ffebba";
  g.beginPath();
  g.moveTo(5, 0);
  g.lineTo(-3, 3);
  g.lineTo(-2, 0);
  g.lineTo(-3, -3);
  g.fill();
  g.restore();
}

export {
  drawMap,
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
  addPost,
  buildings,
  bells,
  groundKind,
  borderZ,
  trails,
  ponds,
  bankRadius,
  bankDistance,
  jars,
  shards,
  waterRings,
};
