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
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        color: "#e2e8f0",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
      }}
    >
      {lang === "ko" ? "EN" : "한"}
    </button>
  );
}