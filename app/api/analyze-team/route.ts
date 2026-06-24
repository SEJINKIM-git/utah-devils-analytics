// app/api/analyze-team/route.ts
export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import { filterRecordsForSeason, isCareerSeason } from "@/lib/careerStats";
import { buildPlayerIdentityKey, dedupePlayersByIdentity } from "@/lib/playerIdentity";
import { getActivatedPlaceholderSeasons, isLockedSeason } from "@/lib/seasonVisibility";
import { getTrainingPlanGuidance } from "@/lib/trainingPlanGuidance";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { parseIP, formatIP } from "@/lib/statFormatting";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type Lang = "ko" | "en";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const lang: Lang = body?.lang === "en" ? "en" : "ko";
    const season: string = String(body?.season ?? "2025");
    const activatedSeasons = await getActivatedPlaceholderSeasons(supabase);

    if (isLockedSeason(season, activatedSeasons)) {
      return Response.json(
        { error: lang === "ko" ? `${season} 시즌은 공식 기록 업로드 전까지 팀 분석을 비워 둡니다` : `${season} analysis is locked until official records are uploaded` },
        { status: 400 }
      );
    }

    // game_id 포함 + 로스터 게이팅용 games/roster_uploads 추가
    const [
      { data: players, error: playersErr },
      { data: batting, error: batErr },
      { data: pitching, error: pitErr },
      { data: allGames },
      { data: rosterUploads },
    ] = await Promise.all([
      supabase.from("players").select("id, name, number").order("number", { ascending: true }),
      isCareerSeason(season)
        ? supabase.from("batting_stats").select("player_id, season, game_id, pa, ab, hits, hr, rbi, bb, hbp, so, sb, doubles, triples")
        : supabase.from("batting_stats").select("player_id, season, game_id, pa, ab, hits, hr, rbi, bb, hbp, so, sb, doubles, triples").eq("season", season),
      isCareerSeason(season)
        ? supabase.from("pitching_stats").select("player_id, season, game_id, ip, er, w, l, sv, so, bb, ha")
        : supabase.from("pitching_stats").select("player_id, season, game_id, ip, er, w, l, sv, so, bb, ha").eq("season", season),
      supabase.from("games").select("id, season, created_at"),
      supabase.from("roster_uploads").select("filename, players_snapshot, source, uploaded_at").order("uploaded_at", { ascending: false }),
    ]);

    if (playersErr) throw new Error(playersErr.message);
    if (batErr) throw new Error(batErr.message);
    if (pitErr) throw new Error(pitErr.message);

    if (!players || players.length === 0) {
      return Response.json(
        { error: lang === "ko" ? "선수 데이터가 없습니다" : "No player data" },
        { status: 400 }
      );
    }

    // 대시보드와 동일한 로스터 게이팅
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

    const safePlayers = players ?? [];
    const lockedSeasons = [...new Set([
      ...((batting || []).map((row) => row.season)),
      ...((pitching || []).map((row) => row.season)),
    ].filter((value): value is string => Boolean(value)))].filter((value) => isLockedSeason(value, activatedSeasons));

    const safeBatting = filterRecordsForSeason(batting ?? [], season, { lockedSeasons })
      .filter((b) => !shouldGateStats || !b.game_id || validGameIds.has(b.game_id));
    const safePitching = filterRecordsForSeason(pitching ?? [], season, { lockedSeasons })
      .filter((p) => !shouldGateStats || !p.game_id || validGameIds.has(p.game_id))
      .filter((p) => parseIP(p.ip) > 0);

    const playerById = new Map(safePlayers.map((player) => [player.id, player]));
    const identityPlayers = dedupePlayersByIdentity(safePlayers);

    const n = (v: any) => (typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0);

    // 선수별 + 경기별 중복 제거 (같은 선수의 여러 player_id가 같은 game_id를 가질 경우 한 번만 집계)
    const batDedupMap = new Map<string, (typeof safeBatting)[number]>();
    for (const row of safeBatting) {
      const player = playerById.get(row.player_id);
      if (!player || !row.game_id) continue;
      const identKey = buildPlayerIdentityKey(player.name, player.number);
      const key = `${identKey}::${row.game_id}`;
      const prev = batDedupMap.get(key);
      if (!prev || n(row.pa) >= n(prev.pa)) batDedupMap.set(key, row);
    }
    const dedupedBatting = Array.from(batDedupMap.values());

    const pitDedupMap = new Map<string, (typeof safePitching)[number]>();
    for (const row of safePitching) {
      const player = playerById.get(row.player_id);
      if (!player || !row.game_id) continue;
      const identKey = buildPlayerIdentityKey(player.name, player.number);
      const key = `${identKey}::${row.game_id}`;
      const prev = pitDedupMap.get(key);
      if (!prev || parseIP(row.ip) >= parseIP(prev.ip)) pitDedupMap.set(key, row);
    }
    const dedupedPitching = Array.from(pitDedupMap.values());

    // 선수별 누적 타격 통계 (dedup 완료된 레코드 기준)
    const battingByPlayer = new Map<string, (typeof dedupedBatting)[number] & { player?: (typeof safePlayers)[number] }>();
    for (const row of dedupedBatting) {
      const player = playerById.get(row.player_id);
      if (!player) continue;
      const key = buildPlayerIdentityKey(player.name, player.number);
      const current = battingByPlayer.get(key);
      if (current) {
        battingByPlayer.set(key, {
          ...current,
          player: current.player && current.player.id > player.id ? current.player : player,
          pa: n(current.pa) + n(row.pa),
          ab: n(current.ab) + n(row.ab),
          hits: n(current.hits) + n(row.hits),
          hr: n(current.hr) + n(row.hr),
          rbi: n(current.rbi) + n(row.rbi),
          bb: n(current.bb) + n(row.bb),
          hbp: n(current.hbp) + n(row.hbp),
          so: n(current.so) + n(row.so),
          sb: n(current.sb) + n(row.sb),
          doubles: n(current.doubles) + n(row.doubles),
          triples: n(current.triples) + n(row.triples),
        });
      } else {
        battingByPlayer.set(key, { ...row, player });
      }
    }

    // 선수별 누적 투구 통계 (parseIP 적용하여 IP 정확 계산)
    const pitchingByPlayer = new Map<string, (typeof dedupedPitching)[number] & { player?: (typeof safePlayers)[number]; ip: number }>();
    for (const row of dedupedPitching) {
      const player = playerById.get(row.player_id);
      if (!player) continue;
      const key = buildPlayerIdentityKey(player.name, player.number);
      const current = pitchingByPlayer.get(key);
      if (current) {
        pitchingByPlayer.set(key, {
          ...current,
          player: current.player && current.player.id > player.id ? current.player : player,
          ip: (current.ip || 0) + parseIP(row.ip),
          er: n(current.er) + n(row.er),
          w: n(current.w) + n(row.w),
          l: n(current.l) + n(row.l),
          sv: n(current.sv) + n(row.sv),
          so: n(current.so) + n(row.so),
          bb: n(current.bb) + n(row.bb),
          ha: n(current.ha) + n(row.ha),
        });
      } else {
        pitchingByPlayer.set(key, { ...row, player, ip: parseIP(row.ip) });
      }
    }

    // 팀 합계: dedup 완료된 선수별 통계에서 집계 (대시보드와 동일한 기준)
    const allBatStats = Array.from(battingByPlayer.values());
    const allPitStats = Array.from(pitchingByPlayer.values());

    const teamPA = allBatStats.reduce((a, b) => a + n(b.pa), 0);
    const teamAB = allBatStats.reduce((a, b) => a + n(b.ab), 0);
    const teamH = allBatStats.reduce((a, b) => a + n(b.hits), 0);
    const teamHR = allBatStats.reduce((a, b) => a + n(b.hr), 0);
    const teamRBI = allBatStats.reduce((a, b) => a + n(b.rbi), 0);
    const teamBB = allBatStats.reduce((a, b) => a + n(b.bb), 0);
    const teamHBP = allBatStats.reduce((a, b) => a + n(b.hbp), 0);
    const teamSO = allBatStats.reduce((a, b) => a + n(b.so), 0);
    const teamSB = allBatStats.reduce((a, b) => a + n(b.sb), 0);
    const team2B = allBatStats.reduce((a, b) => a + n(b.doubles), 0);
    const team3B = allBatStats.reduce((a, b) => a + n(b.triples), 0);

    const teamAvg = teamAB > 0 ? (teamH / teamAB).toFixed(3) : "0.000";
    const teamOBP = teamPA > 0 ? ((teamH + teamBB + teamHBP) / teamPA).toFixed(3) : "0.000";

    const teamIP = allPitStats.reduce((a, b) => a + (b.ip || 0), 0);
    const teamER = allPitStats.reduce((a, b) => a + n(b.er), 0);
    const teamW = allPitStats.reduce((a, b) => a + n(b.w), 0);
    const teamL = allPitStats.reduce((a, b) => a + n(b.l), 0);
    const teamSV = allPitStats.reduce((a, b) => a + n(b.sv), 0);
    const teamPSO = allPitStats.reduce((a, b) => a + n(b.so), 0);
    const teamPBB = allPitStats.reduce((a, b) => a + n(b.bb), 0);
    const teamHA = allPitStats.reduce((a, b) => a + n(b.ha), 0);

    // 5이닝제(아마추어/리그 규정) 기준: ERA = ER/IP * 5
    const teamERA = teamIP > 0 ? ((teamER / teamIP) * 5).toFixed(2) : "0.00";
    const teamWHIP = teamIP > 0 ? ((teamHA + teamPBB) / teamIP).toFixed(2) : "0.00";

    // 개인별 주요 지표 텍스트 생성
    let playerStats = "\n[Individual Player Stats]\n";
    for (const p of identityPlayers) {
      const playerKey = buildPlayerIdentityKey(p.name, p.number);
      const bat = battingByPlayer.get(playerKey);
      const pit = pitchingByPlayer.get(playerKey);
      if (!bat && !pit) continue;

      playerStats += `\n${p.name} (#${p.number}):\n`;

      if (bat && n(bat.ab) > 0) {
        const ab = n(bat.ab);
        const hits = n(bat.hits);
        const pa = n(bat.pa);
        const bb = n(bat.bb);
        const hbp = n(bat.hbp);
        const doubles = n(bat.doubles);
        const triples = n(bat.triples);
        const hr = n(bat.hr);

        const avg = (hits / ab).toFixed(3);
        const obp = pa > 0 ? ((hits + bb + hbp) / pa).toFixed(3) : "0.000";
        const singles = hits - doubles - triples - hr;
        const slg = ((singles + doubles * 2 + triples * 3 + hr * 4) / ab).toFixed(3);
        const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3);

        playerStats += `  Batting: AVG ${avg} | OBP ${obp} | OPS ${ops} | H ${hits} | HR ${hr} | RBI ${n(bat.rbi)} | BB ${bb} | SO ${n(bat.so)} | SB ${n(bat.sb)}\n`;
      }

      if (pit && (pit.ip || 0) > 0) {
        const ip = pit.ip || 0;
        const er = n(pit.er);
        const era = ((er / ip) * 5).toFixed(2);
        playerStats += `  Pitching: ERA ${era} | W${n(pit.w)}-L${n(pit.l)} | IP ${formatIP(ip)} | SO ${n(pit.so)} | BB ${n(pit.bb)}\n`;
      }
    }

    const statsText = `[Team Summary - ${season} Season]
Players: ${players.length}
Players (deduped): ${identityPlayers.length}
Batting: AVG ${teamAvg} | OBP ${teamOBP} | H ${teamH} | HR ${teamHR} | 2B ${team2B} | 3B ${team3B} | RBI ${teamRBI} | BB ${teamBB} | SO ${teamSO} | SB ${teamSB}
Pitching: ERA ${teamERA} | WHIP ${teamWHIP} | W${teamW}-L${teamL}-SV${teamSV} | IP ${formatIP(teamIP)} | SO ${teamPSO} | BB ${teamPBB} | HA ${teamHA}
${playerStats}`;

    const systemPrompt =
      lang === "en"
        ? `You are a baseball analytics expert for a school baseball team. Analyze the team's overall performance and provide strategic insights. Respond ONLY in the JSON format below.\n\n${getTrainingPlanGuidance("en", "team")}`
        : `당신은 학교 야구부 전문 분석가입니다. 팀 전체 성적을 분석하고 전략적 시사점을 제공합니다. 반드시 아래 JSON 형식으로만 응답하세요.\n\n${getTrainingPlanGuidance("ko", "team")}`;

    const userPrompt =
      lang === "en"
        ? `Analyze this team's ${season} season stats comprehensively.

${statsText}

Make the recommendations realistic within the Utah Devils spring training plan. Strategic recommendations should map to actual Monday team sessions, limited Friday hitting sessions, position-group defensive work, and record-based player development.

Respond ONLY in this JSON format:
{
  "overview": "4-5 sentence overall team evaluation",
  "batting_analysis": "3-4 sentences analyzing team batting with specific player mentions",
  "pitching_analysis": "3-4 sentences analyzing team pitching with specific player mentions",
  "top_performers": ["Top performer 1 with reason", "Top performer 2 with reason", "Top performer 3 with reason"],
  "team_strengths": ["Team strength 1", "Team strength 2", "Team strength 3"],
  "team_weaknesses": ["Weakness 1", "Weakness 2"],
  "strategic_recommendations": ["Strategy 1 (specific and actionable)", "Strategy 2", "Strategy 3"],
  "key_matchup_tips": "3-4 sentences on how to leverage team strengths in games"
}`
        : `이 팀의 ${season} 시즌 기록을 종합적으로 분석해주세요.

${statsText}

전략 제안과 개선 방향은 반드시 Utah Devils 봄학기 훈련 계획 안에서 실제로 실행 가능한 내용으로 작성해주세요. 월요일 팀훈련, 금요일 타격훈련, 포지션별 수비훈련, 기록 분석 기반 선수 육성 흐름에 맞는 제안이어야 합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "overview": "4~5문장으로 팀 전체 종합 평가",
  "batting_analysis": "3~4문장으로 팀 타격 분석 (선수 이름 구체적으로 언급)",
  "pitching_analysis": "3~4문장으로 팀 투구 분석 (선수 이름 구체적으로 언급)",
  "top_performers": ["핵심 선수 1 (이유 포함)", "핵심 선수 2 (이유 포함)", "핵심 선수 3 (이유 포함)"],
  "team_strengths": ["팀 강점 1", "팀 강점 2", "팀 강점 3"],
  "team_weaknesses": ["팀 약점 1", "팀 약점 2"],
  "strategic_recommendations": ["전략 제안 1 (구체적이고 실행 가능한)", "전략 제안 2", "전략 제안 3"],
  "key_matchup_tips": "3~4문장으로 경기에서 팀 강점을 활용하는 전략"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      // @ts-ignore
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices?.[0]?.message?.content ?? "";

    let analysis: any;
    try {
      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "AI 응답 파싱 실패", raw: responseText }, { status: 500 });
    }

    const del = await supabase.from("ai_reports").delete().eq("report_type", "team");
    if (del.error) throw new Error(del.error.message);

    const ins = await supabase.from("ai_reports").insert({
      player_id: null,
      report_type: "team",
      summary: analysis.overview,
      strengths: JSON.stringify({
        batting_analysis: analysis.batting_analysis,
        pitching_analysis: analysis.pitching_analysis,
        top_performers: analysis.top_performers,
        team_strengths: analysis.team_strengths,
      }),
      improvements: JSON.stringify({
        team_weaknesses: analysis.team_weaknesses,
        strategic_recommendations: analysis.strategic_recommendations,
      }),
      training_plan: analysis.key_matchup_tips,
    });

    if (ins.error) throw new Error(ins.error.message);

    return Response.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("팀 분석 에러:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
