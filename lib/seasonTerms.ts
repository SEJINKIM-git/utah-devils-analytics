import { buildPlayerIdentityKey, normalizePlayerName } from "@/lib/playerIdentity";
import { OFFICIAL_TERM_SNAPSHOTS } from "@/lib/officialTermSnapshots";
import { parseIP } from "@/lib/statFormatting";

/*
 * 학기(Spring / Summer / Fall) 단위 로스터·기록 분리
 *
 * 야구부 선수단은 학기마다 바뀌므로 시즌(연도) 안에서 학기별로 명단과 기록을 나눠 본다.
 * 데이터 출처 우선순위:
 *  1. 공식 시즌 누적 파일의 학기 시트("25 Spring", "2024 Fall" …) → `[season-term]` 스냅샷
 *  2. 학기를 지정해 올린 로스터 파일(파일명 또는 업로드 화면에서 학기 선택)
 *  3. 경기별 기록(경기 날짜 월 기준: 1~6월 Spring, 7~8월 Summer, 9~12월 Fall)
 */

export const SEASON_TERMS = ["Spring", "Summer", "Fall"] as const;
export type SeasonTerm = (typeof SEASON_TERMS)[number];

export const TERM_STAT_PREFIX = "[season-term]";

const TERM_ALIASES: Record<SeasonTerm, string[]> = {
  Spring: ["spring", "봄", "1학기", "상반기"],
  Summer: ["summer", "여름", "하계"],
  Fall: ["fall", "autumn", "가을", "2학기", "하반기"],
};

export function normalizeTerm(value: unknown): SeasonTerm | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  for (const term of SEASON_TERMS) {
    if (TERM_ALIASES[term].includes(raw)) return term;
  }
  return null;
}

export function detectTermFromText(value: unknown): SeasonTerm | null {
  const text = String(value ?? "").toLowerCase();
  if (!text) return null;
  for (const term of SEASON_TERMS) {
    if (TERM_ALIASES[term].some((alias) => text.includes(alias))) return term;
  }
  return null;
}

export function getTermForDate(date: string | null | undefined): SeasonTerm | null {
  const match = String(date || "").match(/^\d{4}-(\d{2})/);
  if (!match) return null;
  const month = Number(match[1]);
  if (month >= 1 && month <= 6) return "Spring";
  if (month >= 7 && month <= 8) return "Summer";
  if (month >= 9 && month <= 12) return "Fall";
  return null;
}

export function getTermLabel(term: SeasonTerm, lang: "ko" | "en" = "ko") {
  if (lang === "en") return term;
  return { Spring: "Spring (봄학기)", Summer: "Summer (여름)", Fall: "Fall (가을학기)" }[term];
}

/**
 * 학기 요약 시트 이름 판별: "25 Spring", "2024 Fall", "23 Summer", "Spring".
 * 경기별 상세 시트("25 Spring (타자)")는 제외한다.
 */
export function parseTermSheetName(sheetName: string, fallbackSeason?: string | null) {
  const trimmed = String(sheetName || "").trim();
  if (!trimmed || /[()]/.test(trimmed)) return null;

  const match = trimmed.match(/^(?:(20\d{2}|\d{2})\s*[-_.]?\s*)?([a-z가-힣0-9]+)$/i);
  if (!match) return null;

  const term = normalizeTerm(match[2]);
  if (!term) return null;

  const yearPart = match[1];
  const season = yearPart ? (yearPart.length === 2 ? `20${yearPart}` : yearPart) : fallbackSeason || null;
  if (!season) return null;

  return { season, term };
}

/* ── 학기 스냅샷 (공식 파일 학기 시트에서 추출) ─────────────────────────── */

export type TermBattingLine = {
  number: number;
  name: string;
  g: number;
  pa: number;
  ab: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
};

export type TermPitchingLine = {
  number: number;
  name: string;
  g: number;
  w: number;
  l: number;
  sv: number;
  hld: number;
  ip: number;
  ha: number;
  runs_allowed: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr_allowed: number;
};

export type TermRosterPlayer = { number: number; name: string };

export type TermStatSnapshot = {
  kind: "season-term";
  season: string;
  seasons: string[];
  term: SeasonTerm;
  sourceFile: string;
  players: TermRosterPlayer[];
  batting: TermBattingLine[];
  pitching: TermPitchingLine[];
};

export function buildTermStatFilename(season: string, term: SeasonTerm, fileName: string) {
  return `${TERM_STAT_PREFIX} ${season} ${term} :: ${fileName}`;
}

export function isTermStatRecord(filename: string | null | undefined) {
  return String(filename || "").startsWith(TERM_STAT_PREFIX);
}

/* ── 저장된 업로드 기록에서 학기 정보 읽기 ─────────────────────────────── */

export type TermUploadRow = {
  filename?: string | null;
  players_snapshot?: string | null;
  source?: string | null;
  uploaded_at?: string | null;
};

function safeParse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseTermStatSnapshot(row: TermUploadRow): TermStatSnapshot | null {
  if (!isTermStatRecord(row.filename)) return null;
  const parsed = safeParse(row.players_snapshot);
  if (!parsed || parsed.kind !== "season-term") return null;
  const term = normalizeTerm(parsed.term);
  const season = String(parsed.season || "").trim();
  if (!term || !season) return null;

  return {
    kind: "season-term",
    season,
    seasons: [season],
    term,
    sourceFile: String(parsed.sourceFile || ""),
    players: Array.isArray(parsed.players) ? (parsed.players as TermRosterPlayer[]) : [],
    batting: Array.isArray(parsed.batting) ? (parsed.batting as TermBattingLine[]) : [],
    pitching: Array.isArray(parsed.pitching) ? (parsed.pitching as TermPitchingLine[]) : [],
  };
}

/** 일반 로스터 업로드의 학기: 저장된 term 값 → 파일명 순으로 판별 */
export function getRosterUploadTerm(row: TermUploadRow): SeasonTerm | null {
  if (isTermStatRecord(row.filename)) return null;
  const parsed = safeParse(row.players_snapshot);
  return normalizeTerm(parsed?.term) || detectTermFromText(row.filename);
}

/* ── 시즌 → 학기별 로스터/기록 계산 ───────────────────────────────────── */

type BasicPlayer = { id: number; name: string; number: number | null };
type StatRow = {
  player_id: number;
  season?: string | null;
  game_id?: number | null;
  pa?: number | null;
  ip?: number | string | null;
  [field: string]: unknown;
};
type GameRow = { id: number; season?: string | null; date?: string | null; created_at?: string | null };

export type TermRosterUpload = {
  upload: TermUploadRow;
  term: SeasonTerm;
  players: TermRosterPlayer[];
};

export type TermPlayerEntry<P extends BasicPlayer> = {
  key: string;
  number: number;
  name: string;
  player: P | null;
};

export type SeasonTermView<P extends BasicPlayer> = {
  term: SeasonTerm;
  source: "official" | "roster" | "games";
  roster: TermPlayerEntry<P>[];
  batting: Array<TermBattingLine & { key: string; player: P | null }>;
  pitching: Array<TermPitchingLine & { key: string; player: P | null }>;
  gameIds: Set<number>;
};

function sortByUploadedDesc<T extends TermUploadRow>(rows: T[]) {
  return [...rows].sort((a, b) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")));
}

function uploadIncludesSeason(row: TermUploadRow, season: string) {
  const parsed = safeParse(row.players_snapshot);
  const seasons = [
    parsed?.season,
    ...(Array.isArray(parsed?.seasons) ? (parsed?.seasons as unknown[]) : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (seasons.length > 0) return seasons.includes(season);
  return String(row.filename || "").includes(season);
}

function readUploadPlayers(row: TermUploadRow): TermRosterPlayer[] {
  const raw = (() => {
    try {
      return JSON.parse(String(row.players_snapshot || "")) as unknown;
    } catch {
      return null;
    }
  })();
  const list = Array.isArray(raw) ? raw : (raw as { players?: unknown } | null)?.players;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      const name = String((entry as { name?: unknown })?.name || "").trim();
      const number = Number((entry as { number?: unknown })?.number);
      return name ? { name, number: Number.isFinite(number) ? number : 0 } : null;
    })
    .filter((entry): entry is TermRosterPlayer => entry !== null);
}

/** 해당 시즌에서 학기별로 가장 최근에 올린 로스터 업로드 */
export function getLatestTermRosterUploads(uploads: TermUploadRow[], season: string) {
  const byTerm = new Map<SeasonTerm, TermRosterUpload>();
  for (const upload of sortByUploadedDesc(uploads)) {
    if (isTermStatRecord(upload.filename)) continue;
    const term = getRosterUploadTerm(upload);
    if (!term || byTerm.has(term)) continue;
    if (!uploadIncludesSeason(upload, season)) continue;
    const players = readUploadPlayers(upload);
    if (players.length === 0) continue;
    byTerm.set(term, { upload, term, players });
  }
  return byTerm;
}

function getLatestTermStatSnapshots(uploads: TermUploadRow[], season: string) {
  const byTerm = new Map<SeasonTerm, TermStatSnapshot>();
  for (const upload of sortByUploadedDesc(uploads)) {
    const snapshot = parseTermStatSnapshot(upload);
    if (!snapshot || snapshot.season !== season || byTerm.has(snapshot.term)) continue;
    byTerm.set(snapshot.term, snapshot);
  }
  // 업로드된 학기 기록이 없는 학기는 코드에 포함된 공식 파일 데이터로 채움
  for (const snapshot of OFFICIAL_TERM_SNAPSHOTS) {
    if (snapshot.season === season && !byTerm.has(snapshot.term)) byTerm.set(snapshot.term, snapshot);
  }
  return byTerm;
}

function createPlayerMatcher<P extends BasicPlayer>(players: P[]) {
  const newestFirst = [...players].sort((a, b) => b.id - a.id);
  return (name: string, number: number) => {
    const exactKey = buildPlayerIdentityKey(name, number);
    const normalized = normalizePlayerName(name);
    return (
      newestFirst.find((player) => buildPlayerIdentityKey(player.name, player.number) === exactKey) ||
      newestFirst.find((player) => normalizePlayerName(player.name) === normalized) ||
      (number ? newestFirst.find((player) => player.number === number) : undefined) ||
      null
    );
  };
}

const EMPTY_BATTING = { g: 0, pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0 };
const EMPTY_PITCHING = { g: 0, w: 0, l: 0, sv: 0, hld: 0, ip: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, hbp: 0, so: 0, hr_allowed: 0 };

function aggregateGameRows<P extends BasicPlayer>(
  rows: StatRow[],
  kind: "batting" | "pitching",
  playerById: Map<number, P>
) {
  // 같은 선수·같은 경기 중복 업로드는 더 완전한 기록 하나만 사용
  const best = new Map<string, StatRow>();
  for (const row of rows) {
    const player = playerById.get(row.player_id);
    if (!player || row.game_id == null) continue;
    const dedupeKey = `${buildPlayerIdentityKey(player.name, player.number)}|${row.game_id}`;
    const prev = best.get(dedupeKey);
    const size = kind === "batting" ? Number(row.pa) || 0 : parseIP(row.ip);
    const prevSize = prev ? (kind === "batting" ? Number(prev.pa) || 0 : parseIP(prev.ip)) : -1;
    if (size >= prevSize) best.set(dedupeKey, row);
  }

  const totals = new Map<string, { number: number; name: string; sums: Record<string, number> }>();
  for (const row of best.values()) {
    const player = playerById.get(row.player_id)!;
    const key = buildPlayerIdentityKey(player.name, player.number);
    const entry =
      totals.get(key) ||
      { number: player.number ?? 0, name: player.name, sums: { ...(kind === "batting" ? EMPTY_BATTING : EMPTY_PITCHING) } };
    const acc = entry.sums;
    acc.g += 1;
    if (kind === "batting") {
      for (const field of ["pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"]) {
        acc[field] += Number(row[field]) || 0;
      }
    } else {
      acc.ip += parseIP(row.ip);
      for (const field of ["w", "l", "sv", "hld", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed"]) {
        acc[field] += Number(row[field]) || 0;
      }
    }
    totals.set(key, entry);
  }
  return Array.from(totals.values()).map(({ number, name, sums }) => ({ number, name, ...sums }));
}

/**
 * 시즌 하나를 학기별로 나눈 로스터/기록.
 * batting/pitching 인자는 해당 시즌의 행만 넘겨도 되고 전체를 넘겨도 된다(시즌으로 다시 거른다).
 */
export function buildSeasonTermViews<P extends BasicPlayer>({
  season,
  uploads,
  players,
  batting,
  pitching,
  games,
}: {
  season: string;
  uploads: TermUploadRow[];
  players: P[];
  batting: StatRow[];
  pitching: StatRow[];
  games: GameRow[];
}): SeasonTermView<P>[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const matchPlayer = createPlayerMatcher(players);
  const snapshots = getLatestTermStatSnapshots(uploads, season);
  const rosterUploads = getLatestTermRosterUploads(uploads, season);

  const gamesById = new Map<number, GameRow>();
  for (const game of games) {
    if (String(game.season || "") === season) gamesById.set(game.id, game);
  }

  const views: SeasonTermView<P>[] = [];

  for (const term of SEASON_TERMS) {
    const snapshot = snapshots.get(term);
    const rosterUpload = rosterUploads.get(term);
    const rosterUploadedAt = rosterUpload?.upload.uploaded_at
      ? new Date(rosterUpload.upload.uploaded_at).getTime()
      : null;

    // 경기 날짜로 학기를 판별 (로스터가 등록된 학기는 로스터 등록 이후 생성된 경기만: 대시보드와 동일한 게이팅)
    const gameIds = new Set<number>();
    for (const game of gamesById.values()) {
      if (getTermForDate(game.date) !== term) continue;
      if (rosterUploadedAt) {
        if (!game.created_at || new Date(game.created_at).getTime() < rosterUploadedAt) continue;
      }
      gameIds.add(game.id);
    }

    let battingLines: Array<TermBattingLine>;
    let pitchingLines: Array<TermPitchingLine>;
    let source: SeasonTermView<P>["source"];

    if (snapshot) {
      battingLines = snapshot.batting;
      pitchingLines = snapshot.pitching.map((line) => ({ ...line, ip: parseIP(line.ip) }));
      source = "official";
    } else {
      const inTerm = (row: StatRow) => String(row.season || "") === season && row.game_id != null && gameIds.has(row.game_id);
      battingLines = aggregateGameRows(batting.filter(inTerm), "batting", playerById) as TermBattingLine[];
      pitchingLines = aggregateGameRows(pitching.filter(inTerm), "pitching", playerById) as TermPitchingLine[];
      source = rosterUpload ? "roster" : "games";
    }

    const rosterSource: TermRosterPlayer[] =
      rosterUpload?.players ||
      snapshot?.players ||
      [...battingLines, ...pitchingLines].map(({ number, name }) => ({ number, name }));

    const rosterMap = new Map<string, TermPlayerEntry<P>>();
    for (const entry of rosterSource) {
      const player = matchPlayer(entry.name, entry.number);
      const key = player ? buildPlayerIdentityKey(player.name, player.number) : buildPlayerIdentityKey(entry.name, entry.number);
      if (rosterMap.has(key)) continue;
      rosterMap.set(key, { key, number: player?.number ?? entry.number, name: player?.name ?? entry.name, player });
    }

    const attach = <L extends { number: number; name: string }>(line: L) => {
      const player = matchPlayer(line.name, line.number);
      const key = player ? buildPlayerIdentityKey(player.name, player.number) : buildPlayerIdentityKey(line.name, line.number);
      return { ...line, key, player };
    };
    // 학기 로스터가 따로 등록돼 있으면 그 명단에 있는 선수 기록만 보여준다
    const onRoster = (line: { key: string }) => !rosterUpload || rosterMap.has(line.key);

    const view: SeasonTermView<P> = {
      term,
      source,
      roster: Array.from(rosterMap.values()).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, "ko")),
      batting: battingLines.map(attach).filter(onRoster),
      pitching: pitchingLines.map(attach).filter(onRoster),
      gameIds,
    };

    if (view.roster.length > 0 || view.batting.length > 0 || view.pitching.length > 0) {
      views.push(view);
    }
  }

  return views;
}

export function hasBattingLineActivity(line: Partial<TermBattingLine>) {
  return ["pa", "ab", "runs", "hits", "hr", "rbi", "bb", "hbp", "so", "sb"].some(
    (field) => Number(line[field as keyof TermBattingLine]) > 0
  );
}

export function hasPitchingLineActivity(line: Partial<TermPitchingLine>) {
  return ["w", "l", "sv", "hld", "ip", "ha", "er", "bb", "so"].some(
    (field) => Number(line[field as keyof TermPitchingLine]) > 0
  );
}
