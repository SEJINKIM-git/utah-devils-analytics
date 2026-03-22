export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import { findRelatedPlayersByIdentity } from "@/lib/playerIdentity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    const [{ data: rawBatting }, { data: rawPitching }] = await Promise.all([
      supabase.from("batting_stats").select("*").in("player_id", relatedPlayerIds).order("season"),
      supabase.from("pitching_stats").select("*").in("player_id", relatedPlayerIds).order("season"),
    ]);

    const battingBySeason = new Map<string, any>();
    for (const row of rawBatting || []) {
      const key = String(row.season || "2025");
      const current = battingBySeason.get(key) || {
        season: key,
        pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0,
        hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0,
      };
      battingBySeason.set(key, {
        ...current,
        pa: current.pa + (row.pa || 0),
        ab: current.ab + (row.ab || 0),
        runs: current.runs + (row.runs || 0),
        hits: current.hits + (row.hits || 0),
        doubles: current.doubles + (row.doubles || 0),
        triples: current.triples + (row.triples || 0),
        hr: current.hr + (row.hr || 0),
        rbi: current.rbi + (row.rbi || 0),
        bb: current.bb + (row.bb || 0),
        hbp: current.hbp + (row.hbp || 0),
        so: current.so + (row.so || 0),
        sb: current.sb + (row.sb || 0),
      });
    }

    const pitchingBySeason = new Map<string, any>();
    for (const row of rawPitching || []) {
      const key = String(row.season || "2025");
      const current = pitchingBySeason.get(key) || {
        season: key,
        w: 0, l: 0, sv: 0, ip: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, so: 0, hr_allowed: 0,
      };
      pitchingBySeason.set(key, {
        ...current,
        w: current.w + (row.w || 0),
        l: current.l + (row.l || 0),
        sv: current.sv + (row.sv || 0),
        ip: current.ip + (parseFloat(String(row.ip || 0)) || 0),
        ha: current.ha + (row.ha || 0),
        runs_allowed: current.runs_allowed + (row.runs_allowed || 0),
        er: current.er + (row.er || 0),
        bb: current.bb + (row.bb || 0),
        so: current.so + (row.so || 0),
        hr_allowed: current.hr_allowed + (row.hr_allowed || 0),
      });
    }

    const allBatting = Array.from(battingBySeason.values()).sort((a, b) => String(a.season).localeCompare(String(b.season)));
    const allPitching = Array.from(pitchingBySeason.values()).sort((a, b) => String(a.season).localeCompare(String(b.season)));

    let statsText = `[Player Info]\nName: ${player.name} (#${player.number})\n`;

    if (allBatting && allBatting.length > 0) {
      statsText += `\n[Batting Stats]\n`;
      for (const bat of allBatting) {
        const season = bat.season || "2025";
        const avg = bat.ab > 0 ? (bat.hits / bat.ab).toFixed(3) : "0";
        const obp = bat.pa > 0 ? ((bat.hits + bat.bb + bat.hbp) / bat.pa).toFixed(3) : "0";
        const slg = bat.ab > 0 ? ((bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab).toFixed(3) : "0";
        const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3);
        statsText += `\n● ${season}:\nPA: ${bat.pa} | AB: ${bat.ab} | H: ${bat.hits}\n2B: ${bat.doubles} | 3B: ${bat.triples} | HR: ${bat.hr}\nRBI: ${bat.rbi} | R: ${bat.runs}\nBB: ${bat.bb} | HBP: ${bat.hbp} | SO: ${bat.so}\nSB: ${bat.sb}\nAVG: ${avg} | OBP: ${obp} | SLG: ${slg} | OPS: ${ops}\n`;
      }
    }

    if (allPitching && allPitching.length > 0) {
      statsText += `\n[Pitching Stats]\n`;
      for (const pitch of allPitching) {
        if (!pitch.ip || pitch.ip === 0) continue;
        const season = pitch.season || "2025";
        const era = ((pitch.er / pitch.ip) * 5).toFixed(2);
        const whip = ((pitch.ha + pitch.bb) / pitch.ip).toFixed(2);
        statsText += `\n● ${season}:\nW: ${pitch.w} | L: ${pitch.l} | SV: ${pitch.sv}\nIP: ${pitch.ip} | HA: ${pitch.ha}\nRA: ${pitch.runs_allowed} | ER: ${pitch.er}\nBB: ${pitch.bb} | SO: ${pitch.so} | HRA: ${pitch.hr_allowed}\nERA: ${era} | WHIP: ${whip}\n`;
      }
    }

    const systemPrompt = lang === "en"
      ? "You are a baseball data analyst. Analyze a school baseball team player's stats and provide feedback. If multiple seasons exist, analyze growth trends. Respond ONLY in the JSON format specified below. No other text."
      : "당신은 야구 데이터 분석 전문가입니다. 학교 야구부 선수의 시즌별 기록을 분석하여 피드백을 제공합니다. 여러 시즌 데이터가 있으면 성장 추이를 분석해주세요. 반드시 아래 JSON 형식으로만 응답하세요.";

    const userPrompt = lang === "en"
      ? `Analyze this player's stats. If multiple seasons exist, include growth trends.\n\n${statsText}\n\nRespond ONLY in this JSON format:\n{"summary": "3-4 sentence overall evaluation (include season growth trends)", "strengths": ["strength1", "strength2", "strength3"], "improvements": ["improvement1", "improvement2"], "training_plan": "4-5 sentence specific training recommendations"}`
      : `아래 선수의 기록을 분석해주세요. 여러 시즌이 있으면 성장 추이도 포함해주세요.\n\n${statsText}\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{"summary": "3~4문장으로 종합 평가 (시즌별 성장 추이 포함)", "strengths": ["강점1", "강점2", "강점3"], "improvements": ["개선점1", "개선점2"], "training_plan": "4~5문장으로 구체적인 훈련 방향 제안"}`;

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

    return Response.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("AI 분석 에러:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
