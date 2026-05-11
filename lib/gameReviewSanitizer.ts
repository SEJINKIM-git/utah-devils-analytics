import type { Lang } from "@/lib/translations";

type ReviewContext = {
  opponent?: string | null;
  playerNames?: string[];
};

const KNOWN_ENTITY_CORRECTIONS: Record<string, string> = {
  "사해인": "사회인",
  "社會人": "사회인",
};

const KNOWN_OPPONENT_TRANSLATIONS = [
  {
    ko: "사회인",
    en: "Social Team",
    aliases: ["사회인", "사회인 팀", "사회인팀", "社會人", "social team"],
  },
];

const ENTITY_TOKEN_SPLIT_REGEX = /([\p{Script=Hangul}\p{Script=Han}A-Za-z0-9]+)/u;
const ENTITY_TOKEN_REGEX = /^[\p{Script=Hangul}\p{Script=Han}A-Za-z0-9]+$/u;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PARTICLES = [
  "으로",
  "에서",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "와",
  "과",
  "의",
  "도",
  "만",
  "로",
];

function normalizeToken(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function splitTrailingParticle(token: string) {
  for (const particle of PARTICLES) {
    if (token.length > particle.length + 1 && token.endsWith(particle)) {
      return {
        base: token.slice(0, -particle.length),
        suffix: token.slice(-particle.length),
      };
    }
  }

  return { base: token, suffix: "" };
}

function normalizeKnownEntity(base: string) {
  const compact = normalizeToken(base);
  if (!compact) return "";

  for (const [wrong, correct] of Object.entries(KNOWN_ENTITY_CORRECTIONS)) {
    if (normalizeToken(wrong) === compact) return correct;
  }

  return base.trim();
}

function findKnownOpponentTranslation(base: string) {
  const compact = normalizeToken(base);
  if (!compact) return null;

  return (
    KNOWN_OPPONENT_TRANSLATIONS.find((entry) =>
      [entry.ko, entry.en, ...entry.aliases].some(
        (candidate) => normalizeToken(candidate) === compact
      )
    ) || null
  );
}

function levenshtein(a: string, b: string, maxDistance: number) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const dp = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];

    for (let j = 1; j <= b.length; j += 1) {
      const current = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + cost
      );
      prev = current;
      rowMin = Math.min(rowMin, dp[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
  }

  return dp[b.length];
}

function correctEntityToken(token: string, canonicalNames: string[]) {
  const { base, suffix } = splitTrailingParticle(token);
  const normalizedBase = normalizeToken(base);
  if (!normalizedBase) return token;

  const correctedKnownEntity = normalizeKnownEntity(base);
  if (normalizeToken(correctedKnownEntity) !== normalizedBase) {
    return `${correctedKnownEntity}${suffix}`;
  }

  if (canonicalNames.length === 0) return token;

  let bestMatch = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const canonical of canonicalNames) {
    const normalizedCanonical = normalizeToken(canonical);
    if (!normalizedCanonical || normalizedCanonical === normalizedBase) {
      if (normalizedCanonical === normalizedBase) return canonical + suffix;
      continue;
    }

    const maxDistance = normalizedCanonical.length <= 3 ? 1 : 2;
    const distance = levenshtein(normalizedBase, normalizedCanonical, maxDistance);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = canonical;
    }
  }

  if (!bestMatch) return token;

  const threshold = normalizeToken(bestMatch).length <= 3 ? 1 : 2;
  return bestDistance <= threshold ? `${bestMatch}${suffix}` : token;
}

function sanitizeString(text: string, canonicalNames: string[]) {
  return text
    .split(ENTITY_TOKEN_SPLIT_REGEX)
    .map((part) =>
      ENTITY_TOKEN_REGEX.test(part)
        ? correctEntityToken(part, canonicalNames)
        : part
    )
    .join("");
}

function sanitizeValue(value: unknown, canonicalNames: string[]): unknown {
  if (typeof value === "string") return sanitizeString(value, canonicalNames);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, canonicalNames));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry, canonicalNames)])
  );
}

function localizeKnownOpponentToken(token: string, lang: Lang) {
  const { base, suffix } = splitTrailingParticle(token);
  const match = findKnownOpponentTranslation(normalizeKnownEntity(base));
  if (!match) return token;

  const localized = lang === "en" ? match.en : match.ko;
  return lang === "en" ? localized : `${localized}${suffix}`;
}

function localizeKnownOpponentString(text: string, lang: Lang) {
  let normalizedText = text;

  for (const entry of KNOWN_OPPONENT_TRANSLATIONS) {
    const localized = lang === "en" ? entry.en : entry.ko;
    const aliases = Array.from(new Set([entry.ko, entry.en, ...entry.aliases])).sort(
      (a, b) => b.length - a.length
    );

    for (const alias of aliases) {
      const flags = /[A-Za-z]/.test(alias) ? "giu" : "gu";
      normalizedText = normalizedText.replace(new RegExp(escapeRegExp(alias), flags), localized);
    }
  }

  return normalizedText
    .split(ENTITY_TOKEN_SPLIT_REGEX)
    .map((part) => (ENTITY_TOKEN_REGEX.test(part) ? localizeKnownOpponentToken(part, lang) : part))
    .join("");
}

function localizeKnownOpponentValue(value: unknown, lang: Lang): unknown {
  if (typeof value === "string") return localizeKnownOpponentString(value, lang);
  if (Array.isArray(value)) return value.map((item) => localizeKnownOpponentValue(item, lang));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, localizeKnownOpponentValue(entry, lang)])
  );
}

export function sanitizeGameReviewContent<T>(value: T, context: ReviewContext): T {
  const canonicalNames = Array.from(
    new Set(
      [context.opponent, ...(context.playerNames || [])]
        .map((entry) => sanitizeEntityName(entry))
        .filter(Boolean)
    )
  );

  return sanitizeValue(value, canonicalNames) as T;
}

export function sanitizeEntityName(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  const { base, suffix } = splitTrailingParticle(candidate);
  return `${normalizeKnownEntity(base)}${suffix}`.trim();
}

export function sanitizeOpponentName(value: unknown) {
  const candidate = sanitizeEntityName(value);
  const match = findKnownOpponentTranslation(candidate);
  return match ? match.ko : candidate;
}

export function getLocalizedOpponentName(value: unknown, lang: Lang) {
  return localizeKnownOpponentToken(sanitizeOpponentName(value), lang).trim();
}

export function localizeKnownOpponentEntities<T>(value: T, lang: Lang): T {
  return localizeKnownOpponentValue(value, lang) as T;
}
