import {
  worldPoint,
  houndBackHeight,
  triangle,
  hull,
  panel,
  rod,
  place,
  roadZ,
  box,
  scene,
} from "./world3d.js";
import { run } from "./journey.js";
import { weaponArm } from "./enemy-attacks.js";
import { impactDrop } from "./demon-fall.js";
import { demonSection } from "./cutting.js";
import { localFoot, houndFeet, knightFeet } from "./footing.js";

// Elliptical sections perpendicular to a centreline let a limb bend continuously
// through the joint. Each section contains x, height, depth and two radii.
function sculpt(sections, ink, sides = 8) {
  const first = sections[0],
    last = sections.at(-1);
  const ref =
    Math.abs(last[2] - first[2]) >
    Math.hypot(last[0] - first[0], last[1] - first[1])
      ? [0, 1, 0]
      : [0, 0, 1];
  let previous;
  for (let j = 0; j < sections.length; j++) {
    const p = sections[j],
      a = sections[Math.max(0, j - 1)],
      b = sections[Math.min(sections.length - 1, j + 1)];
    let dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let ax = dy * ref[2] - dz * ref[1],
      ay = dz * ref[0] - dx * ref[2],
      az = dx * ref[1] - dy * ref[0];
    len = Math.hypot(ax, ay, az);
    if (len < 0.001) {
      ax = 1;
      ay = az = 0;
      len = 1;
    }
    ax /= len;
    ay /= len;
    az /= len;
    const bx = dy * az - dz * ay,
      by = dz * ax - dx * az,
      bz = dx * ay - dy * ax,
      ring = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides,
        u = p[3] * Math.cos(angle),
        v = (p[4] ?? p[3]) * Math.sin(angle);
      ring.push(
        worldPoint([
          p[0] + ax * u + bx * v,
          p[1] + ay * u + by * v,
          p[2] + az * u + bz * v,
        ]),
      );
    }
    if (previous)
      for (let i = 0; i < sides; i++) {
        const k = (i + 1) % sides;
        triangle(previous[i], ring[i], ring[k], ink, true);
        triangle(previous[i], ring[k], previous[k], ink, true);
      }
    if (j === 0 || j === sections.length - 1)
      for (let i = 1; i < sides - 1; i++)
        triangle(ring[0], ring[i], ring[i + 1], ink, true);
    previous = ring;
  }
}
function ovalMesh(x, y, z, rx, ry, rz, m) {
  hull(
    [
      [-1, 0.08],
      [-0.73, 0.66],
      [-0.26, 0.97],
      [0.28, 0.96],
      [0.76, 0.65],
      [1, 0.08],
    ].map(([h, r]) => [x, y + ry * h, z, rx * r, rz * r]),
    m,
    10,
    true,
  );
}
function fallingFoot(d, index, pattern, fall) {
  const foot = localFoot(d, index, pattern);
  if (!fall) return foot;
  const blend = Math.min(1, fall.fold + fall.rise);
  return [foot[0] + (pattern[index][0] - foot[0]) * blend,
    foot[1] * (1 - blend), foot[2] + (pattern[index][1] - foot[2]) * blend];
}
// The same cross-section closes the detached limb and the animated attachment.
function jointSection(x,y,z,r,side) {
  let outer=Array.from({length:8},(_,i)=>{
    const a=i*Math.PI/4;
    return [x+r*Math.cos(a),y+(side? r*Math.sin(a):0),z+(side?0:r*Math.sin(a))];
  });
  const center=[x,y,z];
  for (let j=0;j<demonSection.length;j++) {
    const inner=outer.map(p=>p.map((v,k)=>center[k]+(v-center[k])*(1-1/(demonSection.length-j))));
    outer.forEach((p,i)=>{
      const next=(i+1)%outer.length;
      panel(j===demonSection.length-1 ? [p,outer[next],center] : [p,outer[next],inner[next],inner[i]],demonSection[j],true);
    });
    outer=inner;
  }
}
function houndModel(d, load, snap, fall, sampleLunge) {
  const h = houndBackHeight(d, load, snap);
  const chest = fall ? 6 * fall.brace * Math.min(1, fall.rise * 4) : 0;
  if (sampleLunge) {
    sampleLunge(worldPoint([26, h + chest + 15, 0]), worldPoint([42, h + chest + 11, 0]), .94);
  }
  // Pelvis, tucked belly, deep rib cage, withers and sloping neck.
  sculpt(
    [
      [-31, h, 0, 3, 4],
      [-22, h + 2, 0, 10, 10],
      [-11, h + 2, 0, 7, 8],
      [1, h + 1, 0, 12, 10],
      [12, h + 3 + chest, 0, 15, 12],
      [19, h + 7 + chest, 0, 10, 9],
      [26, h + 10 + chest, 0, 6, 6],
    ],
    4,
    12,
  );
  sculpt(
    [
      [-26, h + 3, 0, 4],
      [-36, h + 5, 0, 3.7],
      [-44, h + 12, 3 * Math.sin(run.phase * 3), 2.7],
      [-51, h + 13, 5 * Math.sin(run.phase * 3), 0.6],
    ],
    1,
  );
  for (const s of [-1, 1]) {
    for (const front of [false, true]) {
      const index = (s > 0 ? 2 : 0) + (front ? 1 : 0);
      if (d.missingPaws?.has(index)) {
        ovalMesh(front?13:-20,h-1,s*8,4,4.5,3.6,4);
        jointSection(front?13:-20,h-5.3,s*8,3.3,false);
        continue;
      }
      const firstPawFace=scene.faces.length;
      let [toe, lift, z] = fallingFoot(d, index, houndFeet, fall);
      const fold = (fall?.fold ?? 0) * (s === fall?.side ? 1 : .68);
      if (fall) {
        toe += (front ? 10 : -12) * fall.spread + (front ? 5 : 0) * fall.brace;
        z += s * 8 * fall.spread;
      }
      const x = front ? 13 : -20;
      sculpt(
        [
          [x, h + 2 + (front ? chest : 0), s * 8, front ? 6 : 8, 5],
          [x + (front ? -2 : 5), h - 6, s * 9, front ? 5 : 7, 4],
          [x + (front ? -4 - 9 * fold : 8 + 10 * fold), h - 14, (s * 9 + z) / 2, 3, 3],
          [toe - (front ? 1 : 8), 9 + lift, z, 2.8, 2.3],
          [toe, 4 + lift, z, 2, 2],
        ],
        4,
      );
      if (front && sampleLunge) {
        sampleLunge(worldPoint([toe - 1, 9 + lift, z]), worldPoint([toe + 7, 1 + lift, z]), .78);
      }
      ovalMesh(toe + 2, 3 + lift, z, 5, 2.6, 3.4, 1);
      for (const k of [-1, 1])
        sculpt(
          [
            [toe + 4, 3 + lift, z + k, 1],
            [toe + 7, 1 + lift, z + k, 0.35],
          ],
          3,
          4,
        );
      if (d.severPaw===index) {
        jointSection(front?13:-20,h+2+(front?chest:0)+.2,s*8,4.7,false);
        for (let i=firstPawFace;i<scene.faces.length;i++) scene.faces[i].paw=index;
      }
    }
    for (let j = 0; j < 4; j++)
      sculpt(
        [
          [12 - j * 5, h + 11, s * 5, 1.7],
          [10 - j * 5, h + 4, s * (11 - j * 0.5), 1.5],
          [7 - j * 4, h - 4, s * 8, 0.6],
        ],
        2,
        5,
      );
    sculpt(
      [
        [22, h + chest + 17, s * 5, 3.6],
        [17, h + chest + 24, s * 9, 2.3],
        [19, h + chest + 31, s * 11, 0.3],
      ],
      3,
    );
  }
  // Split clumps of ash-grey guard hair along the raised hackles.
  for (let k = 0; k < 9; k++) {
    const x = 18 - k * 4,
      y = h + chest + 14 - k * 0.63;
    for (const side of [-1, 1])
      panel(
        [
          [x + 3, y, side * 2],
          [x - 3, y - 2, side * 6],
          [x - 7, y + 4 + (k % 3), side * 5],
        ],
        k % 3 === 0 ? 2 : 1,
        true,
      );
  }
  const jaw = load * 9 + 1;
  sculpt(
    [
      [20, h + chest + 14, 0, 6, 7],
      [27, h + chest + 14, 0, 8, 8],
      [33, h + chest + 12, 0, 4.5, 5],
      [43, h + chest + 10, 0, 3, 4],
    ],
    2,
  );
  sculpt(
    [
      [27, h + chest + 7, 0, 4, 5],
      [36, h + chest + 5 - jaw, 0, 2.3, 4],
      [42, h + chest + 6 - jaw, 0, 1, 3],
    ],
    1,
  );
  ovalMesh(42, h + chest + 11, 0, 2.8, 2, 4, 0);
  for (const s of [-1, 1]) {
    ovalMesh(31, h + chest + 16, s * 6, 2.2, 1.2, 1.6, 5);
    sculpt(
      [
        [35, h + chest + 9, s * 4, 1.3],
        [36, h + chest + 4, s * 4, 0.2],
      ],
      3,
      5,
    );
  }
}
function mournerModel(d, load, fall) {
  const y = 14 + Math.sin(run.phase * 2.2 + d.home) * 3 - 8 * (fall?.fold ?? 0) - impactDrop(d,run.phase);
  // Overlapping cloth gores open and close independently along the ragged hem.
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      b = ((i + 1.12) * Math.PI) / 8;
    const point = (angle, h, r, drift) => [
      Math.cos(angle) * (r + (h < 30 ? 9 * (fall?.spread ?? 0) : 0)) + drift,
      h + y,
      Math.sin(angle) * r * 0.82,
    ];
    const wave = Math.sin(run.phase * 2.6 + i * 0.64),
      hem = -4 + 7 * Math.sin(i * 7.1) + wave * 3;
    const p = point(a, 67, 12, 2),
      q = point(b, 67, 12, 2),
      r = point(b, 38, 15, 0),
      s = point(a, 38, 15, 0);
    panel([p, q, r, s], i % 4 ? 8 : 14, true);
    panel(
      [
        s,
        r,
        point(b, hem + 5, 24, -4 + wave * 4),
        point(a + 0.08, hem, 26, -6 + wave * 4),
      ],
      i % 4 ? 8 : 1,
      true,
    );
  }
  hull(
    [
      [3, y + 57, 0, 14, 12],
      [2, y + 68, 0, 18, 14],
      [1, y + 81, 0, 12, 11],
      [-3, y + 90, 0, 4, 4],
    ],
    8,
    14,
    true,
  );
  ovalMesh(10, y + 74, 0, 5, 10, 7, 0);
  ovalMesh(13, y + 72, 0, 3.8, 7.5, 5.8, 3);
  for (const s of [-1, 1]) {
    ovalMesh(16, y + 74, s * 2.9, 1.2, 2, 1.2, 0);
    const brace = (fall?.brace ?? 0) * (s === fall?.side ? 1 : .5);
    const hx = 15 + load * 11 + 8 * brace,
      hy = y + 40 + load * 29 - 11 * brace,
      z = s * (22 + load * 5 + 11 * brace);
    sculpt(
      [
        [0, y + 61, s * 12, 6],
        [7, y + 46, s * 19, 5],
        [hx, hy, z, 2.4],
      ],
      8,
    );
    ovalMesh(hx + 1, hy, z, 2.8, 3, 2.5, 2);
    for (let j = 0; j < 3; j++)
      sculpt(
        [
          [hx + 2, hy, z + j - 1, 1],
          [hx + 4 + j, hy - 4, z + j - 1, 0.7],
          [hx + 6 + j, hy - 3, z + j - 1, 0.3],
        ],
        3,
        4,
      );
    sculpt(
      [
        [9, y + 81, s * 7, 2],
        [7, y + 64, s * 10, 3],
        [9 + Math.sin(run.phase * 2) * 2, y + 41, s * 13, 0.6],
      ],
      1,
    );
  }
  // Thin vermilion tear marks on the pale spirit mask.
  for (const side of [-1, 1])
    rod([15.8, y + 72, side * 3.5], [15, y + 68, side * 3], 0.72, 4, true);
  if (d.wind >= 0 && d.hp>0) {
    place(d.aimX, roadZ(d.aimY));
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI) / 9;
      box(47 * Math.cos(a), 1, 47 * Math.sin(a), 5, 2, 5, 9, true, 2);
    }
  }
}
function warBlade(hand, tip) {
  const mid = hand.map((v, i) => (v + tip[i]) * 0.5);
  mid[0] -= 1.5;
  sculpt(
    [
      [...hand, 2.1, 1],
      [...mid, 1.8, 0.85],
      [...tip, 0.2, 0.3],
    ],
    7,
    6,
  );
  rod(
    [hand[0], hand[1], hand[2] - 4],
    [hand[0], hand[1], hand[2] + 4],
    1.4,
    5,
    true,
  );
}
function armoredModel(d, pose, boss, contact, bind, fall, sampleAttack) {
  const sink = impactDrop(d,run.phase)+(d.missingArms?.size===2 ? 8*pose.lift*(1-pose.recover) : 0);
  const breath =
    Math.sin(run.phase * 2 + d.home) * 0.7 - sink +
    (d.feet?.feet.reduce((h, f) => Math.max(h, f.h), 0) ?? 0) * 0.14;
  const load = pose.lift * (1 - pose.strike);
  const surge = (-5 * load + 7 * pose.strike) * (1 - pose.recover),
    shoulder = 80 + breath,
    plate = boss ? 4 : 14;
  scene.unit = boss ? 1.17 : 1;
  for (const s of [-1, 1]) {
    let [heel, lift, z] = fallingFoot(d, s < 0 ? 0 : 1, knightFeet, fall);
    const lead = s === fall?.side;
    const knee = (fall?.fold ?? 0) * (lead ? 18 : 12) + sink*.7;
    if (fall) {
      heel += (lead ? 12 : -16) * fall.spread;
      z += s * (lead ? 7 : 4) * fall.spread;
    }
    sculpt(
      [
        [s * 2, 45-sink, s * 8, 7.2],
        [heel + 4 + knee, 29, (z + s * 10) / 2, 6.4],
        [heel + 4 + knee, 24, (z + s * 10) / 2, 5.5],
        [heel, 9 + lift, z, 3.4],
      ],
      1,
    );
    hull(
      [
        [heel, 7 + lift, z, 4, 4],
        [heel + 1 + knee * .52, 17 + lift, z, 5.7, 5],
        [heel + 4 + knee, 23 + lift, (z + s * 10) / 2, 5, 4],
      ],
      plate,
      9,
      true,
    );
    ovalMesh(heel + 3, 4 + lift, z, 8, 3.2, 5.3, 2);
  }
  hull(
    [
      [-3, 28-sink, 0, 16, 20],
      [-1, 45-sink, 0, 13, 16],
      [0, 54-sink, 0, 11, 13],
      [1, 68 + breath, 0, 15, 20],
      [surge, shoulder, 0, 12, 22],
      [surge, shoulder + 3, 0, 8, 10],
    ],
    plate,
    14,
    true,
  );
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 66 - i * 5 + breath;
      sculpt(
        [
          [10, y + 3, s * 3, 1.7],
          [12, y + 1, s * 10, 2],
          [8, y - 2, s * 16, 1.5],
          [1, y - 4, s * 17, 0.65],
        ],
        boss ? 12 : 3,
        6,
      );
    }
    const firstArmFace = scene.faces.length;
    if (d.missingArms?.has(s)) {
      ovalMesh(surge,shoulder-2,s*15,5,5.5,3.5,plate);
      jointSection(surge,shoulder-2,s*18.5,4.7,true);
      continue;
    }
    const active = d.missingArms?.size===1 || s === (boss && pose.reverse ? -1 : 1);
    const bash = active && !boss && s<0;
    const shove = bash ? (-8*load+20*pose.strike)*(1-pose.recover) : 0;
    const { hand, elbow, tip } = active
      ? bash ? {hand:[17+shove,54+breath,-22],elbow:[4+shove*.5,61+breath,-26],tip:[29+shove,57+breath,-24]}
        : weaponArm(s, pose, boss, breath, contact, bind)
      : {hand: [17, 54 + breath, s*22], elbow: [4,60-sink,s*26], tip: [51,94+breath,s*25]};
    if (fall && (s === 1 || boss)) {
      const support = fall.brace * (s === fall.side ? 1 : .72);
      const dx = (12 - hand[0]) * support, dy = (49 - hand[1]) * support;
      const dz = (s * 35 - hand[2]) * support;
      hand[0] += dx; hand[1] += dy; hand[2] += dz;
      elbow[0] -= 9 * support; elbow[2] += s * 7 * support;
      tip[0] += dx + 18 * support; tip[1] += dy - 17 * support; tip[2] += dz;
    }
    if (active && sampleAttack) sampleAttack(worldPoint(elbow),worldPoint(hand),worldPoint(tip));
    sculpt(
      [
        [surge, shoulder - 2, s * 16, 8],
        [...elbow, 5.5],
        [...hand, 3.3],
      ],
      plate,
    );
    ovalMesh(surge - 1, shoulder - 2, s * 18, 10, 6, 9, plate);
    for (let row = 0; row < 3; row++) {
      const y = shoulder - row * 2.8;
      rod(
        [surge - 7, y, s * (25 - row * 0.4)],
        [surge + 5, y, s * (25 - row * 0.4)],
        1.1,
        plate,
        true,
      );
      for (const x of [-4, 2])
        rod(
          [surge + x, y + 0.6, s * (25.7 - row * 0.4)],
          [surge + x + 1, y - 1, s * (25.7 - row * 0.4)],
          0.65,
          4,
          true,
        );
    }
    for (let j = 0; j < 3; j++)
      rod(
        [surge - 6 + j * 4, shoulder, s * 23],
        [surge - 5 + j * 4, shoulder - 5, s * 25],
        1.2,
        5,
        true,
      );
    ovalMesh(...hand, 4.6, 4.5, 4, 2);
    if (s === 1 || boss) {
      warBlade(hand, tip);
      if (active && d.wind >= 0 && pose.strike > 0 && pose.strike < .5) {
        const edge = hand.map((n,i) => n + (tip[i] - n) * .74);
        rod(edge, tip, 1.3, 7, true, 4);
      }
    } else {
      const outline = [
        [21, 74, -20],
        [25, 70, -32],
        [26, 48, -34],
        [21, 30, -24],
        [16, 48, -13],
        [16, 68, -12],
      ];
      for (const p of outline) { p[0]+=shove; p[1]-=sink; }
      for (let i = 0; i < outline.length; i++) {
        panel(
          [outline[i], outline[(i + 1) % outline.length], [29+shove, 57-sink, -24]],
          14,
          true,
        );
        rod(outline[i], outline[(i + 1) % outline.length], 1.5, 2, true);
      }
      ovalMesh(28+shove, 57-sink, -24, 3, 6, 4, 5);
    }
    if (d.severArm===s) {
      jointSection(surge-1,shoulder-2,s*9.1,5.2,true);
      for (let i=firstArmFace;i<scene.faces.length;i++) scene.faces[i].arm=s;
    }
  }
  const headY = shoulder + 12;
  if (boss) {
    ovalMesh(4, headY + 1, 0, 9, 11, 8, 31);
    for (const side of [-1, 1]) {
      ovalMesh(11.6, headY + 3, side * 4, 1.5, 1, 1.4, 0);
      rod([12, headY + 5, side * 2], [10, headY + 6, side * 6], 1, 33, true);
    }
    ovalMesh(12, headY + 0.5, 0, 2.6, 2.4, 2, 31);
    ovalMesh(1, headY + 11, 0, 11.6, 9, 11.8, 33);
    for (let i = 0; i < 34; i++) {
      const h = (i + 0.5) / 34,
        a = i * 2.4,
        r = Math.sqrt(1 - h * h);
      ovalMesh(
        1 + 12 * r * Math.cos(a),
        headY + 7 + h * 13,
        12 * r * Math.sin(a),
        3.6,
        4,
        3.8,
        i % 4 ? 33 : 0,
      );
    }
  } else {
    hull(
      [
        [5, headY - 9, 0, 6, 6],
        [5, headY - 3, 0, 10, 9],
        [4, headY + 6, 0, 11, 10],
        [0, headY + 13, 0, 8, 8],
        [-2, headY + 15, 0, 4, 4],
      ],
      1,
      14,
      true,
    );
    for (const s of [-1, 1]) {
      sculpt(
        [
          [10, headY + 5, s * 2, 2.6],
          [12, headY + 6, s * 6, 2.3],
          [9, headY + 8, s * 9, 1],
        ],
        2,
      );
      ovalMesh(13, headY + 2, s * 5, 1.6, 1.4, 2.4, 5);
      sculpt(
        [
          [1, headY + 8, s * 8, 3],
          [-4, headY + 13, s * 11, 2],
          [-7, headY + 20, s * 13, 0.4],
        ],
        3,
      );
      for (let k = 0; k < 3; k++)
        rod(
          [13, headY - 2 - k * 2, s * 2],
          [10, headY - 2 - k * 2, s * 7],
          0.8,
          2,
          true,
        );
    }
  }
  if (boss) {
    for (let i = 0; i < 3; i++) {
      const s = i - 1,
        wave = Math.sin(run.phase * 2 + s);
      panel(
        [
          [-8, shoulder + 1, s * 11 - 5],
          [-8, shoulder + 1, s * 11 + 6],
          [-17, 54, s * 14 + 7],
          [-25 + wave * 4, 25, s * 17 + 5],
          [-19, 36, s * 15 - 6],
        ],
        i % 2 ? 4 : 1,
        true,
      );
    }
  }
}

export { sculpt, ovalMesh, houndModel, mournerModel, armoredModel };
