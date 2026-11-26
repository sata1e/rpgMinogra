import { groundHeight } from "./valley.js";
import { run, cut, trackY, depthRatio } from "./journey.js";
import { weaponGeometry, katanaPose, blend3 } from "./wanderer.js";
import { place, panel, rod, scene, triangle } from "./world3d.js";

const hitParticles = [],
  bladeTrace = [];
const freshBlood = 34,
  dryBlood = 35;
function expireCombatFx() {
  for (let i = hitParticles.length - 1; i >= 0; i--)
    if (run.phase - hitParticles[i].at > hitParticles[i].life)
      hitParticles.splice(i, 1);
  while (bladeTrace.length && run.phase - bladeTrace[0].at > 0.068)
    bladeTrace.shift();
}
function sampleBladeTrace(age) {
  if (age < cut().start || age > cut().end) return;
  const w = weaponGeometry(katanaPose(age), run.attackDir, run.pos, run.depth);
  const base=groundHeight(run.pos,(run.depth-trackY)/depthRatio);
  const tip = [w.tip.x, base+w.tip.z, w.tip.y - trackY / depthRatio];
  const inner = [w.middle.x, base+w.middle.z, w.middle.y - trackY / depthRatio];
  bladeTrace.push({ tip, inner: blend3(tip, inner, 0.55), at: run.phase });
}
function impactFx(actor, hit, dx, dz) {
  const x = hit.x,
    y = hit.z + groundHeight(run.pos,(run.depth-trackY)/depthRatio),
    z = hit.y - trackY / depthRatio;
  const length = Math.hypot(dx, dz) || 1;
  const direction = Math.atan2(dz / length, dx / length);
  if (actor) {
    const wounds = (actor.wounds ??= []);
    if (wounds.length >= 6) wounds.shift();
    wounds.push({ at: run.phase, point: [x, y, z], anchor: null });
  }
  for (let i = 0; i < (actor ? 11 : 7); i++) {
    const angle = direction + (Math.random() - 0.5) * 2.8;
    const speed = 32 + Math.random() * 92,
      vy = 26 + Math.random() * 68;
    const spark = !actor || i === 0;
    const land = (vy + Math.sqrt(vy * vy + 600 * Math.max(0, y - groundHeight(x,z) - 1))) / 300;
    hitParticles.push({
      at: run.phase,
      x,
      y,
      z,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      vy,
      land,
      spark,
      size: 1.1 + Math.random() * 1.2,
      life: spark ? 0.13 + Math.random() * 0.09 : land + 3 + Math.random() * 3,
    });
  }
  if (hitParticles.length > 180)
    hitParticles.splice(0, hitParticles.length - 180);
}
function drawCombatFx() {
  place(0, 0, 0, 1, 0);
  for (let i = 1; i < bladeTrace.length; i++) {
    const a = bladeTrace[i - 1],
      b = bladeTrace[i],
      m = run.phase - b.at < 0.025 ? 7 : 14;
    panel([a.tip, b.tip, b.inner, a.inner], m, true, m === 7 ? 1 : 0);
  }
  for (const p of hitParticles) {
    const age = run.phase - p.at,
      t = Math.min(age, p.land),
      x = p.x + p.vx * t,
      z = p.z + p.vz * t;
    if (age >= p.land && !p.spark) {
      const r = p.size * 1.6, h=groundHeight(x,z)+1;
      panel(
        [
          [x - r, h, z],
          [x, h, z - r * 0.6],
          [x + r * 1.4, h, z + 0.2],
          [x + 0.3, h, z + r * 0.8],
        ],
        dryBlood,
        true,
      );
    } else {
      const y = Math.max(1, p.y + p.vy * t - 150 * t * t);
      rod(
        [x, y, z],
        [x - p.vx * 0.026, y - (p.vy - 300 * t) * 0.026, z - p.vz * 0.026],
        p.size,
        p.spark ? 5 : freshBlood,
        true,
        p.spark ? 4 : 1,
      );
    }
  }
}
// Keep the mark on an animated triangle, including when the body tips over.
function drawWounds(actor, start) {
  if (!actor.wounds?.length) return;
  const end = scene.faces.length;
  for (const w of actor.wounds) {
    if (w.anchor === null) {
      let best = Infinity;
      for (let i = start; i < end; i++) {
        const [a, b, c] = scene.faces[i];
        const d = w.point.reduce(
          (sum, v, k) => sum + (v - (a[k] + b[k] + c[k]) / 3) ** 2,
          0,
        );
        if (d < best) {
          best = d;
          w.anchor = i - start;
        }
      }
    }
    if (w.anchor === null || start + w.anchor >= end) continue;
    const [a, b, c] = scene.faces[start + w.anchor];
    const center = a.map((v, k) => (v + b[k] + c[k]) / 3);
    const along = b.map((v, k) => v - a[k]),
      ac = c.map((v, k) => v - a[k]);
    const n = [
      along[1] * ac[2] - along[2] * ac[1],
      along[2] * ac[0] - along[0] * ac[2],
      along[0] * ac[1] - along[1] * ac[0],
    ];
    const normalLength = Math.hypot(...n),
      edgeLength = Math.hypot(...along);
    if (normalLength < 0.001 || edgeLength < 0.001) continue;
    for (let k = 0; k < 3; k++) {
      n[k] /= normalLength;
      along[k] /= edgeLength;
    }
    const cross = [
      n[1] * along[2] - n[2] * along[1],
      n[2] * along[0] - n[0] * along[2],
      n[0] * along[1] - n[1] * along[0],
    ];
    const side =
      n.reduce((sum, v, k) => sum + v * (scene.eye[k] - center[k]), 0) > 0
        ? 1
        : -1;
    const point = (u, v) =>
      center.map(
        (s, k) => s + u * along[k] + v * cross[k] + n[k] * side * 0.55,
      );
    triangle(
      point(-3.4, -0.7),
      point(3.8, 0.6),
      point(0.4, 1.8),
      run.phase - w.at < 1.5 ? freshBlood : dryBlood,
      true,
      1,
    );
  }
}

export {
  expireCombatFx,
  sampleBladeTrace,
  impactFx,
  hitParticles,
  bladeTrace,
  drawWounds,
  drawCombatFx,
};
