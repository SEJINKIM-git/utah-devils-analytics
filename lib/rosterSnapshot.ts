import { buildPlayerIdentityKey } from "@/lib/playerIdentity";
import { getRosterUploadTerm, isTermStatRecord } from "@/lib/seasonTerms";

export type RosterSnapshotPlayer = {
  number: number;
  name: string;
  position?: string;
  is_pitcher?: boolean;
};

export type RosterUploadRecord = {
  filename?: string | null;
  players_snapshot?: string | null;
  source?: string | null;
  uploaded_at?: string | null;
};

type ParsedSnapshotObject = {
  season?: string;
  seasons?: Array<string | number | null | undefined>;
  players?: unknown;
};

const DEFAULT_ROSTER_SEASON = "2026";

function uniqueSeasons(values: Array<string | number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "number" ? String(value) : String(value || "").trim()))
        .filter(Boolean)
    )
  );
}

function normalizePlayers(value: unknown): RosterSnapshotPlayer[] {
  if (!Array.isArray(value)) return [];

  const players = value
    .map((entry): RosterSnapshotPlayer | null => {
      if (!entry || typeof entry !== "object") return null;
      const player = entry as Record<string, unknown>;
      const name = String(player.name || "").trim();
      if (!name) return null;

      const numeric = Number(player.number);
      return {
        number: Number.isFinite(numeric) ? numeric : 0,
        name,
        position: typeof player.position === "string" ? player.position : undefined,
        is_pitcher: Boolean(player.is_pitcher),
      };
    })
    .filter((player): player is RosterSnapshotPlayer => player !== null);

  return players;
}

export function inferRosterSnapshotSeasons(filename?: string | null, source?: string | null) {
  const rawName = String(filename || "").trim();
  if (!rawName) return [DEFAULT_ROSTER_SEASON];

  const activationMatch = rawName.match(/\[season-activation\]\s*(20\d{2})/);
  if (activationMatch?.[1]) return [activationMatch[1]];

  const years = Array.from(
    new Set(Array.from(rawName.matchAll(/\b(20\d{2})\b/g)).map((match) => match[1]))
  );
  if (years.length > 0) return years;

  if (source === "manual" || rawName.includes("직접 입력")) {
    return [DEFAULT_ROSTER_SEASON];
  }

  return [DEFAULT_ROSTER_SEASON];
}

export function parseRosterSnapshot(
  raw: string | null | undefined,
  fallbackSeasons: Array<string | number | null | undefined> = []
) {
  if (!raw) {
    return {
      players: [] as RosterSnapshotPlayer[],
      seasons: uniqueSeasons(fallbackSeasons),
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        players: normalizePlayers(parsed),
        seasons: uniqueSeasons(fallbackSeasons),
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        players: [] as RosterSnapshotPlayer[],
        seasons: uniqueSeasons(fallbackSeasons),
      };
    }

    const snapshot = parsed as ParsedSnapshotObject;
    return {
      players: normalizePlayers(snapshot.players),
      seasons: uniqueSeasons([
        snapshot.season,
        ...(snapshot.seasons || []),
        ...fallbackSeasons,
      ]),
    };
  } catch {
    return {
      players: [] as RosterSnapshotPlayer[],
      seasons: uniqueSeasons(fallbackSeasons),
    };
  }
}

export function getLatestRosterSnapshotForSeason(
  uploads: RosterUploadRecord[],
  season: string
) {
  return getLatestRosterUploadForSeason(uploads, season)?.snapshot || null;
}

export function getLatestRosterUploadForSeason(
  uploads: RosterUploadRecord[],
  season: string
) {
  const targetSeason = String(season || "").trim();
  if (!targetSeason) return null;

  const candidates: Array<{ upload: RosterUploadRecord; snapshot: ReturnType<typeof parseRosterSnapshot> }> = [];
  for (const upload of [...uploads].sort((a, b) =>
    String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || ""))
  )) {
    // 학기 기록 스냅샷은 시즌 로스터가 아님
    if (isTermStatRecord(upload.filename)) continue;

    const snapshot = parseRosterSnapshot(
      upload.players_snapshot,
      inferRosterSnapshotSeasons(upload.filename, upload.source)
    );

    if (snapshot.players.length === 0) continue;
    if (!snapshot.seasons.includes(targetSeason)) continue;

    candidates.push({ upload, snapshot });
  }

  const latest = candidates[0];
  if (!latest || !getRosterUploadTerm(latest.upload)) return latest || null;

  // 학기별(Spring/Fall…) 로스터가 올라온 시즌: 학기마다 최신 명단을 합쳐 시즌 전체 명단으로 사용.
  // 게이팅 기준 시각은 가장 이른 학기 로스터 업로드 시각 → 봄학기 경기가 가을 명단 업로드로 사라지지 않음
  const latestByTerm = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const term = getRosterUploadTerm(candidate.upload);
    if (!term) break; // 학기 미지정 전체 명단보다 오래된 업로드는 사용하지 않음
    if (!latestByTerm.has(term)) latestByTerm.set(term, candidate);
  }

  const merged = Array.from(latestByTerm.values());
  if (merged.length === 1) return merged[0];

  const players = new Map<string, RosterSnapshotPlayer>();
  for (const { snapshot } of merged) {
    for (const player of snapshot.players) {
      const key = buildPlayerIdentityKey(player.name, player.number);
      if (!players.has(key)) players.set(key, player);
    }
  }
  const earliest = merged.reduce((min, entry) =>
    String(entry.upload.uploaded_at || "") < String(min.upload.uploaded_at || "") ? entry : min
  );

  return {
    upload: earliest.upload,
    snapshot: { players: Array.from(players.values()), seasons: [targetSeason] },
  };
}
