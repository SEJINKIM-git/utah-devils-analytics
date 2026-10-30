export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { selectEffectiveBattingRows, selectEffectiveStatRows } from "@/lib/statRows";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data: players } = await supabase.from("players").select("*").order("number");
  const { data: battingRaw } = await supabase.from("batting_stats").select("*");
  const { data: pitchingRaw } = await supabase.from("pitching_stats").select("*");
  const batting = selectEffectiveBattingRows(battingRaw);
  const pitching = selectEffectiveStatRows(pitchingRaw);
  const { data: rosterUploads } = await supabase
    .from("roster_uploads")
    .select("filename,players_snapshot,source,uploaded_at")
    .order("uploaded_at", { ascending: false });

  return Response.json({ players, batting, pitching, rosterUploads });
}
