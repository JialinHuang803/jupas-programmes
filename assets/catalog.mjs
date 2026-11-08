import { Converter } from "./vendor/opencc-t2cn.mjs";
import { matchesRequirements } from "./requirements.mjs";

const toSimplified = Converter({ from: "hk", to: "cn" });
const searchTextCache = new WeakMap();

export const schools = [
  { id: "cityuhk", short: "城大", name: "香港城市大學", en: "City University of Hong Kong", acronym: "CityUHK" },
  { id: "hkbu", short: "浸大", name: "香港浸會大學", en: "Hong Kong Baptist University", acronym: "HKBU" },
  { id: "lingnanu", short: "嶺大", name: "嶺南大學", en: "Lingnan University", acronym: "LU" },
  { id: "cuhk", short: "中大", name: "香港中文大學", en: "The Chinese University of Hong Kong", acronym: "CUHK" },
  { id: "eduhk", short: "教大", name: "香港教育大學", en: "The Education University of Hong Kong", acronym: "EdUHK" },
  { id: "polyu", short: "理大", name: "香港理工大學", en: "The Hong Kong Polytechnic University", acronym: "PolyU" },
  { id: "hkust", short: "科大", name: "香港科技大學", en: "The Hong Kong University of Science and Technology", acronym: "HKUST" },
  { id: "hku", short: "港大", name: "香港大學", en: "The University of Hong Kong", acronym: "HKU" },
];

export function normalize(value) {
  return toSimplified(value.normalize("NFKC")).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function searchText(programme) {
  const institution = schools.find((item) => item.id === programme.school);
  const source = [
    programme.code, programme.nameZh, programme.nameEn, programme.summary,
    programme.shortName, institution.name, institution.short, institution.en, institution.acronym,
  ].join(" ");
  const cached = searchTextCache.get(programme);
  if (cached?.source === source) return cached.value;
  const value = normalize(source);
  searchTextCache.set(programme, { source, value });
  return value;
}

export function filterProgrammes(programmes, { query = "", school = "all", funding = "all", requirements = [] } = {}) {
  const terms = normalize(query).split(" ").filter(Boolean);
  return programmes.filter((programme) => {
    if (school !== "all" && programme.school !== school) return false;
    if (funding !== "all" && programme.funding !== funding) return false;
    if (!matchesRequirements(programme.requirements, requirements)) return false;
    const haystack = searchText(programme);
    return terms.every((term) => haystack.includes(term));
  });
}
