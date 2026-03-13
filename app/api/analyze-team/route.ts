// app/api/analyze-team/route.ts
export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import { getActivatedPlaceholderSeasons, isLockedSeason } from "@/lib/seasonVisibility";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // ✅ 서버 라우트에서는 NEXT_PUBLIC 보단 서버 전용 키 권장
  // 1순위: SUPABASE_SERVICE_ROLE_KEY (RLS 우회 가능, 서버에서만!)
  // 2순위: SUPABASE_ANON_KEY (RLS 적용)
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    // ✅ 필요한 컬럼만 + DB에서 시즌 필터
    const [{ data: players, error: playersErr }, { data: batting, error: batErr }, { data: pitching, error: pitErr }] =
      await Promise.all([
        supabase.from("players").select("id, name, number").order("number", { ascending: true }),
        supabase
          .from("batting_stats")
          .select("player_id, season, pa, ab, hits, hr, rbi, bb, hbp, so, sb, doubles, triples")
          .eq("season", season),
        supabase
          .from("pitching_stats")
          .select("player_id, season, ip, er, w, l, sv, so, bb, ha")
          .eq("season", season),
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

    const safeBatting = batting ?? [];
    const safePitching = pitching ?? [];

    // ✅ 숫자 안전 변환 유틸
    const n = (v: any) => (typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0);

    // ✅ O(1) lookup을 위한 Map (find() 제거)
    const battingByPlayer = new Map<string, (typeof safeBatting)[number]>();
    for (const row of safeBatting) {
      const key = String(row.player_id);
      const current = battingByPlayer.get(key);
      if (current) {
        battingByPlayer.set(key, {
          ...current,
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
        battingByPlayer.set(key, row);
      }
    }

    const pitchingByPlayer = new Map<string, (typeof safePitching)[number]>();
    for (const row of safePitching) {
      const key = String(row.player_id);
      const current = pitchingByPlayer.get(key);
      if (current) {
        pitchingByPlayer.set(key, {
          ...current,
          ip: n(current.ip) + n(row.ip),
          er: n(current.er) + n(row.er),
          w: n(current.w) + n(row.w),
          l: n(current.l) + n(row.l),
          sv: n(current.sv) + n(row.sv),
          so: n(current.so) + n(row.so),
          bb: n(current.bb) + n(row.bb),
          ha: n(current.ha) + n(row.ha),
        });
      } else {
        pitchingByPlayer.set(key, row);
      }
    }

    // 팀 종합 스탯 계산 (batting)
    const teamPA = safeBatting.reduce((a, b) => a + n(b.pa), 0);
    const teamAB = safeBatting.reduce((a, b) => a + n(b.ab), 0);
    const teamH = safeBatting.reduce((a, b) => a + n(b.hits), 0);
    const teamHR = safeBatting.reduce((a, b) => a + n(b.hr), 0);
    const teamRBI = safeBatting.reduce((a, b) => a + n(b.rbi), 0);
    const teamBB = safeBatting.reduce((a, b) => a + n(b.bb), 0);
    const teamHBP = safeBatting.reduce((a, b) => a + n(b.hbp), 0);
    const teamSO = safeBatting.reduce((a, b) => a + n(b.so), 0);
    const teamSB = safeBatting.reduce((a, b) => a + n(b.sb), 0);
    const team2B = safeBatting.reduce((a, b) => a + n(b.doubles), 0);
    const team3B = safeBatting.reduce((a, b) => a + n(b.triples), 0);

    const teamAvg = teamAB > 0 ? (teamH / teamAB).toFixed(3) : "0.000";
    const teamOBP = teamPA > 0 ? ((teamH + teamBB + teamHBP) / teamPA).toFixed(3) : "0.000";

    // 팀 종합 스탯 계산 (pitching)
    const teamIP = safePitching.reduce((a, b) => a + n(b.ip), 0);
    const teamER = safePitching.reduce((a, b) => a + n(b.er), 0);
    const teamW = safePitching.reduce((a, b) => a + n(b.w), 0);
    const teamL = safePitching.reduce((a, b) => a + n(b.l), 0);
    const teamSV = safePitching.reduce((a, b) => a + n(b.sv), 0);
    const teamPSO = safePitching.reduce((a, b) => a + n(b.so), 0);
    const teamPBB = safePitching.reduce((a, b) => a + n(b.bb), 0);
    const teamHA = safePitching.reduce((a, b) => a + n(b.ha), 0);

    // ✅ 5이닝제(아마추어/리그 규정) 기준 유지: ERA = ER/IP * 5
    const teamERA = teamIP > 0 ? ((teamER / teamIP) * 5).toFixed(2) : "0.00";
    const teamWHIP = teamIP > 0 ? ((teamHA + teamPBB) / teamIP).toFixed(2) : "0.00";

    // 개인별 주요 지표 텍스트 생성
    let playerStats = "\n[Individual Player Stats]\n";
    for (const p of players) {
      const pid = String(p.id);
      const bat = battingByPlayer.get(pid);
      const pit = pitchingByPlayer.get(pid);
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

        // SLG 계산: (1B + 2*2B + 3*3B + 4*HR)/AB
        const singles = hits - doubles - triples - hr;
        const slg = ((singles + doubles * 2 + triples * 3 + hr * 4) / ab).toFixed(3);

        const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3);

        playerStats += `  Batting: AVG ${avg} | OBP ${obp} | OPS ${ops} | H ${hits} | HR ${hr} | RBI ${n(
          bat.rbi
        )} | BB ${bb} | SO ${n(bat.so)} | SB ${n(bat.sb)}\n`;
      }

      if (pit && n(pit.ip) > 0) {
        const ip = n(pit.ip);
        const er = n(pit.er);
        const era = ((er / ip) * 5).toFixed(2);
        playerStats += `  Pitching: ERA ${era} | W${n(pit.w)}-L${n(pit.l)} | IP ${ip} | SO ${n(
          pit.so
        )} | BB ${n(pit.bb)}\n`;
      }
    }

    const statsText = `[Team Summary - ${season} Season]
Players: ${players.length}
Batting: AVG ${teamAvg} | OBP ${teamOBP} | H ${teamH} | HR ${teamHR} | 2B ${team2B} | 3B ${team3B} | RBI ${teamRBI} | BB ${teamBB} | SO ${teamSO} | SB ${teamSB}
Pitching: ERA ${teamERA} | WHIP ${teamWHIP} | W${teamW}-L${teamL}-SV${teamSV} | IP ${teamIP.toFixed(
      1
    )} | SO ${teamPSO} | BB ${teamPBB} | HA ${teamHA}
${playerStats}`;

    const systemPrompt =
      lang === "en"
        ? `You are a baseball analytics expert for a school baseball team. Analyze the team's overall performance and provide strategic insights. Respond ONLY in the JSON format below.`
        : `당신은 학교 야구부 전문 분석가입니다. 팀 전체 성적을 분석하고 전략적 시사점을 제공합니다. 반드시 아래 JSON 형식으로만 응답하세요.`;

    const userPrompt =
      lang === "en"
        ? `Analyze this team's ${season} season stats comprehensively.

${statsText}

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

    // ✅ JSON 강제: response_format (가능한 모델일 때) + 온도 낮춤(파싱 안정)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      // @ts-ignore - openai 타입 버전에 따라 없을 수 있음
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

    // 기존 팀 리포트 삭제 후 새로 저장
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
