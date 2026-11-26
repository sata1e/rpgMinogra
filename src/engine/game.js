import { physicsStep } from './rigid-body.js';
import {
  resume,
  returnToMenu,
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
let desktopLook = false;
let releasingLock = false;
const heldAlts = new Set();
function syncCursor() {
  document.documentElement.classList.toggle("hide-game-cursor", document.pointerLockElement === canvas && !run.paused && heldAlts.size === 0);
}
function releaseMouse() {
  if (document.pointerLockElement === canvas && !releasingLock) {
    releasingLock = true;
    document.exitPointerLock();
  }
}
function startMouseLook() {
  if (run.paused || heldAlts.size || releasingLock) return;
  if (!desktopLook || requestingLock || document.pointerLockElement === canvas) return;
  if (!canvas.requestPointerLock) { lockFailed(); return; }
  requestingLock = true;
  try {
    canvas.requestPointerLock()?.catch(lockFailed);
  } catch {
    lockFailed();
  }
}
function lockFailed() {
  requestingLock = false;
  if (run.paused || heldAlts.size || document.pointerLockElement === canvas) return;
  modal(true);
  $("#mouse-access").hidden = false;
}
function resetMouse() {
  $("#mouse-access").hidden = true;
  heldAlts.clear();
  releaseMouse();
}
function resumeGame(event) {
  desktopLook = event?.pointerType
    ? event.pointerType === "mouse"
    : window.matchMedia("(any-pointer:fine)").matches;
  resume();
  startMouseLook();
}
export function pauseGame() {
  if (!run.paused) modal(true);
}
function bindControls() {
  document.addEventListener("game:pause", syncCursor);
  const defeat = $("#defeat");
  const actions = defeat.querySelector(".defeat-actions");
  document.addEventListener("game:defeat", () => {
    if (defeat.open) return;
    actions.inert = true;
    defeat.showModal();
    setTimeout(() => { if (defeat.open) actions.inert = false; }, 1000);
  });
  defeat.addEventListener("cancel", e => e.preventDefault());
  $("#defeatMenu").onclick = () => { defeat.close(); returnToMenu(); };
  $("#defeatRestart").onclick = e => { defeat.close(); resumeGame(e); };
  const selector = $("#difficulty");
  selector.onchange = () => chooseDifficulty(selector.value);
  chooseDifficulty(selector.value);
  $("#sheathe").onclick = toggleBlade;
  $("#pause").onclick = (e) => (run.paused ? resumeGame(e) : modal(true));
  $("#resume").onclick = resumeGame;
  $("#pick").onclick = interact;
  $("#parry").onclick = parry;
  $("#dodge").onclick = roll;
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
    if (run.paused || heldAlts.size || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    view.mouseLook = true;
    desktopLook = true;
    if (document.pointerLockElement !== canvas) { startMouseLook(); return; }
    if (e.button === 2) parry();
    else drawSword();
  };
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0 && !run.paused && !heldAlts.size && document.pointerLockElement === canvas) attack();
  });
  function orbit(dx, dy) {
    view.cameraYaw -= dx * 0.0045;
    view.cameraPitch = Math.max(
      0.14,
      Math.min(0.7, view.cameraPitch + dy * 0.003),
    );
  }
  window.addEventListener("mousemove", (e) => {
    if (run.paused || heldAlts.size || document.pointerLockElement !== canvas) return;
    view.mouseLook = true;
    orbit(e.movementX, e.movementY);
  }, true);
  document.addEventListener("pointerlockerror", lockFailed);
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    requestingLock = false;
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
    if (defeat.open) return;
    if (!run.paused && (e.code === "AltLeft" || e.code === "AltRight")) {
      e.preventDefault();
      run.windAt = null;
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
    else if (e.code.startsWith("Shift") && !e.repeat) roll();
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
let accumulatedTime=0;
function frame(now) {
  const elapsed=run.last ? Math.max(0,(now-run.last)/1000) : 0;
  run.last=now;
  if (run.paused) accumulatedTime=0;
  else {
    accumulatedTime+=Math.min(elapsed,.10);
    while (accumulatedTime+1e-10>=physicsStep && !run.paused) {
      accumulatedTime-=physicsStep;
      const frozen=Math.min(run.impactPause,physicsStep);
      run.impactPause-=frozen;
      const tick=physicsStep-frozen;
      if (tick>0) {
        run.phase+=tick;
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
