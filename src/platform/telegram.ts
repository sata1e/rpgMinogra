interface TelegramApp {
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  disableVerticalSwipes(): void;
  onEvent(name: string, handler: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
  };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp };
  }
}

export async function connectTelegram(pause: () => void) {
  // Only Telegram launches need the remote bridge. The game also runs offline after loading.
  if (!window.Telegram?.WebApp) {
    const launch = new URLSearchParams(location.hash.slice(1));
    if (!launch.has("tgWebAppVersion") && !launch.has("tgWebAppPlatform"))
      return;
    const loaded = await new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      script.src = "https://telegram.org/js/telegram-web-app.js";
      document.head.append(script);
    });
    if (!loaded) return;
  }
  const app = window.Telegram?.WebApp;
  if (!app || app.platform === "unknown") return;
  app.ready();
  app.expand();
  if (app.isVersionAtLeast("7.7")) app.disableVerticalSwipes();
  if (app.isVersionAtLeast("8.0")) app.onEvent("deactivated", pause);
  if (app.isVersionAtLeast("6.1")) {
    app.BackButton.onClick(pause);
    const syncBackButton = () => {
      if (document.querySelector<HTMLElement>(".overlay")?.hidden)
        app.BackButton.show();
      else app.BackButton.hide();
    };
    document.addEventListener("game:pause", syncBackButton);
    syncBackButton();
  }
}
