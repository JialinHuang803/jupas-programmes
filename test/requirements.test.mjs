import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRequirements } from "../scripts/requirements-parser.mjs";
import { levelRank, matchesRequirements, requirementSubjects, validateRequirements } from "../assets/requirements.mjs";

const collectedAt = "2026-11-08T10:00:00.000Z";
const fixtures = {};
const fixtureHtml = {};
for (const code of ["JS1000", "JS3006", "JS4412", "JS5240", "JS6004", "JS6688", "JS7101"]) {
  fixtureHtml[code] = await readFile(new URL(`./fixtures/requirements-${code}.html`, import.meta.url), "utf8");
  fixtures[code] = parseRequirements(fixtureHtml[code], { code, collectedAt });
}
const core = (subject, minimum = "3") => ({ section: "core", subject, minimum });
const elective = (subject, minimum = "3") => ({ section: "elective", subject, minimum });
const preset = [core("CHINESE LANGUAGE"), core("ENGLISH LANGUAGE"), core("MATHEMATICS COMPULSORY PART", "2"), elective("ANY 2 SUBJECTS")];
const leaf = (subject, minimum = "3") => ({ kind: "subject", subject, minimum, references: [] });

test("official programme requirements override less demanding general tables", () => {
  const requirements = fixtures.JS1000;
  assert.equal(requirements.basis, "programme");
  assert.equal(requirementSubjects(requirements).find((subject) => subject.subject === "MATHEMATICS COMPULSORY PART").minimum, "4");
  assert.ok(matchesRequirements(requirements, preset));
  assert.ok(matchesRequirements(requirements, [core("MATHEMATICS COMPULSORY PART", "4")]));
  assert.equal(matchesRequirements(requirements, [core("MATHEMATICS COMPULSORY PART", "5")]), false);
});

test("general tables are inherited only when the programme explicitly says so", () => {
  assert.equal(fixtures.JS3006.basis, "general");
  assert.equal(fixtures.JS6004.basis, "general");
  assert.equal(fixtures.JS4412.basis, "programme");
  assert.ok(matchesRequirements(fixtures.JS3006, preset));
  assert.equal(matchesRequirements(fixtures.JS4412, preset), false);
  const missing = parseRequirements('<div class="js-tabs"><div><span class="js-tab-trigger">Programme Entrance Requirements</span><span class="js-tab-trigger">General Entrance Requirements</span></div><div class="js-tab-content"><div class="dsereg_tables_container">Please refer to the programme website.</div></div><div class="js-tab-content"><div class="dsereg_tables_container"></div></div></div>', { code: "JS0000", collectedAt });
  assert.equal(missing.status, "not-tabulated");
  assert.equal(missing.core, null);
  assert.equal(matchesRequirements(missing, preset), false);
  assert.equal(matchesRequirements(missing, []), true);
});

test("all filter conditions must coexist in one full OR route", () => {
  const requirements = fixtures.JS3006;
  assert.ok(matchesRequirements(requirements, [elective("ANY 2 SUBJECTS")]));
  assert.ok(matchesRequirements(requirements, [elective("ANY 1 SUBJECT"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]));
  assert.equal(matchesRequirements(requirements, [elective("ANY 2 SUBJECTS"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]), false);
  assert.equal(matchesRequirements(fixtures.JS5240, [elective("ANY 1 SUBJECT"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]), false);
});

test("one-of groups and inline subject alternatives are not mistaken for AND requirements", () => {
  assert.ok(matchesRequirements(fixtures.JS4412, [elective("PHYSICS"), elective("ANY 1 SUBJECT")]));
  assert.equal(matchesRequirements(fixtures.JS4412, [elective("PHYSICS"), elective("BIOLOGY")]), false);
  assert.ok(matchesRequirements(fixtures.JS5240, [elective("PHYSICS"), elective("ANY 1 SUBJECT")]));
  assert.ok(matchesRequirements(fixtures.JS5240, [elective("BIOLOGY"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]));
  assert.equal(matchesRequirements(fixtures.JS5240, [elective("BIOLOGY"), elective("CHEMISTRY")]), false);
});

test("ANY 2 is not inferred from differently restricted ANY 1 rows; footnotes stay separate", () => {
  const requirements = fixtures.JS6004;
  assert.equal(matchesRequirements(requirements, preset), false);
  assert.ok(matchesRequirements(requirements, [elective("ANY 1 SUBJECT (EXCLUDING APPLIED LEARNING, OTHER LANGUAGE)"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]));
  assert.equal(matchesRequirements(requirements, [elective("ANY 1 SUBJECT (EXCLUDING APPLIED LEARNING)"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]), false);
  const rows = requirementSubjects(requirements);
  assert.ok(rows.some((row) => row.references.includes("4") && row.subject === "ANY 1 SUBJECT (EXCLUDING APPLIED LEARNING)"));
  assert.ok(rows.some((row) => row.references.includes("3") && row.subject === "CITIZENSHIP AND SOCIAL DEVELOPMENT"));
});

test("Attained is a categorical requirement, not an inferred numeric grade", () => {
  assert.equal(levelRank("Attained"), null);
  assert.equal(levelRank("5**"), 7);
  assert.ok(matchesRequirements(fixtures.JS1000, [core("CITIZENSHIP AND SOCIAL DEVELOPMENT", "Attained")]));
  assert.equal(matchesRequirements(fixtures.JS1000, [core("CITIZENSHIP AND SOCIAL DEVELOPMENT", "1")]), false);
  assert.equal(matchesRequirements(fixtures.JS1000, [core("CHINESE LANGUAGE", "Attained")]), false);
});

test("two-of groups can include two requested subjects but not three", () => {
  const requirements = { status: "tabulated", basis: "programme", collectedAt, noteCount: 0,
    core: { kind: "all", children: [leaf("CHINESE LANGUAGE")] },
    elective: { kind: "choose", count: 2, children: [leaf("BIOLOGY"), leaf("PHYSICS"), leaf("CHEMISTRY")] } };
  validateRequirements(requirements);
  assert.ok(matchesRequirements(requirements, [elective("BIOLOGY"), elective("PHYSICS")]));
  assert.equal(matchesRequirements(requirements, [elective("BIOLOGY"), elective("PHYSICS"), elective("CHEMISTRY")]), false);
  assert.ok(matchesRequirements(requirements, Array.from({ length: 40 }, () => core("CHINESE LANGUAGE"))));
});

test("HKU two-of science choices expand inline OR subjects without merging the M1/M2 route", () => {
  const requirements = fixtures.JS6688;
  assert.equal(requirements.elective.children[0].children[0].kind, "choose");
  assert.equal(requirements.elective.children[0].children[0].count, 2);
  assert.ok(matchesRequirements(requirements, [elective("BIOLOGY"), elective("CHEMISTRY")]));
  assert.ok(matchesRequirements(requirements, [elective("PHYSICS"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]));
  assert.equal(matchesRequirements(requirements, [elective("BIOLOGY"), elective("CHEMISTRY"), elective("PHYSICS")]), false);
  assert.equal(matchesRequirements(requirements, [elective("BIOLOGY"), elective("CHEMISTRY"), elective("MATHEMATICS EXTENDED MODULE 1 OR 2")]), false);
});

test("an ANY 2 SUBJECTS row already satisfies a two-subject group without duplicate rows", () => {
  const requirements = fixtures.JS7101;
  assert.equal(requirements.basis, "general");
  assert.ok(matchesRequirements(requirements, [elective("ANY 2 SUBJECTS", "2")]));
  assert.equal(matchesRequirements(requirements, [elective("ANY 2 SUBJECTS", "3")]), false);
  const row = requirementSubjects(requirements).find((subject) => subject.subject === "ANY 2 SUBJECTS");
  assert.equal(row.label, "Two of the following elective subjects:");
  assert.deepEqual(row.references, ["Note3"]);
});

test("unknown official connectors and malformed rows fail explicitly", () => {
  const base = fixtureHtml.JS3006;
  assert.throws(() => parseRequirements(base.replace("<strong>Or</strong>", "<strong>Unrecognised rule</strong>"), { code: "JS3006", collectedAt }), /Unrecognised entrance requirement connector/);
  assert.throws(() => validateRequirements({ status: "tabulated", basis: "programme", collectedAt, noteCount: 0, core: null, elective: null }), /Incomplete/);
});

test("minimum-level footnotes and line breaks do not corrupt subjects or grades", () => {
  const html = fixtureHtml.JS1000.replace("<td class=\"dsereg-lv\">4</td>", "<td class=\"dsereg-lv\">4<sup>Note5</sup></td>")
    .replace("CHINESE LANGUAGE</td>", "CHINESE<br>LANGUAGE</td>");
  const requirements = parseRequirements(html, { code: "JS1000", collectedAt });
  const mathematics = requirementSubjects(requirements).find((row) => row.subject === "MATHEMATICS COMPULSORY PART");
  assert.equal(mathematics.minimum, "4");
  assert.deepEqual(mathematics.references, ["Note5"]);
  assert.ok(matchesRequirements(requirements, [core("CHINESE LANGUAGE"), core("MATHEMATICS COMPULSORY PART", "4")]));
});

test("optimized matching agrees with exhaustive route enumeration on official tables", () => {
  function routes(node, section) {
    if (node.kind === "subject") return [[{ ...node, section }]];
    if (node.kind === "any") return node.children.flatMap((child) => routes(child, section));
    if (node.kind === "choose") {
      const selections = [];
      function select(start, chosen) {
        if (chosen.length === node.count) { selections.push(chosen); return; }
        for (let index = start; index < node.children.length; index++) select(index + 1, [...chosen, node.children[index]]);
      }
      select(0, []);
      return selections.flatMap((children) => routes({ kind: "all", children }, section));
    }
    return node.children.reduce((left, child) => left.flatMap((path) => routes(child, section).map((right) => [...path, ...right])), [[]]);
  }
  for (const requirements of Object.values(fixtures)) {
    const completeRoutes = routes(requirements.core, "core").flatMap((corePath) => routes(requirements.elective, "elective").map((electivePath) => [...corePath, ...electivePath]));
    const conditions = [...new Map(requirementSubjects(requirements).map((row) => [`${row.section}:${row.subject}`, { section: row.section, subject: row.subject, minimum: row.minimum }])).values()];
    for (const first of conditions) {
      for (const second of conditions) {
        const filters = [first, second];
        const exhaustive = completeRoutes.some((path) => filters.every((filter) => path.some((row) => row.section === filter.section && row.subject === filter.subject
          && (levelRank(filter.minimum) === null ? row.minimum === filter.minimum : levelRank(row.minimum) !== null && levelRank(row.minimum) >= levelRank(filter.minimum)))));
        assert.equal(matchesRequirements(requirements, filters), exhaustive, JSON.stringify(filters));
      }
    }
  }
});
