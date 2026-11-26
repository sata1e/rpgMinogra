const blades = {
  katana: { name: "Катана", hint: "Средняя дистанция. Три быстрых рубящих удара.", length: 55, grip: 14, width: 2.4, curve: 2.3, tempo: 1, arc: 1, lift: 0, lacquer: 0 },
  wakizashi: { name: "Вакидзаси", hint: "Короткий меч. Компактный замах и быстрое восстановление.", length: 37, grip: 10, width: 2.3, curve: 1.6, tempo: .81, arc: .79, lift: -4, lacquer: 18 },
  tanto: { name: "Танто", hint: "Кинжал для ближней дистанции. Короткие выпады одной рукой.", length: 24, grip: 8, width: 2.7, curve: .5, tempo: .67, arc: .59, lift: -7, lacquer: 15, thrust: true },
  tachi: { name: "Тати", hint: "Изогнутый длинный клинок. Высокий замах и протяжная дуга.", length: 63, grip: 16, width: 2.5, curve: 5, tempo: 1.1, arc: 1.13, lift: 4, lacquer: 4 },
  odachi: { name: "Одати", hint: "Двуручный меч. Самая дальняя дуга и долгий выход из удара.", length: 78, grip: 22, width: 3.5, curve: 4.2, tempo: 1.34, arc: 1.2, lift: 7, lacquer: 1 },
  chokuto: { name: "Тёкуто", hint: "Прямой меч. Узкие диагональные сечения с коротким отводом руки.", length: 50, grip: 12, width: 2.5, curve: 0, tempo: .93, arc: .8, lift: 2, lacquer: 21 },
  tsurugi: { name: "Цуруги", hint: "Прямой обоюдоострый меч. Выпад чередуется с восходящим и поперечным ударами.", length: 56, grip: 13, width: 3.1, curve: 0, tempo: 1.04, arc: .94, lift: 1, lacquer: 12, thrust: true, doubleEdge: true },
};
export const arsenal = Object.values(blades);
export let weapon = blades.katana;
export function equip(index) {
  weapon = arsenal[index] ?? blades.katana;
}
