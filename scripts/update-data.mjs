import { mkdir, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schools } from "../assets/catalog.mjs";
import { checkRobots, get, origin, pause } from "./jupas-client.mjs";
import { cacheArgument, collectRequirements } from "./update-requirements.mjs";

const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function text(html) {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity.startsWith("#")) {
        const hex = entity[1].toLowerCase() === "x";
        const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) throw new Error(`Invalid entity: ${match}`);
        return String.fromCodePoint(value);
      }
      if (!(entity.toLowerCase() in entities)) throw new Error(`Unrecognised HTML entity: ${match}`);
      return entities[entity.toLowerCase()];
    }).replace(/\s+/g, " ").trim();
}

export function summarise(nameZh, nameEn) {
  const title = nameZh.replace(/[（(](榮譽|Hons)[）)]/gi, "").replace(/榮譽/g, "");
  const groups = [...title.matchAll(/[（(]([^()（）]+)[）)]/g)].map((match) => match[1].trim());
  const directions = [...new Set(groups.filter((group) => !/^(特點|雙學位|校本課程|[四五六\d]+年)/.test(group)))];
  const base = title.replace(/[（(][^()（）]*[）)]/g, "").replace(/\[[\s\S]*?\]/g, "").replace(/\s+/g, "");
  const level = /高級文憑/.test(base) ? "高級文憑" : /碩士/.test(base) ? "學士與碩士聯合" : /學士/.test(base) ? "學士" : "";
  const feature = title.match(/特點\s*[:：]\s*([^）)\]]+)/)?.[1];
  const highlights = feature?.split(/[/／]/).map((item) => item.trim()).filter(Boolean).slice(0, 2);
  const prefix = directions.length ? `方向：${directions.join("；")}。` : `課程：${base || title}。`;
  const kind = /雙學位|Double Degree|Dual Degree/i.test(`${title} ${nameEn}`) ? "名稱列明為雙學位。"
    : /學士[及與][^/／]*學士/.test(base) ? "結合名稱列明的兩項學士學位。"
    : /主修\s*[:：]|專修\s*[:：]|選項\s*[:：]/.test(title) || /[/／]|或/.test(`${base} ${directions.join(" ")}`) ? "此編號列有不同課程或專修選項。"
    : /組合|學系|Scheme|School-based|Broad-based/i.test(`${base} ${nameEn}`) ? "以組合、學院或學系形式招生。"
    : level ? `屬${level}課程。` : "以此名稱列於官方招生目錄。";
  return `${prefix}${kind}${highlights?.length ? `名稱列明特色：${highlights.join("、")}。` : ""}`;
}

export function parseList(html, school) {
  const programmes = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    const cell = (className) => row.match(new RegExp(`<td\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"))?.[1];
    const codeCell = cell("c-no");
    if (!codeCell) continue;
    const code = text(codeCell);
    if (!/^JS\d{4}$/.test(code)) throw new Error(`${school}: invalid code ${code}`);
    const title = cell("c-ft");
    if (!title) throw new Error(`${school}/${code}: missing title`);
    const chinese = title.match(/<span\b[^>]*class=["'][^"']*\btname-cn\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    if (!chinese) throw new Error(`${school}/${code}: missing Chinese title; review translation before publishing`);
    const nameZh = text(chinese);
    const nameEn = text(title.replace(/<span\b[\s\S]*?<\/span>/gi, "").replace(/<sup\b[\s\S]*?<\/sup>/gi, "")).replace(/(?:NEW|Updated)\s*$/g, "").trim();
    const href = codeCell.match(/href=["']([^"']+)["']/i)?.[1];
    const url = new URL(href, origin);
    if (url.origin !== origin || url.pathname.replace(/\/$/, "") !== `/tc/programme/${school}/${code}`) throw new Error(`${school}/${code}: unexpected official link`);
    const funding = text(cell("c-fc") ?? "");
    if (!nameZh || !nameEn || !funding) throw new Error(`${school}/${code}: incomplete record`);
    programmes.push({
      code, school, nameZh, nameEn, shortName: text(cell("c-sn") ?? ""),
      funding, summary: summarise(nameZh, nameEn), url: url.href,
    });
  }
  if (!programmes.length) throw new Error(`${school}: no programmes; official markup may have changed`);
  const linkedCodes = new Set([...html.matchAll(new RegExp(`/tc/programme/${school}/(JS\\d{4})`, "g"))].map((match) => match[1]));
  const parsedCodes = new Set(programmes.map((item) => item.code));
  if (parsedCodes.size !== programmes.length || linkedCodes.size !== parsedCodes.size || [...linkedCodes].some((code) => !parsedCodes.has(code))) {
    throw new Error(`${school}: duplicated or unparsed catalogue numbers`);
  }
  return programmes;
}

async function main() {
  await checkRobots();
  const cycleUrl = `${origin}/tc/application-procedures/application-other-submission-deadline/application-key-dates-and-deadlines/`;
  const cycleHtml = await get(cycleUrl);
  const cycleText = cycleHtml.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  const dates = [...cycleText.matchAll(/(20\d{2})年(?:7月至8月|7月[至／/]8月)/g)].map((match) => Number(match[1]));
  const year = Math.max(...dates);
  if (!Number.isFinite(year)) throw new Error("Could not verify the admissions cycle from official dates");
  const collectedAt = new Date().toISOString();
  const programmes = [];
  const sources = [];
  for (const school of schools) {
    await pause();
    const url = `${origin}/tc/programme/${school.id}/`;
    const records = parseList(await get(url), school.id);
    programmes.push(...records);
    sources.push({ school: school.id, url, count: records.length });
    console.log(`${school.acronym}: ${records.length}`);
  }
  if (new Set(programmes.map((item) => item.code)).size !== programmes.length) throw new Error("Duplicate JS code across institutions");
  programmes.sort((a, b) => a.code.localeCompare(b.code));
  const admissionYear = `${year}/${String(year + 1).slice(-2)}`;
  const enriched = await collectRequirements(programmes, admissionYear, cacheArgument());
  const data = {
    schemaVersion: 2, admissionYear, requirementsCollectedAt: new Date().toISOString(),
    cycleSource: cycleUrl, collectedAt, total: enriched.length,
    summaryBasis: "official-programme-title", sources, programmes: enriched,
  };
  const directory = new URL("../data/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const target = new URL("programmes.json", directory);
  const temporary = new URL("programmes.json.tmp", directory);
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  console.log(`Saved ${data.total} programmes for ${data.admissionYear} at ${fileURLToPath(target)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
