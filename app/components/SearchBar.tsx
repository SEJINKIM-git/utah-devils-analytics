"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Player = {
  id: number;
  number: number;
  name: string;
  is_pitcher: boolean;
};

type BattingStat = {
  player_id: number;
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  rbi: number;
  doubles: number;
  triples: number;
};

type PitchingStat = {
  player_id: number;
  ip: number;
  er: number;
  w: number;
  l: number;
  sv: number;
  so: number;
  ha: number;
  bb: number;
};

export default function SearchBar({
  players,
  batting,
  pitching,
  season,
}: {
  players: Player[];
  batting: BattingStat[];
  pitching: PitchingStat[];
  season?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cmd+K로 검색 포커스
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const filtered = query.trim()
    ? players.filter(
        (p) =>
          p.name.includes(query) ||
          p.number.toString() === query
      )
    : [];

  const getPlayerStats = (playerId: number) => {
    const bat = batting.find((b) => b.player_id === playerId);
    const pitch = pitching.find((p) => p.player_id === playerId);

    let avg = "---";
    let ops = "---";
    let era = null;

    if (bat && bat.ab > 0) {
      avg = (bat.hits / bat.ab).toFixed(3);
      const obp = bat.pa > 0 ? (bat.hits + bat.bb + bat.hbp) / bat.pa : 0;
      const slg =
        (bat.hits - bat.doubles - bat.triples - bat.hr +
          bat.doubles * 2 +
          bat.triples * 3 +
          bat.hr * 4) /
        bat.ab;
      ops = (obp + slg).toFixed(3);
    }

    if (pitch && pitch.ip > 0) {
      era = ((pitch.er / pitch.ip) * 5).toFixed(2);
    }

    return { bat, pitch, avg, ops, era };
  };

  const handleSelect = (playerId: number) => {
    setQuery("");
    setFocused(false);
    const nextHref = season ? `/players/${playerId}?season=${encodeURIComponent(season)}` : `/players/${playerId}`;
    router.push(nextHref);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {/* 검색 입력 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: focused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${focused ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 12,
          padding: "10px 16px",
          transition: "all 0.2s",
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="선수 검색 (이름 또는 등번호)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: 14,
          }}
        />
        {!focused && (
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            ⌘K
          </span>
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {focused && query.trim() && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "#1a1f2e",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            overflow: "hidden",
            zIndex: 50,
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: 13,
              }}
            >
              &quot;{query}&quot;에 해당하는 선수가 없습니다
            </div>
          ) : (
            filtered.map((player) => {
              const stats = getPlayerStats(player.id);
              return (
                <div
                  key={player.id}
                  onClick={() => handleSelect(player.id)}
                  style={{
                    padding: "14px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #dc2626, #991b1b)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 900,
                          color: "#fff",
                        }}
                      >
                        {player.number}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{player.name}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>#{player.number}</span>
                          {player.is_pitcher && (
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(234,179,8,0.12)", color: "#eab308" }}>투수</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 간단 스탯 미리보기 */}
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      {stats.bat && (
                        <>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>타율</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: parseFloat(stats.avg) >= 0.3 ? "#22c55e" : "#eab308" }}>{stats.avg}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>OPS</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: parseFloat(stats.ops) >= 1.0 ? "#22c55e" : parseFloat(stats.ops) >= 0.7 ? "#eab308" : "#ef4444" }}>{stats.ops}</div>
                          </div>
                        </>
                      )}
                      {stats.era && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>ERA</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: parseFloat(stats.era) <= 3.0 ? "#22c55e" : parseFloat(stats.era) <= 5.0 ? "#eab308" : "#ef4444" }}>{stats.era}</div>
                        </div>
                      )}
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18 }}>→</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
