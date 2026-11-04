import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizePlayerName } from "@/lib/playerIdentity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { number, is_pitcher } = body;
    const name = String(body?.name ?? "").trim();

    if (!number || !name) {
      return NextResponse.json({ error: "배번과 이름은 필수입니다" }, { status: 400 });
    }

    // 배번은 해마다 다른 선수가 달 수 있으므로 (배번, 이름)이 같을 때만 중복으로 본다.
    // players 테이블에는 position 컬럼이 없다 (이전 코드는 이 때문에 항상 실패했다).
    const { data: existing } = await supabase
      .from("players")
      .select("id,name")
      .eq("number", Number(number));

    if (existing?.some((p) => normalizePlayerName(p.name) === normalizePlayerName(name))) {
      return NextResponse.json({ error: `${number}. ${name} 선수는 이미 등록되어 있습니다` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("players")
      .insert({ number: Number(number), name, is_pitcher: !!is_pitcher })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, player: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류 발생" }, { status: 500 });
  }
}


export async function DELETE(request: NextRequest) {
  try {
    const { playerId } = await request.json();
    if (!playerId) return NextResponse.json({ error: "playerId 필요" }, { status: 400 });

    
    await supabase.from("batting_stats").delete().eq("player_id", playerId);
    await supabase.from("pitching_stats").delete().eq("player_id", playerId);
    const { error } = await supabase.from("players").delete().eq("id", playerId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류 발생" }, { status: 500 });
  }
}