"use client";

import { useRouter } from "next/navigation";

export default function LangToggle({ lang }: { lang: "ko" | "en" }) {
  const router = useRouter();

  const toggle = () => {
    const next = lang === "ko" ? "en" : "ko";
    document.cookie = `lang=${next};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <button
      onClick={toggle}
      title={lang === "ko" ? "Switch to English" : "한국어로 전환"}
      className="app-icon-button"
      style={{
        width: 36,
        height: 42,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "linear-gradient(180deg, rgba(35,42,67,0.92), rgba(24,31,52,0.92))",
        color: "var(--text)",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 36px rgba(6,10,24,0.18)",
      }}
    >
      {lang === "ko" ? "EN" : "한"}
    </button>
  );
}
