"use client";

import { useRouter } from "next/navigation";

export default function LangToggle({ lang }: { lang: "ko" | "en" }) {
  const router = useRouter();

  const toggle = () => {
    const next = lang === "ko" ? "en" : "ko";
    document.cookie = `lang=${next};path=/;max-age=31536000`;
    window.dispatchEvent(new CustomEvent("ud:lang-change", { detail: next }));
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
        border: "1px solid var(--icon-button-border)",
        background: "var(--icon-button-bg)",
        color: "var(--text)",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        boxShadow: "var(--icon-button-shadow)",
      }}
    >
      {lang === "ko" ? "EN" : "한"}
    </button>
  );
}
