import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  isProtectedPage,
  isPublicApiRequest,
  verifySessionToken,
} from "@/lib/adminSession";

const SECRET = "test-secret";
const NOW = 1_800_000_000;

describe("세션 토큰", () => {
  it("서명한 토큰을 검증하면 이메일·역할을 돌려준다", async () => {
    const token = await createSessionToken("ops@utahdevils.kr", "admin", NOW, SECRET);
    await expect(verifySessionToken(token, NOW + 60, SECRET)).resolves.toMatchObject({
      email: "ops@utahdevils.kr",
      role: "admin",
    });
  });

  it("만료된 토큰은 거부한다", async () => {
    const token = await createSessionToken("a@b.c", "admin", NOW, SECRET);
    await expect(verifySessionToken(token, NOW + SESSION_TTL_SECONDS + 1, SECRET)).resolves.toBeNull();
  });

  it("다른 비밀키로 서명했거나 내용을 바꾼 토큰은 거부한다", async () => {
    const token = await createSessionToken("a@b.c", "admin", NOW, SECRET);
    await expect(verifySessionToken(token, NOW, "other-secret")).resolves.toBeNull();

    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ email: "x@y.z", role: "admin", exp: NOW + 9999 }))
      .toString("base64url");
    await expect(verifySessionToken(`${forgedBody}.${sig}`, NOW, SECRET)).resolves.toBeNull();
  });

  it("형식이 깨진 값은 예외 없이 거부한다", async () => {
    for (const bad of [undefined, null, "", "abc", "a.b", "....", "eyJ.zzz"]) {
      await expect(verifySessionToken(bad, NOW, SECRET)).resolves.toBeNull();
    }
  });

  it("비밀키가 없으면 어떤 토큰도 통과시키지 않는다", async () => {
    const token = await createSessionToken("a@b.c", "admin", NOW, SECRET);
    await expect(verifySessionToken(token, NOW, null)).resolves.toBeNull();
  });
});

describe("접근 규칙", () => {
  it("조회는 공개, 쓰기·AI 호출은 로그인 필요", () => {
    expect(isPublicApiRequest("GET", "/api/games")).toBe(true);
    expect(isPublicApiRequest("HEAD", "/api/seasons")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPublicApiRequest(method, "/api/reset")).toBe(false);
    }
    expect(isPublicApiRequest("POST", "/api/analyze-team")).toBe(false);
  });

  it("로그인 API는 항상 공개", () => {
    expect(isPublicApiRequest("POST", "/api/auth/login")).toBe(true);
    expect(isPublicApiRequest("POST", "/api/auth/logout")).toBe(true);
  });

  it("업로드·파일·가져오기 화면만 보호한다", () => {
    expect(isProtectedPage("/upload")).toBe(true);
    expect(isProtectedPage("/files")).toBe(true);
    expect(isProtectedPage("/import")).toBe(true);
    expect(isProtectedPage("/")).toBe(false);
    expect(isProtectedPage("/records")).toBe(false);
    expect(isProtectedPage("/uploads-archive")).toBe(false);
  });
});
