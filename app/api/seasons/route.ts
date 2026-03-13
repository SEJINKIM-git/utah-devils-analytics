export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  ACTIVE_SEASON_COOKIE,
} from "@/lib/season";
import { getSeasonVisibility } from "@/lib/seasonVisibility";

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

  const visibility = await getSeasonVisibility(supabase, [
    ...(batting || []).map((row) => row.season),
    ...(pitching || []).map((row) => row.season),
    ...(games || []).map((row) => row.season),
    preferredFromCookie,
  ], preferredFromCookie, "2025");

  return Response.json({
    seasons: visibility.seasons,
    latestSeason: visibility.latestSeason,
    preferredSeason: visibility.preferredSeason,
    lockedSeasons: visibility.lockedSeasons,
    activatedSeasons: visibility.activatedSeasons,
  });
}
