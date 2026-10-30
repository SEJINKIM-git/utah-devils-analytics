-- Devils Console: 감사 로그 + 원자적 시즌 교체 함수
-- 적용: Supabase SQL Editor에서 실행 (또는 supabase db push). 기존 테이블 구조는 바꾸지 않는다.

create table if not exists public.console_audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor       text        not null,           -- 로그인한 운영진 이메일
  action      text        not null,           -- replace_season | replace_game | update | insert
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


-- 업로드 행 → 선수 레코드. 콘솔이 (배번, 이름)으로 기존 선수를 찾아 player_id를 넘기고,
-- 없는 선수는 number·name·is_pitcher만 넘긴다. 그러면 같은 트랜잭션 안에서 선수를 만들어
-- 기록 저장이 실패해도 선수 레코드만 남는 일이 없다. 기존 선수의 이름·배번은 절대 바꾸지 않는다.
--   r.player_id   있으면 그 선수 (r.set_pitcher = true면 투수 여부만 보강)
--   r.number+name 그 (배번, 이름) 선수가 이미 있으면 재사용(같은 파일의 타자·투수 블록), 없으면 생성
--   r.name만       배번 없는 경기 기록지(v3.0) 신규 선수 → 임시 배번 900번대
create or replace function public.console_resolve_player(r jsonb, p_actor text) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     integer := (r->>'player_id')::integer;
  v_number integer := (r->>'number')::integer;
  v_name   text    := nullif(trim(r->>'name'), '');
  v_key    text;
begin
  if v_id is null then
    if v_name is null then
      raise exception '선수 이름이 없는 행: %', r;
    end if;
    v_key := lower(regexp_replace(v_name, '\s', '', 'g'));
    select id into v_id from players
     where lower(regexp_replace(name, '\s', '', 'g')) = v_key
       and (v_number is null or number = v_number)
     order by id desc
     limit 1;
    if v_id is null then
      if v_number is null then
        select coalesce(max(number), 899) + 1 into v_number from players where number >= 900;
      end if;
      insert into players (number, name, is_pitcher)
      values (v_number, v_name, coalesce((r->>'is_pitcher')::boolean, false))
      returning id into v_id;
      insert into console_audit_log (actor, action, table_name, before, after)
      values (p_actor, 'insert', 'players', null,
              jsonb_build_object('id', v_id, 'number', v_number, 'name', v_name,
                                 'is_pitcher', coalesce((r->>'is_pitcher')::boolean, false)));
    end if;
  end if;
  if coalesce((r->>'set_pitcher')::boolean, false) then
    update players set is_pitcher = true where id = v_id and is_pitcher is distinct from true;
  end if;
  return v_id;
end;
$$;

revoke all on function public.console_resolve_player(jsonb, text) from public, anon, authenticated;


-- 시즌 요약 행 교체를 한 트랜잭션으로 처리 (삭제 후 삽입 도중 실패해도 기존 데이터 보존)
-- games·situations 등 다른 테이블은 건드리지 않는다. 경기별 행(game_id 있음)도 그대로 둔다.
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
  v_players_before int;
  v_players_after int;
begin
  if p_season !~ '^20[0-9]{2}$' then
    raise exception '시즌 값은 20XX 형식이어야 합니다: %', p_season;
  end if;

  select count(*) into v_players_before from players;

  select coalesce(jsonb_agg(to_jsonb(b)), '[]') into v_before_b
    from batting_stats b where season = p_season and game_id is null;
  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into v_before_p
    from pitching_stats p where season = p_season and game_id is null;

  delete from batting_stats  where season = p_season and game_id is null;
  delete from pitching_stats where season = p_season and game_id is null;

  insert into batting_stats (player_id, season, pa, ab, runs, hits, doubles, triples, hr, rbi, bb, hbp, so, sb)
  select console_resolve_player(r, p_actor), p_season,
         (r->>'pa')::int, (r->>'ab')::int, (r->>'runs')::int, (r->>'hits')::int, (r->>'doubles')::int,
         (r->>'triples')::int, (r->>'hr')::int, (r->>'rbi')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'sb')::int
    from jsonb_array_elements(p_batting) r;
  get diagnostics v_nb = row_count;

  insert into pitching_stats (player_id, season, w, l, sv, hld, ip, ha, runs_allowed, er, bb, hbp, so, hr_allowed)
  select console_resolve_player(r, p_actor), p_season,
         (r->>'w')::int, (r->>'l')::int, (r->>'sv')::int, (r->>'hld')::int, (r->>'ip')::numeric,
         (r->>'ha')::int, (r->>'runs_allowed')::int, (r->>'er')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'hr_allowed')::int
    from jsonb_array_elements(p_pitching) r;
  get diagnostics v_np = row_count;

  select count(*) into v_players_after from players;

  insert into console_audit_log (actor, action, table_name, before, after, note) values
    (p_actor, 'replace_season', 'batting_stats',  v_before_b, p_batting,  p_season || ' ← ' || p_source),
    (p_actor, 'replace_season', 'pitching_stats', v_before_p, p_pitching, p_season || ' ← ' || p_source);

  return jsonb_build_object('batting', v_nb, 'pitching', v_np,
                            'before_batting', jsonb_array_length(v_before_b),
                            'before_pitching', jsonb_array_length(v_before_p),
                            'new_players', v_players_after - v_players_before);
end;
$$;

revoke all on function public.console_replace_season(text, jsonb, jsonb, text, text) from public, anon, authenticated;
