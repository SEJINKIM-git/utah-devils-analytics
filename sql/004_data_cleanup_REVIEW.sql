-- ⚠️ 기존 데이터를 고치는 스크립트 — 1단계(미리보기) 결과를 확인한 뒤 2단계를 실행한다.
-- 2026-10-23 운영 DB 점검에서 발견한 문제들. 코드 쪽 원인은 이번 PR에서 막았다.
--
-- 이 스크립트가 다루지 않는 것:
--   · 지난 시즌 기록이 현재 같은 배번 선수 이름으로 붙어 있는 문제 (예: 2022 #52 선수A → 선수B)
--     → 원본 기록지 이름이 필요하므로 Streamlit 콘솔 '기록지 업로드'에서 2022~2024 파일을 다시 올려
--       미리보기의 '이름 다름' 항목을 확인한 뒤 저장한다.
--   · Career 행의 이닝 값(85.4 같은 불가능한 값) → 통산은 시즌 합으로 계산하므로 그대로 둔다.


-- ═══ 1단계: 미리보기 (읽기만 함) ════════════════════════════════════════════

-- (A) 시즌 칸에 학기가 들어간 경기 → 경기 날짜의 연도로 바꿀 대상
select id, date, opponent, season as 현재, extract(year from date)::text as 변경후
  from games where season !~ '^20[0-9]{2}$';

-- (B) 시즌 칸에 학기가 들어간 기록 행 (모두 0이면 삭제 대상)
select 'batting' t, season, count(*), sum(pa + ab + hits + bb + so) as 합계 from batting_stats
 where season !~ '^20[0-9]{2}$' and season <> 'Career' group by season
union all
select 'pitching', season, count(*), sum(ip + er + so + bb)::bigint from pitching_stats
 where season !~ '^20[0-9]{2}$' and season <> 'Career' group by season;

-- (C) 이닝 표기 오류 (소수점 아래가 0·1·2가 아님: 3.3 → 3.1, 1.7 → 1.2). Career 행 제외
select id, player_id, season, game_id, ip as 현재,
       trunc(ip) + round((ip - trunc(ip)) * 3) / 10.0 as 변경후
  from pitching_stats
 where season <> 'Career' and (round(ip * 10)::int % 10) not in (0, 1, 2);

-- (D) 경기별 행과 겹치는 시즌 요약 행 (같은 선수·시즌에 game_id 있는 행이 있음 → 이중 집계 원인)
select 'batting' t, b.season, count(*) from batting_stats b
 where b.game_id is null and exists (
   select 1 from batting_stats g where g.player_id = b.player_id and g.season = b.season and g.game_id is not null)
 group by b.season
union all
select 'pitching', p.season, count(*) from pitching_stats p
 where p.game_id is null and exists (
   select 1 from pitching_stats g where g.player_id = p.player_id and g.season = p.season and g.game_id is not null)
 group by p.season;


-- ═══ 2단계: 수정 (미리보기 확인 후 아래 블록 전체 실행) ═══════════════════════
/*
begin;

update games set season = extract(year from date)::text
 where season !~ '^20[0-9]{2}$';

delete from batting_stats
 where season !~ '^20[0-9]{2}$' and season <> 'Career'
   and coalesce(pa,0) + coalesce(ab,0) + coalesce(hits,0) + coalesce(bb,0) + coalesce(so,0) = 0;
delete from pitching_stats
 where season !~ '^20[0-9]{2}$' and season <> 'Career'
   and coalesce(ip,0) + coalesce(er,0) + coalesce(so,0) + coalesce(bb,0) = 0;

update pitching_stats set ip = trunc(ip) + round((ip - trunc(ip)) * 3) / 10.0
 where season <> 'Career' and (round(ip * 10)::int % 10) not in (0, 1, 2);

delete from batting_stats b
 where b.game_id is null and exists (
   select 1 from batting_stats g where g.player_id = b.player_id and g.season = b.season and g.game_id is not null);
delete from pitching_stats p
 where p.game_id is null and exists (
   select 1 from pitching_stats g where g.player_id = p.player_id and g.season = p.season and g.game_id is not null);

commit;
*/
