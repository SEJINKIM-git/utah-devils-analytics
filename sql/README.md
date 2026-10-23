# DB 마이그레이션

Supabase SQL Editor에서 번호 순서대로 실행합니다. 이 폴더의 파일은 자동으로 적용되지 않습니다.
2026-10-23 기준 운영 DB에는 아직 아무것도 적용되지 않았습니다 (console_* 함수·테이블 없음, 읽기 쿼리로 확인).

| 파일 | 내용 | 언제 |
|---|---|---|
| `001_audit_log_and_report_season.sql` | 변경 이력 테이블, 선수 결정 함수(`console_resolve_player`), 원자적 시즌 교체 함수(Streamlit 콘솔용), `ai_reports.season` 컬럼 | 배포 전후 아무 때나 (추가만 함) |
| `002_decision_types.sql` | 판단 유형 enum에 `infield_in`, `no_doubles` 추가 | 배포 전후 아무 때나 (추가만 함) |
| `003_rls_hardening.sql` | 브라우저(anon 키)의 삭제·쓰기 정책 제거 | **이 PR 배포 후** |
| `004_data_cleanup_REVIEW.sql` | 기존 잘못된 데이터 정리 (미리보기 → 확인 → 수정) | 003 이후, 미리보기 검토 후 |
| `005_game_sheet_v3.sql` | 경기 기록지 v3.0: 희생플라이·희생번트·포수방해·투구수 칸, 경기 단위 원자적 교체 함수 | 001 이후, 배포 전후 아무 때나 (추가만 함). 적용 전에는 분석 플랫폼 업로드가 새 칸 없이 저장되고 콘솔은 저장 대신 안내를 보여 줌 |
| `006_console_writes.sql` | 콘솔의 나머지 쓰기(셀 수정 `console_update_rows`, 상황 기록 `console_log_situation`, AI 리포트 `console_save_ai_report`)를 DB 함수로 — 변경과 감사 로그가 한 트랜잭션 | 001·005 이후 (추가만 함). 적용 전에는 콘솔의 해당 저장 버튼이 안내 문구를 보여 줌 |

권장 순서: 001 → 002 → 005 → 006 → (배포 후) 003 → (프리뷰 확인 후) 004

콘솔이 테이블에 직접 쓰는 곳은 없습니다. 선수 생성까지 `console_replace_season`·`console_replace_game` 안에서 일어나므로
(행에 `player_id` 대신 `number`·`name`·`is_pitcher`를 주면 함수가 만든다) 기록 저장이 실패해도 선수 레코드만 남는 일이 없습니다.
모든 `console_*` 함수는 `security definer`이고 anon·authenticated에는 실행 권한이 없습니다 (service_role 키로만 호출).

`tests/sql/`의 테스트가 001~006을 운영 스키마 복제본(PGlite)에 적용해 검증합니다: `npm run test:sql`
