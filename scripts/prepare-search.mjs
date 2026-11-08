import { cp, mkdir } from "node:fs/promises";

const bundle = new URL(import.meta.resolve("opencc-js/t2cn"));
const packageRoot = new URL("../../", bundle);
const output = new URL("../assets/vendor/", import.meta.url);
await mkdir(output, { recursive: true });
await cp(bundle, new URL("opencc-t2cn.mjs", output));
for (const path of ["LICENSE", "THIRD_PARTY_LICENSES.md", "LICENSES"]) {
  await cp(new URL(path, packageRoot), new URL(path, output), { recursive: true });
}
console.log("Prepared local OpenCC traditional-to-simplified bundle and licence notices.");
