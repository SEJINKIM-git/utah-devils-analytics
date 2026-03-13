"use client";

import { useState, useEffect } from "react";

interface Game {
  id: number;
  date: string;
  time?: string;
  opponent: string;
  location?: string;
  is_home: boolean;
  result?: "W" | "L" | "D" | null;
  score_us?: number;
  score_them?: number;
  notes?: string;
  season: string;
}

const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const resultColors: Record<string, string> = {
  W: "#22c55e",
  L: "#ef4444",
  D: "#eab308",
};

const INITIAL_YEAR = 2025;
const INITIAL_MONTH = 2; // 3월 (0-indexed)

export default function GameCalendar({
  games: initialGames,
  lang,
  season,
}: {
  games: Game[];
  lang: string;
  season: string;
}) {
  const ko = lang === "ko";

  // ✅ 고정 초기값으로 hydration 불일치 방지
  const [year, setYear] = useState(INITIAL_YEAR);
  const [month, setMonth] = useState(INITIAL_MONTH);
  const [mounted, setMounted] = useState(false);
  const [games, setGames] = useState<Game[]>(initialGames);
  const [showForm, setShowForm] = useState(false);
  const [editGame, setEditGame] = useState<Game | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: "",
    time: "",
    opponent: "",
    location: "",
    is_home: true,
    result: "" as string,
    score_us: "",
    score_them: "",
    notes: "",
  });

  // ✅ 클라이언트 마운트 후 실제 날짜 반영
  useEffect(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setMounted(true);
  }, []);

  useEffect(() => {
    setGames(initialGames);
    setSelectedDate(null);
    setShowForm(false);
    setEditGame(null);
  }, [initialGames]);

  // ✅ mounted 전에는 고정값 사용
  const today = mounted
    ? new Date()
    : new Date(INITIAL_YEAR, INITIAL_MONTH, 5);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 달력 데이터 생성
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const calendarDays: {
    day: number;
    currentMonth: boolean;
    dateStr: string;
  }[] = [];

  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      const d = prevDays - firstDay + i + 1;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      calendarDays.push({
        day: d,
        currentMonth: false,
        dateStr: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    } else if (i - firstDay < daysInMonth) {
      const d = i - firstDay + 1;
      calendarDays.push({
        day: d,
        currentMonth: true,
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    } else {
      const d = i - firstDay - daysInMonth + 1;
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      calendarDays.push({
        day: d,
        currentMonth: false,
        dateStr: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }
  }

  // 날짜별 경기 매핑
  const gamesMap = new Map<string, Game[]>();
  games.forEach((g) => {
    const key = g.date;
    if (!gamesMap.has(key)) gamesMap.set(key, []);
    gamesMap.get(key)!.push(g);
  });

  // 전적 요약
  const seasonGames = games.filter((g) => g.result);
  const wins = seasonGames.filter((g) => g.result === "W").length;
  const losses = seasonGames.filter((g) => g.result === "L").length;
  const draws = seasonGames.filter((g) => g.result === "D").length;
  const upcoming = games.filter(
    (g) => !g.result && g.date >= todayStr
  ).length;

  // --- 폼 핸들러 ---
  const openAddForm = (dateStr?: string) => {
    setForm({
      date: dateStr || todayStr,
      time: "",
      opponent: "",
      location: "",
      is_home: true,
      result: "",
      score_us: "",
      score_them: "",
      notes: "",
    });
    setEditGame(null);
    setShowForm(true);
  };

  const openEditForm = (game: Game) => {
    setForm({
      date: game.date,
      time: game.time || "",
      opponent: game.opponent,
      location: game.location || "",
      is_home: game.is_home,
      result: game.result || "",
      score_us:
        game.score_us !== null && game.score_us !== undefined
          ? String(game.score_us)
          : "",
      score_them:
        game.score_them !== null && game.score_them !== undefined
          ? String(game.score_them)
          : "",
      notes: game.notes || "",
    });
    setEditGame(game);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.opponent.trim() || !form.date) return;

    const payload = {
      date: form.date,
      time: form.time || null,
      opponent: form.opponent,
      location: form.location || null,
      is_home: form.is_home,
      result: form.result || null,
      score_us: form.score_us ? Number(form.score_us) : null,
      score_them: form.score_them ? Number(form.score_them) : null,
      notes: form.notes || null,
      season,
    };

    try {
      if (editGame) {
        const res = await fetch("/api/games", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editGame.id, ...payload }),
        });
        if (res.ok) {
          const updated = await res.json();
          setGames((prev) =>
            prev.map((g) => (g.id === editGame.id ? updated : g))
          );
        }
      } else {
        const res = await fetch("/api/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const newGame = await res.json();
          setGames((prev) =>
            [...prev, newGame].sort((a, b) => a.date.localeCompare(b.date))
          );
        }
      }
    } catch (e) {
      console.error(e);
    }
    setShowForm(false);
    setEditGame(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/games?id=${id}`, { method: "DELETE" });
      setGames((prev) => prev.filter((g) => g.id !== id));
      setSelectedDate(null);
    } catch (e) {
      console.error(e);
    }
  };

  // --- 월 이동 ---
  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const dayNames = ko ? DAYS_KO : DAYS_EN;
  const monthName = ko ? MONTHS_KO[month] : MONTHS_EN[month];
  const selectedGames = selectedDate
    ? gamesMap.get(selectedDate) || []
    : [];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div>
      {/* 전적 카드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          { label: ko ? "승" : "Wins", value: wins, color: "#22c55e" },
          { label: ko ? "패" : "Losses", value: losses, color: "#ef4444" },
          { label: ko ? "무" : "Draws", value: draws, color: "#eab308" },
          { label: ko ? "예정" : "Upcoming", value: upcoming, color: "#60a5fa" },
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
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 달력 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={prevMonth} style={navBtn}>
            ◂
          </button>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              margin: 0,
              minWidth: 130,
              textAlign: "center",
            }}
          >
            {ko ? `${year}년 ${monthName}` : `${monthName} ${year}`}
          </h2>
          <button onClick={nextMonth} style={navBtn}>
            ▸
          </button>
          <button
            onClick={goToday}
            style={{ ...navBtn, fontSize: 11, padding: "6px 12px", width: "auto" }}
          >
            {ko ? "오늘" : "Today"}
          </button>
        </div>
        <button
          onClick={() => openAddForm()}
          style={{
            padding: "8px 18px",
            borderRadius: 9,
            border: "none",
            background: "linear-gradient(135deg, #dc2626, #991b1b)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + {ko ? "경기 추가" : "Add Game"}
        </button>
      </div>

      {/* 달력 그리드 */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {dayNames.map((d, i) => (
            <div
              key={d}
              style={{
                padding: "10px 6px",
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color:
                  i === 0
                    ? "#ef4444"
                    : i === 6
                      ? "#60a5fa"
                      : "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendarDays.map((cell, i) => {
            const dayGames = gamesMap.get(cell.dateStr) || [];
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDate;
            const dayOfWeek = i % 7;

            return (
              <div
                key={`${cell.dateStr}-${i}`}
                onClick={() =>
                  setSelectedDate(
                    cell.dateStr === selectedDate ? null : cell.dateStr
                  )
                }
                style={{
                  minHeight: 72,
                  padding: 6,
                  borderRight:
                    dayOfWeek < 6
                      ? "1px solid rgba(255,255,255,0.03)"
                      : "none",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  background: isSelected
                    ? "rgba(96,165,250,0.08)"
                    : isToday
                      ? "rgba(239,68,68,0.05)"
                      : "transparent",
                  transition: "background 0.12s",
                  opacity: cell.currentMonth ? 1 : 0.3,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday
                      ? "#ef4444"
                      : dayOfWeek === 0
                        ? "rgba(239,68,68,0.6)"
                        : dayOfWeek === 6
                          ? "rgba(96,165,250,0.6)"
                          : "rgba(255,255,255,0.5)",
                    marginBottom: 4,
                    textAlign: "right",
                    paddingRight: 4,
                  }}
                >
                  {isToday ? (
                    <span
                      style={{
                        display: "inline-block",
                        width: 22,
                        height: 22,
                        lineHeight: "22px",
                        borderRadius: "50%",
                        background: "#dc2626",
                        color: "#fff",
                        textAlign: "center",
                      }}
                    >
                      {cell.day}
                    </span>
                  ) : (
                    cell.day
                  )}
                </div>

                {dayGames.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 5px",
                      borderRadius: 5,
                      marginBottom: 2,
                      background: g.result
                        ? `${resultColors[g.result]}18`
                        : "rgba(96,165,250,0.1)",
                      color: g.result ? resultColors[g.result] : "#60a5fa",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.result && (
                      <span style={{ marginRight: 3 }}>
                        {g.result === "W"
                          ? "●"
                          : g.result === "L"
                            ? "○"
                            : "△"}
                      </span>
                    )}
                    {g.is_home ? "" : "@"}
                    {g.opponent}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 선택된 날짜 디테일 */}
      {selectedDate && (
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {selectedDate}
            </h3>
            <button
              onClick={() => openAddForm(selectedDate)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: "rgba(96,165,250,0.12)",
                color: "#60a5fa",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + {ko ? "이 날 경기 추가" : "Add game on this day"}
            </button>
          </div>

          {selectedGames.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              {ko ? "경기가 없습니다" : "No games"}
            </p>
          ) : (
            selectedGames.map((g) => (
              <div
                key={g.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  marginBottom: 6,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {g.result && (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: `${resultColors[g.result]}20`,
                        color: resultColors[g.result],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {g.result}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {g.is_home ? "vs" : "@"} {g.opponent}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.4)",
                        marginTop: 2,
                      }}
                    >
                      {g.time && `${g.time} · `}
                      {g.location && `${g.location} · `}
                      {g.is_home ? (ko ? "홈" : "Home") : ko ? "원정" : "Away"}
                      {g.score_us !== null &&
                        g.score_us !== undefined &&
                        g.score_them !== null &&
                        g.score_them !== undefined &&
                        ` · ${g.score_us}-${g.score_them}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => openEditForm(g)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {ko ? "수정" : "Edit"}
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "rgba(239,68,68,0.1)",
                      color: "#f87171",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {ko ? "삭제" : "Del"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 경기 추가/수정 모달 */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#141826",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 440,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 20px" }}>
              {editGame
                ? ko
                  ? "경기 수정"
                  : "Edit Game"
                : ko
                  ? "경기 추가"
                  : "Add Game"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>{ko ? "날짜" : "Date"}</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{ko ? "시간" : "Time"}</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  {ko ? "상대팀" : "Opponent"} *
                </label>
                <input
                  type="text"
                  value={form.opponent}
                  onChange={(e) =>
                    setForm({ ...form, opponent: e.target.value })
                  }
                  placeholder={ko ? "상대팀 이름" : "Opponent name"}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>{ko ? "장소" : "Location"}</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder={ko ? "경기 장소" : "Game location"}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  {ko ? "홈/원정" : "Home/Away"}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setForm({ ...form, is_home: v })}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: 8,
                        border:
                          form.is_home === v
                            ? "1px solid rgba(96,165,250,0.4)"
                            : "1px solid rgba(255,255,255,0.08)",
                        background:
                          form.is_home === v
                            ? "rgba(96,165,250,0.12)"
                            : "rgba(255,255,255,0.03)",
                        color:
                          form.is_home === v
                            ? "#60a5fa"
                            : "rgba(255,255,255,0.5)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {v
                        ? ko
                          ? "🏠 홈"
                          : "🏠 Home"
                        : ko
                          ? "✈️ 원정"
                          : "✈️ Away"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>{ko ? "결과" : "Result"}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "", label: ko ? "미정" : "TBD" },
                    { v: "W", label: ko ? "승" : "Win" },
                    { v: "L", label: ko ? "패" : "Loss" },
                    { v: "D", label: ko ? "무" : "Draw" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setForm({ ...form, result: opt.v })}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: 8,
                        border:
                          form.result === opt.v
                            ? `1px solid ${opt.v ? resultColors[opt.v] + "60" : "rgba(255,255,255,0.2)"}`
                            : "1px solid rgba(255,255,255,0.06)",
                        background:
                          form.result === opt.v
                            ? `${opt.v ? resultColors[opt.v] + "18" : "rgba(255,255,255,0.06)"}`
                            : "rgba(255,255,255,0.02)",
                        color:
                          form.result === opt.v
                            ? opt.v
                              ? resultColors[opt.v]
                              : "#e2e8f0"
                            : "rgba(255,255,255,0.4)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.result && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <label style={labelStyle}>
                      {ko ? "우리 점수" : "Our Score"}
                    </label>
                    <input
                      type="number"
                      value={form.score_us}
                      onChange={(e) =>
                        setForm({ ...form, score_us: e.target.value })
                      }
                      style={inputStyle}
                      min={0}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      {ko ? "상대 점수" : "Their Score"}
                    </label>
                    <input
                      type="number"
                      value={form.score_them}
                      onChange={(e) =>
                        setForm({ ...form, score_them: e.target.value })
                      }
                      style={inputStyle}
                      min={0}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>{ko ? "메모" : "Notes"}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 20,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowForm(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {ko ? "취소" : "Cancel"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.opponent.trim()}
                style={{
                  padding: "10px 24px",
                  borderRadius: 9,
                  border: "none",
                  background: form.opponent.trim()
                    ? "linear-gradient(135deg, #dc2626, #991b1b)"
                    : "rgba(255,255,255,0.05)",
                  color: form.opponent.trim()
                    ? "#fff"
                    : "rgba(255,255,255,0.2)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: form.opponent.trim() ? "pointer" : "not-allowed",
                }}
              >
                {ko ? "저장" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 다가오는 경기 목록 */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          {ko ? "다가오는 경기" : "Upcoming Games"}
        </h3>
        {(() => {
          const upcomingGames = games
            .filter((g) => g.date >= todayStr && !g.result)
            .slice(0, 5);

          if (upcomingGames.length === 0) {
            return (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
                {ko ? "예정된 경기가 없습니다" : "No upcoming games"}
              </p>
            );
          }

          return upcomingGames.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(96,165,250,0.1)",
                  color: "#60a5fa",
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {g.date.slice(5)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {g.is_home ? "vs" : "@"} {g.opponent}
                </div>
                {(g.time || g.location) && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      marginTop: 2,
                    }}
                  >
                    {g.time && `${g.time}`}
                    {g.time && g.location && " · "}
                    {g.location && g.location}
                  </div>
                )}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.5)",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(255,255,255,0.4)",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
