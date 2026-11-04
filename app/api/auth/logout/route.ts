import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminSession";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
