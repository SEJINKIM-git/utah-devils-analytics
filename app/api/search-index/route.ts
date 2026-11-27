export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getPlayerDisplayName, getPlayerNameVariants } from "@/lib/playerDisplay";
import { dedupePlayersByIdentity } from "@/lib/playerIdentity";

/**
 * 검색 팔레트용 선수 목록 (읽기 전용, GET만 있다).
 * 같은 (배번, 이름)의 중복 레코드는 가장 최근 것 하나만 준다.
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.from("players").select("id,number,name,is_pitcher").order("number");
    if (error) throw new Error(error.message);

    const players = dedupePlayersByIdentity(data || []).map((player) => ({
      id: player.id,
      number: player.number,
      name: player.name,
      nameEn: getPlayerDisplayName(player.name, "en"),
      terms: getPlayerNameVariants(player.name),
      isPitcher: Boolean(player.is_pitcher),
    }));
    return Response.json({ players });
  } catch (error: unknown) {
    console.error("검색 목록 에러:", error instanceof Error ? error.message : error);
    return Response.json({ players: [], error: "선수 목록을 불러오지 못했습니다" }, { status: 500 });
  }
}
