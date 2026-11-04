-- Devils Console: 감사 로그 + 원자적 시즌 교체 함수
-- 적용: Supabase SQL Editor에서 실행 (또는 supabase db push). 기존 테이블 구조는 바꾸지 않는다.

create table if not exists public.console_audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor       text        not null,           -- 로그인한 운영진 이메일
  action      text        not null,           -- replace_season | update | insert
  table_name  text        not null,
  before      jsonb,
  after       jsonb,
  note        text
);
create index if not exists console_audit_log_created_idx on public.console_audit_log (created_at desc);

alter table public.console_audit_log enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가. 콘솔은 서버에서 service_role 키로만 읽고 쓴다.


-- AI 리포트에 시즌 표시 (지금은 시즌 구분이 없어 2026 대시보드에 지난 시즌 분석이 노출됨)
-- 추가 컬럼이라 기존 코드에는 영향 없음. 홈페이지·기존 플랫폼은 season 필터를 추가하면 된다.
alter table public.ai_reports add column if not exists season text;


-- 시즌 요약 행 교체를 한 트랜잭션으로 처리 (삭제 후 삽입 도중 실패해도 기존 데이터 보존)
create or replace function public.console_replace_season(
  p_season   text,
  p_batting  jsonb,
  p_pitching jsonb,
  p_actor    text,
  p_source   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_b jsonb;
  v_before_p jsonb;
  v_nb int;
  v_np int;
begin
  if p_season !~ '^20[0-9]{2}$' then
    raise exception '시즌 값은 20XX 형식이어야 합니다: %', p_season;
  end if;

  select coalesce(jsonb_agg(to_jsonb(b)), '[]') into v_before_b
    from batting_stats b where season = p_season and game_id is null;
  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into v_before_p
    from pitching_stats p where season = p_season and game_id is null;

  delete from batting_stats  where season = p_season and game_id is null;
  delete from pitching_stats where season = p_season and game_id is null;

  insert into batting_stats (player_id, season, pa, ab, runs, hits, doubles, triples, hr, rbi, bb, hbp, so, sb)
  select (r->>'player_id')::int, p_season,
         (r->>'pa')::int, (r->>'ab')::int, (r->>'runs')::int, (r->>'hits')::int, (r->>'doubles')::int,
         (r->>'triples')::int, (r->>'hr')::int, (r->>'rbi')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'sb')::int
    from jsonb_array_elements(p_batting) r;
  get diagnostics v_nb = row_count;

  insert into pitching_stats (player_id, season, w, l, sv, hld, ip, ha, runs_allowed, er, bb, hbp, so, hr_allowed)
  select (r->>'player_id')::int, p_season,
         (r->>'w')::int, (r->>'l')::int, (r->>'sv')::int, (r->>'hld')::int, (r->>'ip')::numeric,
         (r->>'ha')::int, (r->>'runs_allowed')::int, (r->>'er')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'hr_allowed')::int
    from jsonb_array_elements(p_pitching) r;
  get diagnostics v_np = row_count;

  insert into console_audit_log (actor, action, table_name, before, after, note) values
    (p_actor, 'replace_season', 'batting_stats',  v_before_b, p_batting,  p_season || ' ← ' || p_source),
    (p_actor, 'replace_season', 'pitching_stats', v_before_p, p_pitching, p_season || ' ← ' || p_source);

  return jsonb_build_object('batting', v_nb, 'pitching', v_np,
                            'before_batting', jsonb_array_length(v_before_b),
                            'before_pitching', jsonb_array_length(v_before_p));
end;
$$;

revoke all on function public.console_replace_season(text, jsonb, jsonb, text, text) from public, anon, authenticated;
