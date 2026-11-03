import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("재업로드 precheck", () => {
  it("A·B·C를 실제 FK 기준으로 찾고 교체될 요약 행은 B에서 제외한다", async () => {
    const db = new PGlite();
    await db.exec(read("tests/sql/replica.sql"));
    await db.exec(`
      insert into players (id, number, name) values (1, 38, '옛선수'), (2, 7, '가 선수');
      insert into games (id, date, opponent, season) values (1, '2026-01-01', '테스트팀', '2026');
      insert into batting_stats (player_id, season, game_id) values (1, '2024', null), (1, '2026', 1), (2, '2024', null);
      insert into ai_reports (player_id, report_type) values (1, 'player');
    `);
    const input = JSON.stringify([
      { season: "2024", number: 38, name: "새선수" },
      { season: "2024", number: 7, name: "가선수" },
    ]);
    const script = read("sql/review/reupload_precheck.sql").replace(
      /\$json\$[\s\S]*?\$json\$/,
      `$json$${input}$json$`,
    );
    const results = await db.exec(script);
    const rows = results.flatMap((result) => result.rows as Record<string, unknown>[]).filter((row) => row.kind);
    expect(rows.filter((row) => row.kind === "A").map((row) => row.player_id)).toEqual([1]);
    expect(rows.filter((row) => row.kind === "B").map((row) => [row.reference_table, Number(row.reference_count)]).sort()).toEqual([
      ["public.ai_reports", 1],
      ["public.batting_stats", 1],
    ]);
    expect(rows.filter((row) => row.kind === "C").map((row) => [row.number, row.name])).toEqual([[38, "새선수"]]);
  });
});
