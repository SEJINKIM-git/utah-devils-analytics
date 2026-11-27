/**
 * 검색 팔레트 해석기 (블룸버그 명령줄의 "대상 + 기능" 문법).
 *
 *   가선수 OBP 2026   → 선수 + 지표 + 시즌
 *   팀 ERA            → 팀 + 지표
 *   OBP / 출루        → 지표 (팀 순위)
 *   가선수 / 7        → 선수
 *   순위 / 일정       → 화면
 *   그 밖의 문장      → AI에게 물어보기
 *
 * 순수 함수다. 선수 목록은 호출하는 쪽이 넘긴다.
 */
import { findMetricByTerm, searchMetrics, type MetricDef } from "@/lib/metrics";
import { SCREENS, type ScreenDef } from "@/lib/command/screens";

export type CommandPlayer = {
  id: number;
  number: number | null;
  name: string;
  /** 검색에 쓰는 이름들 (한글·영문 표기 등). 없으면 name만 쓴다 */
  terms?: string[];
  isPitcher?: boolean;
};

export type CommandIntent =
  | { type: "empty" }
  | { type: "player-metric"; player: CommandPlayer; metric: MetricDef }
  | { type: "team-metric"; metric: MetricDef }
  | { type: "metric"; metric: MetricDef }
  | { type: "player"; player: CommandPlayer }
  | { type: "screen"; screen: ScreenDef }
  | { type: "ask"; question: string };

export type ParsedCommand = {
  raw: string;
  /** 검색어에 들어 있던 시즌 ("2026", "Career"). 없으면 null */
  season: string | null;
  team: boolean;
  metric: MetricDef | null;
  /** 대상·시즌·지표를 뺀 나머지 글자 */
  rest: string;
  metrics: MetricDef[];
  players: CommandPlayer[];
  screens: ScreenDef[];
  /** 문장형 질문이면 그 문장 */
  question: string | null;
  intent: CommandIntent;
};

const TEAM_WORDS = new Set(["팀", "team", "우리팀", "우리 팀"]);
const CAREER_WORDS = new Set(["통산", "career"]);
const QUESTION_HINT = /[?？]|누구|누가|어떻게|어때|왜|얼마|몇|알려|추천|보여|who|what|how|why|which|should/i;

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const squash = (value: string) => norm(value).replace(/\s+/g, "");

export const MAX_METRIC_RESULTS = 5;
export const MAX_PLAYER_RESULTS = 6;
export const MAX_SCREEN_RESULTS = 5;

/** 토큰 묶음에서 지표 하나를 찾는다. 긴 묶음부터 본다("on base" 같은 두 단어 별칭). */
function takeMetric(tokens: string[]): { metric: MetricDef | null; rest: string[] } {
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const metric = findMetricByTerm(tokens.slice(start, start + size).join(" "));
      if (metric) return { metric, rest: [...tokens.slice(0, start), ...tokens.slice(start + size)] };
    }
  }
  return { metric: null, rest: tokens };
}

function matchPlayers(text: string, players: CommandPlayer[]): CommandPlayer[] {
  const needle = squash(text.replace(/^#/, ""));
  if (!needle) return [];
  const byNumber = /^\d{1,3}$/.test(needle) ? players.filter((player) => String(player.number ?? "") === needle) : [];
  const byName = players.filter((player) =>
    [player.name, ...(player.terms ?? [])].some((term) => squash(term).includes(needle))
  );
  const seen = new Set<number>();
  return [...byNumber, ...byName].filter((player) => (seen.has(player.id) ? false : (seen.add(player.id), true)));
}

function matchScreens(text: string): ScreenDef[] {
  const needle = norm(text);
  if (!needle) return [];
  const score = (screen: ScreenDef) => {
    const terms = [screen.labelKo, screen.labelEn, ...screen.keywords].map(norm);
    if (terms.includes(needle)) return 0;
    if (terms.some((term) => term.startsWith(needle))) return 1;
    if (terms.some((term) => term.includes(needle))) return 2;
    return -1;
  };
  return SCREENS.map((screen, index) => ({ screen, index, rank: score(screen) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.screen);
}

export function parseCommand(input: string, context: { players: CommandPlayer[] }): ParsedCommand {
  const raw = String(input ?? "");
  const text = norm(raw);
  const empty: ParsedCommand = {
    raw, season: null, team: false, metric: null, rest: "", metrics: [], players: [], screens: [], question: null,
    intent: { type: "empty" },
  };
  if (!text) return empty;

  let tokens = text.split(" ");

  // 시즌
  let season: string | null = null;
  tokens = tokens.filter((token) => {
    if (season === null && /^20\d{2}$/.test(token)) { season = token; return false; }
    if (season === null && CAREER_WORDS.has(token)) { season = "Career"; return false; }
    return true;
  });

  // 대상: 팀
  let team = false;
  tokens = tokens.filter((token) => {
    if (!team && TEAM_WORDS.has(token)) { team = true; return false; }
    return true;
  });

  // 기능: 지표
  const taken = takeMetric(tokens);
  const metric = taken.metric;
  const rest = taken.rest.join(" ");

  const players = rest ? matchPlayers(rest, context.players).slice(0, MAX_PLAYER_RESULTS) : [];
  // 정확히 일치한 지표가 먼저, 그 뒤에 이름·별칭에 검색어가 들어 있는 지표 ("삼진" → 삼진, 탈삼진, 5이닝당 탈삼진)
  const partial = searchMetrics(tokens.join(" ")).filter((candidate) => candidate !== metric);
  const metrics = [...(metric ? [metric] : []), ...partial].slice(0, MAX_METRIC_RESULTS);
  const screens = matchScreens(metric ? rest : text).slice(0, MAX_SCREEN_RESULTS);

  const wordCount = text.split(" ").length;
  const understood = Boolean(metric) || players.length > 0 || screens.length > 0 || metrics.length > 0;
  const looksLikeQuestion = QUESTION_HINT.test(raw) || (!understood && wordCount >= 1) || (wordCount >= 4 && !metric);
  const question = looksLikeQuestion ? raw.trim() : null;

  let intent: CommandIntent;
  if (metric && players.length > 0) intent = { type: "player-metric", player: players[0], metric };
  else if (metric && team) intent = { type: "team-metric", metric };
  else if (metric && !rest) intent = { type: "metric", metric };
  else if (!metric && players.length > 0 && !QUESTION_HINT.test(raw)) intent = { type: "player", player: players[0] };
  else if (!metric && screens.length > 0 && !QUESTION_HINT.test(raw)) intent = { type: "screen", screen: screens[0] };
  else if (metric && !QUESTION_HINT.test(raw) && wordCount <= 3) intent = { type: "metric", metric };
  else intent = { type: "ask", question: raw.trim() };

  return { raw, season, team, metric, rest, metrics, players, screens, question, intent };
}

// ── 결과 목록 ─────────────────────────────────────────────────────────────────
export type CommandAction =
  /** 지표 설명 시트를 연다. player가 없으면 팀 기준 */
  | { type: "metric"; code: string; playerId?: number; season?: string }
  | { type: "navigate"; href: string };

export type CommandItem = {
  id: string;
  group: "metric" | "player" | "screen" | "ask";
  title: string;
  subtitle: string;
  /** 작은 보조 라벨 (지표 코드, 배번) */
  badge?: string;
  action: CommandAction;
};

export type CommandGroup = { group: CommandItem["group"]; items: CommandItem[] };

const withSeason = (href: string, season: string | null, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
};

/**
 * 해석 결과를 네 묶음(지표 · 선수 · 화면 · AI에게 물어보기)으로 만든다.
 * season은 지금 보고 있는 시즌이다. 검색어에 시즌이 있으면 그쪽을 쓴다.
 */
export function buildCommandGroups(
  parsed: ParsedCommand,
  options: { lang: "ko" | "en"; season?: string | null; displayName?: (player: CommandPlayer) => string }
): CommandGroup[] {
  if (parsed.intent.type === "empty") return [];
  const ko = options.lang === "ko";
  const season = parsed.season ?? options.season ?? null;
  const nameOf = options.displayName ?? ((player: CommandPlayer) => player.name);
  const metricName = (metric: MetricDef) => (ko ? metric.nameKo : metric.nameEn);
  const groups: CommandGroup[] = [];

  // 1. 지표
  const metricItems: CommandItem[] = parsed.metrics.map((metric) => {
    const teamScope = parsed.team && metric === parsed.metric;
    return {
      id: `metric-${metric.code}`,
      group: "metric",
      title: teamScope ? (ko ? `팀 ${metricName(metric)}` : `Team ${metricName(metric)}`) : metricName(metric),
      subtitle: ko ? metric.summaryKo : metric.summaryEn,
      badge: metric.code,
      action: { type: "metric", code: metric.code, ...(season ? { season } : {}) },
    };
  });
  if (metricItems.length > 0) groups.push({ group: "metric", items: metricItems });

  // 2. 선수 — 지표가 함께 있으면 그 선수의 지표로 바로 간다
  const playerItems: CommandItem[] = parsed.players.map((player) => {
    const number = player.number === null || player.number === undefined ? undefined : `#${player.number}`;
    if (parsed.metric) {
      return {
        id: `player-${player.id}-${parsed.metric.code}`,
        group: "player",
        title: `${nameOf(player)} · ${metricName(parsed.metric)}`,
        subtitle: ko ? "이 선수의 값과 팀 안 순위 보기" : "This player's value and team rank",
        badge: number,
        action: { type: "navigate", href: withSeason(`/players/${player.id}`, season, { metric: parsed.metric.code }) },
      };
    }
    return {
      id: `player-${player.id}`,
      group: "player",
      title: nameOf(player),
      subtitle: ko ? (player.isPitcher ? "투수 · 선수 페이지" : "선수 페이지") : player.isPitcher ? "Pitcher · player page" : "Player page",
      badge: number,
      action: { type: "navigate", href: withSeason(`/players/${player.id}`, season) },
    };
  });
  if (playerItems.length > 0) groups.push({ group: "player", items: playerItems });

  // 3. 화면
  const screenItems: CommandItem[] = parsed.screens.map((screen) => ({
    id: `screen-${screen.id}`,
    group: "screen",
    title: ko ? screen.labelKo : screen.labelEn,
    subtitle: ko ? screen.hintKo : screen.hintEn,
    action: { type: "navigate", href: withSeason(screen.href, season) },
  }));
  if (screenItems.length > 0) groups.push({ group: "screen", items: screenItems });

  // 4. AI에게 물어보기 — 문장형 질문이거나 위 묶음에 아무것도 없을 때
  const question = parsed.question ?? (groups.length === 0 ? parsed.raw.trim() : null);
  if (question) {
    groups.push({
      group: "ask",
      items: [{
        id: "ask",
        group: "ask",
        title: ko ? `"${question}"` : `"${question}"`,
        subtitle: ko ? "AI 분석 화면으로 질문 넘기기" : "Send this question to AI analysis",
        action: { type: "navigate", href: withSeason("/team-analysis", season, { q: question }) },
      }],
    });
  }

  // 해석한 의도에 맞는 묶음을 맨 위로 (Enter를 누르면 그 항목이 선택된다)
  const lead: Record<CommandIntent["type"], CommandItem["group"] | null> = {
    empty: null, "player-metric": "player", "team-metric": "metric", metric: "metric", player: "player", screen: "screen", ask: "ask",
  };
  const first = lead[parsed.intent.type];
  return first ? [...groups.filter((g) => g.group === first), ...groups.filter((g) => g.group !== first)] : groups;
}
