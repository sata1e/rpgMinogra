import { arsenal, equip, weapon } from "../engine/weapons.js";

export function bindArmory() {
  const select = document.querySelector<HTMLSelectElement>("#weapon")!;
  const hint = document.querySelector<HTMLElement>("#weaponHint")!;
  const preview = document.querySelector<HTMLCanvasElement>("#weaponPreview")!;
  for (const blade of arsenal) select.add(new Option(blade.name));
  function choose() {
    equip(select.selectedIndex);
    hint.textContent = weapon.hint;
    const g = preview.getContext("2d")!;
    g.clearRect(0, 0, preview.width, preview.height);
    const unit = 2.6, guard = 70, y = 22;
    const tip = guard + weapon.length * unit;
    g.fillStyle = "#a47850";
    g.fillRect(guard - weapon.grip * unit, y - 2, weapon.grip * unit, 5);
    g.fillStyle = "#322f28";
    for (let x = guard - 5; x > guard - weapon.grip * unit; x -= 6) g.fillRect(x, y - 2, 2, 5);
    g.fillStyle = "#d7ad71";
    g.fillRect(guard - 3, y - 7, 4, 14);
    g.fillStyle = "#e4e5d7";
    g.beginPath();
    g.moveTo(guard, y - weapon.width);
    g.quadraticCurveTo(tip - 15, y - weapon.width, tip, y - weapon.curve * unit);
    g.quadraticCurveTo(tip - 8, y + 3, guard, y + 2);
    g.fill();
  }
  select.addEventListener("change", choose);
  choose();
}
