import { getLatestSeason, getPreferredSeason, sortSeasons } from "@/lib/season";

export const PLACEHOLDER_SEASONS = ["2026"];
const ACTIVATION_PREFIX = "[season-activation]";

const KNOWN_SAMPLE_SIGNATURES = new Set([
  "sep 29 vs 사회인",
  "9 26 vs 선학 경기 기록",
]);

const SAMPLE_MARKER = /(샘플|sample|example|예시|test|테스트)/i;

function normalizeFileSignature(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[_:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseActivatedSeason(row: { filename?: string | null; players_snapshot?: string | null }) {
  const filename = String(row.filename || "");
  const filenameMatch = filename.match(/\[season-activation\]\s*(20\d{2})/);
  if (filenameMatch?.[1]) return filenameMatch[1];

  const snapshot = row.players_snapshot;
  if (!snapshot) return null;

  try {
    const parsed = JSON.parse(snapshot) as { season?: string };
    return parsed?.season || null;
  } catch {
    return null;
  }
}

export function isKnownSampleUpload(fileName: string) {
  const signature = normalizeFileSignature(fileName);
  return SAMPLE_MARKER.test(fileName) || KNOWN_SAMPLE_SIGNATURES.has(signature);
}

export function shouldAutoActivateSeasonUpload(season: string, fileName: string) {
  return PLACEHOLDER_SEASONS.includes(season) && !isKnownSampleUpload(fileName);
}

export async function getActivatedPlaceholderSeasons(supabase: {
  from: (table: string) => any;
}) {
  try {
    const { data } = await supabase.from("roster_uploads").select("filename,players_snapshot");
    const seasons = new Set<string>();

    for (const row of data || []) {
      const filename = String(row.filename || "");
      if (!filename.startsWith(ACTIVATION_PREFIX)) continue;
      const season = parseActivatedSeason(row);
      if (season) seasons.add(season);
    }

    return Array.from(seasons);
  } catch {
    return [];
  }
}

export async function ensureSeasonActivated(
  supabase: {
    from: (table: string) => any;
  },
  season: string,
  fileName: string
) {
  if (!shouldAutoActivateSeasonUpload(season, fileName)) return false;

  const activationName = `${ACTIVATION_PREFIX} ${season} :: ${fileName}`;
  const { data: existing } = await supabase
    .from("roster_uploads")
    .select("filename")
    .eq("filename", activationName)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabase.from("roster_uploads").insert({
    filename: activationName,
    player_count: 0,
    added_count: 0,
    updated_count: 0,
    source: "file",
    players_snapshot: JSON.stringify({
      season,
      activatedBy: fileName,
      activatedAt: new Date().toISOString(),
    }),
    uploaded_at: new Date().toISOString(),
  });

  return !error;
}

export function getVisibleSeasons(
  values: Array<string | null | undefined>,
  preferred: string | null | undefined,
  activatedSeasons: string[]
) {
  return sortSeasons([
    ...values,
    ...PLACEHOLDER_SEASONS,
    ...activatedSeasons,
    preferred,
  ]);
}

export function isLockedSeason(season: string, activatedSeasons: string[]) {
  return PLACEHOLDER_SEASONS.includes(season) && !activatedSeasons.includes(season);
}

export async function getSeasonVisibility(
  supabase: {
    from: (table: string) => any;
  },
  values: Array<string | null | undefined>,
  preferred: string | null | undefined,
  fallback = "2025"
) {
  const activatedSeasons = await getActivatedPlaceholderSeasons(supabase);
  const seasons = getVisibleSeasons(values, preferred, activatedSeasons);
  const lockedSeasons = seasons.filter((season) => isLockedSeason(season, activatedSeasons));

  return {
    seasons,
    activatedSeasons,
    lockedSeasons,
    latestSeason: getLatestSeason(seasons, fallback),
    preferredSeason: getPreferredSeason(seasons, preferred, fallback),
  };
}
