export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "@/lib/adminSession";

/**
 * 운영진 로그인: 홈페이지 /admin과 같은 Supabase Auth 계정 + admin_members 승인 여부로 확인한다.
 */
export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력하세요." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "서버 인증 설정이 없습니다. 환경변수를 확인하세요." }, { status: 500 });
  }

  const auth = createClient(url, anonKey, { auth: { persistSession: false } }).auth;
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: member } = await admin
    .from("admin_members")
    .select("role, approved_at")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!member?.approved_at) {
    return NextResponse.json({ error: "승인된 운영진 계정이 아닙니다." }, { status: 403 });
  }

  const token = await createSessionToken(data.user.email ?? email, member.role ?? "admin");
  const response = NextResponse.json({ success: true, email: data.user.email, role: member.role });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
