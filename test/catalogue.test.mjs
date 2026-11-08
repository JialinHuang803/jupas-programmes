import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { schools, filterProgrammes, normalize } from "../assets/catalog.mjs";
import { parseList, summarise, text } from "../scripts/update-data.mjs";
import { Converter } from "../assets/vendor/opencc-t2cn.mjs";

const data = JSON.parse(await readFile(new URL("../data/programmes.json", import.meta.url), "utf8"));
const counts = { cityuhk: 60, hkbu: 23, lingnanu: 23, cuhk: 73, eduhk: 26, polyu: 47, hkust: 34, hku: 59 };
const toSimplified = Converter({ from: "hk", to: "cn" });
const fixture = `<table><tr><th class="c-no">Code</th></tr><tr>
<td class="c-is">HKU</td><td class="c-no"><a href="/tc/programme/hku/JS6004">JS6004</a></td>
<td class="c-fc">UGC-funded</td><td class="c-sn">BA(AS)</td>
<td class="c-ft">Bachelor of Arts in Architectural Studies<span class="new">NEW</span><br/><span class="tname-cn">建築學文學士</span></td>
</tr></table>`;

test("2027/28 snapshot includes all 345 distinct official JS numbers from exactly eight schools", () => {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.admissionYear, "2027/28");
  assert.equal(data.summaryBasis, "official-programme-title");
  assert.equal(data.total, 345);
  assert.equal(data.programmes.length, data.total);
  assert.equal(new Set(data.programmes.map((programme) => programme.code)).size, data.total);
  assert.equal(data.sources.length, schools.length);
  assert.ok(Number.isFinite(Date.parse(data.collectedAt)));
  assert.match(data.cycleSource, /^https:\/\/www\.jupas\.edu\.hk\/tc\//);
  assert.deepEqual(data.programmes.map((programme) => programme.code), data.programmes.map((programme) => programme.code).sort());
  for (const school of schools) {
    assert.equal(data.programmes.filter((programme) => programme.school === school.id).length, counts[school.id]);
    assert.equal(data.sources.find((source) => source.school === school.id).count, counts[school.id]);
    assert.equal(data.sources.find((source) => source.school === school.id).url, `https://www.jupas.edu.hk/tc/programme/${school.id}/`);
  }
});

test("every record has faithful Chinese summary, original titles and matching official detail URL", () => {
  for (const programme of data.programmes) {
    assert.match(programme.code, /^JS\d{4}$/);
    assert.ok(schools.some((school) => school.id === programme.school));
    assert.ok(programme.nameZh.length > 0 && /[\u3400-\u9fff]/.test(programme.nameZh));
    assert.ok(programme.nameEn.length > 0);
    assert.equal(programme.summary, summarise(programme.nameZh, programme.nameEn));
    assert.ok(programme.summary.length > 10 && programme.summary.length <= 120);
    assert.doesNotMatch(programme.nameEn, /<[^>]*>|&(?:[a-z]+|#\d+);|NEW$|Updated$/);
    assert.equal(programme.url, `https://www.jupas.edu.hk/tc/programme/${programme.school}/${programme.code}`);
    assert.equal(programme.funding, "UGC-funded");
  }
});

test("all 345 catalogue codes and original Chinese/English names are searchable", () => {
  for (const programme of data.programmes) {
    assert.deepEqual(filterProgrammes(data.programmes, { query: programme.code.toLowerCase() }).map((item) => item.code), [programme.code]);
    for (const query of [programme.nameZh, programme.nameEn, programme.summary]) {
      assert.ok(filterProgrammes(data.programmes, { query }).some((item) => item.code === programme.code), `${programme.code} missing from ${query}`);
    }
  }
});

test("all school filters, multi-word search, funding and empty queries behave consistently", () => {
  assert.equal(filterProgrammes(data.programmes).length, 345);
  assert.equal(filterProgrammes(data.programmes, { query: "   " }).length, 345);
  for (const school of schools) {
    assert.equal(filterProgrammes(data.programmes, { school: school.id }).length, counts[school.id]);
    assert.equal(filterProgrammes(data.programmes, { query: school.name }).length, counts[school.id]);
    assert.equal(filterProgrammes(data.programmes, { school: school.id, funding: "UGC-funded" }).length, counts[school.id]);
  }
  assert.deepEqual(filterProgrammes(data.programmes, { query: " js6004  architectural ", school: "hku" }).map((item) => item.code), ["JS6004"]);
  assert.deepEqual(filterProgrammes(data.programmes, { query: "JS6004", school: "hkust" }), []);
  assert.deepEqual(filterProgrammes(data.programmes, { query: "no-such-programme-8675309" }), []);
  assert.deepEqual(filterProgrammes(data.programmes, { funding: "unknown" }), []);
  assert.equal(normalize(" ＪＳ６００４ "), "js6004");
});

test("simplified, traditional and mixed-script Chinese queries return identical nonempty results", () => {
  const codes = (query, filters = {}) => filterProgrammes(data.programmes, { ...filters, query }).map((programme) => programme.code);
  for (const [simplified, traditional] of [
    ["计算机", "計算機"], ["护理", "護理"], ["建筑", "建築"], ["数据科学", "數據科學"],
    ["岭南大学", "嶺南大學"], ["香港理工大学", "香港理工大學"], ["两项学士", "兩項學士"],
  ]) {
    assert.ok(codes(traditional).length > 0, traditional);
    assert.deepEqual(codes(simplified), codes(traditional), simplified);
    assert.equal(normalize(simplified), normalize(traditional), simplified);
  }
  assert.deepEqual(codes("计算機"), codes("計算機"));
  assert.deepEqual(codes("计算机 engineering", { school: "hkust" }), codes("計算機 engineering", { school: "hkust" }));
  assert.ok(codes("计算机 engineering", { school: "hkust" }).length > 0);
  assert.deepEqual(codes("香港大学 JS6004"), ["JS6004"]);
  assert.deepEqual(codes("无此课程8675309"), []);
  assert.equal(data.programmes.find((programme) => programme.code === "JS6004").nameZh, "建築學文學士");
});

test("all 345 original names and summaries are equally searchable in simplified Chinese", () => {
  for (const programme of data.programmes) {
    for (const text of [programme.nameZh, programme.summary]) {
      const traditional = filterProgrammes(data.programmes, { query: text }).map((item) => item.code);
      const simplified = filterProgrammes(data.programmes, { query: toSimplified(text) }).map((item) => item.code);
      assert.deepEqual(simplified, traditional, `${programme.code}: ${text}`);
    }
  }
});

test("cached search conversion reflects changes to programme text", () => {
  const programme = { ...data.programmes[0] };
  assert.deepEqual(filterProgrammes([programme], { query: "独有测试方向" }), []);
  programme.nameZh = "獨有測試方向";
  assert.deepEqual(filterProgrammes([programme], { query: "独有测试方向" }), [programme]);
});

test("official parser keeps Chinese and English titles separate and verifies all linked codes", () => {
  const [programme] = parseList(fixture, "hku");
  assert.equal(programme.nameZh, "建築學文學士");
  assert.equal(programme.nameEn, "Bachelor of Arts in Architectural Studies");
  assert.equal(programme.code, "JS6004");
  assert.equal(text("A &amp; B &#x4e2d;&#25991;&nbsp;"), "A & B 中文");
  assert.throws(() => parseList(fixture.replace('class="tname-cn"', 'class="missing"'), "hku"), /missing Chinese title/);
  assert.throws(() => parseList(fixture + fixture, "hku"), /duplicated/);
  assert.throws(() => parseList(fixture + '<a href="/tc/programme/hku/JS6999">Missing row</a>', "hku"), /unparsed/);
  assert.throws(() => parseList(fixture.replace("/tc/programme/hku/JS6004", "https://example.com/tc/programme/hku/JS6004"), "hku"), /unexpected official link/);
  assert.throws(() => parseList("<table></table>", "hku"), /no programmes/);
});

test("degree combinations and broad entry are labelled without inventing course content", () => {
  assert.match(summarise("文學士及法學士", "Bachelor of Arts and Bachelor of Laws"), /兩項學士/);
  assert.match(summarise("科技及管理學雙學位課程", "Dual Degree"), /雙學位/);
  assert.match(summarise("理學士（化學／生物學）", "Science"), /不同課程或專修選項/);
  assert.match(summarise("工程學組合課程", "Engineering Scheme"), /組合、學院或學系/);
  const byCode = (code) => data.programmes.find((programme) => programme.code === code).summary;
  assert.doesNotMatch(byCode("JS1013"), /不同課程或專修/);
  assert.match(byCode("JS1013"), /經濟理論、國際經濟/);
  assert.doesNotMatch(byCode("JS1050"), /兩項學士/);
  assert.match(byCode("JS1050"), /不同課程或專修/);
});

test("production assets use relative URLs compatible with a GitHub Pages repository subpath", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /lang="zh-Hant"/);
  assert.match(html, /href="\.\/assets\/styles\.css"/);
  assert.match(html, /src="\.\/assets\/app\.mjs"/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:assets|data)\//);
  const app = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  assert.match(app, /new URL\("\.\.\/data\/programmes\.json", import\.meta\.url\)/);
  assert.doesNotMatch(app, /innerHTML|localStorage|document\.cookie/);
});
