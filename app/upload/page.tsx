"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UploadCloud, Users, FileSpreadsheet, BookOpen, CheckCircle2, XCircle,
  AlertTriangle, Calendar, ArrowLeftRight, BarChart3, Loader2,
  TrendingUp, Info, AlertCircle,
} from "lucide-react";

type ConflictPlayer = {
  existingId: string; existingName: string; existingNumber: number;
  name: string; number: number;
};

type ValidationResult = {
  processedRows: number;
  matchedPlayers: number;
  unmatchedNames: number;
};

type UploadResult = {
  success?: boolean; message?: string; error?: string;
  needsConfirm?: boolean; conflicts?: ConflictPlayer[]; total?: number;
  details?: { games?: number; batting?: number; pitching?: number; players?: number; updated?: number; seasons?: string[] };
  validation?: ValidationResult;
};

type FileEntry = {
  id: string;
  filename: string;
  source: string;
  uploaded_at: string;
  player_count?: number;
};

const FORMATS = [
  {
    icon: "users",
    title: "로스터 파일 (선수 등록/수정)",
    color: "#4ade80", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)",
    desc: "새 선수 추가 또는 기존 선수 정보 수정. 기존 성적은 유지됩니다.",
    sheets: [{ name: "시트 컬럼", cols: "배번 | 이름" }],
  },
  {
    icon: "spreadsheet",
    title: "경기 기록 파일 (성적 업데이트)",
    color: "#60a5fa", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)",
    desc: "경기 후 기록 업로드. 시즌 누적 파일은 시즌 전체를 교체하고, 현장 경기 Excel/Word 파일은 해당 경기만 최신 파일 기준으로 교체됩니다.",
    sheets: [
      { name: "경기 시트 (필수)", cols: "날짜 | 상대팀 | 시즌" },
      { name: "타자 시트", cols: "날짜 | 상대팀 | 시즌 | 배번 | 이름 | 포지션 | 타석 | 타수 | 득점 | 안타 | 2루타 | 3루타 | 홈런 | 타점 | 볼넷 | 사구 | 삼진 | 도루" },
      { name: "투수 시트", cols: "날짜 | 상대팀 | 시즌 | 배번 | 이름 | 포지션 | 승 | 패 | 세 | 홀 | 이닝 | 피안타 | 실점 | 자책 | 볼넷 | 사구 | 삼진 | 피홈런" },
    ],
  },
  {
    icon: "book",
    title: "공식 시즌/통산 파일",
    color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)",
    desc: "2022~2025 시즌 누적 통계 파일과 Career Totals 공식 통산 파일을 그대로 업로드할 수 있습니다.",
    sheets: [
      { name: "공식 시즌 파일", cols: "2022 | 2023 | 2024 | 2025 + Spring/Fall/Summer 상세 시트" },
      { name: "공식 통산 파일", cols: "Career Totals | 2022 | 2023 | 2024 | 2025" },
    ],
  },
];

const TIPS = [
  "1행은 반드시 헤더(컬럼명)여야 합니다. 제목 행이 있으면 인식하지 못합니다.",
  "경기 기록: '경기' 시트에 날짜·상대팀·시즌이 있어야 타자/투수 기록이 해당 경기에 연결됩니다.",
  "시즌 누적 파일을 다시 올리면 해당 시즌 데이터는 새 파일 내용으로 교체됩니다.",
  "현장 경기 Excel/Word 파일은 같은 날짜·상대 경기만 교체되고 시즌 누적은 유지됩니다.",
  "파일명에 연도가 없으면 현재 보고 있는 시즌(예: 2025, 2026)으로 업로드됩니다.",
];

function FormatIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  if (icon === "users") return <Users size={size} color={color} />;
  if (icon === "spreadsheet") return <FileSpreadsheet size={size} color={color} />;
  return <BookOpen size={size} color={color} />;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [conflicts, setConflicts] = useState<ConflictPlayer[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentSeason = searchParams.get("season");

  const fetchRecentFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setRecentFiles((data.files || []).slice(0, 3));
    } catch {}
  }, []);

  useEffect(() => { fetchRecentFiles(); }, [fetchRecentFiles]);

  const getPrimarySeason = (data: UploadResult | null) => {
    const seasons = data?.details?.seasons || [];
    if (seasons.length === 0) return currentSeason || "2025";
    return [...seasons].filter(Boolean).sort((a, b) => b.localeCompare(a))[0];
  };

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setConflicts([]);
  }, []);

  const doUpload = async (extra: Record<string, string> = {}) => {
    if (!file) return;
    setLoading(true); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("season", currentSeason || "2025");
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data: UploadResult = await res.json();
      if (data.needsConfirm && data.conflicts) { setConflicts(data.conflicts); }
      else {
        setResult(data);
        setConflicts([]);
        if (data.success) {
          const nextSeason = getPrimarySeason(data);
          const params = new URLSearchParams(searchParams.toString());
          params.set("season", nextSeason);
          router.replace(`/upload?${params.toString()}`);
          router.refresh();
          fetchRecentFiles();
        }
      }
    } catch { setResult({ error: "업로드 실패. 네트워크를 확인해주세요." }); }
    finally { setLoading(false); }
  };

  const resolveConflict = async (mode: "overwrite" | "skip") => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("season", currentSeason || "2025");
    fd.append(mode === "overwrite" ? "overwrite" : "skipConflicts", "true");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data: UploadResult = await res.json();
      setResult(data);
      setConflicts([]);
      if (data.success) {
        const nextSeason = getPrimarySeason(data);
        const params = new URLSearchParams(searchParams.toString());
        params.set("season", nextSeason);
        router.replace(`/upload?${params.toString()}`);
        router.refresh();
        fetchRecentFiles();
      }
    } catch { setResult({ error: "업로드 실패." }); }
    finally { setLoading(false); }
  };

  const primarySeason = getPrimarySeason(result);

  return (
    <div style={{ minHeight: "100vh", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "32px 32px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "var(--coral)", textTransform: "uppercase" as const, marginBottom: 8 }}>
            DATA MANAGEMENT
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>
            데이터 업로드 센터
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-faint)", margin: "6px 0 0", lineHeight: 1.6 }}>
            파일을 다시 올리면 해당 시즌 대시보드는 항상 최신 업로드 기준으로 바뀝니다
          </p>
        </div>

        {/* 2-col grid */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, marginBottom: 32, alignItems: "start" }}>

          {/* Left: upload area */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--coral)" : file ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.10)"}`,
                borderRadius: "var(--radius)", padding: "48px 24px", textAlign: "center" as const, cursor: "pointer",
                background: dragging ? "var(--coral-dim)" : file ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.02)",
                transition: "all 0.2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.docx" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              <div style={{
                width: 60, height: 60, borderRadius: 18,
                background: file ? "rgba(74,222,128,0.12)" : dragging ? "var(--coral-dim)" : "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
                transition: "all 0.2s",
              }}>
                {file
                  ? <CheckCircle2 size={28} color="#4ade80" />
                  : <UploadCloud size={28} color={dragging ? "var(--coral)" : "var(--text-faint)"} strokeWidth={1.6} />
                }
              </div>
              {file ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-faint)" }}>{(file.size / 1024).toFixed(1)} KB · 클릭하면 다른 파일 선택</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    {dragging ? "파일을 여기에 놓으세요" : "성적 데이터를 끌어다 놓으세요"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-faint)", opacity: 0.7 }}>.xlsx · .xls · .csv · .docx · 최대 10MB</div>
                </>
              )}
            </div>

            {/* Upload button */}
            <button
              onClick={() => doUpload()}
              disabled={!file || loading}
              style={{
                width: "100%", padding: "15px", borderRadius: "var(--radius-sm)", border: "none",
                background: file && !loading ? "linear-gradient(135deg, var(--coral), #e0453a)" : "rgba(255,255,255,0.06)",
                color: file && !loading ? "#fff" : "rgba(255,255,255,0.2)",
                fontSize: 15, fontWeight: 700, cursor: file && !loading ? "pointer" : "not-allowed", transition: "all 0.2s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: file && !loading ? "0 10px 28px rgba(242,161,150,0.22)" : "none",
              }}
            >
              {loading
                ? <><Loader2 size={18} style={{ animation: "spin 0.8s linear infinite" }} />업로드 중...</>
                : <><UploadCloud size={18} strokeWidth={1.8} />업로드 시작</>
              }
            </button>

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "var(--radius-sm)", padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <AlertTriangle size={18} color="#facc15" />
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#fef08a" }}>중복 선수 발견</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 16 }}>아래 {conflicts.length}명이 이미 DB에 등록되어 있습니다</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 20 }}>
                  {conflicts.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>기존</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-faint)" }}>#{c.existingNumber} {c.existingName}</div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.2)" }}>→</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>신규</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>#{c.number || "?"} {c.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => resolveConflict("overwrite")} disabled={loading}
                    style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                    덮어쓰기 (이름·배번 업데이트)
                  </button>
                  <button onClick={() => resolveConflict("skip")} disabled={loading}
                    style={{ flex: 1, padding: "12px", borderRadius: 10, background: "var(--blue-dim)", border: "1px solid rgba(127,166,217,0.3)", color: "var(--blue)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                    중복 제외, 새 선수만 추가
                  </button>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div style={{
                borderRadius: "var(--radius-sm)", padding: "20px 24px",
                background: result.success ? "rgba(74,222,128,0.07)" : "rgba(220,38,38,0.08)",
                border: `1px solid ${result.success ? "rgba(74,222,128,0.25)" : "rgba(220,38,38,0.3)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: result.success && result.details ? 16 : 0 }}>
                  {result.success
                    ? <CheckCircle2 size={18} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
                    : <AlertCircle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                  }
                  <span style={{ fontSize: 14, fontWeight: 700, color: result.success ? "#4ade80" : "#f87171", lineHeight: 1.6 }}>
                    {result.message || result.error}
                  </span>
                </div>
                {result.success && result.details && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 18 }}>
                    {[
                      { key: "games",    label: "경기",    color: "var(--blue)" },
                      { key: "batting",  label: "타자 기록", color: "#a855f7" },
                      { key: "pitching", label: "투수 기록", color: "var(--coral)" },
                      { key: "players",  label: "신규 선수", color: "var(--green)" },
                    ].map(({ key, label, color }) => {
                      const val = (result.details as any)[key];
                      return val !== undefined ? (
                        <div key={key} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 20px", textAlign: "center" as const }}>
                          <div className="num" style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{label}</div>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                {result.success && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                    <Link href={`/?season=${primarySeason}`} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <BarChart3 size={13} />대시보드
                    </Link>
                    <Link href={`/lineup?season=${primarySeason}`} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)", color: "#facc15", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Users size={13} />라인업
                    </Link>
                    <Link href={`/schedule?season=${primarySeason}`} style={{ padding: "9px 16px", borderRadius: 9, background: "var(--blue-dim)", border: "1px solid rgba(127,166,217,0.25)", color: "var(--blue)", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Calendar size={13} />일정
                    </Link>
                    <Link href={`/compare?season=${primarySeason}`} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.25)", color: "#f87171", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <ArrowLeftRight size={13} />비교
                    </Link>
                    <Link href={`/team-analysis?season=${primarySeason}`} style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.25)", color: "#c4b5fd", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <TrendingUp size={13} />팀 분석
                    </Link>
                    <button
                      onClick={() => { setFile(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
                      style={{ padding: "9px 16px", borderRadius: 9, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-faint)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      다른 파일 업로드
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: recent uploads + validation */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>

            {/* Recent uploads */}
            <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-faint)", textTransform: "uppercase" as const, marginBottom: 18 }}>
                최근 업로드
              </div>
              {recentFiles.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center" as const, padding: "24px 0", opacity: 0.6 }}>
                  업로드 기록이 없습니다
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {recentFiles.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
                      <CheckCircle2 size={14} color="var(--green)" strokeWidth={2} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {f.filename}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                          {formatRelativeTime(f.uploaded_at)}
                          {f.player_count ? ` · ${f.player_count}명` : ""}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: "3px 8px", borderRadius: 6, flexShrink: 0,
                        background: f.source === "manual" ? "var(--coral-dim)" : "var(--blue-dim)",
                        color: f.source === "manual" ? "var(--coral)" : "var(--blue)",
                        fontWeight: 700,
                      }}>
                        {f.source === "manual" ? "직접입력" : "파일"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Validation result */}
            {result?.success && result.validation && (
              <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "var(--pad-card)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-faint)", textTransform: "uppercase" as const, marginBottom: 18 }}>
                  데이터 검증 결과
                </div>
                {[
                  { label: "처리된 행", value: result.validation.processedRows, color: "var(--blue)" },
                  { label: "매칭된 선수", value: result.validation.matchedPlayers, color: "var(--green)" },
                  { label: "신규 선수 추가", value: result.validation.unmatchedNames, color: "var(--coral)" },
                ].map(({ label, value, color }, i, arr) => (
                  <div key={label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}>
                    <span style={{ fontSize: 13, color: "var(--text-faint)" }}>{label}</span>
                    <span className="num" style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Info banner */}
            <div style={{ background: "rgba(127,166,217,0.08)", border: "1px solid rgba(127,166,217,0.16)", borderRadius: "var(--radius-sm)", padding: "14px 18px", display: "flex", gap: 10 }}>
              <Info size={15} color="var(--blue)" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, lineHeight: 1.7 }}>
                시즌 누적 파일 업로드 시 해당 시즌 데이터 전체가 교체됩니다. 현장 기록 파일은 해당 경기만 교체됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* Format guide */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-faint)", textTransform: "uppercase" as const, marginBottom: 16 }}>
            지원 파일 형식
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {FORMATS.map((g, i) => (
              <div key={i} style={{ background: g.bg, border: `1px solid ${g.border}`, borderRadius: "var(--radius-sm)", padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <FormatIcon icon={g.icon} color={g.color} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.title}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 12px", lineHeight: 1.65 }}>{g.desc}</p>
                {g.sheets.map((s, j) => (
                  <div key={j} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: j < g.sheets.length - 1 ? 6 : 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: g.color, marginBottom: 3 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.7, wordBreak: "break-all" as const, opacity: 0.75 }}>{s.cols}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--radius-sm)", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--text-faint)", marginBottom: 12 }}>
            <Info size={14} strokeWidth={1.8} />
            유의사항
          </div>
          {TIPS.map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text-faint)", lineHeight: 1.75, opacity: 0.8 }}>
              <span style={{ color: "var(--coral)", fontWeight: 700, flexShrink: 0 }}>·</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
