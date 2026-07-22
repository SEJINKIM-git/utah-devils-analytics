import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/app/components/SearchBar";
import SeasonFilter from "@/app/components/SeasonFilter";
import { appendCareerSeasonIfNeeded, filterRecordsForSeason } from "@/lib/careerStats";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import { buildPlayerIdentityKey, dedupePlayersByIdentity, normalizePlayerName } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { t, Lang } from "@/lib/translations";
import { formatIP, parseIP } from "@/lib/statFormatting";
import { Users, Trophy, TrendingUp, TrendingDown, BrainCircuit } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── 팀 컬러 — CSS 변수 우선, 라이트/다크 모두 대응 ── */
const C = {
  navyDark: "var(--bg)",
  navy: "var(--surface-low)",
  red: "var(--accent)",
  redDark: "#991B1B",
  redLight: "var(--brand-coral)",
  white: "var(--text)",
  whiteDim: "var(--text-muted)",
  border: "var(--border)",
  borderSubtle: "rgba(255,255,255,0.06)",
  cardBg: "var(--card-bg)",
};

function hasBattingActivity(record: any) {
  return [
    record.pa,
    record.ab,
    record.runs,
    record.hits,
    record.doubles,
    record.triples,
    record.hr,
    record.rbi,
    record.bb,
    record.hbp,
    record.so,
    record.sb,
  ].some((value) => Number(value) > 0);
}

function hasPitchingActivity(record: any) {
  return [
    record.w,
    record.l,
    record.sv,
    record.hld,
    record.ip,
    record.ha,
    record.runs_allowed,
    record.er,
    record.bb,
    record.hbp,
    record.so,
    record.hr_allowed,
  ].some((value) => Number(value) > 0);
}

function findRosterPlayerMatch(players: any[], snapshotPlayer: { name: string; number: number }) {
  const exactKey = buildPlayerIdentityKey(snapshotPlayer.name, snapshotPlayer.number);
  const normalizedName = normalizePlayerName(snapshotPlayer.name);

  const exact = [...players]
    .filter((player) => buildPlayerIdentityKey(player.name, player.number) === exactKey)
    .sort((a, b) => b.id - a.id)[0];
  if (exact) return exact;

  const byName = [...players]
    .filter((player) => normalizePlayerName(player.name) === normalizedName)
    .sort((a, b) => b.id - a.id)[0];
  if (byName) return byName;

  if (snapshotPlayer.number) {
    const byNumber = [...players]
      .filter((player) => player.number === snapshotPlayer.number)
      .sort((a, b) => b.id - a.id)[0];
    if (byNumber) return byNumber;
  }

  return null;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const params = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;
  const preferredSeason = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;

  const { data: rawPlayers } = await supabase.from("players").select("*").order("number");
  const players = rawPlayers || [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const { data: allBatting } = await supabase.from("batting_stats").select("*");
  const { data: allPitching } = await supabase.from("pitching_stats").select("*");
  const { data: allGames } = await supabase.from("games").select("id,season,created_at,date,opponent");
  const { data: rosterUploads } = await supabase
    .from("roster_uploads")
    .select("filename,players_snapshot,source,uploaded_at")
    .order("uploaded_at", { ascending: false });

  const visibility = await getSeasonVisibility(
    supabase,
    [
      ...(allBatting || []).map((row) => row.season),
      ...(allPitching || []).map((row) => row.season),
      preferredSeason,
    ],
    preferredSeason,
    "2025"
  );
  const seasons = appendCareerSeasonIfNeeded(
    visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2025"],
    [
      ...(allBatting || []).map((row) => row.season),
      ...(allPitching || []).map((row) => row.season),
    ]
  );
  const season = normalizeSelectedSeason(params.season, seasons, preferredSeason || "2025", preferredSeason);
  const isPlaceholderSeason = isLockedSeason(season, visibility.activatedSeasons);

  const batting = isPlaceholderSeason
    ? []
    : filterRecordsForSeason(allBatting || [], season, { lockedSeasons: visibility.lockedSeasons });
  const pitching = isPlaceholderSeason
    ? []
    : filterRecordsForSeason(allPitching || [], season, { lockedSeasons: visibility.lockedSeasons });
  const latestRosterUpload = isPlaceholderSeason
    ? null
    : getLatestRosterUploadForSeason(rosterUploads || [], season);
  const latestRosterSnapshot = latestRosterUpload?.snapshot || null;
  const rosterUploadedAt = latestRosterUpload?.upload?.uploaded_at
    ? new Date(latestRosterUpload.upload.uploaded_at).getTime()
    : null;
  const validGameIds = new Set(
    (allGames || [])
      .filter((game) => game.season === season)
      .filter((game) => {
        if (!rosterUploadedAt) return true;
        if (!game.created_at) return false;
        return new Date(game.created_at).getTime() >= rosterUploadedAt;
      })
      .map((game) => game.id)
  );
  const rosterKeys = new Set(
    (latestRosterSnapshot?.players || []).map((player) => buildPlayerIdentityKey(player.name, player.number))
  );
  const shouldGateStatsToPostRosterGames = Boolean(latestRosterUpload);

  // ── 타자: 경기별 기록 전부 누적 합산 ──
  const battingByPlayer = new Map<string, any>();
  for (const b of batting) {
    if (shouldGateStatsToPostRosterGames) {
      if (!b.game_id || !validGameIds.has(b.game_id)) continue;
    }
    const player = playerById.get(b.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identityKey)) continue;

    if (battingByPlayer.has(identityKey)) {
      const acc = battingByPlayer.get(identityKey);
      battingByPlayer.set(identityKey, {
        ...acc,
        player: acc.player.id > player.id ? acc.player : player,
        player_id: acc.player.id > player.id ? acc.player.id : player.id,
        pa: acc.pa + (b.pa || 0),
        ab: acc.ab + (b.ab || 0),
        runs: acc.runs + (b.runs || 0),
        hits: acc.hits + (b.hits || 0),
        doubles: acc.doubles + (b.doubles || 0),
        triples: acc.triples + (b.triples || 0),
        hr: acc.hr + (b.hr || 0),
        rbi: acc.rbi + (b.rbi || 0),
        bb: acc.bb + (b.bb || 0),
        hbp: acc.hbp + (b.hbp || 0),
        so: acc.so + (b.so || 0),
        sb: acc.sb + (b.sb || 0),
      });
    } else {
      battingByPlayer.set(identityKey, { ...b, player_id: player.id, player });
    }
  }
  const uniqueBatting = Array.from(battingByPlayer.values()).filter(hasBattingActivity);

  // ── Per-game team batting for mini bar chart (last 7 games) ──
  const perGameBatMap = new Map<string, { hits: number; ab: number }>();
  for (const b of batting) {
    if (!b.game_id) continue;
    if (shouldGateStatsToPostRosterGames && !validGameIds.has(b.game_id)) continue;
    const player = playerById.get(b.player_id);
    if (!player) continue;
    const identKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identKey)) continue;
    const cur = perGameBatMap.get(b.game_id) || { hits: 0, ab: 0 };
    perGameBatMap.set(b.game_id, { hits: cur.hits + (b.hits || 0), ab: cur.ab + (b.ab || 0) });
  }
  const perGameEraMap = new Map<string, { er: number; ip: number }>();
  for (const p of pitching) {
    if (!p.game_id) continue;
    if (shouldGateStatsToPostRosterGames && !validGameIds.has(p.game_id)) continue;
    const player = playerById.get(p.player_id);
    if (!player) continue;
    const identKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identKey)) continue;
    const cur = perGameEraMap.get(p.game_id) || { er: 0, ip: 0 };
    perGameEraMap.set(p.game_id, { er: cur.er + (p.er || 0), ip: cur.ip + parseIP(p.ip) });
  }
  // Deduplicate games by date+opponent: keep the one with more batting data
  const gamesSortedRaw = (allGames || [])
    .filter((g) => g.season === season && validGameIds.has(g.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const gamesByKey = new Map<string, typeof gamesSortedRaw[0]>();
  for (const g of gamesSortedRaw) {
    const key = `${g.date ?? ""}|${g.opponent ?? ""}`;
    const prev = gamesByKey.get(key);
    if (!prev) { gamesByKey.set(key, g); continue; }
    const ab = (perGameBatMap.get(g.id) || { ab: 0 }).ab;
    const prevAb = (perGameBatMap.get(prev.id) || { ab: 0 }).ab;
    if (ab > prevAb) gamesByKey.set(key, g);
  }
  const gamesSorted = Array.from(gamesByKey.values())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const perGameAvgList = gamesSorted
    .map((g) => {
      const s = perGameBatMap.get(g.id);
      return s && s.ab > 0 ? s.hits / s.ab : null;
    })
    .filter((v): v is number => v !== null)
    .slice(-7);
  const perGameEraList = gamesSorted
    .map((g) => {
      const s = perGameEraMap.get(g.id);
      return s && s.ip > 0 ? (s.er / s.ip) * 5 : null;
    })
    .filter((v): v is number => v !== null)
    .slice(-7);

  // ── 투수: 경기별 기록 전부 누적 합산 ──
  const pitchingByPlayer = new Map<string, any>();
  for (const p of pitching) {
    if (shouldGateStatsToPostRosterGames) {
      if (!p.game_id || !validGameIds.has(p.game_id)) continue;
    }
    const player = playerById.get(p.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identityKey)) continue;

    if (pitchingByPlayer.has(identityKey)) {
      const acc = pitchingByPlayer.get(identityKey);
      pitchingByPlayer.set(identityKey, {
        ...acc,
        player: acc.player.id > player.id ? acc.player : player,
        player_id: acc.player.id > player.id ? acc.player.id : player.id,
        w: acc.w + (p.w || 0),
        l: acc.l + (p.l || 0),
        sv: acc.sv + (p.sv || 0),
        hld: acc.hld + (p.hld || 0),
        ip: parseIP(acc.ip) + parseIP(p.ip),
        ha: acc.ha + (p.ha || 0),
        runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
        er: acc.er + (p.er || 0),
        bb: acc.bb + (p.bb || 0),
        hbp: acc.hbp + (p.hbp || 0),
        so: acc.so + (p.so || 0),
        hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
      });
    } else {
      pitchingByPlayer.set(identityKey, { ...p, player_id: player.id, player, ip: parseIP(p.ip) });
    }
  }
  const uniquePitching = Array.from(pitchingByPlayer.values()).filter(hasPitchingActivity);

  // ── Recent 3 games ──
  const recentGames = gamesSorted
    .slice(-3)
    .reverse()
    .map((g) => {
      const batStats = (batting || []).filter((b) => b.game_id === g.id);
      const topPerformerEntry = batStats
        .map((b) => {
          const pl = playerById.get(b.player_id);
          if (!pl) return null;
          return { player: pl, score: (b.hits || 0) + (b.rbi || 0) + (b.bb || 0), b };
        })
        .filter(Boolean)
        .sort((a, b) => b!.score - a!.score)[0];
      const gs = perGameBatMap.get(g.id) || { hits: 0, ab: 0 };
      return {
        game: g,
        gameAvg: gs.ab > 0 ? (gs.hits / gs.ab).toFixed(3) : "---",
        topPerformer: topPerformerEntry?.player || null,
        topScore: topPerformerEntry?.score || 0,
      };
    });

  const rosterSeasonPlayers = isPlaceholderSeason
    ? []
    : dedupePlayersByIdentity(
        (latestRosterSnapshot?.players || [])
          .map((player) => findRosterPlayerMatch(players, player))
          .filter(Boolean)
      );
  const hasStatData = uniqueBatting.length > 0 || uniquePitching.length > 0;
  const seasonPlayers =
    rosterSeasonPlayers.length > 0
      ? rosterSeasonPlayers
      : dedupePlayersByIdentity([
          ...uniqueBatting.map((record) => record.player),
          ...uniquePitching.map((record) => record.player),
        ]);
  const hasSeasonRoster = seasonPlayers.length > 0;

  const battingWithPlayers = uniqueBatting
    .map((b) => {
      const player = b.player;
      if (!player) return null;
      const avg = b.ab > 0 ? (b.hits / b.ab).toFixed(3) : "---";
      const obp = b.pa > 0 ? ((b.hits + b.bb + b.hbp) / b.pa).toFixed(3) : "---";
      const slg =
        b.ab > 0
          ? (
              (b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) /
              b.ab
            ).toFixed(3)
          : "---";
      const ops =
        obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
      return { ...b, player, avg, obp, slg, ops, opsNum: parseFloat(ops) || 0 };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.opsNum - a.opsNum);

  const pitchingWithPlayers = uniquePitching
    .map((p) => {
      const player = p.player;
      if (!player) return null;
      const era = p.ip > 0 ? ((p.er / p.ip) * 5).toFixed(2) : "---";
      const whip = p.ip > 0 ? ((p.ha + p.bb) / p.ip).toFixed(2) : "---";
      return { ...p, player, era, whip, eraNum: parseFloat(era) || 99 };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.eraNum - b.eraNum);

  const teamHits    = uniqueBatting.reduce((a, b) => a + b.hits, 0);
  const teamAB      = uniqueBatting.reduce((a, b) => a + b.ab, 0);
  const teamBB      = uniqueBatting.reduce((a, b) => a + b.bb, 0);
  const teamHBP     = uniqueBatting.reduce((a, b) => a + b.hbp, 0);
  const teamPA      = uniqueBatting.reduce((a, b) => a + b.pa, 0);
  const teamSB      = uniqueBatting.reduce((a, b) => a + b.sb, 0);
  const teamSO      = uniqueBatting.reduce((a, b) => a + b.so, 0);
  const teamDoubles = uniqueBatting.reduce((a, b) => a + (b.doubles || 0), 0);
  const teamTriples = uniqueBatting.reduce((a, b) => a + (b.triples || 0), 0);
  const teamHRBat   = uniqueBatting.reduce((a, b) => a + (b.hr || 0), 0);
  const teamBBHBP   = teamBB + teamHBP;
  const teamAvg  = teamAB > 0 ? (teamHits / teamAB).toFixed(3) : "---";
  const teamOBP  = teamPA > 0 ? ((teamHits + teamBB + teamHBP) / teamPA).toFixed(3) : "---";
  const teamTB   = teamHits + teamDoubles + teamTriples * 2 + teamHRBat * 3;
  const teamSLG  = teamAB > 0 ? (teamTB / teamAB).toFixed(3) : "---";
  const teamOPS  =
    teamOBP !== "---" && teamSLG !== "---"
      ? (parseFloat(teamOBP) + parseFloat(teamSLG)).toFixed(3)
      : "---";
  const teamW  = uniquePitching.reduce((a, b) => a + b.w, 0);
  const teamL  = uniquePitching.reduce((a, b) => a + b.l, 0);
  const teamSV = uniquePitching.reduce((a, b) => a + b.sv, 0);
  const teamIP = uniquePitching.reduce((a, b) => a + b.ip, 0);
  const teamER = uniquePitching.reduce((a, b) => a + b.er, 0);
  const teamERA = teamIP > 0 ? ((teamER / teamIP) * 5).toFixed(2) : "---";

  const seasonLabel =
    season === "Career" ? t("site.career", lang) : `${season} ${t("site.season", lang)}`;

  // ── AI insights from supabase ──
  const { data: aiReport } = await supabase
    .from("ai_reports")
    .select("summary, strengths, improvements, generated_at")
    .eq("report_type", "team")
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  let aiStrengths: string[] = [];
  let aiImprovement = "";
  let aiSummary = aiReport?.summary || "";
  try {
    if (aiReport?.strengths) {
      const s = JSON.parse(aiReport.strengths);
      aiStrengths = (s.team_strengths || []).slice(0, 2);
    }
    if (aiReport?.improvements) {
      const imp = JSON.parse(aiReport.improvements);
      aiImprovement = (imp.team_weaknesses || [])[0] || "";
    }
  } catch {}
  // Rule-based fallback if no AI report
  if (!aiSummary) {
    const topBatterName = battingWithPlayers[0]?.player?.name || "";
    aiSummary =
      lang === "ko"
        ? `팀 타율 ${teamAvg}, ERA ${teamERA}로 시즌을 운영 중입니다.`
        : `Team AVG ${teamAvg}, ERA ${teamERA} for the season.`;
    aiStrengths =
      lang === "ko"
        ? [
            `출루율 ${teamOBP} — 득점 기회 창출`,
            topBatterName ? `OPS 리더: ${topBatterName}` : `팀 출루율 상위`,
          ]
        : [
            `OBP ${teamOBP} — strong on-base skill`,
            topBatterName ? `OPS leader: ${topBatterName}` : "Strong OBP",
          ];
    aiImprovement =
      lang === "ko"
        ? `팀 탈삼진 ${uniquePitching.reduce((a, b) => a + (b.so || 0), 0)}개 — 볼카운트 관리 집중`
        : `Pitch count management focus`;
  }

  // ── SVG Helper components (server-renderable) ──
  function MiniBarChart({ values, accentColor }: { values: number[]; accentColor: string }) {
    if (!values.length) return null;
    const H = 48;
    const W = 9;
    const G = 5;
    const max = Math.max(...values, 0.001);
    return (
      <svg width={(W + G) * values.length - G} height={H} style={{ display: "block" }}>
        {values.map((v, i) => {
          const h = Math.max(Math.round((v / max) * H), 3);
          const isLast = i === values.length - 1;
          return (
            <rect
              key={i}
              x={i * (W + G)}
              y={H - h}
              width={W}
              height={h}
              rx={3}
              fill={isLast ? accentColor : "rgba(148,163,184,0.18)"}
            />
          );
        })}
      </svg>
    );
  }

  function DonutChart({
    percent,
    color,
    size = 96,
  }: {
    percent: number;
    color: string;
    size?: number;
  }) {
    const r = (size - 16) / 2;
    const circ = 2 * Math.PI * r;
    const dash = Math.min(percent / 100, 1) * circ;
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.1)"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
        <text
          x={size / 2}
          y={size / 2 + 6}
          textAnchor="middle"
          fill="currentColor"
          fontSize={16}
          fontWeight={800}
          fontFamily="var(--font-body)"
        >
          {Number.isFinite(percent) ? `${Math.round(percent)}%` : "—"}
        </text>
      </svg>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "transparent",
        color: C.white,
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ padding: "28px 32px 48px" }}>
        {/* ── Search + Season filter (full-width above grid) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <SearchBar
            players={seasonPlayers}
            batting={uniqueBatting}
            pitching={uniquePitching}
            season={season}
            lang={lang}
          />
          <SeasonFilter seasons={seasons} basePath="/" lang={lang} />
        </div>

        {/* ── 2-column dashboard grid ── */}
        <div className="dash-grid">
          {/* ════ LEFT COLUMN ════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Hero card */}
            <div
              style={{
                background:
                  "linear-gradient(135deg,var(--surface) 0%,var(--sidebar-bg) 100%)",
                borderRadius: "var(--radius)",
                padding: "var(--pad-card)",
                boxShadow: "var(--shadow-md)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at 10% 10%,var(--blue-dim),transparent 40%),radial-gradient(circle at 90% 80%,var(--coral-dim),transparent 40%)",
                }}
              />
              <div style={{ position: "relative" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--coral)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  SEASON PERFORMANCE · {season}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <Image
                      src="/logos/cap-logo.png"
                      alt="Utah Devils"
                      width={56}
                      height={56}
                      style={{ borderRadius: 14 }}
                    />
                    <div>
                      <h1
                        style={{
                          fontSize: "clamp(1.8rem,3vw,2.8rem)",
                          fontWeight: 800,
                          letterSpacing: "-0.03em",
                          lineHeight: 1,
                          margin: 0,
                          color: "var(--text-strong)",
                        }}
                      >
                        {t("site.title", lang)}
                      </h1>
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--text-muted)",
                          margin: "6px 0 0",
                        }}
                      >
                        {lang === "ko"
                          ? `${seasonPlayers.length}명 로스터`
                          : `${seasonPlayers.length} players`}
                      </p>
                    </div>
                  </div>
                  {hasStatData && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 18px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--coral-dim)",
                        color: "var(--coral)",
                      }}
                    >
                      <Trophy size={16} strokeWidth={1.8} />
                      <span
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {lang === "ko"
                          ? `${teamW}승 ${teamL}패`
                          : `${teamW}W ${teamL}L`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Placeholder/locked season notice */}
            {isPlaceholderSeason && (
              <div
                className="app-glass-panel"
                style={{ padding: "18px 20px", borderRadius: 20 }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {lang === "ko"
                    ? "2026 시즌은 공식 기록 업로드 전까지 비워 둡니다."
                    : "The 2026 season stays blank until official records are uploaded."}
                </div>
                <div style={{ fontSize: 12, color: C.whiteDim }}>
                  {lang === "ko"
                    ? "임시 테스트 데이터는 대시보드에서 표시하지 않도록 처리했습니다. 공식 파일 업로드가 시작되면 이 상태를 해제하면 됩니다."
                    : "Temporary test data is intentionally hidden from the dashboard. This can be lifted once official uploads begin."}
                </div>
              </div>
            )}

            {!isPlaceholderSeason && hasSeasonRoster && !hasStatData && (
              <div
                className="app-glass-panel"
                style={{ padding: "18px 20px", borderRadius: 20 }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {lang === "ko"
                    ? "시즌 선수단은 등록되었고, 경기 기록이 올라오면 지표가 자동 계산됩니다."
                    : "The roster is ready, and metrics will populate automatically once game records are uploaded."}
                </div>
                <div style={{ fontSize: 12, color: C.whiteDim }}>
                  {lang === "ko"
                    ? "지금은 명단만 표시하고 있으며, 타율·OPS·ERA·WHIP 같은 수치는 경기/시즌 기록 업로드 후 바로 시즌 대시보드에 반영됩니다."
                    : "The dashboard is showing the roster first. AVG, OPS, ERA, WHIP, and other metrics will appear as soon as records are uploaded."}
                </div>
              </div>
            )}

            {/* Season roster */}
            {!isPlaceholderSeason && hasSeasonRoster && (
              <div>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Users size={18} />
                    {lang === "ko"
                      ? `${season} 선수단 명단 · ${seasonPlayers.length}명`
                      : `${season} Roster · ${seasonPlayers.length}`}
                  </span>
                </h2>
                <div
                  className="app-glass-panel"
                  style={{ borderRadius: 20, padding: "18px 18px 16px" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {seasonPlayers.map((player: any) => (
                      <div
                        key={`${player.number}-${player.name}-${player.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 14,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background:
                              "linear-gradient(135deg, rgba(255,180,171,0.9), rgba(220,38,38,0.9))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {player.number}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: C.white,
                              lineHeight: 1.2,
                            }}
                          >
                            {getPlayerDisplayName(player.name, lang)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Team AVG card with mini bar chart */}
            {hasStatData && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  padding: "var(--pad-card)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    margin: "0 0 4px",
                  }}
                >
                  {lang === "ko" ? "팀 타율" : "Team AVG"}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: 800,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                        color: "var(--coral)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {teamAvg}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      OBP {teamOBP} · SLG {teamSLG}
                    </div>
                  </div>
                  {perGameAvgList.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      <MiniBarChart values={perGameAvgList} accentColor="var(--coral)" />
                      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                        {lang === "ko" ? "최근 경기 타율" : "Recent game AVG"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Team ERA card with mini bar chart */}
            {hasStatData && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  padding: "var(--pad-card)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    margin: "0 0 4px",
                  }}
                >
                  {lang === "ko" ? "팀 ERA" : "Team ERA"}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: 800,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                        color: "var(--blue)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {teamERA}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {lang === "ko"
                        ? `${teamW}승 ${teamL}패 ${teamSV}세이브`
                        : `${teamW}W ${teamL}L ${teamSV}SV`}
                    </div>
                  </div>
                  {perGameEraList.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      <MiniBarChart values={perGameEraList} accentColor="var(--blue)" />
                      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                        {lang === "ko" ? "최근 경기 ERA" : "Recent game ERA"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent 3 games */}
            {recentGames.length > 0 && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  padding: "var(--pad-card)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    margin: "0 0 16px",
                  }}
                >
                  {lang === "ko" ? "최근 경기" : "Recent Games"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recentGames.map(({ game, gameAvg, topPerformer }) => (
                    <div
                      key={game.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--surface-raised)",
                      }}
                    >
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        {game.date ||
                          new Date(game.created_at).toLocaleDateString(
                            lang === "ko" ? "ko-KR" : "en-US",
                            { month: "short", day: "numeric" }
                          )}
                        {game.opponent && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontWeight: 700,
                              color: "var(--text)",
                            }}
                          >
                            vs {game.opponent}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        {topPerformer && (
                          <span style={{ fontSize: 12, color: "var(--coral)" }}>
                            {topPerformer.name}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--text-strong)",
                          }}
                        >
                          {gameAvg}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top 5 batters by OPS */}
            {battingWithPlayers.length > 0 && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <div
                  style={{
                    padding: "24px var(--pad-card) 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      margin: 0,
                    }}
                  >
                    {lang === "ko" ? "타자 기록 TOP 5 · OPS 순" : "Top 5 Batters by OPS"}
                  </p>
                  <Link
                    href={`/?season=${season}#batting`}
                    style={{
                      fontSize: 12,
                      color: "var(--coral)",
                      textDecoration: "none",
                    }}
                  >
                    {lang === "ko" ? "전체 →" : "All →"}
                  </Link>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["#", "이름", "타율", "안타", "타점", "출루율", "OPS"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 16px",
                            textAlign: "left",
                            fontSize: 10,
                            color: "var(--text-faint)",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            borderBottom: "1px solid rgba(148,163,184,0.06)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {battingWithPlayers.slice(0, 5).map((b: any, i: number) => (
                      <tr key={i} style={{ boxShadow: "inset 0 1px 0 rgba(148,163,184,0.06)" }}>
                        <td
                          style={{
                            padding: "14px 16px",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          {b.player.number}
                        </td>
                        <td style={{ padding: "14px 16px", fontWeight: 700 }}>
                          <Link
                            href={`/players/${b.player.id}?season=${encodeURIComponent(season)}`}
                            style={{ color: "var(--text-strong)", textDecoration: "none" }}
                          >
                            {getPlayerDisplayName(b.player.name, lang)}
                          </Link>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {b.avg}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {b.hits}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {b.rbi}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {b.obp}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 800,
                            color: "var(--coral)",
                          }}
                        >
                          {b.ops}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ════ RIGHT COLUMN ════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* AI Insights panel */}
            <div
              style={{
                background: "var(--surface)",
                borderRadius: "var(--radius)",
                padding: "var(--pad-card)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <BrainCircuit
                  size={18}
                  strokeWidth={1.8}
                  style={{ color: "var(--coral)" }}
                />
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  AI INSIGHTS
                </p>
                {aiReport?.generated_at && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "var(--text-faint)",
                      background: "var(--surface-raised)",
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    LIVE
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  lineHeight: 1.65,
                  marginBottom: 16,
                }}
              >
                {aiSummary}
              </p>
              {aiStrengths.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      color: "var(--green)",
                      textTransform: "uppercase",
                      margin: 0,
                    }}
                  >
                    {lang === "ko" ? "핵심 강점" : "Key Strengths"}
                  </p>
                  {aiStrengths.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--surface-raised)",
                        fontSize: 13,
                        color: "var(--text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
              {aiImprovement && (
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      color: "var(--coral)",
                      textTransform: "uppercase",
                      margin: "0 0 8px",
                    }}
                  >
                    {lang === "ko" ? "개선 포인트" : "Improvement"}
                  </p>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--coral-dim)",
                      fontSize: 13,
                      color: "var(--text)",
                      lineHeight: 1.5,
                    }}
                  >
                    {aiImprovement}
                  </div>
                </div>
              )}
              {!aiReport && (
                <Link
                  href={`/team-analysis?season=${season}`}
                  style={{
                    display: "block",
                    marginTop: 16,
                    padding: "10px 16px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--coral-dim)",
                    color: "var(--coral)",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                  }}
                >
                  {lang === "ko" ? "AI 분석 생성 →" : "Generate AI Analysis →"}
                </Link>
              )}
            </div>

            {/* K% Donut card */}
            {uniquePitching.length > 0 &&
              (() => {
                const totalOuts = uniquePitching.reduce(
                  (a, p: any) => a + (p.ip || 0) * 3,
                  0
                );
                const totalKs = uniquePitching.reduce(
                  (a, p: any) => a + (p.so || 0),
                  0
                );
                const kPct = totalOuts > 0 ? (totalKs / totalOuts) * 100 : 0;
                return (
                  <div
                    style={{
                      background: "var(--surface)",
                      borderRadius: "var(--radius)",
                      padding: "var(--pad-card)",
                      boxShadow: "var(--shadow-md)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.15em",
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        margin: 0,
                      }}
                    >
                      {lang === "ko" ? "투수진 K%" : "Pitching K%"}
                    </p>
                    <DonutChart percent={kPct} color="var(--blue)" size={96} />
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                      {lang === "ko"
                        ? `탈삼진 ${totalKs}개 / 총 아웃카운트 ${Math.round(totalOuts)}개`
                        : `${totalKs} Ks / ${Math.round(totalOuts)} outs`}
                    </p>
                  </div>
                );
              })()}

            {/* OPS Leaders (top 3) */}
            {battingWithPlayers.length > 0 && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  padding: "var(--pad-card)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    margin: "0 0 16px",
                  }}
                >
                  {lang === "ko" ? "OPS 리더" : "OPS Leaders"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {battingWithPlayers.slice(0, 3).map((b: any, i: number) => (
                    <Link
                      key={i}
                      href={`/players/${b.player.id}?season=${encodeURIComponent(season)}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: i === 0 ? "var(--coral-dim)" : "var(--surface-raised)",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 8,
                          background:
                            i === 0 ? "var(--coral)" : "var(--surface-raised)",
                          color: i === 0 ? "#fff" : "var(--text-faint)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: i === 0 ? "var(--coral)" : "var(--text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getPlayerDisplayName(b.player.name, lang)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          #{b.player.number}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: i === 0 ? "var(--coral)" : "var(--text-strong)",
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {b.ops}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* end .dash-grid */}

      </div>
    </div>
  );
}
