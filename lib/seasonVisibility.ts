import { getLatestSeason, getPreferredSeason, sortSeasons } from "@/lib/season";
import { inferRosterSnapshotSeasons, parseRosterSnapshot } from "@/lib/rosterSnapshot";

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

type RosterUploadRow = {
  filename?: string | null;
  players_snapshot?: string | null;
  source?: string | null;
};

function getRosterUploadMeta(row: RosterUploadRow) {
  const filename = String(row.filename || "");
  const snapshot = parseRosterSnapshot(
    row.players_snapshot,
    inferRosterSnapshotSeasons(filename, row.source)
  );

  return {
    filename,
    seasons: snapshot.seasons.filter(Boolean),
    hasPlayers: snapshot.players.length > 0,
    isActivation: filename.startsWith(ACTIVATION_PREFIX),
  };
}

async function getRosterUploadRows(supabase: {
  from: (table: string) => any;
}) {
  try {
    const { data } = await supabase
      .from("roster_uploads")
      .select("filename,players_snapshot,source");
    return (data || []) as RosterUploadRow[];
  } catch {
    return [];
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
  const rows = await getRosterUploadRows(supabase);
  const seasons = new Set<string>();

  for (const row of rows) {
    const meta = getRosterUploadMeta(row);
    const shouldActivate = meta.isActivation || (meta.hasPlayers && !isKnownSampleUpload(meta.filename));
    if (!shouldActivate) continue;

    for (const season of meta.seasons) {
      if (PLACEHOLDER_SEASONS.includes(season)) {
        seasons.add(season);
      }
    }
  }

  return Array.from(seasons);
}

export async function getRosterUploadSeasons(supabase: {
  from: (table: string) => any;
}) {
  const rows = await getRosterUploadRows(supabase);
  const seasons = new Set<string>();

  for (const row of rows) {
    const meta = getRosterUploadMeta(row);
    const shouldInclude = meta.isActivation || (meta.hasPlayers && !isKnownSampleUpload(meta.filename));
    if (!shouldInclude) continue;

    for (const season of meta.seasons) {
      seasons.add(season);
    }
  }

  return Array.from(seasons);
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
  const [activatedSeasons, rosterUploadSeasons] = await Promise.all([
    getActivatedPlaceholderSeasons(supabase),
    getRosterUploadSeasons(supabase),
  ]);
  const seasons = getVisibleSeasons([...values, ...rosterUploadSeasons], preferred, activatedSeasons);
  const lockedSeasons = seasons.filter((season) => isLockedSeason(season, activatedSeasons));

  return {
    seasons,
    activatedSeasons,
    lockedSeasons,
    latestSeason: getLatestSeason(seasons, fallback),
    preferredSeason: getPreferredSeason(seasons, preferred, fallback),
  };
}
