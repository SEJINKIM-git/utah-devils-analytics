import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import SeasonFilter from "@/app/components/SeasonFilter";
import SbEditCell from "@/app/components/SbEditCell";
import { appendCareerSeasonIfNeeded, filterRecordsForSeason } from "@/lib/careerStats";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import { buildPlayerIdentityKey, dedupePlayersByIdentity, normalizePlayerName } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { t, Lang } from "@/lib/translations";
import { formatIP, parseIP } from "@/lib/statFormatting";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const C = {
  white: "var(--text)",
  whiteDim: "var(--text-muted)",
  red: "var(--accent)",
  border: "var(--border)",
  borderSubtle: "rgba(255,255,255,0.06)",
};

function hasBattingActivity(record: any) {
  return [record.pa, record.ab, record.runs, record.hits, record.doubles, record.triples, record.hr, record.rbi, record.bb, record.hbp, record.so, record.sb].some(
    (value) => Number(value) > 0
  );
}

function hasPitchingActivity(record: any) {
  return [record.w, record.l, record.sv, record.hld, record.ip, record.ha, record.runs_allowed, record.er, record.bb, record.hbp, record.so, record.hr_allowed].some(
    (value) => Number(value) > 0
  );
}

function findRosterPlayerMatch(players: any[], snapshotPlayer: { name: string; number: number }) {
  const exactKey = buildPlayerIdentityKey(snapshotPlayer.name, snapshotPlayer.number);
  const normalizedName = normalizePlayerName(snapshotPlayer.name);
  const exact = [...players].filter((p) => buildPlayerIdentityKey(p.name, p.number) === exactKey).sort((a, b) => b.id - a.id)[0];
  if (exact) return exact;
  const byName = [...players].filter((p) => normalizePlayerName(p.name) === normalizedName).sort((a, b) => b.id - a.id)[0];
  if (byName) return byName;
  if (snapshotPlayer.number) {
    const byNumber = [...players].filter((p) => p.number === snapshotPlayer.number).sort((a, b) => b.id - a.id)[0];
    if (byNumber) return byNumber;
  }
  return null;
}

export default async function RecordsPage({
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
  const playerById = new Map(players.map((p) => [p.id, p]));
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
      ...(allBatting || []).map((r) => r.season),
      ...(allPitching || []).map((r) => r.season),
      preferredSeason,
    ],
    preferredSeason,
    "2025"
  );
  const seasons = appendCareerSeasonIfNeeded(
    visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2025"],
    [...(allBatting || []).map((r) => r.season), ...(allPitching || []).map((r) => r.season)]
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
      .filter((g) => g.season === season)
      .filter((g) => {
        if (!rosterUploadedAt) return true;
        if (!g.created_at) return false;
        return new Date(g.created_at).getTime() >= rosterUploadedAt;
      })
      .map((g) => g.id)
  );
  const rosterKeys = new Set(
    (latestRosterSnapshot?.players || []).map((p: any) => buildPlayerIdentityKey(p.name, p.number))
  );
  const shouldGateStatsToPostRosterGames = Boolean(latestRosterUpload);

  // ── 타자 누적 합산 ──
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

  // ── 투수 누적 합산 ──
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

  const battingWithPlayers = uniqueBatting
    .map((b) => {
      const player = b.player;
      if (!player) return null;
      const avg = b.ab > 0 ? (b.hits / b.ab).toFixed(3) : "---";
      const obp = b.pa > 0 ? ((b.hits + b.bb + b.hbp) / b.pa).toFixed(3) : "---";
      const slg =
        b.ab > 0
          ? ((b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab).toFixed(3)
          : "---";
      const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
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

  const batHeaders = [
    "#",
    t("batting.name", lang),
    t("batting.pa", lang),
    t("batting.ab", lang),
    t("batting.h", lang),
    t("batting.doubles", lang),
    t("batting.triples", lang),
    t("batting.hr", lang),
    t("batting.rbi", lang),
    t("batting.bb", lang),
    t("batting.so", lang),
    t("batting.sb", lang),
    t("batting.avg", lang),
    t("batting.obp", lang),
    "OPS",
  ];
  const pitHeaders = [
    "#",
    t("batting.name", lang),
    t("pitching.w", lang),
    t("pitching.l", lang),
    t("pitching.sv", lang),
    t("pitching.ip", lang),
    t("pitching.ha", lang),
    t("pitching.er", lang),
    t("pitching.bb", lang),
    t("pitching.so", lang),
    "ERA",
    "WHIP",
  ];

  const seasonLabel = season === "Career" ? t("site.career", lang) : `${season} ${t("site.season", lang)}`;

  return (
    <div style={{ padding: "var(--pad-card)", maxWidth: 1200, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "var(--coral)", textTransform: "uppercase", marginBottom: 6 }}>
          SEASON STATS
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text-strong)", margin: 0 }}>
            시즌 기록
          </h1>
          <SeasonFilter seasons={seasons} basePath="/records" />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 8 }}>
          {seasonLabel} · {lang === "ko" ? "타자/투수 전체 시즌 누적 기록" : "Full season batting & pitching stats"}
        </p>
      </div>

      {/* ── 타자 기록 ── */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--text-strong)" }}>
          {t("batting.title", lang)}
          <span style={{ fontSize: 11, color: C.whiteDim, fontWeight: 400 }}>
            OPS 순 · {battingWithPlayers?.length || 0}{lang === "ko" ? "명" : ""}
          </span>
        </h2>
        {battingWithPlayers && battingWithPlayers.length > 0 ? (
          <div className="app-table-shell" style={{ borderRadius: 20, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                  {batHeaders.map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 12px",
                        textAlign: "left",
                        fontSize: 10,
                        color: C.whiteDim,
                        fontWeight: 700,
                        textTransform: "uppercase" as const,
                        letterSpacing: 1.2,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {battingWithPlayers.map((b: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: "12px", color: C.whiteDim, fontWeight: 700 }}>{b.player.number}</td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      <Link
                        href={`/players/${b.player.id}?season=${encodeURIComponent(season)}`}
                        style={{ color: C.white, textDecoration: "none" }}
                      >
                        {getPlayerDisplayName(b.player.name, lang)}
                      </Link>
                    </td>
                    <td style={{ padding: "12px" }}>{b.pa}</td>
                    <td style={{ padding: "12px" }}>{b.ab}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: b.hits >= 5 ? "#22c55e" : C.white }}>{b.hits}</td>
                    <td style={{ padding: "12px" }}>{b.doubles}</td>
                    <td style={{ padding: "12px" }}>{b.triples}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: b.hr > 0 ? "#eab308" : C.white }}>{b.hr}</td>
                    <td style={{ padding: "12px" }}>{b.rbi}</td>
                    <td style={{ padding: "12px" }}>{b.bb}</td>
                    <td style={{ padding: "12px", color: b.so >= 8 ? C.red : C.white }}>{b.so}</td>
                    <td style={{ padding: "12px" }}>
                      <SbEditCell playerId={b.player_id} season={season} initialSb={b.sb ?? 0} />
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        fontWeight: 700,
                        color: parseFloat(b.avg) >= 0.3 ? "#22c55e" : parseFloat(b.avg) >= 0.2 ? "#eab308" : C.red,
                      }}
                    >
                      {b.avg}
                    </td>
                    <td style={{ padding: "12px" }}>{b.obp}</td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.min((b.opsNum / 2.2) * 100, 100)}%`,
                              height: "100%",
                              background: b.opsNum >= 1.0 ? "#22c55e" : b.opsNum >= 0.7 ? "#eab308" : C.red,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: b.opsNum >= 1.0 ? "#22c55e" : b.opsNum >= 0.7 ? "#eab308" : C.red,
                            minWidth: 45,
                          }}
                        >
                          {b.ops}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "48px 24px", textAlign: "center", color: C.whiteDim, background: "var(--surface-raised)", borderRadius: 20 }}>
            {lang === "ko" ? "타자 기록이 없습니다." : "No batting stats available."}
          </div>
        )}
      </section>

      {/* ── 투수 기록 ── */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--text-strong)" }}>
          {t("pitching.title", lang)}
          <span style={{ fontSize: 11, color: C.whiteDim, fontWeight: 400 }}>
            ERA 순 · {pitchingWithPlayers?.length || 0}{lang === "ko" ? "명" : ""}
          </span>
        </h2>
        {pitchingWithPlayers && pitchingWithPlayers.length > 0 ? (
          <div className="app-table-shell" style={{ borderRadius: 20, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                  {pitHeaders.map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 12px",
                        textAlign: "left",
                        fontSize: 10,
                        color: C.whiteDim,
                        fontWeight: 700,
                        textTransform: "uppercase" as const,
                        letterSpacing: 1.2,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pitchingWithPlayers.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: "12px", color: C.whiteDim, fontWeight: 700 }}>{p.player.number}</td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>{getPlayerDisplayName(p.player.name, lang)}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: p.w > 0 ? "#22c55e" : C.white }}>{p.w}</td>
                    <td style={{ padding: "12px", color: p.l > 0 ? C.red : C.white }}>{p.l}</td>
                    <td style={{ padding: "12px", color: p.sv > 0 ? "#eab308" : C.white }}>{p.sv}</td>
                    <td style={{ padding: "12px" }}>{formatIP(p.ip)}</td>
                    <td style={{ padding: "12px" }}>{p.ha}</td>
                    <td style={{ padding: "12px" }}>{p.er}</td>
                    <td style={{ padding: "12px", color: p.bb >= 10 ? C.red : C.white }}>{p.bb}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: p.so >= 10 ? "#22c55e" : C.white }}>{p.so}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: p.eraNum <= 3.0 ? "#22c55e" : p.eraNum <= 5.0 ? "#eab308" : C.red,
                        }}
                      >
                        {p.era}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>{p.whip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "48px 24px", textAlign: "center", color: C.whiteDim, background: "var(--surface-raised)", borderRadius: 20 }}>
            {lang === "ko" ? "투수 기록이 없습니다." : "No pitching stats available."}
          </div>
        )}
      </section>
    </div>
  );
}
