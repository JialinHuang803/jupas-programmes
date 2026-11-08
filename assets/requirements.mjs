const numericLevels = { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "5*": 6, "5**": 7 };

export function levelRank(level) {
  return numericLevels[level] ?? null;
}

export function subjectKey(subject) {
  return subject.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
}

export function requirementSubjects(requirements) {
  const subjects = [];
  function visit(node, section) {
    if (!node) return;
    if (node.kind === "subject") subjects.push({ ...node, section });
    else node.children.forEach((child) => visit(child, section));
  }
  visit(requirements.core, "core");
  visit(requirements.elective, "elective");
  return subjects;
}

function maximalMasks(masks) {
  const unique = [...new Set(masks)];
  return unique.filter((mask) => !unique.some((other) => other !== mask && (other | mask) === other));
}

export function matchesRequirements(requirements, filters = []) {
  if (!filters.length) return true;
  if (!requirements || requirements.status !== "tabulated") return false;
  const fullMask = (1n << BigInt(filters.length)) - 1n;
  function paths(node, section) {
    if (!node) return [0n];
    if (node.kind === "subject") {
      let mask = 0n;
      filters.forEach((filter, index) => {
        const targetRank = levelRank(filter.minimum);
        const sourceRank = levelRank(node.minimum);
        const levelMatches = targetRank === null
          ? node.minimum === filter.minimum
          : sourceRank !== null && sourceRank >= targetRank;
        if (filter.section === section && subjectKey(node.subject) === subjectKey(filter.subject) && levelMatches) mask |= 1n << BigInt(index);
      });
      return [mask];
    }
    if (node.kind === "any") return maximalMasks(node.children.flatMap((child) => paths(child, section)));
    if (node.kind === "choose") {
      let combinations = Array.from({ length: node.count + 1 }, () => []);
      combinations[0] = [0n];
      for (const child of node.children) {
        const childMasks = paths(child, section);
        for (let count = node.count; count >= 1; count--) {
          combinations[count] = maximalMasks([...combinations[count], ...combinations[count - 1].flatMap((left) => childMasks.map((right) => left | right))]);
        }
      }
      return combinations[node.count];
    }
    return node.children.reduce((left, child) => maximalMasks(left.flatMap((mask) => paths(child, section).map((right) => mask | right))), [0n]);
  }
  return paths(requirements.core, "core").some((core) => paths(requirements.elective, "elective").some((elective) => (core | elective) === fullMask));
}

export function validateRequirements(requirements) {
  if (!requirements || !["tabulated", "not-tabulated"].includes(requirements.status)
    || !["programme", "general"].includes(requirements.basis) || !Number.isFinite(Date.parse(requirements.collectedAt))
    || !Number.isInteger(requirements.noteCount) || requirements.noteCount < 0) throw new Error("Invalid entrance requirement metadata");
  let count = 0;
  function visit(node, depth = 0) {
    if (!node) {
      if (depth) throw new Error("Invalid empty entrance requirement child");
      return;
    }
    if (depth > 20) throw new Error("Entrance requirement nesting exceeds supported depth");
    if (node.kind === "subject") {
      if (typeof node.subject !== "string" || !node.subject.trim() || typeof node.minimum !== "string" || !node.minimum.trim()
        || !Array.isArray(node.references) || node.references.some((ref) => typeof ref !== "string")) throw new Error("Invalid subject requirement");
      count++;
    } else {
      if (!["all", "any", "choose"].includes(node.kind) || !Array.isArray(node.children) || !node.children.length
        || (node.label !== undefined && typeof node.label !== "string")
        || (node.kind === "choose" && (!Number.isInteger(node.count) || node.count < 1 || node.count > node.children.length))) throw new Error("Invalid entrance requirement combination");
      node.children.forEach((child) => visit(child, depth + 1));
    }
  }
  visit(requirements.core);
  visit(requirements.elective);
  if (requirements.status === "tabulated" && (!count || !requirements.core || !requirements.elective)) throw new Error("Incomplete tabulated entrance requirements");
  if (requirements.status === "not-tabulated" && count) throw new Error("Untabulated entrance requirements contain inferred subjects");
}
