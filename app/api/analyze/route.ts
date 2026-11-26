export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import { findRelatedPlayersByIdentity } from "@/lib/playerIdentity";
import { getTrainingPlanGuidance } from "@/lib/trainingPlanGuidance";
import type { PitchingTotals } from "@/lib/metrics";
import { createEvidenceCollector } from "@/lib/metrics/evidence";
import { createMetricQuery, loadMetricDataset } from "@/lib/metrics/query";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { playerId, lang = "ko" } = await request.json();

    const { data: player } = await supabase.from("players").select("*").eq("id", playerId).single();
    if (!player) return Response.json({ error: "선수를 찾을 수 없습니다" }, { status: 404 });

    const [{ data: playersByNumber }, { data: playersByName }] = await Promise.all([
      supabase.from("players").select("*").eq("number", player.number),
      supabase.from("players").select("*").eq("name", player.name),
    ]);
    const relatedPlayers = findRelatedPlayersByIdentity(
      [player, ...(playersByNumber || []), ...(playersByName || [])],
      player
    );
    const relatedPlayerIds = Array.from(new Set(relatedPlayers.map((entry) => entry.id)));

    // 숫자는 조회 함수에서 받는다 (이 파일에서 계산하지 않는다).
    // 범위 "all": 명단 기준을 적용하지 않고 모든 시즌의 유효 행을 쓴다 — 이전 분석과 같은 범위.
    const { dataset } = await loadMetricDataset(supabase);
    const query = createMetricQuery(dataset);
    const target = { player: player.id };
    const evidence = createEvidenceCollector(query, lang === "en" ? "en" : "ko");
    const cite = (code: string, season: string, fallback?: string) => evidence.cite(target, code, season, { scope: "all", fallback });

    let statsText = `[Player Info]\nName: ${player.name} (#${player.number})\n`;

    const battingSeasons = query.seasons().filter((season) => query.totals(target, "batting", season, { scope: "all" }));
    if (battingSeasons.length > 0) {
      statsText += `\n[Batting Stats]\n`;
      for (const season of battingSeasons) {
        statsText += `\n● ${season}:\nPA: ${cite("PA", season)} | AB: ${cite("AB", season)} | H: ${cite("H", season)}\n2B: ${cite("2B", season)} | 3B: ${cite("3B", season)} | HR: ${cite("HR", season)}\nRBI: ${cite("RBI", season)} | R: ${cite("R", season)}\nBB: ${cite("BB", season)} | HBP: ${cite("HBP", season)} | SO: ${cite("SO", season)}\nSB: ${cite("SB", season)}\nAVG: ${cite("AVG", season, "0")} | OBP: ${cite("OBP", season, "0")} | SLG: ${cite("SLG", season, "0")} | OPS: ${cite("OPS", season, "0")}\n`;
      }
    }

    const pitchingSeasons = query.seasons().filter((season) => {
      const totals = query.totals(target, "pitching", season, { scope: "all" }) as PitchingTotals | null;
      return Boolean(totals && totals.innings > 0);
    });
    if (pitchingSeasons.length > 0) {
      statsText += `\n[Pitching Stats]\n`;
      for (const season of pitchingSeasons) {
        statsText += `\n● ${season}:\nW: ${cite("W", season)} | L: ${cite("L", season)} | SV: ${cite("SV", season)}\nIP: ${cite("IP", season)} | HA: ${cite("HA", season)}\nRA: ${cite("RA", season)} | ER: ${cite("ER", season)}\nBB: ${cite("BBA", season)} | SO: ${cite("K", season)} | HRA: ${cite("HRA", season)}\nERA: ${cite("ERA", season, "0.00")} | WHIP: ${cite("WHIP", season, "0.00")}\n`;
      }
    }

    const systemPrompt = lang === "en"
      ? `You are a baseball data analyst. Analyze a school baseball team player's stats and provide feedback. If multiple seasons exist, analyze growth trends. Respond ONLY in the JSON format specified below. No other text.\n\n${getTrainingPlanGuidance("en", "player")}`
      : `당신은 야구 데이터 분석 전문가입니다. 학교 야구부 선수의 시즌별 기록을 분석하여 피드백을 제공합니다. 여러 시즌 데이터가 있으면 성장 추이를 분석해주세요. 반드시 아래 JSON 형식으로만 응답하세요.\n\n${getTrainingPlanGuidance("ko", "player")}`;

    const userPrompt = lang === "en"
      ? `Analyze this player's stats. If multiple seasons exist, include growth trends.\n\n${statsText}\n\nWhen you write improvements and training recommendations, ground them in the Utah Devils spring training plan. The advice should be realistic for Monday team practice, limited Friday batting sessions, position-group defense work, and voluntary pre-game batting cage prep.\n\nRespond ONLY in this JSON format:\n{"summary": "3-4 sentence overall evaluation (include season growth trends)", "strengths": ["strength1", "strength2", "strength3"], "improvements": ["improvement1", "improvement2"], "training_plan": "4-5 sentence specific and realistic training recommendations based on the actual team training plan"}`
      : `아래 선수의 기록을 분석해주세요. 여러 시즌이 있으면 성장 추이도 포함해주세요.\n\n${statsText}\n\n개선점과 훈련 방향은 반드시 Utah Devils 봄학기 훈련 계획 안에서 실현 가능한 내용으로 작성해주세요. 월요일 팀훈련, 금요일 타격훈련, 포지션별 수비훈련, 경기 전 배팅장 권고 같은 실제 운영 구조에 연결해서 제안해야 합니다.\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{"summary": "3~4문장으로 종합 평가 (시즌별 성장 추이 포함)", "strengths": ["강점1", "강점2", "강점3"], "improvements": ["개선점1", "개선점2"], "training_plan": "4~5문장으로 실제 훈련 계획에 맞는 구체적 훈련 방향 제안"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const responseText = completion.choices[0].message.content || "";
    let analysis;
    try {
      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "AI 응답 파싱 실패", raw: responseText }, { status: 500 });
    }

    await supabase.from("ai_reports").delete().in("player_id", relatedPlayerIds);
    await supabase.from("ai_reports").insert({
      player_id: playerId,
      report_type: "player",
      summary: analysis.summary,
      strengths: JSON.stringify(analysis.strengths),
      improvements: JSON.stringify(analysis.improvements),
      training_plan: analysis.training_plan,
    });

    // evidence: 이 리포트에 쓴 지표 코드와 값 (근거 표시용. DB에는 저장하지 않는다 — 저장하려면 ai_reports에 칸이 필요하다)
    return Response.json({ ...analysis, evidence: evidence.list });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("AI 분석 에러:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
