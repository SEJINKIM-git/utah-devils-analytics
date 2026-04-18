export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractGameMetaFromFilename } from "@/lib/gameFileMeta";
import { getTrainingPlanGuidance } from "@/lib/trainingPlanGuidance";
import {
  parseOfficialGameBattingSheet,
  parseOfficialGameHighlights,
  parseOfficialGamePitchingSheet,
} from "@/lib/officialGameWorkbook";
import { parseGameLines } from "@/lib/parseDocxGameRecord";
import { sanitizeGameReviewContent } from "@/lib/gameReviewSanitizer";
import { sanitizeImportedPlayerName } from "@/lib/playerNameValidation";
import { getActivatedPlaceholderSeasons, isLockedSeason } from "@/lib/seasonVisibility";
import { formatRateStat } from "@/lib/statFormatting";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function inferSeason(gameDate: string, fallback = String(new Date().getFullYear())) {
  const match = gameDate.match(/\b(20\d{2})\b/);
  return match ? match[1] : fallback;
}

async function saveGameRecord(record: Record<string, unknown>) {
  const withSeason = await supabase.from("game_records").insert(record).select().single();
  if (!withSeason.error) return withSeason;

  if ("season" in record) {
    const { season, ...withoutSeason } = record;
    const fallbackInsert = await supabase.from("game_records").insert(withoutSeason).select().single();
    if (!fallbackInsert.error) return fallbackInsert;
  }

  return withSeason;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const lang = (formData.get("lang") as string) || "ko";
    const requestedSeason = (formData.get("season") as string) || String(new Date().getFullYear());
    const fileMeta = extractGameMetaFromFilename(file?.name || "", requestedSeason);
    const opponent = ((formData.get("opponent") as string) || fileMeta.opponent || "").trim();
    const gameDate = ((formData.get("gameDate") as string) || fileMeta.date || "").trim();
    const season = requestedSeason || fileMeta.season || inferSeason(gameDate);

    if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const battingData: any[] = [];
    const pitchingData: any[] = [];
    const highlights: any = {};
    let noteText = "";

    if (/\.docx$/i.test(file.name)) {
      const { value } = await mammoth.extractRawText({ buffer });
      noteText = value.trim();
      const lines = value.split("\n").filter((line) => line.trim().length > 0);
      const parsed = parseGameLines(lines);

      for (const [index, batter] of parsed.battingStats.entries()) {
        const ab = batter.atBats || 0;
        const hits = batter.hits || 0;
        battingData.push({
          order: index + 1,
          position: "",
          name: batter.name,
          ab,
          runs: batter.runs || 0,
          hits,
          doubles: batter.doubles || 0,
          triples: batter.triples || 0,
          hr: batter.homeRuns || 0,
          rbi: batter.rbi || 0,
          bb: batter.walks || 0,
          hbp: batter.hbp || 0,
          so: batter.strikeouts || 0,
          avg: ab > 0 ? (hits / ab).toFixed(3) : "0",
          sb: 0,
        });
      }

      for (const pitcher of parsed.pitchingStats) {
        const ip = Number(pitcher.innings) || 0;
        const er = Number(pitcher.earnedRuns) || 0;
        pitchingData.push({
          name: pitcher.name,
          decision: "",
          ip,
          ha: pitcher.hits || 0,
          runs_allowed: pitcher.runs || 0,
          er,
          bb: pitcher.walks || 0,
          so: pitcher.strikeouts || 0,
          hr_allowed: 0,
          batters_faced: 0,
          ab_against: 0,
          pitches: 0,
          w: 0,
          l: 0,
          sv: 0,
          hld: 0,
          era: ip > 0 ? ((er / ip) * 9).toFixed(2) : "0",
        });
      }

      if (noteText) highlights["현장 기록 메모"] = noteText.slice(0, 3000);
    } else {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const batSheet = wb.Sheets["타자 기록"];
      if (batSheet) {
        for (const row of parseOfficialGameBattingSheet(batSheet)) {
          battingData.push({
            order: row.order,
            position: row.position,
            name: row.name,
            ab: row.ab,
            runs: row.runs,
            hits: row.hits,
            doubles: row.doubles,
            triples: row.triples,
            hr: row.hr,
            rbi: row.rbi,
            bb: row.bb,
            hbp: row.hbp,
            so: row.so,
            avg: row.avg,
            sb: row.sb,
          });
        }
      }

      const pitSheet = wb.Sheets["투수 기록"];
      if (pitSheet) {
        for (const row of parseOfficialGamePitchingSheet(pitSheet)) {
          pitchingData.push({
            name: row.name,
            decision: row.decision,
            ip: row.ip,
            ha: row.ha,
            runs_allowed: row.runs_allowed,
            er: row.er,
            bb: row.bb,
            so: row.so,
            hr_allowed: row.hr_allowed,
            batters_faced: row.batters_faced,
            ab_against: row.ab_against,
            pitches: row.pitches,
            w: row.w,
            l: row.l,
            sv: row.sv,
            hld: row.hld,
            era: row.era,
          });
        }
      }

      for (const line of parseOfficialGameHighlights(wb.Sheets["주요 기록"])) {
        const [label, ...valueParts] = line.split(":");
        const value = valueParts.join(":").trim();
        if (!label || !value) continue;
        highlights[label.trim()] = value;
      }
    }

    const cleanedBattingData = battingData
      .map((row) => {
        const name = sanitizeImportedPlayerName(row.name);
        if (!name) return null;

        const ab = Number(row.ab) || 0;
        const hits = Number(row.hits) || 0;

        return {
          ...row,
          name,
          position: String(row.position || "").trim(),
          avg: formatRateStat(row.avg ?? (ab > 0 ? hits / ab : 0), 3, "0.000"),
        };
      })
      .filter(Boolean) as typeof battingData;

    const cleanedPitchingData = pitchingData
      .map((row) => {
        const name = sanitizeImportedPlayerName(row.name);
        if (!name) return null;

        return {
          ...row,
          name,
        };
      })
      .filter(Boolean) as typeof pitchingData;

    battingData.length = 0;
    battingData.push(...cleanedBattingData);
    pitchingData.length = 0;
    pitchingData.push(...cleanedPitchingData);

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

    if (noteText) {
      statsText += `\n[Scouting Notes]\n${noteText.slice(0, 4000)}\n`;
    }

    const systemPrompt = lang === "en"
      ? `You are an expert baseball analyst reviewing a school baseball team's game record. Provide a comprehensive post-game review with statistical analysis and strategic insights. Be specific with player names and numbers. Respond ONLY in JSON format.\n\n${getTrainingPlanGuidance("en", "gameReview")}`
      : `당신은 학교 야구부 전문 분석가입니다. 경기 기록을 바탕으로 수치와 지표 위주의 상세한 경기 리뷰를 작성합니다. 선수 이름을 구체적으로 언급하며, 전략적 시사점까지 포함해주세요. 반드시 JSON 형식으로만 응답하세요.\n\n${getTrainingPlanGuidance("ko", "gameReview")}`;

    const userPrompt = lang === "en"
      ? `Analyze this game record comprehensively:\n\n${statsText}\n\nMake the improvement plan and next-game strategy realistic within the Utah Devils spring training structure. Tie follow-up actions to Monday team practice, Friday hitting sessions, position-group defensive work, pitching check-ins, or voluntary pre-game batting cage prep.\n\nRespond ONLY in this JSON format:\n{
  "game_summary": "4-5 sentence game overview with score context and flow",
  "mvp": {"name": "Player name", "reason": "Why they were MVP with specific stats"},
  "batting_review": {"overview": "3-4 sentences on team batting with specific stats", "standout_hitters": ["Player1: specific performance", "Player2: specific performance"], "areas_to_improve": "2-3 sentences on batting weaknesses"},
  "pitching_review": {"overview": "3-4 sentences on pitching with specific stats per pitcher", "standout_pitchers": ["Pitcher1: specific performance"], "areas_to_improve": "2-3 sentences on pitching weaknesses"},
  "key_moments": ["Key moment 1 with context", "Key moment 2"],
  "tactical_analysis": "4-5 sentences on strategic observations, lineup decisions, and tactical takeaways",
  "improvement_plan": ["Specific actionable improvement 1", "Improvement 2", "Improvement 3"],
  "next_game_strategy": "3-4 sentences on what to focus on for the next game based on this performance"
}\n\nUse the opponent and player names exactly as provided in the source data. Do not alter spellings or replace them with similar words.`
      : `이 경기 기록을 종합적으로 분석해주세요:\n\n${statsText}\n\n개선 방안과 다음 경기 전략은 반드시 Utah Devils 봄학기 훈련 계획 안에서 실현 가능한 내용으로 작성해주세요. 월요일 팀훈련, 금요일 타격훈련, 포지션별 수비훈련, 피칭 점검, 경기 전 배팅장 준비와 연결해서 제안해야 합니다.\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{
  "game_summary": "4~5문장으로 경기 흐름과 결과 요약 (점수, 분위기 포함)",
  "mvp": {"name": "선수 이름", "reason": "구체적 수치로 MVP 선정 이유"},
  "batting_review": {"overview": "3~4문장으로 팀 타격 분석 (구체적 수치 포함)", "standout_hitters": ["선수1: 구체적 활약 내용", "선수2: 구체적 활약 내용"], "areas_to_improve": "2~3문장으로 타격 개선점"},
  "pitching_review": {"overview": "3~4문장으로 투수진 분석 (투수별 구체적 수치)", "standout_pitchers": ["투수1: 구체적 성적"], "areas_to_improve": "2~3문장으로 투구 개선점"},
  "key_moments": ["핵심 장면 1 (맥락 포함)", "핵심 장면 2"],
  "tactical_analysis": "4~5문장으로 전략적 분석 (라인업 운용, 작전 평가, 전술적 시사점)",
  "improvement_plan": ["구체적 개선 방안 1", "개선 방안 2", "개선 방안 3"],
  "next_game_strategy": "3~4문장으로 다음 경기 대비 포인트"
}\n\n상대팀과 선수 이름은 위 기록에 나온 표기를 그대로 사용하고, 철자를 바꾸거나 비슷한 단어로 대체하지 마세요.`;

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

    review = sanitizeGameReviewContent(review, {
      opponent,
      playerNames: [...battingData.map((entry) => entry.name), ...pitchingData.map((entry) => entry.name)],
    });

    // DB 저장
    const { data: saved, error: dbError } = await saveGameRecord({
      game_date: gameDate,
      opponent,
      season,
      score: `${teamR}`,
      batting_data: battingData,
      pitching_data: pitchingData,
      highlights,
      ai_review: review,
    });

    if (dbError) console.error("DB save error:", dbError);
    revalidatePath("/game-review");

    return Response.json({ review, battingData, pitchingData, highlights, gameId: saved?.id, season });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("Game review error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 과거 기록 조회
export async function GET(request: NextRequest) {
  const season = request.nextUrl.searchParams.get("season");
  const activatedSeasons = await getActivatedPlaceholderSeasons(supabase);
  if (season && isLockedSeason(season, activatedSeasons)) {
    return Response.json({ records: [] });
  }
  const { data } = await supabase
    .from("game_records")
    .select("*")
    .order("created_at", { ascending: false });
  const records = !season
    ? (data || [])
    : (data || []).filter((record: any) => !("season" in record) || record.season === season);
  return Response.json({ records });
}

// 기록 삭제
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await supabase.from("game_records").delete().eq("id", id);
  revalidatePath("/game-review");
  return Response.json({ success: true });
}
