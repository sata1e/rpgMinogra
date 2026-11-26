import {
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
} from "./journey.js";
import { renderWorld } from "./world3d.js";
import { drawMap } from "./valley.js";
const view = {};
("use strict");
const canvas = document.querySelector("#world"),
  ctx = canvas.getContext("2d", { alpha: false });
view.cameraYaw = -0.48;
view.cameraPitch = 0.19;
view.cameraRange = 276;
view.mouseLook = false;
let hadLock = false;
let requestingLock = false;
let edgeTurn = 0;
let previousPointer = null;
let releasingLock = false;
const heldAlts = new Set();
function syncCursor() {
  document.documentElement.classList.toggle("hide-game-cursor", !run.paused && heldAlts.size === 0);
}
function releaseMouse() {
  if (document.pointerLockElement === canvas && !releasingLock) {
    releasingLock = true;
    document.exitPointerLock();
  }
}
function startMouseLook() {
  if (run.paused || heldAlts.size || releasingLock) return;
  if (!window.matchMedia("(any-pointer:fine)").matches || requestingLock ||
      document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  requestingLock = true;
  try {
    canvas.requestPointerLock()?.catch(lockFailed);
  } catch {
    lockFailed();
  }
}
function lockFailed() {
  requestingLock = false;
  syncCursor();
}
function resetMouse() {
  edgeTurn = 0;
  previousPointer = null;
  heldAlts.clear();
  releaseMouse();
}
function resumeGame() {
  resume();
  startMouseLook();
}
export function pauseGame() {
  if (!run.paused) modal(true);
}
function bindControls() {
  document.addEventListener("game:pause", syncCursor);
  const selector = $("#difficulty");
  selector.onchange = () => chooseDifficulty(selector.value);
  chooseDifficulty(selector.value);
  $("#sheathe").onclick = toggleBlade;
  $("#pause").onclick = () => (run.paused ? resumeGame() : modal(true));
  $("#resume").onclick = resumeGame;
  $("#pick").onclick = interact;
  $("#parry").onclick = parry;
  $("#dodge").onclick = dodge;
  $("#sound").onclick = () => {
    run.audio ??= new AudioContext();
    run.audio.resume();
    run.sound = !run.sound;
    $("#sound").textContent = run.sound ? "♪" : "♫";
    $("#sound").setAttribute("aria-pressed", run.sound);
    $("#sound").setAttribute(
      "aria-label",
      run.sound ? "Выключить звук" : "Включить звук",
    );
    ping(410);
  };
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onauxclick = (e) => e.preventDefault();
  canvas.onmousedown = (e) => {
    if (run.paused || heldAlts.size || (e.button !== 0 && e.button !== 2) || run.windAt !== null) return;
    e.preventDefault();
    view.mouseLook = true;
    startMouseLook();
    drawSword();
    attack(e.button === 2 ? 1 : 0);
  };
  function orbit(dx, dy) {
    view.cameraYaw -= dx * 0.0045;
    view.cameraPitch = Math.max(
      0.14,
      Math.min(0.7, view.cameraPitch + dy * 0.003),
    );
  }
  function lookUnlocked(e) {
    if (run.paused || heldAlts.size || document.pointerLockElement === canvas) return;
    view.mouseLook = true;
    if (previousPointer) orbit(e.clientX - previousPointer.x, e.clientY - previousPointer.y);
    previousPointer = { x: e.clientX, y: e.clientY };
    const bounds = canvas.getBoundingClientRect();
    const band = Math.min(40, bounds.width * 0.1);
    const x = e.clientX - bounds.left;
    edgeTurn = band > 0 ? Math.max(-1, Math.min(1,
      x < band ? x / band - 1 : x > bounds.width - band ? 1 - (bounds.width - x) / band : 0
    )) : 0;
  }
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") lookUnlocked(e);
  }, true);
  window.addEventListener("mousemove", (e) => {
    if (run.paused || heldAlts.size) return;
    if (document.pointerLockElement === canvas) {
      view.mouseLook = true;
      orbit(e.movementX, e.movementY);
    } else {
      // WebViews may send only compatibility mouse events. Identical coordinates yield zero.
      lookUnlocked(e);
    }
  }, true);
  document.addEventListener("pointerlockerror", lockFailed);
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    requestingLock = false;
    previousPointer = null;
    edgeTurn = 0;
    syncCursor();
    const wasLocked = hadLock;
    hadLock = locked;
    if (locked && (heldAlts.size || run.paused)) releaseMouse();
    if (!locked) {
      const intentional = releasingLock;
      releasingLock = false;
      if (intentional && !heldAlts.size && !run.paused) startMouseLook();
      else if (wasLocked && !intentional && !run.paused) modal(true);
    }
  });
  // Suppress touch-generated mouse commands while keeping touch camera orbit.
  let touchDrag = null;
  canvas.onpointerdown = (e) => {
    if (e.pointerType === "mouse" || run.paused || touchDrag !== null) return;
    e.preventDefault();
    view.mouseLook = false;
    touchDrag = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (e.pointerId === touchDrag && !run.paused)
      orbit(e.movementX, e.movementY);
  };
  canvas.onlostpointercapture = () => (touchDrag = null);
  const swordKey = $("#attack");
  swordKey.onpointerdown = (e) => {
    e.preventDefault();
    swordKey.setPointerCapture(e.pointerId);
    drawSword();
  };
  swordKey.onpointerup = (e) => {
    e.preventDefault();
    attack();
  };
  swordKey.onlostpointercapture = () => {
    run.windAt = null;
  };
  swordKey.onclick = (e) => {
    if (e.detail === 0) {
      drawSword();
      attack();
    }
  };
  window.onkeydown = (e) => {
    if (!run.paused && (e.code === "AltLeft" || e.code === "AltRight")) {
      e.preventDefault();
      edgeTurn = 0;
      previousPointer = null;
      heldAlts.add(e.code);
      syncCursor();
      releaseMouse();
      return;
    }
    if (run.paused && e.target instanceof HTMLSelectElement && e.code !== "Escape") return;
    if (
      ![
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "KeyV",
        "KeyW",
        "KeyS",
        "Escape",
        "KeyA",
        "KeyD",
        "KeyE",
        "KeyF",
        "ShiftLeft",
        "ShiftRight",
      ].includes(e.code)
    )
      return;
    e.preventDefault();
    if (e.code === "Escape" && !e.repeat) {
      run.paused ? resumeGame() : modal(true);
      return;
    }
    if (run.paused) return;
    if (e.code === "KeyE" && !e.repeat) interact();
    else if (e.code === "KeyV" && !e.repeat) toggleBlade();
    else if (e.code === "KeyF" && !e.repeat) parry();
    else if (e.code.startsWith("Shift") && !e.repeat) dodge();
    else keys.add(e.code);
  };
  window.onkeyup = (e) => {
    keys.delete(e.code);
    if (heldAlts.delete(e.code)) {
      e.preventDefault();
      syncCursor();
      if (!heldAlts.size) startMouseLook();
    }
  };
  window.onblur = () => {
    if (!run.paused) modal(true);
  };
  document.querySelectorAll("[data-key]").forEach((b) => {
    b.onpointerdown = (e) => {
      b.setPointerCapture(e.pointerId);
      keys.add(b.dataset.key);
    };
    b.onlostpointercapture = () => keys.delete(b.dataset.key);
  });
}
function frame(now) {
  const dt = Math.min(0.05, (now - run.last) / 1000);
  run.last = now;
  if (!run.paused) {
    if (!heldAlts.size && !document.pointerLockElement) view.cameraYaw -= edgeTurn * 2.6 * dt;
    const steps = Math.max(1, Math.ceil(dt * 90));
    for (let i = 0; i < steps && !run.paused; i++) {
      const frozen = Math.min(run.impactPause, dt / steps);
      run.impactPause -= frozen;
      const tick = dt / steps - frozen;
      if (tick > 0) {
        run.phase += tick;
        update(tick);
      }
    }
  }
  if (!run.paused) {
    renderWorld();
    drawMap();
  }
  requestAnimationFrame(frame);
}

export { view, resetMouse, canvas, ctx, bindControls, frame };
