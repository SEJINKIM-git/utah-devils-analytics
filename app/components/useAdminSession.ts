"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type AdminSession = { loggedIn: boolean; email?: string };

/** 운영진 로그인 상태 (GET /api/auth/session). 확인 전에는 null. */
export function useAdminSession(): AdminSession | null {
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: AdminSession) => alive && setSession(s))
      .catch(() => alive && setSession({ loggedIn: false }));
    return () => {
      alive = false;
    };
  }, [pathname]);

  return session;
}
