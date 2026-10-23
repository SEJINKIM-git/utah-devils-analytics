-- 경기 기록지 v3.0 대응
--
-- 1) 출루율 v3.0 기준: (H + BB + HBP) ÷ (AB + BB + HBP + SF). 희생번트·포수방해는 분모 제외.
--    희생플라이(sf)·희생번트(sh)·포수방해(ci)를 따로 저장한다.
--    NULL = 구분 정보 없음(2022~2025 시즌 누적 파일) → 출루율은 기존 방식(÷ 타석)을 유지한다.
--    0    = 구분했는데 없었음 (v3.0 기록지는 항상 숫자로 저장)
-- 2) 투구수(pitches) 저장 — 기록지에 입력하지만 지금까지 버려졌다.
-- 3) console_replace_game: 경기 하나를 한 트랜잭션으로 교체 (경기 정보 갱신 + 기록 교체 + 감사 로그)
--
-- 추가만 하므로 기존 데이터·코드에 영향 없음. 이 파일 전에는 업로드가 새 칸 없이 저장된다(자동 대체).

alter table public.batting_stats
  add column if not exists sf smallint,
  add column if not exists sh smallint,
  add column if not exists ci smallint;

comment on column public.batting_stats.sf is '희생플라이. NULL = 구분 정보 없음(과거 시즌 누적 파일)';
comment on column public.batting_stats.sh is '희생번트. NULL = 구분 정보 없음';
comment on column public.batting_stats.ci is '포수방해 출루. NULL = 구분 정보 없음';

alter table public.pitching_stats
  add column if not exists pitches smallint;

comment on column public.pitching_stats.pitches is '투구수 (경기 기록지 v3.0)';


create or replace function public.console_replace_game(
  p_season   text,
  p_game     jsonb,   -- {date, opponent, is_home, location, score_us, score_them, result, notes}
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
  v_game_id  integer;
  v_created  boolean := false;
  v_before_b jsonb;
  v_before_p jsonb;
  v_before_g jsonb;
  v_nb int;
  v_np int;
begin
  if p_season !~ '^20[0-9]{2}$' then
    raise exception '시즌 값은 20XX 형식이어야 합니다: %', p_season;
  end if;
  if coalesce(p_game->>'date', '') = '' or coalesce(p_game->>'opponent', '') = '' then
    raise exception '경기 날짜와 상대팀이 필요합니다';
  end if;
  if extract(year from (p_game->>'date')::date)::text <> p_season then
    raise exception '경기 날짜(%)가 시즌(%)과 다릅니다', p_game->>'date', p_season;
  end if;

  select id, to_jsonb(g) into v_game_id, v_before_g
    from games g
   where season = p_season and date = (p_game->>'date')::date and opponent = p_game->>'opponent'
   order by id
   limit 1;

  if v_game_id is null then
    insert into games (season, date, opponent) values (p_season, (p_game->>'date')::date, p_game->>'opponent')
    returning id into v_game_id;
    v_created := true;
  end if;

  update games set
    is_home    = coalesce((p_game->>'is_home')::boolean, is_home),
    location   = coalesce(nullif(p_game->>'location', ''), location),
    score_us   = coalesce((p_game->>'score_us')::int, score_us),
    score_them = coalesce((p_game->>'score_them')::int, score_them),
    result     = coalesce(nullif(p_game->>'result', ''), result),
    notes      = coalesce(nullif(p_game->>'notes', ''), notes)
  where id = v_game_id;

  select coalesce(jsonb_agg(to_jsonb(b)), '[]') into v_before_b from batting_stats b where game_id = v_game_id;
  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into v_before_p from pitching_stats p where game_id = v_game_id;

  delete from batting_stats  where game_id = v_game_id;
  delete from pitching_stats where game_id = v_game_id;

  insert into batting_stats (player_id, game_id, season, pa, ab, runs, hits, doubles, triples, hr, rbi, bb, hbp, so, sb, sf, sh, ci)
  select (r->>'player_id')::int, v_game_id, p_season,
         (r->>'pa')::int, (r->>'ab')::int, (r->>'runs')::int, (r->>'hits')::int, (r->>'doubles')::int,
         (r->>'triples')::int, (r->>'hr')::int, (r->>'rbi')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'sb')::int, (r->>'sf')::int, (r->>'sh')::int, (r->>'ci')::int
    from jsonb_array_elements(p_batting) r;
  get diagnostics v_nb = row_count;

  insert into pitching_stats (player_id, game_id, season, w, l, sv, hld, ip, ha, runs_allowed, er, bb, hbp, so, hr_allowed, pitches)
  select (r->>'player_id')::int, v_game_id, p_season,
         (r->>'w')::int, (r->>'l')::int, (r->>'sv')::int, (r->>'hld')::int, (r->>'ip')::numeric,
         (r->>'ha')::int, (r->>'runs_allowed')::int, (r->>'er')::int, (r->>'bb')::int, (r->>'hbp')::int,
         (r->>'so')::int, (r->>'hr_allowed')::int, (r->>'pitches')::int
    from jsonb_array_elements(p_pitching) r;
  get diagnostics v_np = row_count;

  insert into console_audit_log (actor, action, table_name, before, after, note) values
    (p_actor, 'replace_game', 'games', v_before_g, p_game, p_source),
    (p_actor, 'replace_game', 'batting_stats',  v_before_b, p_batting,  p_source),
    (p_actor, 'replace_game', 'pitching_stats', v_before_p, p_pitching, p_source);

  return jsonb_build_object('game_id', v_game_id, 'created', v_created,
                            'batting', v_nb, 'pitching', v_np,
                            'before_batting', jsonb_array_length(v_before_b),
                            'before_pitching', jsonb_array_length(v_before_p));
end;
$$;

revoke all on function public.console_replace_game(text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
