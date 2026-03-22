export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import { findRelatedPlayersByIdentity } from "@/lib/playerIdentity";
import { getTrainingPlanGuidance } from "@/lib/trainingPlanGuidance";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await request.json();

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

    const [{ data: batting }, { data: pitching }] = await Promise.all([
      supabase.from("batting_stats").select("*").in("player_id", relatedPlayerIds),
      supabase.from("pitching_stats").select("*").in("player_id", relatedPlayerIds),
    ]);

    const bat = (batting && batting.length > 0) ? batting.reduce((acc, b) => ({
      ...acc,
      pa: (acc.pa || 0) + (b.pa || 0),
      ab: (acc.ab || 0) + (b.ab || 0),
      runs: (acc.runs || 0) + (b.runs || 0),
      hits: (acc.hits || 0) + (b.hits || 0),
      doubles: (acc.doubles || 0) + (b.doubles || 0),
      triples: (acc.triples || 0) + (b.triples || 0),
      hr: (acc.hr || 0) + (b.hr || 0),
      rbi: (acc.rbi || 0) + (b.rbi || 0),
      bb: (acc.bb || 0) + (b.bb || 0),
      hbp: (acc.hbp || 0) + (b.hbp || 0),
      so: (acc.so || 0) + (b.so || 0),
      sb: (acc.sb || 0) + (b.sb || 0),
    }), { ...batting[0], pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0 }) : null;
    const pitch = (pitching && pitching.length > 0) ? pitching.reduce((acc, p) => ({
      ...acc,
      w: (acc.w || 0) + (p.w || 0),
      l: (acc.l || 0) + (p.l || 0),
      sv: (acc.sv || 0) + (p.sv || 0),
      ip: (parseFloat(String(acc.ip || 0)) || 0) + (parseFloat(String(p.ip || 0)) || 0),
      ha: (acc.ha || 0) + (p.ha || 0),
      runs_allowed: (acc.runs_allowed || 0) + (p.runs_allowed || 0),
      er: (acc.er || 0) + (p.er || 0),
      bb: (acc.bb || 0) + (p.bb || 0),
      so: (acc.so || 0) + (p.so || 0),
      hr_allowed: (acc.hr_allowed || 0) + (p.hr_allowed || 0),
    }), { ...pitching[0], w: 0, l: 0, sv: 0, ip: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, so: 0, hr_allowed: 0 }) : null;

    let statsText = `[선수 정보]\n이름: ${player.name} (#${player.number})\n시즌: 2025\n`;

    if (bat) {
      const avg = bat.ab > 0 ? (bat.hits / bat.ab).toFixed(3) : "0";
      const obp = bat.pa > 0 ? ((bat.hits + bat.bb + bat.hbp) / bat.pa).toFixed(3) : "0";
      const slg = bat.ab > 0 ? ((bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab).toFixed(3) : "0";
      const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3);
      statsText += `\n[타격 기록]\n타석: ${bat.pa} | 타수: ${bat.ab} | 안타: ${bat.hits}\n2루타: ${bat.doubles} | 3루타: ${bat.triples} | 홈런: ${bat.hr}\n타점: ${bat.rbi} | 득점: ${bat.runs}\n볼넷: ${bat.bb} | 사구: ${bat.hbp} | 삼진: ${bat.so}\n도루: ${bat.sb}\n타율: ${avg} | 출루율: ${obp} | 장타율: ${slg} | OPS: ${ops}\n`;
    }

    if (pitch && pitch.ip > 0) {
      const era = ((pitch.er / pitch.ip) * 5).toFixed(2);
      const whip = ((pitch.ha + pitch.bb) / pitch.ip).toFixed(2);
      statsText += `\n[투수 기록]\n승: ${pitch.w} | 패: ${pitch.l} | 세이브: ${pitch.sv}\n이닝: ${pitch.ip} | 피안타: ${pitch.ha}\n실점: ${pitch.runs_allowed} | 자책: ${pitch.er}\n볼넷: ${pitch.bb} | 삼진: ${pitch.so} | 피홈런: ${pitch.hr_allowed}\nERA: ${era} | WHIP: ${whip}\n`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `당신은 야구 데이터 분석 전문가입니다. 학교 야구부 선수의 기록을 분석하여 피드백을 제공합니다. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.\n\n${getTrainingPlanGuidance("ko", "player")}` },
        { role: "user", content: `아래 선수의 2025 시즌 기록을 분석해주세요.\n\n${statsText}\n\n개선점과 훈련 방향은 반드시 Utah Devils 봄학기 훈련 계획 안에서 실현 가능한 내용으로 작성해주세요. 월요일 팀훈련, 금요일 타격훈련, 포지션별 수비훈련, 경기 전 배팅장 권고 같은 실제 운영 구조에 연결해서 제안해야 합니다.\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{"summary": "2~3문장으로 종합 평가", "strengths": ["강점1", "강점2", "강점3"], "improvements": ["개선점1", "개선점2"], "training_plan": "3~4문장으로 실제 훈련 계획에 맞는 구체적 훈련 방향 제안"}` }
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

    return Response.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("AI 분석 에러:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
