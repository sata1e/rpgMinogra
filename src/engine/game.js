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
view.inspectOffset = 0;
let inspecting = false;
function displayedYaw() {
  return view.cameraYaw + view.inspectOffset;
}
let mouseCharge = false;
view.mouseLook = false;
let hadLock = false;
function startMouseLook() {
  if (!window.matchMedia("(pointer:fine)").matches) return;
  view.mouseLook = true;
  // Embedded previews can deny pointer lock. Hover-look still works there.
  try {
    canvas.requestPointerLock?.()?.catch(() => {});
  } catch {}
}
function resetMouse() {
  inspecting = false;
  view.inspectOffset = 0;
  mouseCharge = false;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function resumeGame() {
  resume();
  startMouseLook();
}
export function pauseGame() {
  if (!run.paused) modal(true);
}
function bindControls() {
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
    if (!run.paused && e.button === 2) {
      e.preventDefault();
      view.mouseLook = true;
      inspecting = true;
      return;
    }
    if (run.paused || e.button !== 0 || run.windAt !== null) return;
    e.preventDefault();
    drawSword();
    mouseCharge = run.windAt !== null;
  };
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) inspecting = false;
    if (e.button === 0 && mouseCharge) {
      mouseCharge = false;
      if (!run.paused) attack();
    }
  });
  function orbit(dx, dy) {
    if (inspecting) {
      const offset = view.inspectOffset - dx * 0.0045;
      view.inspectOffset = Math.atan2(Math.sin(offset), Math.cos(offset));
    } else {
      view.cameraYaw -= dx * 0.0045;
    }
    view.cameraPitch = Math.max(
      0.14,
      Math.min(0.7, view.cameraPitch + dy * 0.003),
    );
  }
  window.addEventListener("mousemove", (e) => {
    if (run.paused || (!view.mouseLook && e.target !== canvas)) return;
    if (document.pointerLockElement !== canvas && e.target !== canvas) return;
    view.mouseLook = true;
    orbit(e.movementX, e.movementY);
  });
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    if (hadLock && !locked && !run.paused) modal(true);
    hadLock = locked;
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
    if (run.paused && e.target === selector && e.code !== "Escape") return;
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
  window.onkeyup = (e) => keys.delete(e.code);
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
    if (!inspecting && view.inspectOffset !== 0) {
      view.inspectOffset *= Math.exp(-12 * dt);
      if (Math.abs(view.inspectOffset) < 0.001) view.inspectOffset = 0;
    }
    renderWorld();
    drawMap();
  }
  requestAnimationFrame(frame);
}

export { displayedYaw, view, resetMouse, canvas, ctx, bindControls, frame };
