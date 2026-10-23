import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isProtectedPage, isPublicApiRequest, verifySessionToken } from "@/lib/adminSession";

/**
 * 조회는 누구나, 기록을 바꾸거나 OpenAI 비용이 드는 요청은 운영진 로그인 필요.
 * (이전에는 /api/reset 포함 모든 쓰기 API가 인증 없이 열려 있었다)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && isPublicApiRequest(request.method, pathname)) return NextResponse.next();
  if (!isApi && !isProtectedPage(pathname)) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (isApi) {
    return NextResponse.json(
      { error: "운영진 로그인이 필요합니다. /login 에서 로그인한 뒤 다시 시도하세요.", code: "ADMIN_LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/api/:path*", "/upload/:path*", "/files/:path*", "/import/:path*", "/upload", "/files", "/import"],
};
