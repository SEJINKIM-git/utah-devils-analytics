"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type UploadedFile = {
  id: string;
  filename: string;
  player_count: number;
  added_count: number;
  updated_count: number;
  source: "file" | "manual";
  players_snapshot: string; // JSON string
  uploaded_at: string;
};

type RosterPlayer = { number: number; name: string; position?: string; is_pitcher?: boolean };
type ConflictPlayer = RosterPlayer & { existingId: string; existingName: string; existingNumber: number };

/* ── 수동 입력 파서 ── */
function parseManualInput(raw: string): RosterPlayer[] {
  return raw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const tokens = line.split(/[\s,\t]+/);
    const is_pitcher = /[Pp]$/.test(line) || /투수/.test(line);
    const numIdx = tokens.findIndex(t => /^\d+$/.test(t));
    let number = 0, name = "";
    if (numIdx !== -1) {
      number = Number(tokens[numIdx]);
      name = tokens.filter((_, i) => i !== numIdx).join(" ").replace(/[Pp]$/, "").replace("투수", "").trim();
    } else {
      name = tokens.join(" ").replace(/[Pp]$/, "").replace("투수", "").trim();
    }
    return name ? { number, name, is_pitcher } : null;
  }).filter(Boolean) as RosterPlayer[];
}

/* ── 중복 확인 다이얼로그 ── */
function ConflictDialog({ conflicts, total, onOverwrite, onSkip, onCancel }: {
  conflicts: ConflictPlayer[]; total: number;
  onOverwrite: () => void; onSkip: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f1629", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg,rgba(234,179,8,0.15),rgba(234,179,8,0.05))", padding: "20px 24px", borderBottom: "1px solid rgba(234,179,8,0.15)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fef08a" }}>중복 선수 발견</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>전체 {total}명 중 <span style={{ color: "#fbbf24", fontWeight: 700 }}>{conflicts.length}명</span>이 이미 등록되어 있습니다</div>
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 0" }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 24px", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>기존</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>#{c.existingNumber} {c.existingName}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)" }}>→</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>신규</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>#{c.number || "?"} {c.name}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 24px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          · <span style={{ color: "#22c55e", fontWeight: 700 }}>덮어쓰기</span>: 이름·배번 업데이트 (통계 유지)<br />
          · <span style={{ color: "#60a5fa", fontWeight: 700 }}>겹치는 선수 제외</span>: 중복 제외 후 새 선수만 추가
        </div>
        <div style={{ display: "flex", gap: 10, padding: "16px 24px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
          <button onClick={onSkip} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>겹치는 선수 제외</button>
          <button onClick={onOverwrite} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "linear-gradient(135deg,#d97706,#b45309)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>덮어쓰기</button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 ── */
export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UploadedFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 재등록 모달
  const [reAddModal, setReAddModal] = useState<UploadedFile | null>(null);
  const [reAddLoading, setReAddLoading] = useState(false);
  const [conflict, setConflict] = useState<{ conflicts: ConflictPlayer[]; total: number; players: RosterPlayer[] } | null>(null);

  // 신규 추가 모달 (텍스트 입력)
  const [addModal, setAddModal] = useState(false);
  const [addText, setAddText] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addTab, setAddTab] = useState<"text" | "file">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const showToast = (type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchFiles = async () => {
    setLoading(true);
    const res = await fetch("/api/files");
    const data = await res.json();
    setFiles(data.files || []);
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, []);

  /* ── 파일 삭제 ── */
  const handleDelete = async (file: UploadedFile) => {
    setDeleting(file.id);
    setDeleteConfirm(null);
    const res = await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.id }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("ok", `"${file.filename}" 기록이 삭제됐습니다`);
      fetchFiles();
    } else {
      showToast("err", data.error || "삭제 실패");
    }
    setDeleting(null);
  };

  /* ── 재등록 (파일에 저장된 선수 목록으로 다시 등록) ── */
  const handleReAdd = async (players: RosterPlayer[], overwrite: boolean, skipConflicts?: boolean) => {
    setReAddLoading(true);
    setConflict(null);
    const fd = new FormData();
    fd.append("manual", JSON.stringify(players));
    fd.append("overwrite", String(overwrite));
    if (skipConflicts) {
      const conflictNames = new Set((conflict?.conflicts || []).map(c => c.name));
      const filtered = players.filter(p => !conflictNames.has(p.name));
      fd.set("manual", JSON.stringify(filtered));
    }
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.needsConfirm) {
      setConflict({ conflicts: data.conflicts, total: data.total, players });
    } else if (data.success) {
      showToast("ok", data.message);
      setReAddModal(null);
      fetchFiles();
    } else {
      showToast("err", data.error || "오류 발생");
    }
    setReAddLoading(false);
  };

  /* ── 신규 업로드 ── */
  const handleNewUpload = async (overwrite = false, skipConflicts = false, customPlayers?: RosterPlayer[]) => {
    setAddLoading(true);
    setConflict(null);

    const fd = new FormData();
    if (addTab === "text" || customPlayers) {
      const players = customPlayers ?? parseManualInput(addText);
      if (players.length === 0) { showToast("err", "선수 목록이 비어 있습니다"); setAddLoading(false); return; }
      fd.append("manual", JSON.stringify(players));
      fd.append("overwrite", String(overwrite));
    } else {
      if (!addFile) { setAddLoading(false); return; }
      fd.append("file", addFile);
      fd.append("overwrite", String(overwrite));
      if (skipConflicts) fd.append("skipConflicts", "true");
    }

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (data.needsConfirm) {
      const players = addTab === "text" ? parseManualInput(addText) : [];
      setConflict({ conflicts: data.conflicts, total: data.total, players });
    } else if (data.success) {
      showToast("ok", data.message);
      setAddModal(false); setAddText(""); setAddFile(null);
      fetchFiles();
    } else {
      showToast("err", data.error || "오류 발생");
    }
    setAddLoading(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 99999, padding: "12px 24px", borderRadius: 12, background: toast.type === "ok" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)", color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", whiteSpace: "nowrap" as const }}>
          {toast.type === "ok" ? "✅" : "❌"} {toast.text}
        </div>
      )}

      {/* 충돌 다이얼로그 */}
      {conflict && (
        <ConflictDialog
          conflicts={conflict.conflicts}
          total={conflict.total}
          onOverwrite={() => reAddModal ? handleReAdd(conflict.players, true) : handleNewUpload(true, false)}
          onSkip={() => reAddModal ? handleReAdd(conflict.players, false, true) : handleNewUpload(false, true)}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* 삭제 확인 */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0f1629", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 18, width: "100%", maxWidth: 380, padding: "28px 28px 24px", textAlign: "center" as const }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginBottom: 8 }}>파일 기록 삭제</div>
            <div style={{ fontSize: 14, color: "#fca5a5", fontWeight: 700, marginBottom: 6 }}>{deleteConfirm.filename}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 24, lineHeight: 1.6 }}>
              업로드 기록만 삭제됩니다.<br />이미 등록된 선수 데이터는 유지됩니다.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "linear-gradient(135deg,#dc2626,#991b1b)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 재등록 모달 */}
      {reAddModal && (() => {
        const players: RosterPlayer[] = JSON.parse(reAddModal.players_snapshot || "[]");
        return (
          <div onClick={() => setReAddModal(null)} style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#0f1629", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 20, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
              <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))", padding: "20px 24px", borderBottom: "1px solid rgba(59,130,246,0.12)" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#93c5fd" }}>🔄 선수 재등록</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>"{reAddModal.filename}" · {players.length}명을 2026 시즌에 다시 등록합니다</div>
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", padding: "8px 0" }}>
                {players.sort((a,b) => (a.number||999)-(b.number||999)).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 24px", borderBottom: "1px solid rgba(255,255,255,0.03)", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: p.is_pitcher ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: p.is_pitcher ? "#c084fc" : "#60a5fa", flexShrink: 0 }}>
                      {p.number || "?"}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{p.name}</span>
                    {p.is_pitcher && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(168,85,247,0.15)", color: "#c084fc", fontWeight: 700 }}>투수</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button onClick={() => setReAddModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={() => handleReAdd(players, false)} disabled={reAddLoading} style={{ flex: 2, padding: "11px", borderRadius: 10, background: reAddLoading ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: reAddLoading ? "not-allowed" : "pointer" }}>
                  {reAddLoading ? "처리 중..." : "⚾ 2026 시즌에 등록"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 신규 추가 모달 */}
      {addModal && (
        <div onClick={() => setAddModal(false)} style={{ position: "fixed", inset: 0, zIndex: 9997, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0f1629", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, width: "100%", maxWidth: 520, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.04))", padding: "20px 24px", borderBottom: "1px solid rgba(34,197,94,0.1)" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#86efac" }}>➕ 선수 목록 추가</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>직접 입력하거나 파일로 선수를 등록합니다</div>
            </div>

            <div style={{ padding: "16px 24px" }}>
              {/* 탭 */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
                {(["text","file"] as const).map(t => (
                  <button key={t} onClick={() => setAddTab(t)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: addTab === t ? "rgba(34,197,94,0.2)" : "transparent", color: addTab === t ? "#86efac" : "rgba(255,255,255,0.35)", transition: "all 0.2s" }}>
                    {t === "text" ? "✏️ 직접 입력" : "📁 파일"}
                  </button>
                ))}
              </div>

              {addTab === "text" ? (
                <textarea
                  value={addText}
                  onChange={e => setAddText(e.target.value)}
                  placeholder={"35 이호원\n82 황서현 P\n13 임희찬\n..."}
                  rows={8}
                  style={{ width: "100%", padding: "14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", fontSize: 13, lineHeight: 1.8, outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" as const }}
                />
              ) : (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: `2px dashed ${addFile ? "#22c55e" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "32px 20px", textAlign: "center" as const, cursor: "pointer", background: addFile ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)" }}
                  >
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files?.[0]) setAddFile(e.target.files[0]); }} style={{ display: "none" }} />
                    {addFile ? (
                      <><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{addFile.name}</div></>
                    ) : (
                      <><div style={{ fontSize: 32, marginBottom: 8 }}>📁</div><div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>클릭하여 파일 선택</div></>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, padding: "0 24px 20px" }}>
              <button onClick={() => setAddModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={() => handleNewUpload(false)} disabled={addLoading || (addTab === "text" ? !addText.trim() : !addFile)} style={{ flex: 2, padding: "11px", borderRadius: 10, background: addLoading ? "rgba(34,197,94,0.3)" : "linear-gradient(135deg,#16a34a,#15803d)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: addLoading ? "not-allowed" : "pointer" }}>
                {addLoading ? "처리 중..." : "📤 등록하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>← 대시보드로 돌아가기</Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📂 업로드 파일 관리</h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>선수 명단 업로드 기록 · 재등록 및 삭제 가능</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAddModal(true)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ➕ 새 명단 추가
              </button>
              <Link href="/upload" style={{ padding: "9px 18px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                📊 데이터 업로드
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center" as const, padding: "80px 0", color: "rgba(255,255,255,0.3)", fontSize: 15 }}>⟳ 불러오는 중...</div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "80px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>업로드 기록이 없습니다</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginBottom: 28 }}>선수 명단을 업로드하면 여기에 표시됩니다</div>
            <button onClick={() => setAddModal(true)} style={{ padding: "11px 24px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ➕ 첫 번째 명단 추가하기
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            {files.map((f) => {
              const players: RosterPlayer[] = JSON.parse(f.players_snapshot || "[]");
              const isExpanded = expandedId === f.id;
              return (
                <div key={f.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden", transition: "border-color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}
                >
                  {/* 파일 카드 헤더 */}
                  <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                    {/* 아이콘 */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: f.source === "manual" ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                      {f.source === "manual" ? "✏️" : "📄"}
                    </div>

                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{f.filename}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                        <span>🗓 {formatDate(f.uploaded_at)}</span>
                        <span>👥 {f.player_count}명</span>
                        {f.added_count > 0 && <span style={{ color: "#4ade80" }}>+{f.added_count}명 추가</span>}
                        {f.updated_count > 0 && <span style={{ color: "#fbbf24" }}>↻{f.updated_count}명 업데이트</span>}
                        <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, background: f.source === "manual" ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)", color: f.source === "manual" ? "#c084fc" : "#60a5fa", fontWeight: 700 }}>
                          {f.source === "manual" ? "직접입력" : "파일"}
                        </span>
                      </div>
                    </div>

                    {/* 버튼 */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : f.id)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        {isExpanded ? "▲ 접기" : "▼ 목록"}
                      </button>
                      <button
                        onClick={() => setReAddModal(f)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.25)", background: "rgba(59,130,246,0.1)", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        🔄 재등록
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(f)}
                        disabled={deleting === f.id}
                        style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 14, cursor: deleting === f.id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {deleting === f.id ? "⟳" : "🗑"}
                      </button>
                    </div>
                  </div>

                  {/* 선수 목록 (펼쳐질 때) */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, padding: "14px 20px" }}>
                        {players.sort((a,b) => (a.number||999)-(b.number||999)).map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: p.is_pitcher ? "rgba(168,85,247,0.2)" : "rgba(220,38,38,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: p.is_pitcher ? "#c084fc" : "#f87171", flexShrink: 0 }}>
                              {p.number || "?"}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{p.name}</div>
                              {p.is_pitcher && <div style={{ fontSize: 9, color: "#c084fc", fontWeight: 700 }}>투수</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}