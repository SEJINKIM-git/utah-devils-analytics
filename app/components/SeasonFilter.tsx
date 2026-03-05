"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function SeasonFilter({ seasons }: { seasons: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("season") || "2025";

  const handleChange = (season: string) => {
    router.push(`/?season=${season}`);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => handleChange(s)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: current === s ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
            background: current === s ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
            color: current === s ? "#60a5fa" : "rgba(255,255,255,0.5)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {s === "Career" ? "통산" : s}
        </button>
      ))}
    </div>
  );
}