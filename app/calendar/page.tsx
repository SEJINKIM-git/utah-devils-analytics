"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ScheduleItem = {
  id: string;
  title: string;
  opponent: string;
  date: string;
  time: string;
  location: string;
  category: "league" | "practice" | "scrimmage" | "event";
  home: boolean;
  memo: string;
};

const STORAGE_KEY = "utah-devils-schedule-v2";

const seedSchedule: ScheduleItem[] = [
  {
    id: "spring-2026-02-23-recruit",
    title: "Recruitment 시작",
    opponent: "",
    date: "2026-02-23",
    time: "09:00",
    location: "",
    category: "event",
    home: true,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-03-03-semester",
    title: "개강",
    opponent: "",
    date: "2026-03-03",
    time: "09:00",
    location: "",
    category: "event",
    home: true,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-03-10-clubfair",
    title: "Club Fair",
    opponent: "",
    date: "2026-03-10",
    time: "11:00",
    location: "",
    category: "event",
    home: true,
    memo: "주간 일정 시트 3월 2주 기준",
  },
  {
    id: "spring-2026-03-13-recruit-end",
    title: "Recruitment 마감",
    opponent: "",
    date: "2026-03-13",
    time: "18:00",
    location: "",
    category: "event",
    home: true,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-03-16-interview",
    title: "Interview",
    opponent: "",
    date: "2026-03-16",
    time: "18:00",
    location: "",
    category: "event",
    home: true,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-03-17-recruit",
    title: "모집",
    opponent: "",
    date: "2026-03-17",
    time: "18:00",
    location: "",
    category: "event",
    home: true,
    memo: "주간 일정 시트의 3월 17-18일 (모집) 반영",
  },
  {
    id: "spring-2026-03-18-recruit",
    title: "모집",
    opponent: "",
    date: "2026-03-18",
    time: "18:00",
    location: "",
    category: "event",
    home: true,
    memo: "주간 일정 시트의 3월 17-18일 (모집) 반영",
  },
  {
    id: "spring-2026-03-20-orientation",
    title: "Orientation",
    opponent: "",
    date: "2026-03-20",
    time: "17:00",
    location: "",
    category: "event",
    home: true,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-03-20-ot",
    title: "OT",
    opponent: "",
    date: "2026-03-20",
    time: "15:00",
    location: "",
    category: "event",
    home: true,
    memo: "주간 일정 시트의 3월 20일 (OT) 반영",
  },
  {
    id: "spring-2026-03-20-practice",
    title: "훈련",
    opponent: "",
    date: "2026-03-20",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트에서 숫자 날짜로 표기",
  },
  {
    id: "spring-2026-03-23-practice",
    title: "훈련",
    opponent: "",
    date: "2026-03-23",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 3월 4주 기준",
  },
  {
    id: "spring-2026-03-27-practice",
    title: "훈련",
    opponent: "",
    date: "2026-03-27",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 3월 4주 기준",
  },
  {
    id: "spring-2026-04-03-game1",
    title: "GAME 1",
    opponent: "",
    date: "2026-04-03",
    time: "14:00",
    location: "",
    category: "league",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-04-06-practice",
    title: "훈련",
    opponent: "",
    date: "2026-04-06",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 4월 2주 기준",
  },
  {
    id: "spring-2026-04-10-mt",
    title: "MT",
    opponent: "",
    date: "2026-04-10",
    time: "10:00",
    location: "",
    category: "event",
    home: false,
    memo: "주간 일정 시트 4월 2주 기준",
  },
  {
    id: "spring-2026-04-11-mt",
    title: "MT",
    opponent: "",
    date: "2026-04-11",
    time: "10:00",
    location: "",
    category: "event",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-04-13-practice",
    title: "훈련",
    opponent: "",
    date: "2026-04-13",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 4월 3주 기준",
  },
  {
    id: "spring-2026-04-17-game2",
    title: "GAME 2",
    opponent: "",
    date: "2026-04-17",
    time: "14:00",
    location: "",
    category: "league",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-04-20-practice",
    title: "훈련",
    opponent: "",
    date: "2026-04-20",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 4월 4주 기준",
  },
  {
    id: "spring-2026-04-24-practice",
    title: "훈련",
    opponent: "",
    date: "2026-04-24",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 4월 4주 기준",
  },
  {
    id: "spring-2026-04-27-practice",
    title: "훈련",
    opponent: "",
    date: "2026-04-27",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 4월 5주 기준",
  },
  {
    id: "spring-2026-05-01-game3",
    title: "GAME 3",
    opponent: "",
    date: "2026-05-01",
    time: "14:00",
    location: "",
    category: "league",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-05-08-practice",
    title: "훈련",
    opponent: "",
    date: "2026-05-08",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 5월 1주 기준",
  },
  {
    id: "spring-2026-05-11-practice",
    title: "훈련",
    opponent: "",
    date: "2026-05-11",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 5월 2주 기준",
  },
  {
    id: "spring-2026-05-15-game4",
    title: "GAME 4",
    opponent: "",
    date: "2026-05-15",
    time: "14:00",
    location: "",
    category: "league",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-05-18-practice",
    title: "훈련",
    opponent: "",
    date: "2026-05-18",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 5월 3주 기준",
  },
  {
    id: "spring-2026-05-22-practice",
    title: "훈련",
    opponent: "",
    date: "2026-05-22",
    time: "19:00",
    location: "",
    category: "practice",
    home: true,
    memo: "주간 일정 시트 5월 3주 기준",
  },
  {
    id: "spring-2026-05-29-game5",
    title: "GAME 5",
    opponent: "",
    date: "2026-05-29",
    time: "14:00",
    location: "",
    category: "league",
    home: false,
    memo: "일자별 일정 시트 표기 그대로 반영",
  },
  {
    id: "spring-2026-06-05-game-rain",
    title: "GAME (예비일)",
    opponent: "",
    date: "2026-06-05",
    time: "14:00",
    location: "",
    category: "scrimmage",
    home: false,
    memo: "주간 일정 시트 6월 1주 기준",
  },
];

const weekLabels = ["일", "월", "화", "수", "목", "금", "토"];

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatKoreanDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일 (${weekLabels[parsed.getDay()]})`;
}

function getCategoryStyle(category: ScheduleItem["category"]) {
  if (category === "league") return { label: "리그", bg: "rgba(239,68,68,0.12)", color: "#f87171" };
  if (category === "practice") return { label: "훈련", bg: "rgba(59,130,246,0.12)", color: "#60a5fa" };
  if (category === "event") return { label: "행사", bg: "rgba(168,85,247,0.12)", color: "#c084fc" };
  return { label: "연습경기", bg: "rgba(34,197,94,0.12)", color: "#4ade80" };
}

function buildCalendarCells(baseMonth: Date) {
  const firstDay = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const lastDay = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0);
  const cells: Array<{ date: Date; currentMonth: boolean }> = [];

  const prefix = firstDay.getDay();
  for (let offset = prefix; offset > 0; offset -= 1) {
    cells.push({
      date: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1 - offset),
      currentMonth: false,
    });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push({
      date: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), day),
      currentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const nextIndex = cells.length - (prefix + lastDay.getDate()) + 1;
    cells.push({
      date: new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, nextIndex),
      currentMonth: false,
    });
  }

  return cells;
}

function buildICS(items: ScheduleItem[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Devils Insight AI//Team Calendar//KO",
    ...items.flatMap((item) => {
      const stamp = `${item.date.replaceAll("-", "")}T${item.time.replace(":", "")}00`;
      const endHour = String(Math.min(Number(item.time.split(":")[0]) + 2, 23)).padStart(2, "0");
      const endStamp = `${item.date.replaceAll("-", "")}T${endHour}${item.time.split(":")[1]}00`;

      return [
        "BEGIN:VEVENT",
        `UID:${item.id}@utah-devils`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${stamp}`,
        `DTEND:${endStamp}`,
        `SUMMARY:${item.title} - ${item.opponent}`,
        `LOCATION:${item.location}`,
        `DESCRIPTION:${item.memo || "Devils Insight AI team schedule"}`,
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];

  return lines.join("\n");
}

export default function CalendarPage() {
  const [items, setItems] = useState<ScheduleItem[]>(seedSchedule);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateValue(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ScheduleItem, "id">>({
    title: "새 일정",
    opponent: "",
    date: toDateValue(new Date()),
    time: "10:00",
    location: "",
    category: "league",
    home: true,
    memo: "",
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setItems(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    setCurrentMonth(new Date(`${selectedDate}T00:00:00`));
  }, [selectedDate]);

  useEffect(() => {
    if (editingId) return;
    setForm((prev) => ({ ...prev, date: selectedDate }));
  }, [selectedDate, editingId]);

  const monthKey = toMonthKey(currentMonth);
  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const monthItems = useMemo(
    () => items.filter((item) => item.date.startsWith(monthKey)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [items, monthKey],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => item.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [items, selectedDate],
  );

  const upcomingItems = useMemo(
    () => [...items].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 5),
    [items],
  );

  function changeMonth(direction: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  }

  function addSchedule() {
    if (!form.title.trim()) return;

    const normalizedItem: ScheduleItem = {
      ...form,
      id: editingId || `${form.date}-${form.time}-${Date.now()}`,
      title: form.title.trim(),
      opponent: form.opponent.trim(),
      location: form.location.trim(),
      memo: form.memo.trim(),
    };

    const nextItems = (editingId
      ? items.map((item) => (item.id === editingId ? normalizedItem : item))
      : [...items, normalizedItem]
    ).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    setItems(nextItems);
    setSelectedDate(form.date);
    setEditingId(null);
    setForm((prev) => ({ ...prev, title: "새 일정", opponent: "", location: "", memo: "" }));
  }

  function removeSchedule(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm((prev) => ({ ...prev, title: "새 일정", opponent: "", location: "", memo: "" }));
    }
  }

  function startEditing(item: ScheduleItem) {
    setEditingId(item.id);
    setSelectedDate(item.date);
    setForm({
      title: item.title,
      opponent: item.opponent,
      date: item.date,
      time: item.time,
      location: item.location,
      category: item.category,
      home: item.home,
      memo: item.memo,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm((prev) => ({
      ...prev,
      title: "새 일정",
      opponent: "",
      date: selectedDate,
      time: "10:00",
      location: "",
      category: "league",
      home: true,
      memo: "",
    }));
  }

  function downloadCalendar() {
    const blob = new Blob([buildICS(items)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "utah-devils-schedule.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(239,68,68,0.12), transparent 36%), radial-gradient(circle at top right, rgba(59,130,246,0.13), transparent 38%), #0a0e17",
        color: "#e2e8f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(15,23,42,0.78)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="calendar-shell" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 24px" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            ← 대시보드로 돌아가기
          </Link>
          <div className="calendar-hero" style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
            <div style={{ maxWidth: 720 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,0.12)",
                  color: "#86efac",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                SCHEDULE BOARD
              </div>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, margin: "14px 0 10px 0" }}>경기 일정 캘린더</h1>
              <p style={{ margin: 0, color: "rgba(226,232,240,0.68)", fontSize: 15, lineHeight: 1.7 }}>
                월간 일정 확인, 경기 추가/삭제, 날짜별 상세 확인, iCal 내보내기를 한 화면에서 처리할 수 있도록
                구성했습니다. 모바일에서도 일정 등록이 가능하게 단일 컬럼으로 자연스럽게 접힙니다.
              </p>
            </div>
            <div
              style={{
                minWidth: 260,
                padding: 18,
                borderRadius: 18,
                background: "linear-gradient(135deg, rgba(30,41,59,0.88), rgba(15,23,42,0.95))",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginBottom: 8 }}>이번 달 일정</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80" }}>{monthItems.length}건</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                선택 날짜 {formatKoreanDate(selectedDate)} / 전체 저장 {items.length}건
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-shell" style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 48px" }}>
        <div className="calendar-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20 }}>
          <section
            style={{
              borderRadius: 22,
              border: "1px solid rgba(148,163,184,0.12)",
              background: "rgba(15,23,42,0.74)",
              padding: 22,
            }}
          >
            <div
              className="calendar-toolbar"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>MONTH VIEW</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => changeMonth(-1)}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(15,23,42,0.88)",
                    color: "#cbd5e1",
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  이전 달
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(15,23,42,0.88)",
                    color: "#cbd5e1",
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  이번 달
                </button>
                <button
                  onClick={() => changeMonth(1)}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(15,23,42,0.88)",
                    color: "#cbd5e1",
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  다음 달
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, marginBottom: 8 }}>
              {weekLabels.map((label) => (
                <div
                  key={label}
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.38)",
                    padding: "6px 0",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
              {calendarCells.map((cell) => {
                const isoDate = toDateValue(cell.date);
                const dayItems = items.filter((item) => item.date === isoDate);
                const isToday = isoDate === toDateValue(new Date());
                const isSelected = isoDate === selectedDate;

                return (
                  <button
                    key={isoDate}
                    onClick={() => setSelectedDate(isoDate)}
                    style={{
                      minHeight: 112,
                      borderRadius: 16,
                      border: isSelected
                        ? "1px solid rgba(96,165,250,0.45)"
                        : "1px solid rgba(148,163,184,0.1)",
                      background: isSelected
                        ? "rgba(37,99,235,0.12)"
                        : cell.currentMonth
                          ? "rgba(15,23,42,0.92)"
                          : "rgba(15,23,42,0.45)",
                      padding: 10,
                      textAlign: "left",
                      cursor: "pointer",
                      color: cell.currentMonth ? "#e2e8f0" : "rgba(255,255,255,0.28)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 800,
                          background: isToday ? "rgba(239,68,68,0.18)" : "transparent",
                          color: isToday ? "#fca5a5" : "inherit",
                        }}
                      >
                        {cell.date.getDate()}
                      </span>
                      {dayItems.length > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 6px",
                            borderRadius: 999,
                            background: "rgba(34,197,94,0.12)",
                            color: "#4ade80",
                            fontWeight: 700,
                          }}
                        >
                          {dayItems.length}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                      {dayItems.slice(0, 2).map((item) => {
                        const badge = getCategoryStyle(item.category);
                        return (
                          <div
                            key={item.id}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 10,
                              background: badge.bg,
                              color: badge.color,
                              fontSize: 11,
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.time} {item.opponent}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ display: "grid", gap: 20, alignContent: "start" }}>
            <div
              style={{
                borderRadius: 22,
                border: "1px solid rgba(148,163,184,0.12)",
                background: "rgba(15,23,42,0.74)",
                padding: 22,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>DAY DETAIL</div>
                  <h2 style={{ margin: "4px 0 0 0", fontSize: 20 }}>{formatKoreanDate(selectedDate)}</h2>
                </div>
                <button
                  onClick={downloadCalendar}
                  style={{
                    border: "none",
                    borderRadius: 12,
                    padding: "10px 14px",
                    background: "linear-gradient(135deg, #16a34a, #0ea5e9)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  .ics 내보내기
                </button>
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {selectedItems.length === 0 && (
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: "rgba(2,8,23,0.4)",
                      color: "rgba(255,255,255,0.36)",
                      fontSize: 13,
                    }}
                  >
                    선택한 날짜에는 등록된 일정이 없습니다.
                  </div>
                )}

                {selectedItems.map((item) => {
                  const badge = getCategoryStyle(item.category);
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        border: "1px solid rgba(148,163,184,0.08)",
                        background: "rgba(2,8,23,0.38)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                background: badge.bg,
                                color: badge.color,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {badge.label}
                            </span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                              {item.home ? "HOME" : "AWAY"}
                            </span>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 17, fontWeight: 800 }}>
                            {item.opponent ? `${item.title} vs ${item.opponent}` : item.title}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => startEditing(item)}
                            style={{
                              border: "1px solid rgba(96,165,250,0.22)",
                              borderRadius: 10,
                              background: "rgba(30,64,175,0.18)",
                              color: "#93c5fd",
                              padding: "8px 10px",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => removeSchedule(item.id)}
                            style={{
                              border: "1px solid rgba(248,113,113,0.22)",
                              borderRadius: 10,
                              background: "rgba(127,29,29,0.2)",
                              color: "#fca5a5",
                              padding: "8px 10px",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                        {[item.time, item.location].filter(Boolean).join(" · ") || "시간/장소 미정"}
                        {item.memo ? <br /> : null}
                        {item.memo || "추가 메모 없음"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                borderRadius: 22,
                border: "1px solid rgba(148,163,184,0.12)",
                background: "rgba(15,23,42,0.74)",
                padding: 22,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>{editingId ? "일정 수정" : "일정 추가"}</h3>
                {editingId && (
                  <button
                    onClick={cancelEditing}
                    style={{
                      border: "1px solid rgba(148,163,184,0.16)",
                      borderRadius: 10,
                      background: "rgba(15,23,42,0.88)",
                      color: "#cbd5e1",
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    수정 취소
                  </button>
                )}
              </div>
              <div className="calendar-form-grid" style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="제목"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,8,23,0.48)",
                    color: "#e2e8f0",
                    padding: "12px 14px",
                  }}
                />
                <input
                  value={form.opponent}
                  onChange={(event) => setForm((prev) => ({ ...prev, opponent: event.target.value }))}
                  placeholder="상대 팀 또는 대상 (선택)"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,8,23,0.48)",
                    color: "#e2e8f0",
                    padding: "12px 14px",
                  }}
                />
                <div className="calendar-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.14)",
                      background: "rgba(2,8,23,0.48)",
                      color: "#e2e8f0",
                      padding: "12px 14px",
                    }}
                  />
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.14)",
                      background: "rgba(2,8,23,0.48)",
                      color: "#e2e8f0",
                      padding: "12px 14px",
                    }}
                  />
                </div>
                <input
                  value={form.location}
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="장소 (선택)"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,8,23,0.48)",
                    color: "#e2e8f0",
                    padding: "12px 14px",
                  }}
                />
                <div className="calendar-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        category: event.target.value as ScheduleItem["category"],
                      }))
                    }
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.14)",
                      background: "rgba(2,8,23,0.48)",
                      color: "#e2e8f0",
                      padding: "12px 14px",
                    }}
                  >
                    <option value="league">리그 경기</option>
                    <option value="practice">훈련</option>
                    <option value="scrimmage">연습 경기</option>
                    <option value="event">행사</option>
                  </select>
                  <select
                    value={form.home ? "home" : "away"}
                    onChange={(event) => setForm((prev) => ({ ...prev, home: event.target.value === "home" }))}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.14)",
                      background: "rgba(2,8,23,0.48)",
                      color: "#e2e8f0",
                      padding: "12px 14px",
                    }}
                  >
                    <option value="home">홈</option>
                    <option value="away">원정</option>
                  </select>
                </div>
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                  placeholder="메모"
                  rows={3}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(2,8,23,0.48)",
                    color: "#e2e8f0",
                    padding: "12px 14px",
                    resize: "vertical",
                  }}
                />
                <button
                  onClick={addSchedule}
                  style={{
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "linear-gradient(135deg, #2563eb, #16a34a)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {editingId ? "수정 저장" : "일정 저장"}
                </button>
              </div>
            </div>

            <div
              style={{
                borderRadius: 22,
                border: "1px solid rgba(148,163,184,0.12)",
                background: "rgba(15,23,42,0.74)",
                padding: 22,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>다가오는 일정</h3>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {upcomingItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "rgba(2,8,23,0.4)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginTop: 4 }}>
                        {formatKoreanDate(item.date)} · {item.time}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "#93c5fd" }}>{item.opponent}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1080px) {
          .calendar-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 840px) {
          .calendar-hero,
          .calendar-toolbar,
          .calendar-form-row {
            flex-direction: column;
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
          }
        }

        @media (max-width: 640px) {
          .calendar-shell {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
