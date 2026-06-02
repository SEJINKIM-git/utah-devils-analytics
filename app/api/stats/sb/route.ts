export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(request: NextRequest) {
  try {
    const { player_id, season, sb } = await request.json();

    if (!player_id || !season || sb == null) {
      return NextResponse.json(
        { error: "player_id, season, sb 필수" },
        { status: 400 }
      );
    }

    const sbVal = Math.max(0, parseInt(String(sb)) || 0);

    // Get all records for this player+season (oldest first)
    const { data: records, error: fetchErr } = await supabase
      .from("playing_records")
      .select("id")
      .eq("player_id", player_id)
      .eq("season", season)
      .order("date", { ascending: true });

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!records || records.length === 0) {
      return NextResponse.json({ error: "해당 시즌 기록 없음" }, { status: 404 });
    }

    // Zero all sb for this player+season
    await supabase
      .from("playing_records")
      .update({ sb: 0 })
      .eq("player_id", player_id)
      .eq("season", season);

    // Store total sb in the first game record
    const { error: updateErr } = await supabase
      .from("playing_records")
      .update({ sb: sbVal })
      .eq("id", records[0].id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true, sb: sbVal });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}
