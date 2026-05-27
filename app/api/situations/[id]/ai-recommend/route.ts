export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function baseLabel(s: number): string {
  if (s === 0) return "무주자";
  const p: string[] = [];
  if (s & 1) p.push("1루");
  if (s & 2) p.push("2루");
  if (s & 4) p.push("3루");
  return p.join("·");
}

const EVAL_KO: Record<string, string> = {
  correct: "정확", incorrect: "오류", ambiguous: "애매", pending: "미평가",
};

const DECISION_KO: Record<string, string> = {
  pitching_change: "투수 교체", steal_attempt: "도루 시도", bunt: "번트",
  hit_and_run: "히트앤런", intentional_walk: "고의사구", defensive_shift: "수비 시프트",
  pinch_hit: "대타", pinch_run: "대주자", infield_in: "내야 전진",
  no_doubles: "노더블 얼라인", other: "기타",
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. 현재 상황 조회
    const { data: sit, error: sitErr } = await supabase
      .from("v_situation_decisions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (sitErr || !sit) {
      return NextResponse.json({ error: "상황을 찾을 수 없습니다" }, { status: 404 });
    }

    // 2. 유사 사례 조회
    const scoreDiff = ((sit.score_us ?? 0) as number) - ((sit.score_them ?? 0) as number);
    const { data: similarRaw } = await supabase
      .rpc("find_similar_cases", {
        p_inning:     sit.inning,
        p_base_state: sit.base_state,
        p_out_count:  sit.out_count,
        p_score_diff: scoreDiff,
        p_lev_class:  sit.leverage_class,
        p_limit:      6,
      });
    const similar = (similarRaw ?? []) as Array<Record<string, unknown>>;

    // 3. 프롬프트 조성
    const inningHalf = sit.inning_half === "top" ? "초" : "말";
    const li         = sit.leverage_index != null ? `${(sit.leverage_index as number).toFixed(2)}` : "?";
    const levLabel   = sit.leverage_class === "high" ? "고레버리지" : sit.leverage_class === "low" ? "저레버리지" : "중레버리지";
    const baseSt     = baseLabel(sit.base_state as number);
    const diff       = scoreDiff >= 0 ? `+${scoreDiff}` : String(scoreDiff);

    const similarSection = similar.length > 0
      ? `\n유사 과거 사례 (${similar.length}건):\n` +
        similar.map((c, i) => {
          const dt = c.decision_type ? (DECISION_KO[c.decision_type as string] ?? c.decision_type) : "결정 없음";
          const ev = EVAL_KO[c.retrospective_eval as string ?? "pending"] ?? "미평가";
          return `  ${i + 1}. ${baseLabel(c.base_state as number)} ${c.out_count}아웃 — 결정: ${dt} → 평가: ${ev}`;
        }).join("\n")
      : "\n유사 과거 사례: 없음";

    const contextSection = sit.context_note
      ? `\n현장 메모: ${sit.context_note}` : "";

    const userPrompt = `다음 야구 경기 상황을 분석하고 전략 액션 카드를 JSON으로 반환하세요.

상황:
- ${sit.inning}회 ${inningHalf}, ${baseSt}, ${sit.out_count}아웃
- 점수: 우리팀 ${sit.score_us} — 상대팀 ${sit.score_them} (차이: ${diff})
- 레버리지: ${levLabel} (LI=${li})${contextSection}${similarSection}

다음 JSON 형식을 반드시 지켜서 반환하세요 (코드블록 없이 JSON만):
{
  "context_summary": "상황 한 줄 요약",
  "primary_recommendation": "가장 추천하는 작전명",
  "primary_action_type": "decision_type 키",
  "cards": [
    {
      "action": "작전 이름 (한국어)",
      "action_type": "steal_attempt|bunt|hit_and_run|intentional_walk|pitching_change|defensive_shift|pinch_hit|pinch_run|infield_in|no_doubles|other 중 하나",
      "recommendation": "권장|고려|주의|비권장",
      "confidence": 0.0에서 1.0 사이 숫자,
      "rationale": "이 작전을 추천/비추천하는 이유 (1~2문장 한국어)",
      "historical_note": "과거 유사 사례 참고 (없으면 null)"
    }
  ]
}

규칙: cards는 2~4개. 상황에 맞는 공격/수비 작전을 혼합하여 제안. confidence는 유사 사례와 상황 맥락을 반영.`;

    const systemPrompt =
      "당신은 사회인 야구팀 Utah Devils의 전략 분석가입니다. " +
      "경기 중 특정 상황에서 감독이 어떤 결정을 내려야 할지 분석하고 근거 있는 전략 카드를 제공합니다. " +
      "답변은 반드시 유효한 JSON 형식으로만 반환하세요.";

    // 4. AI 호출
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const result = JSON.parse(raw);

    return NextResponse.json({ ...result, similar_count: similar.length });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 분석 오류" },
      { status: 500 }
    );
  }
}
