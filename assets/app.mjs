import { schools, filterProgrammes } from "./catalog.mjs";

const pageSize = 24;
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(["query", "funding", "schools", "filters", "clear", "results", "result-count", "data-stamp", "empty", "empty-clear", "error", "error-message", "retry", "load-more", "load-more-panel", "shown-count", "sources"].map((id) => [id, $(id)]));
let data;
let selectedSchool = "all";
let visibleCount = pageSize;
let searchTimer;
const fundingLabels = { "UGC-funded": "教資會資助", "Self-financing": "自資", "SSSDP": "SSSDP 資助" };
const fundingLabel = (value) => fundingLabels[value] || value;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function externalLink(label, url, className) {
  const link = element("a", className, label);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function validateData(snapshot) {
  if (snapshot.schemaVersion !== 1 || snapshot.summaryBasis !== "official-programme-title"
    || !/^\d{4}\/\d{2}$/.test(snapshot.admissionYear) || !Number.isFinite(Date.parse(snapshot.collectedAt))
    || !Array.isArray(snapshot.programmes) || snapshot.total !== snapshot.programmes.length || !snapshot.total
    || !Array.isArray(snapshot.sources) || snapshot.sources.length !== schools.length) {
    throw new Error("資料快照格式不完整，請通知網站維護者。");
  }
  const codes = new Set();
  for (const programme of snapshot.programmes) {
    if (!/^JS\d{4}$/.test(programme.code) || codes.has(programme.code) || !schools.some((school) => school.id === programme.school)
      || !["nameZh", "nameEn", "summary", "funding", "shortName", "url"].every((key) => typeof programme[key] === "string")
      || !programme.nameZh || !programme.nameEn || !programme.summary || !programme.funding
      || programme.url !== `https://www.jupas.edu.hk/tc/programme/${programme.school}/${programme.code}`) {
      throw new Error("課程記錄或官方連結驗證失敗，請通知網站維護者。");
    }
    codes.add(programme.code);
  }
  for (const school of schools) {
    const source = snapshot.sources.find((item) => item.school === school.id);
    if (!source || source.url !== `https://www.jupas.edu.hk/tc/programme/${school.id}/`
      || source.count !== snapshot.programmes.filter((item) => item.school === school.id).length || !source.count) {
      throw new Error("院校資料來源或數量驗證失敗，請通知網站維護者。");
    }
  }
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  ui.query.value = params.get("q") || "";
  const school = params.get("school");
  selectedSchool = schools.some((item) => item.id === school) ? school : "all";
  const funding = params.get("funding");
  ui.funding.value = [...ui.funding.options].some((option) => option.value === funding) ? funding : "all";
}

function updateUrl() {
  const url = new URL(location.href);
  const values = { q: ui.query.value.trim(), school: selectedSchool === "all" ? "" : selectedSchool, funding: ui.funding.value === "all" ? "" : ui.funding.value };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href) history.replaceState(null, "", url);
}

function card(programme) {
  const school = schools.find((item) => item.id === programme.school);
  const article = element("article", "programme-card");
  const headingId = `title-${programme.code}`;
  article.setAttribute("aria-labelledby", headingId);
  const meta = element("div", "card-meta");
  meta.append(element("span", "school-tag", school.name), element("span", "code", programme.code));
  const conciseTitle = (title) => title.replace(/\s*[\[（(](?:特點|專修|主修|選項|Features|Streams|Majors|Options)\s*[:：][\s\S]*$/i, "").trim();
  const heading = element("h3", "", conciseTitle(programme.nameZh));
  heading.id = headingId;
  const english = element("p", "name-en", conciseTitle(programme.nameEn));
  english.lang = "en";
  const summary = element("div", "card-summary");
  summary.append(element("span", "", "中文速覽 · 按官方名稱整理"), element("p", "", programme.summary));
  const bottom = element("div", "card-bottom");
  const link = externalLink("官方詳情", programme.url);
  link.setAttribute("aria-label", `${programme.code} ${programme.nameZh}：官方詳情（在新分頁開啟）`);
  link.append(element("span", "", "↗"));
  bottom.append(element("span", "funding-tag", fundingLabel(programme.funding)), link);
  article.append(meta, heading, english);
  if (heading.textContent !== programme.nameZh || english.textContent !== programme.nameEn) {
    const fullNames = element("details", "official-names");
    const label = element("summary", "", "查看完整官方名稱");
    const fullEnglish = element("p", "", programme.nameEn);
    fullEnglish.lang = "en";
    fullNames.append(label, element("p", "", programme.nameZh), fullEnglish);
    article.append(fullNames);
  }
  article.append(summary, bottom);
  return article;
}

function render({ append = false, syncUrl = true } = {}) {
  if (!data) return;
  const matches = filterProgrammes(data.programmes, { query: ui.query.value, school: selectedSchool, funding: ui.funding.value });
  const previousCount = ui.results.children.length;
  for (const button of ui.schools.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.school === selectedSchool));
  ui["result-count"].replaceChildren(document.createTextNode("找到 "), element("strong", "", String(matches.length)), document.createTextNode(" 個課程"));
  ui.clear.disabled = !ui.query.value && selectedSchool === "all" && ui.funding.value === "all";
  ui.empty.hidden = matches.length > 0;
  if (!append) ui.results.replaceChildren();
  const fragment = document.createDocumentFragment();
  matches.slice(append ? previousCount : 0, visibleCount).forEach((programme) => fragment.append(card(programme)));
  ui.results.append(fragment);
  ui.results.setAttribute("aria-busy", "false");
  ui["load-more-panel"].hidden = matches.length <= visibleCount;
  ui["shown-count"].textContent = `已翻閱 ${Math.min(visibleCount, matches.length)} / ${matches.length} 個課程`;
  if (syncUrl) updateUrl();
  if (append) ui.results.children[previousCount]?.querySelector("a").focus({ preventScroll: true });
}

function changed() {
  clearTimeout(searchTimer);
  visibleCount = pageSize;
  render();
}

function clearFilters() {
  ui.query.value = "";
  selectedSchool = "all";
  ui.funding.value = "all";
  changed();
  ui.query.focus();
}

function buildFilters() {
  ui.schools.replaceChildren();
  for (const school of [{ id: "all", short: "全部院校", name: "全部院校" }, ...schools]) {
    const count = school.id === "all" ? data.total : data.sources.find((source) => source.school === school.id).count;
    const button = element("button", "", school.short);
    button.type = "button";
    button.dataset.school = school.id;
    button.setAttribute("aria-label", `${school.name}，${count} 個課程`);
    button.setAttribute("aria-pressed", "false");
    button.append(element("span", "", String(count)));
    button.addEventListener("click", () => { selectedSchool = school.id; changed(); });
    ui.schools.append(button);
  }
  ui.funding.replaceChildren(element("option", "", "所有類別"));
  ui.funding.firstElementChild.value = "all";
  for (const funding of [...new Set(data.programmes.map((programme) => programme.funding))].sort()) {
    const option = element("option", "", fundingLabel(funding));
    option.value = funding;
    ui.funding.append(option);
  }
}

function showSources() {
  const date = new Intl.DateTimeFormat("zh-Hant", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Hong_Kong" }).format(new Date(data.collectedAt));
  ui["data-stamp"].replaceChildren(document.createTextNode(`${data.admissionYear} 入學 · ${data.total} 個課程`), element("br"), document.createTextNode(`官方列表採集於 ${date}`));
  const list = element("ul");
  for (const source of data.sources) {
    const school = schools.find((item) => item.id === source.school);
    const row = element("li");
    row.append(externalLink(`${school.name} ↗`, source.url), element("span", "", `${source.count} 個編號`));
    list.append(row);
  }
  ui.sources.replaceChildren(
    element("p", "", `採集時間：${data.collectedAt}（UTC）。以各校完整官方列表的獨立 JS 編號核對，共 ${data.total} 個。這是資料快照，官方後續可能修改。`),
    externalLink(`${data.admissionYear} 入學年度：官方申請日期 ↗`, data.cycleSource),
    list,
  );
}

async function load() {
  ui.error.hidden = true;
  ui.retry.disabled = true;
  ui["result-count"].textContent = "正在載入課程…";
  ui.results.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(new URL("../data/programmes.json", import.meta.url), { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`課程資料讀取失敗（HTTP ${response.status}），請稍後重試。`);
    const snapshot = await response.json();
    validateData(snapshot);
    data = snapshot;
    buildFilters();
    showSources();
    readUrl();
    ui.query.disabled = false;
    ui.funding.disabled = false;
    render();
  } catch (error) {
    console.error("Programme catalogue could not load:", error);
    data = undefined;
    ui.results.replaceChildren();
    ui.results.setAttribute("aria-busy", "false");
    ui.error.hidden = false;
    ui.empty.hidden = true;
    ui["load-more-panel"].hidden = true;
    ui["error-message"].textContent = error instanceof Error && /資料|課程|院校/.test(error.message) ? error.message : "未能完成資料載入。請檢查網絡連線後重試；若問題持續，請從頁尾的開源程式連結回報。";
    ui["result-count"].textContent = "資料尚未載入";
    ui["data-stamp"].textContent = "資料快照暫不可用";
  } finally {
    ui.retry.disabled = false;
  }
}

ui.filters.addEventListener("submit", (event) => { event.preventDefault(); changed(); });
ui.query.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(changed, 120); });
ui.funding.addEventListener("change", changed);
ui.clear.addEventListener("click", clearFilters);
ui["empty-clear"].addEventListener("click", clearFilters);
ui.retry.addEventListener("click", load);
ui["load-more"].addEventListener("click", () => { clearTimeout(searchTimer); visibleCount += pageSize; render({ append: true }); });
window.addEventListener("popstate", () => { if (data) { readUrl(); visibleCount = pageSize; render({ syncUrl: false }); } });
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey
    && !event.target.closest("input, select, textarea, [contenteditable]") && !ui.query.disabled) {
    event.preventDefault();
    ui.query.focus();
  }
});
load();
