const CURRENT_YEAR = String(new Date().getFullYear());

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

export function getDefaultUploadSeason(fallback = CURRENT_YEAR) {
  return fallback || CURRENT_YEAR;
}

export function extractSeasonFromFilename(fileName: string, fallback = getDefaultUploadSeason()) {
  const match = fileName.match(/\b(20\d{2})\b/);
  return match ? match[1] : fallback;
}

export function extractGameMetaFromFilename(
  fileName: string,
  fallbackSeason = getDefaultUploadSeason()
) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  let season = extractSeasonFromFilename(baseName, fallbackSeason);

  const numericDateMatch = baseName.match(/(?:\b(20\d{2})[._\-/\s]*)?(\d{1,2})[._:\-/](\d{1,2})/);
  if (numericDateMatch?.[1]) season = numericDateMatch[1];

  const namedDateMatch = baseName.match(
    /(?:\b(20\d{2})\b[\s._-]*)?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b[\s._:-]*(\d{1,2})/i
  );
  if (namedDateMatch?.[1]) season = namedDateMatch[1];

  const month = numericDateMatch?.[2]
    ? numericDateMatch[2].padStart(2, "0")
    : namedDateMatch?.[2]
      ? MONTH_MAP[namedDateMatch[2].toLowerCase()] || ""
      : "";
  const day = numericDateMatch?.[3]
    ? numericDateMatch[3].padStart(2, "0")
    : namedDateMatch?.[3]
      ? namedDateMatch[3].padStart(2, "0")
      : "";
  const date = month && day ? `${season}-${month}-${day}` : "";

  const opponentMatch = baseName.match(/[Vv][Ss]\s*([^]+?)(?:\s*경기\s*기록|\s*기록|$)/);
  const opponent = opponentMatch
    ? opponentMatch[1].replace(/[_:.]+/g, " ").trim()
    : "";

  return {
    baseName,
    season,
    date,
    opponent,
  };
}
