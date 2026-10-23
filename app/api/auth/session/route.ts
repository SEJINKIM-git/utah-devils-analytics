import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminSession";

/** 화면에서 로그인 상태를 표시하기 위한 조회 */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  return NextResponse.json(
    session ? { loggedIn: true, email: session.email, role: session.role } : { loggedIn: false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
