// app/api/situations/[id]/evaluate/route.ts
// 경기 후 결정에 대한 사후 평가 업데이트 (Gotham 결과 재유입 원칙)

export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// PATCH: 결정 사후 평가 업데이트
// body: { decision_id, retrospective_eval, retrospective_note, evaluated_by, outcome, outcome_detail, runs_scored_after }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: situation_id } = await params;
    const body = await request.json();
    const {
      decision_id,
      retrospective_eval,
      retrospective_note,
      evaluated_by,
      outcome,
      outcome_detail,
      runs_scored_after,
    } = body;

    if (!decision_id || !retrospective_eval) {
      return NextResponse.json(
        { error: "decision_id, retrospective_eval 필수" },
        { status: 400 }
      );
    }

    const validEvals = ["correct", "incorrect", "ambiguous", "pending"];
    if (!validEvals.includes(retrospective_eval)) {
      return NextResponse.json(
        { error: `retrospective_eval은 ${validEvals.join(", ")} 중 하나여야 합니다` },
        { status: 400 }
      );
    }

    // 해당 situation의 결정인지 확인
    const { data: existing, error: checkErr } = await supabase
      .from("game_decisions")
      .select("id, situation_id")
      .eq("id", decision_id)
      .eq("situation_id", situation_id)
      .single();

    if (checkErr || !existing) {
      return NextResponse.json(
        { error: "해당 상황의 결정을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      retrospective_eval,
      retrospective_note: retrospective_note ?? null,
      evaluated_by:       evaluated_by       ?? null,
      evaluated_at:       new Date().toISOString(),
    };

    if (outcome)                   updatePayload.outcome            = outcome;
    if (outcome_detail)            updatePayload.outcome_detail     = outcome_detail;
    if (runs_scored_after != null) updatePayload.runs_scored_after  = runs_scored_after;

    const { data, error } = await supabase
      .from("game_decisions")
      .update(updatePayload)
      .eq("id", decision_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, decision: data });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}

// GET: Similar Cases 검색
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: situation_id } = await params;

  // 현재 상황 조회 — score_diff는 DB에 없으므로 score_us, score_them으로 계산
  const { data: sit, error: sitErr } = await supabase
    .from("situations")
    .select("inning, base_state, out_count, score_us, score_them, leverage_class")
    .eq("id", situation_id)
    .single();

  if (sitErr || !sit) {
    return NextResponse.json({ error: "상황을 찾을 수 없습니다" }, { status: 404 });
  }

  const score_diff = (sit.score_us ?? 0) - (sit.score_them ?? 0);

  // Similar Cases 함수 호출
  const { data: cases, error: caseErr } = await supabase
    .rpc("find_similar_cases", {
      p_inning:     sit.inning,
      p_base_state: sit.base_state,
      p_out_count:  sit.out_count,
      p_score_diff: score_diff,
      p_lev_class:  sit.leverage_class,
      p_limit:      5,
    });

  if (caseErr) return NextResponse.json({ error: caseErr.message }, { status: 500 });

  return NextResponse.json({ similar_cases: cases ?? [] });
}
