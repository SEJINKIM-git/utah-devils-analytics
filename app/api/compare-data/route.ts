export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data: players } = await supabase.from("players").select("*").order("number");
  const { data: batting } = await supabase.from("batting_stats").select("*");
  const { data: pitching } = await supabase.from("pitching_stats").select("*");
  const { data: rosterUploads } = await supabase
    .from("roster_uploads")
    .select("filename,players_snapshot,source,uploaded_at")
    .order("uploaded_at", { ascending: false });

  return Response.json({ players, batting, pitching, rosterUploads });
}
