"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/situations/hub",     label: "🏠 허브"      },
  { href: "/situations",         label: "⚡ 로거"      },
  { href: "/situations/offense", label: "⚔️ 공격 보드" },
  { href: "/situations/defense", label: "🛡️ 수비 보드" },
];

export default function SituationsSubNav({ season }: { season: string }) {
  const pathname = usePathname();
  const q = season ? `?season=${season}` : "";

  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
      {TABS.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href + q}
            style={{
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              padding: "6px 16px",
              borderRadius: 999,
              textDecoration: "none",
              background: active ? "rgba(164,201,255,0.12)" : "transparent",
              color: active ? "var(--brand-blue)" : "var(--text-dim)",
              border: `1px solid ${active ? "rgba(164,201,255,0.28)" : "var(--border)"}`,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
