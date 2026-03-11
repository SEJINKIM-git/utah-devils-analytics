"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Player = {
  id: string;
  number: number;
  name: string;
  position?: string | null;
  is_pitcher?: boolean | null;
};

export default function PlayerManager({
  players,
  lang = "ko",
}: {
  players: Player[];
  lang?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 추가 폼
  const [form, setForm] = useState({ number: "", name: "", position: "", is_pitcher: false });

  const showMsg = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleAdd = async () => {
    if (!form.number || !form.name.trim()) {
      showMsg("err", lang === "ko" ? "배번과 이름을 입력해주세요" : "Number and name required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: Number(form.number),
          name: form.name.trim(),
          position: form.position || null,
          is_pitcher: form.is_pitcher,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg("err", data.error || "오류 발생");
      } else {
        showMsg("ok", lang === "ko" ? `${form.name} 선수가 추가되었습니다` : `${form.name} added`);
        setForm({ number: "", name: "", position: "", is_pitcher: false });
        startTransition(() => router.refresh());
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (player: Player) => {
    setDeleting(player.id);
    setConfirmDelete(null);
    try {
      const res = await fetch("/api/players", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg("err", data.error || "삭제 실패");
      } else {
        showMsg("ok", lang === "ko" ? `${player.name} 선수가 삭제되었습니다` : `${player.name} deleted`);
        startTransition(() => router.refresh());
      }
    } finally {
      setDeleting(null);
    }
  };

  const sorted = [...players].sort((a, b) => a.number - b.number);

  return (
    <>
      {/* 선수 관리 버튼 */}
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          background: "rgba(220,38,38,0.15)",
          color: "#f87171",
          border: "1px solid rgba(220,38,38,0.3)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        👥 {lang === "ko" ? "선수 관리" : "Manage Players"}
      </button>

      {/* 토스트 메시지 */}
      {msg && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            padding: "12px 24px",
            borderRadius: 12,
            background: msg.type === "ok" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
          }}
        >
          {msg.type === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1f35",
              border: "1px solid rgba(220,38,38,0.4)",
              borderRadius: 16,
              padding: "28px 32px",
              width: 340,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
              {lang === "ko" ? "선수를 삭제하시겠습니까?" : "Delete this player?"}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
              #{confirmDelete.number} {confirmDelete.name}
            </div>
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 24 }}>
              {lang === "ko"
                ? "선수의 모든 기록(타격·투구 통계)이 함께 삭제됩니다."
                : "All stats will be permanently deleted."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                {lang === "ko" ? "취소" : "Cancel"}
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10,
                  background: "rgba(239,68,68,0.9)",
                  border: "none",
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                {lang === "ko" ? "삭제" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 패널 */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f1629",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            {/* 헤더 */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "linear-gradient(135deg, #141b3d, #0f1629)",
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9" }}>
                  👥 {lang === "ko" ? "선수 관리" : "Player Management"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {lang === "ko" ? `총 ${players.length}명 등록` : `${players.length} players`}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)", fontSize: 16,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* 선수 추가 폼 */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(59,130,246,0.04)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 10, letterSpacing: 0.5 }}>
                ＋ {lang === "ko" ? "신규 선수 추가" : "ADD NEW PLAYER"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <input
                  type="number"
                  placeholder={lang === "ko" ? "배번" : "#"}
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                  style={{
                    width: 72, padding: "9px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#f1f5f9", fontSize: 13, outline: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder={lang === "ko" ? "이름" : "Name"}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  style={{
                    flex: 1, minWidth: 100, padding: "9px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#f1f5f9", fontSize: 13, outline: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder={lang === "ko" ? "포지션 (선택)" : "POS (opt)"}
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  style={{
                    width: 110, padding: "9px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#f1f5f9", fontSize: 13, outline: "none",
                  }}
                />
                <label
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "9px 12px", borderRadius: 8,
                    background: form.is_pitcher ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${form.is_pitcher ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.1)"}`,
                    cursor: "pointer", fontSize: 12, color: form.is_pitcher ? "#c084fc" : "rgba(255,255,255,0.4)",
                    fontWeight: 600, userSelect: "none" as const,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.is_pitcher}
                    onChange={(e) => setForm((f) => ({ ...f, is_pitcher: e.target.checked }))}
                    style={{ display: "none" }}
                  />
                  ⚾ {lang === "ko" ? "투수" : "Pitcher"}
                </label>
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  style={{
                    padding: "9px 18px", borderRadius: 8,
                    background: adding ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: adding ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {adding ? "..." : lang === "ko" ? "추가" : "Add"}
                </button>
              </div>
            </div>

            {/* 선수 목록 */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {sorted.map((player) => (
                <div
                  key={player.id}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "12px 24px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* 배번 */}
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: player.is_pitcher ? "rgba(168,85,247,0.15)" : "rgba(220,38,38,0.12)",
                      border: `1px solid ${player.is_pitcher ? "rgba(168,85,247,0.3)" : "rgba(220,38,38,0.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800,
                      color: player.is_pitcher ? "#c084fc" : "#f87171",
                      marginRight: 14, flexShrink: 0,
                    }}
                  >
                    {player.number}
                  </div>

                  {/* 이름 & 포지션 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
                      {player.name}
                    </div>
                    {(player.position || player.is_pitcher) && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        {player.position || (player.is_pitcher ? (lang === "ko" ? "투수" : "Pitcher") : "")}
                      </div>
                    )}
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={() => setConfirmDelete(player)}
                    disabled={deleting === player.id}
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      color: deleting === player.id ? "rgba(255,255,255,0.2)" : "#f87171",
                      fontSize: 14, cursor: deleting === player.id ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (deleting !== player.id) {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.2)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.15)";
                    }}
                    title={lang === "ko" ? "선수 삭제" : "Delete player"}
                  >
                    {deleting === player.id ? "⟳" : "✕"}
                  </button>
                </div>
              ))}
            </div>

            {/* 푸터 */}
            <div
              style={{
                padding: "12px 24px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11, color: "rgba(255,255,255,0.25)",
                textAlign: "center" as const,
              }}
            >
              {lang === "ko"
                ? "선수 삭제 시 해당 선수의 모든 타격·투구 기록이 함께 삭제됩니다"
                : "Deleting a player will remove all their batting and pitching stats"}
            </div>
          </div>
        </div>
      )}
    </>
  );
}