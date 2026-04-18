type ReviewContext = {
  opponent?: string | null;
  playerNames?: string[];
};

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
  if (!normalizedBase || canonicalNames.length === 0) return token;

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
    .split(/([가-힣A-Za-z0-9]+)/u)
    .map((part) =>
      /^[가-힣A-Za-z0-9]+$/u.test(part)
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

export function sanitizeGameReviewContent<T>(value: T, context: ReviewContext): T {
  const canonicalNames = Array.from(
    new Set(
      [context.opponent, ...(context.playerNames || [])]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );

  return sanitizeValue(value, canonicalNames) as T;
}
