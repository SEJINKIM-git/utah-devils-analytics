import { sortSeasons } from "@/lib/season";

export const CAREER_SEASON = "Career";

function normalizeSeasonValue(value: unknown) {
  return String(value ?? "").trim();
}

export function isCareerSeason(value: unknown) {
  return normalizeSeasonValue(value) === CAREER_SEASON;
}

export function hasRecordedSeasons(values: Array<string | null | undefined>) {
  return values.some((value) => {
    const season = normalizeSeasonValue(value);
    return Boolean(season) && season !== CAREER_SEASON;
  });
}

export function appendCareerSeasonIfNeeded(
  seasons: Array<string | null | undefined>,
  sourceValues: Array<string | null | undefined> = seasons
) {
  const sorted = sortSeasons(seasons);
  if (!hasRecordedSeasons(sourceValues)) return sorted;
  return sorted.includes(CAREER_SEASON) ? sorted : [...sorted, CAREER_SEASON];
}

export function filterRecordsForSeason<T extends { season?: string | null }>(
  rows: T[],
  season: string,
  options?: { lockedSeasons?: string[] }
) {
  const lockedSeasons = new Set((options?.lockedSeasons || []).map((value) => normalizeSeasonValue(value)));

  if (isCareerSeason(season)) {
    return rows.filter((row) => {
      const rowSeason = normalizeSeasonValue(row.season);
      return Boolean(rowSeason) && rowSeason !== CAREER_SEASON && !lockedSeasons.has(rowSeason);
    });
  }

  return rows.filter((row) => normalizeSeasonValue(row.season) === normalizeSeasonValue(season));
}
