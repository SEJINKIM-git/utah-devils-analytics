export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const lang = (formData.get("lang") as string) || "ko";
    const opponent = (formData.get("opponent") as string) || "";
    const gameDate = (formData.get("gameDate") as string) || "";

    if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // === 타자 기록 파싱 ===
    const batSheet = wb.Sheets["타자 기록"];
    const battingData: any[] = [];
    if (batSheet) {
      const rows = XLSX.utils.sheet_to_json(batSheet, { header: 1 }) as any[][];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[2]) continue; // 이름 없으면 skip
        if (typeof r[2] === "number" && !r[3]) continue; // 합계 행 skip
        const ab = Number(r[3]) || 0;
        const hits = Number(r[5]) || 0;
        battingData.push({
          order: r[0] ?? i,
          position: r[1] || "",
          name: r[2],
          ab,
          runs: Number(r[4]) || 0,
          hits,
          doubles: Number(r[6]) || 0,
          triples: Number(r[7]) || 0,
          hr: Number(r[8]) || 0,
          rbi: Number(r[9]) || 0,
          bb: Number(r[10]) || 0,
          hbp: Number(r[11]) || 0,
          so: Number(r[12]) || 0,
          avg: ab > 0 ? (hits / ab).toFixed(3) : "0",
          sb: Number(r[14]) || 0,
        });
      }
    }

    // === 투수 기록 파싱 ===
    const pitSheet = wb.Sheets["투수 기록"];
    const pitchingData: any[] = [];
    if (pitSheet) {
      const rows = XLSX.utils.sheet_to_json(pitSheet, { header: 1 }) as any[][];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        const ip = Number(r[2]) || 0;
        const er = Number(r[5]) || 0;
        pitchingData.push({
          name: r[0],
          decision: r[1] || "",
          ip,
          ha: Number(r[3]) || 0,
          runs_allowed: Number(r[4]) || 0,
          er,
          bb: Number(r[6]) || 0,
          so: Number(r[7]) || 0,
          hr_allowed: Number(r[8]) || 0,
          batters_faced: Number(r[9]) || 0,
          ab_against: Number(r[10]) || 0,
          pitches: Number(r[11]) || 0,
          w: Number(r[12]) || 0,
          l: Number(r[13]) || 0,
          sv: Number(r[14]) || 0,
          hld: Number(r[15]) || 0,
          era: ip > 0 ? ((er / ip) * 9).toFixed(2) : "0",
        });
      }
    }

    // === 주요 기록 파싱 ===
    const highlightSheet = wb.Sheets["주요 기록"];
    const highlights: any = {};
    if (highlightSheet) {
      const rows = XLSX.utils.sheet_to_json(highlightSheet, { header: 1 }) as any[][];
      for (const r of rows) {
        if (r[0] && r[1]) highlights[r[0]] = r[1];
      }
    }

    // 팀 합산
    const teamAB = battingData.reduce((a, b) => a + b.ab, 0);
    const teamH = battingData.reduce((a, b) => a + b.hits, 0);
    const teamR = battingData.reduce((a, b) => a + b.runs, 0);
    const teamRBI = battingData.reduce((a, b) => a + b.rbi, 0);
    const teamHR = battingData.reduce((a, b) => a + b.hr, 0);
    const teamBB = battingData.reduce((a, b) => a + b.bb, 0);
    const teamSO = battingData.reduce((a, b) => a + b.so, 0);
    const teamAvg = teamAB > 0 ? (teamH / teamAB).toFixed(3) : "0";
    const totalIP = pitchingData.reduce((a, b) => a + b.ip, 0);
    const totalER = pitchingData.reduce((a, b) => a + b.er, 0);
    const totalRA = pitchingData.reduce((a, b) => a + b.runs_allowed, 0);
    const totalPitches = pitchingData.reduce((a, b) => a + b.pitches, 0);

    // AI 분석용 텍스트 구성
    let statsText = `[Game Info]\nOpponent: ${opponent || "Unknown"}\nDate: ${gameDate || "Unknown"}\n`;
    statsText += `\n[Team Batting Summary]\nAB: ${teamAB} | H: ${teamH} | AVG: ${teamAvg} | R: ${teamR} | RBI: ${teamRBI} | HR: ${teamHR} | BB: ${teamBB} | SO: ${teamSO}\n`;

    statsText += `\n[Individual Batting]\n`;
    for (const b of battingData) {
      statsText += `${b.order}번 ${b.position} ${b.name}: ${b.ab}타수 ${b.hits}안타(AVG ${b.avg}) ${b.doubles}이타 ${b.triples}삼타 ${b.hr}홈런 ${b.rbi}타점 ${b.runs}득점 ${b.bb}볼넷 ${b.so}삼진 ${b.sb}도루\n`;
    }

    statsText += `\n[Pitching Summary]\nTotal IP: ${totalIP} | Total ER: ${totalER} | Total RA: ${totalRA} | Total Pitches: ${totalPitches}\n`;
    statsText += `\n[Individual Pitching]\n`;
    for (const p of pitchingData) {
      statsText += `${p.name}: ${p.ip}이닝 ${p.pitches}투구 ${p.ha}피안타 ${p.er}자책 ${p.runs_allowed}실점 ${p.bb}볼넷 ${p.so}삼진 ${p.hr_allowed}피홈런 ERA:${p.era}${p.decision ? ` (${p.decision})` : ""}\n`;
    }

    if (Object.keys(highlights).length > 0) {
      statsText += `\n[Key Highlights]\n`;
      for (const [key, val] of Object.entries(highlights)) {
        if (val && val !== "-") statsText += `${key}: ${val}\n`;
      }
    }

    const systemPrompt = lang === "en"
      ? `You are an expert baseball analyst reviewing a school baseball team's game record. Provide a comprehensive post-game review with statistical analysis and strategic insights. Be specific with player names and numbers. Respond ONLY in JSON format.`
      : `당신은 학교 야구부 전문 분석가입니다. 경기 기록을 바탕으로 수치와 지표 위주의 상세한 경기 리뷰를 작성합니다. 선수 이름을 구체적으로 언급하며, 전략적 시사점까지 포함해주세요. 반드시 JSON 형식으로만 응답하세요.`;

    const userPrompt = lang === "en"
      ? `Analyze this game record comprehensively:\n\n${statsText}\n\nRespond ONLY in this JSON format:\n{
  "game_summary": "4-5 sentence game overview with score context and flow",
  "mvp": {"name": "Player name", "reason": "Why they were MVP with specific stats"},
  "batting_review": {"overview": "3-4 sentences on team batting with specific stats", "standout_hitters": ["Player1: specific performance", "Player2: specific performance"], "areas_to_improve": "2-3 sentences on batting weaknesses"},
  "pitching_review": {"overview": "3-4 sentences on pitching with specific stats per pitcher", "standout_pitchers": ["Pitcher1: specific performance"], "areas_to_improve": "2-3 sentences on pitching weaknesses"},
  "key_moments": ["Key moment 1 with context", "Key moment 2"],
  "tactical_analysis": "4-5 sentences on strategic observations, lineup decisions, and tactical takeaways",
  "improvement_plan": ["Specific actionable improvement 1", "Improvement 2", "Improvement 3"],
  "next_game_strategy": "3-4 sentences on what to focus on for the next game based on this performance"
}`
      : `이 경기 기록을 종합적으로 분석해주세요:\n\n${statsText}\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{
  "game_summary": "4~5문장으로 경기 흐름과 결과 요약 (점수, 분위기 포함)",
  "mvp": {"name": "선수 이름", "reason": "구체적 수치로 MVP 선정 이유"},
  "batting_review": {"overview": "3~4문장으로 팀 타격 분석 (구체적 수치 포함)", "standout_hitters": ["선수1: 구체적 활약 내용", "선수2: 구체적 활약 내용"], "areas_to_improve": "2~3문장으로 타격 개선점"},
  "pitching_review": {"overview": "3~4문장으로 투수진 분석 (투수별 구체적 수치)", "standout_pitchers": ["투수1: 구체적 성적"], "areas_to_improve": "2~3문장으로 투구 개선점"},
  "key_moments": ["핵심 장면 1 (맥락 포함)", "핵심 장면 2"],
  "tactical_analysis": "4~5문장으로 전략적 분석 (라인업 운용, 작전 평가, 전술적 시사점)",
  "improvement_plan": ["구체적 개선 방안 1", "개선 방안 2", "개선 방안 3"],
  "next_game_strategy": "3~4문장으로 다음 경기 대비 포인트"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const responseText = completion.choices[0].message.content || "";
    let review;
    try {
      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      review = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "AI 응답 파싱 실패", raw: responseText }, { status: 500 });
    }

    // DB 저장
    const { data: saved, error: dbError } = await supabase.from("game_records").insert({
      game_date: gameDate,
      opponent,
      score: `${teamR}`,
      batting_data: battingData,
      pitching_data: pitchingData,
      highlights,
      ai_review: review,
    }).select().single();

    if (dbError) console.error("DB save error:", dbError);

    return Response.json({ review, battingData, pitchingData, highlights, gameId: saved?.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("Game review error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 과거 기록 조회
export async function GET() {
  const { data } = await supabase
    .from("game_records")
    .select("*")
    .order("created_at", { ascending: false });
  return Response.json({ records: data || [] });
}

// 기록 삭제
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await supabase.from("game_records").delete().eq("id", id);
  return Response.json({ success: true });
}