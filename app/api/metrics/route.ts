export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { METRICS, getMetric } from "@/lib/metrics";
import { parseMetricRequest } from "@/lib/metrics/request";
import { createMetricQuery, loadMetricDataset } from "@/lib/metrics/query";

/**
 * 지표 조회 API (읽기 전용, GET만 있다).
 *
 *   GET /api/metrics                                          지표 사전
 *   GET /api/metrics?mode=point&target=team&code=ERA&season=2026
 *   GET /api/metrics?mode=point&target=player:12&code=OBP&season=2026
 *   GET /api/metrics?mode=history&target=player:12&code=OBP&by=game&from=2026&to=2026
 *   GET /api/metrics?mode=rank&code=OPS&season=2026&minPa=10
 *
 * 값은 모두 조회 함수(lib/metrics/query.ts)에서 나온다. 여기서 계산하지 않는다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (!params.get("code") && !params.get("mode")) {
    return Response.json({ metrics: METRICS });
  }

  const parsed = parseMetricRequest(params);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const req = parsed.request;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { dataset } = await loadMetricDataset(supabase);
    const query = createMetricQuery(dataset);
    const metric = getMetric(req.code)!;

    if (req.mode === "rank") {
      const result = query.rank(req.code, req.season, { minPa: req.minPa, minIp: req.minIp, scope: req.scope });
      return Response.json({ mode: req.mode, metric, ...result });
    }
    if (req.mode === "history") {
      const items = query.history(req.target, req.code, { from: req.from, to: req.to, by: req.by, scope: req.scope });
      return Response.json({ mode: req.mode, metric, target: req.target, by: req.by, items });
    }
    const result = query.point(req.target, req.code, req.season, { scope: req.scope });
    return Response.json({ mode: req.mode, metric, target: req.target, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("지표 조회 에러:", message);
    return Response.json({ error: "지표를 불러오지 못했습니다" }, { status: 500 });
  }
}
