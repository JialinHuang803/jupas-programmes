import { cp, mkdir } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await mkdir(output, { recursive: true });
for (const path of ["index.html", "assets", "data"]) {
  await cp(new URL(`../${path}`, import.meta.url), new URL(path, output), { recursive: true });
}
console.log("Static site copied to dist (HTML, assets and offline dataset only).");
