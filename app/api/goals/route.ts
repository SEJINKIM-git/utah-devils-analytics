export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { findRelatedPlayersByIdentity } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { parseIP } from "@/lib/statFormatting";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const playerId = request.nextUrl.searchParams.get("playerId");
  const season = request.nextUrl.searchParams.get("season") || "2025";

  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  const { data: player } = await supabase.from("players").select("*").eq("id", playerId).single();
  if (!player) return NextResponse.json({ goals: [] });

  const [{ data: playersByNumber }, { data: playersByName }] = await Promise.all([
    supabase.from("players").select("*").eq("number", player.number),
    supabase.from("players").select("*").eq("name", player.name),
  ]);
  const relatedPlayers = findRelatedPlayersByIdentity(
    [player, ...(playersByNumber || []), ...(playersByName || [])],
    player
  );
  const relatedPlayerIds = Array.from(new Set(relatedPlayers.map((entry) => entry.id)));

  const [{ data: goals }, { data: batting }, { data: pitching }, { data: allGames }, { data: rosterUploads }] = await Promise.all([
    supabase.from("player_goals").select("*").in("player_id", relatedPlayerIds).eq("season", season).order("created_at"),
    supabase.from("batting_stats").select("*").in("player_id", relatedPlayerIds).eq("season", season),
    supabase.from("pitching_stats").select("*").in("player_id", relatedPlayerIds).eq("season", season),
    supabase.from("games").select("id, season, created_at"),
    supabase.from("roster_uploads").select("filename, players_snapshot, source, uploaded_at").order("uploaded_at", { ascending: false }),
  ]);

  // 대시보드/플레이어 페이지와 동일한 로스터 게이팅
  const latestRosterUpload = getLatestRosterUploadForSeason(rosterUploads || [], season);
  const rosterUploadedAt = latestRosterUpload?.upload?.uploaded_at
    ? new Date(latestRosterUpload.upload.uploaded_at).getTime()
    : null;
  const validGameIds = new Set(
    (allGames || [])
      .filter((g) => g.season === season)
      .filter((g) => {
        if (!rosterUploadedAt) return true;
        if (!g.created_at) return false;
        return new Date(g.created_at).getTime() >= rosterUploadedAt;
      })
      .map((g) => g.id)
  );
  const shouldGateStats = Boolean(latestRosterUpload);

  const gatedBatting = (batting || []).filter((b) => !shouldGateStats || !b.game_id || validGameIds.has(b.game_id));
  const gatedPitching = (pitching || [])
    .filter((p) => !shouldGateStats || !p.game_id || validGameIds.has(p.game_id))
    .filter((p) => parseIP(p.ip) > 0);

  // game_id 기준 중복 제거 (플레이어 페이지와 동일)
  const batByGame = new Map<number, typeof gatedBatting[0]>();
  for (const b of gatedBatting) {
    if (b.game_id == null) continue;
    const prev = batByGame.get(b.game_id);
    if (!prev || (b.pa || 0) >= (prev.pa || 0)) batByGame.set(b.game_id, b);
  }
  const dedupedBatting = Array.from(batByGame.values());

  const pitByGame = new Map<number, typeof gatedPitching[0]>();
  for (const p of gatedPitching) {
    if (p.game_id == null) continue;
    const prev = pitByGame.get(p.game_id);
    if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) pitByGame.set(p.game_id, p);
  }
  const dedupedPitching = Array.from(pitByGame.values());

  const bat = dedupedBatting.length > 0 ? dedupedBatting.reduce((acc, b) => ({
    ...acc,
    pa: (acc.pa||0)+(b.pa||0), ab: (acc.ab||0)+(b.ab||0),
    hits: (acc.hits||0)+(b.hits||0), doubles: (acc.doubles||0)+(b.doubles||0),
    triples: (acc.triples||0)+(b.triples||0), hr: (acc.hr||0)+(b.hr||0),
    rbi: (acc.rbi||0)+(b.rbi||0), bb: (acc.bb||0)+(b.bb||0),
    hbp: (acc.hbp||0)+(b.hbp||0), so: (acc.so||0)+(b.so||0), sb: (acc.sb||0)+(b.sb||0),
  }), { ...dedupedBatting[0], pa:0,ab:0,hits:0,doubles:0,triples:0,hr:0,rbi:0,bb:0,hbp:0,so:0,sb:0 }) : null;
  const pit = dedupedPitching.length > 0 ? dedupedPitching.reduce((acc, p) => ({
    ...acc,
    ip: (acc.ip||0) + parseIP(p.ip),
    w: (acc.w||0)+(p.w||0), l: (acc.l||0)+(p.l||0), sv: (acc.sv||0)+(p.sv||0),
    ha: (acc.ha||0)+(p.ha||0), er: (acc.er||0)+(p.er||0),
    bb: (acc.bb||0)+(p.bb||0), so: (acc.so||0)+(p.so||0),
  }), { ...dedupedPitching[0], ip:0,w:0,l:0,sv:0,ha:0,er:0,bb:0,so:0 }) : null;

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

  const dedupedGoals = Array.from(
    new Map(
      (goals || [])
        .slice()
        .sort((a: any, b: any) => Number(b.id) - Number(a.id))
        .map((goal: any) => [goal.stat_type, goal])
    ).values()
  );

  const goalsWithProgress = dedupedGoals.map((g: any) => {
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
