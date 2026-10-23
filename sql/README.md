# DB 마이그레이션

Supabase SQL Editor에서 번호 순서대로 실행합니다. 이 폴더의 파일은 자동으로 적용되지 않습니다.

| 파일 | 내용 | 언제 |
|---|---|---|
| `001_audit_log_and_report_season.sql` | 변경 이력 테이블, 원자적 시즌 교체 함수(Streamlit 콘솔용), `ai_reports.season` 컬럼 | 배포 전후 아무 때나 (추가만 함) |
| `002_decision_types.sql` | 판단 유형 enum에 `infield_in`, `no_doubles` 추가 | 배포 전후 아무 때나 (추가만 함) |
| `003_rls_hardening.sql` | 브라우저(anon 키)의 삭제·쓰기 정책 제거 | **이 PR 배포 후** |
| `004_data_cleanup_REVIEW.sql` | 기존 잘못된 데이터 정리 (미리보기 → 확인 → 수정) | 003 이후, 미리보기 검토 후 |
| `005_game_sheet_v3.sql` | 경기 기록지 v3.0: 희생플라이·희생번트·포수방해·투구수 칸, 경기 단위 원자적 교체 함수 | 배포 전후 아무 때나 (추가만 함). 적용 전에는 새 칸 없이 저장되고 업로드 화면에 안내가 뜸 |

`tests/sql/`의 테스트가 001~005를 운영 스키마 복제본(PGlite)에 적용해 검증합니다: `npm run test:sql`
