/**
 * 조회 함수 (블룸버그의 BDP / BDH 방식).
 *
 *   point(target, code, season)            값 하나
 *   history(target, code, {from, to, by})  시즌별 또는 경기별 추이
 *   rank(code, season, {minPa, minIp})     순위표
 *
 * 집계 규칙은 이 파일 안에서만 적용한다. 화면은 여기서 나온 값을 보여 주기만 한다.
 *  1. 같은 선수·시즌에 경기별 행이 있으면 요약 행은 뺀다          (lib/statRows.ts)
 *  2. 출루율 분모는 행마다 정한 뒤 더한다                          (lib/statRows.ts, lib/statFormulas.ts)
 *  3. 이닝은 아웃 수로 바꿔 더한다                                  (lib/statFormulas.ts sumInnings)
 *  4. 같은 (배번, 이름)의 중복 선수 레코드는 한 사람으로 합친다    (lib/playerIdentity.ts)
 *  5. 범위 "roster"(기본): 시즌 명단이 올라와 있으면 명단에 있는 선수의, 명단 업로드 이후 경기만 센다.
 *     대시보드와 /records가 쓰는 규칙이다. 범위 "all"은 5번을 적용하지 않는다(콘솔·AI 선수 분석과 같은 기준).
 *
 * DB에는 읽기만 한다.
 */
import { filterRecordsForSeason, isCareerSeason } from "@/lib/careerStats";
import { buildPlayerIdentityKey } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason, type RosterUploadRecord } from "@/lib/rosterSnapshot";
import { sortSeasons } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { parseIP } from "@/lib/statFormatting";
import { sumInnings } from "@/lib/statFormulas";
import { selectEffectiveBattingRows, selectEffectiveStatRows } from "@/lib/statRows";
import {
  EMPTY_BATTING,
  EMPTY_PITCHING,
  computeMetric,
  displayMetric,
  requireMetric,
  type BattingTotals,
  type MetricDef,
  type MetricKind,
  type MetricTotals,
  type PitchingTotals,
} from "@/lib/metrics";

// ── 자료형 ───────────────────────────────────────────────────────────────────
export type PlayerRow = { id: number; name: string; number: number | null; is_pitcher?: boolean | null };

type Countable = number | null | undefined;

export type StatRowBase = {
  id?: number;
  player_id: number;
  season?: string | null;
  game_id?: number | string | null;
};

export type BattingRow = StatRowBase & {
  pa?: Countable; ab?: Countable; runs?: Countable; hits?: Countable; doubles?: Countable; triples?: Countable;
  hr?: Countable; rbi?: Countable; bb?: Countable; hbp?: Countable; so?: Countable; sb?: Countable;
  sf?: number | null;
};

export type PitchingRow = StatRowBase & {
  w?: Countable; l?: Countable; sv?: Countable; hld?: Countable; ip?: number | string | null; ha?: Countable;
  runs_allowed?: Countable; er?: Countable; bb?: Countable; hbp?: Countable; so?: Countable; hr_allowed?: Countable;
};

export type GameRow = {
  id: number | string;
  season?: string | null;
  created_at?: string | null;
  date?: string | null;
  opponent?: string | null;
};

/** 조회 함수가 읽는 원본 행 묶음. 테스트는 이 형태의 fixture를 그대로 넣는다. */
export type MetricDataset = {
  players: PlayerRow[];
  batting: BattingRow[];
  pitching: PitchingRow[];
  games: GameRow[];
  rosterUploads: RosterUploadRecord[];
  /** 공식 기록이 올라와 열린 시즌 (lib/seasonVisibility.ts) */
  activatedSeasons: string[];
  /** 아직 잠겨 있어 집계에서 빼는 시즌 */
  lockedSeasons: string[];
};

export type MetricTarget = { player: number | string } | { team: true };
export type QueryScope = "roster" | "all";
export type QueryOptions = { scope?: QueryScope };

export type MetricPlayer = { id: number; number: number | null; name: string };

export type MetricLine<T extends MetricTotals = MetricTotals> = {
  /** 집계에 들어온 순서 (기존 화면의 동률 정렬 순서를 지키는 데 쓴다) */
  seq: number;
  identityKey: string;
  /** 같은 사람의 레코드가 여럿이면 가장 최근(id가 큰) 레코드 */
  player: MetricPlayer;
  totals: T;
};

export type MetricPoint = {
  code: string;
  season: string;
  value: number | null;
  /** 화면 표기 ("0.333", "46.2", "---") */
  display: string;
  totals: MetricTotals | null;
};

export type RankEntry = MetricPoint & {
  /** 공동 순위는 같은 번호 (1, 2, 2, 4). 규정 미달이거나 값이 없으면 null */
  rank: number | null;
  seq: number;
  player: MetricPlayer;
  /** 규정 타석·이닝을 채웠는지 */
  qualified: boolean;
};

export type RankResult = {
  code: string;
  season: string;
  kind: MetricKind;
  minPa: number;
  minIp: number;
  entries: RankEntry[];
  /** 팀 전체 값 (선수 기록을 모두 더해 계산) */
  team: MetricPoint;
};

export type HistoryItem = MetricPoint & {
  by: "game" | "season";
  /** 시즌 또는 경기 id */
  key: string;
  date: string | null;
  opponent: string | null;
};

export type HistoryOptions = QueryOptions & { from?: string; to?: string; by?: "game" | "season" };
export type RankOptions = QueryOptions & { minPa?: number; minIp?: number };

// ── 합산 ─────────────────────────────────────────────────────────────────────
const n = (value: Countable) => Number(value) || 0;
const hasGame = (row: StatRowBase) => row.game_id !== null && row.game_id !== undefined;

type EffectiveBattingRow = BattingRow & { obp_den: number };

export function sumBattingRows(rows: EffectiveBattingRow[]): BattingTotals {
  const totals: BattingTotals = { ...EMPTY_BATTING };
  for (const row of rows) {
    totals.g += hasGame(row) ? 1 : 0;
    totals.pa += n(row.pa);
    totals.ab += n(row.ab);
    totals.runs += n(row.runs);
    totals.hits += n(row.hits);
    totals.doubles += n(row.doubles);
    totals.triples += n(row.triples);
    totals.hr += n(row.hr);
    totals.rbi += n(row.rbi);
    totals.bb += n(row.bb);
    totals.hbp += n(row.hbp);
    totals.so += n(row.so);
    totals.sb += n(row.sb);
    totals.obp_den += row.obp_den;
  }
  return totals;
}

export function sumPitchingRows(rows: PitchingRow[]): PitchingTotals {
  const totals: PitchingTotals = { ...EMPTY_PITCHING };
  for (const row of rows) {
    totals.g += hasGame(row) ? 1 : 0;
    totals.w += n(row.w);
    totals.l += n(row.l);
    totals.sv += n(row.sv);
    totals.hld += n(row.hld);
    totals.ha += n(row.ha);
    totals.runs_allowed += n(row.runs_allowed);
    totals.er += n(row.er);
    totals.bb += n(row.bb);
    totals.hbp += n(row.hbp);
    totals.so += n(row.so);
    totals.hr_allowed += n(row.hr_allowed);
  }
  totals.innings = sumInnings(rows.map((row) => row.ip));
  return totals;
}

function addBatting(a: BattingTotals, b: BattingTotals): BattingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_BATTING) as Array<keyof BattingTotals>) out[key] = a[key] + b[key];
  return out;
}

function addPitching(a: PitchingTotals, b: PitchingTotals): PitchingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_PITCHING) as Array<keyof PitchingTotals>) out[key] = a[key] + b[key];
  // 이닝은 소수끼리 더하지 않고 아웃 수로 더한다
  out.innings = (Math.round(a.innings * 3) + Math.round(b.innings * 3)) / 3;
  return out;
}

export function hasBattingActivity(totals: BattingTotals): boolean {
  return [totals.pa, totals.ab, totals.runs, totals.hits, totals.doubles, totals.triples, totals.hr, totals.rbi, totals.bb, totals.hbp, totals.so, totals.sb].some((value) => value > 0);
}

export function hasPitchingActivity(totals: PitchingTotals): boolean {
  return [totals.w, totals.l, totals.sv, totals.hld, totals.innings, totals.ha, totals.runs_allowed, totals.er, totals.bb, totals.hbp, totals.so, totals.hr_allowed].some((value) => value > 0);
}

function toPoint(code: string, season: string, totals: MetricTotals | null): MetricPoint {
  if (!totals) return { code, season, value: null, display: displayMetric(code, kindEmpty(code)), totals: null };
  return { code, season, value: computeMetric(code, totals), display: displayMetric(code, totals), totals };
}

/** 기록이 없을 때의 표기를 얻기 위한 빈 합계 (비율은 "---", 횟수는 "0") */
function kindEmpty(code: string): MetricTotals {
  return requireMetric(code).kind === "batting" ? EMPTY_BATTING : EMPTY_PITCHING;
}

// ── 조회 ─────────────────────────────────────────────────────────────────────
type SeasonSlice = {
  batting: Array<MetricLine<BattingTotals> & { rows: EffectiveBattingRow[] }>;
  pitching: Array<MetricLine<PitchingTotals> & { rows: PitchingRow[] }>;
};

export type MetricQuery = ReturnType<typeof createMetricQuery>;

export function createMetricQuery(dataset: MetricDataset) {
  const playerById = new Map(dataset.players.map((player) => [player.id, player]));
  const allBatting = selectEffectiveBattingRows(dataset.batting) as EffectiveBattingRow[];
  const allPitching = selectEffectiveStatRows(dataset.pitching);
  const cache = new Map<string, SeasonSlice>();

  function slice(season: string, scope: QueryScope): SeasonSlice {
    const cacheKey = `${scope}|${season}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const locked = isLockedSeason(season, dataset.activatedSeasons);
    const batting = locked ? [] : filterRecordsForSeason(allBatting, season, { lockedSeasons: dataset.lockedSeasons });
    const pitching = locked ? [] : filterRecordsForSeason(allPitching, season, { lockedSeasons: dataset.lockedSeasons });

    // 규칙 5: 시즌 명단 기준 (대시보드·/records와 같은 순서로 적용한다)
    const rosterUpload = locked || scope === "all" ? null : getLatestRosterUploadForSeason(dataset.rosterUploads, season);
    const rosterUploadedAt = rosterUpload?.upload?.uploaded_at ? new Date(rosterUpload.upload.uploaded_at).getTime() : null;
    const validGameIds = new Set(
      dataset.games
        .filter((game) => game.season === season)
        .filter((game) => {
          if (!rosterUploadedAt) return true;
          if (!game.created_at) return false;
          return new Date(game.created_at).getTime() >= rosterUploadedAt;
        })
        .map((game) => game.id)
    );
    const rosterKeys = new Set(
      (rosterUpload?.snapshot?.players || []).map((player) => buildPlayerIdentityKey(player.name, player.number))
    );
    const gate = Boolean(rosterUpload);

    const group = <R extends StatRowBase>(rows: R[]) => {
      const byIdentity = new Map<string, { seq: number; identityKey: string; player: MetricPlayer; rows: R[] }>();
      for (const row of rows) {
        if (gate && (!row.game_id || !validGameIds.has(row.game_id))) continue;
        const player = playerById.get(row.player_id);
        if (!player) continue;
        const identityKey = buildPlayerIdentityKey(player.name, player.number);
        if (rosterKeys.size > 0 && !rosterKeys.has(identityKey)) continue;
        const entry = byIdentity.get(identityKey);
        if (entry) {
          if (player.id > entry.player.id) entry.player = { id: player.id, number: player.number, name: player.name };
          entry.rows.push(row);
        } else {
          byIdentity.set(identityKey, {
            seq: byIdentity.size,
            identityKey,
            player: { id: player.id, number: player.number, name: player.name },
            rows: [row],
          });
        }
      }
      return Array.from(byIdentity.values());
    };

    const result: SeasonSlice = {
      batting: group(batting)
        .map((entry) => ({ ...entry, totals: sumBattingRows(entry.rows) }))
        .filter((line) => hasBattingActivity(line.totals)),
      pitching: group(pitching)
        .map((entry) => ({ ...entry, totals: sumPitchingRows(entry.rows) }))
        .filter((line) => hasPitchingActivity(line.totals)),
    };
    cache.set(cacheKey, result);
    return result;
  }

  function linesFor(kind: MetricKind, season: string, scope: QueryScope) {
    const s = slice(season, scope);
    return kind === "batting" ? s.batting : s.pitching;
  }

  function identityOf(playerId: number | string): string | null {
    const player = playerById.get(Number(playerId));
    return player ? buildPlayerIdentityKey(player.name, player.number) : null;
  }

  /** 시즌 합계. 팀은 선수 기록을 모두 더한 값이다. 기록이 없으면 null. */
  function totals(target: MetricTarget, kind: MetricKind, season: string, options: QueryOptions = {}): MetricTotals | null {
    const lines = linesFor(kind, season, options.scope ?? "roster");
    if ("team" in target) {
      if (lines.length === 0) return null;
      return kind === "batting"
        ? (lines as Array<MetricLine<BattingTotals>>).map((line) => line.totals).reduce(addBatting)
        : (lines as Array<MetricLine<PitchingTotals>>).map((line) => line.totals).reduce(addPitching);
    }
    const identityKey = identityOf(target.player);
    return lines.find((line) => line.identityKey === identityKey)?.totals ?? null;
  }

  function point(target: MetricTarget, code: string, season: string, options: QueryOptions = {}): MetricPoint {
    const metric = requireMetric(code);
    return toPoint(metric.code, season, totals(target, metric.kind, season, options));
  }

  /** 기록이 있는 시즌 (오래된 순). 잠긴 시즌과 "Career" 행은 뺀다. */
  function seasons(): string[] {
    return sortSeasons([...allBatting.map((row) => row.season), ...allPitching.map((row) => row.season)])
      .filter((season) => !isCareerSeason(season) && !dataset.lockedSeasons.includes(season))
      .reverse();
  }

  function rank(code: string, season: string, options: RankOptions = {}): RankResult {
    const metric = requireMetric(code);
    const minPa = Math.max(0, Number(options.minPa) || 0);
    const minIp = Math.max(0, Number(options.minIp) || 0);
    const lines = linesFor(metric.kind, season, options.scope ?? "roster");

    const entries: RankEntry[] = lines.map((line) => {
      const qualified =
        metric.kind === "batting"
          ? (line.totals as BattingTotals).pa >= minPa
          : (line.totals as PitchingTotals).innings + 1e-9 >= minIp;
      return { ...toPoint(metric.code, season, line.totals), rank: null, seq: line.seq, player: line.player, qualified };
    });

    // 순위는 화면에 보이는 자릿수로 매긴다 — 같은 숫자로 보이면 공동 순위
    const sortValue = (entry: RankEntry) => (metric.type === "rate" && entry.value !== null ? Number(entry.display) : entry.value);
    const direction = metric.higherIsBetter === false ? 1 : -1;
    const ranked = (entry: RankEntry) => entry.qualified && sortValue(entry) !== null;
    entries.sort((a, b) => {
      if (ranked(a) !== ranked(b)) return ranked(a) ? -1 : 1;
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va !== null && vb !== null && va !== vb) return (va - vb) * direction;
      if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
      return a.seq - b.seq;
    });
    let previous: number | null = null;
    entries.forEach((entry, index) => {
      if (!ranked(entry)) return;
      const value = sortValue(entry);
      entry.rank = index > 0 && value === previous ? entries[index - 1].rank : index + 1;
      previous = value;
    });

    return { code: metric.code, season, kind: metric.kind, minPa, minIp, entries, team: point({ team: true }, metric.code, season, options) };
  }

  function history(target: MetricTarget, code: string, options: HistoryOptions = {}): HistoryItem[] {
    const metric = requireMetric(code);
    const by = options.by ?? "season";
    const scope = options.scope ?? "roster";
    const isSeasonBound = (value: string | undefined): value is string => Boolean(value && /^20\d{2}$/.test(value));
    const inSeasonRange = (season: string) =>
      (!isSeasonBound(options.from) || season >= options.from) && (!isSeasonBound(options.to) || season <= options.to);
    const range = seasons().filter(inSeasonRange);

    if (by === "season") {
      return range
        .map((season) => ({ ...point(target, metric.code, season, { scope }), by: "season" as const, key: season, date: null, opponent: null }))
        .filter((item) => item.totals !== null);
    }

    const gameById = new Map(dataset.games.map((game) => [String(game.id), game]));
    const identityKey = "team" in target ? null : identityOf(target.player);
    const items: Array<HistoryItem & { order: string }> = [];
    for (const season of range) {
      const lines = linesFor(metric.kind, season, scope).filter((line) => identityKey === null || line.identityKey === identityKey);
      const rowsByGame = new Map<string, Array<EffectiveBattingRow | PitchingRow>>();
      for (const line of lines) {
        // 같은 사람의 레코드가 여럿이고 같은 경기에 기록이 겹치면 더 완전한 쪽(타석·이닝이 많은 쪽) 하나만 쓴다
        const perGame = new Map<string, EffectiveBattingRow | PitchingRow>();
        for (const row of line.rows) {
          if (!hasGame(row)) continue;
          const key = String(row.game_id);
          const prev = perGame.get(key);
          const size = (r: EffectiveBattingRow | PitchingRow) =>
            metric.kind === "batting" ? n((r as BattingRow).pa) : parseIP((r as PitchingRow).ip);
          if (!prev || size(row) >= size(prev)) perGame.set(key, row);
        }
        for (const [key, row] of perGame) rowsByGame.set(key, [...(rowsByGame.get(key) ?? []), row]);
      }
      for (const [key, rows] of rowsByGame) {
        const game = gameById.get(key);
        const date = game?.date ?? null;
        const isDateBound = (value: string | undefined): value is string => Boolean(value && !isSeasonBound(value));
        if (date && isDateBound(options.from) && date < options.from) continue;
        if (date && isDateBound(options.to) && date > options.to) continue;
        const gameTotals =
          metric.kind === "batting" ? sumBattingRows(rows as EffectiveBattingRow[]) : sumPitchingRows(rows as PitchingRow[]);
        items.push({
          ...toPoint(metric.code, season, gameTotals),
          by: "game",
          key,
          date,
          opponent: game?.opponent ?? null,
          order: `${date ?? ""}|${game?.created_at ?? ""}|${key.padStart(12, "0")}`,
        });
      }
    }
    return items
      .sort((a, b) => a.order.localeCompare(b.order))
      .map((item) => {
        const { order, ...rest } = item;
        void order;
        return rest;
      });
  }

  return { point, history, rank, totals, seasons };
}

// ── DB에서 읽기 ───────────────────────────────────────────────────────────────
/** 이 모듈이 쓰는 Supabase 클라이언트의 최소 형태 (읽기만 한다) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

/**
 * 조회에 필요한 원본 행을 한 번에 읽는다. 화면이 시즌 목록을 만들 때 쓰는 visibility도 함께 돌려준다
 * (같은 표를 두 번 읽지 않도록).
 */
export async function loadMetricDataset(supabase: SupabaseLike, options: { preferredSeason?: string | null } = {}) {
  const [players, batting, pitching, games, rosterUploads] = await Promise.all([
    supabase.from("players").select("*").order("number"),
    supabase.from("batting_stats").select("*"),
    supabase.from("pitching_stats").select("*"),
    supabase.from("games").select("id,season,created_at,date,opponent"),
    supabase.from("roster_uploads").select("filename,players_snapshot,source,uploaded_at").order("uploaded_at", { ascending: false }),
  ]);
  for (const result of [players, batting, pitching]) {
    if (result.error) throw new Error(result.error.message);
  }

  const battingRows = (batting.data || []) as BattingRow[];
  const pitchingRows = (pitching.data || []) as PitchingRow[];
  // 화면과 같은 값을 넘긴다: 이중 집계를 뺀 행의 시즌 + 선호 시즌
  const seasonValues = [
    ...selectEffectiveStatRows(battingRows).map((row) => row.season),
    ...selectEffectiveStatRows(pitchingRows).map((row) => row.season),
  ];
  const visibility = await getSeasonVisibility(supabase, [...seasonValues, options.preferredSeason], options.preferredSeason, "2025");

  const dataset: MetricDataset = {
    players: (players.data || []) as PlayerRow[],
    batting: battingRows,
    pitching: pitchingRows,
    games: (games.data || []) as GameRow[],
    rosterUploads: (rosterUploads.data || []) as RosterUploadRecord[],
    activatedSeasons: visibility.activatedSeasons,
    lockedSeasons: visibility.lockedSeasons,
  };
  return { dataset, visibility, seasonValues };
}

// ── 한 줄 호출 ────────────────────────────────────────────────────────────────
// 서버에서 값 하나만 필요할 때 쓴다. 여러 값을 뽑을 때는 loadMetricDataset → createMetricQuery로 한 번만 읽는다.
async function defaultQuery() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return createMetricQuery((await loadMetricDataset(supabase)).dataset);
}

export async function point(target: MetricTarget, code: string, season: string, options?: QueryOptions) {
  return (await defaultQuery()).point(target, code, season, options);
}

export async function history(target: MetricTarget, code: string, options?: HistoryOptions) {
  return (await defaultQuery()).history(target, code, options);
}

export async function rank(code: string, season: string, options?: RankOptions) {
  return (await defaultQuery()).rank(code, season, options);
}

export type { MetricDef };
