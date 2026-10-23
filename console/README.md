# Devils Console

Utah Devils 운영진용 **데이터 관리·분석 콘솔** (Streamlit).
공개 화면(분석 플랫폼 조회 화면, 홈페이지)은 Next.js가 그대로 맡고, 이 콘솔은 같은 Supabase DB에 붙어 기록 업로드·수정·분석을 담당합니다.

```
기록지(엑셀) ──▶ 파싱 ──▶ 검증 ──▶ DB와 비교 ──▶ 확인 후 저장 ──▶ Supabase ◀── 분석 플랫폼·홈페이지
                                                   (원자적 + 감사 로그)
```

## 실행

```bash
cd console
pip install -r requirements.txt
streamlit run app.py   # secrets가 없으면 읽기 전용 데모 (tests/fixtures 실제 기록지 → 없으면 가짜 기록지)
pytest                 # 화면·파서·계산 테스트
```

운영 DB 연결
1. `.streamlit/secrets.toml.example`을 `secrets.toml`로 복사해 키를 채웁니다 (커밋 금지, .gitignore 처리됨).
2. 저장소 루트의 `sql/001_audit_log_and_report_season.sql`을 먼저 적용합니다. 감사 로그 테이블과 시즌 교체 함수가 없으면 저장 버튼이 막힙니다.
3. 로그인은 분석 플랫폼·홈페이지와 같은 운영진 계정입니다 (Supabase Auth + `admin_members` 승인).

## 화면

| 구분 | 화면 | 내용 |
|---|---|---|
| 분석 | 대시보드 | 팀 지표, OPS·ERA 순위, 통산 추이, 데이터 점검 알림 |
| | 기록 | 타자·투수 시즌/통산 기록, 검색, CSV |
| | 선수 상세 | 시즌별 추이, 통산 |
| | 선수 비교 | 2~4명 백분위 레이더 |
| | 상황 센터 | 판단 기록 분석, 새 상황 기록 (LI는 DB `calculate_leverage` 함수 사용) |
| | AI 리포트 | 콘솔이 계산한 수치만 모델에 전달, 시즌별 저장 (플랫폼 대시보드와 같은 형식) |
| 데이터 관리 | 기록지 업로드 | **경기 기록지 v3.0**: 경기 정보·검수 확인 → 기존 경기와 비교 → 경기 단위 원자적 교체 (sql/005)<br>**시즌 누적 기록지**: 파싱 → 검증 → DB 비교(신규/변경/삭제/이름 다름) → 시즌 교체 |
| | 데이터 수정·점검 | 셀 단위 수정(바뀐 셀만, 사유 필수), 구조 점검, 변경 이력 |

## 구조

```
app.py                  내비게이션, 로그인
core/stats.py           ★ 지표 공식 (분석 플랫폼 lib/statFormulas.ts와 같아야 함 — test_contracts가 확인)
core/parser.py          시즌 누적 기록지 파서
core/game_sheet.py      경기 기록지 v3.0 파서 (플랫폼 lib/gameSheet.ts와 같은 규칙, 같은 기대값으로 테스트)
core/validation.py      업로드 전 검증 규칙
core/aggregate.py       DB 행 → 선수·시즌 집계 (분석 플랫폼 lib/statRows.ts와 같은 규칙)
core/diffing.py         업로드 미리보기
core/db.py              Supabase / 데모 저장소. 모든 쓰기는 여기를 거침
views/*.py              화면
tests/synthetic.py      가짜 기록지 생성기 (실제 결함을 재현)
tests/fixtures/         실제 기록지를 넣는 곳 — 공개 저장소라 .xlsx는 커밋되지 않음
```

## 테스트

| 파일 | 내용 | 실행 |
|---|---|---|
| `test_stats.py` | 이닝 표기·ERA·출루율 공식 | 항상 |
| `test_parser_synthetic.py` | 가짜 기록지로 파서·검증기 동작 (합계 행 범위 누락, 배번 충돌, 이닝 표기 오류 등) | 항상 |
| `test_game_sheet.py` | 경기 기록지 v3.0 — 공식 템플릿 수식 결과(`tests/fixtures/game-v3/expected.json`)와 일치 | 항상 |
| `test_diffing.py` | 업로드 미리보기 (이름 다름 짝짓기, 기록 감소 경고) | 항상 |
| `test_pages_smoke.py` | 모든 화면이 데모 모드에서 예외 없이 렌더링 | 항상 |
| `test_contracts.py` | 콘솔과 분석 플랫폼의 ERA 기준·WHIP 정의·판단 유형 목록 일치 | 항상 |
| `test_parser_golden.py` | 실제 2022~2025·통산 기록지로 회귀 검사 | `tests/fixtures/`에 기록지가 있을 때 |

## 규칙 (기존 플랫폼과 같음)

- ERA는 5이닝 기준, 이닝은 아웃카운트로 합산 (3.1 = 3⅓).
- 출루율은 경기 기록지 v3.0 기준 (분모에 희생플라이 포함, 희생번트·포수방해 제외). 희생플라이 구분이 없는 과거 시즌 행은 ÷ 타석. 기준을 바꾸려면 `core/stats.py`와 `lib/statFormulas.ts`를 함께 바꿉니다.
- 통산은 항상 시즌 합. Career 시트는 저장하지 않습니다 (기록지 SUM이 이닝 표기를 소수로 더해 85.4 같은 값이 있음).
- 같은 선수·시즌에 경기별 행이 있으면 그것만 사용 (요약 행과 이중 집계 방지).
- 선수는 (배번, 이름)이 모두 같을 때만 같은 선수.

## 배포

Streamlit Community Cloud 또는 Render. 앱 경로는 `console/app.py`, Python 3.12. Vercel에는 올릴 수 없습니다.
secrets는 호스팅 서비스의 비밀값 설정에 넣습니다.
