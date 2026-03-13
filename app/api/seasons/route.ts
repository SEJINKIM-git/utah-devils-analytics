export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  ACTIVE_SEASON_COOKIE,
  getLatestSeason,
  getPreferredSeason,
  sortSeasons,
} from "@/lib/season";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const cookieStore = await cookies();
  const preferredFromCookie = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;
  const [{ data: batting }, { data: pitching }, { data: games }] = await Promise.all([
    supabase.from("batting_stats").select("season"),
    supabase.from("pitching_stats").select("season"),
    supabase.from("games").select("season"),
  ]);

  const seasons = sortSeasons([
    ...(batting || []).map((row) => row.season),
    ...(pitching || []).map((row) => row.season),
    ...(games || []).map((row) => row.season),
    preferredFromCookie,
  ]);

  return Response.json({
    seasons,
    latestSeason: getLatestSeason(seasons, "2025"),
    preferredSeason: getPreferredSeason(seasons, preferredFromCookie, "2025"),
  });
}
