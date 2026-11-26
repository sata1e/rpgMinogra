import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

// Package the same production bundle for players who open the game from disk.
const output = resolve("dist");
let html = await readFile(resolve(output, "index.html"), "utf8");
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const sheet = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const js = await readFile(resolve(output, script[1]), "utf8");
const cssPath = resolve(output, sheet[1]);
let css = await readFile(cssPath, "utf8");
for (const [url, file] of css.matchAll(/url\(["']?([^"')]+\.png)["']?\)/g)) {
  const image = await readFile(resolve(dirname(cssPath), file));
  css = css.replace(url, () => 'url(data:image/png;base64,' + image.toString("base64") + ')');
}
html = html.replace(sheet[0], () => '<style>' + css + '</style>')
  .replace(script[0], () => '<script type="module">' + js.replace(/<\/script/gi, "<\\/script") + '</script>');
await writeFile(resolve(output, "play.html"), html);
