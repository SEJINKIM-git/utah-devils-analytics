/**
 * 운영진 세션 쿠키 (서명된 토큰).
 *
 * 로그인 시 Supabase Auth로 계정을 확인하고 admin_members 승인 여부를 본 뒤,
 * "이메일·역할·만료시각"을 HMAC-SHA256으로 서명해 httpOnly 쿠키에 넣는다.
 * middleware(Edge)와 API 라우트(Node) 양쪽에서 쓰기 때문에 Web Crypto만 사용한다.
 */

export const ADMIN_COOKIE = "ud_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12시간

export type AdminSession = {
  email: string;
  role: string;
  exp: number; // unix seconds
};

function getSecret(): string | null {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(
  email: string,
  role: string,
  now = Math.floor(Date.now() / 1000),
  secret = getSecret()
): Promise<string> {
  if (!secret) throw new Error("ADMIN_SESSION_SECRET(또는 Supabase service key)가 설정되지 않았습니다.");
  const payload: AdminSession = { email, role, exp: now + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = toBase64Url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
  now = Math.floor(Date.now() / 1000),
  secret = getSecret()
): Promise<AdminSession | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = await hmac(secret, body);
    if (!timingSafeEqual(expected, fromBase64Url(sig))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as AdminSession;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (!payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 공개로 열어 두는 요청인지. 조회(GET/HEAD/OPTIONS)와 로그인 API만 공개. */
export function isPublicApiRequest(method: string, pathname: string) {
  if (pathname.startsWith("/api/auth/")) return true;
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** 로그인해야 들어갈 수 있는 화면 (데이터를 바꾸는 운영 화면) */
export const PROTECTED_PAGES = ["/upload", "/files", "/import"];

export function isProtectedPage(pathname: string) {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
