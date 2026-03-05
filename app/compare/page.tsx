"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Player = { id: number; number: number; name: string; is_pitcher: boolean };
type Batting = { player_id: number; season: string; pa: number; ab: number; hits: number; doubles: number; triples: number; hr: number; rbi: number; bb: number; hbp: number; so: number; sb: number; runs: number };
type Pitching = { player_id: number; season: string; ip: number; er: number; w: number; l: number; sv: number; so: number; ha: number; bb: number; runs_allowed: number; hr_allowed: number; hld: number };

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function ComparePage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [batting, setBatting] = useState<Batting[]>([]);
  const [pitching, setPitching] = useState<Pitching[]>([]);
  const [player1Id, setPlayer1Id] = useState<number | null>(null);
  const [player2Id, setPlayer2Id] = useState<number | null>(null);
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [focus1, setFocus1] = useState(false);
  const [focus2, setFocus2] = useState(false);
  const [loading, setLoading] = useState(true);

  const lang = getCookie("lang") === "en" ? "en" : "ko";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/compare-data");
        const data = await res.json();
        setPlayers(data.players || []);
        setBatting(data.batting || []);
        setPitching(data.pitching || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const getPlayerBatting = (playerId: number) => {
    const rows = batting.filter((b) => b.player_id === playerId && b.season !== "Career" && b.ab > 0);
    if (rows.length === 0) return null;
    return rows.sort((a, b) => (b.season || "").localeCompare(a.season || ""))[0];
  };

  const getPlayerPitching = (playerId: number) => {
    const rows = pitching.filter((p) => p.player_id === playerId && p.season !== "Career" && p.ip > 0);
    if (rows.length === 0) return null;
    return rows.sort((a, b) => (b.season || "").localeCompare(a.season || ""))[0];
  };

  const calcBat = (b: Batting) => {
    const avg = b.ab > 0 ? b.hits / b.ab : 0;
    const obp = b.pa > 0 ? (b.hits + b.bb + b.hbp) / b.pa : 0;
    const slg = b.ab > 0 ? (b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab : 0;
    return { avg, obp, slg, ops: obp + slg };
  };

  const calcPit = (p: Pitching) => {
    const era = p.ip > 0 ? (p.er / p.ip) * 5 : 0;
    const whip = p.ip > 0 ? (p.ha + p.bb) / p.ip : 0;
    return { era, whip };
  };

  const filtered1 = search1.trim() ? players.filter((p) => p.name.includes(search1) || p.number.toString() === search1) : players;
  const filtered2 = search2.trim() ? players.filter((p) => p.name.includes(search2) || p.number.toString() === search2) : players;

  const p1 = players.find((p) => p.id === player1Id);
  const p2 = players.find((p) => p.id === player2Id);
  const bat1 = player1Id ? getPlayerBatting(player1Id) : null;
  const bat2 = player2Id ? getPlayerBatting(player2Id) : null;
  const pit1 = player1Id ? getPlayerPitching(player1Id) : null;
  const pit2 = player2Id ? getPlayerPitching(player2Id) : null;

  const calc1 = bat1 ? calcBat(bat1) : null;
  const calc2 = bat2 ? calcBat(bat2) : null;

  // 레이더 차트 데이터
  const radarData = calc1 && calc2 ? [
    { stat: lang === "ko" ? "타율" : "AVG", p1: parseFloat((calc1.avg * 100).toFixed(1)), p2: parseFloat((calc2.avg * 100).toFixed(1)) },
    { stat: lang === "ko" ? "출루율" : "OBP", p1: parseFloat((calc1.obp * 100).toFixed(1)), p2: parseFloat((calc2.obp * 100).toFixed(1)) },
    { stat: "OPS", p1: parseFloat((calc1.ops * 50).toFixed(1)), p2: parseFloat((calc2.ops * 50).toFixed(1)) },
    { stat: lang === "ko" ? "장타력" : "PWR", p1: (bat1!.hr * 8 + bat1!.doubles * 3 + bat1!.triples * 5), p2: (bat2!.hr * 8 + bat2!.doubles * 3 + bat2!.triples * 5) },
    { stat: lang === "ko" ? "주루" : "SPD", p1: bat1!.sb * 6, p2: bat2!.sb * 6 },
    { stat: lang === "ko" ? "선구안" : "EYE", p1: parseFloat(((bat1!.bb / (bat1!.pa || 1)) * 200).toFixed(1)), p2: parseFloat(((bat2!.bb / (bat2!.pa || 1)) * 200).toFixed(1)) },
  ] : null;

  const StatRow = ({ label, v1, v2, higherBetter = true }: { label: string; v1: string | number; v2: string | number; higherBetter?: boolean }) => {
    const n1 = typeof v1 === "number" ? v1 : parseFloat(v1);
    const n2 = typeof v2 === "number" ? v2 : parseFloat(v2);
    const better1 = higherBetter ? n1 > n2 : n1 < n2;
    const better2 = higherBetter ? n2 > n1 : n2 < n1;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ textAlign: "right", fontSize: 16, fontWeight: 700, color: better1 ? "#22c55e" : "#e2e8f0", paddingRight: 16 }}>{typeof v1 === "number" ? v1 : v1}</div>
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 1 }}>{label}</div>
        <div style={{ textAlign: "left", fontSize: 16, fontWeight: 700, color: better2 ? "#22c55e" : "#e2e8f0", paddingLeft: 16 }}>{typeof v2 === "number" ? v2 : v2}</div>
      </div>
    );
  };

  const PlayerSelector = ({ selected, onSelect, search, setSearch, focused, setFocused, filtered, otherPlayerId }: any) => (
    <div style={{ position: "relative", flex: 1 }}>
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #dc2626, #991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" }}>{selected.number}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>#{selected.number}</div>
          </div>
          <button onClick={() => { onSelect(null); setSearch(""); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            placeholder={lang === "ko" ? "선수 검색..." : "Search player..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
          {focused && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, maxHeight: 260, overflowY: "auto", zIndex: 50 }}>
              {filtered.filter((p: Player) => p.id !== otherPlayerId).map((p: Player) => (
                <div key={p.id} onMouseDown={() => { onSelect(p.id); setSearch(""); setFocused(false); }} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #dc2626, #991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>{p.number}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>{lang === "ko" ? "로딩 중..." : "Loading..."}</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>{lang === "ko" ? "← 대시보드로 돌아가기" : "← Back to Dashboard"}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>⚔️ {lang === "ko" ? "선수 비교" : "Player Comparison"}</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>{lang === "ko" ? "두 선수를 선택하여 스탯을 비교합니다" : "Select two players to compare stats"}</p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {/* 선수 선택 */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 36 }}>
          <PlayerSelector selected={p1} onSelect={setPlayer1Id} search={search1} setSearch={setSearch1} focused={focus1} setFocused={setFocus1} filtered={filtered1} otherPlayerId={player2Id} />
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.25)", flexShrink: 0, marginTop: 4 }}>VS</div>
          <PlayerSelector selected={p2} onSelect={setPlayer2Id} search={search2} setSearch={setSearch2} focused={focus2} setFocused={setFocus2} filtered={filtered2} otherPlayerId={player1Id} />
        </div>

        {/* 비교 결과 */}
        {p1 && p2 && (
          <div>
            {/* 레이더 차트 */}
            {radarData && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 20px", marginBottom: 24, textAlign: "center" as const }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{lang === "ko" ? "능력치 비교" : "Ability Comparison"}</div>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="stat" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name={`#${p1.number} ${p1.name}`} dataKey="p1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name={`#${p2.number} ${p2.name}`} dataKey="p2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 타격 비교 */}
            {bat1 && bat2 && calc1 && calc2 && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", marginBottom: 16 }}>
                  <div style={{ textAlign: "right", paddingRight: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#3b82f6" }}>#{p1.number} {p1.name}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>{bat1.season}</span>
                  </div>
                  <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>⚾ {lang === "ko" ? "타격" : "Batting"}</div>
                  <div style={{ textAlign: "left", paddingLeft: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444" }}>#{p2.number} {p2.name}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>{bat2.season}</span>
                  </div>
                </div>
                <StatRow label={lang === "ko" ? "타율" : "AVG"} v1={calc1.avg.toFixed(3)} v2={calc2.avg.toFixed(3)} />
                <StatRow label={lang === "ko" ? "출루율" : "OBP"} v1={calc1.obp.toFixed(3)} v2={calc2.obp.toFixed(3)} />
                <StatRow label="OPS" v1={calc1.ops.toFixed(3)} v2={calc2.ops.toFixed(3)} />
                <StatRow label={lang === "ko" ? "안타" : "H"} v1={bat1.hits} v2={bat2.hits} />
                <StatRow label={lang === "ko" ? "홈런" : "HR"} v1={bat1.hr} v2={bat2.hr} />
                <StatRow label={lang === "ko" ? "타점" : "RBI"} v1={bat1.rbi} v2={bat2.rbi} />
                <StatRow label={lang === "ko" ? "볼넷" : "BB"} v1={bat1.bb} v2={bat2.bb} />
                <StatRow label={lang === "ko" ? "삼진" : "SO"} v1={bat1.so} v2={bat2.so} higherBetter={false} />
                <StatRow label={lang === "ko" ? "도루" : "SB"} v1={bat1.sb} v2={bat2.sb} />
              </div>
            )}

            {/* 투수 비교 */}
            {pit1 && pit2 && (() => {
              const c1 = calcPit(pit1);
              const c2 = calcPit(pit2);
              return (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", marginBottom: 16 }}>
                    <div style={{ textAlign: "right", paddingRight: 16 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#3b82f6" }}>#{p1.number} {p1.name}</span>
                    </div>
                    <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>🏏 {lang === "ko" ? "투구" : "Pitching"}</div>
                    <div style={{ textAlign: "left", paddingLeft: 16 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444" }}>#{p2.number} {p2.name}</span>
                    </div>
                  </div>
                  <StatRow label="ERA" v1={c1.era.toFixed(2)} v2={c2.era.toFixed(2)} higherBetter={false} />
                  <StatRow label="WHIP" v1={c1.whip.toFixed(2)} v2={c2.whip.toFixed(2)} higherBetter={false} />
                  <StatRow label={lang === "ko" ? "승" : "W"} v1={pit1.w} v2={pit2.w} />
                  <StatRow label={lang === "ko" ? "이닝" : "IP"} v1={pit1.ip} v2={pit2.ip} />
                  <StatRow label={lang === "ko" ? "삼진" : "SO"} v1={pit1.so} v2={pit2.so} />
                  <StatRow label={lang === "ko" ? "볼넷" : "BB"} v1={pit1.bb} v2={pit2.bb} higherBetter={false} />
                  <StatRow label={lang === "ko" ? "피안타" : "HA"} v1={pit1.ha} v2={pit2.ha} higherBetter={false} />
                </div>
              );
            })()}

            {/* 둘 다 타격 데이터 없을 때 */}
            {!bat1 && !bat2 && !pit1 && !pit2 && (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>
                {lang === "ko" ? "선택한 선수들의 비교 가능한 데이터가 없습니다" : "No comparable data for selected players"}
              </div>
            )}
          </div>
        )}

        {/* 선수 미선택 */}
        {(!p1 || !p2) && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
            <div style={{ fontSize: 16 }}>{lang === "ko" ? "두 선수를 선택하면 비교가 시작됩니다" : "Select two players to start comparison"}</div>
          </div>
        )}
      </div>
    </div>
  );
}