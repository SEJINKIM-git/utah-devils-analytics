"use client";
import { useState, useRef } from "react";
import Link from "next/link";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => { if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) { setFile(f); setResult(null); } else { setResult({ success: false, message: "엑셀 파일(.xlsx)만 업로드 가능합니다" }); } };

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
    } catch { setResult({ success: false, message: "업로드 중 오류가 발생했습니다" }); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>← 대시보드로 돌아가기</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📚 역대 기록 임포트</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>Career Total 엑셀 파일을 업로드하여 역대 선수 기록을 한 번에 가져옵니다</p>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 40px" }}>
        <div style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>📋 지원하는 엑셀 형식</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>Career Total 엑셀 파일의 형식을 자동으로 인식합니다:</div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {["Career Totals", "2022", "2023", "2024", "2025"].map((s) => <span key={s} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600 }}>{s}</span>)}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 12 }}>각 시트의 타자기록 + 투수기록 섹션을 자동으로 감지합니다. 이미 존재하는 기록은 건너뜁니다.</div>
        </div>
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} style={{ border: `2px dashed ${dragOver ? "#a78bfa" : file ? "#22c55e" : "rgba(255,255,255,0.1)"}`, borderRadius: 16, padding: "48px 24px", textAlign: "center" as const, cursor: "pointer", background: dragOver ? "rgba(167,139,250,0.06)" : file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", marginBottom: 20 }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
          {file ? (<><div style={{ fontSize: 40, marginBottom: 12 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{file.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div></>) : (<><div style={{ fontSize: 40, marginBottom: 12 }}>📚</div><div style={{ fontSize: 16, fontWeight: 600 }}>Career Total 엑셀 파일을 드래그하거나 클릭</div></>)}
        </div>
        {file && <button onClick={upload} disabled={loading} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: loading ? "rgba(167,139,250,0.3)" : "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{loading ? (<><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />임포트 중...</>) : "📚 역대 기록 임포트하기"}</button>}
        {result && (
          <div style={{ padding: 20, borderRadius: 12, background: result.success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${result.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: result.success ? "#22c55e" : "#ef4444", marginBottom: 8 }}>{result.success ? "✅ 임포트 성공!" : "❌ 오류 발생"}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{result.message}</div>
            {result.details?.seasons && <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" as const }}>{result.details.seasons.map((s: string) => <span key={s} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: 11, fontWeight: 600 }}>{s} ✓</span>)}</div>}
            {result.success && <Link href="/" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "#60a5fa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>→ 대시보드에서 확인하기</Link>}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}