-- Devils Console: 나머지 쓰기 경로(셀 수정, 상황 기록, AI 리포트 저장)도 DB 함수로
--
-- 이전에는 콘솔이 테이블에 직접 update/insert 한 뒤 console_audit_log에 따로 insert 했다.
-- 둘 사이에 실패하면 변경 이력이 빠진다. 이제 변경과 감사 로그가 한 트랜잭션이고,
-- 콘솔 코드에는 테이블을 직접 쓰는 곳이 없다 (console/tests/test_db_writes.py가 확인).
-- 001(감사 로그), 005(sf·sh·ci·pitches 칸) 다음에 적용한다. 추가만 하므로 기존 데이터·코드에 영향 없음.


-- 셀 단위 수정. p_changes = [{id, after: {col: value, ...}, note}]
-- 허용 테이블·컬럼만 바꾸며, 컬럼 타입은 information_schema에서 읽어 캐스팅한다.
create or replace function public.console_update_rows(p_table text, p_changes jsonb, p_actor text) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[];
  ch       jsonb;
  v_id     integer;
  v_before jsonb;
  v_after  jsonb;
  v_set    text;
  v_type   text;
  k        text;
  v_n      integer := 0;
begin
  v_allowed := case p_table
    when 'players'        then array['number', 'name', 'is_pitcher']
    when 'batting_stats'  then array['pa', 'ab', 'runs', 'hits', 'doubles', 'triples', 'hr', 'rbi', 'bb', 'hbp', 'so', 'sb', 'sf', 'sh', 'ci']
    when 'pitching_stats' then array['w', 'l', 'sv', 'hld', 'ip', 'ha', 'runs_allowed', 'er', 'bb', 'hbp', 'so', 'hr_allowed', 'pitches']
    else null
  end;
  if v_allowed is null then
    raise exception '콘솔에서 수정할 수 없는 테이블: %', p_table;
  end if;

  for ch in select * from jsonb_array_elements(p_changes) loop
    v_id := (ch->>'id')::integer;
    select jsonb_object_agg(e.key, e.value) into v_after
      from jsonb_each(coalesce(ch->'after', '{}'::jsonb)) e
     where e.key = any(v_allowed);
    if v_id is null or v_after is null then
      continue;
    end if;

    execute format('select to_jsonb(t) from %I t where id = $1', p_table) into v_before using v_id;
    if v_before is null then
      raise exception '% id %: 행이 없습니다', p_table, v_id;
    end if;

    v_set := '';
    for k in select jsonb_object_keys(v_after) loop
      select udt_name into v_type from information_schema.columns
       where table_schema = 'public' and table_name = p_table and column_name = k;
      if v_type is null then
        raise exception '% 테이블에 % 칸이 없습니다 (마이그레이션 미적용?)', p_table, k;
      end if;
      v_set := v_set || case when v_set = '' then '' else ', ' end
               || format('%I = ($1->>%L)::%s', k, k, v_type);
    end loop;
    execute format('update %I set %s where id = $2', p_table, v_set) using v_after, v_id;

    insert into console_audit_log (actor, action, table_name, before, after, note)
    values (p_actor, 'update', p_table,
            (select jsonb_object_agg(e.key, e.value) from jsonb_each(v_before) e where e.key = 'id' or v_after ? e.key),
            v_after || jsonb_build_object('id', v_id),
            ch->>'note');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.console_update_rows(text, jsonb, text) from public, anon, authenticated;


-- 상황 기록 (+ 판단 1건). LI는 기존 calculate_leverage 함수로 계산한다.
create or replace function public.console_log_situation(p_situation jsonb, p_decision jsonb, p_actor text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_li  numeric;
  v_lc  leverage_class;
  v_sit situations;
  v_dec uuid;
begin
  select li, lc into v_li, v_lc
    from calculate_leverage((p_situation->>'inning')::smallint, (p_situation->>'out_count')::smallint,
                            ((p_situation->>'score_us')::int - (p_situation->>'score_them')::int)::smallint,
                            (p_situation->>'base_state')::smallint);

  insert into situations (game_id, season, inning, inning_half, base_state, out_count, score_us, score_them,
                          batter_id, pitcher_id, context_note, leverage_index, leverage_class, logged_by)
  values ((p_situation->>'game_id')::int, p_situation->>'season', (p_situation->>'inning')::smallint,
          p_situation->>'inning_half', (p_situation->>'base_state')::smallint, (p_situation->>'out_count')::smallint,
          (p_situation->>'score_us')::smallint, (p_situation->>'score_them')::smallint,
          (p_situation->>'batter_id')::int, (p_situation->>'pitcher_id')::int, p_situation->>'context_note',
          v_li, coalesce(v_lc, 'medium'), p_actor)
  returning * into v_sit;

  if p_decision is not null and jsonb_typeof(p_decision) = 'object' then
    insert into game_decisions (situation_id, game_id, season, decision_type, decision_summary, rationale, retrospective_eval, logged_by)
    values (v_sit.id, v_sit.game_id, v_sit.season, (p_decision->>'decision_type')::decision_type,
            p_decision->>'decision_summary', p_decision->>'rationale',
            coalesce((p_decision->>'retrospective_eval')::retrospective_eval, 'pending'), p_actor)
    returning id into v_dec;
  end if;

  insert into console_audit_log (actor, action, table_name, before, after)
  values (p_actor, 'insert', 'situations', null, jsonb_build_object('situation', to_jsonb(v_sit), 'decision', p_decision));

  return jsonb_build_object('situation_id', v_sit.id, 'decision_id', v_dec, 'li', v_li, 'lc', v_lc);
end;
$$;

revoke all on function public.console_log_situation(jsonb, jsonb, text) from public, anon, authenticated;


-- AI 리포트 저장 (시즌 포함, sql/001 season 컬럼)
create or replace function public.console_save_ai_report(p_report jsonb, p_actor text) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id integer;
begin
  if coalesce(p_report->>'report_type', '') = '' then
    raise exception 'report_type이 필요합니다';
  end if;
  insert into ai_reports (player_id, report_type, season, summary, strengths, improvements, training_plan)
  values ((p_report->>'player_id')::int, p_report->>'report_type', p_report->>'season', p_report->>'summary',
          p_report->>'strengths', p_report->>'improvements', p_report->>'training_plan')
  returning id into v_id;
  insert into console_audit_log (actor, action, table_name, before, after)
  values (p_actor, 'insert', 'ai_reports', null,
          jsonb_build_object('id', v_id, 'report_type', p_report->>'report_type', 'season', p_report->>'season'));
  return v_id;
end;
$$;

revoke all on function public.console_save_ai_report(jsonb, text) from public, anon, authenticated;
