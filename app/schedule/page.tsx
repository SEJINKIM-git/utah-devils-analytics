import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/app/components/LangToggle";
import GameCalendar from "@/app/components/GameCalendar";
import SeasonFilter from "@/app/components/SeasonFilter";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { Lang } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const params = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;
  const preferredSeason = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;

  let games: any[] = [];
  try {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("date", { ascending: true });
    if (!error && data) games = data;
  } catch (e) {
    console.error("games query error:", e);
  }

  const visibility = await getSeasonVisibility(
    supabase,
    [...games.map((game) => game.season), preferredSeason],
    preferredSeason,
    "2025"
  );
  const seasons = visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2025"];
  const selectedSeason = normalizeSelectedSeason(params.season, seasons, preferredSeason || seasons[0] || "2025", preferredSeason);
  const isPlaceholderSeason = isLockedSeason(selectedSeason, visibility.activatedSeasons);
  const seasonGames = isPlaceholderSeason
    ? []
    : games.filter((game) => (game.season || "2025") === selectedSeason);

  return (
    <div style={{ minHeight: "100vh", background: "#0E1428", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #141B3D 0%, #0E1428 100%)", padding: "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Link href={`/?season=${selectedSeason}`} style={{ textDecoration: "none" }}>
                <Image src="/logos/cap-logo.png" alt="Utah Devils" width={42} height={42} style={{ borderRadius: 12 }} />
              </Link>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                {lang === "ko" ? `경기 일정 · ${selectedSeason}` : `Game Schedule · ${selectedSeason}`}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "← 대시보드" : "← Dashboard"}
              </Link>
              <Link href={`/lineup?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(220,38,38,0.12)", color: "#FF3B3B", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "⚾ 라인업" : "⚾ Lineup"}
              </Link>
              <Link href={`/team-analysis?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(59,130,246,0.12)", color: "#60a5fa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "🤖 팀 분석" : "🤖 Analysis"}
              </Link>
              <LangToggle lang={lang} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SeasonFilter seasons={seasons} basePath="/schedule" />
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        {isPlaceholderSeason && (
          <div style={{ marginBottom: 18, padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.7 }}>
            {lang === "ko"
              ? "2026 시즌 일정/경기 결과는 공식 업로드 전까지 비워 둡니다."
              : "The 2026 schedule stays blank until official uploads begin."}
          </div>
        )}
        <GameCalendar games={seasonGames} lang={lang} season={selectedSeason} />
      </div>
    </div>
  );
}
