/**
 * 선수 등록 API — 이전 코드는 players에 없는 position 컬럼을 insert 해 항상 실패했다.
 * 지금 코드가 보내는 payload가 실제 컬럼(number, name, is_pitcher)뿐인지, 중복 판단이 (배번, 이름)인지 확인한다.
 * (payload가 DB에서 실제로 들어가는지는 tests/sql/migrations.test.ts가 PGlite로 확인)
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existing: [] as Array<{ id: number; name: string }>,
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "players") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: async () => ({ data: state.existing }) }),
        insert: (row: Record<string, unknown>) => {
          state.inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: 101, ...row }, error: null }) }) };
        },
      };
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_KEY = "test";

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/players/route");
  const req = new NextRequest("http://localhost/api/players", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
};

describe("POST /api/players", () => {
  beforeEach(() => {
    state.existing = [];
    state.inserted = [];
  });

  it("number·name·is_pitcher만 insert 한다 (position 없음)", async () => {
    const { status, json } = await post({ number: 77, name: " 가선수 ", is_pitcher: true, position: "P" });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(state.inserted).toEqual([{ number: 77, name: "가선수", is_pitcher: true }]);
  });

  it("배번과 이름이 모두 같을 때만 중복(409)으로 본다", async () => {
    state.existing = [{ id: 1, name: "가 선수" }];
    expect((await post({ number: 77, name: "가선수" })).status).toBe(409);
    expect(state.inserted).toEqual([]);
    state.existing = [{ id: 1, name: "다른선수" }];                  // 같은 배번, 다른 이름 → 새 선수
    expect((await post({ number: 77, name: "가선수" })).status).toBe(200);
    expect(state.inserted).toHaveLength(1);
  });

  it("배번이나 이름이 없으면 400", async () => {
    expect((await post({ name: "x" })).status).toBe(400);
    expect((await post({ number: 7 })).status).toBe(400);
  });
});
