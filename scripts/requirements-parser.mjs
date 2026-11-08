import { load } from "cheerio";
import { validateRequirements } from "../assets/requirements.mjs";

const clean = (value) => value.replace(/\s+/g, " ").trim();

function group(kind, children, label) {
  if (!children.length) throw new Error(`Empty entrance requirement group: ${label || kind}`);
  return { kind, ...(label ? { label } : {}), children };
}

function splitAlternatives(subject) {
  if (/^MATHEMATICS EXTENDED MODULE 1 OR 2$/i.test(subject)) return [subject];
  let depth = 0;
  const parts = [];
  let start = 0;
  for (let index = 0; index < subject.length; index++) {
    if ("([".includes(subject[index])) depth++;
    if (")]".includes(subject[index])) depth--;
    if (!depth && /^ or /i.test(subject.slice(index))) {
      parts.push(subject.slice(start, index).trim());
      start = index + 4;
      index += 3;
    }
  }
  parts.push(subject.slice(start).trim());
  return parts;
}

function parseTable($, table) {
  const routes = [];
  let mandatory = [];
  let choices = [];
  let choiceLabel;
  let choiceCount = 1;
  function closeChoices() {
    if (!choiceLabel) return;
    const aggregateCount = choices.length === 1 ? Number(choices[0].subject?.match(/^ANY (\d+) SUBJECTS?(?:\b|$)/i)?.[1]) : null;
    // An ANY N SUBJECTS row already encodes N subjects; it does not require N duplicate rows.
    if (aggregateCount === choiceCount) mandatory.push({ ...choices[0], label: choiceLabel });
    else {
      if (choiceCount > choices.length) throw new Error(`Incomplete choice group: ${choiceLabel}`);
      mandatory.push(choiceCount === 1 ? group("any", choices, choiceLabel) : { kind: "choose", count: choiceCount, label: choiceLabel, children: choices });
    }
    choices = [];
    choiceLabel = undefined;
  }
  function closeRoute() {
    closeChoices();
    routes.push(group("all", mandatory));
    mandatory = [];
  }
  for (const row of $(table).find("tbody").first().children("tr").toArray()) {
    const cells = $(row).children("td");
    if (!cells.length) throw new Error("Unexpected entrance requirement row without cells");
    const rawSubject = cells.first();
    const references = [...new Set([...rawSubject.find("sup").toArray(), ...cells.eq(1).find("sup").toArray()].map((ref) => clean($(ref).text())).filter(Boolean))];
    const subjectCell = rawSubject.clone();
    subjectCell.find("sup").remove();
    subjectCell.find("br").replaceWith(" ");
    const subject = clean(subjectCell.text());
    const minimumCell = cells.eq(1).clone();
    minimumCell.find("sup").remove();
    minimumCell.find("br").replaceWith(" ");
    const minimum = clean(minimumCell.text());
    if (!minimum) {
      if (/^or$/i.test(subject)) { closeRoute(); continue; }
      if (/^and$/i.test(subject)) { closeChoices(); continue; }
      const choice = subject.match(/^(One|Two|Three|Any\s+(\d+)|(\d+)) of the following (?:elective )?subjects?:?$/i);
      if (choice) {
        closeChoices();
        choiceLabel = subject;
        choiceCount = { one: 1, two: 2, three: 3 }[choice[1].toLowerCase()] ?? Number(choice[2] || choice[3]);
        continue;
      }
      throw new Error(`Unrecognised entrance requirement connector: ${subject}`);
    }
    if (!subject || cells.length !== 2 || cells.toArray().some((cell) => $(cell).attr("rowspan") && $(cell).attr("rowspan") !== "1")) {
      throw new Error(`Unsupported entrance requirement row: ${subject}`);
    }
    const alternatives = splitAlternatives(subject);
    const leaves = alternatives.map((name) => ({ kind: "subject", subject: name, minimum, references }));
    const node = leaves.length === 1 ? leaves[0] : group("any", leaves, subject);
    if (choiceLabel) choices.push(...leaves);
    else mandatory.push(node);
  }
  closeRoute();
  return routes.length === 1 ? routes[0] : group("any", routes);
}

export function parseRequirements(html, { collectedAt, code }) {
  const $ = load(html);
  const tabs = $(".js-tabs").filter((_, element) => clean($(element).find(".js-tab-trigger").first().text()) === "Programme Entrance Requirements");
  if (tabs.length !== 1) throw new Error(`${code}: official entrance requirement tabs not found`);
  const contents = tabs.children(".js-tab-content");
  const triggers = tabs.find(".js-tab-trigger").toArray().map((element) => clean($(element).text()));
  if (contents.length !== 2 || triggers[1] !== "General Entrance Requirements") throw new Error(`${code}: unexpected official entrance requirement tabs`);
  const programme = contents.eq(0);
  const programmeContainer = programme.find(".dsereg_tables_container");
  if (programmeContainer.length !== 1) throw new Error(`${code}: programme requirement container not found`);
  const intro = clean(programmeContainer.clone().find("table").remove().end().text());
  const inheritsGeneral = /^Same as General Entrance Requirements\.?$/i.test(intro);
  const selected = inheritsGeneral ? contents.eq(1) : programme;
  const container = selected.find(".dsereg_tables_container");
  const tables = container.find("table");
  const core = tables.filter(".dsereg_table-core");
  const elective = tables.filter(".dsereg_table-elective");
  if (tables.length !== core.length + elective.length) throw new Error(`${code}: unrecognised requirement table`);
  if (tables.length && (core.length !== 1 || elective.length !== 1 || (!inheritsGeneral && intro))) {
    throw new Error(`${code}: partial or annotated requirement tables need review`);
  }
  if (!tables.length && !intro) throw new Error(`${code}: empty entrance requirement section`);
  const notes = selected.find(".remarks, .remarks-larger").toArray().filter((element) => clean($(element).text()));
  const programmeNotes = inheritsGeneral ? programme.find(".remarks, .remarks-larger").toArray().filter((element) => clean($(element).text())) : [];
  const result = {
    status: tables.length ? "tabulated" : "not-tabulated",
    basis: inheritsGeneral ? "general" : "programme",
    collectedAt,
    core: core.length ? parseTable($, core[0]) : null,
    elective: elective.length ? parseTable($, elective[0]) : null,
    noteCount: notes.length + programmeNotes.length,
  };
  validateRequirements(result);
  return result;
}
