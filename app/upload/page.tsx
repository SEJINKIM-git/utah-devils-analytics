"use client";
import { useState, useRef } from "react";
import Link from "next/link";

type RosterPlayer = { number: number; name: string; position?: string; is_pitcher?: boolean };
type ConflictPlayer = RosterPlayer & { existingId: string; existingName: string; existingNumber: number };

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

function ConflictDialog({ conflicts, total, onOverwrite, onSkip, onCancel }: {
  conflicts: ConflictPlayer[]; total: number;
  onOverwrite: () => void; onSkip: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f1629", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 20, width: "100%", maxWidth: 500, overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg,rgba(234,179,8,0.15),rgba(234,179,8,0.05))", padding: "20px 24px", borderBottom: "1px solid rgba(234,179,8,0.15)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fef08a" }}>중복 선수 발견</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>전체 {total}명 중 <span style={{ color: "#fbbf24", fontWeight: 700 }}>{conflicts.length}명</span>이 이미 등록되어 있습니다</div>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", padding: "8px 0" }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 24px", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>기존</div><div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>#{c.existingNumber} {c.existingName}</div></div>
              <div style={{ color: "rgba(255,255,255,0.2)" }}>→</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>신규</div><div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>#{c.number || "?"} {c.name}</div></div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 24px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          · <span style={{ color: "#22c55e", fontWeight: 700 }}>덮어쓰기</span>: 이름·배번 업데이트 (통계 유지)<br />
          · <span style={{ color: "#60a5fa", fontWeight: 700 }}>겹치는 선수 제외</span>: 중복 건너뛰고 새 선수만 추가
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

/* ══ 초기화 확인 다이얼로그 ══ */
function ResetConfirmDialog({
  playerCount,
  filename,
  onConfirm,
  onCancel,
  loading,
}: {
  playerCount: number;
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState("");
  const required = "초기화";

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 20, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 32px 100px rgba(220,38,38,0.2)" }}>
        {/* 경고 헤더 */}
        <div style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.2), rgba(220,38,38,0.05))", padding: "24px 28px", borderBottom: "1px solid rgba(239,68,68,0.2)", textAlign: "center" as const }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fca5a5", letterSpacing: -0.5 }}>전체 데이터 초기화</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>이 작업은 되돌릴 수 없습니다</div>
        </div>

        <div style={{ padding: "20px 28px" }}>
          {/* 삭제될 내용 */}
          <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 10, letterSpacing: 0.5 }}>🗑 삭제될 데이터</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {[
                "모든 선수 정보 (players 테이블 전체)",
                "모든 타격 기록 (batting_stats 전체)",
                "모든 투구 기록 (pitching_stats 전체)",
                "업로드 기록 (roster_uploads 전체)",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                  <span style={{ color: "#f87171", fontSize: 10 }}>✕</span> {item}
                </div>
              ))}
            </div>
          </div>

          {/* 새로 등록될 내용 */}
          <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginBottom: 8, letterSpacing: 0.5 }}>✅ 초기화 후 등록</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{filename}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>선수 {playerCount}명 · 2026 시즌 빈 기록 생성</div>
          </div>

          {/* 확인 입력 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
              확인을 위해 아래에 <span style={{ color: "#fbbf24", fontWeight: 700 }}>"{required}"</span>을 입력하세요
            </div>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => e.key === "Enter" && typed === required && !loading && onConfirm()}
              placeholder={required}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${typed === required ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`, color: "#f1f5f9", fontSize: 14, outline: "none", boxSizing: "border-box" as const, fontWeight: 700, letterSpacing: 2 }}
              autoFocus
            />
          </div>

          {/* 버튼 */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              취소
            </button>
            <button
              onClick={onConfirm}
              disabled={typed !== required || loading}
              style={{
                flex: 2, padding: "12px", borderRadius: 10, border: "none",
                background: typed === required && !loading
                  ? "linear-gradient(135deg, #dc2626, #991b1b)"
                  : "rgba(239,68,68,0.15)",
                color: typed === required && !loading ? "#fff" : "rgba(255,255,255,0.25)",
                fontSize: 14, fontWeight: 800, cursor: typed === required && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {loading ? "⟳ 초기화 중..." : `🗑 전체 초기화 후 ${playerCount}명 등록`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══ 메인 페이지 ══ */
export default function UploadPage() {
  const [tab, setTab] = useState<"manual" | "file" | "reset">("manual");

  // 수동 입력
  const [manualText, setManualText] = useState("");
  const [preview, setPreview] = useState<RosterPlayer[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // 파일
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 초기화 탭
  const [resetTab, setResetTab] = useState<"manual" | "file">("file");
  const [resetManualText, setResetManualText] = useState("");
  const [resetFile, setResetFile] = useState<File | null>(null);
  const [resetDragOver, setResetDragOver] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetPreview, setResetPreview] = useState<RosterPlayer[]>([]);

  // 공통
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [conflict, setConflict] = useState<{ conflicts: ConflictPlayer[]; total: number; mode: "manual" | "file" } | null>(null);

  const Spinner = () => (
    <span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
  );

  /* ── 수동 미리보기 ── */
  const handlePreview = () => {
    const parsed = parseManualInput(manualText);
    setPreview(parsed);
    setShowPreview(true);
  };

  /* ── 수동 업로드 ── */
  const submitManual = async (overwrite: boolean, players?: RosterPlayer[]) => {
    const list = players ?? parseManualInput(manualText);
    if (list.length === 0) return;
    setLoading(true); setResult(null); setConflict(null);
    try {
      const fd = new FormData();
      fd.append("manual", JSON.stringify(list));
      fd.append("overwrite", String(overwrite));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.needsConfirm) {
        setConflict({ conflicts: data.conflicts, total: data.total, mode: "manual" });
      } else if (data.success) {
        setResult({ success: true, message: data.message });
        setManualText(""); setPreview([]); setShowPreview(false);
      } else {
        setResult({ success: false, message: data.error || "오류 발생" });
      }
    } finally { setLoading(false); }
  };

  const handleManualOverwrite = () => submitManual(true);
  const handleManualSkip = () => {
    if (!conflict) return;
    const conflictNames = new Set(conflict.conflicts.map(c => c.name));
    const filtered = parseManualInput(manualText).filter(p => !conflictNames.has(p.name));
    if (filtered.length === 0) { setConflict(null); setResult({ success: true, message: "중복 선수를 제외하면 추가할 선수가 없습니다" }); return; }
    submitManual(false, filtered);
  };

  /* ── 파일 업로드 ── */
  const handleFile = (f: File) => {
    if (f.name.match(/\.(xlsx|xls|csv)$/i)) { setFile(f); setResult(null); }
    else setResult({ success: false, message: "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다" });
  };

  const submitFile = async (overwrite: boolean, skipConflicts = false) => {
    if (!file) return;
    setLoading(true); setResult(null); setConflict(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("overwrite", String(overwrite));
      if (skipConflicts) fd.append("skipConflicts", "true");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.needsConfirm) {
        setConflict({ conflicts: data.conflicts, total: data.total, mode: "file" });
      } else if (data.success) {
        setResult({ success: true, message: data.message });
        setFile(null);
      } else {
        setResult({ success: false, message: data.error || "오류 발생" });
      }
    } finally { setLoading(false); }
  };

  /* ── 초기화 준비 ── */
  const handleResetPrepare = () => {
    if (resetTab === "manual") {
      const players = parseManualInput(resetManualText);
      if (players.length === 0) { setResult({ success: false, message: "선수 목록을 입력해주세요" }); return; }
      setResetPreview(players);
    } else {
      if (!resetFile) { setResult({ success: false, message: "파일을 선택해주세요" }); return; }
      setResetPreview([]);
    }
    setShowResetConfirm(true);
  };

  /* ── 초기화 실행 ── */
  const handleResetConfirm = async () => {
    setResetLoading(true);
    try {
      const fd = new FormData();
      fd.append("confirm", "RESET");
      if (resetTab === "manual") {
        fd.append("manual", JSON.stringify(parseManualInput(resetManualText)));
      } else if (resetFile) {
        fd.append("file", resetFile);
      }
      const res = await fetch("/api/reset", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message });
        setShowResetConfirm(false);
        setResetManualText(""); setResetFile(null); setResetPreview([]);
        setTab("manual"); // 완료 후 탭 이동
      } else {
        setResult({ success: false, message: data.error || "초기화 실패" });
        setShowResetConfirm(false);
      }
    } finally { setResetLoading(false); }
  };

  /* 초기화 탭 파일 드롭 */
  const handleResetFile = (f: File) => {
    if (f.name.match(/\.(xlsx|xls|csv)$/i)) { setResetFile(f); }
    else setResult({ success: false, message: "엑셀 파일만 가능합니다" });
  };

  /* ── 새 파일명 ── */
  const resetFilename = resetTab === "file" && resetFile
    ? resetFile.name
    : "직접 입력한 선수 명단";
  const resetPlayerCount = resetTab === "manual"
    ? parseManualInput(resetManualText).length
    : 0;

  const TABS = [
    { key: "manual", label: "✏️ 직접 입력" },
    { key: "file",   label: "📁 파일 업로드" },
    { key: "reset",  label: "🔄 전체 초기화" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* 충돌 다이얼로그 */}
      {conflict && (
        <ConflictDialog
          conflicts={conflict.conflicts}
          total={conflict.total}
          onOverwrite={conflict.mode === "manual" ? handleManualOverwrite : () => submitFile(true)}
          onSkip={conflict.mode === "manual" ? handleManualSkip : () => submitFile(false, true)}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* 초기화 확인 다이얼로그 */}
      {showResetConfirm && (
        <ResetConfirmDialog
          playerCount={resetTab === "manual" ? resetPlayerCount : (resetPreview.length || 0)}
          filename={resetFilename}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetConfirm(false)}
          loading={resetLoading}
        />
      )}

      {/* 헤더 */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>← 대시보드로 돌아가기</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📊 선수 등록 / 데이터 업로드</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>선수 등록 · 파일 업로드 · 전체 초기화</p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 40px" }}>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.07)" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setResult(null); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: tab === t.key
                  ? t.key === "reset" ? "rgba(220,38,38,0.2)" : "rgba(59,130,246,0.25)"
                  : "transparent",
                color: tab === t.key
                  ? t.key === "reset" ? "#f87171" : "#60a5fa"
                  : "rgba(255,255,255,0.35)",
                transition: "all 0.2s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 직접 입력 탭 ── */}
        {tab === "manual" && (
          <div>
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 8 }}>📝 입력 형식 (한 줄에 선수 한 명)</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 2, fontFamily: "monospace" }}>
                35 이호원&nbsp;&nbsp;&nbsp;&nbsp;→ 배번 + 이름<br />
                35 이호원 P&nbsp;&nbsp;→ 투수 표시<br />
                이호원&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ 이름만 (배번 미입력)
              </div>
            </div>
            <textarea
              value={manualText}
              onChange={e => { setManualText(e.target.value); setShowPreview(false); }}
              placeholder={"35 이호원\n82 황서현 P\n13 임희찬\n..."}
              rows={10}
              style={{ width: "100%", padding: "16px", borderRadius: 12, fontSize: 14, lineHeight: 1.8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" as const }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={handlePreview} disabled={!manualText.trim()} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: manualText.trim() ? "pointer" : "not-allowed" }}>
                🔍 미리보기
              </button>
              <button onClick={() => submitManual(false)} disabled={loading || !manualText.trim()} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: loading || !manualText.trim() ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading || !manualText.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <><Spinner /> 처리 중...</> : "📤 선수 등록하기"}
              </button>
            </div>
            {showPreview && preview.length > 0 && (
              <div style={{ marginTop: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>파싱 결과 — {preview.length}명</div>
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  {preview.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: p.is_pitcher ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: p.is_pitcher ? "#c084fc" : "#60a5fa" }}>{p.number || "?"}</div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{p.name}</span>
                      {p.is_pitcher && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(168,85,247,0.15)", color: "#c084fc", fontWeight: 700 }}>투수</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 파일 업로드 탭 ── */}
        {tab === "file" && (
          <div>
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 10 }}>📋 지원 엑셀 형식</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {[
                  { color: "#22c55e", label: "로스터 파일", desc: "시트명: 전체 / 타자 / 투수   |   열: 배번 | 이름" },
                  { color: "#eab308", label: "타격 기록 파일", desc: "시트명: 타자   |   열: 배번|이름|날짜|상대팀|타석|타수..." },
                  { color: "#f97316", label: "투구 기록 파일", desc: "시트명: 투수   |   열: 배번|이름|날짜|상대팀|승|패|이닝..." },
                ].map((item, i) => (
                  <div key={i} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? "#3b82f6" : file ? "#22c55e" : "rgba(255,255,255,0.1)"}`, borderRadius: 16, padding: "48px 24px", textAlign: "center" as const, cursor: "pointer", background: dragOver ? "rgba(59,130,246,0.06)" : file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", marginBottom: 16 }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
              {file ? (<><div style={{ fontSize: 40, marginBottom: 12 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{file.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div></>) : (<><div style={{ fontSize: 40, marginBottom: 12 }}>📁</div><div style={{ fontSize: 16, fontWeight: 600 }}>엑셀 파일을 드래그하거나 클릭하여 선택</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>.xlsx · .xls · .csv</div></>)}
            </div>
            {file && (
              <button onClick={() => submitFile(false)} disabled={loading} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: loading ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <><Spinner /> 업로드 중...</> : "📤 데이터 업로드하기"}
              </button>
            )}
          </div>
        )}

        {/* ── 전체 초기화 탭 ── */}
        {tab === "reset" && (
          <div>
            {/* 경고 배너 */}
            <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 14, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>🚨</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fca5a5", marginBottom: 6 }}>전체 데이터 초기화 모드</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                  기존의 <strong style={{ color: "#f87171" }}>모든 선수, 타격 기록, 투구 기록</strong>을 삭제하고<br />
                  새로운 선수 명단으로 처음부터 다시 시작합니다.<br />
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>새 시즌 시작 또는 데이터 전면 교체 시 사용하세요.</span>
                </div>
              </div>
            </div>

            {/* 새 명단 입력 방식 선택 */}
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10, letterSpacing: 0.5 }}>새로 등록할 선수 명단</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
              {(["file", "manual"] as const).map(t => (
                <button key={t} onClick={() => setResetTab(t)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: resetTab === t ? "rgba(220,38,38,0.2)" : "transparent", color: resetTab === t ? "#f87171" : "rgba(255,255,255,0.35)", transition: "all 0.2s" }}>
                  {t === "file" ? "📁 파일 선택" : "✏️ 직접 입력"}
                </button>
              ))}
            </div>

            {/* 파일 드롭 */}
            {resetTab === "file" && (
              <div
                onDragOver={e => { e.preventDefault(); setResetDragOver(true); }}
                onDragLeave={() => setResetDragOver(false)}
                onDrop={e => { e.preventDefault(); setResetDragOver(false); if (e.dataTransfer.files[0]) handleResetFile(e.dataTransfer.files[0]); }}
                onClick={() => resetInputRef.current?.click()}
                style={{ border: `2px dashed ${resetDragOver ? "#ef4444" : resetFile ? "#22c55e" : "rgba(220,38,38,0.3)"}`, borderRadius: 16, padding: "44px 24px", textAlign: "center" as const, cursor: "pointer", background: resetDragOver ? "rgba(220,38,38,0.06)" : resetFile ? "rgba(34,197,94,0.04)" : "rgba(220,38,38,0.03)", transition: "all 0.2s", marginBottom: 16 }}
              >
                <input ref={resetInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files?.[0]) handleResetFile(e.target.files[0]); }} style={{ display: "none" }} />
                {resetFile ? (
                  <><div style={{ fontSize: 36, marginBottom: 10 }}>✅</div><div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{resetFile.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{(resetFile.size / 1024).toFixed(1)} KB · 클릭하여 변경</div></>
                ) : (
                  <><div style={{ fontSize: 36, marginBottom: 10 }}>📁</div><div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>새 명단 파일을 드래그하거나 클릭하여 선택</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>.xlsx · .xls · .csv</div></>
                )}
              </div>
            )}

            {/* 직접 입력 */}
            {resetTab === "manual" && (
              <textarea
                value={resetManualText}
                onChange={e => setResetManualText(e.target.value)}
                placeholder={"35 이호원\n82 황서현 P\n13 임희찬\n..."}
                rows={10}
                style={{ width: "100%", padding: "16px", borderRadius: 12, fontSize: 14, lineHeight: 1.8, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.2)", color: "#f1f5f9", outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" as const, marginBottom: 16 }}
              />
            )}

            {/* 실행 버튼 */}
            <button
              onClick={handleResetPrepare}
              style={{
                width: "100%", padding: "15px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, rgba(220,38,38,0.9), rgba(153,27,27,0.9))",
                color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 4px 20px rgba(220,38,38,0.3)",
              }}
            >
              🗑 전체 초기화 후 새 명단으로 시작
            </button>
          </div>
        )}

        {/* 결과 메시지 */}
        {result && (
          <div style={{ marginTop: 20, padding: 20, borderRadius: 12, background: result.success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${result.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: result.success ? "#22c55e" : "#ef4444", marginBottom: 6 }}>
              {result.success ? "✅ 완료!" : "❌ 오류"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{result.message}</div>
            {result.success && (
              <Link href="/" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "#60a5fa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                → 대시보드에서 확인하기
              </Link>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}