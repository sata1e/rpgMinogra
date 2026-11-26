import { setText } from "./journey.js";

// Hand-cut capitals are drawn on a one-pixel grid and enlarged at integer scale.
const capitals = {
  Ь: [16, 16, 16, 30, 17, 17, 30],
  В: [30, 17, 17, 30, 17, 17, 30],
  Я: [15, 17, 17, 15, 5, 9, 17],
  Ж: [21, 21, 14, 4, 14, 21, 21],
  К: [17, 18, 20, 24, 20, 18, 17],
  Ш: [21, 21, 21, 21, 21, 21, 31],
  Д: [14, 10, 10, 10, 10, 31, 17],
  С: [15, 16, 16, 16, 16, 16, 15],
  И: [17, 19, 21, 21, 25, 17, 17],
  Т: [31, 4, 4, 4, 4, 4, 4],
  Р: [30, 17, 17, 30, 16, 16, 16],
  О: [14, 17, 17, 17, 17, 17, 14],
  П: [31, 17, 17, 17, 17, 17, 17],
  А: [14, 17, 17, 31, 17, 17, 17],
  Е: [31, 16, 16, 30, 16, 16, 31],
  Л: [7, 9, 9, 9, 17, 17, 17],
  Х: [17, 17, 10, 4, 10, 17, 17],
  М: [17, 27, 21, 21, 17, 17, 17],
  Й: [10, 4, 17, 19, 21, 25, 17],
  У: [17, 17, 17, 15, 1, 2, 12],
  Н: [17, 17, 17, 31, 17, 17, 17],
  Ы: [17, 17, 17, 29, 21, 21, 29],
};
let currentChapter = "";
function chapterTitle(title) {
  if (title === currentChapter) return;
  currentChapter = title;
  setText("h1", title);
  const sheet = document.querySelector("#chapter"),
    letters = title.toUpperCase();
  sheet.width = letters.length * 6 - 1;
  sheet.height = 7;
  const ink = sheet.getContext("2d");
  ink.fillStyle = "#e7dcca";
  [...letters].forEach((letter, i) =>
    (capitals[letter] || []).forEach((row, y) => {
      for (let x = 0; x < 5; x++)
        if (row & (16 >> x)) ink.fillRect(i * 6 + x, y, 1, 1);
    }),
  );
}

export { chapterTitle };
