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

function isValidMonthDay(month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function buildIsoDate(year: string, month: number, day: number) {
  if (!isValidMonthDay(month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseGameDateParts(text: string, fallbackSeason: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return { season: fallbackSeason, date: "" };

  const yearFirst = normalized.match(
    /(?:^|[^0-9])((?:19|20)\d{2})\s*[./\-:_년 ]\s*(\d{1,2})\s*[./\-:_월 ]\s*(\d{1,2})(?:\s*일)?(?=$|[^0-9])/i
  );
  if (yearFirst) {
    return {
      season: yearFirst[1],
      date: buildIsoDate(yearFirst[1], Number(yearFirst[2]), Number(yearFirst[3])),
    };
  }

  const koreanMonthDay = normalized.match(
    /(?:^|[^0-9])(\d{1,2})\s*월\s*(\d{1,2})(?:\s*일)?(?=$|[^0-9])/i
  );
  if (koreanMonthDay) {
    return {
      season: fallbackSeason,
      date: buildIsoDate(fallbackSeason, Number(koreanMonthDay[1]), Number(koreanMonthDay[2])),
    };
  }

  const numericMonthDay = normalized.match(
    /(?:^|[^0-9])(\d{1,2})\s*[./:\-_]\s*(\d{1,2})(?=$|[^0-9])/i
  );
  if (numericMonthDay) {
    return {
      season: fallbackSeason,
      date: buildIsoDate(fallbackSeason, Number(numericMonthDay[1]), Number(numericMonthDay[2])),
    };
  }

  const monthNameFirst = normalized.match(
    /(?:\b((?:19|20)\d{2})\b[\s._-]*)?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b[\s._:-]*(\d{1,2})(?:st|nd|rd|th)?/i
  );
  if (monthNameFirst) {
    const season = monthNameFirst[1] || fallbackSeason;
    const month = Number(MONTH_MAP[monthNameFirst[2].toLowerCase()] || 0);
    return {
      season,
      date: buildIsoDate(season, month, Number(monthNameFirst[3])),
    };
  }

  const dayMonthName = normalized.match(
    /(?:\b((?:19|20)\d{2})\b[\s._-]*)?(\d{1,2})(?:st|nd|rd|th)?[\s._-]*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/i
  );
  if (dayMonthName) {
    const season = dayMonthName[1] || fallbackSeason;
    const month = Number(MONTH_MAP[dayMonthName[3].toLowerCase()] || 0);
    return {
      season,
      date: buildIsoDate(season, month, Number(dayMonthName[2])),
    };
  }

  return { season: fallbackSeason, date: "" };
}

export function getDefaultUploadSeason(fallback = CURRENT_YEAR) {
  return fallback || CURRENT_YEAR;
}

export function extractSeasonFromFilename(fileName: string, fallback = getDefaultUploadSeason()) {
  const match = fileName.match(/\b(20\d{2})\b/);
  return match ? match[1] : fallback;
}

export function normalizeGameDateInput(
  raw: string,
  fallbackSeason = getDefaultUploadSeason()
) {
  return parseGameDateParts(String(raw || ""), fallbackSeason).date;
}

export function extractGameMetaFromFilename(
  fileName: string,
  fallbackSeason = getDefaultUploadSeason()
) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  let season = extractSeasonFromFilename(baseName, fallbackSeason);
  const parsedDate = parseGameDateParts(baseName, season);
  season = parsedDate.season || season;
  const date = parsedDate.date;

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
