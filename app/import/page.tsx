"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Database, ArrowLeft, Loader2 } from "lucide-react";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) {
      setFile(f); setResult(null);
    } else {
      setResult({ success: false, message: "엑셀 파일(.xlsx)만 업로드 가능합니다" });
    }
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import-career", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      if (data.success) setFile(null);
    } catch {
      setResult({ success: false, message: "업로드 중 오류가 발생했습니다" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* Header */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", textDecoration: "none", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={14} />
          대시보드로 돌아가기
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.8))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 32px rgba(139,92,246,0.24)" }}>
            <Database size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>역대 기록 임포트</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0 0" }}>Career Total 엑셀 파일을 업로드하여 역대 선수 기록을 한 번에 가져옵니다</p>
          </div>
        </div>

        {/* Format Info */}
        <div className="app-glass-panel" style={{ borderRadius: 20, padding: "20px 24px", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <FileSpreadsheet size={16} color="#a78bfa" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>지원하는 엑셀 형식</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
            Career Total 엑셀 파일의 형식을 자동으로 인식합니다:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {["Career Totals", "2022", "2023", "2024", "2025"].map((s) => (
              <span key={s} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, opacity: 0.7 }}>
            각 시트의 타자기록 + 투수기록 섹션을 자동으로 감지합니다. 이미 존재하는 기록은 건너뜁니다.
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "rgba(167,139,250,0.7)" : file ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 20,
            padding: "52px 32px",
            textAlign: "center" as const,
            cursor: "pointer",
            background: dragOver ? "rgba(167,139,250,0.06)" : file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
            transition: "all 0.2s ease",
            marginBottom: 20,
          }}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
          <div style={{ width: 56, height: 56, borderRadius: 16, background: file ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            {file ? <CheckCircle size={28} color="#22c55e" /> : <Upload size={24} color="var(--text-muted)" />}
          </div>
          {file ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(1)} KB</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Career Total 엑셀 파일을 드래그하거나 클릭</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", opacity: 0.6 }}>.xlsx / .xls 파일 지원</div>
            </>
          )}
        </div>

        {/* Upload Button */}
        {file && (
          <button
            onClick={upload}
            disabled={loading}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: 14,
              border: "none",
              background: loading ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: loading ? "none" : "0 12px 32px rgba(109,40,217,0.3)",
            }}
          >
            {loading ? (
              <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />임포트 중...</>
            ) : (
              <><Database size={16} />역대 기록 임포트하기</>
            )}
          </button>
        )}

        {/* Result */}
        {result && (
          <div style={{
            padding: "20px 24px",
            borderRadius: 16,
            background: result.success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${result.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              {result.success
                ? <CheckCircle size={18} color="#22c55e" />
                : <XCircle size={18} color="#ef4444" />
              }
              <span style={{ fontSize: 15, fontWeight: 700, color: result.success ? "#22c55e" : "#ef4444" }}>
                {result.success ? "임포트 성공!" : "오류 발생"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>{result.message}</div>
            {result.details?.seasons && (
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {result.details.seasons.map((s: string) => (
                  <span key={s} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: 11, fontWeight: 600 }}>{s} ✓</span>
                ))}
              </div>
            )}
            {result.success && (
              <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "#60a5fa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                대시보드에서 확인하기
              </Link>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
