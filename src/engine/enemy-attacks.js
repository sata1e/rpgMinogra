import { blend3, clamp01, ease, mix } from "./wanderer.js";
import { parryTiming } from "./combat-timing.js";

// Release starts inside the player's parry window, even when difficulty changes windup time.
export function attackPhases(elapsed, windup) {
  const releaseTime = Math.min(windup * .36, (parryTiming.open + parryTiming.close) / 2);
  const releaseAt = windup - releaseTime;
  return {
    lift: ease(elapsed / (releaseAt * .78)),
    strike: ease((elapsed - releaseAt) / releaseTime),
  };
}

export function weaponArm(side, pose, boss, breath, contact, bind) {
  const { lift, strike, recover, deflect } = pose;
  const wide = boss || pose.reverse;
  const rest = [17, 54 + breath, side * 22];
  const raised = wide ? [-6, 84, side * 35] : [0, 99, side * 14];
  const finish = wide ? [32, 62, -side * 10] : [32, 52, side * 6];
  let hand = blend3(blend3(blend3(rest, raised, lift), finish, strike), rest, recover);
  const restPitch = .86;
  const pitch = mix(mix(mix(restPitch, wide ? 1.8 : 2.35, lift), wide ? -.18 : -.58, strike), restPitch, recover);
  const yaw = side * mix(mix(mix(.05, wide ? 1.6 : .35, lift), wide ? -.75 : -.18, strike), .05, recover);
  let axis = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  hand = blend3(hand, [7, 68, 31 * pose.side], deflect);
  const length = boss ? 51 : 49;
  if (contact && bind > 0) {
    // Keep the crossing inside the enemy blade, even for a short player weapon.
    const delta = contact.map((n, i) => n - hand[i]);
    const distance = Math.hypot(...delta) || 1;
    const along = delta.map(n => n / distance);
    const grip = contact.map((n, i) => n - along[i] * Math.min(length * .93, Math.max(length * .22, distance)));
    hand = blend3(hand, grip, bind);
    axis = blend3(axis, along, bind);
  }
  axis[2] += pose.side * deflect * (1 - bind) * 1.55;
  const scale = length / (Math.hypot(...axis) || 1);
  const tip = hand.map((n, i) => n + axis[i] * scale);
  const elbow = blend3([4, 60, side * 26], [-5, 79, side * 29], lift * (1 - strike) * (1 - recover));
  elbow[2] += 7 * pose.side * clamp01(deflect);
  return { hand, elbow, tip };
}
