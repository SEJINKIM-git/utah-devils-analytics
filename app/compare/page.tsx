'use client';

/**
 * app/compare/page.tsx
 *
 * TypeScript 변환 수정 사항:
 *  1. Player, BattingStat, PitchingStat, CalcBatting, CalcPitching 인터페이스 추가
 *     → useState([]) 타입 추론 실패("never[]") 해결
 *  2. 모든 컴포넌트 props에 인터페이스 추가
 *     → "implicitly has 'any' type" 에러 해결
 *  3. useRef<HTMLDivElement>(null) → ref.current.contains() 타입 에러 해결
 *  4. RadarChart props 타입 CalcBatting | null 명시
 *  5. resultBadge 반환 타입 명시
 *  6. map/filter 콜백 파라미터 타입 명시
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

interface BattingStat {
  season: number;
  at_bats: number;
  hits: number;
  doubles: number;
  triples: number;
  home_runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  runs: number;
}

interface PitchingStat {
  season: number;
  innings: number;
  hits: number;
  runs: number;
  earned_runs: number;
  walks: number;
  strikeouts: number;
}

interface Player {
  id: number;
  name: string;
  number: number;
  position: string;
  batting_stats: BattingStat[];
  pitching_stats: PitchingStat[];
}

interface RawPlayer {
  id: number;
  name: string;
  number: number;
  position?: string | null;
}

interface CalcBatting extends BattingStat {
  avg: number;
  obp: number;
  slg: number;
  ops: number;
}

interface CalcPitching extends PitchingStat {
  era: number | null;
  whip: number | null;
}

// ─── 데이터 페칭 (실제 업로드 데이터 기준) ────────────────────────────────────

async function fetchPlayers(): Promise<Player[]> {
  const res = await fetch('/api/compare-data', { cache: 'no-store' });
  if (!res.ok) throw new Error('비교 데이터 로드 실패');

  const { players: rawPlayers, batting, pitching }: {
    players: RawPlayer[];
    batting: any[];
    pitching: any[];
  } = await res.json();

  const uniquePlayers: RawPlayer[] = Array.from(
    (rawPlayers || []).reduce((map: Map<number, RawPlayer>, player: RawPlayer) => {
      const existing = map.get(player.number);
      if (!existing || player.id > existing.id) map.set(player.number, player);
      return map;
    }, new Map<number, RawPlayer>()).values()
  );

  const playerIdToRepresentativeId = new Map<number, number>();
  for (const player of rawPlayers || []) {
    const representative = uniquePlayers.find((entry) => entry.number === player.number);
    if (representative) playerIdToRepresentativeId.set(player.id, representative.id);
  }

  const battingByPlayerSeason = new Map<string, BattingStat>();
  for (const row of batting || []) {
    const playerId = playerIdToRepresentativeId.get(row.player_id) ?? row.player_id;
    const season = Number(row.season || 2025);
    const key = `${playerId}:${season}`;
    const current = battingByPlayerSeason.get(key) || {
      season,
      at_bats: 0,
      hits: 0,
      doubles: 0,
      triples: 0,
      home_runs: 0,
      rbi: 0,
      walks: 0,
      strikeouts: 0,
      runs: 0,
    };
    battingByPlayerSeason.set(key, {
      season,
      at_bats: current.at_bats + (row.ab || 0),
      hits: current.hits + (row.hits || 0),
      doubles: current.doubles + (row.doubles || 0),
      triples: current.triples + (row.triples || 0),
      home_runs: current.home_runs + (row.hr || 0),
      rbi: current.rbi + (row.rbi || 0),
      walks: current.walks + (row.bb || 0),
      strikeouts: current.strikeouts + (row.so || 0),
      runs: current.runs + (row.runs || 0),
    });
  }

  const pitchingByPlayerSeason = new Map<string, PitchingStat>();
  for (const row of pitching || []) {
    const playerId = playerIdToRepresentativeId.get(row.player_id) ?? row.player_id;
    const season = Number(row.season || 2025);
    const key = `${playerId}:${season}`;
    const current = pitchingByPlayerSeason.get(key) || {
      season,
      innings: 0,
      hits: 0,
      runs: 0,
      earned_runs: 0,
      walks: 0,
      strikeouts: 0,
    };
    pitchingByPlayerSeason.set(key, {
      season,
      innings: current.innings + (parseFloat(String(row.ip || 0)) || 0),
      hits: current.hits + (row.ha || 0),
      runs: current.runs + (row.runs_allowed || 0),
      earned_runs: current.earned_runs + (row.er || 0),
      walks: current.walks + (row.bb || 0),
      strikeouts: current.strikeouts + (row.so || 0),
    });
  }

  return uniquePlayers.map((player: any) => ({
    id: player.id,
    name: player.name,
    number: player.number,
    position: player.position || '-',
    batting_stats: Array.from(battingByPlayerSeason.entries())
      .filter(([key]) => key.startsWith(`${player.id}:`))
      .map(([, value]) => value)
      .sort((a, b) => b.season - a.season),
    pitching_stats: Array.from(pitchingByPlayerSeason.entries())
      .filter(([key]) => key.startsWith(`${player.id}:`))
      .map(([, value]) => value)
      .sort((a, b) => b.season - a.season),
  }));
}

// ─── 통계 계산 ────────────────────────────────────────────────────────────────

function getLatestSeason(stats: BattingStat[] | PitchingStat[], season?: number) {
  if (!stats.length) return null;
  if (season) {
    const found = stats.find((s) => s.season === season);
    if (found) return found;
  }
  return [...stats].sort((a, b) => b.season - a.season)[0];
}

function calcBatting(stats: BattingStat[], season?: number): CalcBatting | null {
  // 해당 시즌 레코드 전부 합산
  const seasonStats = season
    ? stats.filter((s) => s.season === season)
    : [...stats].sort((a, b) => b.season - a.season).filter((s) => s.season === [...stats].sort((a,b)=>b.season-a.season)[0]?.season);
  if (!seasonStats.length) return null;
  const merged = seasonStats.reduce((acc, s) => ({
    ...acc,
    at_bats:    (acc.at_bats    || 0) + (s.at_bats    || 0),
    hits:       (acc.hits       || 0) + (s.hits       || 0),
    doubles:    (acc.doubles    || 0) + (s.doubles    || 0),
    triples:    (acc.triples    || 0) + (s.triples    || 0),
    home_runs:  (acc.home_runs  || 0) + (s.home_runs  || 0),
    rbi:        (acc.rbi        || 0) + (s.rbi        || 0),
    walks:      (acc.walks      || 0) + (s.walks      || 0),
    strikeouts: (acc.strikeouts || 0) + (s.strikeouts || 0),
    runs:       (acc.runs       || 0) + (s.runs       || 0),
  }), { ...seasonStats[0], at_bats:0, hits:0, doubles:0, triples:0, home_runs:0, rbi:0, walks:0, strikeouts:0, runs:0 });
  const ab = merged.at_bats || 0;
  const h  = merged.hits    || 0;
  const bb = merged.walks   || 0;
  const singles = h - (merged.doubles||0) - (merged.triples||0) - (merged.home_runs||0);
  const tb = singles + (merged.doubles||0)*2 + (merged.triples||0)*3 + (merged.home_runs||0)*4;
  const avg = ab > 0 ? h / ab : 0;
  const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
  const slg = ab > 0 ? tb / ab : 0;
  return { ...merged, avg, obp, slg, ops: obp + slg };
}

function calcPitching(stats: PitchingStat[], season?: number): CalcPitching | null {
  const seasonStats = season
    ? stats.filter((s) => s.season === season)
    : [...stats].sort((a, b) => b.season - a.season).filter((s) => s.season === [...stats].sort((a,b)=>b.season-a.season)[0]?.season);
  if (!seasonStats.length) return null;
  const merged = seasonStats.reduce((acc, s) => ({
    ...acc,
    innings:      (acc.innings      || 0) + (s.innings      || 0),
    hits:         (acc.hits         || 0) + (s.hits         || 0),
    runs:         (acc.runs         || 0) + (s.runs         || 0),
    earned_runs:  (acc.earned_runs  || 0) + (s.earned_runs  || 0),
    walks:        (acc.walks        || 0) + (s.walks        || 0),
    strikeouts:   (acc.strikeouts   || 0) + (s.strikeouts   || 0),
  }), { ...seasonStats[0], innings:0, hits:0, runs:0, earned_runs:0, walks:0, strikeouts:0 });
  const inn  = merged.innings || 0;
  const era  = inn > 0 ? ((merged.earned_runs || 0) * 9) / inn : null;
  const whip = inn > 0 ? ((merged.walks || 0) + (merged.hits || 0)) / inn : null;
  return { ...merged, era, whip };
}

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────

function fmt3(v: number): string {
  if (!isFinite(v) || v < 0) return '-';
  return v.toFixed(3).replace(/^0\./, '.');
}
function fmt2(v: number): string {
  if (!isFinite(v) || v < 0) return '-';
  return v.toFixed(2);
}
function fmtInt(v: number): string {
  return String(Math.round(v));
}

// ─── StatRow 헬퍼 ────────────────────────────────────────────────────────────

interface RowData {
  label: string;
  left: string;
  right: string;
  leftWins: boolean;
  rightWins: boolean;
}

function makeRow(
  label: string,
  v1: number | null | undefined,
  v2: number | null | undefined,
  formatFn: (v: number) => string,
  higherIsBetter = true,
): RowData {
  const n1 = typeof v1 === 'number' && isFinite(v1) ? v1 : null;
  const n2 = typeof v2 === 'number' && isFinite(v2) ? v2 : null;
  const can       = n1 !== null && n2 !== null;
  const leftWins  = can && (higherIsBetter ? n1! > n2! : n1! < n2!);
  const rightWins = can && (higherIsBetter ? n2! > n1! : n2! < n1!);
  return {
    label,
    left:  n1 !== null ? formatFn(n1) : '-',
    right: n2 !== null ? formatFn(n2) : '-',
    leftWins,
    rightWins,
  };
}

// ─── 레이더 차트 ─────────────────────────────────────────────────────────────

interface RadarChartProps {
  b1: CalcBatting;
  b2: CalcBatting;
  color1?: string;
  color2?: string;
}

function RadarChart({ b1, b2, color1 = '#DC2626', color2 = '#3b82f6' }: RadarChartProps) {
  const clamp = (v: number) => Math.min(Math.max(isFinite(v) ? v : 0, 0), 1);

  const axes = [
    { label: '타율',   v1: b1.avg  / 0.40, v2: b2.avg  / 0.40 },
    { label: '출루율', v1: b1.obp  / 0.50, v2: b2.obp  / 0.50 },
    { label: 'OPS',   v1: b1.ops  / 1.00, v2: b2.ops  / 1.00 },
    { label: '장타율', v1: b1.slg  / 0.70, v2: b2.slg  / 0.70 },
    { label: '볼넷율', v1: (b1.walks / Math.max(b1.at_bats, 1)) / 0.25, v2: (b2.walks / Math.max(b2.at_bats, 1)) / 0.25 },
    { label: '삼진↓',  v1: 1 - (b1.strikeouts / Math.max(b1.at_bats, 1)) / 0.40, v2: 1 - (b2.strikeouts / Math.max(b2.at_bats, 1)) / 0.40 },
  ];

  const cx = 160, cy = 160, R = 106;
  const n  = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt    = (val: number, i: number): [number, number] => {
    const v = clamp(val);
    return [cx + R * v * Math.cos(angle(i)), cy + R * v * Math.sin(angle(i))];
  };
  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => pt(v, i))
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ') + 'Z';

  return (
    <svg viewBox="0 0 320 320" style={{ width: '100%', maxWidth: 300 }}>
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={Array.from({ length: n }, (_, i) => {
            const [x, y] = [cx + R * scale * Math.cos(angle(i)), cy + R * scale * Math.sin(angle(i))];
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ')}
          fill="none"
          stroke="var(--border)"
          strokeWidth={scale === 1 ? 1.5 : 0.8}
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = [cx + R * Math.cos(angle(i)), cy + R * Math.sin(angle(i))];
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={0.8} />;
      })}
      {axes.map(({ label }, i) => {
        const [x, y] = [cx + (R + 22) * Math.cos(angle(i)), cy + (R + 22) * Math.sin(angle(i))];
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-muted)" fontSize={11} fontWeight={500}>
            {label}
          </text>
        );
      })}
      <path d={toPath(axes.map((a) => a.v1))} fill={color1} fillOpacity={0.18} stroke={color1} strokeWidth={2} />
      <path d={toPath(axes.map((a) => a.v2))} fill={color2} fillOpacity={0.18} stroke={color2} strokeWidth={2} />
      {axes.map(({ v1 }, i) => { const [x, y] = pt(v1, i); return <circle key={i} cx={x} cy={y} r={4} fill={color1} />; })}
      {axes.map(({ v2 }, i) => { const [x, y] = pt(v2, i); return <circle key={i} cx={x} cy={y} r={4} fill={color2} />; })}
    </svg>
  );
}

// ─── StatRow ─────────────────────────────────────────────────────────────────

function StatRow({ label, left, right, leftWins, rightWins }: RowData) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 108px 1fr', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: leftWins ? 700 : 400, color: leftWins ? '#DC2626' : 'var(--text-muted)', fontSize: 15 }}>
        {left}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ textAlign: 'left', paddingLeft: 8, fontWeight: rightWins ? 700 : 400, color: rightWins ? '#3b82f6' : 'var(--text-muted)', fontSize: 15 }}>
        {right}
      </div>
    </div>
  );
}

// ─── 선수 검색 드롭다운 ───────────────────────────────────────────────────────

interface PlayerSearchProps {
  players: Player[];
  selected: Player | null;
  onSelect: (p: Player | null) => void;
  placeholder: string;
  accentColor: string;
  excludeId?: number;
}

function PlayerSearch({ players, selected, onSelect, placeholder, accentColor, excludeId }: PlayerSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  // FIX: useRef<HTMLDivElement>(null) — ref.current.contains() 타입 에러 해결
  const ref = useRef<HTMLDivElement>(null);

  const filtered = players
    .filter((p) => p.id !== excludeId)
    .filter((p) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return p.name.includes(query) || String(p.number).startsWith(q) || p.position.toLowerCase().startsWith(q);
    });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // FIX: ref.current가 HTMLDivElement이므로 .contains() 정상 사용 가능
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--input-bg)',
        border: `1.5px solid ${open ? accentColor : 'var(--border)'}`,
        borderRadius: 12, padding: '10px 14px', transition: 'border-color 0.2s', cursor: 'text',
      }}>
        {selected && !open && (
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {selected.number}
          </div>
        )}
        <input
          type="text"
          value={selected && !open ? `${selected.name}  (${selected.position})` : query}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, minWidth: 0 }}
        />
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(null); setQuery(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 320, overflowY: 'auto', overflow: 'hidden auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>검색 결과 없음</div>
          ) : (
            filtered.map((p) => (
              <div key={p.id}
                onClick={() => { onSelect(p); setOpen(false); setQuery(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: 'var(--card-item, var(--bg-secondary))' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = accentColor + '18'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--card-item, var(--bg-secondary))'; }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {p.number}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.position}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // FIX: useState<Player[]>([]) — 타입 명시로 'never[]' 추론 방지
  const [players, setPlayers] = useState<Player[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [lockedSeasons, setLockedSeasons] = useState<number[]>([]);
  const [p1, setP1]           = useState<Player | null>(null);
  const [p2, setP2]           = useState<Player | null>(null);
  const [season, setSeason]   = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const requestedSeason = Number(searchParams.get('season') || 0);

  useEffect(() => {
    Promise.all([
      fetchPlayers(),
      fetch("/api/seasons", { cache: "no-store" }).then((res) => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([data, seasonMeta]) => {
        setPlayers(data);
        const seasonsFromData = [...new Set(data.flatMap((player) => [
          ...player.batting_stats.map((stat) => stat.season),
          ...player.pitching_stats.map((stat) => stat.season),
        ]))];
        const seasonsFromMeta = (seasonMeta?.seasons || []).map((value: string | number) => Number(value)).filter(Boolean);
        const lockedFromMeta = (seasonMeta?.lockedSeasons || []).map((value: string | number) => Number(value)).filter(Boolean);
        const seasons = [...new Set([...seasonsFromData, ...seasonsFromMeta])].sort((a, b) => b - a);
        setAvailableSeasons(seasons);
        setLockedSeasons(lockedFromMeta);
        const preferredSeason = Number(seasonMeta?.preferredSeason || seasonMeta?.latestSeason || 0);
        setSeason(
          requestedSeason && seasons.includes(requestedSeason)
            ? requestedSeason
            : preferredSeason && seasons.includes(preferredSeason)
              ? preferredSeason
              : seasons[0] || preferredSeason || new Date().getFullYear()
        );
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [requestedSeason]);

  useEffect(() => {
    if (!lockedSeasons.includes(season)) return;
    setP1(null);
    setP2(null);
  }, [season, lockedSeasons]);

  const b1  = p1 ? calcBatting(p1.batting_stats,   season) : null;
  const b2  = p2 ? calcBatting(p2.batting_stats,   season) : null;
  const pi1 = p1 ? calcPitching(p1.pitching_stats, season) : null;
  const pi2 = p2 ? calcPitching(p2.pitching_stats, season) : null;
  const hasPitching = pi1 || pi2;

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>로딩 중...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#ef4444', fontSize: 15 }}>오류: {error}</div>
  );

  /* 모든 선수 표시 — 선택한 시즌 기록 없으면 해당 시즌 최근 기록 사용 */
  const seasonPlayers = lockedSeasons.includes(season)
    ? []
    : players.filter((player) =>
        player.batting_stats.some((stat) => stat.season === season) ||
        player.pitching_stats.some((stat) => stat.season === season)
      );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* ← 대시보드 버튼 */}
            <Link href={season ? `/?season=${season}` : '/'} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10,
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
              textDecoration: 'none',
            }}>
              ← 대시보드
            </Link>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0 }}>⚖️ 선수 비교</h1>
              <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>이름 · 등번호 · 포지션으로 검색하거나 버튼으로 빠르게 선택하세요.</p>
            </div>
          </div>
          <select
            value={season}
            onChange={(e) => {
              const nextSeason = Number(e.target.value);
              setSeason(nextSeason);
              router.replace(`/compare?season=${nextSeason}`);
            }}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', color: 'var(--text)', fontSize: 14, cursor: 'pointer', outline: 'none' }}
          >
            {availableSeasons.map((y) => <option key={y} value={y}>{y} 시즌</option>)}
          </select>
        </div>

        {lockedSeasons.includes(season) && (
          <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
            {season} 시즌은 공식 기록 업로드 전까지 선수 비교를 비워 둡니다.
          </div>
        )}

        {/* 검색창 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 1fr', gap: 12, alignItems: 'center', marginBottom: 20, position: 'relative', zIndex: 100 }}>
          <PlayerSearch players={seasonPlayers} selected={p1} onSelect={setP1} placeholder="선수 1 검색…" accentColor="#DC2626" excludeId={p2?.id} />
          <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--text-dim)', fontSize: 18 }}>VS</div>
          <PlayerSearch players={seasonPlayers} selected={p2} onSelect={setP2} placeholder="선수 2 검색…" accentColor="#3b82f6" excludeId={p1?.id} />
        </div>

        {/* 빠른 선택 — 해당 시즌 기록 있는 선수만 */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>
            {season}시즌 선수 {seasonPlayers.length}명
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32, position: 'relative', zIndex: 1 }}>
          {seasonPlayers.map((p) => {
            const isP1 = p1?.id === p.id;
            const isP2 = p2?.id === p.id;
            return (
              <button key={p.id}
                onClick={() => {
                  if (isP1) { setP1(null); return; }
                  if (isP2) { setP2(null); return; }
                  if (!p1) setP1(p);
                  else if (!p2) setP2(p);
                }}
                style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                  border: `1.5px solid ${isP1 ? '#DC2626' : isP2 ? '#3b82f6' : 'var(--border)'}`,
                  background: isP1 ? '#DC2626' : isP2 ? '#3b82f6' : 'var(--card-bg)',
                  color: (isP1 || isP2) ? '#fff' : 'var(--text-muted)',
                  fontWeight: (isP1 || isP2) ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                #{p.number} {p.name}
              </button>
            );
          })}
        </div>

        {/* 비교 결과 */}
        {p1 && p2 ? (
          <div>
            {/* 선수 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 1fr', background: 'var(--card-bg)', borderRadius: 16, padding: '20px 24px', marginBottom: 20, border: '1px solid var(--border)' }}>
              {([{ player: p1, color: '#DC2626' }, null, { player: p2, color: '#3b82f6' }] as Array<{ player: Player; color: string } | null>).map((item, idx) =>
                item === null ? (
                  <div key="vs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-dim)' }}>VS</span>
                  </div>
                ) : (
                  <div key={item.player.id} style={{ textAlign: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 auto 8px' }}>
                      {item.player.number}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{item.player.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{item.player.position}</div>
                  </div>
                )
              )}
            </div>

            {/* 타격 없음 안내 */}
            {!b1 && !b2 && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 32, border: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-muted)', marginBottom: 20 }}>
                {season}시즌 타격 기록이 없습니다.
              </div>
            )}

            {/* 레이더 + 타격 */}
            {(b1 || b2) && (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', flex: '0 0 auto', width: 'min(100%, 320px)' }}>
                  <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>능력치 비교</h3>
                  {/* FIX: b1 && b2 조건 후에만 RadarChart 렌더링 — null 아님을 보장 */}
                  {b1 && b2 && <RadarChart b1={b1} b2={b2} />}
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>● {p1.name}</span>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>● {p2.name}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', flex: '1 1 280px' }}>
                  <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>🏏 타격 비교</h3>
                  {[
                    makeRow('타수',   b1?.at_bats,    b2?.at_bats,    fmtInt),
                    makeRow('안타',   b1?.hits,       b2?.hits,       fmtInt),
                    makeRow('타율',   b1?.avg,        b2?.avg,        fmt3),
                    makeRow('출루율', b1?.obp,        b2?.obp,        fmt3),
                    makeRow('장타율', b1?.slg,        b2?.slg,        fmt3),
                    makeRow('OPS',   b1?.ops,        b2?.ops,        fmt3),
                    makeRow('홈런',   b1?.home_runs,  b2?.home_runs,  fmtInt),
                    makeRow('타점',   b1?.rbi,        b2?.rbi,        fmtInt),
                    makeRow('볼넷',   b1?.walks,      b2?.walks,      fmtInt),
                    makeRow('삼진',   b1?.strikeouts, b2?.strikeouts, fmtInt, false),
                    makeRow('득점',   b1?.runs,       b2?.runs,       fmtInt),
                  ].map((row) => <StatRow key={row.label} {...row} />)}
                </div>
              </div>
            )}

            {/* 투구 비교 */}
            {hasPitching && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>⚾ 투구 비교</h3>
                {[
                  makeRow('이닝',   pi1?.innings,     pi2?.innings,     fmtInt),
                  makeRow('피안타', pi1?.hits,        pi2?.hits,        fmtInt, false),
                  makeRow('실점',   pi1?.runs,        pi2?.runs,        fmtInt, false),
                  makeRow('자책점', pi1?.earned_runs, pi2?.earned_runs, fmtInt, false),
                  makeRow('볼넷',   pi1?.walks,       pi2?.walks,       fmtInt, false),
                  makeRow('삼진',   pi1?.strikeouts,  pi2?.strikeouts,  fmtInt),
                  makeRow('ERA',   pi1?.era,         pi2?.era,         fmt2,   false),
                  makeRow('WHIP',  pi1?.whip,        pi2?.whip,        fmt2,   false),
                ].map((row) => <StatRow key={row.label} {...row} />)}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>⚾</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>비교할 선수를 2명 선택하세요</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 6 }}>위 검색창이나 버튼을 이용하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
