// Each key stores time, torso angle, hip drop, knee fold, foot spread and arm support.
// Recovery has its own keys: pull the feet under the hips before extending the legs.
const upright = [0, 0, 0, 0, 0, 0];
export function impactDrop(actor, now) {
  const age = now - (actor.heavyImpactAt ?? -1);
  if (age < 0 || age >= .32) return 0;
  const t = age < .075 ? age/.075 : 1-(age-.075)/.245;
  return [8,7,13,10][actor.type]*t*t*(3-2*t);
}
const knightDown = [
  upright, [.23, .12, 8, .55, -.35, .3], [.62, .64, 24, 1, .35, .9],
  [.89, 1.37, 22, .63, 1, .64], [1, 1.31, 21, .62, .95, .48],
];
const knightUp = [
  [0, ...knightDown.at(-1).slice(1)], [.24, 1.05, 24, .86, .55, 1],
  [.53, .48, 28, 1, -.36, .91], [.73, .23, 19, .77, -.21, .28], [1, 0, 0, 0, 0, 0],
];
const houndDown = [
  upright, [.26, .09, 5, .45, -.2, .54], [.64, .49, 15, 1, .73, 1],
  [.87, .94, 18, .69, 1, .48], [1, .88, 17, .65, .95, .38],
];
const houndUp = [
  [0, ...houndDown.at(-1).slice(1)], [.25, .69, 15, .88, .45, .95],
  [.53, .33, 13, 1, -.18, 1], [.77, .1, 7, .58, -.1, .38], [1, 0, 0, 0, 0, 0],
];
function sample(keys, t) {
  let i = 1;
  while (i < keys.length - 1 && keys[i][0] < t) i++;
  const a = keys[i - 1], b = keys[i];
  const u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  return b.slice(1).map((v, j) => a[j + 1] + (v - a[j + 1]) * u * u * (3 - 2 * u));
}
function riseTime(d) { return d.missingPaws?.size ? 1.26 : [.65, .81, .94, 1.14][d.type]; }
const hold = .28;
export function knockdownDuration(d) { return d.fallTime + hold + riseTime(d); }
export function knockdownPose(d, now) {
  const hound = d.type === 0, age = now - d.fellAt;
  const riseStart = d.fallTime + hold;
  let rise = Math.max(0, (age - riseStart) / riseTime(d));
  if (!d.hp) {
    // A lethal hit interrupts a rise from its current pose.
    const diedAt=d.diedAt ?? now;
    rise = Math.max(0, (diedAt - d.fellAt - riseStart) / riseTime(d) - (now - diedAt) / .35);
  }
  if (hound && d.missingPaws?.size && rise>0 && rise<1) {
    // First push slips; gather the remaining feet before the second effort.
    rise = rise<.32 ? rise*1.45 : rise<.52 ? .464-(rise-.32)*1.35 : .194+(rise-.52)*.806/.48;
  }
  if (d.missingPaws?.size>=2) {
    // If the second paw goes during a rise, ease back from that exact pose.
    const failed=d.failedRise;
    rise=failed ? Math.min(1,failed.from)*Math.max(0,1-(now-failed.at)/.3) : 0;
  }
  const [angle, drop, fold, spread, brace] = rise > 0
    ? sample(hound ? houndUp : knightUp, rise)
    : sample(hound ? houndDown : knightDown, age / d.fallTime);
  return {angle, drop, fold, spread, brace, rise, side: d.fallSide, hip: hound ? 32 : 46};
}
export function loweredHeight(y, pose, scale = 1) {
  return y - pose.drop * scale * Math.max(0, Math.min(1, (y / scale - 5) / (pose.hip - 5)));
}
