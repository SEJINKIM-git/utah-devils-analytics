# 지표 사전과 조회 함수

기록 숫자가 화면마다 따로 계산되던 것을 한 길로 모으는 작업의 1단계다.
블룸버그 터미널의 필드 사전(FLDS)과 조회 함수(BDP/BDH) 구조를 따른다.

## 1. 지표 사전 — `lib/metrics/registry.json`

지표의 코드·이름·한 줄 설명·공식·자릿수·별칭의 **원본**이다. 분석 플랫폼(TS)과 콘솔(Python)이 같은 파일을 읽는다.

| 읽는 곳 | 하는 일 |
|---|---|
| `lib/metrics/index.ts` | 코드 → `lib/statFormulas.ts`의 기존 함수 연결, 표기(`formatMetric`), 이름(`metricLabel`), 검색(`searchMetrics`) |
| `console/core/metrics.py` | 코드 → `console/core/stats.py`의 기존 함수 연결, 표기(`fmt`), 이름(`metric_short_name`) |
| `lib/translations.ts` | 지표 이름(`batting.obp` 등)을 사전에서 가져온다 |
| `console/core/ui.py` | 표 머리글을 사전에서 가져온다 |

계산식은 사전에 없다. 새 공식을 만들 때는 `statFormulas.ts`와 `stats.py`에 함수를 추가하고
`tests/fixtures/contracts/stat-cases.json`에 사례를 넣은 뒤 사전에 연결한다.

### 지표를 추가하려면

1. `registry.json`에 한 줄 추가 (`type`: `rate` 비율 / `count` 횟수 / `innings` 이닝)
2. `count`면 `fields`에 합계 칸 이름만 적으면 된다. `rate`면 `index.ts`와 `metrics.py`의 연결 표에 함수를 잇는다
3. `npx vitest run tests/unit/metricsRegistry.test.ts`, `cd console && pytest tests/test_metrics.py`
   — 연결이 빠졌거나 코드·별칭이 겹치면 실패한다

타자와 투수에 같은 이름이 있는 지표는 코드를 나눴다: 타자 `SO`·`BB`·`HBP`, 투수 `K`·`BBA`·`HBA`.
표 머리글은 `shortKo`/`shortEn`으로 지금까지와 같게("삼진", "볼넷") 보인다.

## 2. 조회 함수 — `lib/metrics/query.ts`

```ts
const { dataset } = await loadMetricDataset(supabase);   // DB 읽기 (5개 표, 읽기 전용)
const q = createMetricQuery(dataset);

q.point({ player: 12 }, "OBP", "2026");                  // 값 하나
q.point({ team: true }, "ERA", "Career");
q.history({ player: 12 }, "OBP", { by: "game", from: "2026", to: "2026" });
q.history({ team: true }, "AVG", { by: "season" });
q.rank("OPS", "2026", { minPa: 10 });                    // 순위표 + 팀 값
```

집계 규칙은 이 파일 안에서만 적용한다.

1. 같은 선수·시즌에 경기별 행이 있으면 요약 행은 뺀다
2. 출루율 분모는 행마다 정한 뒤 더한다 (`sf`가 있으면 타수+볼넷+사구+희생플라이, 없으면 타석)
3. 이닝은 아웃 수로 바꿔 더한다
4. 같은 (배번, 이름)의 중복 선수 레코드는 한 사람으로 합친다
5. 범위 `roster`(기본): 시즌 명단이 올라와 있으면 **명단에 있는 선수의, 명단 업로드 이후 경기만** 센다 — 대시보드와 `/records`의 규칙.
   범위 `all`은 5번을 적용하지 않는다 — 콘솔과 AI 선수 분석의 기준.

### API

`GET /api/metrics` (읽기 전용, 로그인 불필요 — 다른 조회 API와 같다)

| 요청 | 결과 |
|---|---|
| `/api/metrics` | 지표 사전 |
| `?mode=point&target=team&code=ERA&season=2026` | 값 하나 |
| `?mode=point&target=player:12&code=OBP&season=2026` | 선수 값 |
| `?mode=history&target=player:12&code=OBP&by=game&from=2026&to=2026` | 경기별 추이 |
| `?mode=rank&code=OPS&season=2026&minPa=10` | 순위표 |

## 3. 화면 표기에서 지켜 둔 것

숫자가 바뀌지 않도록 기존 화면의 표기 규칙을 그대로 옮겼다. 바꿀지는 따로 정한다.

- **OPS**: 화면은 "표시된 출루율 + 표시된 장타율"이다(`displayMetric`). 반올림 전 합과 0.001 차이가 날 수 있다. 콘솔은 반올림 전 합을 쓴다.
- **앞자리 0**: 플랫폼은 `0.333`, 콘솔은 `.333`. 사전의 `leadingZero`는 `false`지만 플랫폼은 `WEB_KEEPS_LEADING_ZERO`로 지금 표기를 유지한다.
- **/records 투수 순서**: ERA 0.00인 투수가 맨 뒤로 간다(기존 정렬 `parseFloat(era) || 99`). `rank("ERA")` 자체는 0.00을 1위로 준다.

## 4. 아직 조회 함수로 옮기지 않은 화면

이 화면들은 지금도 각자 집계한다. 숫자는 바뀌지 않았다.

| 화면·경로 | 지금 집계하는 곳 | 옮길 때 주의 |
|---|---|---|
| 대시보드 `/` | `app/page.tsx` | 학기(Spring/Fall) 보기는 `lib/seasonTerms.ts`를 쓴다 — 조회 함수에 학기 범위가 필요 |
| 선수 페이지 `/players/[id]` | `app/players/[id]/page.tsx` | 요약 행만 있는 시즌(2022~2025)을 보여 주지 않는다. 옮기면 그 시즌 기록이 나타난다 |
| 선수 비교 `/compare` | `app/api/compare-data/route.ts`, `app/compare/page.tsx` | |
| 선수단 `/lineup` | `app/lineup/page.tsx`, `app/components/LineupSimulator.tsx` | |
| 경기 리뷰 `/game-review` | `app/api/game-review/route.ts` | 경기 한 건 단위 |
| 목표 `PlayerGoals` | `app/api/goals/route.ts` | |
| 검색 `SearchBar` | `app/components/SearchBar.tsx` | 검색 팔레트로 바뀔 예정 |
| 시즌 차트 `SeasonChart` | `app/components/SeasonChart.tsx` | `history(by: "game")`로 대체 가능 |
| 콘솔 화면 | `console/core/aggregate.py` | 규칙은 같다(범위 `all`). 이름·표기만 사전을 쓴다 |

옮겨진 곳: `/records`, `GET /api/metrics`, AI 분석(`app/api/analyze`, `app/api/analyze-team`).

## 5. 숫자 동일성 확인

```bash
# main과 브랜치에서 각각
npm run build && npx next start -p 3200 &
BASE_URL=http://localhost:3200 node tests/e2e/number-snapshot.mjs /tmp/snap-main --seasons 2026,2025,Career --players 1,2,3
diff -r /tmp/snap-main /tmp/snap-branch   # 차이가 없어야 한다
```

스냅숏에는 실제 선수 이름이 들어가므로 저장소에 올리지 않는다.

## 6. 메뉴 묶음과 선수 페이지 주소

- 메뉴 묶음(선수 · 경기 · 팀 · 관리)은 `lib/nav.ts` 한 곳에 있다. Sidebar, 하단 메뉴, 현재 위치 표시가 함께 쓴다. 주소는 옮기지 않았다.
- 선수 페이지 카드는 주소로 바로 연다: `/players/12?view=gamelog|season|splits|ai|goals`
- 지표 설명 시트도 주소로 연다: `/players/12?metric=OBP`
- 선수 비교의 첫 선수: `/compare?a=12`
- 즐겨찾기는 브라우저 `localStorage`(`ud-favorites-v1`)에만 저장한다. 로그인·DB와 무관하다.
