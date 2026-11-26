import "./ui/game.css";
import "./ui/mini-app.css";
import { bindControls, frame, pauseGame } from "./engine/game.js";
import { modal, spawnGuards, ui } from "./engine/journey.js";
import { makeEnemyLabels } from "./engine/bestiary.js";
import { buildScenery } from "./engine/world3d.js";
import { resetScenery } from "./engine/valley.js";
import { connectTelegram } from "./platform/telegram";

resetScenery();
buildScenery();
spawnGuards();
makeEnemyLabels();
bindControls();
ui();
modal(true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});
requestAnimationFrame(frame);
void connectTelegram(pauseGame);
