-- 2022~2024 시즌 재업로드 전 점검용. 운영 DB의 영구 데이터를 변경하지 않는다.
-- Supabase SQL Editor에서 실행한다. uploaded_players VALUES만 실제 파일의 (season, number, name)으로 바꾼다.
-- 결과: A=재업로드 뒤 시즌 요약 행이 0개가 되는 기존 선수, B=그 선수의 실제 FK 참조 수, C=DB에 없는 파일 선수.
-- players를 참조하는 테이블/열은 information_schema에서 찾아 동적으로 센다. 테이블 이름을 가정하지 않는다.

-- information_schema에서 찾은 FK별 행 수를 동적으로 세기 위해 pg_temp 함수/테이블만 만들고,
-- 마지막 ROLLBACK으로 세션 종료 전에도 모두 사라진다. public 스키마의 데이터·정의는 쓰지 않는다.
begin;

create or replace function pg_temp.reupload_precheck(uploaded jsonb)
returns table (kind text, player_id integer, number integer, name text, reference_table text, reference_column text, reference_count bigint)
language plpgsql
as $$
declare
  fk record;
  filter_sql text;
begin
  create temp table _upload_players on commit drop as
  select distinct x.season, x.number, trim(x.name) as name
  from jsonb_to_recordset(uploaded) as x(season text, number integer, name text)
  where x.season ~ '^20[0-9]{2}$' and x.number is not null and nullif(trim(x.name), '') is not null;

  create temp table _affected on commit drop as
  select distinct p.id, p.number, p.name
  from public.players p
  join (
    select b.player_id, b.season from public.batting_stats b where b.game_id is null
    union
    select q.player_id, q.season from public.pitching_stats q where q.game_id is null
  ) old_summary on old_summary.player_id = p.id
  join (select distinct season from _upload_players) seasons on seasons.season = old_summary.season
  where not exists (
    select 1 from _upload_players u
    where u.number = p.number
      and lower(regexp_replace(u.name, '\s+', '', 'g')) = lower(regexp_replace(p.name, '\s+', '', 'g'))
  )
  and not exists (
    select 1
    from (
      select b.player_id, b.season from public.batting_stats b where b.game_id is null
      union
      select q.player_id, q.season from public.pitching_stats q where q.game_id is null
    ) other_summary
    where other_summary.player_id = p.id
      and not exists (select 1 from _upload_players u where u.season = other_summary.season)
  );

  return query select 'A'::text, a.id, a.number, a.name, null::text, null::text, null::bigint from _affected a;

  for fk in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public' and ccu.table_name = 'players'
  loop
    filter_sql := '';
    if fk.table_schema = 'public' and fk.table_name in ('batting_stats', 'pitching_stats')
       and exists (select 1 from information_schema.columns c where c.table_schema = fk.table_schema and c.table_name = fk.table_name and c.column_name = 'game_id')
       and exists (select 1 from information_schema.columns c where c.table_schema = fk.table_schema and c.table_name = fk.table_name and c.column_name = 'season') then
      filter_sql := ' and not (t.game_id is null and t.season in (select season from _upload_players))';
    end if;
    return query execute format(
      'select ''B''::text, a.id, a.number, a.name, %L::text, %L::text, count(t.*)::bigint
         from _affected a join %I.%I t on t.%I = a.id
        where true %s
        group by a.id, a.number, a.name',
      fk.table_schema || '.' || fk.table_name, fk.column_name, fk.table_schema, fk.table_name, fk.column_name, filter_sql
    );
  end loop;

  return query
  select 'C'::text, null::integer, u.number, u.name, null::text, null::text, null::bigint
  from _upload_players u
  where not exists (
    select 1 from public.players p
    where p.number = u.number
      and lower(regexp_replace(p.name, '\s+', '', 'g')) = lower(regexp_replace(u.name, '\s+', '', 'g'))
  );
end;
$$;

-- 파일의 (시즌, 배번, 이름)을 붙여 넣는다. 실제 선수명은 SQL Editor에서만 쓰고 저장소에는 커밋하지 않는다.
select * from pg_temp.reupload_precheck($json$
[
  {"season":"2022","number":7,"name":"가선수"},
  {"season":"2023","number":8,"name":"나선수"}
]
$json$::jsonb)
order by kind, player_id nulls last, reference_table nulls last;

rollback;
