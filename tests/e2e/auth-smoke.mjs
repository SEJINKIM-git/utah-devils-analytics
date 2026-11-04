/**
 * 배포 전 인증 스모크 테스트 (실제 서버에 HTTP 요청).
 *
 *   ADMIN_SESSION_SECRET=e2e-secret NEXT_PUBLIC_SUPABASE_URL=https://example.invalid ... npx next start -p 3100
 *   BASE_URL=http://localhost:3100 ADMIN_SESSION_SECRET=e2e-secret node tests/e2e/auth-smoke.mjs
 *
 * Supabase 주소를 가짜로 두고 돌리므로 운영 DB에는 어떤 요청도 가지 않는다.
 * "통과" 확인은 DB에 닿기 전에 끝나는 요청(입력 검증 400)으로만 한다.
 */
import { webcrypto as crypto } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SECRET = process.env.ADMIN_SESSION_SECRET ?? "e2e-secret";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function mintToken(payload, secret = SECRET) {
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${sig}`;
}

const now = Math.floor(Date.now() / 1000);
const valid = await mintToken({ email: "e2e@test", role: "admin", exp: now + 600 });
const expired = await mintToken({ email: "e2e@test", role: "admin", exp: now - 1 });
const forged = await mintToken({ email: "e2e@test", role: "admin", exp: now + 600 }, "wrong-secret");

const cases = [
  // [설명, method, path, cookie, body, 기대 status, 추가 검사]
  ["리셋 API — 로그인 없음 → 차단", "POST", "/api/reset", null, "confirm=RESET", 401],
  ["업로드 API — 로그인 없음 → 차단", "POST", "/api/upload", null, null, 401],
  ["선수 삭제 — 로그인 없음 → 차단", "DELETE", "/api/players", null, "{}", 401],
  ["AI 팀 분석 — 로그인 없음 → 차단 (OpenAI 비용)", "POST", "/api/analyze-team", null, "{}", 401],
  ["경기 수정 — 로그인 없음 → 차단", "PUT", "/api/games", null, "{}", 401],
  ["도루 수정 — 로그인 없음 → 차단", "PATCH", "/api/stats/sb", null, "{}", 401],
  ["만료된 세션 → 차단", "POST", "/api/players", expired, "{}", 401],
  ["다른 키로 서명한 세션 → 차단", "POST", "/api/players", forged, "{}", 401],
  ["조회 API는 공개 (미들웨어 통과)", "GET", "/api/seasons", null, null, (s) => s !== 401],
  ["로그인 화면 공개", "GET", "/login", null, null, 200],
  ["업로드 화면 — 로그인 없음 → 로그인으로 이동", "GET", "/upload?season=2026", null, null, 307,
    (res) => res.headers.get("location")?.includes("/login?next=%2Fupload%3Fseason%3D2026")],
  ["파일 관리 화면 — 로그인 없음 → 로그인으로 이동", "GET", "/files", null, null, 307],
  ["유효한 세션 → 미들웨어 통과 (DB 전 입력 검증 400)", "POST", "/api/players", valid, "{}", 400,
    async (res) => (await res.json()).error === "배번과 이름은 필수입니다"],
  ["유효한 세션 → 업로드 화면 열림", "GET", "/upload", valid, null, 200],
  ["세션 상태 조회 — 로그인됨", "GET", "/api/auth/session", valid, null, 200,
    async (res) => (await res.json()).email === "e2e@test"],
  ["세션 상태 조회 — 로그인 안 됨", "GET", "/api/auth/session", null, null, 200,
    async (res) => (await res.json()).loggedIn === false],
  ["로그인 API 입력 검증", "POST", "/api/auth/login", null, "{}", 400],
  ["로그아웃은 쿠키를 지운다", "POST", "/api/auth/logout", valid, null, 200,
    (res) => /ud_admin=;/.test(res.headers.get("set-cookie") ?? "")],
];

let failed = 0;
for (const [name, method, path, cookie, body, expected, check] of cases) {
  const headers = {};
  if (cookie) headers.cookie = `ud_admin=${cookie}`;
  if (body) headers["content-type"] = body.startsWith("{") ? "application/json" : "application/x-www-form-urlencoded";
  const res = await fetch(BASE + path, { method, headers, body: body ?? undefined, redirect: "manual" });
  const statusOk = typeof expected === "function" ? expected(res.status) : res.status === expected;
  const extraOk = check ? await check(res) : true;
  const ok = statusOk && extraOk;
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name} — ${method} ${path} → ${res.status}`);
}

console.log(failed === 0 ? `\n${cases.length}/${cases.length} 통과` : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
