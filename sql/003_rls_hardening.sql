-- RLS 강화: 브라우저(anon 키)에서 기록을 지우거나 바꾸지 못하게 한다.
--
-- 2026-10-23 점검 당시 아래 정책이 role=public, 조건=true 로 열려 있었다.
-- anon 키는 브라우저 번들에 그대로 들어 있으므로 누구든 전체 기록을 삭제할 수 있는 상태였다.
--   players         allow_delete_players      DELETE  true
--   batting_stats   allow_delete_batting      DELETE  true
--   pitching_stats  allow_delete_pitching     DELETE  true
--   games           games_write               ALL     true
--   lineups         lineups_write             ALL     true
--   roster_uploads  allow_all_roster_uploads  ALL     true
--
-- 이 저장소의 모든 서버 코드(API 라우트·서버 컴포넌트)는 service key로 접속하므로 RLS 영향을 받지 않는다.
-- 브라우저에서 DB에 직접 쓰던 유일한 코드(NewPlayerButton)는 이번 PR에서 /api/players 경유로 바꿨다.
-- 홈페이지(Next.js, 같은 Supabase 프로젝트)는 기존 테이블을 읽기만 하므로 SELECT 정책은 유지한다.
--
-- 적용 순서: 이 PR 배포 → 홈페이지·분석 플랫폼 정상 동작 확인 → 이 파일 실행

begin;

drop policy if exists allow_delete_players      on public.players;
drop policy if exists allow_delete_batting      on public.batting_stats;
drop policy if exists allow_delete_pitching     on public.pitching_stats;
drop policy if exists games_write               on public.games;
drop policy if exists lineups_write             on public.lineups;
drop policy if exists allow_all_roster_uploads  on public.roster_uploads;

-- 공개 읽기 정책이 없던 표는 그대로 둔다 (서버가 service key로 읽음).
-- games, lineups의 기존 SELECT 정책(games_read, lineups_read 등)은 유지된다.

commit;

-- 확인용: anon/authenticated에 쓰기 권한이 남은 정책 목록 (비어 있어야 함)
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public'
--    and tablename in ('players','batting_stats','pitching_stats','games','lineups','roster_uploads')
--    and cmd <> 'SELECT';
