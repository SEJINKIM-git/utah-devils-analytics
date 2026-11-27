import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import SeasonFilter from "@/app/components/SeasonFilter";
import SbEditCell from "@/app/components/SbEditCell";
import { appendCareerSeasonIfNeeded } from "@/lib/careerStats";
import { createMetricQuery, loadMetricDataset } from "@/lib/metrics/query";
import { buildRecordsTables } from "@/lib/metrics/recordsTable";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { t, Lang } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const C = {
  white: "var(--text)",
  whiteDim: "var(--text-muted)",
  red: "var(--accent)",
  border: "var(--border)",
  borderSubtle: "rgba(255,255,255,0.06)",
};

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

  // 기록 집계는 조회 함수(lib/metrics/query.ts)가 한다. 이 화면은 값을 받아 보여 주기만 한다.
  const { dataset, visibility, seasonValues } = await loadMetricDataset(supabase, { preferredSeason });
  const query = createMetricQuery(dataset);

  const seasons = appendCareerSeasonIfNeeded(
    visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2025"],
    seasonValues
  );
  const season = normalizeSelectedSeason(params.season, seasons, preferredSeason || "2025", preferredSeason);

  const { batting: battingWithPlayers, pitching: pitchingWithPlayers } = buildRecordsTables(query, season);

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
                {battingWithPlayers.map((b, i) => (
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
                {pitchingWithPlayers.map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: "12px", color: C.whiteDim, fontWeight: 700 }}>{p.player.number}</td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>{getPlayerDisplayName(p.player.name, lang)}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: p.w > 0 ? "#22c55e" : C.white }}>{p.w}</td>
                    <td style={{ padding: "12px", color: p.l > 0 ? C.red : C.white }}>{p.l}</td>
                    <td style={{ padding: "12px", color: p.sv > 0 ? "#eab308" : C.white }}>{p.sv}</td>
                    <td style={{ padding: "12px" }}>{p.ip}</td>
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
