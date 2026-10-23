"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeNext(value: string | null) {
  // 외부 주소로 튕기지 않도록 같은 사이트 경로만 허용
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "로그인에 실패했습니다.");
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border-ghost)",
    background: "var(--input-bg)",
    color: "var(--text)",
    fontSize: 15,
  };

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 380,
          display: "grid",
          gap: 14,
          padding: 28,
          borderRadius: 20,
          background: "var(--card-bg)",
          boxShadow: "var(--ambient-shadow)",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>운영진 로그인</h1>
          <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
            기록 업로드·수정과 AI 분석은 승인된 운영진만 할 수 있습니다. 홈페이지 관리자 계정으로 로그인하세요.
          </p>
        </div>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
          이메일
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
          비밀번호
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={field} />
        </label>
        {error && (
          <p role="alert" style={{ fontSize: 13, color: "var(--brand-coral)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 16px",
            borderRadius: 999,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "확인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
