/**
 * sql/001~004를 운영 스키마 복제본(PGlite = WASM Postgres)에 실제로 적용해 검증한다.
 * 운영 DB에서 발견된 문제(이중 행, 이닝 표기 오류, 학기 시즌 값, 열린 RLS)를 그대로 심어 두고 시작한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sql = (file: string) => readFileSync(path.join(root, file), "utf8");

/** 004 파일에서 주석 처리된 2단계 블록만 꺼낸다 */
function cleanupFixBlock() {
  const text = sql("sql/004_data_cleanup_REVIEW.sql");
  const match = text.match(/\/\*\s*([\s\S]*?)\*\//);
  if (!match) throw new Error("004 수정 블록을 찾지 못함");
  return match[1];
}

function cleanupPreviewBlock() {
  return sql("sql/004_data_cleanup_REVIEW.sql").split("/*")[0];
}

let db: PGlite;

async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    // 실패로 트랜잭션이 깨졌으면 reset role도 거부되므로 롤백부터
    await db.exec("reset role").catch(async () => {
      await db.exec("rollback");
      await db.exec("reset role");
    });
  }
}

/** 트랜잭션 안에서 실행하고 항상 되돌린다 */
async function inRollback(fn: () => Promise<void>) {
  await db.exec("begin");
  try {
    await fn();
  } finally {
    await db.exec("rollback").catch(() => undefined);
  }
}

const count = async (q: string) => Number((await db.query<{ n: number }>(q)).rows[0].n);

async function seed() {
  await db.exec(`
    insert into players (id, number, name, is_pitcher) values
      (1, 52, '선수B', false),   -- 2022 #52 선수A 기록이 붙어 있는 레코드
      (2, 2, '투수C', true),
      (3, 11, '투수D', true),
      (4, 35, '투수E', true);

    insert into games (id, date, opponent, season) values
      (27, '2026-09-26', '선학', '2026'),
      (28, '2026-10-03', '사회인', '2026'),
      (29, '2026-10-24', '선학', '2026'),        -- 기록 업로드 전, 상황만 기록된 경기
      (40, '2025-09-26', '곤지암', 'Fall'),     -- 학기가 시즌 칸에 들어간 경기
      (41, '2025-03-14', '곤지암', 'Spring');

    -- 2022 시즌 요약 (경기별 행 없음) → 정리 대상 아님
    insert into batting_stats (player_id, season, game_id, pa, ab, hits, bb, so) values (1, '2022', null, 31, 25, 13, 6, 3);
    insert into pitching_stats (player_id, season, game_id, ip, er, so, bb, ha) values (3, '2023', null, 13.2, 7, 10, 5, 9);

    -- 2026: 경기별 행 + 같은 값의 요약 행 (이중 집계)
    insert into pitching_stats (player_id, season, game_id, ip, er, so, bb, ha) values
      (2, '2026', 27, 1.0, 0, 3, 0, 1),
      (2, '2026', 28, 3.3, 2, 3, 1, 2),        -- 소수 표기 3⅓
      (2, '2026', null, 1.0, 0, 3, 0, 1),
      (2, '2026', null, 3.3, 2, 3, 1, 2),
      (4, '2026', 28, 1.7, 3, 1, 2, 2);        -- 소수 표기 1⅔
    insert into batting_stats (player_id, season, game_id, pa, ab, hits, bb, so) values
      (2, '2026', 27, 4, 3, 2, 1, 0),
      (2, '2026', null, 4, 3, 2, 1, 0);

    -- 학기 시즌 값 + 0으로만 채워진 행
    insert into batting_stats (player_id, season, pa, ab, hits, bb, so) values (3, 'Spring', 0, 0, 0, 0, 0);
    insert into pitching_stats (player_id, season, ip, er, so, bb) values (3, 'Spring', 0, 0, 0, 0);

    -- Career 행의 불가능한 이닝 (표기끼리 더한 값) → 그대로 둔다
    insert into pitching_stats (player_id, season, ip, er, so, bb) values (4, 'Career', 85.4, 30, 70, 40);

    -- 상황 기록 (games에 ON DELETE CASCADE)
    insert into situations (game_id, season, inning, inning_half, base_state, out_count, score_us, score_them)
      values (29, '2026', 6, 'top', 1, 0, 3, 3);

    -- id를 직접 넣었으므로 시퀀스를 그 뒤로 옮긴다
    select setval(pg_get_serial_sequence('players', 'id'), 100);
    select setval(pg_get_serial_sequence('games', 'id'), 100);
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("tests/sql/replica.sql"));
  await seed();
});

describe("적용 전 상태 (운영과 동일한 취약점 재현)", () => {
  it("anon이 (기록 업로드 전) 경기를 지우면 상황 기록까지 함께 사라진다", async () => {
    await inRollback(async () => {
      const deleted = await asRole("anon", () => db.query("delete from games where id = 29"));
      expect(deleted.affectedRows).toBe(1);
      expect(await count("select count(*) n from situations")).toBe(0);
    });
    expect(await count("select count(*) n from situations")).toBe(1);
  });

  it("anon이 조건 없는 delete로 선수 기록 전체를 지울 수 있다", async () => {
    await inRollback(async () => {
      const deleted = await asRole("anon", () => db.query("delete from batting_stats"));
      expect(deleted.affectedRows).toBeGreaterThan(0);
    });
  });

  it("enum에 없는 판단 유형(infield_in)은 저장이 실패한다", async () => {
    await expect(
      db.query(`insert into game_decisions (situation_id, season, decision_type, decision_summary)
                select id, '2026', 'infield_in', 'test' from situations limit 1`)
    ).rejects.toThrow();
  });
});

describe("001 감사 로그 · 시즌 교체 함수 · ai_reports.season", () => {
  beforeAll(async () => {
    await db.exec(sql("sql/001_audit_log_and_report_season.sql"));
  });

  it("ai_reports에 season 컬럼이 생긴다", async () => {
    await db.query("insert into ai_reports (report_type, season, summary) values ('team', '2026', 'x')");
    expect(await count("select count(*) n from ai_reports where season = '2026'")).toBe(1);
  });

  it("시즌 요약 행만 교체하고 경기별 행·다른 시즌은 건드리지 않으며 감사 로그를 남긴다", async () => {
    await inRollback(async () => {
    const res = await db.query<{ r: Record<string, number> }>(`select console_replace_season(
      '2022',
      '[{"player_id":1,"pa":31,"ab":25,"runs":11,"hits":13,"doubles":0,"triples":0,"hr":0,"rbi":5,"bb":6,"hbp":0,"so":3,"sb":14}]'::jsonb,
      '[]'::jsonb, 'tester@example.com', '2022.xlsx') r`);
    expect(res.rows[0].r).toMatchObject({ batting: 1, pitching: 0, before_batting: 1, before_pitching: 0 });
    expect(await count("select count(*) n from batting_stats where season = '2022' and runs = 11")).toBe(1);
    expect(await count("select count(*) n from batting_stats where season = '2026' and game_id is not null")).toBe(1);
    expect(await count("select count(*) n from console_audit_log where actor = 'tester@example.com'")).toBe(2);
    });
  });

  it("중간에 실패하면 전체가 롤백되어 기존 기록이 남는다", async () => {
    await expect(
      db.query(`select console_replace_season('2022',
        '[{"player_id":9999,"pa":1,"ab":1,"runs":0,"hits":0,"doubles":0,"triples":0,"hr":0,"rbi":0,"bb":0,"hbp":0,"so":0,"sb":0}]'::jsonb,
        '[]'::jsonb, 't', 'bad.xlsx')`)
    ).rejects.toThrow(); // 없는 선수 → FK 오류
    expect(await count("select count(*) n from batting_stats where season = '2022' and pa = 31")).toBe(1);
  });

  it("연도가 아닌 시즌 값은 거부한다", async () => {
    await expect(db.query("select console_replace_season('Spring', '[]', '[]', 't', 'x')")).rejects.toThrow(/20XX/);
  });

  it("anon은 시즌 교체 함수를 호출할 수 없다", async () => {
    await expect(asRole("anon", () => db.query("select console_replace_season('2022', '[]', '[]', 't', 'x')"))).rejects.toThrow(
      /permission denied/
    );
  });
});

describe("002 판단 유형", () => {
  beforeAll(async () => {
    await db.exec(sql("sql/002_decision_types.sql"));
  });

  it("infield_in, no_doubles를 저장할 수 있다", async () => {
    for (const t of ["infield_in", "no_doubles"]) {
      await db.query(`insert into game_decisions (situation_id, season, decision_type, decision_summary)
                      select id, '2026', '${t}', 'test' from situations limit 1`);
    }
    expect(await count("select count(*) n from game_decisions")).toBe(2);
  });

  it("코드의 판단 유형 목록이 DB enum과 정확히 같다", async () => {
    const { DECISION_TYPES } = await import("@/lib/decisionTypes");
    const enumValues = (await db.query<{ v: string }>("select unnest(enum_range(null::decision_type))::text v")).rows.map((r) => r.v);
    expect(DECISION_TYPES.map((t) => t.value).sort()).toEqual([...enumValues].sort());
  });
});

describe("003 RLS 강화", () => {
  beforeAll(async () => {
    await db.exec(sql("sql/003_rls_hardening.sql"));
  });

  it("anon은 경기를 지우거나 고칠 수 없다 (상황 기록 보존)", async () => {
    const del = await asRole("anon", () => db.query("delete from games where id = 29"));
    expect(del.affectedRows).toBe(0);
    const upd = await asRole("anon", () => db.query("update games set opponent = 'x' where id = 29"));
    expect(upd.affectedRows).toBe(0);
    expect(await count("select count(*) n from situations")).toBe(1);
  });

  it("anon은 기록·선수·명단·라인업을 지우거나 추가할 수 없다", async () => {
    for (const table of ["batting_stats", "pitching_stats", "players", "roster_uploads", "lineups"]) {
      const del = await asRole("anon", () => db.query(`delete from ${table}`));
      expect(del.affectedRows, table).toBe(0);
    }
    await expect(asRole("anon", () => db.query("insert into players (number, name) values (1, 'x')"))).rejects.toThrow(
      /row-level security/
    );
  });

  it("공개 읽기(경기·상황)는 유지된다", async () => {
    expect(await asRole("anon", () => count("select count(*) n from games"))).toBe(5);
    expect(await asRole("anon", () => count("select count(*) n from situations"))).toBe(1);
  });

  it("서버(service_role)는 계속 쓰고 지울 수 있다", async () => {
    await inRollback(async () => {
      const ins = await asRole("service_role", () => db.query("insert into players (number, name) values (77, '테스트') returning id"));
      expect(ins.rows.length).toBe(1);
      const del = await asRole("service_role", () => db.query("delete from players where number = 77"));
      expect(del.affectedRows).toBe(1);
    });
  });
});

describe("004 데이터 정리", () => {
  it("미리보기 쿼리가 대상을 정확히 찾는다", async () => {
    const results = await db.exec(cleanupPreviewBlock());
    const rowsOf = (i: number) => results[i].rows as Record<string, unknown>[];
    expect(rowsOf(0)).toHaveLength(2); // (A) Fall/Spring 경기
    expect(rowsOf(1)).toHaveLength(2); // (B) batting/pitching 'Spring'
    expect(rowsOf(2).map((r) => Number(r["현재"])).sort()).toEqual([1.7, 3.3, 3.3]); // (C) Career 85.4 제외
    expect(rowsOf(3).map((r) => Number(r.count)).reduce((a, b) => a + b, 0)).toBe(3); // (D) 요약 행 3개
  });

  it("수정 블록이 문제만 고치고 정상 기록은 보존한다", async () => {
    await db.exec(cleanupFixBlock());

    const games = (await db.query<{ id: number; season: string }>("select id, season from games where id in (40, 41) order by id")).rows;
    expect(games).toEqual([{ id: 40, season: "2025" }, { id: 41, season: "2025" }]);

    expect(await count("select count(*) n from batting_stats where season = 'Spring'")).toBe(0);
    expect(await count("select count(*) n from pitching_stats where season = 'Spring'")).toBe(0);

    const ips = (await db.query<{ ip: string }>("select ip::text from pitching_stats where season = '2026' order by game_id, ip")).rows.map((r) => Number(r.ip));
    expect(ips).toEqual([1, 1.2, 3.1]); // 1.0, 1.7→1.2, 3.3→3.1 / 요약 행 삭제
    expect(await count("select count(*) n from pitching_stats where season = 'Career' and ip = 85.4")).toBe(1);

    expect(await count("select count(*) n from batting_stats where season = '2026' and game_id is null")).toBe(0);
    expect(await count("select count(*) n from batting_stats where season = '2026' and game_id is not null")).toBe(1);
    expect(await count("select count(*) n from batting_stats where season = '2022'")).toBe(1);
    expect(await count("select count(*) n from pitching_stats where season = '2023' and ip = 13.2")).toBe(1);
    expect(await count("select count(*) n from situations")).toBe(1);
  });

  it("다시 실행해도 결과가 같다 (멱등)", async () => {
    const before = (await db.query("select id, ip from pitching_stats order by id")).rows;
    await db.exec(cleanupFixBlock());
    expect((await db.query("select id, ip from pitching_stats order by id")).rows).toEqual(before);
  });
});
