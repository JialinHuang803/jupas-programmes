import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseRequirements } from "./requirements-parser.mjs";
import { checkRobots, get, origin, pause } from "./jupas-client.mjs";
import { schools } from "../assets/catalog.mjs";

export async function collectRequirements(programmes, admissionYear, cacheDirectory) {
  if (!Array.isArray(programmes) || !programmes.length || new Set(programmes.map((programme) => programme.code)).size !== programmes.length
    || programmes.some((programme) => !/^JS\d{4}$/.test(programme.code) || !schools.some((school) => school.id === programme.school)
      || programme.url !== `${origin}/tc/programme/${programme.school}/${programme.code}`)) throw new Error("Invalid programme list or official detail URL");
  if (cacheDirectory) await mkdir(cacheDirectory, { recursive: true });
  const collected = [];
  for (const programme of programmes) {
    const cachePath = cacheDirectory ? resolve(cacheDirectory, `${programme.code}.json`) : null;
    let cached;
    if (cachePath) {
      try {
        cached = JSON.parse(await readFile(cachePath, "utf8"));
        if (cached.url !== programme.url || cached.admissionYear !== admissionYear || !Number.isFinite(Date.parse(cached.collectedAt))
          || Date.now() - Date.parse(cached.collectedAt) > 24 * 60 * 60 * 1000 || Date.parse(cached.collectedAt) > Date.now() || typeof cached.html !== "string") {
          console.log(`${programme.code}: stale or incompatible cache; refreshing official page`);
          cached = undefined;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (!cached) {
      await pause();
      const html = await get(`${programme.url}/`);
      const start = html.indexOf("<!-- Requirements -->");
      const end = html.indexOf("<!-- Tuition Fee -->", start);
      if (start < 0 || end < 0) throw new Error(`${programme.code}: official requirement section boundaries not found`);
      cached = { url: programme.url, admissionYear, collectedAt: new Date().toISOString(), html: html.slice(start, end) };
      if (cachePath) {
        await writeFile(`${cachePath}.tmp`, JSON.stringify(cached), "utf8");
        await rename(`${cachePath}.tmp`, cachePath);
      }
    }
    let requirements;
    try { requirements = parseRequirements(cached.html, { code: programme.code, collectedAt: cached.collectedAt }); }
    catch (error) { throw new Error(`${programme.code}: ${error.message}`, { cause: error }); }
    collected.push({ ...programme, requirements });
    console.log(`${collected.length}/${programmes.length} ${programme.code}: ${requirements.basis}, ${requirements.status}`);
  }
  return collected;
}

export function cacheArgument() {
  const index = process.argv.indexOf("--cache-dir");
  if (index === -1) return undefined;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error("--cache-dir requires a directory");
  return resolve(process.argv[index + 1]);
}

async function main() {
  await checkRobots();
  const target = new URL("../data/programmes.json", import.meta.url);
  const data = JSON.parse(await readFile(target, "utf8"));
  if (data.total !== data.programmes.length || !data.total) throw new Error("Invalid catalogue snapshot");
  const programmes = await collectRequirements(data.programmes, data.admissionYear, cacheArgument());
  const updated = { ...data, schemaVersion: 2, requirementsCollectedAt: new Date().toISOString(), programmes };
  const temporary = new URL("programmes.json.tmp", target);
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  console.log(`Saved official entrance requirements for all ${programmes.length} programmes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
