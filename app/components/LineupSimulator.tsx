"use client";

import { useState, useRef, useCallback } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];

interface Player {
  id: number;
  name: string;
  number: number;
  avg: string;
  obp: string;
  ops: string;
  pa: number;
  hits: number;
}

interface LineupSlot {
  player: Player | null;
  position: string;
}

interface SavedLineup {
  id: number;
  name: string;
  batting_order: { player_id: number; position: string }[];
}

export default function LineupSimulator({
  players,
  savedLineups,
  lang,
}: {
  players: Player[];
  savedLineups: SavedLineup[];
  lang: string;
}) {
  const [lineup, setLineup] = useState<LineupSlot[]>(
    Array.from({ length: 9 }, () => ({ player: null, position: "" }))
  );
  const [lineupName, setLineupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(savedLineups);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const dragRef = useRef<number | null>(null);

  const usedPlayerIds = new Set(
    lineup.filter((s) => s.player).map((s) => s.player!.id)
  );

  const availablePlayers = players.filter(
    (p) =>
      !usedPlayerIds.has(p.id) &&
      (searchQuery === "" ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.number).includes(searchQuery))
  );

  // --- 드래그 앤 드롭 ---
  const handleDragStart = (idx: number) => {
    dragRef.current = idx;
    setDragFrom(idx);
  };

  const handleDragEnter = (idx: number) => {
    setDragOver(idx);
  };

  const handleDragEnd = () => {
    if (dragRef.current !== null && dragOver !== null && dragRef.current !== dragOver) {
      setLineup((prev) => {
        const next = [...prev];
        const temp = next[dragRef.current!];
        next[dragRef.current!] = next[dragOver];
        next[dragOver] = temp;
        return next;
      });
    }
    dragRef.current = null;
    setDragFrom(null);
    setDragOver(null);
  };

  // --- 선수 추가/제거 ---
  const addPlayer = (player: Player, slotIdx: number) => {
    setLineup((prev) => {
      const next = [...prev];
      next[slotIdx] = { ...next[slotIdx], player };
      return next;
    });
  };

  const removePlayer = (slotIdx: number) => {
    setLineup((prev) => {
      const next = [...prev];
      next[slotIdx] = { player: null, position: next[slotIdx].position };
      return next;
    });
  };

  const setPosition = (slotIdx: number, position: string) => {
    setLineup((prev) => {
      const next = [...prev];
      next[slotIdx] = { ...next[slotIdx], position };
      return next;
    });
  };

  // --- 예상 팀 스탯 ---
  const filledSlots = lineup.filter((s) => s.player);
  const projAvg =
    filledSlots.length > 0
      ? (
          filledSlots.reduce(
            (sum, s) => sum + (parseFloat(s.player!.avg) || 0),
            0
          ) / filledSlots.length
        ).toFixed(3)
      : "---";
  const projOBP =
    filledSlots.length > 0
      ? (
          filledSlots.reduce(
            (sum, s) => sum + (parseFloat(s.player!.obp) || 0),
            0
          ) / filledSlots.length
        ).toFixed(3)
      : "---";
  const projOPS =
    filledSlots.length > 0
      ? (
          filledSlots.reduce(
            (sum, s) => sum + (parseFloat(s.player!.ops) || 0),
            0
          ) / filledSlots.length
        ).toFixed(3)
      : "---";

  // --- 저장 ---
  const saveLineup = async () => {
    if (!lineupName.trim() || filledSlots.length === 0) return;
    setSaving(true);
    try {
      const battingOrder = lineup
        .map((s, i) =>
          s.player
            ? { player_id: s.player.id, position: s.position || "DH", order: i + 1 }
            : null
        )
        .filter(Boolean);

      const res = await fetch("/api/lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lineupName,
          batting_order: battingOrder,
          season: "2025",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved((prev) => [data, ...prev]);
        setLineupName("");
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // --- 불러오기 ---
  const loadLineup = (sl: SavedLineup) => {
    const newLineup: LineupSlot[] = Array.from({ length: 9 }, () => ({
      player: null,
      position: "",
    }));
    sl.batting_order.forEach((entry: any, i: number) => {
      if (i < 9) {
        const player = players.find((p) => p.id === entry.player_id) || null;
        newLineup[i] = { player, position: entry.position || "" };
      }
    });
    setLineup(newLineup);
    setLineupName(sl.name);
    setShowSaved(false);
  };

  // --- 삭제 ---
  const deleteLineup = async (id: number) => {
    await fetch(`/api/lineups?id=${id}`, { method: "DELETE" });
    setSaved((prev) => prev.filter((l) => l.id !== id));
  };

  const ko = lang === "ko";

  return (
    <div>
      {/* 예상 스탯 카드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { label: ko ? "예상 타율" : "Proj. AVG", value: projAvg, color: "#22c55e" },
          { label: ko ? "예상 출루율" : "Proj. OBP", value: projOBP, color: "#60a5fa" },
          { label: ko ? "예상 OPS" : "Proj. OPS", value: projOPS, color: "#eab308" },
          { label: ko ? "등록 선수" : "In Lineup", value: `${filledSlots.length}/9`, color: "#a78bfa" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 20,
          alignItems: "start",
        }}
        className="lineup-grid"
      >
        {/* 타순 카드 */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {ko ? "타순 배치" : "Batting Order"}
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowSaved(!showSaved)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: showSaved
                    ? "rgba(96,165,250,0.15)"
                    : "rgba(255,255,255,0.03)",
                  color: showSaved ? "#60a5fa" : "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {ko ? "📁 저장 목록" : "📁 Saved"}
              </button>
              <button
                onClick={() =>
                  setLineup(
                    Array.from({ length: 9 }, () => ({
                      player: null,
                      position: "",
                    }))
                  )
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(239,68,68,0.2)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#f87171",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {ko ? "초기화" : "Clear"}
              </button>
            </div>
          </div>

          {/* 저장된 라인업 목록 */}
          {showSaved && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  margin: "0 0 10px",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {ko ? "저장된 라인업" : "Saved Lineups"}
              </h3>
              {saved.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  {ko ? "저장된 라인업이 없습니다" : "No saved lineups"}
                </p>
              ) : (
                saved.map((sl) => (
                  <div
                    key={sl.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                      marginBottom: 4,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {sl.name}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => loadLineup(sl)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: "rgba(96,165,250,0.15)",
                          color: "#60a5fa",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {ko ? "불러오기" : "Load"}
                      </button>
                      <button
                        onClick={() => deleteLineup(sl.id)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: "rgba(239,68,68,0.1)",
                          color: "#f87171",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 타순 슬롯 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lineup.map((slot, idx) => (
              <div
                key={idx}
                draggable={!!slot.player}
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  background:
                    dragOver === idx
                      ? "rgba(96,165,250,0.12)"
                      : dragFrom === idx
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.02)",
                  border:
                    dragOver === idx
                      ? "1px solid rgba(96,165,250,0.3)"
                      : "1px solid rgba(255,255,255,0.05)",
                  cursor: slot.player ? "grab" : "default",
                  transition: "all 0.15s",
                  minHeight: 56,
                }}
              >
                {/* 타순 번호 */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background:
                      slot.player
                        ? "linear-gradient(135deg, #dc2626, #991b1b)"
                        : "rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    color: slot.player ? "#fff" : "rgba(255,255,255,0.2)",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>

                {slot.player ? (
                  <>
                    {/* 포지션 셀렉트 */}
                    <select
                      value={slot.position}
                      onChange={(e) => setPosition(idx, e.target.value)}
                      style={{
                        width: 56,
                        padding: "4px 2px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#e2e8f0",
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      <option value="">--</option>
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>

                    {/* 선수 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <span
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            marginRight: 6,
                            fontSize: 12,
                          }}
                        >
                          #{slot.player.number}
                        </span>
                        {slot.player.name}
                      </div>
                    </div>

                    {/* 스탯 */}
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        fontSize: 11,
                        color: "rgba(255,255,255,0.5)",
                        flexShrink: 0,
                      }}
                      className="lineup-stats"
                    >
                      <span>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>AVG </span>
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              parseFloat(slot.player.avg) >= 0.3
                                ? "#22c55e"
                                : "#e2e8f0",
                          }}
                        >
                          {slot.player.avg}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>OPS </span>
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              parseFloat(slot.player.ops) >= 0.8
                                ? "#eab308"
                                : "#e2e8f0",
                          }}
                        >
                          {slot.player.ops}
                        </span>
                      </span>
                    </div>

                    {/* 제거 버튼 */}
                    <button
                      onClick={() => removePlayer(idx)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        border: "none",
                        background: "rgba(239,68,68,0.1)",
                        color: "#f87171",
                        fontSize: 13,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.2)",
                      fontStyle: "italic",
                    }}
                  >
                    {ko ? `${idx + 1}번 타자 — 선수를 선택하세요` : `#${idx + 1} — Select player`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 저장 영역 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={lineupName}
              onChange={(e) => setLineupName(e.target.value)}
              placeholder={ko ? "라인업 이름 입력..." : "Lineup name..."}
              style={{
                flex: 1,
                minWidth: 160,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "#e2e8f0",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={saveLineup}
              disabled={saving || !lineupName.trim() || filledSlots.length === 0}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background:
                  !lineupName.trim() || filledSlots.length === 0
                    ? "rgba(255,255,255,0.05)"
                    : "linear-gradient(135deg, #dc2626, #991b1b)",
                color:
                  !lineupName.trim() || filledSlots.length === 0
                    ? "rgba(255,255,255,0.2)"
                    : "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor:
                  !lineupName.trim() || filledSlots.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {saving
                ? ko
                  ? "저장 중..."
                  : "Saving..."
                : ko
                  ? "💾 라인업 저장"
                  : "💾 Save Lineup"}
            </button>
          </div>
        </div>

        {/* 선수 목록 패널 */}
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 10,
              margin: 0,
            }}
          >
            {ko ? "선수 목록" : "Players"}
          </h2>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={ko ? "이름/번호 검색..." : "Search name/number..."}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "#e2e8f0",
              fontSize: 13,
              outline: "none",
              marginTop: 10,
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              maxHeight: 520,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {availablePlayers.map((p) => {
              const emptyIdx = lineup.findIndex((s) => !s.player);
              return (
                <button
                  key={p.id}
                  onClick={() => emptyIdx !== -1 && addPlayer(p, emptyIdx)}
                  disabled={emptyIdx === -1}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(255,255,255,0.02)",
                    color: "#e2e8f0",
                    cursor: emptyIdx !== -1 ? "pointer" : "not-allowed",
                    width: "100%",
                    textAlign: "left",
                    transition: "all 0.12s",
                    opacity: emptyIdx === -1 ? 0.4 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "rgba(255,255,255,0.3)",
                      width: 28,
                    }}
                  >
                    #{p.number}
                  </span>
                  <span
                    style={{ flex: 1, fontSize: 13, fontWeight: 600 }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color:
                        parseFloat(p.ops) >= 0.8
                          ? "#eab308"
                          : "rgba(255,255,255,0.4)",
                      fontWeight: 700,
                    }}
                  >
                    {p.ops}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 모바일 반응형 스타일 */}
      <style>{`
        @media (max-width: 768px) {
          .lineup-grid {
            grid-template-columns: 1fr !important;
          }
          .lineup-stats {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}