export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const playerId = request.nextUrl.searchParams.get("playerId");
  const season = request.nextUrl.searchParams.get("season") || "2025";

  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  const { data: goals } = await supabase
    .from("player_goals")
    .select("*")
    .eq("player_id", playerId)
    .eq("season", season)
    .order("created_at");

  const { data: batting } = await supabase
    .from("batting_stats")
    .select("*")
    .eq("player_id", playerId)
    .eq("season", season);

  const { data: pitching } = await supabase
    .from("pitching_stats")
    .select("*")
    .eq("player_id", playerId)
    .eq("season", season);

  const bat = batting?.[0];
  const pit = pitching?.[0];

  const getCurrentValue = (statType: string) => {
    if (!bat && !pit) return 0;
    switch (statType) {
      case "avg": return bat && bat.ab > 0 ? parseFloat((bat.hits / bat.ab).toFixed(3)) : 0;
      case "obp": return bat && bat.pa > 0 ? parseFloat(((bat.hits + bat.bb + bat.hbp) / bat.pa).toFixed(3)) : 0;
      case "ops": {
        if (!bat || bat.ab === 0) return 0;
        const obp = bat.pa > 0 ? (bat.hits + bat.bb + bat.hbp) / bat.pa : 0;
        const slg = (bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab;
        return parseFloat((obp + slg).toFixed(3));
      }
      case "hits": return bat?.hits || 0;
      case "hr": return bat?.hr || 0;
      case "rbi": return bat?.rbi || 0;
      case "sb": return bat?.sb || 0;
      case "bb": return bat?.bb || 0;
      case "so_bat": return bat?.so || 0;
      case "era": return pit && pit.ip > 0 ? parseFloat(((pit.er / pit.ip) * 5).toFixed(2)) : 0;
      case "whip": return pit && pit.ip > 0 ? parseFloat(((pit.ha + pit.bb) / pit.ip).toFixed(2)) : 0;
      case "wins": return pit?.w || 0;
      case "saves": return pit?.sv || 0;
      case "so_pit": return pit?.so || 0;
      case "ip": return pit?.ip || 0;
      default: return 0;
    }
  };

  const goalsWithProgress = (goals || []).map((g: any) => {
    const current = getCurrentValue(g.stat_type);
    const lowerIsBetter = ["era", "whip", "so_bat"].includes(g.stat_type);
    let progress;
    if (lowerIsBetter) {
      if (g.target_value === 0) progress = current === 0 ? 100 : 0;
      else progress = current <= g.target_value ? 100 : Math.max(0, 100 - ((current - g.target_value) / g.target_value) * 100);
    } else {
      progress = g.target_value > 0 ? Math.min(100, (current / g.target_value) * 100) : 0;
    }
    return { ...g, current, progress: Math.round(progress), lowerIsBetter };
  });

  return NextResponse.json({ goals: goalsWithProgress });
}

export async function POST(request: NextRequest) {
  try {
    const { playerId, season, statType, statLabel, targetValue } = await request.json();
    if (!playerId || !statType || !statLabel || targetValue === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data, error } = await supabase.from("player_goals").insert({
      player_id: playerId,
      season: season || "2025",
      stat_type: statType,
      stat_label: statLabel,
      target_value: targetValue,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ goal: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const goalId = request.nextUrl.searchParams.get("id");
  if (!goalId) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("player_goals").delete().eq("id", goalId);
  return NextResponse.json({ success: true });
}