import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
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
    <div className="app-page-shell">
      <div className="app-page-header" style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          {lang === "ko" ? `경기 일정 · ${selectedSeason}` : `Game Schedule · ${selectedSeason}`}
        </h1>
        <div style={{ marginTop: 14 }}>
          <SeasonFilter seasons={seasons} basePath="/schedule" lang={lang} />
        </div>
      </div>
      <div style={{ padding: "24px 32px" }}>
        {isPlaceholderSeason && (
          <div className="app-page-note" style={{ marginBottom: 18, padding: "16px 18px", borderRadius: 14, fontSize: 13, lineHeight: 1.7 }}>
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
