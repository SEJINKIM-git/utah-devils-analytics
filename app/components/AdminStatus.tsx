"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { useAdminSession } from "@/app/components/useAdminSession";

/** 사이드바 하단: 운영진 로그인 상태 */
export default function AdminStatus({ isKo }: { isKo: boolean }) {
  const pathname = usePathname();
  const session = useAdminSession();

  if (!session) return null;

  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    fontSize: 12,
    color: "var(--text-muted)",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
  };

  if (!session.loggedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`} style={style}>
        <LogIn size={14} strokeWidth={1.8} />
        {isKo ? "운영진 로그인" : "Staff login"}
      </Link>
    );
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <button type="button" onClick={logout} style={style} title={session.email}>
      <LogOut size={14} strokeWidth={1.8} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>
        {session.email} · {isKo ? "로그아웃" : "Log out"}
      </span>
    </button>
  );
}
