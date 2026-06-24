// app/api/situations/route.ts  — v2
// game_id, batter_id, pitcher_id 모두 integer (기존 테이블 타입에 맞춤)

export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── GET: 상황 목록 조회 ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season         = searchParams.get("season") ?? "2026";
  const game_id        = searchParams.get("game_id");        // string → parseInt
  const leverage_class = searchParams.get("leverage_class");
  const inning         = searchParams.get("inning");
  const limit          = parseInt(searchParams.get("limit") ?? "50");

  let query = supabase
    .from("v_situation_decisions")
    .select("*")
    .eq("season", season)
    .order("logged_at", { ascending: false })
    .limit(limit);

  // ✅ integer 컬럼에는 parseInt로 변환해서 넘겨야 타입 불일치 방지
  if (game_id)        query = query.eq("game_id", parseInt(game_id));
  if (leverage_class) query = query.eq("leverage_class", leverage_class);
  if (inning)         query = query.eq("inning", parseInt(inning));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ situations: data });
}

// ── POST: 상황 + 옵션 + 결정 일괄 등록 ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      game_id,              // number (integer)
      season = "2026",
      inning,
      inning_half,
      base_state,
      out_count,
      score_us,
      score_them,
      pitcher_id,           // number (integer) | null
      batter_id,            // number (integer) | null
      batter_hand,
      pitcher_hand,
      pitcher_pitch_count,
      pitcher_fatigue_note,
      context_note,
      logged_by,
      options = [],
      decision,
    } = body;

    // 필수값 검증
    if (!game_id || inning == null || !inning_half ||
        base_state == null || out_count == null ||
        score_us == null || score_them == null) {
      return NextResponse.json(
        { error: "game_id, inning, inning_half, base_state, out_count, score_us, score_them 필수" },
        { status: 400 }
      );
    }

    // ✅ integer 보장 (클라이언트에서 string으로 넘어올 수 있음)
    const gameIdInt    = parseInt(String(game_id));
    const pitcherIdInt = pitcher_id != null ? parseInt(String(pitcher_id)) : null;
    const batterIdInt  = batter_id  != null ? parseInt(String(batter_id))  : null;

    if (isNaN(gameIdInt)) {
      return NextResponse.json({ error: "game_id는 정수여야 합니다" }, { status: 400 });
    }

    // LI 자동 계산
    const score_diff = score_us - score_them;
    const { data: liRaw } = await supabase
      .rpc("calculate_leverage", {
        p_inning:     inning,
        p_out_count:  out_count,
        p_score_diff: score_diff,
        p_base_state: base_state,
      })
      .single();
    const liData = liRaw as { li: number | null; lc: string } | null;

    // situations 삽입
    const { data: situation, error: sitErr } = await supabase
      .from("situations")
      .insert({
        game_id:              gameIdInt,
        season,
        inning,
        inning_half,
        base_state,
        out_count,
        score_us,
        score_them,
        leverage_index:       liData?.li ?? null,
        leverage_class:       liData?.lc ?? "medium",
        pitcher_id:           pitcherIdInt,
        batter_id:            batterIdInt,
        batter_hand:          batter_hand          ?? null,
        pitcher_hand:         pitcher_hand         ?? null,
        pitcher_pitch_count:  pitcher_pitch_count  ?? null,
        pitcher_fatigue_note: pitcher_fatigue_note ?? null,
        context_note:         context_note         ?? null,
        logged_by:            logged_by            ?? null,
      })
      .select()
      .single();

    if (sitErr) return NextResponse.json({ error: sitErr.message }, { status: 500 });

    // situation_options 삽입
    if (options.length > 0) {
      const optRows = options.map((opt: {
        side: string;
        option_label: string;
        option_detail?: string;
        risk_level?: string;
        was_chosen?: boolean;
      }) => ({
        situation_id:  situation.id,
        side:          opt.side,
        option_label:  opt.option_label,
        option_detail: opt.option_detail ?? null,
        risk_level:    opt.risk_level    ?? null,
        was_chosen:    opt.was_chosen    ?? false,
      }));

      const { error: optErr } = await supabase
        .from("situation_options")
        .insert(optRows);

      if (optErr) console.error("situation_options error:", optErr.message);
    }

    // game_decisions 삽입 (선택)
    let savedDecision = null;
    if (decision) {
      const { data: dec, error: decErr } = await supabase
        .from("game_decisions")
        .insert({
          situation_id:        situation.id,
          game_id:             gameIdInt,
          season,
          decision_type:       decision.decision_type,
          decision_summary:    decision.decision_summary,
          rationale:           decision.rationale            ?? null,
          ai_recommendation:   decision.ai_recommendation   ?? null,
          ai_confidence:       decision.ai_confidence        ?? null,
          ai_context_snapshot: decision.ai_context_snapshot ?? null,
          outcome:             decision.outcome              ?? null,
          outcome_detail:      decision.outcome_detail       ?? null,
          runs_scored_after:   decision.runs_scored_after    ?? null,
          retrospective_eval:  decision.retrospective_eval   ?? "pending",
          decided_by:          decision.decided_by           ?? null,
          logged_by:           logged_by                     ?? null,
        })
        .select()
        .single();

      if (decErr) console.error("game_decisions error:", decErr.message);
      else savedDecision = dec;
    }

    return NextResponse.json({
      success:        true,
      situation_id:   situation.id,
      leverage_index: situation.leverage_index,
      leverage_class: situation.leverage_class,
      decision_id:    savedDecision?.id ?? null,
    });

  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}