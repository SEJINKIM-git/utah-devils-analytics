export const runtime = "nodejs";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ── Types (exported for UI) ───────────────────────────────────────────────────

export type ParsedAtBat = {
  pitches: string[];
  result: string;
  result_type: "strikeout" | "walk" | "hbp" | "single" | "double" | "triple" | "hr"
             | "groundout" | "flyout" | "forceout" | "fielders_choice" | "other";
  runs_scored: number;
  outs_before: number;
  outs_after: number;
  base_state_before: number;
  base_state_after: number;
  notes: string | null;
};

export type ParsedInning = {
  inning: number;
  half: "top" | "bottom";
  pitcher: string;
  stats: {
    pitches: number;
    strikeouts: number;
    walks: number;
    hits: number;
    runs: number;
  };
  at_bats: ParsedAtBat[];
  summary: string;
  score_us_end: number;
  score_them_end: number;
};

export type ParsedLineup = {
  order: number;
  position: string;
  name: string;
  number: number | null;
};

export type DetectedSituation = {
  inning: number;
  half: "top" | "bottom";
  description: string;
  base_state: number;
  out_count: number;
  score_us: number;
  score_them: number;
  pitcher: string | null;
  leverage_hint: "high" | "medium" | "low";
  context_note: string;
  suggested_decision_type: string | null;
};

export type ParsedGameNotes = {
  lineup: ParsedLineup[];
  innings: ParsedInning[];
  detected_situations: DetectedSituation[];
  team_name: string | null;
  parse_notes: string | null;
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 한국 사회인 야구 경기 기록 메모 파서입니다.
한국어 야구 기록 메모를 분석하여 구조화된 JSON만 반환합니다.

한국 야구 기록 표기:
투구: 스트/스트라이크=called strike, 파울=foul, 볼=ball, 헛스윙=swinging strike
결과: 삼진=strikeout, 볼넷=walk, 사구=hbp, 안타/내야안타=single, 2루타=double, 3루타=triple, 홈런=hr
아웃: 땅볼/내야땅볼=groundout, 플라이/뜬공=flyout, 포스 아웃=forceout, 병살/세잎=fielders_choice
중간이벤트: 도루 허용=stolen base(runner advances), 폭투=wild pitch(runner may advance), 포일=passed ball
이닝: 회초=top(상대팀 공격=we defend), 회말=bottom(우리팀 공격)

베이스 비트마스크: 1루=1, 2루=2, 3루=4 (예: 1루+3루=5, 만루=7)

레버리지 판단 기준:
- high: 득점권 주자 + 2아웃, 동점/역전 상황, 이닝 후반 연속 실점
- medium: 득점권 주자 + 0~1아웃, 1~2점 차 상황
- low: 대량 리드 상황, 이닝 초반 무주자

타석은 연속된 투구 후 결과 이벤트로 구분됩니다. 도루 허용/폭투는 타석 진행 중 이벤트입니다.
각 타석마다 타석 전후의 주자 상황과 아웃 카운트를 정확히 추적하세요.

반드시 유효한 JSON만 반환, 설명이나 코드블록 없이.`;

const SCHEMA_PROMPT = `다음 메모를 분석하여 아래 JSON 스키마로 반환하세요:

{
  "team_name": "팀명 또는 null",
  "parse_notes": "파싱 중 특이사항 또는 null",
  "lineup": [
    {"order": 1, "position": "DH", "name": "강배현", "number": 1}
  ],
  "innings": [
    {
      "inning": 1,
      "half": "top",
      "pitcher": "소이어",
      "stats": {"pitches": 40, "strikeouts": 2, "walks": 2, "hits": 3, "runs": 5},
      "score_us_end": 0,
      "score_them_end": 5,
      "summary": "5실점, 소이어 40구",
      "at_bats": [
        {
          "pitches": ["파울","스트","파울","볼","파울","볼","볼","삼진"],
          "result": "삼진",
          "result_type": "strikeout",
          "runs_scored": 0,
          "outs_before": 0, "outs_after": 1,
          "base_state_before": 0, "base_state_after": 0,
          "notes": null
        }
      ]
    }
  ],
  "detected_situations": [
    {
      "inning": 1,
      "half": "top",
      "description": "만루 2아웃 상황",
      "base_state": 7,
      "out_count": 1,
      "score_us": 0,
      "score_them": 3,
      "pitcher": "소이어",
      "leverage_hint": "high",
      "context_note": "1회초 만루 상황, 이미 3실점 중 추가 실점 위기",
      "suggested_decision_type": "pitching_change"
    }
  ]
}

메모:
`;

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json({ error: "메모 텍스트가 너무 짧습니다" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: SCHEMA_PROMPT + text.trim() },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const parsed: ParsedGameNotes = JSON.parse(raw);

    return NextResponse.json(parsed);

  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "파싱 오류" },
      { status: 500 }
    );
  }
}
