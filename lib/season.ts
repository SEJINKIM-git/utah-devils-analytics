export const ACTIVE_SEASON_COOKIE = "ud_active_season";

export function sortSeasons(values: Array<string | null | undefined>) {
  const seasons = Array.from(new Set(values.filter(Boolean) as string[]));
  const regular = seasons.filter((season) => season !== "Career").sort((a, b) => b.localeCompare(a));
  if (seasons.includes("Career")) regular.push("Career");
  return regular;
}

export function getLatestSeason(values: Array<string | null | undefined>, fallback = "2025") {
  const sorted = sortSeasons(values);
  return sorted[0] || fallback;
}

export function getPreferredSeason(
  values: Array<string | null | undefined>,
  preferred: string | null | undefined,
  fallback = "2025"
) {
  const sorted = sortSeasons(values);
  if (preferred && sorted.includes(preferred)) return preferred;
  return sorted[0] || preferred || fallback;
}

export function normalizeSelectedSeason(
  requested: string | undefined,
  values: Array<string | null | undefined>,
  fallback = "2025",
  preferred?: string | null
) {
  const sorted = sortSeasons(values);
  if (requested && sorted.includes(requested)) return requested;
  if (preferred && sorted.includes(preferred)) return preferred;
  return sorted[0] || preferred || fallback;
}
