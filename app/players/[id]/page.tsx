import AIButton from "@/app/components/AIButton";
import SeasonChart from "@/app/components/SeasonChart";
import PlayerGoals from "@/app/components/PlayerGoals";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import { appendCareerSeasonIfNeeded, filterRecordsForSeason } from "@/lib/careerStats";
import { findRelatedPlayersByIdentity } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { ACTIVE_SEASON_COOKIE, getLatestSeason, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility } from "@/lib/seasonVisibility";
import { t, Lang } from "@/lib/translations";
import { formatIP, parseIP } from "@/lib/statFormatting";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function PlayerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;
  const preferredSeason = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;

  const { data: player } = await supabase.from("players").select("*").eq("id", id).single();
  if (!player) {
    return <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t("player.notFound", lang)}</div>;
  }

  const [{ data: playersByNumber }, { data: playersByName }] = await Promise.all([
    supabase.from("players").select("*").eq("number", player.number),
    supabase.from("players").select("*").eq("name", player.name),
  ]);

  const relatedPlayers = findRelatedPlayersByIdentity(
    [player, ...(playersByNumber || []), ...(playersByName || [])],
    player
  );
  const relatedPlayerIds = Array.from(new Set(relatedPlayers.map((entry) => entry.id)));

  const [{ data: allBatting }, { data: allPitching }, { data: reports }, { data: allGames }, { data: rosterUploads }] = await Promise.all([
    supabase.from("batting_stats").select("*, games(date, opponent)").in("player_id", relatedPlayerIds),
    supabase.from("pitching_stats").select("*, games(date, opponent)").in("player_id", relatedPlayerIds),
    supabase.from("ai_reports").select("*").in("player_id", relatedPlayerIds).order("generated_at", { ascending: false }).limit(1),
    supabase.from("games").select("id, season, created_at"),
    supabase.from("roster_uploads").select("filename, players_snapshot, source, uploaded_at").order("uploaded_at", { ascending: false }),
  ]);

  const seasonValues = Array.from(new Set([
    ...((allBatting || []).map((record) => record.season)),
    ...((allPitching || []).map((record) => record.season)),
  ].filter(Boolean)));
  const visibility = await getSeasonVisibility(
    supabase,
    seasonValues,
    preferredSeason,
    "2025"
  );
  const availableSeasons = appendCareerSeasonIfNeeded(
    seasonValues,
    seasonValues
  );
  const fallbackSeason = getLatestSeason(visibility.seasons, preferredSeason || "2025");
  const requestedSeason = typeof query.season === "string" ? query.season.trim() : "";
  const selectedSeason = requestedSeason || normalizeSelectedSeason(
    undefined,
    availableSeasons,
    fallbackSeason,
    preferredSeason
  );

  // ── 대시보드와 동일한 로스터 게이팅 ──────────────────────────────────────
  const latestRosterUpload = getLatestRosterUploadForSeason(rosterUploads || [], selectedSeason);
  const rosterUploadedAt = latestRosterUpload?.upload?.uploaded_at
    ? new Date(latestRosterUpload.upload.uploaded_at).getTime()
    : null;
  const validGameIds = new Set(
    (allGames || [])
      .filter((g) => g.season === selectedSeason)
      .filter((g) => {
        if (!rosterUploadedAt) return true;
        if (!g.created_at) return false;
        return new Date(g.created_at).getTime() >= rosterUploadedAt;
      })
      .map((g) => g.id)
  );
  const shouldGateStats = Boolean(latestRosterUpload);

  const batRecords = filterRecordsForSeason(allBatting || [], selectedSeason, { lockedSeasons: visibility.lockedSeasons })
    .filter((b) => !shouldGateStats || !b.game_id || validGameIds.has(b.game_id));
  const pitRecords = filterRecordsForSeason(allPitching || [], selectedSeason, { lockedSeasons: visibility.lockedSeasons })
    .filter((p) => !shouldGateStats || !p.game_id || validGameIds.has(p.game_id))
    .filter((record) => parseIP(record.ip) > 0);

  // game_id 기준 중복 제거: 동일 경기 기록이 여러 player_id로 중복 집계되는 것을 방지
  // PA가 가장 높은 레코드를 우선 유지 (가장 완전한 기록)
  const batByGame = new Map<number, typeof batRecords[0]>();
  for (const b of batRecords) {
    if (b.game_id == null) continue;
    const prev = batByGame.get(b.game_id);
    if (!prev || (b.pa || 0) >= (prev.pa || 0)) batByGame.set(b.game_id, b);
  }
  const dedupedBat = Array.from(batByGame.values());

  const pitByGame = new Map<number, typeof pitRecords[0]>();
  for (const p of pitRecords) {
    if (p.game_id == null) continue;
    const prev = pitByGame.get(p.game_id);
    if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) pitByGame.set(p.game_id, p);
  }
  const dedupedPit = Array.from(pitByGame.values());

  const bat = dedupedBat.length > 0 ? dedupedBat.reduce((acc, b) => ({
    ...acc,
    pa: acc.pa + (b.pa || 0), ab: acc.ab + (b.ab || 0), runs: acc.runs + (b.runs || 0),
    hits: acc.hits + (b.hits || 0), doubles: acc.doubles + (b.doubles || 0),
    triples: acc.triples + (b.triples || 0), hr: acc.hr + (b.hr || 0),
    rbi: acc.rbi + (b.rbi || 0), bb: acc.bb + (b.bb || 0), hbp: acc.hbp + (b.hbp || 0),
    so: acc.so + (b.so || 0), sb: acc.sb + (b.sb || 0),
  }), { ...dedupedBat[0], pa:0, ab:0, runs:0, hits:0, doubles:0, triples:0, hr:0, rbi:0, bb:0, hbp:0, so:0, sb:0 }) : null;

  const pitch = dedupedPit.length > 0 ? dedupedPit.reduce((acc, p) => ({
    ...acc,
    w: acc.w + (p.w || 0), l: acc.l + (p.l || 0), sv: acc.sv + (p.sv || 0),
    hld: acc.hld + (p.hld || 0),
    ip: parseIP(acc.ip) + parseIP(p.ip),
    ha: acc.ha + (p.ha || 0), runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
    er: acc.er + (p.er || 0), bb: acc.bb + (p.bb || 0), hbp: acc.hbp + (p.hbp || 0),
    so: acc.so + (p.so || 0), hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
  }), { ...dedupedPit[0], w:0, l:0, sv:0, hld:0, ip:0, ha:0, runs_allowed:0, er:0, bb:0, hbp:0, so:0, hr_allowed:0 }) : null;

  const report = reports?.[0];

  const avg = bat && bat.ab > 0 ? (bat.hits / bat.ab).toFixed(3) : "---";
  const obp = bat && bat.pa > 0 ? ((bat.hits + bat.bb + bat.hbp) / bat.pa).toFixed(3) : "---";
  const slg = bat && bat.ab > 0 ? ((bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab).toFixed(3) : "---";
  const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
  const opsNum = parseFloat(ops) || 0;
  const era = pitch && pitch.ip > 0 ? ((pitch.er / pitch.ip) * 5).toFixed(2) : null;
  const whip = pitch && pitch.ip > 0 ? ((pitch.ha + pitch.bb) / pitch.ip).toFixed(2) : null;

  const currentStats = {
    avg: avg !== "---" ? parseFloat(avg) : 0,
    obp: obp !== "---" ? parseFloat(obp) : 0,
    ops: ops !== "---" ? parseFloat(ops) : 0,
    hits: bat?.hits || 0,
    hr: bat?.hr || 0,
    rbi: bat?.rbi || 0,
    sb: bat?.sb || 0,
    bb: bat?.bb || 0,
    so_bat: bat?.so || 0,
    era: era ? parseFloat(era) : 0,
    whip: whip ? parseFloat(whip) : 0,
    wins: pitch?.w || 0,
    saves: pitch?.sv || 0,
    so_pit: pitch?.so || 0,
    ip: pitch?.ip || 0,
  };

  // ── Career table: per-season aggregates ──────────────────────────────────
  const careerSeasonKeys = Array.from(new Set([
    ...(allBatting || []).map((b) => b.season),
    ...(allPitching || []).map((p) => p.season),
  ].filter(Boolean))).sort() as string[];

  type CareerRow = {
    season: string;
    pa?: number; ab?: number; hits?: number; hr?: number; rbi?: number; sb?: number;
    avg?: number; obp?: number; slg?: number; ops?: number;
    w?: number; l?: number; ip?: number; er?: number; ha?: number; bb_p?: number; so?: number;
    era?: number; whip?: number;
  };

  const careerRows: CareerRow[] = careerSeasonKeys.map((season) => {
    const bMap = new Map<number, any>();
    for (const b of (allBatting || []).filter((x) => x.season === season)) {
      if (b.game_id == null) continue;
      const prev = bMap.get(b.game_id);
      if (!prev || (b.pa || 0) >= (prev.pa || 0)) bMap.set(b.game_id, b);
    }
    const bArr: any[] = Array.from(bMap.values());

    const pMap = new Map<number, any>();
    for (const p of (allPitching || []).filter((x) => x.season === season)) {
      if (p.game_id == null) continue;
      const prev = pMap.get(p.game_id);
      if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) pMap.set(p.game_id, p);
    }
    const pArr = Array.from(pMap.values()).filter((p) => parseIP(p.ip) > 0);

    const row: CareerRow = { season };

    if (bArr.length > 0) {
      const pa = bArr.reduce((s, b) => s + (b.pa || 0), 0);
      const ab = bArr.reduce((s, b) => s + (b.ab || 0), 0);
      const hits = bArr.reduce((s, b) => s + (b.hits || 0), 0);
      const doubles = bArr.reduce((s, b) => s + (b.doubles || 0), 0);
      const triples = bArr.reduce((s, b) => s + (b.triples || 0), 0);
      const hr = bArr.reduce((s, b) => s + (b.hr || 0), 0);
      const rbi = bArr.reduce((s, b) => s + (b.rbi || 0), 0);
      const bb = bArr.reduce((s, b) => s + (b.bb || 0), 0);
      const hbp = bArr.reduce((s, b) => s + (b.hbp || 0), 0);
      const sb = bArr.reduce((s, b) => s + (b.sb || 0), 0);
      const obpN = pa > 0 ? (hits + bb + hbp) / pa : 0;
      const slgN = ab > 0 ? (hits - doubles - triples - hr + doubles * 2 + triples * 3 + hr * 4) / ab : 0;
      row.pa = pa; row.ab = ab; row.hits = hits; row.hr = hr;
      row.rbi = rbi; row.sb = sb;
      row.avg = ab > 0 ? hits / ab : 0;
      row.obp = obpN; row.slg = slgN; row.ops = obpN + slgN;
    }

    if (pArr.length > 0) {
      const totalIp = pArr.reduce((s, p) => s + parseIP(p.ip), 0);
      const ha = pArr.reduce((s, p) => s + (p.ha || 0), 0);
      const er = pArr.reduce((s, p) => s + (p.er || 0), 0);
      const bbP = pArr.reduce((s, p) => s + (p.bb || 0), 0);
      const so = pArr.reduce((s, p) => s + (p.so || 0), 0);
      const w = pArr.reduce((s, p) => s + (p.w || 0), 0);
      const l = pArr.reduce((s, p) => s + (p.l || 0), 0);
      row.ip = totalIp; row.ha = ha; row.er = er; row.bb_p = bbP; row.so = so;
      row.w = w; row.l = l;
      row.era = totalIp > 0 ? (er / totalIp) * 5 : 0;
      row.whip = totalIp > 0 ? (ha + bbP) / totalIp : 0;
    }

    return row;
  }).filter((r) => r.pa !== undefined || r.ip !== undefined);

  const careerTotals: CareerRow = { season: "Career" };
  if (careerRows.some((r) => r.ab !== undefined)) {
    const tPa = careerRows.reduce((s, r) => s + (r.pa || 0), 0);
    const tAb = careerRows.reduce((s, r) => s + (r.ab || 0), 0);
    const tHits = careerRows.reduce((s, r) => s + (r.hits || 0), 0);
    const tHr = careerRows.reduce((s, r) => s + (r.hr || 0), 0);
    const tRbi = careerRows.reduce((s, r) => s + (r.rbi || 0), 0);
    const tSb = careerRows.reduce((s, r) => s + (r.sb || 0), 0);
    const tBb = careerRows.filter((r) => r.obp !== undefined).reduce((s, r) => {
      const bbHbp = r.pa && r.ab && r.hits !== undefined ? (r.obp || 0) * r.pa - r.hits : 0;
      return s + bbHbp;
    }, 0);
    const tObp = tPa > 0 ? (tHits + tBb) / tPa : 0;
    const tSlg = tAb > 0 ? careerRows.reduce((s, r) => s + (r.slg || 0) * (r.ab || 0), 0) / tAb : 0;
    careerTotals.pa = tPa; careerTotals.ab = tAb; careerTotals.hits = tHits;
    careerTotals.hr = tHr; careerTotals.rbi = tRbi; careerTotals.sb = tSb;
    careerTotals.avg = tAb > 0 ? tHits / tAb : 0;
    careerTotals.obp = tObp; careerTotals.slg = tSlg; careerTotals.ops = tObp + tSlg;
  }
  if (careerRows.some((r) => r.ip !== undefined)) {
    const tIp = careerRows.reduce((s, r) => s + (r.ip || 0), 0);
    const tHa = careerRows.reduce((s, r) => s + (r.ha || 0), 0);
    const tEr = careerRows.reduce((s, r) => s + (r.er || 0), 0);
    const tBbP = careerRows.reduce((s, r) => s + (r.bb_p || 0), 0);
    const tSo = careerRows.reduce((s, r) => s + (r.so || 0), 0);
    const tW = careerRows.reduce((s, r) => s + (r.w || 0), 0);
    const tL = careerRows.reduce((s, r) => s + (r.l || 0), 0);
    careerTotals.ip = tIp; careerTotals.ha = tHa; careerTotals.er = tEr;
    careerTotals.bb_p = tBbP; careerTotals.so = tSo;
    careerTotals.w = tW; careerTotals.l = tL;
    careerTotals.era = tIp > 0 ? (tEr / tIp) * 5 : 0;
    careerTotals.whip = tIp > 0 ? (tHa + tBbP) / tIp : 0;
  }

  const showCareerBat = careerRows.some((r) => r.ab !== undefined);
  const showCareerPit = careerRows.some((r) => r.ip !== undefined);

  // 4 hero metric cards
  const metricCards = bat ? [
    { label: "OPS", value: ops, color: "var(--coral)" },
    { label: "타율 AVG", value: avg, color: "var(--green)" },
    { label: "출루율 OBP", value: obp, color: "var(--blue)" },
    { label: "도루 SB", value: String(bat.sb || 0), color: "#a78bfa" },
  ] : pitch && pitch.ip > 0 ? [
    { label: "ERA", value: era || "---", color: era && parseFloat(era) <= 3.5 ? "var(--green)" : "var(--coral)" },
    { label: "WHIP", value: whip || "---", color: "var(--blue)" },
    { label: "K/5이닝", value: pitch.ip > 0 ? ((pitch.so / pitch.ip) * 5).toFixed(1) : "---", color: "#a78bfa" },
    { label: "이닝 IP", value: formatIP(pitch.ip), color: "#f59e0b" },
  ] : [];

  const getOpsGrade = (v: number) => {
    if (v >= 1.0) return { grade: "A+", color: "#22c55e", label: t("grade.elite", lang) };
    if (v >= 0.85) return { grade: "A", color: "#22c55e", label: t("grade.allstar", lang) };
    if (v >= 0.7) return { grade: "B", color: "#eab308", label: t("grade.aboveAvg", lang) };
    if (v >= 0.5) return { grade: "C", color: "#f97316", label: t("grade.belowAvg", lang) };
    return { grade: "D", color: "#ef4444", label: t("grade.needsWork", lang) };
  };
  const getEraGrade = (v: number) => {
    if (v <= 2.5) return { grade: "A+", color: "#22c55e", label: t("grade.ace", lang) };
    if (v <= 3.5) return { grade: "A", color: "#22c55e", label: t("grade.excellent", lang) };
    if (v <= 5.0) return { grade: "B", color: "#eab308", label: t("grade.average", lang) };
    if (v <= 7.0) return { grade: "C", color: "#f97316", label: t("grade.unstable", lang) };
    return { grade: "D", color: "#ef4444", label: t("grade.needsWork", lang) };
  };
  const opsGrade = getOpsGrade(opsNum);
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (lang === "en") return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };
  const currentSeason = selectedSeason || fallbackSeason || preferredSeason || "2025";

  return (
    <div style={{ minHeight: "100vh", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "32px 32px 60px" }}>

        {/* Hero: player card + 4 metric cards */}
        <div style={{ display: "flex", gap: 24, marginBottom: 32, alignItems: "flex-start" }}>
          {/* Player card */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              width: 108, height: 108, borderRadius: 24,
              background: "linear-gradient(135deg, var(--coral) 0%, #991b1b 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 16px 40px rgba(242,161,150,0.2)",
            }}>
              <span className="num" style={{ fontSize: 52, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{player.number}</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "14px 0 8px", letterSpacing: "-0.02em" }}>{player.name}</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "var(--blue-dim)", color: "var(--blue)", fontWeight: 700 }}>#{player.number}</span>
              {player.is_pitcher && <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "rgba(234,179,8,0.12)", color: "#eab308", fontWeight: 700 }}>{t("player.pitcher", lang)}</span>}
              <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-faint)", fontWeight: 600 }}>{currentSeason}</span>
            </div>
          </div>

          {/* 4 metric cards */}
          {metricCards.length > 0 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {metricCards.map(({ label, value, color }) => (
                <div key={label} style={{
                  background: "var(--surface-raised)", borderRadius: "var(--radius-sm)",
                  padding: "20px 22px", position: "relative", overflow: "hidden",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "var(--text-faint)", marginBottom: 10 }}>
                    {label}
                  </div>
                  <div className="num" style={{ fontSize: 44, fontWeight: 800, color, lineHeight: 1 }}>
                    {value}
                  </div>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>

          {/* Left column: stats + career table */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>

            {/* Batting stats */}
            {bat && (
              <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: opsGrade.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: opsGrade.color }}>{opsGrade.grade}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{t("player.battingRecord", lang)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-faint)" }}>OPS {ops} · {opsGrade.label}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                  {[
                    { label: t("batting.pa", lang), value: bat.pa },
                    { label: t("batting.ab", lang), value: bat.ab },
                    { label: t("batting.h", lang), value: bat.hits, color: bat.hits >= 5 ? "var(--green)" : undefined },
                    { label: t("batting.hr", lang), value: bat.hr, color: bat.hr > 0 ? "#eab308" : undefined },
                    { label: t("batting.rbi", lang), value: bat.rbi },
                    { label: t("batting.runs", lang), value: bat.runs },
                    { label: t("batting.doubles", lang), value: bat.doubles },
                    { label: t("batting.triples", lang), value: bat.triples },
                    { label: t("batting.bb", lang), value: bat.bb, color: bat.bb >= 10 ? "var(--blue)" : undefined },
                    { label: t("batting.hbp", lang), value: bat.hbp },
                    { label: t("batting.so", lang), value: bat.so, color: bat.so >= 8 ? "var(--red)" : undefined },
                    { label: t("batting.sb", lang), value: bat.sb, color: bat.sb >= 6 ? "#a78bfa" : undefined },
                  ].map((stat, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" as const }}>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 5 }}>{stat.label}</div>
                      <div className="num" style={{ fontSize: 20, fontWeight: 800, color: stat.color || "var(--text)" }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pitching stats */}
            {pitch && pitch.ip > 0 && (() => {
              const eraNum = parseFloat(era || "0");
              const eraGrade = getEraGrade(eraNum);
              return (
                <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: eraGrade.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: eraGrade.color }}>{eraGrade.grade}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{t("player.pitchingRecord", lang)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>ERA {era} · {eraGrade.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    {[
                      { label: t("pitching.ip", lang), value: formatIP(pitch.ip) },
                      { label: t("pitching.ha", lang), value: pitch.ha },
                      { label: t("pitching.ra", lang), value: pitch.runs_allowed },
                      { label: t("pitching.er", lang), value: pitch.er },
                      { label: t("pitching.bb", lang), value: pitch.bb, color: pitch.bb >= 10 ? "var(--red)" : undefined },
                      { label: t("pitching.so", lang), value: pitch.so, color: pitch.so >= 10 ? "var(--green)" : undefined },
                      { label: t("pitching.hra", lang), value: pitch.hr_allowed },
                    ].map((stat, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" as const }}>
                        <div style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 5 }}>{stat.label}</div>
                        <div className="num" style={{ fontSize: 20, fontWeight: 800, color: stat.color || "var(--text)" }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Season chart */}
            <SeasonChart batting={(() => {
              const m = new Map<number, any>();
              for (const b of allBatting || []) {
                if (!b.game_id) continue;
                const p = m.get(b.game_id);
                if (!p || (b.pa || 0) >= (p.pa || 0)) m.set(b.game_id, b);
              }
              return Array.from(m.values());
            })()} pitching={(() => {
              const m = new Map<number, any>();
              for (const p of allPitching || []) {
                if (!p.game_id) continue;
                const prev = m.get(p.game_id);
                if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) m.set(p.game_id, p);
              }
              return Array.from(m.values());
            })()} lang={lang} />

            {/* Career overview table */}
            {careerRows.length > 1 && (
              <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "var(--text-faint)", marginBottom: 18 }}>
                  Career Overview
                </div>

                {showCareerBat && (
                  <div style={{ overflowX: "auto" as const, marginBottom: showCareerPit ? 24 : 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: "var(--text-faint)", fontSize: 11, letterSpacing: 0.5 }}>
                          {["시즌", "타수", "안타", "홈런", "타점", "도루", "타율", "출루율", "장타율", "OPS"].map((h, i) => (
                            <th key={h} style={{ textAlign: (i === 0 ? "left" : "center") as "left" | "center", padding: "6px 8px", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...careerRows.filter((r) => r.ab !== undefined), ...(careerTotals.ab !== undefined ? [careerTotals] : [])].map((r) => {
                          const isCareer = r.season === "Career";
                          return (
                            <tr key={r.season} style={{ boxShadow: "inset 0 1px 0 rgba(148,163,184,.06)", fontStyle: isCareer ? "italic" : undefined }}>
                              <td style={{ padding: "8px 8px", fontWeight: 700, color: isCareer ? "var(--text-faint)" : "var(--text)" }}>{r.season}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.ab ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.hits ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.hr ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.rbi ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.sb ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.avg !== undefined ? r.avg.toFixed(3) : "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.obp !== undefined ? r.obp.toFixed(3) : "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.slg !== undefined ? r.slg.toFixed(3) : "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const, fontWeight: 700, color: "var(--coral)" }}>{r.ops !== undefined ? r.ops.toFixed(3) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {showCareerPit && (
                  <div style={{ overflowX: "auto" as const }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: "var(--text-faint)", fontSize: 11, letterSpacing: 0.5 }}>
                          {["시즌", "승", "패", "이닝", "ERA", "피안타", "자책", "볼넷", "삼진", "WHIP"].map((h, i) => (
                            <th key={h} style={{ textAlign: (i === 0 ? "left" : "center") as "left" | "center", padding: "6px 8px", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...careerRows.filter((r) => r.ip !== undefined), ...(careerTotals.ip !== undefined ? [careerTotals] : [])].map((r) => {
                          const isCareer = r.season === "Career";
                          return (
                            <tr key={r.season} style={{ boxShadow: "inset 0 1px 0 rgba(148,163,184,.06)", fontStyle: isCareer ? "italic" : undefined }}>
                              <td style={{ padding: "8px 8px", fontWeight: 700, color: isCareer ? "var(--text-faint)" : "var(--text)" }}>{r.season}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.w ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.l ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.ip !== undefined ? formatIP(r.ip) : "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const, fontWeight: 700, color: "var(--coral)" }}>{r.era !== undefined ? r.era.toFixed(2) : "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.ha ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.er ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.bb_p ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.so ?? "-"}</td>
                              <td className="num" style={{ padding: "8px 8px", textAlign: "center" as const }}>{r.whip !== undefined ? r.whip.toFixed(2) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column: AI report + PlayerGoals */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

            {/* AI 분석 리포트 */}
            <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--blue), #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>AI</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t("ai.title", lang)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>#{player.number} {player.name}</div>
                  </div>
                </div>
                {report && <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "right" as const }}>{formatDate(report.generated_at)}</div>}
              </div>
              {report ? (
                <div>
                  <div style={{ padding: "12px 14px", background: "var(--blue-dim)", borderLeft: "3px solid var(--blue)", borderRadius: "0 8px 8px 0", fontSize: 13, color: "var(--text)", lineHeight: 1.7, marginBottom: 16 }}>{report.summary}</div>
                  {report.strengths && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", letterSpacing: 1, marginBottom: 6 }}>{t("ai.strengths", lang)}</div>
                      {JSON.parse(report.strengths).map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.8, paddingLeft: 12 }}>· {s}</div>
                      ))}
                    </div>
                  )}
                  {report.improvements && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--coral)", letterSpacing: 1, marginBottom: 6 }}>{t("ai.improvements", lang)}</div>
                      {JSON.parse(report.improvements).map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.8, paddingLeft: 12 }}>· {s}</div>
                      ))}
                    </div>
                  )}
                  {report.training_plan && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", letterSpacing: 1, marginBottom: 6 }}>{t("ai.trainingPlan", lang)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.8, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>{report.training_plan}</div>
                    </div>
                  )}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                    <AIButton playerId={player.id} hasReport={true} lang={lang} />
                  </div>
                </div>
              ) : (
                <AIButton playerId={player.id} lang={lang} />
              )}
            </div>

            {/* 개인 목표 달성도 */}
            <PlayerGoals playerId={player.id} isPitcher={player.is_pitcher} lang={lang} season={currentSeason} currentStats={currentStats} />
          </div>
        </div>
      </div>
    </div>
  );
}
