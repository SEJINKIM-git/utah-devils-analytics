import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 선수 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { number, name, position, is_pitcher } = body;

    if (!number || !name) {
      return NextResponse.json({ error: "배번과 이름은 필수입니다" }, { status: 400 });
    }

    // 배번 중복 확인
    const { data: existing } = await supabase
      .from("players")
      .select("id")
      .eq("number", Number(number))
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `배번 ${number}은 이미 사용 중입니다` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("players")
      .insert({ number: Number(number), name: name.trim(), position: position || null, is_pitcher: !!is_pitcher })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, player: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류 발생" }, { status: 500 });
  }
}

// 선수 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { playerId } = await request.json();
    if (!playerId) return NextResponse.json({ error: "playerId 필요" }, { status: 400 });

    // 관련 통계도 삭제
    await supabase.from("batting_stats").delete().eq("player_id", playerId);
    await supabase.from("pitching_stats").delete().eq("player_id", playerId);
    const { error } = await supabase.from("players").delete().eq("id", playerId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류 발생" }, { status: 500 });
  }
}