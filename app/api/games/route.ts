import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isSeasonValue } from "@/lib/season";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GAME_EDITABLE_FIELDS = new Set([
  "date", "time", "opponent", "location", "is_home", "result", "score_us", "score_them", "notes", "season",
]);

/** 시즌 칸에는 연도만 저장 ("Spring"/"Fall" 같은 학기 값이 들어가 화면에서 사라지던 문제) */
function resolveGameSeason(season: unknown, date: string | null | undefined): string | null {
  const value = String(season ?? "").trim();
  if (isSeasonValue(value) && value !== "Career") return value;
  return String(date ?? "").match(/^(20\d{2})-/)?.[1] ?? null;
}

export async function GET() {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, time, opponent, location, is_home, result, score_us, score_them, notes, season } = body;

    const { data, error } = await supabase
      .from("games")
      .insert({
        date,
        time: time || null,
        opponent,
        location: location || null,
        is_home: is_home ?? true,
        result: result || null,
        score_us: score_us ?? null,
        score_them: score_them ?? null,
        notes: notes || null,
        season: resolveGameSeason(season, date) ?? String(new Date().getFullYear()),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "서버 오류" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // 임의 컬럼을 그대로 update 하지 않도록 허용 필드만 받는다
    const fields: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([key]) => GAME_EDITABLE_FIELDS.has(key))
    );
    if ("season" in fields) {
      const season = resolveGameSeason(fields.season, (fields.date as string | undefined) ?? null);
      if (season) fields.season = season;
      else delete fields.season;
    }

    const { data, error } = await supabase
      .from("games")
      .update(fields)
      .eq("id", Number(id))
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("games").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}