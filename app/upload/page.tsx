'use client';

/**
 * app/upload/page.tsx
 *
 * TypeScript 에러 75개 수정 내역:
 *
 *  [1] saveToSupabase 파라미터 → GameInfo, BattingStat[], PitchingStat[], number 타입 명시
 *  [2] 내부 함수 모든 파라미터 타입 명시 (calcResult, fmtAvg, parseXlsx 등)
 *  [3] 'r' is of type 'unknown' ×30
 *      → XLSX.utils.sheet_to_json<Record<string,unknown>>() 제네릭 추가
 *      → 각 필드 접근 시 (r['이름'] as string) 등 타입 단언 사용
 *  [4][5][6] preview state 타입 'never' / SetStateAction<null> 불일치
 *      → useState<ParsedResult | null>(null) 명시
 *      → ParsedResult 인터페이스 정의
 *  [7] catch(e) 에서 e.message
 *      → catch (e: unknown) + (e instanceof Error) 가드 사용
 *  [8] e.target.files possibly null
 *      → 옵셔널 체이닝 e.target.files?.[0] 사용
 *  [9] resultBadge res 파라미터 인덱싱 오류
 *      → Result 타입('W'|'L'|'D') 정의, badgeMap을 Record<Result,...> 타입 사용
 * [10] Object possibly null (ref.current)
 *      → useRef<HTMLInputElement>(null) + 옵셔널 체이닝 ref.current?.click()
 *
 * 의존성: npm install mammoth xlsx
 */

import { useState, useCallback, useRef } from 'react';
// import { createClient } from '@/lib/supabase/client';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

/** 경기 결과 */
type Result = 'W' | 'L' | 'D';

/** input value에 사용 가능한 GameInfo 키 (boolean 필드 is_home 제외) */
type TextInputKey = 'date' | 'opponent' | 'season';

/** 경기 메타 정보 */
interface GameInfo {
  date: string;
  opponent: string;
  is_home: boolean;
  season: number;
}

/** 파싱된 경기 요약 (점수 + 결과) */
interface GameSummary {
  score_us: number;
  score_them: number;
  result: Result;
}

/** 타격 기록 한 선수 */
interface BattingStat {
  name: string;
  atBats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  walks: number;
  hbp: number;
  strikeouts: number;
}

/** 투구 기록 한 선수 */
interface PitchingStat {
  name: string;
  result: string;
  innings: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  avgSpeed: number;
}

/** 파일 파싱 전체 결과 — useState<ParsedResult | null>(null)의 타입 */
interface ParsedResult {
  gameInfo: GameSummary;
  battingStats: BattingStat[];
  pitchingStats: PitchingStat[];
}

// ─── 승패 계산 ───────────────────────────────────────────────────────────────

// [2] FIX: 파라미터 타입 명시
function calcResult(us: number, them: number): Result {
  if (us > them) return 'W';
  if (us < them) return 'L';
  return 'D';
}

// ─── 타율 포맷 ───────────────────────────────────────────────────────────────

// [2] FIX: 파라미터 타입 명시
function fmtAvg(hits: number, ab: number): string {
  return ab > 0 ? (hits / ab).toFixed(3).replace(/^0\./, '.') : '-';
}

// ─── Supabase 저장 ───────────────────────────────────────────────────────────

// [1] FIX: 모든 파라미터에 타입 추가
async function saveToSupabase(
  info: GameInfo & GameSummary,
  battingStats: BattingStat[],
  pitchingStats: PitchingStat[],
  season: number,
): Promise<{ success: boolean }> {
  // const supabase = createClient();
  //
  // const { data: game, error: gameErr } = await supabase.from('games').insert({
  //   date:       info.date,
  //   opponent:   info.opponent,
  //   score_us:   info.score_us,
  //   score_them: info.score_them,
  //   result:     info.result,
  //   is_home:    info.is_home,
  // }).select().single();
  // if (gameErr) throw gameErr;
  //
  // for (const b of battingStats) {
  //   const { data: player } = await supabase
  //     .from('players').select('id').eq('name', b.name).maybeSingle();
  //   if (!player) continue;
  //   await supabase.from('batting_stats').upsert({
  //     player_id: player.id, season, game_id: game.id,
  //     at_bats: b.atBats, hits: b.hits, runs: b.runs,
  //     doubles: b.doubles, triples: b.triples, home_runs: b.homeRuns,
  //     rbi: b.rbi, walks: b.walks, hbp: b.hbp, strikeouts: b.strikeouts,
  //   });
  // }
  //
  // for (const p of pitchingStats) {
  //   const { data: player } = await supabase
  //     .from('players').select('id').eq('name', p.name).maybeSingle();
  //   if (!player) continue;
  //   await supabase.from('pitching_stats').upsert({
  //     player_id: player.id, season, game_id: game.id,
  //     innings: p.innings, hits: p.hits, runs: p.runs,
  //     earned_runs: p.earnedRuns, walks: p.walks, strikeouts: p.strikeouts,
  //   });
  // }

  console.log('[Supabase 시뮬레이션]', { info, battingStats, pitchingStats, season });
  return { success: true };
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function UploadPage() {
  const [file,     setFile]     = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);
  // [4][5][6] FIX: ParsedResult | null 로 타입 명시 → 'never' 추론 방지
  const [preview,  setPreview]  = useState<ParsedResult | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  const [gameInfo, setGameInfo] = useState<GameInfo>({
    date:     new Date().toISOString().slice(0, 10),
    opponent: '',
    is_home:  true,
    season:   new Date().getFullYear(),
  });

  // [10] FIX: HTMLInputElement 타입 → .click() 안전하게 호출
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 파일 선택 핸들러 ───────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setError('');
    setSaved(false);
    setPreview(null);
    setFile(f);

    const ext      = f.name.split('.').pop()?.toLowerCase() ?? '';
    const baseName = f.name.replace(/\.[^.]+$/, '');

    // 날짜 추출: 파일명에서 MM_DD 패턴 직접 검색 (split 전 원본에서)
    const dateMatch = baseName.match(/(\d{1,2})_(\d{1,2})/);
    if (dateMatch) {
      const mm = dateMatch[1].padStart(2, '0');
      const dd = dateMatch[2].padStart(2, '0');
      const yr = new Date().getFullYear();
      setGameInfo((g) => ({ ...g, date: `${yr}-${mm}-${dd}` }));
    }

    // 상대팀 추출
    const opponentMatch = baseName.match(/[Vv][Ss][_\s]?([가-힣a-zA-Z]+)/);
    if (opponentMatch) setGameInfo((g) => ({ ...g, opponent: opponentMatch[1] }));

    setLoading(true);
    try {
      if (ext === 'docx') {
        await parseDocx(f);
      } else if (ext === 'xlsx' || ext === 'xls') {
        await parseXlsx(f);
      } else if (ext === 'csv') {
        await parseCsv(f);
      } else {
        throw new Error('지원하지 않는 형식입니다. .docx · .xlsx · .csv만 가능합니다.');
      }
    } catch (e: unknown) {
      // [7] FIX: catch(e: unknown) + instanceof Error 가드
      setError(e instanceof Error ? e.message : '파일 파싱 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── docx 파싱 ──────────────────────────────────────────────────────────
  async function parseDocx(f: File): Promise<void> {
    const { parseDocxGameRecord } = await import('@/lib/parseDocxGameRecord');
    const result = await parseDocxGameRecord(f);
    // result는 ParsedResult와 호환되는 구조
    setPreview(result as ParsedResult);
  }

  // ─── xlsx 파싱 ──────────────────────────────────────────────────────────
  async function parseXlsx(f: File): Promise<void> {
    const XLSX = (await import('xlsx')).default;
    const wb   = XLSX.read(await f.arrayBuffer(), { type: 'array' });

    const bSheet = wb.Sheets['타자 기록'] ?? wb.Sheets[wb.SheetNames[0]];
    const pSheet = wb.Sheets['투수 기록'] ?? wb.Sheets[wb.SheetNames[1]];

    // [3] FIX: 제네릭 Record<string, unknown> 명시 → r['컬럼'] 접근 시 타입 단언 사용
    const bRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(bSheet, { defval: 0 });
    const pRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(pSheet, { defval: 0 });

    // [3] FIX: 각 필드를 as unknown → as number / as string 으로 안전하게 변환
    const toNum = (v: unknown): number => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    };
    const toStr = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

    const battingStats: BattingStat[] = bRows
      .filter((r) => typeof r['이름'] === 'string' && (r['이름'] as string).length > 0)
      .map((r): BattingStat => ({
        name:       toStr(r['이름']),
        atBats:     toNum(r['타수']),
        runs:       toNum(r['득점']),
        hits:       toNum(r['안타']),
        doubles:    toNum(r['2루타']),
        triples:    toNum(r['3루타']),
        homeRuns:   toNum(r['홈런']),
        rbi:        toNum(r['타점']),
        walks:      toNum(r['볼넷']),
        hbp:        toNum(r['사구']),
        strikeouts: toNum(r['삼진']),
      }));

    const pitchingStats: PitchingStat[] = pRows
      .filter((r) => typeof r['이름'] === 'string' && (r['이름'] as string).length > 0)
      .map((r): PitchingStat => ({
        name:        toStr(r['이름']),
        result:      toStr(r['결과']) || '-',
        innings:     toNum(r['이닝']),
        hits:        toNum(r['피안타']),
        runs:        toNum(r['실점']),
        earnedRuns:  toNum(r['자책']),
        walks:       toNum(r['4사구']),
        strikeouts:  toNum(r['삼진']),
        avgSpeed:    toNum(r['평균구속']),
      }));

    const score_us   = battingStats.reduce((s, b) => s + b.runs, 0);
    const score_them = pitchingStats.reduce((s, p) => s + p.runs, 0);

    setPreview({
      gameInfo: { score_us, score_them, result: calcResult(score_us, score_them) },
      battingStats,
      pitchingStats,
    });
  }

  // ─── CSV 파싱 ───────────────────────────────────────────────────────────
  async function parseCsv(f: File): Promise<void> {
    const text = await f.text();
    const [headerLine, ...dataLines] = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const headers = headerLine.split(',').map((h) => h.trim());

    const rows: Record<string, string>[] = dataLines.map((line) => {
      const vals = line.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']));
    });

    const toNum = (v: string): number => { const n = Number(v); return isFinite(n) ? n : 0; };

    const battingStats: BattingStat[] = rows
      .filter((r) => !!r['이름'])
      .map((r): BattingStat => ({
        name:       r['이름'],
        atBats:     toNum(r['타수']),
        runs:       toNum(r['득점']),
        hits:       toNum(r['안타']),
        doubles:    toNum(r['2루타']),
        triples:    toNum(r['3루타']),
        homeRuns:   toNum(r['홈런']),
        rbi:        toNum(r['타점']),
        walks:      toNum(r['볼넷']),
        hbp:        0,
        strikeouts: toNum(r['삼진']),
      }));

    const score_us = battingStats.reduce((s, b) => s + b.runs, 0);

    setPreview({
      gameInfo: { score_us, score_them: 0, result: calcResult(score_us, 0) },
      battingStats,
      pitchingStats: [],
    });
  }

  // ─── 드래그 앤 드롭 ─────────────────────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      // [8] FIX: dataTransfer.files 도 옵셔널 체이닝으로 안전하게 접근
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ─── 저장 ───────────────────────────────────────────────────────────────
  const handleSave = async (): Promise<void> => {
    if (!preview) return;
    setLoading(true);
    try {
      await saveToSupabase(
        { ...gameInfo, ...preview.gameInfo },
        preview.battingStats,
        preview.pitchingStats,
        gameInfo.season,
      );
      setSaved(true);
    } catch (e: unknown) {
      // [7] FIX
      setError('저장 오류: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setLoading(false);
    }
  };

  // ─── 초기화 ─────────────────────────────────────────────────────────────
  const handleReset = (): void => {
    setFile(null);
    setPreview(null);
    setSaved(false);
    setError('');
  };

  // ─── 승패 배지 ──────────────────────────────────────────────────────────
  // [9] FIX: res: Result 타입 명시 + Record<Result, ...> 으로 인덱싱
  function resultBadge(res: Result | undefined) {
    if (!res) return null;
    const badgeMap: Record<Result, { label: string; color: string; bg: string }> = {
      W: { label: '승', color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
      L: { label: '패', color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
      D: { label: '무', color: '#eab308', bg: 'rgba(234,179,8,0.15)'  },
    };
    const { label, color, bg } = badgeMap[res];
    return (
      <span style={{ padding: '4px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, background: bg, color }}>
        {label}
      </span>
    );
  }

  // ─── UI ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            📂 경기 기록 업로드
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            Word(.docx), Excel(.xlsx), CSV 파일을 업로드하여 대시보드에 자동 반영합니다.
          </p>
        </div>

        {/* 경기 정보 */}
        <div style={{
          background: 'var(--card-bg)', borderRadius: 16, padding: 24,
          border: '1px solid var(--border)', marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>경기 정보</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {(
              // FIX (ts2339): `as const` 배열에서 placeholder 없는 첫 항목 destructuring 오류
              // → `satisfies` 키워드로 optional placeholder 허용하는 타입으로 검증
              // FIX (ts2322): key 타입을 keyof GameInfo → TextInputKey로 교체
              // keyof GameInfo = 'date' | 'opponent' | 'is_home' | 'season'
              // is_home은 boolean이라 gameInfo[key]가 string|number|boolean이 돼 input value에 boolean 할당 불가
              // TextInputKey는 boolean 필드 is_home을 제외 → gameInfo[key]: string | number 로 좁혀짐
              [
                { label: '경기 날짜', key: 'date'     as TextInputKey, type: 'date'                     },
                { label: '상대팀',    key: 'opponent' as TextInputKey, type: 'text',   placeholder: '예: 선학' },
                { label: '시즌',      key: 'season'   as TextInputKey, type: 'number', placeholder: '2025'    },
              ] satisfies Array<{ label: string; key: TextInputKey; type: string; placeholder?: string }>
            ).map(({ label, key, type, placeholder }) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                <input
                  type={type}
                  value={gameInfo[key]}
                  placeholder={placeholder}
                  onChange={(e) => setGameInfo((g) => ({ ...g, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', color: 'var(--text)',
                    fontSize: 14, outline: 'none',
                  }}
                />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>홈/원정</span>
              <select
                value={gameInfo.is_home ? 'home' : 'away'}
                onChange={(e) => setGameInfo((g) => ({ ...g, is_home: e.target.value === 'home' }))}
                style={{
                  background: 'var(--input-bg)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', color: 'var(--text)',
                  fontSize: 14, outline: 'none',
                }}
              >
                <option value="home">홈</option>
                <option value="away">원정</option>
              </select>
            </label>
          </div>
        </div>

        {/* 드롭존 */}
        {/* [10] FIX: fileInputRef.current?.click() — 옵셔널 체이닝으로 null 체크 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#DC2626' : 'var(--border)'}`,
            borderRadius: 16, padding: '48px 24px', textAlign: 'center',
            background: dragging ? 'rgba(220,38,38,0.05)' : 'var(--card-bg)',
            cursor: 'pointer',
            marginBottom: 24,
          }}
        >
          {/* [8] FIX: e.target.files?.[0] — 옵셔널 체이닝으로 null 방지 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div style={{ fontSize: 48, marginBottom: 12 }}>{loading ? '⏳' : '📁'}</div>
          <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
            {loading ? '파싱 중...' : file ? file.name : '파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            지원 형식: <strong style={{ color: '#DC2626' }}>.docx</strong> · .xlsx · .csv
          </p>
        </div>

        {/* 오류 메시지 */}
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 12, padding: '12px 16px', color: '#ef4444', marginBottom: 24,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 미리보기 */}
        {preview && (
          <div>
            {/* 경기 요약 */}
            <div style={{
              background: 'var(--card-bg)', borderRadius: 16, padding: 24,
              border: '1px solid var(--border)', marginBottom: 20,
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                📊 파싱 결과 미리보기
              </h2>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Utah Devils</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>
                    {preview.gameInfo.score_us}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-muted)' }}>vs</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {gameInfo.opponent || '상대팀'}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444' }}>
                    {preview.gameInfo.score_them}
                  </div>
                </div>
                <div style={{ marginLeft: 8 }}>
                  {resultBadge(preview.gameInfo.result)}
                </div>
              </div>
            </div>

            {/* 타격 기록 테이블 */}
            {preview.battingStats.length > 0 && (
              <div style={{
                background: 'var(--card-bg)', borderRadius: 16, padding: 24,
                border: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto',
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
                  🏏 타격 기록 ({preview.battingStats.length}명)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['이름','타수','득점','안타','2루타','3루타','홈런','타점','볼넷','삼진','타율'].map((h) => (
                        <th key={h} style={{ padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.battingStats.map((b, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--table-stripe)' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{b.name}</td>
                        {([b.atBats, b.runs, b.hits, b.doubles, b.triples, b.homeRuns, b.rbi, b.walks, b.strikeouts] as number[]).map((v, j) => (
                          <td key={j} style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{v}</td>
                        ))}
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#DC2626' }}>
                          {fmtAvg(b.hits, b.atBats)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 투구 기록 테이블 */}
            {preview.pitchingStats.length > 0 && (
              <div style={{
                background: 'var(--card-bg)', borderRadius: 16, padding: 24,
                border: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto',
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
                  ⚾ 투구 기록 ({preview.pitchingStats.length}명)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['이름','결과','이닝','피안타','실점','자책','볼넷','삼진','평균구속','ERA'].map((h) => (
                        <th key={h} style={{ padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.pitchingStats.map((p, i) => {
                      const era = p.innings > 0 ? ((p.earnedRuns * 9) / p.innings).toFixed(2) : '-';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--table-stripe)' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', color: p.result === '승' ? '#22c55e' : p.result === '패' ? '#ef4444' : 'var(--text-muted)' }}>
                            {p.result || '-'}
                          </td>
                          {([p.innings, p.hits, p.runs, p.earnedRuns, p.walks, p.strikeouts] as number[]).map((v, j) => (
                            <td key={j} style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{v}</td>
                          ))}
                          <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {p.avgSpeed ? `${p.avgSpeed}km/h` : '-'}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#DC2626' }}>
                            {era}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 액션 버튼 */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={handleReset}
                style={{
                  padding: '11px 24px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading || saved}
                style={{
                  padding: '11px 28px', borderRadius: 10,
                  background: saved ? '#22c55e' : '#DC2626',
                  color: '#fff', border: 'none', fontWeight: 700, fontSize: 14,
                  cursor: loading || saved ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {saved ? '✓ 저장 완료' : loading ? '저장 중...' : '대시보드에 반영'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}