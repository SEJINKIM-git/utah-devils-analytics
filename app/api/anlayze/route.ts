export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";

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

    const { data: batting } = await supabase.from("batting_stats").select("*").eq("player_id", playerId);
    const { data: pitching } = await supabase.from("pitching_stats").select("*").eq("player_id", playerId);

    const bat = batting?.[0];
    const pitch = pitching?.[0];

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
        { role: "system", content: "당신은 야구 데이터 분석 전문가입니다. 학교 야구부 선수의 기록을 분석하여 피드백을 제공합니다. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요." },
        { role: "user", content: `아래 선수의 2025 시즌 기록을 분석해주세요.\n\n${statsText}\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{"summary": "2~3문장으로 종합 평가", "strengths": ["강점1", "강점2", "강점3"], "improvements": ["개선점1", "개선점2"], "training_plan": "3~4문장으로 구체적인 훈련 방향 제안"}` }
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