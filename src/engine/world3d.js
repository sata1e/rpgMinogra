import { knockdownPose, loweredHeight } from "./demon-fall.js";
import { fallPose } from "./death.js";
import { attackPhases } from "./enemy-attacks.js";
import { rollDuration, riposteWindow, parryTiming } from "./combat-timing.js";
import { weapon } from "./weapons.js";
import {
  clamp01,
  mix,
  blend3,
  motion,
  katanaPose,
  weaponGeometry,
  ease,
} from "./wanderer.js";
import {
  addPost,
  buildings,
  bells,
  groundKind,
  groundHeight,
  borderZ,
  trails,
  ponds,
  bankRadius,
  heroMotion,
  bankDistance,
  jars,
  shards,
  waterRings,
} from "./valley.js";
import { W } from "./config.js";
import { view, canvas, ctx } from "./game.js";
import {
  regionIndex,
  trackY,
  depthRatio,
  run,
  cut,
  combatStance,
  combatOpponent,
  enemyWindup,
  guards,
  activeGuard,
  enemies,
} from "./journey.js";
import {
  sculpt,
  ovalMesh,
  houndModel,
  mournerModel,
  armoredModel,
} from "./creatures.js";
import { localFoot, humanFeet } from "./footing.js";
import { drawWounds, drawCombatFx } from "./combat-fx.js";
import { enemyLabels } from "./bestiary.js";
const scene = {};
// Each depth sample is a square art pixel. Surfaces use world-anchored
// patterns and short colour ramps, then recede into cool atmospheric haze.
const pigment = [
  "282c32",
  "616565",
  "a69884",
  "d8c8a1",
  "aa4435",
  "ffd287",
  "536b58",
  "e4ebdf",
  "586a76",
  "ea795b",
  "77959a",
  "f4c48d",
  "a7834e",
  "454e46",
  "526f77",
  "354e63",
  "e4a17a",
  "ead8ab",
  "a84232",
  "73867b",
  "475a60",
  "76594c",
  "68665d",
  "80745a",
  "344d44",
  "20272d",
  "c58662",
  "577083",
  "f5f4ea",
  "b9c4c7",
  "414950",
  "965f44",
  "edc865",
  "392925",
  "b53e43",
  "702930",
  "36585c",
  "70958a",
  "766f59",
];
const roninInk = { 0: 25, 1: 15, 2: 16, 3: 17, 4: 18, 7: 7, 14: 27 };
const colours = pigment.map((hex, m) => {
  const rgb = [0, 2, 4].map((j) => parseInt(hex.slice(j, j + 2), 16)),
    lut = new Uint32Array(32 * 16);
  for (let fog = 0; fog < 16; fog++)
    for (let i = 0; i < 32; i++) {
      let f = i / 31,
        air = fog / 19;
      const shadow = m === 10 ? [22, 40, 48] : [15, 24, 30];
      if (m === 5 || m === 11) f = 0.32 + 0.68 * f;
      const c = rgb.map((v, k) =>
        Math.round(
          (shadow[k] + (v - shadow[k]) * f) * (1 - air) +
            [103, 125, 125][k] * air,
        ),
      );
      lut[fog * 32 + i] = 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0];
    }
  return lut;
});
let cols = 0,
  rows = 0,
  frameImage,
  imageWords,
  depths,
  materials,
  lights,
  fine;
function hashPixel(x, z) {
  let h = Math.imul(x | 0, 1597334677) ^ Math.imul(z | 0, 3812015801);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}
// Clustered marks give stone chips and needles a shape wider than one pixel.
const grain = new Int8Array(128 * 128);
for (let z = 0; z < 128; z++)
  for (let x = 0; x < 128; x++) {
    const broad = (hashPixel(x >> 2, z >> 1) % 5) - 2;
    grain[z * 128 + x] = broad + (hashPixel(x, z) % 11 === 0 ? 3 : 0);
  }
let meshes = [];
scene.faces = [];
let origin = [0, 0, 0];
let orientation = 0;
scene.unit = 1;
function place(x, z, rot = 0, scale = 1, base = groundHeight(x,z)) {
  origin = [x, base, z];
  orientation = rot;
  scene.unit = scale;
}
let groundPose = null, shoePitch = null;
let bodyTilt = null,
  torsoPose = null;
function worldPoint([x, y, z]) {
  if (shoePitch) {
    const f=x-shoePitch.x, h=y-shoePitch.y;
    x=shoePitch.x+f*shoePitch.cos-h*shoePitch.sin;
    y=shoePitch.y+f*shoePitch.sin+h*shoePitch.cos;
  }
  if (bodyTilt?.fall) y = loweredHeight(y, bodyTilt.fall);
  if (torsoPose) {
    const blend = clamp01((y - 48 + torsoPose.drop) / 30);
    y += torsoPose.shrug * blend;
    z += torsoPose.lateral * (1 - 0.27 * blend);
  }
  if (groundPose?.chin) {
    const h = y - groundPose.chin.y, f = x - groundPose.chin.x;
    x = groundPose.chin.x + f * groundPose.chin.cos + h * groundPose.chin.sin;
    y = groundPose.chin.y + h * groundPose.chin.cos - f * groundPose.chin.sin;
  }
  const c = Math.cos(orientation),
    s = Math.sin(orientation);
  let dx = scene.unit * (x * c - z * s),
    dz = scene.unit * (x * s + z * c),
    height = scene.unit * y;
  if (bodyTilt) {
    const { nx, nz, sin, cos, pivot } = bodyTilt;
    const above = height - pivot;
    if (above > 0) {
      const along = dx * nx + dz * nz,
        offset = along * (cos - 1) + above * sin;
      dx += nx * offset;
      dz += nz * offset;
      height = Math.max(1, pivot + above * cos - along * sin);
    }
  }
  if (groundPose) {
    const {x, y, bankCos, bankSin} = groundPose;
    const side = -dx * y + dz * x;
    const up = height - 36;
    const lean = side * (bankCos - 1) - up * bankSin;
    dx -= y * lean;
    dz += x * lean;
    height = 36 + side * bankSin + up * bankCos;
    const forward = dx * x + dz * y;
    const h = height - 36;
    const shift = forward * (groundPose.cos - 1) + h * groundPose.sin;
    dx += x * shift;
    dz += y * shift;
    height = 36 + h * groundPose.cos - forward * groundPose.sin;
    const vertex = [origin[0] + dx, origin[1] + height, origin[2] + dz];
    groundPose.vertices.push(vertex);
    if (groundPose.bodyContact) groundPose.lowest = Math.min(groundPose.lowest, height);
    return vertex;
  }
  return [origin[0] + dx, origin[1] + height, origin[2] + dz];
}
function triangle(a, b, c, m, detail = false, glow = 0) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  // Rings run clockwise from below. Invert their normal for a consistent key light.
  const key = Math.max(0, (-nx * 0.44 + ny * 0.78 - nz * 0.44) / len);
  const fill = Math.abs(ny / len) * 0.9;
  const light = Math.max(
    0,
    Math.min(7, Math.round(1.7 + key * 3.9 + fill + glow)),
  );
  scene.faces.push([a, b, c, m, light, detail]);
}
function panel(points, m, detail = false, glow = 0) {
  const vs = points.map(worldPoint);
  for (let i = 1; i < vs.length - 1; i++)
    triangle(vs[0], vs[i], vs[i + 1], m, detail, glow);
}
function hull(rings, m, n = 8, detail = false, glow = 0) {
  const rr = rings.map(([x, y, z, rx, rz]) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i + 0.5) * 2 * Math.PI) / n;
      return [x + Math.cos(a) * rx, y, z + Math.sin(a) * rz];
    }),
  );
  const vertices = rr.map((row) => row.map(worldPoint));
  for (let j = 1; j < vertices.length; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n,
        a = vertices[j - 1],
        b = vertices[j];
      triangle(a[i], a[k], b[k], m, detail, glow);
      triangle(a[i], b[k], b[i], m, detail, glow);
    }
  const cap = vertices.at(-1);
  for (let i = 1; i < n - 1; i++)
    triangle(cap[0], cap[i], cap[i + 1], m, detail, glow);
}
function box(x, y, z, w, h, d, m, detail = false, glow = 0) {
  hull(
    [
      [x, y, z, w * 0.7071, d * 0.7071],
      [x, y + h, z, w * 0.7071, d * 0.7071],
    ],
    m,
    4,
    detail,
    glow,
  );
}
function rod(a, b, r, m, detail = false, glow = 0) {
  const v = b.map((e, i) => e - a[i]),
    n = Math.hypot(...v) || 1;
  const right = Math.abs(v[1]) < n * 0.9 ? [v[2], 0, -v[0]] : [v[1], -v[0], 0];
  const length = Math.hypot(...right) || 1;
  for (let i = 0; i < 3; i++) right[i] *= r / length;
  const up = [
    v[1] * right[2] - v[2] * right[1],
    v[2] * right[0] - v[0] * right[2],
    v[0] * right[1] - v[1] * right[0],
  ].map((k) => k / n);
  const points = [right, up, right.map((k) => -k), up.map((k) => -k)];
  for (let i = 0; i < 4; i++) {
    const e = points[i],
      f = points[(i + 1) % 4];
    panel(
      [
        a.map((k, j) => k + e[j]),
        a.map((k, j) => k + f[j]),
        b.map((k, j) => k + f[j]),
        b.map((k, j) => k + e[j]),
      ],
      m,
      detail,
      glow,
    );
  }
}
let seed3 = 762;
function noise3() {
  seed3 = (Math.imul(seed3, 1664525) + 1013904223) >>> 0;
  return seed3 / 4294967296;
}
function model(x, z, draw, r = 170, scale = 1) {
  scene.faces = [];
  place(x, z, 0, scale);
  draw();
  const lookup = new Map(),
    vertices = [],
    triangles = new Uint32Array(scene.faces.length * 3);
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < scene.faces.length; i++)
    for (let k = 0; k < 3; k++) {
      const v = scene.faces[i][k];
      let at = lookup.get(v);
      if (at === undefined) {
        at = vertices.length;
        lookup.set(v, at);
        vertices.push(v);
        for (let j = 0; j < 3; j++) {
          lo[j] = Math.min(lo[j], v[j]);
          hi[j] = Math.max(hi[j], v[j]);
        }
      }
      triangles[i * 3 + k] = at;
    }
  const center = lo.map((v, i) => (v + hi[i]) * 0.5);
  const full = { vertices, triangles, faces: scene.faces };
  const levels = [0, 3, 8, 18, 40].map((step) =>
    step ? simplifyMesh(full, step) : full,
  );
  const mesh = {
    lo, hi, center, id: meshes.length,
    radius: Math.hypot(hi[0] - center[0], hi[1] - center[1], hi[2] - center[2]),
    levels,
  };
  meshes.push(mesh);
  return mesh;
}
// Collapse subpixel features into shared vertices for distant scenery and reflections.
function simplifyMesh(mesh, step) {
  const cells = new Map(),
    vertices = [],
    faces = [],
    indices = [],
    remap = [];
  for (const v of mesh.vertices) {
    const key = v.map((n) => Math.round(n / step)).join(",");
    let index = cells.get(key);
    if (index === undefined) {
      index = vertices.length;
      cells.set(key, index);
      vertices.push(v);
    }
    remap.push(index);
  }
  for (let i = 0; i < mesh.faces.length; i++) {
    const a = remap[mesh.triangles[i * 3]],
      b = remap[mesh.triangles[i * 3 + 1]],
      c = remap[mesh.triangles[i * 3 + 2]];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
    faces.push(mesh.faces[i]);
  }
  return { vertices, triangles: Uint32Array.from(indices), faces };
}
function shrine() {
  box(0, 0, 0, 206, 9, 166, 1);
  for (let j = 0; j < 3; j++) {
    const y = 9 + j * 56,
      w = 173 - j * 35,
      d = w * 0.77;
    box(0, y, 0, w * 0.81, 44, d * 0.81, 21);
    for (let k = -2; k <= 2; k++) {
      box(k * w * 0.135, y + 8, d * 0.412, w * 0.094, 29, 2, 5, false, 2);
      box(k * w * 0.135, y + 8, d * 0.425, 2, 29, 2, 0);
      box(k * w * 0.135, y + 21, d * 0.425, w * 0.094, 2, 2, 0);
    }
    for (const side of [-1, 1]) {
      for (let k = -4; k <= 4; k++) {
        const x = k * w * 0.103;
        rod(
          [x * 0.64, y + 68, side * d * 0.06],
          [x, y + 48, side * d * 0.61],
          1.4,
          1,
        );
      }
      box(0, y + 5, side * d * 0.5, w * 0.96, 2.4, 3, 4);
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1])
        box(side * w * 0.41, y, end * d * 0.42, 6, 49, 6, 4);
    for (const side of [-1, 1]) {
      const rim = [
        [-w * 0.64, y + 52, side * d * 0.65],
        [-w * 0.39, y + 46, side * d * 0.63],
        [0, y + 45, side * d * 0.63],
        [w * 0.39, y + 46, side * d * 0.63],
        [w * 0.64, y + 52, side * d * 0.65],
      ];
      for (let k = 0; k < 4; k++) {
        const a = rim[k],
          b = rim[k + 1];
        panel([a, b, [b[0] * 0.59, y + 70, 0], [a[0] * 0.59, y + 70, 0]], 20);
        rod(a, b, 2, 2);
      }
      panel(
        [
          [side * w * 0.64, y + 52, -d * 0.65],
          [side * w * 0.64, y + 52, d * 0.65],
          [side * w * 0.38, y + 70, 0],
        ],
        20,
      );
    }
  }
  for (let k = 0; k < 4; k++)
    box(0, k * 2.3, 97 - k * 4, 65 - k * 3, 2.4, 9, 1);
  for (const x of [-83, 83]) {
    rod([x, 47, 52], [x, 38, 52], 1.4, 2);
    hull(
      [
        [x, 24, 52, 4, 4],
        [x, 27, 52, 8, 8],
        [x, 35, 52, 8, 8],
        [x, 38, 52, 4, 4],
      ],
      5,
      8,
      false,
      2,
    );
    for (const y of [25, 36]) box(x, y, 52, 9, 2, 9, 0);
    rod([x, 24, 52], [x, 19, 52], 1.2, 4);
  }
  // Bronze rings of the pagoda finial and the lower veranda balustrade.
  rod([0, 189, 0], [0, 222, 0], 1.8, 12);
  for (let k = 0; k < 7; k++)
    hull(
      [
        [0, 193 + k * 3.2, 0, 6 - k * 0.58, 6 - k * 0.58],
        [0, 194 + k * 3.2, 0, 5.8 - k * 0.58, 5.8 - k * 0.58],
      ],
      12,
      12,
    );
  for (const side of [-1, 1]) {
    box(side * 57, 20, 66, 63, 2, 3, 4);
    for (let k = 0; k < 7; k++)
      box(side * (28 + k * 9), 9, 66, 2.6, 13, 2.6, 4);
    for (let k = 0; k < 4; k++)
      box(side * 69, 16, -44 + k * 28, 2, 24, 18, 5, false, 1);
  }
}
function torii() {
  for (const sign of [-1, 1])
    addPost(origin[0] + sign * 42 * scene.unit, origin[2], 5 * scene.unit);
  for (const x of [-42, 42]) {
    box(x, 0, 0, 9, 106, 9, 4);
    box(x, 0, 0, 14, 14, 14, 0);
  }
  box(0, 80, 0, 112, 7, 9, 4);
  box(0, 104, 0, 132, 6, 12, 4);
  rod([-72, 114, 0], [-46, 110, 0], 4, 0);
  rod([-46, 110, 0], [46, 110, 0], 4, 0);
  rod([46, 110, 0], [72, 114, 0], 4, 0);
  // A sagging shimenawa with folded paper shide beneath the crossbeam.
  for (let j = -4; j < 4; j++) {
    const x = j * 10,
      y = 73 + Math.abs(j) * 1.3,
      ny = 73 + Math.abs(j + 1) * 1.3;
    rod([x, y, 5], [x + 10, ny, 5], 1.35, 12);
    if (j % 2 === 0)
      panel(
        [
          [x, y, 5],
          [x + 3, y, 5],
          [x + 2, y - 4, 5],
          [x + 4, y - 4, 5],
          [x + 1, y - 10, 5],
          [x - 1, y - 6, 5],
        ],
        3,
      );
  }
}
function pine() {
  addPost(origin[0], origin[2], 6 * scene.unit);
  rod([0, 0, 0], [7, 75, 1], 5, 0);
  rod([7, 75, 1], [-4, 140, 5], 3, 1);
  for (let j = 0; j < 7; j++) {
    const a = j * 2.2,
      h = 40 + j * 14,
      l = 42 - j * 3,
      x = Math.cos(a) * l,
      z = Math.sin(a) * l;
    rod([4, h, 0], [x, h + 13, z], 3, 1);
    hull(
      [
        [x, h + 11, z, l * 0.75, l * 0.66],
        [x - 2, h + 18, z, l * 0.9, l * 0.77],
        [x, h + 26, z, l * 0.21, l * 0.18],
      ],
      6,
      8,
    );
    for (let k = 0; k < 6; k++) {
      const b = k * 2.4 + j,
        r = l * (0.55 + 0.18 * Math.sin(k + j)),
        xx = x + Math.cos(b) * r,
        zz = z + Math.sin(b) * r;
      hull(
        [
          [xx, h + 10 + (k % 3), zz, l * 0.37, l * 0.3],
          [xx - 2, h + 17 + (k % 3), zz, l * 0.5, l * 0.36],
          [xx, h + 21 + (k % 4), zz, l * 0.1, l * 0.12],
        ],
        k % 3 ? 6 : 24,
        6,
      );
    }
  }
}
function buildScenery() {
  for (const [x, z, s] of buildings) model(x, z, shrine, 260, s);
  for (const [x, z, s] of [
    [730, 22, 1.85],
    [5310, 0, 2.5],
    [6160, -280, 1.95],
    [2350, -1000, 1.9],
    [4160, 965, 1.85],
    [11170, 145, 2.4],
    [14220, 320, 2.1],
  ])
    model(x, z, torii, 170, s);
  function clearScenery(x, z, margin) {
    if (
      buildings.some(
        ([bx, bz, s]) =>
          Math.abs(x - bx) < 115 * s + margin &&
          Math.abs(z - bz) < 91 * s + margin,
      )
    )
      return false;
    if (bells.some((b) => Math.hypot(b.x - x, b.z - z) < 75 + margin))
      return false;
    return [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ].every(([dx, dz]) => groundKind(x + dx, z + dz) === 0);
  }
  function cedar() {
    const h = 225 + noise3() * 100;
    addPost(origin[0], origin[2], 9 * scene.unit);
    hull(
      [
        [0, 0, 0, 11, 10],
        [2, h * 0.58, 1, 6, 5],
        [1, h * 0.92, 2, 1, 1],
      ],
      21,
      7,
    );
    for (let j = 0; j < 4; j++) {
      const y = h * (0.23 + j * 0.15),
        r = 48 - j * 7;
      hull(
        [
          [1, y, 1, r * 0.82, r],
          [3, y + 10, 0, r, r * 0.95],
          [0, y + h * 0.29, 1, 2, 2],
        ],
        j % 2 ? 6 : 24,
        8,
      );
    }
  }
  // Leave junctions and lake approaches open. Taller cedar stands outline the basin.
  for (let x = 120; x < W - 80; x += 260)
    for (let z = -borderZ + 80; z < borderZ - 60; z += 250) {
      const px = x + noise3() * 170 - 85,
        pz = z + noise3() * 150 - 75;
      if (!clearScenery(px, pz, 60) || noise3() < 0.36) continue;
      const specimen = noise3();
      if (regionIndex(px) === 3) {
        model(
          px,
          pz,
          () => {
            const h = 55 + noise3() * 145;
            hull(
              [
                [0, 0, 0, 37, 30],
                [2, h * 0.65, 1, 26, 20],
                [8, h, 4, 12, 9],
              ],
              20,
              6,
            );
            hull(
              [
                [30, 0, 12, 22, 18],
                [33, h * 0.43, 12, 14, 12],
                [39, h * 0.56, 13, 6, 5],
              ],
              1,
              5,
            );
            addPost(px, pz, 33);
          },
          220,
        );
        continue;
      }
      if (regionIndex(px) === 2 && specimen < 0.78) {
        model(
          px,
          pz,
          () => {
            for (let k = 0; k < 12; k++) {
              const x = noise3() * 45,
                z = noise3() * 32,
                h = 45 + noise3() * 67;
              rod([x, 0, z], [x + 9, h, z], 1.5, 6);
              rod([x + 9, h, z], [x + 12, h + 10, z], 2.6, 12);
            }
          },
          130,
        );
        continue;
      }
      if (specimen < 0.12) model(px, pz, pine, 185, 1.55 + noise3() * 0.6);
      else if (specimen < 0.86)
        model(px, pz, cedar, 360, 0.85 + noise3() * 0.5);
      else
        model(
          px,
          pz,
          () => {
            hull(
              [
                [0, 0, 0, 42, 31],
                [4, 23, 1, 38, 28],
                [-6, 46, 3, 20, 15],
              ],
              1,
              7,
            );
            addPost(px, pz, 32);
          },
          65,
        );
    }
  for (let x = -1500; x < W + 1800; x += 300) {
    for (const side of [-1, 1]) {
      const z = side * (borderZ + 650 + noise3() * 650),
        h = 460 + noise3() * 590;
      model(
        x,
        z,
        () =>
          hull(
            [
              [0, -20, 0, 520, 400],
              [-75, h * 0.4, 10, 350, 250],
              [35, h, 0, 10, 9],
            ],
            8,
            7,
          ),
        700,
      );
    }
  }
  // Stone lanterns alternate along the main road, following its bends.
  for (let n = 1; n < trails[0].length; n++) {
    const [x, z] = trails[0][n - 1],
      [u, v] = trails[0][n],
      len = Math.hypot(u - x, v - z);
    for (let d = 120; d < len; d += 245) {
      const px = x + ((u - x) * d) / len,
        pz = z + ((v - z) * d) / len + (n % 2 ? -91 : 91);
      model(
        px,
        pz,
        () => {
          addPost(px, pz, 12);
          hull(
            [
              [0, 0, 0, 15, 15],
              [0, 7, 0, 15, 15],
              [0, 11, 0, 7, 7],
              [0, 52, 0, 6, 6],
              [0, 58, 0, 15, 15],
            ],
            1,
            6,
          );
          box(0, 58, 0, 16, 17, 16, 5, false, 2);
          for (const i of [-1, 1])
            for (const j of [-1, 1]) box(i * 8, 57, j * 8, 3, 19, 3, 2);
          hull(
            [
              [0, 75, 0, 19, 19],
              [0, 80, 0, 16, 16],
              [0, 89, 0, 3, 3],
              [0, 95, 0, 2, 2],
            ],
            1,
            6,
          );
        },
        100,
      );
    }
  }
  for (let x = 3850; x < 4350; x += 38 + noise3() * 44)
    model(x, 1110 + noise3() * 90, () => {
      box(0, 0, 0, 25, 7, 19, 1);
      hull(
        [
          [0, 6, 0, 11, 7],
          [1, 48, 0, 10, 6],
          [2, 55, 0, 4, 4],
        ],
        2,
        5,
      );
    });
  for (let x = 5740; x < 6700; x += 17) {
    const z = -490 - noise3() * 200;
    if (!clearScenery(x, z, 16)) continue;
    model(
      x,
      z,
      () => {
        const h = 220 + noise3() * 130;
        addPost(x, z, 3);
        rod([0, 0, 0], [9, h, 3], 3.1, 6);
        for (let j = 2; j < 8; j++) {
          const y = (h * j) / 8;
          rod([(9 * j) / 8 - 3, y, 1], [(9 * j) / 8 + 3, y, 2], 1.7, 24);
          panel(
            [
              [j, y, 2],
              [j + 29, y + 18, 4],
              [j + 10, y + 5, 7],
            ],
            6,
          );
        }
      },
      365,
    );
  }
  // Low roadside clusters vary in scale without covering the playable lane.
  for (let x = -100; x < W; x += 68 + noise3() * 60) {
    const side = noise3() < 0.5 ? -1 : 1,
      z = side < 0 ? -87 - noise3() * 32 : 164 + noise3() * 46;
    model(
      x,
      z,
      () => {
        for (let j = 0; j < 7; j++) {
          const a = noise3() * 6.28,
            cx = noise3() * 28 - 14,
            cz = noise3() * 12 - 6,
            h = 7 + noise3() * 15;
          const tip = [cx + Math.cos(a) * 8, h, cz + Math.sin(a) * 8];
          panel([[cx - 1, 0, cz], [cx + 2, 0, cz], tip], 13);
          if (j % 3 === 0) rod(tip, [tip[0] + 2, h + 4, tip[2]], 1.4, 12);
        }
        hull(
          [
            [0, 0, 0, 10, 7],
            [2, 5, 0, 8, 6],
            [4, 8, 1, 3, 3],
          ],
          1,
          5,
        );
      },
      38,
    );
  }
  // Reeds, weathered standing stones and tied offerings mark the valley loops.
  for (const [px, pz, rx, rz] of ponds) {
    for (let j = 0; j < 22; j++) {
      const a = j * 2.4;
      const radius = bankRadius(a, px),
        x = px + Math.cos(a) * rx * radius,
        z = pz + Math.sin(a) * rz * radius;
      model(
        x,
        z,
        () => {
          if (j % 3 === 0) {
            for (let n = 0; n < 5; n++) {
              const dx = noise3() * 23 - 11,
                dz = noise3() * 15 - 7,
                r = 3 + noise3() * 9;
              hull(
                [
                  [dx, -1, dz, r, r * 0.8],
                  [dx + 1, r * 0.28, dz, r * 0.9, r * 0.7],
                  [dx + 2, r * 0.48, dz, r * 0.42, r * 0.33],
                ],
                n % 3 ? 1 : 24,
                7,
              );
            }
          }
          for (let k = 0; k < 4; k++) {
            const h = 10 + noise3() * 16,
              x = noise3() * 11,
              z = noise3() * 7;
            rod([x, 0, z], [x + 4, h, z], 1.1, 6);
            rod([x + 4, h, z], [x + 6, h + 4, z], 1.5, 12);
          }
        },
        30,
      );
    }
  }
  // Loose stones sit partly in the soil on the shoulders of each trail.
  for (const trail of trails) {
    for (let i = 1; i < trail.length; i++) {
      const [ax, az] = trail[i-1], [bx, bz] = trail[i];
      const length = Math.hypot(bx-ax, bz-az);
      for (let t = 70; t < length; t += 170) {
        const offset = (noise3() < .5 ? -1 : 1) * (23 + noise3()*36);
        const x = ax + ((bx-ax)*t - (bz-az)*offset)/length;
        const z = az + ((bz-az)*t + (bx-ax)*offset)/length;
        if (bankDistance(x,z) > -20) continue;
        model(x,z,()=>{
          for (let j = 0; j < 4; j++) {
            const dx = noise3()*38-19, dz = noise3()*29-14, r = 2+noise3()*5;
            const base = groundHeight(x+dx,z+dz)-origin[1];
            hull([[dx,base-1,dz,r,r*.73],[dx+1,base+r*.48,dz,r*.79,r*.61],
              [dx+1.6,base+r*.73,dz-1,r*.32,r*.28]], j%3===0 ? 14 : 1, 5);
          }
        },35);
      }
    }
  }
  // Deadfall in the forest, balanced stone stacks in the gardens, and driftwood at the lakes.
  for (let x = 330; x < W; x += 230) {
    const z = (noise3() - 0.5) * borderZ * 1.65;
    if (!clearScenery(x, z, 44)) continue;
    model(
      x,
      z,
      () => {
        if (regionIndex(x) % 2 === 0) {
          rod([-25, 6, -3], [30, 9, 8], 6.5, 21);
          rod([3, 7, 2], [15, 21, -6], 2.8, 21);
          for (let j = 0; j < 7; j++) {
            const a = j * 0.9,
              c = Math.cos(a),
              v = Math.sin(a);
            panel(
              [
                [0, 1, 0],
                [12 * c + 3, 13, 12 * v],
                [20 * c, 10, 20 * v],
                [11 * c - 3, 12, 11 * v],
              ],
              6,
            );
          }
        } else {
          for (let j = 0; j < 4; j++) {
            const r = 16 - j * 3,
              y = j * 7;
            hull(
              [
                [j, y, 1, r * 0.8, r * 0.7],
                [j, y + 3, 0, r, r * 0.84],
                [j + 1, y + 7, 1, r * 0.65, r * 0.55],
              ],
              j === 1 ? 24 : 1,
              7,
            );
          }
          addPost(x, z, 12);
        }
      },
      44,
    );
  }
  for (const z of [-borderZ + 3, borderZ - 3])
    for (let x = 0; x < W; x += 96) {
      model(
        x,
        z,
        () =>
          hull(
            [
              [0, 0, 0, 32, 18],
              [3, 16, 0, 22, 14],
              [-1, 23, 1, 9, 7],
            ],
            1,
            6,
          ),
        40,
      );
    }
  for (const [x, z] of [
    [590, 345],
    [2250, -968],
    [3380, 818],
    [4790, 610],
    [5980, -745],
    [6650, 1030],
  ]) {
    model(
      x,
      z,
      () => {
        rod([0, 0, 0], [0, 67, 0], 3, 1);
        rod([-12, 65, 0], [19, 65, 0], 2, 2);
        panel(
          [
            [4, 64, 0],
            [17, 64, 0],
            [16, 33, 2],
            [12, 36, 3],
            [7, 30, 3],
          ],
          4,
        );
        box(10, 47, 2, 2, 10, 1, 3);
        box(7, 54, 2, 8, 2, 1, 3);
      },
      80,
    );
  }
  for (const b of bells) {
    for (const side of [-1, 1]) addPost(b.x + side * 22, b.z, 4);
    model(
      b.x,
      b.z,
      () => {
        for (const side of [-1, 1]) {
          box(side * 22, 0, 0, 6, 66, 6, 4);
          box(side * 22, 0, 0, 11, 5, 11, 1);
        }
        box(0, 64, 0, 56, 5, 9, 2);
        rod([0, 64, 0], [0, 56, 0], 1.8, 3);
      },
      84,
    );
  }
}
const roadZ = (y) => (y - trackY) / depthRatio;
// Solve a two-link limb in the bend plane, keeping joint lengths consistent.
function bendJoint(root, end, upper, lower, pole) {
  const axis = end.map((v, i) => v - root[i]),
    distance = Math.hypot(...axis) || 0.001;
  for (let i = 0; i < 3; i++) axis[i] /= distance;
  const projection = pole.reduce((sum, v, i) => sum + v * axis[i], 0);
  const bend = pole.map((v, i) => v - projection * axis[i]),
    length = Math.hypot(...bend) || 1;
  const along = Math.min(
    distance,
    (upper * upper - lower * lower + distance * distance) / (2 * distance),
  );
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
  return root.map((v, i) => v + axis[i] * along + (bend[i] * offset) / length);
}
function arm3(root, hand, side) {
  const elbow = bendJoint(root, hand, 20, 20, [-0.65, -1, side * 0.75]);
  const forearm = elbow.map((v, i) => mix(v, hand[i], 0.43));
  const upper = root.map((v, i) => mix(v, elbow[i], 0.37));
  sculpt(
    [
      [...root, 5.6, 5.9],
      [...upper, 5.5, 5.8],
      [...elbow, 4.5, 4.8],
    ],
    28,
    12,
  );
  sculpt(
    [
      [...elbow, 4.2, 4.4],
      [...forearm, 4, 3.8],
      [...hand, 2.5, 2.4],
    ],
    30,
    12,
  );
  for (const t of [0.19, 0.55, 0.84]) {
    const section = (k) => [
      ...blend3(elbow, hand, k),
      4.6 - 2 * k,
      4.7 - 2.1 * k,
    ];
    sculpt([section(t), section(t + 0.085)], 29, 10);
  }
  ovalMesh(...hand, 3.3, 3.1, 2.8, 2);
  for (let j = 0; j < 3; j++)
    rod(
      [hand[0] + 1, hand[1] + j * 1.2 - 1, hand[2] - 2],
      [hand[0] + 3, hand[1] + j * 1.2 - 1, hand[2] + 0.6],
      0.85,
      3,
      true,
    );
}
function jacket(hip, shoulder, neck, drop) {
  hull(
    [
      [hip, 48 - drop, 0, 9, 11],
      [hip, 54 - drop, 0, 9.3, 11.6],
      [shoulder - 1, 64 - drop, 0, 10, 13.8],
      [shoulder, neck - 8, 0, 10, 15.6],
      [shoulder + 1, neck - 4, 0, 8, 14],
      [shoulder + 2, neck, 0, 5, 7],
    ],
    28,
    20,
    true,
  );
  const seam = [
    [shoulder + 6, neck - 1, -3],
    [shoulder + 10, neck - 9, 3],
    [shoulder + 9, 65 - drop, 5],
    [hip + 9, 50 - drop, -2],
  ];
  for (let i = 1; i < seam.length; i++)
    rod(seam[i - 1], seam[i], 1.05, 0, true);
  // Split front panels flare away from the thighs beneath the sash.
  for (const side of [-1, 1]) {
    let prior;
    for (let j = 0; j <= 10; j++) {
      const a = (j * Math.PI) / 10,
        hem =
          32 -
          drop +
          0.6 * Math.cos(a) +
          motion.stride * Math.sin(motion.gait + side) * 1.6;
      const top = [
        hip + 9 * Math.cos(a),
        49 - drop,
        side * (1 + 11 * Math.sin(a)),
      ];
      const bottom = [
        hip + 13 * Math.cos(a),
        hem,
        side * (3 + 10.6 * Math.sin(a)),
      ];
      if (prior) {
        panel([prior.top, top, bottom, prior.bottom], 28, true);
        rod(prior.bottom, bottom, 0.85, 0, true);
      }
      if (!j) rod(top, bottom, 0.9, 0, true);
      prior = { top, bottom };
    }
  }
}
function maskedHead(x, y) {
  hull(
    [
      [x - 1, y + 1, 0, 5, 5.4],
      [x - 1, y + 8, 0, 7.1, 6.5],
      [x - 1, y + 14, 0, 7, 6.4],
      [x - 1, y + 18, 0, 5.8, 5.6],
      [x - 1, y + 20, 0, 2.6, 3.2],
    ],
    30,
    18,
    true,
  );
  for (const side of [-1, 1]) {
    const brow = [x + 6.2, y + 14.2, 0],
      nose = [x + 7.4, y + 10.4, 0];
    panel(
      [
        brow,
        [x + 5.7, y + 14.1, side * 3.5],
        [x + 2.5, y + 13, side * 6],
        [x + 2.6, y + 9.5, side * 6],
        [x + 5.9, y + 8.6, side * 3.5],
        nose,
      ],
      2,
      true,
    );
    rod(
      [x + 6.65, y + 12.4, side * 0.9],
      [x + 5.5, y + 13.1, side * 3.9],
      0.58,
      0,
      true,
    );
    rod(
      [x + 6.5, y + 11.45, side * 1.4],
      [x + 5.6, y + 11.8, side * 3.5],
      0.36,
      0,
      true,
    );
    panel(
      [
        nose,
        [x + 5.9, y + 8.6, side * 3.5],
        [x + 2.6, y + 9.5, side * 6],
        [x + 1, y + 4, side * 6],
        [x + 5.6, y + 1, side * 2],
        [x + 7, y + 4, 0],
      ],
      0,
      true,
    );
  }
  for (let i = 0; i < 3; i++) {
    const h = y - 4 + i * 2,
      r = 1 - i * 0.14;
    hull(
      [
        [x - 1, h - 2, 0, 8.2 * r, 12 * r],
        [x - 1, h + 0.2, 0, 8.8 * r, 12.7 * r],
        [x, h + 3.6, 0, 6.8 * r, 10.6 * r],
      ],
      i === 1 ? 0 : 30,
      16,
      true,
    );
  }
}
function ronin() {
  const age = run.phase - run.attackAt,
    fall = groundPose?.fall,
    p = fall ? { ...run.fall.pose } : katanaPose(age),
    dir = fall ? run.fall.heading : age < cut().duration || p.heldAttack ? run.attackDir : run.heading;
  if (fall) {
    p.drop += fall.drop;
    p.mouth = [...p.mouth];
    p.mouth[2] -= fall.drop;
    if (run.bladeOut) {
      p.tsuba = blend3(p.tsuba, [8, 18, 48 - fall.drop], fall.relax);
      p.pitch = mix(p.pitch, -.26, fall.relax);
      p.yaw = mix(p.yaw, .8, fall.relax);
      p.supportGrip *= 1 - fall.relax;
    }
  }
  const tuck = groundPose?.tuck ?? 0;
  if (tuck) {
    p.drop += 25 * tuck;
    p.coil -= 0.4 * tuck;
    if (run.bladeOut) {
      p.tsuba = blend3(p.tsuba, [14, 11, 42], tuck);
      p.yaw = mix(p.yaw, -2.94, tuck);
      p.pitch = mix(p.pitch, 0.14, tuck);
    }
    p.mouth[2] -= 25 * tuck;
  }
  const rig = heroMotion.feet;
  const move = cut();
  const inCut = p.heldAttack || (age >= 0 && age < move.duration);
  const entering = inCut && move.entry ? (1-ease(age/move.start))*(move.link?.guard ?? 1) : 0;
  const recovering = inCut && !p.heldAttack && move.entry ? ease((age-move.end)/(move.duration-move.end)) : 0;
  const gaitBlend = groundPose || run.phase-run.guardAt <= .5 ? 0 :
    inCut ? entering+recovering : 1;
  const walking = rig ? motion.stride*gaitBlend : 0;
  const stance = inCut ? (run.fromSheath ? 0 : entering)+recovering : combatStance();
  const guardStance = groundPose || run.phase-run.guardAt <= .5 ? 0 : stance;
  p.drop += 6 * guardStance;
  p.shift += 2 * guardStance;
  p.coil -= .16 * guardStance;
  if (guardStance && run.phase - run.cleanAt >= .49) {
    const guard = guardStance * (p.carryReady ?? 0);
    p.tsuba = blend3(p.tsuba,[25,-1,57],guard);
    p.pitch = mix(p.pitch,.43,guard);
    p.yaw = mix(p.yaw,-.08,guard);
  }
  let counterSwing=0;
  if (walking) {
    const left=localFoot(heroMotion,0,humanFeet)[0]-humanFeet[0][0];
    const right=localFoot(heroMotion,1,humanFeet)[0]-humanFeet[1][0];
    counterSwing=Math.max(-1,Math.min(1,(left-right)/30))*walking*(1-.75*guardStance);
    const transfer=(rig.feet[0].h-rig.feet[1].h)*walking;
    const sheathHold = p.sheathHold ?? 0;
    p.lateral += transfer * (.22 + .18 * sheathHold);
    p.coil += counterSwing*.13 - .12*sheathHold;
    p.shift+=1.5*walking;
    p.drop+=walking*(1.3+Math.abs(counterSwing)*1.1);
    // Move the carrier with the pelvis. Until the tip clears it, the hilt
    // receives the same translation, even when a foot lands mid-draw.
    const sway = [counterSwing*1.1,p.lateral,-p.drop];
    const ready = p.carryReady ?? 1;
    p.mouth = p.mouth.map((n,i)=>n+sway[i]);
    const handSway = [counterSwing*2,walking*2,-(p.drop-6*guardStance)];
    p.tsuba = p.tsuba.map((n,i)=>n+mix(sway[i],handSway[i],ready));
  }
  const v = weaponGeometry(p, { x: 1, y: 0 }, 0, 0),
    point = (a) => [a.x, a.z, a.y],
    shift = p.shift,
    drop = p.drop;
  const footLift =
    heroMotion.feet?.feet.reduce((h, f) => Math.max(h, f.h), 0) ?? 0;
  const sway = Math.sin(run.phase * 2.4) * 0.55 + footLift * 0.07;
  place(
    run.pos,
    roadZ(run.depth),
    heroMotion.feet?.angle ?? Math.atan2(dir.y, dir.x),
  );
  const hip = shift * 0.82,
    shoulder = 3 + shift * 1.23 + tuck * 14,
    neck = 82 - drop + sway - 8 * tuck;
  for (const sign of [-1, 1]) {
    let [foot, lift, footZ] = localFoot(
      heroMotion,
      sign < 0 ? 0 : 1,
      humanFeet,
    );
    const gather = groundPose?.gather ?? 0;
    foot = mix(foot, sign < 0 ? 10 : -4, tuck);
    lift = mix(lift, sign < 0 ? 19 : 13, gather);
    footZ = mix(footZ, sign * 4.5, gather);
    if (fall && sign > 0) {
      const facing = Math.atan2(dir.y, dir.x);
      foot += 12 * fall.step * (run.fall.x * Math.cos(facing) + run.fall.z * Math.sin(facing));
      footZ += 12 * fall.step * (run.fall.z * Math.cos(facing) - run.fall.x * Math.sin(facing));
      lift += 7 * fall.step;
    }
    const ankle = foot - 1;
    const knee = bendJoint(
      [hip, 48 - drop, sign * 5.5 + p.lateral],
      [ankle, 6 + lift, footZ],
      24,
      23,
      [1, 0, sign * 0.12],
    );
    if (walking) {
      const swing=rig.group===(sign<0 ? 0 : 1);
      const progress=rig.time/rig.duration;
      const forwardStep=rig.feet[rig.group];
      const along=(forwardStep.toX-forwardStep.fromX)*Math.cos(rig.angle)+
        (forwardStep.toZ-forwardStep.fromZ)*Math.sin(rig.angle);
      const pitch=Number.isFinite(along) ? Math.tanh(along/20)*walking*(1-.72*guardStance)*(swing ?
        -.24*Math.sin(2*Math.PI*progress)+.13*ease((progress-.65)/.35) :
        .13*(1-ease(progress/.27))-.10*ease((progress-.74)/.26)) : 0;
      shoePitch={x:foot+(pitch>0?-4:5), y:lift+.5, cos:Math.cos(pitch), sin:Math.sin(pitch)};
    }
    ovalMesh(foot + 1, lift + 2.6, footZ, 7.4, 3, 3.8, 30);
    for (const side of [-1, 1])
      rod(
        [foot + 5, lift + 4.8, footZ],
        [foot - 1, lift + 4, footZ + side * 3.5],
        1,
        29,
        true,
      );
    shoePitch=null;
    const shin = [ankle, 5 + lift, footZ],
      leg = (t, r) => [...blend3(shin, knee, t), r, r * 0.94];
    sculpt([leg(0, 3.1), leg(0.53, 4.6), leg(1, 4.2)], 30, 12);
    for (const t of [0.1, 0.38, 0.65])
      sculpt(
        [
          leg(t, 3.8 + Math.sin(t * 3) * 1.1),
          leg(t + 0.09, 4 + Math.sin(t * 3) * 1.1),
        ],
        29,
        12,
      );
    sculpt(
      [
        [hip, 47 - drop, sign * 5.4 + p.lateral, 7, 7],
        [
          ...blend3([hip, 47 - drop, sign * 5.4 + p.lateral], knee, 0.7),
          7.6,
          7.2,
        ],
        [...knee, 6.8, 6.8],
        leg(0.88, 7),
        leg(0.79, 5.2),
      ],
      28,
      14,
    );
  }
  // Feet retain the locomotion basis; upper body and weapon share the hit-test basis.
  place(
    run.pos,
    roadZ(run.depth),
    age < cut().duration || run.opponent
      ? Math.atan2(dir.y, dir.x)
      : (heroMotion.feet?.angle ?? Math.atan2(dir.y, dir.x)),
  );
  const facingAngle = orientation;
  const coil = p.coil;
  const shoulderPoint = ([x, y, z]) => {
    const blend = clamp01((y - 48 + p.drop) / 30);
    z += p.lateral * (1 - 0.27 * blend);
    y += p.shrug * blend;
    return [
      x * Math.cos(coil) - z * Math.sin(coil),
      y,
      x * Math.sin(coil) + z * Math.cos(coil),
    ];
  };
  torsoPose = p;
  orientation += coil;
  jacket(hip, shoulder, neck, drop);
  orientation = facingAngle;
  hull(
    [
      [hip, 47 - drop, 0, 10.4, 12.2],
      [hip, 50 - drop, 0, 10.8, 12.4],
      [hip, 53 - drop, 0, 9.6, 12],
    ],
    0,
    18,
    true,
  );
  hull(
    [
      [hip, 48 - drop, 0, 10.8, 12.6],
      [hip, 49 - drop, 0, 10.9, 12.6],
    ],
    30,
    18,
    true,
  );
  torsoPose = null;
  if (groundPose) groundPose.bodyContact = false;
  const mouth = point(v.mouth),
    shoe = point(v.shoe);
  const saya = (t) => mouth.map((n, i) => mix(n, shoe[i], t));
  rod(mouth, shoe, weapon.width + .25, weapon.lacquer, true);
  rod(mouth, saya(0.055), 3, 12, true);
  rod(saya(0.92), shoe, 3.1, 12, true);
  for (const t of [0.17, 0.22, 0.27])
    rod(saya(t), saya(t + 0.024), 3, 30, true);
  torsoPose = p;
  if (groundPose) {
    groundPose.bodyContact = true;
    groundPose.chin = {x: shoulder + 3, y: neck, cos: Math.cos(tuck * 1.25), sin: Math.sin(tuck * 1.25)};
  }
  maskedHead(shoulder + 3, neck);
  if (groundPose) groundPose.chin = null;
  torsoPose = null;
  const reach = p.reach;
  const armSwing=counterSwing*8;
  const wrist = blend3(
    [shoulder + 11 + armSwing, 52 - drop, 14],
    point(v.grip),
    reach,
  );
  const support = blend3(
    [shoulder + 8 - armSwing, 51 - drop, -13],
    [shoulder + 15, 64 - drop, -9],
    p.exposed,
  );
  const pommelHand = blend3(point(v.guard), point(v.rear), 0.83);
  const sheathHand = blend3(support, saya(.06), p.sheathHold ?? 0);
  arm3(
    shoulderPoint([shoulder, neck - 8, -13]),
    blend3(blend3(sheathHand, pommelHand, p.supportGrip), [shoulder + 8, neck + 3, -7], tuck),
    -1,
  );
  arm3(shoulderPoint([shoulder + 2, neck - 8, 13]),
    run.bladeOut ? wrist : blend3(wrist, [shoulder + 8, neck, 9], tuck), 1);
  if (groundPose) groundPose.bodyContact = false;
  const hilt = (t) =>
    point(v.rear).map((value, i) => mix(value, point(v.guard)[i], t));
  rod(hilt(0), hilt(1), 2.05, 0, true);
  for (const t of [0.1, 0.32, 0.54, 0.76])
    rod(hilt(t), hilt(t + 0.09), 2.2, 3, true);
  const a = point(v.guard),
    b = point(v.middle),
    c = point(v.tip);
  scene.heroBladeMiddle = worldPoint(b);
  rod([a[0], a[1], a[2] - 4], [a[0], a[1], a[2] + 4], 1.8, 3, true);
  if (p.exposed < 0.008) return;
  const normal = [-Math.cos(p.yaw)*Math.sin(p.pitch), Math.cos(p.pitch), -Math.sin(p.yaw)*Math.sin(p.pitch)];
  const ridge = (sign) => [a,b,c].map((pt,i) => pt.map((n,k) =>
    n + sign * normal[k] * weapon.width * [1,.82,0][i]));
  const spine = ridge(1);
  panel([a, b, spine[1], spine[0]], 7, true, 2);
  panel([b, c, spine[1]], 7, true, 2);
  if (weapon.doubleEdge) {
    const back = ridge(-1);
    panel([a, back[0], back[1], b], 19, true);
    panel([b, back[1], c], 19, true);
  }
  const flick = run.phase - run.cleanAt - 0.21;
  if (run.bladeOut && flick >= 0 && flick < 0.19) {
    for (let i = 0; i < 4; i++)
      box(
        c[0] + flick * (32 + i * 6),
        c[1] - flick * flick * 195 + i * 0.6,
        c[2] + flick * (60 + i * 15),
        1.4,
        1.4,
        1.4,
        4,
        true,
      );
  }
  const glint = [b[0], b[1] + 1, b[2]];
  rod([a[0], a[1] + 1, a[2]], glint, 1, 3, true, 3);
}
function impactTilt(actor, pivot) {
  if (actor.fellAt !== undefined) {
    const fall = knockdownPose(actor, run.phase);
    const angle = fall.angle;
    return {
      fall,
      nx: Math.cos(actor.fallAngle),
      nz: Math.sin(actor.fallAngle),
      sin: Math.sin(angle),
      cos: Math.cos(angle),
      pivot: 0,
    };
  }
  const age = run.phase - (actor.deflectedAt ?? -10);
  const stagger = age >= 0 && age < riposteWindow
    ? ease(age / .14) * (1 - ease((age - .48) / (riposteWindow - .48))) : 0;
  const leanX = (actor.recoil?.x || 0) + .36 * stagger * (actor.staggerX || 0);
  const leanZ = (actor.recoil?.z || 0) + .36 * stagger * (actor.staggerZ || 0);
  const angle = Math.hypot(leanX, leanZ);
  return angle
    ? {
        nx: leanX / angle,
        nz: leanZ / angle,
        sin: Math.sin(angle),
        cos: Math.cos(angle),
        pivot,
      }
    : null;
}
// Undo the enemy's own render transform so both weapons use the same world-space contact.
function enemyLocalPoint(point, scale) {
  let x = point[0] - origin[0], h = point[1] - origin[1], z = point[2] - origin[2];
  if (bodyTilt && h > bodyTilt.pivot) {
    const {nx, nz, sin, cos, pivot} = bodyTilt;
    const along = x * nx + z * nz, above = h - pivot;
    const offset = along * (cos - 1) - above * sin;
    x += nx * offset; z += nz * offset;
    h = pivot + above * cos + along * sin;
  }
  const c = Math.cos(orientation), s = Math.sin(orientation);
  return [(x*c + z*s)/scale, h/scale, (z*c - x*s)/scale];
}
export function demonFacing(d) {
  const twist = (d.hitTwist || 0) * Math.sin(Math.PI * clamp01((run.phase - (d.turnAt ?? -10)) / .48));
  const facing = d.fellAt !== undefined ? d.fallFacing :
    d.type === 0 && d.wind >= 0 ? Math.atan2(d.aimY, d.aimX) :
    d.feet?.angle ?? Math.atan2(roadZ(run.depth) - roadZ(d.y), run.pos - d.x);
  return facing + twist;
}
export function demonAttackPose(d) {
  const fall = d.fellAt !== undefined;
  const winding = !fall && d.wind >= 0;
  const sinceHit = run.phase - (d.struckAt ?? -10);
  const following = !fall && !winding && sinceHit < .32;
  const {lift, strike} = winding ? attackPhases(run.phase - d.wind, enemyWindup(d))
    : {lift: Number(following), strike: Number(following)};
  const recover = following ? ease(sinceHit / .32) : 0;
  const load = lift * (1 - strike) * (1 - recover);
  return {winding, lift, strike, recover, load, snap: strike * (1 - recover)};
}
export function houndBackHeight(d, load, snap) {
  return 32 + Math.sin(run.phase * 3 + d.home) * .65 - load * 10 + snap * 4;
}
function demon(d) {
  const fall = bodyTilt?.fall;
  place(d.x, roadZ(d.y), demonFacing(d));
  const {winding, lift, strike, recover, load, snap} = demonAttackPose(d);
  const start = scene.faces.length;
  if (d.type === 0) houndModel(d, load, snap, fall);
  else if (d.type === 1) mournerModel(d, load, fall);
  else {
    const contactAge = run.phase - (d.deflectedAt ?? -10);
    const deflect = ease(contactAge / .12) * (1 - ease((contactAge - .12) / .25));
    const guardAge = run.phase - run.guardAt;
    const dx = d.x - run.pos, dz = roadZ(d.y) - roadZ(run.depth);
    const distance = Math.hypot(dx, dz);
    const guarding = winding && run.deflectedAt < run.guardAt && guardAge >= 0 && guardAge < parryTiming.close &&
      distance < enemies[d.kind].range + 20 && dx * run.heading.x + dz * run.heading.y >= .5 * distance;
    const answering = cut().riposte?.target === d && run.phase - run.attackAt < cut().duration;
    const bind = !answering && contactAge < .22 && d.deflectedAt === run.deflectedAt
      ? 1 - ease((contactAge - .09) / .13)
      : guarding ? strike * ease(guardAge / parryTiming.open) : 0;
    const boss = d.type === 3;
    const point = bind ? enemyLocalPoint(scene.heroBladeMiddle, boss ? 1.17 : 1) : null;
    armoredModel(d, {lift, strike, recover, deflect, reverse: d.reverse, side: d.deflectSide || 1}, boss, point, bind, fall, winding && combatOpponent(d) ? addAttackSight : null);
  }
  if (d.kind === 4 || d.kind === 5) {
    const reed = d.kind === 4;
    for (let i = start; i < scene.faces.length; i++) {
      const f = scene.faces[i];
      if (reed && f[3] === 4) f[3] = 6;
      if (!reed && f[3] === 14) f[3] = 20;
    }
    if (reed) {
      for (let i = 0; i < 5; i++)
        sculpt(
          [
            [13 - i * 5, 43 - load * 6, 0, 2.3],
            [8 - i * 5, 55 - load * 6 - i * 0.8, 0, 0.3],
          ],
          12,
          5,
        );
    } else {
      for (const side of [-1, 1])
        sculpt(
          [
            [0, 80, side * 17, 5],
            [-3, 92, side * 25, 3],
            [-6, 99, side * 28, 0.4],
          ],
          20,
          6,
        );
    }
  }
}
scene.eye = undefined;
let right;
let up;
let forward;
let focus;
let aspectX;
let aspectY;
function camera() {
  const cy = Math.cos(view.cameraYaw),
    sy = Math.sin(view.cameraYaw),
    cp = Math.cos(view.cameraPitch),
    sp = Math.sin(view.cameraPitch);
  right = [cy, 0, -sy];
  up = [-sy * sp, cp, -cy * sp];
  forward = [-sy * cp, -sp, -cy * cp];
  focus = view.mouseLook
    ? [
        run.pos + right[0] * 22 - sy * 38,
        59,
        roadZ(run.depth) + right[2] * 22 - cy * 38,
      ]
    : [run.pos + right[0] * 57, 59, roadZ(run.depth) + right[2] * 57];
  focus[1] += groundHeight(run.pos,roadZ(run.depth));
  scene.eye = focus.map((v, i) => v - forward[i] * view.cameraRange);
  aspectY = rows * 1.04;
  aspectX = aspectY;
}
function project(v, out = [0, 0, 0]) {
  const x = v[0] - scene.eye[0],
    y = (mirrorPass ? -v[1] : v[1]) - scene.eye[1],
    z = v[2] - scene.eye[2],
    d = x * forward[0] + y * forward[1] + z * forward[2];
  out[0] = cols * 0.5 + (aspectX * (x * right[0] + z * right[2])) / d;
  out[1] = rows * 0.5 - (aspectY * (x * up[0] + y * up[1] + z * up[2])) / d;
  out[2] = 1 / d;
  return out;
}
// The bounds reject distant props cheaply. Only a visible surface between
// the near plane and the ronin can make the complete prop translucent.
// The cached translucent layer stores object IDs, so its opacity can keep
// changing after the camera stops without rasterizing the landscape again.
let veilObject = 0;
const veilLayers = [], cachedVeilLayers = [];
let veilCount = 0, cachedVeilCount = 0;

function veilLayer(layers, index) {
  return layers[index] ??= {
    depth: new Float32Array(cols * rows),
    surface: new Uint32Array(cols * rows),
  };
}

function copyVeilLayers(source, target, count) {
  for (let n = 0; n < count; n++) {
    const layer = veilLayer(target, n);
    layer.depth.set(source[n].depth);
    layer.surface.set(source[n].surface);
  }
}

// Each pixel keeps one front surface per object, in nearest-first order.
function recordVeil(pixel, depth, surface) {
  let n = 0;
  for (; n < veilCount; n++) {
    const layer = veilLayers[n];
    const oldDepth = layer.depth[pixel];
    if (!oldDepth) break;
    if ((layer.surface[pixel] >>> 10) === veilObject) {
      if (depth <= oldDepth) return;
      break;
    }
  }
  if (n === veilCount) {
    const layer = veilLayer(veilLayers, n);
    layer.depth.fill(0);
    veilCount++;
  }
  while (n > 0 && veilLayers[n-1].depth[pixel] < depth) {
    veilLayers[n].depth[pixel] = veilLayers[n-1].depth[pixel];
    veilLayers[n].surface[pixel] = veilLayers[n-1].surface[pixel];
    n--;
  }
  veilLayers[n].depth[pixel] = depth;
  veilLayers[n].surface[pixel] = surface;
}
const fades = new Map(), opacity = [1], freeFadeIds = [];
const clearHoldMs = 350;
let fadeFrame = 0, lastFadeTime;
function veilId(object, coverage, dynamic = false) {
  let fade = fades.get(object);
  if (!fade) {
    if (!coverage) return 0;
    const id = freeFadeIds.pop() ?? opacity.length;
    opacity[id] = 1;
    fade = {id, amount:0, coverage, dynamic, seen:fadeFrame, clearSince:null};
    fades.set(object, fade);
  }
  fade.coverage = coverage;
  fade.seen = fadeFrame;
  return fade.id;
}
function advanceFades(now, rebuilt) {
  const dt = Math.min(50, Math.max(0, now-(lastFadeTime ?? now)));
  lastFadeTime = now;
  for (const [object,fade] of fades) {
    if (!fade.dynamic) fade.coverage = sceneryOccluders.get(object.id) ?? 0;
    if ((rebuilt || fade.dynamic) && fade.seen !== fadeFrame) fade.coverage = 0;
    if (fade.coverage > 0) {
      fade.clearSince = null;
      const gap = fade.coverage - fade.amount;
      const step = gap > 0 ? dt/260 : dt/420;
      fade.amount += Math.sign(gap)*Math.min(Math.abs(gap),step);
    } else {
      fade.clearSince ??= now;
      const restoringMs = Math.min(dt, Math.max(0, now - fade.clearSince - clearHoldMs));
      fade.amount = Math.max(0, fade.amount - restoringMs/420);
    }
    opacity[fade.id] = 1 - .87*(fade.amount + ease(fade.amount))*.5;
    if (!fade.coverage && fade.amount === 0) {
      fades.delete(object);
      freeFadeIds.push(fade.id);
      if (!fade.dynamic) backdropKey = "";
    }
  }
}
// Sample across the projected width of each body at several heights. The
// wider torso has more samples than the head, so a single clipped edge has
// little influence. Keep fighters separate when measuring the covered fraction.
const sightBodies = [];
const bodyRows = [[.17,.54,3,.22], [.43,.79,4,.32], [.69,1,5,1.5], [.89,.48,3,1.25]];
function addAttackSight(elbow, hand, tip) {
  // These are the actual world-space joints of the attacking arm, after
  // animation, weapon binding, body tilt and the boss's scale.
  for (const [a,b,importance] of [[elbow,hand,.78],[hand,tip,.94]]) {
    const points = [];
    for (const t of [0,.25,.5,.75,1]) {
      const p = blend3(a,b,t);
      if (actorVisible(...p,0)) points.push([...p,1]);
    }
    if (points.length) sightBodies.push({points,total:5,importance});
  }
}
function addSightBody(x,z,height,width,tilt,scale,enemy = false) {
  const points = [], floor = groundHeight(x,z);
  let total = 0;
  for (const [level,span,count,enemyWeight] of bodyRows) {
    let h = height*level, cx = x, cz = z;
    if (tilt?.fall) h = loweredHeight(h,tilt.fall,scale);
    if (tilt && h > tilt.pivot) {
      const above = h-tilt.pivot;
      cx += above*tilt.sin*tilt.nx;
      cz += above*tilt.sin*tilt.nz;
      h = tilt.pivot+above*tilt.cos;
    }
    for (let i=0; i<count; i++) {
      const offset = width*span*((2*i+1)/count-1);
      const px = cx+offset*right[0], pz = cz+offset*right[2];
      if (actorVisible(px,floor+h,pz,0)) {
        const weight = enemy ? enemyWeight : 1;
        points.push([px,floor+h,pz,weight]);
        total += weight;
      }
    }
  }
  if (points.length) sightBodies.push({points,total,importance:1});
}
const sceneryOccluders = new Map();
function updateSceneryOccluders() {
  sceneryOccluders.clear();
  const low = run.fall || run.phase-run.rollAt < rollDuration;
  addSightBody(run.pos,roadZ(run.depth),low ? 40 : 103,low ? 31 : 18,null,1);
  for (const d of guards) {
    if (!combatOpponent(d)) continue;
    const tilt = impactTilt(d, d.type === 0 ? 12 : 24);
    let width = [14,17,23,27][d.type];
    if (d.type === 0) {
      const angle = demonFacing(d);
      width += 22*Math.abs(Math.cos(angle)*right[0] + Math.sin(angle)*right[2]);
    }
    addSightBody(d.x,roadZ(d.y),[50,96,106,125][d.type],width,tilt,d.type === 3 ? 1.17 : 1,true);
  }
  // Reject objects outside the volume spanning the eye and all visible fighters
  // before testing individual sight lines against the object's triangles.
  const lo = [...scene.eye], hi = [...scene.eye];
  for (const {points} of sightBodies) {
    for (const point of points) {
      for (let axis = 0; axis < 3; axis++) {
        lo[axis] = Math.min(lo[axis], point[axis]);
        hi[axis] = Math.max(hi[axis], point[axis]);
      }
    }
  }
  for (const mesh of meshes) {
    if (mesh.lo[0] > hi[0] || mesh.hi[0] < lo[0] ||
        mesh.lo[2] > hi[2] || mesh.hi[2] < lo[2] ||
        mesh.lo[1] > hi[1] || mesh.hi[1] < lo[1]) continue;
    const fraction = coveredFraction(mesh.lo, mesh.hi, mesh.levels[0].faces);
    if (fraction) sceneryOccluders.set(mesh.id,fraction);
  }
  return [...sceneryOccluders.keys()].join(",");
}
function intersectsFace(face, dx, dy, dz, near, far) {
  const [a,b,c] = face;
  const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  const vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  const px=dy*vz-dz*vy, py=dz*vx-dx*vz, pz=dx*vy-dy*vx;
  const det=ux*px+uy*py+uz*pz;
  if (Math.abs(det)<1e-8) return false;
  const ox=scene.eye[0]-a[0], oy=scene.eye[1]-a[1], oz=scene.eye[2]-a[2];
  const u=(ox*px+oy*py+oz*pz)/det;
  if (u<0 || u>1) return false;
  const qx=oy*uz-oz*uy, qy=oz*ux-ox*uz, qz=ox*uy-oy*ux;
  const v=(dx*qx+dy*qy+dz*qz)/det;
  if (v<0 || u+v>1) return false;
  const t=(vx*qx+vy*qy+vz*qz)/det;
  return t>=near && t<=far;
}
function coveredFraction(lo,hi,faces) {
  let mostCovered = 0;
  for (const {points,total,importance} of sightBodies) {
    let hits = 0;
    for (const point of points) {
      if (surfaceOnRay(lo,hi,faces,point)) hits += point[3];
    }
    mostCovered = Math.max(mostCovered,importance*hits/total);
    if (mostCovered === 1) break;
  }
  return mostCovered;
}
function surfaceOnRay(lo,hi,faces,target) {
  const dx=target[0]-scene.eye[0], dy=target[1]-scene.eye[1], dz=target[2]-scene.eye[2];
  const depth=dx*forward[0]+dy*forward[1]+dz*forward[2];
  if (depth<=8) return false;
  let enter = 8/depth, leave = .985;
  for (let axis=0; axis<3; axis++) {
    const origin=scene.eye[axis], delta=target[axis]-origin;
    const min=lo[axis]-6, max=hi[axis]+6;
    if (Math.abs(delta)<.0001) {
      if (origin<min || origin>max) return false;
    } else {
      const a=(min-origin)/delta, b=(max-origin)/delta;
      enter=Math.max(enter,Math.min(a,b));
      leave=Math.min(leave,Math.max(a,b));
      if (enter>leave) return false;
    }
  }
  return faces.some(face => intersectsFace(face,dx,dy,dz,enter,leave));
}
function raster(a, b, c, m, l, f) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
    maxX = Math.min(cols - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
    maxY = Math.min(rows - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (minX > maxX || minY > maxY) return;
  const ax = a[0],
    ay = a[1],
    bx = b[0] - ax,
    by = b[1] - ay,
    cx = c[0] - ax,
    cy = c[1] - ay,
    den = bx * cy - by * cx;
  if (Math.abs(den) < 0.005) return;
  const packedVeil = (veilObject << 10) | (f ? 512 : 0) | (l << 6) | m;
  const inv = 1 / den,
    du = cy * inv,
    dv = -by * inv;
  for (let y = minY; y <= maxY; y++) {
    let u = ((minX + 0.5 - ax) * cy - (y + 0.5 - ay) * cx) * inv,
      v = ((y + 0.5 - ay) * bx - (minX + 0.5 - ax) * by) * inv;
    for (let x = minX; x <= maxX; x++, u += du, v += dv) {
      if (u < 0 || v < 0 || u + v > 1) continue;
      const z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]),
        i = y * cols + x;
      if (z <= depths[i]) continue;
      if (veilObject) {
        recordVeil(i, z, packedVeil);
        continue;
      }
      depths[i] = z;
      materials[i] = m;
      lights[i] = l;
      fine[i] = f;
    }
  }
}
function drawFaces(list) {
  const p = [0, 0, 0],
    q = [0, 0, 0],
    r = [0, 0, 0];
  for (const [a, b, c, m, l, f] of list) {
    project(a, p);
    project(b, q);
    project(c, r);
    const da = 1 / p[2],
      db = 1 / q[2],
      dc = 1 / r[2];
    if (da < 8 && db < 8 && dc < 8) continue;
    const distance = (da + db + dc) / 3;
    const shade = Math.max(
      0,
      Math.min(
        7,
        l + (f ? 1 : 0) - (distance > 1100 ? 4 : distance > 710 ? 2 : 0),
      ),
    );
    if (da >= 8 && db >= 8 && dc >= 8) raster(p, q, r, m, shade, f ? 1 : 0);
    else clipFace(a, b, c, [da, db, dc], m, shade, f);
  }
}
function actorVisible(x, y, z, r) {
  const dx = x - scene.eye[0],
    dy = y - scene.eye[1],
    dz = z - scene.eye[2];
  const d = dx * forward[0] + dy * forward[1] + dz * forward[2];
  const hx = cols / (2 * aspectX),
    hy = rows / (2 * aspectY);
  return (
    d + r >= 8 &&
    Math.abs(dx * right[0] + dz * right[2]) <= hx * d + Math.hypot(1, hx) * r &&
    Math.abs(dx * up[0] + dy * up[1] + dz * up[2]) <=
      hy * d + Math.hypot(1, hy) * r
  );
}
function clipFace(a, b, c, ds, m, shade, f) {
  const points = [a, b, c],
    clip = [];
  for (let j = 0; j < 3; j++) {
    const k = (j + 1) % 3;
    if (ds[j] >= 8) clip.push(points[j]);
    if (ds[j] >= 8 !== ds[k] >= 8) {
      const t = (8 - ds[j]) / (ds[k] - ds[j]);
      clip.push(points[j].map((v, i) => v + t * (points[k][i] - v)));
    }
  }
  const verts = clip.map((v) => project(v));
  for (let j = 1; j < verts.length - 1; j++)
    raster(verts[0], verts[j], verts[j + 1], m, shade, f ? 1 : 0);
}
const projected = [];
function drawScenery() {
  const halfX = cols / (2 * aspectX),
    halfY = rows / (2 * aspectY);
  const sideX = Math.hypot(1, halfX),
    sideY = Math.hypot(1, halfY);
  for (const mesh of meshes) {
    const x = mesh.center[0] - scene.eye[0],
      y = (mirrorPass ? -mesh.center[1] : mesh.center[1]) - scene.eye[1],
      z = mesh.center[2] - scene.eye[2];
    const d = x * forward[0] + y * forward[1] + z * forward[2],
      r = mesh.radius;
    if (
      d + r < 8 ||
      d - r > 2800 ||
      Math.abs(x * right[0] + z * right[2]) > halfX * d + sideX * r ||
      Math.abs(x * up[0] + y * up[1] + z * up[2]) > halfY * d + sideY * r
    )
      continue;
    veilObject = mirrorPass ? 0 : veilId(mesh, sceneryOccluders.get(mesh.id) ?? 0);
    const footprint = Math.max(0, d - r) / aspectY;
    const level =
      footprint > 16
        ? 4
        : footprint > 7
          ? 3
          : footprint > 3
            ? 2
            : footprint > 1.1
              ? 1
              : 0;
    const { vertices, triangles, faces: list } = mesh.levels[level];
    while (projected.length < vertices.length) projected.push([0, 0, 0]);
    for (let i = 0; i < vertices.length; i++)
      project(vertices[i], projected[i]);
    for (let i = 0; i < list.length; i++) {
      const a = projected[triangles[i * 3]],
        b = projected[triangles[i * 3 + 1]],
        c = projected[triangles[i * 3 + 2]];
      const da = 1 / a[2],
        db = 1 / b[2],
        dc = 1 / c[2];
      if (da < 8 && db < 8 && dc < 8) continue;
      const depth = (da + db + dc) / 3,
        f = list[i];
      const shade = Math.max(
        0,
        Math.min(
          7,
          f[4] + Number(f[5]) - (depth > 1100 ? 4 : depth > 710 ? 2 : 0),
        ),
      );
      if (da >= 8 && db >= 8 && dc >= 8)
        raster(a, b, c, f[3], shade, f[5] ? 1 : 0);
      else
        clipFace(
          vertices[triangles[i * 3]],
          vertices[triangles[i * 3 + 1]],
          vertices[triangles[i * 3 + 2]],
          [da, db, dc],
          f[3],
          shade,
          f[5],
        );
    }
  }
  veilObject = 0;
}
let waterVisible = false;
function landscape() {
  waterVisible = false;
  // Start each ray at the water plane and refine its intersection with the terrain.
  depths.fill(0);
  fine.fill(0);
  for (let y = 0; y < rows; y++) {
    const dy = (rows * 0.5 - y - 0.5) / aspectY,
      ry = forward[1] + dy * up[1],
      t = ry < 0 ? -scene.eye[1] / ry : Infinity;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x,
        dx = (x + 0.5 - cols * 0.5) / aspectX;
      const rx = forward[0] + dx * right[0] + dy * up[0],
        rz = forward[2] + dx * right[2] + dy * up[2];
      if (t > 2700) {
        const length = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const lunar = (rx * 0.1 + ry * 0.142 - rz * 0.985) / length;
        const altitude = ry / length,
          az = rx / length,
          back = rz / length;
        const bands =
          Math.sin(altitude * 105 + az * 5 + 2 * Math.sin(az * 11 + back * 4)) +
          0.35 * Math.sin(altitude * 190 + az * 31 + back * 7);
        const mist = Math.max(0, 1 - Math.abs(altitude - 0.045) * 5);
        if (lunar > 0.994) {
          materials[i] = 11;
          lights[i] = Math.max(
            2,
            Math.min(
              7,
              Math.round(6 + (az - 0.1) * 9 - Math.max(0, bands - 0.25) * 2.4),
            ),
          );
        } else {
          materials[i] = 10;
          lights[i] = Math.max(
            0,
            Math.min(
              6,
              Math.round(
                mist * 2 +
                  Math.max(0, bands - 0.45) * 1.5 +
                  Math.max(0, lunar - 0.94) * 36,
              ),
            ),
          );
        }
        continue;
      }
      let wx = scene.eye[0] + rx * t, wz = scene.eye[2] + rz * t;
      // Refine the ray-plane intersection against the low relief near the camera.
      let depth = t;
      if (t < 1300) {
        depth = t + groundHeight(wx,wz) / ry;
        wx = scene.eye[0] + rx * depth;
        wz = scene.eye[2] + rz * depth;
        depth = t + groundHeight(wx,wz) / ry;
        wx = scene.eye[0] + rx * depth;
        wz = scene.eye[2] + rz * depth;
      }
      const row = Math.floor(wz / 15);
      const brick = Math.floor((wx + (row & 1) * 14) / 31);
      const grit = Math.abs((Math.imul(brick, 71) ^ Math.imul(row, 31)) % 7);
      const kind = groundKind(wx, wz),
        onRoad = kind === 1;
      materials[i] = onRoad ? 22 : 13;
      lights[i] = onRoad ? (grit % 3) + 1 : grit % 3;
      if (
        onRoad &&
        (Math.abs(wz - row * 15) < 1.4 ||
          Math.abs(wx + (row & 1) * 14 - brick * 31) < 1.4)
      )
        lights[i] = 0;
      if (onRoad) {
        // Lamp reflections break into ribbons across uneven wet paving.
        const dx = wx - Math.round(wx / 345) * 345,
          dz = wz + 75;
        const pool = 1 - (dx * dx) / 1900 - (dz * dz) / 10500;
        const ripple = Math.sin(wz * 0.83 + Math.sin(wx * 0.13) * 3);
        if (pool > 0 && ripple > -0.15 && grit !== 0) {
          materials[i] = 12;
          lights[i] = Math.min(6, 1 + Math.round(pool * 4 + ripple));
        } else if (wz > 0 && grit === 2 && ripple > 0.64) {
          materials[i] = 14;
          lights[i] = 2;
        }
      }
      const bank = bankDistance(wx, wz);
      if (bank > 0) {
        materials[i] = 36;
        lights[i] = Math.min(7, Math.floor(bank / 10));
        waterVisible = true;
      } else if (bank > -12) {
        materials[i] = 38;
        lights[i] = 2 + (grit % 3);
      }
      if (kind === 0 && bank <= -12) {
        const tuft = hashPixel(Math.floor(wx / 6), Math.floor(wz / 5));
        if ((tuft & 31) < 5) {
          materials[i] = 23;
          lights[i] = 1 + ((tuft >>> 6) % 3);
        }
      }
      if (t > 1100 && bank < 0) lights[i] = 1;
      if (depth < 650 && bank < -12) {
        const slope = groundHeight(wx-9,wz-8) - (scene.eye[1]+depth*ry);
        lights[i] = Math.max(0,Math.min(7,lights[i]+Math.round(slope*.9)));
      }
      depths[i] = 1 / depth;
    }
  }
}
function shadows(x, z, rx, rz) {
  place(x, z);
  const rim = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const dx=Math.cos(a)*rx-5, dz=Math.sin(a)*rz+8;
    rim.push([dx, groundHeight(x+dx,z+dz)-origin[1]+1, dz]);
  }
  panel(rim, 0, true, -5);
}
function drawProp(object,x,z,radius,height) {
  const base=groundHeight(x,z);
  veilObject=veilId(object, coveredFraction([x-radius,base,z-radius],[x+radius,base+height,z+radius],scene.faces), true);
  drawFaces(scene.faces);
  scene.faces=[];
  veilObject=0;
}
function drawInteractives() {
  for (const b of bells) {
    if (
      Math.abs(b.x - run.pos) > 950 ||
      !actorVisible(b.x, 30, b.z, run.phase - b.last < 0.65 ? 175 : 45)
    )
      continue;
    place(b.x, b.z);
    const t = run.phase - b.last,
      swing = Math.sin(t * 17) * Math.exp(-t * 1.7) * 6;
    hull(
      [
        [swing, 32, 0, 13, 13],
        [swing, 35, 0, 14, 14],
        [swing * 0.6, 46, 0, 10, 10],
        [0, 54, 0, 6, 6],
      ],
      12,
      14,
      true,
    );
    hull(
      [
        [swing, 34, 0, 14, 14],
        [swing, 36, 0, 14, 14],
      ],
      5,
      14,
      true,
    );
    drawProp(b,b.x,b.z,16,56);
    if (t < 0.65)
      for (let j = 0; j < 30; j++) {
        const a = (j * 2 * Math.PI) / 30,
          r = (165 * t) / 0.65;
        box(r * Math.cos(a), 2, r * Math.sin(a), 4, 2, 4, 12, true, 1);
      }
    drawFaces(scene.faces);
    scene.faces=[];
  }
  for (const j of jars) {
    if (
      j.broken ||
      Math.abs(j.x - run.pos) > 900 ||
      !actorVisible(j.x, 22, roadZ(j.y), 30)
    )
      continue;
    place(j.x, roadZ(j.y));
    hull(
      [
        [0, 0, 0, 8, 8],
        [0, 7, 0, 12, 12],
        [0, 25, 0, 14, 14],
        [0, 37, 0, 8, 8],
        [0, 41, 0, 7, 7],
        [0, 43, 0, 9, 9],
      ],
      4,
      12,
      true,
    );
    hull(
      [
        [0, 28, 0, 13, 13],
        [0, 31, 0, 12, 12],
      ],
      12,
      12,
      true,
    );
    drawProp(j,j.x,roadZ(j.y),15,44);
  }
  for (const s of shards) {
    place(s.x, s.z);
    panel(
      [
        [0, s.h, 0],
        [4, s.h + 2, 1],
        [1, s.h, 4],
      ],
      4,
      true,
    );
  }
}
function drawForegroundProps() {
  scene.faces = [];
  drawWaterRings();
  drawFaces(scene.faces);
  scene.faces=[];
  drawInteractives();
  drawFaces(scene.faces);
}
function buildActorFaces() {
  scene.faces=[];
  shadows(run.pos, roadZ(run.depth), 29, 16);
  const first = scene.faces.length;
  bodyTilt = impactTilt(heroMotion, 30);
  const roll = (run.phase - run.rollAt) / rollDuration;
  if (run.fall) {
    const fall = fallPose(run.phase - run.fall.at);
    groundPose = {
      fall, x: run.fall.x, y: run.fall.z,
      sin: Math.sin(fall.angle), cos: Math.cos(fall.angle),
      bankSin: Math.sin(fall.bank), bankCos: Math.cos(fall.bank),
      tuck: 0, gather: 0, groundWeight: fall.groundWeight,
      vertices: [], lowest: Infinity, bodyContact: true,
    };
  } else if (roll >= 0 && roll < 1) {
    const tuck = ease(roll / .23) * (1 - ease((roll - .67) / .33));
    const gather = ease((roll - .10) / .24) * (1 - ease((roll - .61) / .19));
    const angle = Math.PI * 2 * ease((roll - .10) / .72);
    const bank = .78 * tuck;
    const skew = .24 * tuck;
    const {x, y} = run.rollDir;
    groundPose = {
      x: x * Math.cos(skew) - y * Math.sin(skew), y: y * Math.cos(skew) + x * Math.sin(skew),
      sin: Math.sin(angle), cos: Math.cos(angle), bankSin: Math.sin(bank), bankCos: Math.cos(bank),
      tuck, gather, groundWeight: tuck, vertices: [], lowest: Infinity, bodyContact: true
    };
  }
  ronin();
  if (groundPose) {
    // Anchor the lowest body point as support passes from feet to shoulder and back.
    const offset = (1 - groundPose.lowest) * groundPose.groundWeight;
    for (const vertex of groundPose.vertices) vertex[1] += offset;
    groundPose = null;
  }
  bodyTilt = null;
  for (let i = first; i < scene.faces.length; i++) {
    const face = scene.faces[i];
    face[3] = roninInk[face[3]] ?? face[3];
    face[4] = Math.min(7, face[4] + 1);
  }
  drawWounds(heroMotion, first);
  for (let i = 0; i < guards.length; i++) {
    const d = guards[i],
      label = enemyLabels[i];
    const falling = d.fellAt !== undefined && run.phase - (d.diedAt ?? d.fellAt) < 1.0;
    const near =
      (d.hp > 0 || falling) && Math.abs(d.x - run.pos) < 1200 && activeGuard(d);
    if (!near || !actorVisible(d.x, 65, roadZ(d.y), 120)) {
      label.hidden = true;
      continue;
    }
    shadows(d.x, roadZ(d.y), 32, 17);
    const surfaceStart = scene.faces.length;
    bodyTilt = impactTilt(d, d.type === 0 ? 12 : 24);
    demon(d);
    bodyTilt = null;
    drawWounds(d, surfaceStart);
    if (!d.hp) continue;
    const p = project([d.x, groundHeight(d.x,roadZ(d.y)) + [64, 118, 131, 155][d.type], roadZ(d.y)]);
    if (
      p[2] <= 0 ||
      p[0] < 0 ||
      p[0] >= cols ||
      p[1] < 3 ||
      p[1] >= rows ||
      1 / p[2] > 820
    ) {
      label.hidden = true;
      continue;
    }
    label.hidden = false;
    label.style.left = (100 * p[0]) / cols + "%";
    label.style.top = (100 * p[1]) / rows + "%";
    label.firstChild.textContent =
      (run.phase < d.stunned ? "✦  " : d.wind >= 0 ? "!  " : "") +
      enemies[d.kind].name;
    label.lastChild.max = d.max;
    label.lastChild.value = d.hp;
  }
  drawCombatFx();
  return scene.faces;
}
function edgeLight() {
  // A thin moonlit edge separates foreground silhouettes from distant surfaces.
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x,
        z = depths[i];
      if (!fine[i] || z < 1 / 650 || materials[i] === 0) continue;
      const above = depths[i - cols],
        left = depths[i - 1],
        right = depths[i + 1];
      if (Math.min(above, left) < z * 0.91) {
        lights[i] = Math.min(7, lights[i] + 2);
        if (materials[i] === 3 || materials[i] === 7) materials[i] = 7;
      }
      if (right < z * 0.82 && !fine[i + 1])
        lights[i + 1] = Math.max(0, lights[i + 1] - 2);
    }
}
let mirrorPass = false,
  mirror = null;
function renderReflection() {
  const saved = [cols, rows, aspectX, aspectY, depths, materials, lights, fine];
  const w = Math.max(1, Math.ceil(cols / 3)),
    h = Math.max(1, Math.ceil(rows / 3));
  if (!mirror || mirror.w !== w || mirror.h !== h)
    mirror = {
      w,
      h,
      depth: new Float32Array(w * h),
      mat: new Uint8Array(w * h),
      light: new Uint8Array(w * h),
      detail: new Uint8Array(w * h),
    };
  aspectX *= w / cols;
  aspectY *= h / rows;
  cols = w;
  rows = h;
  depths = mirror.depth;
  materials = mirror.mat;
  lights = mirror.light;
  fine = mirror.detail;
  depths.fill(0);
  mirrorPass = true;
  drawScenery();
  mirrorPass = false;
  [cols, rows, aspectX, aspectY, depths, materials, lights, fine] = saved;
}
function blendWater(a, b, f) {
  const r = (a & 255) * (1 - f) + (b & 255) * f,
    g = ((a >>> 8) & 255) * (1 - f) + ((b >>> 8) & 255) * f;
  const blue = ((a >>> 16) & 255) * (1 - f) + ((b >>> 16) & 255) * f;
  return 0xff000000 | ((blue | 0) << 16) | ((g | 0) << 8) | (r | 0);
}
function waterPixel(x, y, wx, wz, rx, ry, rz, depthBand, fog, grainValue) {
  const swell = Math.sin(
    wx * 0.032 +
      wz * 0.079 -
      run.phase * 2.5 +
      1.3 * Math.sin(wx * 0.014 + run.phase * 0.45),
  );
  const chop = Math.sin(wz * 0.23 - wx * 0.061 + run.phase * 3.1 + swell * 1.2);
  const fade = 1 / (1 + Math.max(0, scene.eye[1] / -ry - 360) * 0.003);
  const slope = (swell * 0.68 + chop * 0.32) * fade;
  const rcol = Math.max(
    0,
    Math.min(mirror.w - 1, Math.floor((x * mirror.w) / cols + slope * 1.8)),
  );
  const rrow = Math.max(
    0,
    Math.min(
      mirror.h - 1,
      Math.floor((y * mirror.h) / rows + chop * fade * 1.2),
    ),
  );
  const k = rrow * mirror.w + rcol;
  const len = Math.hypot(rx, ry, rz),
    grazing = 1 + ry / len;
  let reflected = colours[10][fog * 32 + 16 + Math.round(swell * 2)];
  if (mirror.depth[k]) {
    const haze = Math.min(15, Math.floor(1 / mirror.depth[k] / 160));
    reflected =
      colours[mirror.mat[k]][haze * 32 + Math.min(31, 6 + mirror.light[k] * 3)];
  } else {
    const alignment = (rx * 0.1 - ry * 0.142 - rz * 0.985) / len;
    if (alignment + slope * 0.011 > 0.993) reflected = colours[11][29];
  }
  const shallow = 1 - depthBand / 7;
  const bed =
    colours[shallow > 0.44 ? 37 : 36][
      fog * 32 + Math.round(12 + shallow * (6 + grainValue) + slope * 3)
    ];
  return blendWater(
    bed,
    reflected,
    0.14 + grazing * grazing * (0.59 - shallow * 0.16),
  );
}
function drawWaterRings() {
  place(0, 0, 0, 1, 0);
  for (const ring of waterRings) {
    const age = run.phase - ring.at,
      r = 7 + age * 48;
    for (let j = 0; j < 24; j++) {
      if (
        (j + Math.floor(ring.at * 7)) % 6 === 0 ||
        (age > 0.67 && j % 2 === 0)
      )
        continue;
      const a = (j * Math.PI) / 12,
        b = a + Math.PI / 12,
        x = ring.x + r * Math.cos(a),
        z = ring.z + r * Math.sin(a);
      if (bankDistance(x, z) < 2) continue;
      const point = (angle, radius) => [
        ring.x + radius * Math.cos(angle),
        0.55,
        ring.z + radius * Math.sin(angle),
      ];
      panel(
        [point(a, r), point(b, r), point(b, r + 1.4), point(a, r + 1.4)],
        37,
        false,
        1,
      );
    }
  }
}
function paintPixels() {
  // Reconstruct visible surfaces from depth: grain follows the world during a camera turn.
  const invX = 1 / aspectX,
    invY = 1 / aspectY;
  for (let y = 0; y < rows; y++) {
    const v = (rows * 0.5 - y - 0.5) * invY;
    const bx = forward[0] + v * up[0],
      by = forward[1] + v * up[1],
      bz = forward[2] + v * up[2];
    for (let x = 0, i = y * cols; x < cols; x++, i++) {
      const mat = materials[i],
        z = depths[i],
        lum = lights[i];
      let color = shadePixel(x,y,mat,z,lum,fine[i],bx,by,bz,invX);
      let visible = 0;
      while (visible < veilCount && veilLayers[visible].depth[i] > z) visible++;
      while (visible > 0) {
        const layer = veilLayers[--visible], packed = layer.surface[i];
        const tint = shadePixel(x,y,packed & 63,layer.depth[i],(packed >> 6) & 7,
          packed & 512,bx,by,bz,invX);
        color = blendWater(color,tint,opacity[packed >>> 10]);
      }
      imageWords[i] = color;
    }
  }
}
function shadePixel(x,y,mat,z,lum,detail,bx,by,bz,invX) {
  let tone = 4 + lum * 3.55,
    fog = 0;
  if (z === 0) {
    tone = 3 + lum * 3.8;
    if (mat === 11) tone = 12 + lum * 2.5;
    if ((x + 3 * y) % 4 === 0) tone++;
  } else {
    const d = 1 / z,
      u = (x + 0.5 - cols * 0.5) * invX,
      wx = scene.eye[0] + (bx + u * right[0]) * d,
      wy = scene.eye[1] + by * d,
      wz = scene.eye[2] + (bz + u * right[2]) * d;
    const sx = Math.floor(wx * 0.67),
      sz = Math.floor((wz + wy * 0.77) * 0.67);
    const fleck = grain[((sz & 127) << 7) + (sx & 127)];
    fog = Math.min(15, Math.max(0, Math.floor((d - 270) / 92)));
    if (mat === 36) {
      return waterPixel(
        x,
        y,
        wx,
        wz,
        bx + u * right[0],
        by,
        bz + u * right[2],
        lum,
        fog,
        fleck,
      );
    }
    if (detail) {
      // Quiet weave on clothing, clean blade highlights and lacquer edges.
      tone += mat === 7 ? 2 : (x + y) % 4 === 0 && mat !== 5 ? -1 : 0;
    } else if (mat === 20) {
      const course = Math.floor((wy + wz * 0.13) * 0.4),
        tile = (Math.floor(wx) + (course >> 2) * 4) & 7;
      tone +=
        (tile === 0 ? -5 : tile === 1 ? 4 : 0) +
        ((course & 3) === 0 ? -3 : 0);
    } else if (mat === 21 || mat === 4) {
      const fibre =
        grain[((Math.floor(wy * 0.17) & 127) << 7) + ((sx + sz) & 127)];
      tone += fibre * 0.8 + (Math.floor(wy) % 14 === 0 ? -3 : 0);
    } else if (mat === 6 || mat === 24) {
      tone +=
        fleck * 1.5 +
        (grain[((sz & 127) << 7) + ((sx + 1) & 127)] > 2 ? 2 : 0);
    } else if (mat === 22) {
      tone += fleck * 0.8;
      const row = Math.floor(wz / 15),
        px = wx + (row & 1) * 14;
      const fx = px - Math.floor(px / 31) * 31,
        fz = wz - row * 15;
      if (fz < 1.3 || fx < 1.1) tone -= 4;
      else if (fz < 2.7 || fx < 2.4) tone += 3;
    } else if (mat === 8) {
      tone += fleck * 0.45;
    } else tone += fleck * 0.7;
  }
  return colours[mat][fog * 32 + Math.max(0, Math.min(31, Math.round(tone)))];
}
let backdrop = null,
  backdropKey = "";
let detailScale = 0.83,
  renderCost = 13,
  samples = 0;
function tuneResolution(ms) {
  renderCost += 0.12 * (Math.min(80, ms) - renderCost);
  if (++samples < 16) return;
  if (renderCost > 13.5 && detailScale > 0.32) {
    detailScale = Math.max(
      0.32,
      detailScale * Math.max(0.79, Math.sqrt(12 / renderCost)),
    );
    samples = 0;
  } else if (samples >= 90 && renderCost < 8.5 && detailScale < 1) {
    detailScale = Math.min(1, detailScale * 1.075);
    samples = 0;
  }
}
function renderWorld() {
  const w = Math.max(1, canvas.clientWidth),
    h = Math.max(1, canvas.clientHeight);
  const started = performance.now();
  const pixelScale = Math.max(1.22, w / 1024, h / 576) / detailScale;
  const nx = Math.max(1, Math.round(w / pixelScale)),
    ny = Math.max(1, Math.round(h / pixelScale));
  if (nx !== cols || ny !== rows) {
    cols = nx;
    rows = ny;
    canvas.width = cols;
    canvas.height = rows;
    frameImage = ctx.createImageData(canvas.width, canvas.height);
    imageWords = new Uint32Array(frameImage.data.buffer);
    depths = new Float32Array(cols * rows);
    materials = new Uint8Array(cols * rows);
    lights = new Uint8Array(cols * rows);
    fine = new Uint8Array(cols * rows);
    veilLayers.length = cachedVeilLayers.length = 0;
    veilCount = cachedVeilCount = 0;
    backdrop = [
      new Float32Array(cols * rows),
      new Uint8Array(cols * rows),
      new Uint8Array(cols * rows),
    ];
    backdropKey = "";
  }
  camera();
  sightBodies.length = 0;
  const actorFaces = buildActorFaces();
  const key = [
    ...scene.eye,
    view.cameraYaw,
    view.cameraPitch,
    view.cameraRange, updateSceneryOccluders(),
  ].join("/");
  fadeFrame++;
  const rebuilt = key !== backdropKey;
  if (!rebuilt) {
    depths.set(backdrop[0]);
    materials.set(backdrop[1]);
    lights.set(backdrop[2]);
    veilCount = cachedVeilCount;
    copyVeilLayers(cachedVeilLayers, veilLayers, veilCount);
    fine.fill(0);
  } else {
    landscape();
    veilCount = 0;
    drawScenery();
    cachedVeilCount = veilCount;
    copyVeilLayers(veilLayers, cachedVeilLayers, cachedVeilCount);
    if (waterVisible) renderReflection();
    backdrop[0].set(depths);
    backdrop[1].set(materials);
    backdrop[2].set(lights);
    backdropKey = key;
  }
  drawForegroundProps();
  drawFaces(actorFaces);
  advanceFades(started, rebuilt);
  edgeLight();
  paintPixels();
  ctx.putImageData(frameImage, 0, 0);
  if (!run.paused) tuneResolution(performance.now() - started);
}

export {
  renderWorld,
  roadZ,
  impactTilt,
  place,
  panel,
  rod,
  scene,
  triangle,
  worldPoint,
  hull,
  box,
  buildScenery,
};
