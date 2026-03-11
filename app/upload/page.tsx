"use client";
import { useState, useRef } from "react";
import Link from "next/link";

/* ─── 타입 ─────────────────────────────────────── */
type RosterPlayer = { number: number; name: string; position?: string; is_pitcher?: boolean };
type ConflictPlayer = RosterPlayer & { existingId: string; existingName: string; existingNumber: number };

/* ─── 수동 입력 파서
   지원 형식:
   "35 이호원"  /  "35 이호원 P(투수)"  /  "이호원 35"  /  "이호원"(배번없음)
──────────────────────────────────────────────────── */
function parseManualInput(raw: string): RosterPlayer[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: RosterPlayer[] = [];
  for (const line of lines) {
    const tokens = line.split(/[\s,\t]+/);
    let number = 0, name = "", is_pitcher = false, position = "";
    // 투수 플래그
    if (/[Pp]$/.test(line) || /투수/.test(line)) is_pitcher = true;
    // 배번 찾기
    const numIdx = tokens.findIndex((t) => /^\d+$/.test(t));
    if (numIdx !== -1) {
      number = Number(tokens[numIdx]);
      name = tokens.filter((_, i) => i !== numIdx).join(" ").replace(/[Pp]$/, "").replace("투수", "").trim();
    } else {
      name = tokens.join(" ").replace(/[Pp]$/, "").replace("투수", "").trim();
    }
    if (!name) continue;
    result.push({ number, name, position: position || undefined, is_pitcher });
  }
  return result;
}

/* ─── 확인 다이얼로그 ─────────────────────────────── */
function ConflictDialog({
  conflicts,
  total,
  onOverwrite,
  onSkip,
  onCancel,
}: {
  conflicts: ConflictPlayer[];
  total: number;
  onOverwrite: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#0f1629", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 20, width: "100%", maxWidth: 500, boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}
      >
        {/* 헤더 */}
        <div style={{ background: "linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))", padding: "20px 24px", borderBottom: "1px solid rgba(234,179,8,0.15)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fef08a" }}>중복 선수 발견</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            전체 {total}명 중 <span style={{ color: "#fbbf24", fontWeight: 700 }}>{conflicts.length}명</span>이 이미 등록되어 있습니다
          </div>
        </div>

        {/* 충돌 목록 */}
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "12px 0" }}>
          {conflicts.map((c, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", padding: "9px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 12 }}
            >
              {/* 기존 */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>기존</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
                  #{c.existingNumber} {c.existingName}
                </div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 16 }}>→</div>
              {/* 신규 */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>신규</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
                  #{c.number || "?"} {c.name}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 안내 */}
        <div style={{ padding: "12px 24px", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
            · <span style={{ color: "#22c55e", fontWeight: 700 }}>덮어쓰기</span>: 이름·배번이 변경된 경우 업데이트 (기존 통계 기록은 유지)
            <br />
            · <span style={{ color: "#60a5fa", fontWeight: 700 }}>겹치는 선수 제외</span>: 중복 선수는 건너뛰고 새 선수만 추가
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10, padding: "16px 24px" }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            취소
          </button>
          <button
            onClick={onSkip}
            style={{ flex: 1, padding: "11px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            겹치는 선수 제외
          </button>
          <button
            onClick={onOverwrite}
            style={{ flex: 1, padding: "11px", borderRadius: 10, background: "linear-gradient(135deg, #d97706, #b45309)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            덮어쓰기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ─────────────────────────────────── */
export default function UploadPage() {
  const [tab, setTab] = useState<"manual" | "file">("manual");

  // 수동 입력
  const [manualText, setManualText] = useState("");
  const [preview, setPreview] = useState<RosterPlayer[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // 파일
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 공통
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [conflict, setConflict] = useState<{ conflicts: ConflictPlayer[]; total: number; mode: "manual" | "file" } | null>(null);

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
      if (!overwrite) fd.append("checkOnly", "false"); // first real call checks
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

  /* ── 수동: 덮어쓰기 (중복 포함 전송) ── */
  const handleManualOverwrite = () => submitManual(true);

  /* ── 수동: 중복 제외 (conflict 제외한 선수만 전송) ── */
  const handleManualSkip = () => {
    if (!conflict) return;
    const conflictNames = new Set(conflict.conflicts.map((c) => c.name));
    const filtered = parseManualInput(manualText).filter((p) => !conflictNames.has(p.name));
    if (filtered.length === 0) {
      setConflict(null);
      setResult({ success: true, message: "중복 선수를 제외하면 추가할 선수가 없습니다" });
      return;
    }
    submitManual(false, filtered);
  };

  /* ── 파일 업로드 ── */
  const handleFile = (f: File) => {
    if (f.name.match(/\.(xlsx|xls|csv)$/i)) { setFile(f); setResult(null); }
    else setResult({ success: false, message: "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다" });
  };

  const submitFile = async (overwrite: boolean) => {
    if (!file) return;
    setLoading(true); setResult(null); setConflict(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("overwrite", String(overwrite));
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

  /* ── 파일: 덮어쓰기 ── */
  const handleFileOverwrite = () => submitFile(true);

  /* ── 파일: 중복 제외 (overwrite=false 재전송) ── */
  const handleFileSkip = async () => {
    if (!file || !conflict) return;
    // conflict 선수 이름 목록을 헤더로 넘기는 대신,
    // 서버에서 skip 처리: overwrite=false 이미 skip 동작 → 직접 initializeRosterSeason의 existing 분기가 skip함
    // 단, 현재 API는 overwrite=false에서 conflict 있으면 needsConfirm 반환하므로
    // 여기서는 conflict 이름목록을 제외한 새 파일을 만들 수 없음 → skip 플래그를 추가
    setLoading(true); setConflict(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("overwrite", "false");
      fd.append("skipConflicts", "true"); // 서버에서 무시하고 진행
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message });
        setFile(null);
      } else {
        setResult({ success: false, message: data.error || "오류 발생" });
      }
    } finally { setLoading(false); }
  };

  const Spinner = () => (
    <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* 충돌 다이얼로그 */}
      {conflict && (
        <ConflictDialog
          conflicts={conflict.conflicts}
          total={conflict.total}
          onOverwrite={conflict.mode === "manual" ? handleManualOverwrite : handleFileOverwrite}
          onSkip={conflict.mode === "manual" ? handleManualSkip : handleFileSkip}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* 헤더 */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>← 대시보드로 돌아가기</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📊 선수 등록 / 데이터 업로드</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>직접 입력하거나 엑셀 파일로 선수를 등록합니다 · 중복 선수는 확인 후 처리</p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 40px" }}>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["manual", "file"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setResult(null); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 9, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                background: tab === t ? "rgba(59,130,246,0.25)" : "transparent",
                color: tab === t ? "#60a5fa" : "rgba(255,255,255,0.35)",
                transition: "all 0.2s",
              }}
            >
              {t === "manual" ? "✏️ 직접 입력" : "📁 파일 업로드"}
            </button>
          ))}
        </div>

        {/* ── 직접 입력 탭 ── */}
        {tab === "manual" && (
          <div>
            {/* 입력 가이드 */}
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 8 }}>📝 입력 형식 (한 줄에 선수 한 명)</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 2, fontFamily: "monospace" }}>
                35 이호원&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ 배번 + 이름<br />
                35 이호원 P&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ 투수 표시<br />
                이호원&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ 이름만 (배번 미입력)
              </div>
            </div>

            {/* 텍스트 입력 */}
            <textarea
              value={manualText}
              onChange={(e) => { setManualText(e.target.value); setShowPreview(false); }}
              placeholder={"35 이호원\n82 황서현 P\n13 임희찬\n..."}
              rows={10}
              style={{
                width: "100%", padding: "16px", borderRadius: 12, fontSize: 14, lineHeight: 1.8,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#f1f5f9", outline: "none", resize: "vertical", fontFamily: "monospace",
                boxSizing: "border-box",
              }}
            />

            {/* 버튼 행 */}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={handlePreview}
                disabled={!manualText.trim()}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)", color: "#94a3b8",
                  fontSize: 14, fontWeight: 600, cursor: manualText.trim() ? "pointer" : "not-allowed",
                }}
              >
                🔍 미리보기
              </button>
              <button
                onClick={() => submitManual(false)}
                disabled={loading || !manualText.trim()}
                style={{
                  flex: 2, padding: "12px", borderRadius: 10, border: "none",
                  background: loading || !manualText.trim() ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: loading || !manualText.trim() ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {loading ? <><Spinner /> 처리 중...</> : "📤 선수 등록하기"}
              </button>
            </div>

            {/* 미리보기 패널 */}
            {showPreview && preview.length > 0 && (
              <div style={{ marginTop: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
                  파싱 결과 — {preview.length}명
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  {preview.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: p.is_pitcher ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: p.is_pitcher ? "#c084fc" : "#60a5fa" }}>
                        {p.number || "?"}
                      </div>
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
            {/* 양식 안내 */}
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 10 }}>📋 지원 엑셀 형식</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 3 }}>로스터 파일 (선수 명단)</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>시트명: 전체 / 타자 / 투수 &nbsp;|&nbsp; 열: 배번 | 이름</div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#eab308", marginBottom: 3 }}>기록 파일 (타격 통계)</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>시트명: 타자 &nbsp;|&nbsp; 열: 배번|이름|날짜|상대팀|타석|타수|안타...</div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 3 }}>기록 파일 (투구 통계)</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>시트명: 투수 &nbsp;|&nbsp; 열: 배번|이름|날짜|상대팀|승|패|이닝...</div>
                </div>
              </div>
            </div>

            {/* 드래그앤드롭 영역 */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#3b82f6" : file ? "#22c55e" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 16, padding: "48px 24px", textAlign: "center" as const,
                cursor: "pointer",
                background: dragOver ? "rgba(59,130,246,0.06)" : file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
                transition: "all 0.2s", marginBottom: 16,
              }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
              {file ? (
                <>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>엑셀 파일을 드래그하거나 클릭하여 선택</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>.xlsx · .xls · .csv</div>
                </>
              )}
            </div>

            {file && (
              <button
                onClick={() => submitFile(false)}
                disabled={loading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: loading ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {loading ? <><Spinner /> 업로드 중...</> : "📤 데이터 업로드하기"}
              </button>
            )}
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