import type { Lang } from "@/lib/translations";

type PlayerNamePair = {
  ko: string;
  en: string;
};

const PLAYER_NAME_PAIRS: PlayerNamePair[] = [
  { ko: "이호원", en: "Howon Lee" },
  { ko: "강배현", en: "Baehyun Kang" },
  { ko: "박지민", en: "Jimin Park" },
  { ko: "황서현", en: "Seohyun Hwang" },
  { ko: "조경민", en: "Kyungmin Cho" },
  { ko: "임희찬", en: "Heechan Im" },
  { ko: "소이어", en: "Sawyer Ott" },
  { ko: "임주호", en: "Juho Lim" },
  { ko: "윤준호", en: "Joonho Yoon" },
  { ko: "강래원", en: "Raewon Kang" },
  { ko: "사무엘", en: "Sam Bernard" },
];

const normalizeName = (value: unknown) =>
  String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

const KO_TO_EN = new Map(
  PLAYER_NAME_PAIRS.map((entry) => [normalizeName(entry.ko), entry.en])
);

const EN_TO_KO = new Map(
  PLAYER_NAME_PAIRS.map((entry) => [normalizeName(entry.en), entry.ko])
);

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getPlayerDisplayName(name: unknown, lang: Lang) {
  const original = String(name || "").trim();
  if (!original) return "";

  const normalized = normalizeName(original);
  if (lang === "en") {
    return KO_TO_EN.get(normalized) || original;
  }

  return EN_TO_KO.get(normalized) || original;
}

export function getPlayerNameVariants(name: unknown) {
  const original = String(name || "").trim();
  if (!original) return [];

  return uniqueStrings([
    original,
    getPlayerDisplayName(original, "ko"),
    getPlayerDisplayName(original, "en"),
  ]);
}

export function getKnownPlayerNamePairs() {
  return PLAYER_NAME_PAIRS;
}

export function localizeBattingRows<T extends { name?: unknown }>(rows: T[], lang: Lang) {
  return rows.map((row) => ({
    ...row,
    name: getPlayerDisplayName(row.name, lang),
  }));
}

export function localizePitchingDecision(decision: unknown, lang: Lang) {
  const value = String(decision || "").trim();
  if (!value) return "";

  const normalized = value.toUpperCase();
  if (lang === "en") {
    if (value === "승" || normalized === "W") return "W";
    if (value === "패" || normalized === "L") return "L";
    if (value === "세" || value === "세이브" || normalized === "SV") return "SV";
    if (value === "홀드" || normalized === "HLD") return "HLD";
    return value;
  }

  if (value === "W" || value === "승") return "승";
  if (value === "L" || value === "패") return "패";
  if (value === "SV" || value === "세" || value === "세이브") return "세";
  if (value === "HLD" || value === "홀드") return "홀드";
  return value;
}

export function localizePitchingRows<T extends { name?: unknown; decision?: unknown }>(
  rows: T[],
  lang: Lang
) {
  return rows.map((row) => ({
    ...row,
    name: getPlayerDisplayName(row.name, lang),
    decision: localizePitchingDecision(row.decision, lang),
  }));
}

export function localizeObjectNameFields<T>(value: T, lang: Lang): T {
  if (Array.isArray(value)) {
    return value.map((entry) => localizeObjectNameFields(entry, lang)) as T;
  }

  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "name") {
        return [key, getPlayerDisplayName(entry, lang)];
      }
      return [key, localizeObjectNameFields(entry, lang)];
    })
  ) as T;
}
