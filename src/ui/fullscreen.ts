export function bindFullscreen() {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>("#fullscreen")!;
  let withinWindow = false;

  function telegram() {
    const app = window.Telegram?.WebApp;
    return app && app.platform !== "unknown" && app.isVersionAtLeast("8.0") ? app : undefined;
  }

  function sync() {
    const active = Boolean(document.fullscreenElement || telegram()?.isFullscreen || withinWindow);
    root.classList.toggle("playing-fullscreen", active);
    const label = active ? "Выйти из полного экрана" : "Во весь экран";
    button.title = label + " (Alt + Enter)";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "↙" : "⛶";
  }

  async function toggle() {
    const app = telegram();
    if (withinWindow) withinWindow = false;
    else if (document.fullscreenElement) await document.exitFullscreen();
    else if (app?.isFullscreen) app.exitFullscreen();
    else if (app) app.requestFullscreen();
    else {
      try {
        await root.requestFullscreen();
      } catch {
        // Embedded previews may only allow filling their own viewport.
        withinWindow = true;
      }
    }
    sync();
  }

  button.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("game:fullscreen", sync);
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      void toggle();
    }
  });
  sync();
}
