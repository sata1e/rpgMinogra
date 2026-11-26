import { ease, clamp01 } from "./wanderer.js";

export const deathDuration = 1.36;

export function fallPose(age) {
  const stagger = ease(age / .27);
  const buckle = ease((age - .14) / .42);
  const tip = clamp01((age - .28) / .62);
  const settled = ease((age - .9) / .2);
  // Accelerate into the ground, then let the shoulder settle before the fade.
  const angle = .17 * stagger + 1.39 * tip * tip - .09 * Math.sin(Math.PI * settled);
  return {
    angle, bank: .19 * buckle, groundWeight: stagger,
    drop: 21 * buckle - 10 * settled,
    step: Math.sin(Math.PI * ease(age / .38)),
    relax: ease((age - .08) / .83),
  };
}
