export type RosterSnapshotPlayer = {
  number: number;
  name: string;
  position?: string;
  is_pitcher?: boolean;
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
