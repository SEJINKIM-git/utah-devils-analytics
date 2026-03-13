"use client";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";

type ConflictPlayer = {
  existingId: string; existingName: string; existingNumber: number;
  name: string; number: number;
};
type UploadResult = {
  success?: boolean; message?: string; error?: string;
  needsConfirm?: boolean; conflicts?: ConflictPlayer[]; total?: number;
  details?: { games?: number; batting?: number; pitching?: number; players?: number; updated?: number };
};

const FORMATS = [
  {
    emoji: "👥", title: "로스터 파일 (선수 등록/수정)",
    color: "#4ade80", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)",
    desc: "새 선수 추가 또는 기존 선수 정보 수정. 기존 성적은 유지됩니다.",
    sheets: [{ name: "시트 컬럼", cols: "배번 | 이름" }],
  },
  {
    emoji: "⚾", title: "경기 기록 파일 (성적 업데이트)",
    color: "#60a5fa", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)",
    desc: "경기 후 기록 업로드. 업로드하면 대시보드에 즉시 누적 반영됩니다.",
    sheets: [
      { name: "경기 시트 (필수)", cols: "날짜 | 상대팀 | 시즌" },
      { name: "타자 시트", cols: "날짜 | 상대팀 | 시즌 | 배번 | 이름 | 포지션 | 타석 | 타수 | 득점 | 안타 | 2루타 | 3루타 | 홈런 | 타점 | 볼넷 | 사구 | 삼진 | 도루" },
      { name: "투수 시트", cols: "날짜 | 상대팀 | 시즌 | 배번 | 이름 | 포지션 | 승 | 패 | 세 | 홀 | 이닝 | 피안타 | 실점 | 자책 | 볼넷 | 사구 | 삼진 | 피홈런" },
    ],
  },
];

const TIPS = [
  "1행은 반드시 헤더(컬럼명)여야 합니다. 제목 행이 있으면 인식하지 못합니다.",
  "경기 기록: '경기' 시트에 날짜·상대팀·시즌이 있어야 타자/투수 기록이 해당 경기에 연결됩니다.",
  "같은 날짜·상대팀 경기는 중복 등록되지 않아 재업로드해도 안전합니다.",
  "기록은 경기별로 누적 합산되어 대시보드에 표시됩니다.",
  "시즌 컬럼 값이 '2026'이어야 2026 탭에 반영됩니다.",
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [conflicts, setConflicts] = useState<ConflictPlayer[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setConflicts([]);
  }, []);

  const doUpload = async (extra: Record<string, string> = {}) => {
    if (!file) return;
    setLoading(true); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data: UploadResult = await res.json();
      if (data.needsConfirm && data.conflicts) { setConflicts(data.conflicts); }
      else { setResult(data); setConflicts([]); }
    } catch { setResult({ error: "업로드 실패. 네트워크를 확인해주세요." }); }
    finally { setLoading(false); }
  };

  const resolveConflict = async (mode: "overwrite" | "skip") => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append(mode === "overwrite" ? "overwrite" : "skipConflicts", "true");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      setResult(await res.json()); setConflicts([]);
    } catch { setResult({ error: "업로드 실패." }); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* 헤더 */}
        <Link href="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          ← 대시보드로 돌아가기
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📤</div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>선수 등록 / 기록 업로드</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>모든 선수 등록·수정·기록 업데이트는 엑셀 파일로 진행합니다</p>
          </div>
        </div>

        {/* 형식 안내 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          {FORMATS.map((g, i) => (
            <div key={i} style={{ background: g.bg, border: `1px solid ${g.border}`, borderRadius: 16, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{g.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.color }}>{g.title}</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 14px", lineHeight: 1.65 }}>{g.desc}</p>
              {g.sheets.map((s, j) => (
                <div key={j} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 12px", marginBottom: j < g.sheets.length - 1 ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: g.color, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", lineHeight: 1.7, wordBreak: "break-all" as const }}>{s.cols}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 드래그 업로드 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "#60a5fa" : file ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 20, padding: "52px 24px", textAlign: "center" as const, cursor: "pointer",
            background: dragging ? "rgba(59,130,246,0.07)" : file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
            transition: "all 0.2s", marginBottom: 16,
          }}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          <div style={{ fontSize: 44, marginBottom: 14 }}>{file ? "✅" : "📁"}</div>
          {file ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>{file.name}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>{(file.size / 1024).toFixed(1)} KB · 클릭하면 다른 파일 선택</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>엑셀 파일을 드래그하거나 클릭하여 선택</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>.xlsx · .xls · .csv</div>
            </>
          )}
        </div>

        {/* 업로드 버튼 */}
        <button
          onClick={() => doUpload()}
          disabled={!file || loading}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, marginBottom: 24, border: "none",
            background: file && !loading ? "linear-gradient(135deg,#1D4ED8,#2563EB)" : "rgba(255,255,255,0.06)",
            color: file && !loading ? "#fff" : "rgba(255,255,255,0.2)",
            fontSize: 16, fontWeight: 700, cursor: file && !loading ? "pointer" : "not-allowed", transition: "all 0.2s",
          }}
        >
          {loading ? "⏳ 업로드 중..." : "📤 업로드 시작"}
        </button>

        {/* 중복 충돌 */}
        {conflicts.length > 0 && (
          <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fef08a", marginBottom: 6 }}>⚠️ 중복 선수 발견</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>아래 {conflicts.length}명이 이미 DB에 등록되어 있습니다</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 20 }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>기존</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>#{c.existingNumber} {c.existingName}</div>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)" }}>→</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>신규</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>#{c.number || "?"} {c.name}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => resolveConflict("overwrite")} disabled={loading}
                style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                덮어쓰기 (이름·배번 업데이트, 기록 유지)
              </button>
              <button onClick={() => resolveConflict("skip")} disabled={loading}
                style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                중복 제외하고 새 선수만 추가
              </button>
            </div>
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div style={{
            borderRadius: 16, padding: "20px 24px", marginBottom: 24,
            background: result.success ? "rgba(34,197,94,0.08)" : "rgba(220,38,38,0.08)",
            border: `1px solid ${result.success ? "rgba(34,197,94,0.3)" : "rgba(220,38,38,0.3)"}`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: result.success ? "#4ade80" : "#f87171", marginBottom: result.success && result.details ? 16 : 0 }}>
              {result.success ? "✅ " : "❌ "}{result.message || result.error}
            </div>
            {result.success && result.details && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 20 }}>
                {[
                  { key: "games",    label: "경기 등록", color: "#a855f7" },
                  { key: "batting",  label: "타자 기록", color: "#60a5fa" },
                  { key: "pitching", label: "투수 기록", color: "#f97316" },
                  { key: "players",  label: "선수 처리", color: "#4ade80" },
                ].map(({ key, label, color }) => {
                  const val = (result.details as any)[key];
                  return val !== undefined ? (
                    <div key={key} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "10px 24px", textAlign: "center" as const }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color }}>{val}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{label}</div>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            {result.success && (
              <div style={{ display: "flex", gap: 10 }}>
                <Link href="/" style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
                  📊 대시보드에서 확인
                </Link>
                <button
                  onClick={() => { setFile(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  다른 파일 업로드
                </button>
              </div>
            )}
          </div>
        )}

        {/* 유의사항 */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>📌 유의사항</div>
          {TIPS.map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.75 }}>
              <span style={{ color: "#60a5fa", fontWeight: 700, flexShrink: 0 }}>·</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}