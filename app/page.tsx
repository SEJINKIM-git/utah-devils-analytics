import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/app/components/SearchBar";
import SeasonFilter from "@/app/components/SeasonFilter";
import LangToggle from "@/app/components/LangToggle";
import { buildPlayerIdentityKey, dedupePlayersByIdentity } from "@/lib/playerIdentity";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { t, Lang } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── 팀 컬러 — CSS 변수 우선, 라이트/다크 모두 대응 ── */
const C = {
  navyDark: "var(--bg)",
  navy: "var(--bg-secondary)",
  red: "#DC2626",
  redDark: "#991B1B",
  redLight: "#FF3B3B",
  white: "var(--text)",
  whiteDim: "var(--text-muted)",
  border: "var(--border)",
  borderSubtle: "var(--border)",
  cardBg: "var(--card-bg)",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
  const seasons = visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2025"];
  const season = normalizeSelectedSeason(params.season, seasons, preferredSeason || "2025", preferredSeason);
  const isPlaceholderSeason = isLockedSeason(season, visibility.activatedSeasons);

  const batting = isPlaceholderSeason
    ? []
    : allBatting?.filter((b) => (b.season || "2025") === season) || [];
  const pitching = isPlaceholderSeason
    ? []
    : allPitching?.filter((p) => (p.season || "2025") === season) || [];

  // ── 타자: 경기별 기록 전부 누적 합산 ──
  const battingByPlayer = new Map<string, any>();
  for (const b of batting) {
    const player = playerById.get(b.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);

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
  const uniqueBatting = Array.from(battingByPlayer.values());

  // ── 투수: 경기별 기록 전부 누적 합산 ──
  const pitchingByPlayer = new Map<string, any>();
  for (const p of pitching) {
    const player = playerById.get(p.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);

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
        ip: (parseFloat(acc.ip) || 0) + (parseFloat(p.ip) || 0),
        ha: acc.ha + (p.ha || 0),
        runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
        er: acc.er + (p.er || 0),
        bb: acc.bb + (p.bb || 0),
        hbp: acc.hbp + (p.hbp || 0),
        so: acc.so + (p.so || 0),
        hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
      });
    } else {
      pitchingByPlayer.set(identityKey, { ...p, player_id: player.id, player });
    }
  }
  const uniquePitching = Array.from(pitchingByPlayer.values());
  const hasSeasonData = uniqueBatting.length > 0 || uniquePitching.length > 0;
  const seasonPlayers = (uniqueBatting.length > 0 || uniquePitching.length > 0)
    ? dedupePlayersByIdentity([
        ...uniqueBatting.map((record) => record.player),
        ...uniquePitching.map((record) => record.player),
      ])
    : [];

  const battingWithPlayers = uniqueBatting
    .map((b) => {
      const player = b.player;
      if (!player) return null;
      const avg = b.ab > 0 ? (b.hits / b.ab).toFixed(3) : "---";
      const obp = b.pa > 0 ? ((b.hits + b.bb + b.hbp) / b.pa).toFixed(3) : "---";
      const slg = b.ab > 0 ? ((b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab).toFixed(3) : "---";
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

  const teamHits = uniqueBatting.reduce((a, b) => a + b.hits, 0);
  const teamAB = uniqueBatting.reduce((a, b) => a + b.ab, 0);
  const teamBB = uniqueBatting.reduce((a, b) => a + b.bb, 0);
  const teamHBP = uniqueBatting.reduce((a, b) => a + b.hbp, 0);
  const teamPA = uniqueBatting.reduce((a, b) => a + b.pa, 0);
  const teamSB = uniqueBatting.reduce((a, b) => a + b.sb, 0);
  const teamSO = uniqueBatting.reduce((a, b) => a + b.so, 0);
  const teamAvg = teamAB > 0 ? (teamHits / teamAB).toFixed(3) : "---";
  const teamOBP = teamPA > 0 ? ((teamHits + teamBB + teamHBP) / teamPA).toFixed(3) : "---";
  const teamW = uniquePitching.reduce((a, b) => a + b.w, 0);
  const teamL = uniquePitching.reduce((a, b) => a + b.l, 0);
  const teamSV = uniquePitching.reduce((a, b) => a + b.sv, 0);
  const teamIP = uniquePitching.reduce((a, b) => a + parseFloat(b.ip), 0);
  const teamER = uniquePitching.reduce((a, b) => a + b.er, 0);
  const teamERA = teamIP > 0 ? ((teamER / teamIP) * 5).toFixed(2) : "---";

  const seasonLabel = season === "Career" ? t("site.career", lang) : `${season} ${t("site.season", lang)}`;

  const batHeaders = ["#", t("batting.name", lang), t("batting.pa", lang), t("batting.ab", lang), t("batting.h", lang), t("batting.doubles", lang), t("batting.triples", lang), t("batting.hr", lang), t("batting.rbi", lang), t("batting.bb", lang), t("batting.so", lang), t("batting.sb", lang), t("batting.avg", lang), t("batting.obp", lang), "OPS"];
  const pitHeaders = ["#", t("batting.name", lang), t("pitching.w", lang), t("pitching.l", lang), t("pitching.sv", lang), t("pitching.ip", lang), t("pitching.ha", lang), t("pitching.er", lang), t("pitching.bb", lang), t("pitching.so", lang), "ERA", "WHIP"];

  return (
    <div style={{ minHeight: "100vh", background: C.navyDark, color: C.white, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* ═══ 헤더 ═══ */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDark} 100%)`, padding: "32px 40px", borderBottom: `1px solid ${C.borderSubtle}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* UD 캡 로고 */}
              <Image src="/logos/cap-logo.png" alt="Utah Devils" width={48} height={48} style={{ borderRadius: 12 }} />
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{t("site.title", lang)}</h1>
                <p style={{ fontSize: 13, color: C.whiteDim, margin: 0 }}>{seasonLabel} · {seasonPlayers.length} {t("site.players", lang)}</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/compare?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: `rgba(220,38,38,0.12)`, color: C.redLight, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{lang === "ko" ? "⚔️ 선수 비교" : "⚔️ Compare"}</Link>
              <Link href={`/team-analysis?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(34,197,94,0.12)", color: "#4ade80", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{lang === "ko" ? "🏟️ 팀 분석" : "🏟️ Team"}</Link>
              <Link href={`/game-review?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(249,115,22,0.12)", color: "#fb923c", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{lang === "ko" ? "📋 경기 리뷰" : "📋 Review"}</Link>
              <Link href={`/lineup?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(234,179,8,0.12)", color: "#eab308", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{lang === "ko" ? "⚾ 라인업" : "⚾ Lineup"}</Link>
              <Link href={`/schedule?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(168,85,247,0.12)", color: "#a855f7", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{lang === "ko" ? "📅 일정" : "📅 Schedule"}</Link>
              <Link href={`/upload?season=${season}`} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(59,130,246,0.18)", color: "#60a5fa", fontSize: 14, fontWeight: 700, textDecoration: "none", border: "1px solid rgba(59,130,246,0.35)" }}>{lang === "ko" ? "📤 업로드" : "📤 Upload"}</Link>
              <a href="https://www.instagram.com/uac.baseball" target="_blank" rel="noopener noreferrer" style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} title="@uac.baseball"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
              <LangToggle lang={lang} />
            </div>
          </div>
          <div style={{ flex: 1 }}><SearchBar players={seasonPlayers} batting={batting} pitching={pitching} season={season} /></div>
          <div style={{ marginTop: 16 }}><SeasonFilter seasons={seasons} basePath="/" /></div>
        </div>
      </div>

      {/* ═══ 본문 ═══ */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {/* 팀 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 36 }}>
          {[
            { label: t("stats.teamAvg", lang), value: teamAvg, color: "#22c55e" },
            { label: t("stats.teamOBP", lang), value: teamOBP, color: "#60a5fa" },
            { label: t("stats.teamERA", lang), value: teamERA, color: "#eab308" },
            { label: t("stats.sb", lang), value: hasSeasonData ? teamSB : "---", color: "#a78bfa" },
            { label: t("stats.wls", lang), value: hasSeasonData ? `${teamW}-${teamL}-${teamSV}` : "---", color: "#f97316" },
            { label: t("stats.so", lang), value: hasSeasonData ? teamSO : "---", color: C.red },
          ].map((stat, i) => (
            <div key={i} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px" }}>
              <div style={{ fontSize: 11, color: C.whiteDim, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {isPlaceholderSeason && (
          <div style={{ marginBottom: 28, padding: "18px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              {lang === "ko" ? "2026 시즌은 공식 기록 업로드 전까지 비워 둡니다." : "The 2026 season stays blank until official records are uploaded."}
            </div>
            <div style={{ fontSize: 12, color: C.whiteDim }}>
              {lang === "ko"
                ? "임시 테스트 데이터는 대시보드에서 표시하지 않도록 처리했습니다. 공식 파일 업로드가 시작되면 이 상태를 해제하면 됩니다."
                : "Temporary test data is intentionally hidden from the dashboard. This can be lifted once official uploads begin."}
            </div>
          </div>
        )}

        {/* ═══ 타격 테이블 ═══ */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>{t("batting.title", lang)} <span style={{ fontSize: 12, color: C.whiteDim }}>{t("batting.sortOps", lang)} · {battingWithPlayers?.length || 0}{lang === "ko" ? "명" : ""}</span></h2>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid rgba(220,38,38,0.12)` }}>
                  {batHeaders.map((h) => (
                    <th key={h} style={{ padding: "12px 10px", textAlign: "left", fontSize: 10, color: C.whiteDim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {battingWithPlayers?.map((b: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: "10px", color: C.whiteDim, fontWeight: 700 }}>{b.player.number}</td>
                    <td style={{ padding: "10px", fontWeight: 700 }}><Link href={`/players/${b.player.id}?season=${encodeURIComponent(season)}`} style={{ color: C.white, textDecoration: "none" }}>{b.player.name}</Link></td>
                    <td style={{ padding: "10px" }}>{b.pa}</td>
                    <td style={{ padding: "10px" }}>{b.ab}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: b.hits >= 5 ? "#22c55e" : C.white }}>{b.hits}</td>
                    <td style={{ padding: "10px" }}>{b.doubles}</td>
                    <td style={{ padding: "10px" }}>{b.triples}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: b.hr > 0 ? "#eab308" : C.white }}>{b.hr}</td>
                    <td style={{ padding: "10px" }}>{b.rbi}</td>
                    <td style={{ padding: "10px" }}>{b.bb}</td>
                    <td style={{ padding: "10px", color: b.so >= 8 ? C.red : C.white }}>{b.so}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: b.sb >= 6 ? "#a78bfa" : C.white }}>{b.sb}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: parseFloat(b.avg) >= 0.3 ? "#22c55e" : parseFloat(b.avg) >= 0.2 ? "#eab308" : C.red }}>{b.avg}</td>
                    <td style={{ padding: "10px" }}>{b.obp}</td>
                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min((b.opsNum / 2.2) * 100, 100)}%`, height: "100%", background: b.opsNum >= 1.0 ? "#22c55e" : b.opsNum >= 0.7 ? "#eab308" : C.red, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: b.opsNum >= 1.0 ? "#22c55e" : b.opsNum >= 0.7 ? "#eab308" : C.red, minWidth: 45 }}>{b.ops}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ 투구 테이블 ═══ */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>{t("pitching.title", lang)} <span style={{ fontSize: 12, color: C.whiteDim }}>{t("pitching.sortEra", lang)} · {pitchingWithPlayers?.length || 0}{lang === "ko" ? "명" : ""}</span></h2>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid rgba(220,38,38,0.12)` }}>
                  {pitHeaders.map((h) => (
                    <th key={h} style={{ padding: "12px 10px", textAlign: "left", fontSize: 10, color: C.whiteDim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pitchingWithPlayers?.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: "10px", color: C.whiteDim, fontWeight: 700 }}>{p.player.number}</td>
                    <td style={{ padding: "10px", fontWeight: 700 }}>{p.player.name}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: p.w > 0 ? "#22c55e" : C.white }}>{p.w}</td>
                    <td style={{ padding: "10px", color: p.l > 0 ? C.red : C.white }}>{p.l}</td>
                    <td style={{ padding: "10px", color: p.sv > 0 ? "#eab308" : C.white }}>{p.sv}</td>
                    <td style={{ padding: "10px" }}>{p.ip}</td>
                    <td style={{ padding: "10px" }}>{p.ha}</td>
                    <td style={{ padding: "10px" }}>{p.er}</td>
                    <td style={{ padding: "10px", color: p.bb >= 10 ? C.red : C.white }}>{p.bb}</td>
                    <td style={{ padding: "10px", fontWeight: 700, color: p.so >= 10 ? "#22c55e" : C.white }}>{p.so}</td>
                    <td style={{ padding: "10px" }}><span style={{ fontWeight: 700, color: p.eraNum <= 3.0 ? "#22c55e" : p.eraNum <= 5.0 ? "#eab308" : C.red }}>{p.era}</span></td>
                    <td style={{ padding: "10px" }}>{p.whip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
