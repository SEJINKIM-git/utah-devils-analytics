/**
 * E2E용 가짜 Supabase(PostgREST) — 읽기 전용.
 *
 * 가상 선수(가선수·나선수…)의 기록을 돌려준다. 운영 DB에 접속하지 않고 화면 흐름을 확인하거나
 * 실제 선수 이름이 없는 스크린숏을 찍을 때 쓴다.
 *
 *   node tests/e2e/mock-supabase.mjs            # 127.0.0.1:54321
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e SUPABASE_SERVICE_KEY=e2e npm run build
 *
 * supabase-js가 보내는 조회 중 이 앱이 쓰는 것만 흉내 낸다: select(임베드 games(...) 포함),
 * eq / neq / in / is / gt(e) / lt(e), order, limit, single(). 쓰기 요청은 모두 거절한다.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);

// ── 가상 기록 ────────────────────────────────────────────────────────────────
const NAMES = ["가선수", "나선수", "다선수", "라선수", "마선수", "바선수", "사선수", "아선수", "자선수"];
const players = NAMES.map((name, i) => ({ id: i + 1, number: [7, 18, 21, 30, 4, 11, 25, 9, 33][i], name, is_pitcher: i === 1 || i === 5 }));

const games = [
  { id: 201, season: "2026", date: "2026-03-14", opponent: "상대A", created_at: "2026-03-15T03:00:00Z", our_score: 7, opp_score: 4 },
  { id: 202, season: "2026", date: "2026-03-21", opponent: "상대B", created_at: "2026-03-22T03:00:00Z", our_score: 3, opp_score: 5 },
  { id: 203, season: "2026", date: "2026-04-04", opponent: "상대C", created_at: "2026-04-05T03:00:00Z", our_score: 9, opp_score: 2 },
  { id: 204, season: "2026", date: "2026-04-11", opponent: "상대D", created_at: "2026-04-12T03:00:00Z", our_score: 6, opp_score: 6 },
];

// 난수 대신 정해진 규칙으로 만든다 (실행할 때마다 같은 숫자)
const pick = (seed, mod) => ((seed * 7919 + 104729) % 9973) % mod;
let rowId = 1;
const batting_stats = [];
const pitching_stats = [];

for (const player of players) {
  // 2025: 시즌 요약 행 (희생플라이 구분 없음)
  const ab = 30 + pick(player.id, 25);
  const hits = Math.round(ab * (0.18 + pick(player.id + 3, 20) / 100));
  const bb = 3 + pick(player.id + 5, 9);
  batting_stats.push({
    id: rowId++, player_id: player.id, season: "2025", game_id: null,
    pa: ab + bb + 1, ab, runs: pick(player.id + 1, 12), hits, doubles: pick(player.id + 2, 5), triples: pick(player.id, 2), hr: pick(player.id + 4, 3),
    rbi: pick(player.id + 6, 15), bb, hbp: 1, so: 4 + pick(player.id + 7, 10), sb: pick(player.id + 8, 7), sf: null,
  });
  // 2026: 경기별 행 (v3.0 — 희생플라이 있음)
  games.forEach((game, g) => {
    if (player.id === 9 && g > 0) return; // 자선수는 첫 경기만
    const gab = 2 + pick(player.id * 3 + g, 3);
    const ghits = Math.min(gab, pick(player.id * 5 + g * 2, 4));
    const gbb = pick(player.id + g, 2);
    const sf = pick(player.id * 2 + g, 5) === 0 ? 1 : 0;
    batting_stats.push({
      id: rowId++, player_id: player.id, season: "2026", game_id: game.id,
      pa: gab + gbb + sf, ab: gab, runs: pick(player.id + g, 2), hits: ghits, doubles: ghits > 1 ? 1 : 0, triples: 0, hr: ghits > 2 ? 1 : 0,
      rbi: pick(player.id + g * 3, 3), bb: gbb, hbp: 0, so: pick(player.id + g * 5, 2), sb: pick(player.id + g * 7, 2), sf,
    });
  });
}

const PITCH = [
  [2, "2025", null, 28.1, { er: 14, ha: 30, bb: 12, so: 25, w: 3, l: 2, runs_allowed: 17 }],
  [6, "2025", null, 19.2, { er: 13, ha: 24, bb: 11, so: 14, w: 1, l: 3, sv: 1, runs_allowed: 16 }],
  [2, "2026", 201, 4, { er: 2, ha: 4, bb: 1, so: 5, w: 1, runs_allowed: 3 }],
  [6, "2026", 201, 1, { er: 0, ha: 1, bb: 0, so: 1, sv: 1 }],
  [2, "2026", 202, 3.1, { er: 3, ha: 5, bb: 2, so: 3, l: 1, runs_allowed: 4 }],
  [6, "2026", 202, 1.2, { er: 1, ha: 2, bb: 1, so: 2, runs_allowed: 1 }],
  [6, "2026", 203, 5, { er: 1, ha: 3, bb: 1, so: 6, w: 1, runs_allowed: 2 }],
  [2, "2026", 204, 4.2, { er: 3, ha: 6, bb: 2, so: 4, runs_allowed: 5 }],
  [1, "2026", 204, 0.1, { er: 0, ha: 0, bb: 0, so: 1 }],
];
for (const [player_id, season, game_id, ip, v] of PITCH) {
  pitching_stats.push({
    id: rowId++, player_id, season, game_id, ip,
    w: 0, l: 0, sv: 0, hld: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, hbp: 0, so: 0, hr_allowed: 0, ...v,
  });
}

const roster_uploads = [
  {
    id: 1, filename: "2026 roster.xlsx", source: "file", uploaded_at: "2026-03-01T00:00:00Z", player_count: players.length,
    players_snapshot: JSON.stringify({ season: "2026", players: players.map(({ number, name, is_pitcher }) => ({ number, name, is_pitcher })) }),
  },
];

const TABLES = { players, games, batting_stats, pitching_stats, roster_uploads };

// ── PostgREST 흉내 ────────────────────────────────────────────────────────────
const cast = (raw) => (raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw);
const same = (a, b) => (a === null || b === null ? a === b : String(a) === String(b));

function applyFilter(rows, column, expr) {
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  switch (op) {
    case "eq": return rows.filter((r) => same(r[column] ?? null, cast(raw)));
    case "neq": return rows.filter((r) => !same(r[column] ?? null, cast(raw)));
    case "is": return rows.filter((r) => (r[column] ?? null) === cast(raw));
    case "in": {
      const set = raw.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      return rows.filter((r) => set.some((v) => same(r[column] ?? null, cast(v))));
    }
    case "gt": return rows.filter((r) => r[column] > cast(raw));
    case "gte": return rows.filter((r) => r[column] >= cast(raw));
    case "lt": return rows.filter((r) => r[column] < cast(raw));
    case "lte": return rows.filter((r) => r[column] <= cast(raw));
    case "not": return rows.filter((r) => !applyFilter([r], column, raw).length);
    default: return rows;
  }
}

function query(table, params) {
  let rows = [...(TABLES[table] || [])];
  const select = params.get("select") || "*";
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    rows = applyFilter(rows, key, value);
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((part) => part.split("."));
    rows.sort((a, b) => {
      for (const [column, direction] of keys) {
        if (a[column] === b[column]) continue;
        const less = (a[column] ?? "") < (b[column] ?? "");
        return (less ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
  }
  if (params.get("limit")) rows = rows.slice(0, Number(params.get("limit")));
  // 임베드: games(date, opponent)
  if (/games\s*\(/.test(select)) {
    const byId = new Map(games.map((game) => [game.id, game]));
    rows = rows.map((row) => ({ ...row, games: row.game_id ? { date: byId.get(row.game_id)?.date, opponent: byId.get(row.game_id)?.opponent } : null }));
  }
  return rows;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(200, {});
  const match = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (!match) return send(404, { message: "not found" });
  if (req.method !== "GET" && req.method !== "HEAD") return send(403, { message: "가짜 Supabase는 읽기 전용입니다" });

  const rows = query(match[1], url.searchParams);
  if (String(req.headers.accept || "").includes("vnd.pgrst.object+json")) {
    if (rows.length === 1) return send(200, rows[0]);
    return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
  }
  send(200, rows);
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock supabase on http://127.0.0.1:${PORT}`));
