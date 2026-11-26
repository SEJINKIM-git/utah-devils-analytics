/**
 * 숫자 동일성 점검용 스냅숏.
 *
 * 화면(대시보드, /records, 선수 페이지)의 서버 렌더 결과에서 보이는 글자만 뽑아 파일로 저장한다.
 * 작업 전(main)과 작업 후(브랜치)에 각각 실행한 뒤 두 폴더를 diff 하면 숫자가 바뀌었는지 알 수 있다.
 *
 *   BASE_URL=http://localhost:3200 node tests/e2e/number-snapshot.mjs <출력 폴더> --seasons 2026,2025,Career --players 12,34,56
 *   diff -r <main 폴더> <브랜치 폴더>
 *
 * 읽기(GET)만 한다. 출력에는 실제 선수 이름이 들어가므로 저장소에 커밋하지 않는다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) {
  console.error("사용법: node tests/e2e/number-snapshot.mjs <출력 폴더> [--seasons a,b] [--players 1,2,3]");
  process.exit(2);
}
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
};
const seasons = arg("seasons");
const players = arg("players");

/** HTML → 화면에 보이는 글자. 스크립트·스타일·주석을 버리고 태그 경계를 줄바꿈으로 바꾼다. */
export function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 숫자처럼 보이는 토큰만 (.333, 3.96, 46.2, 12, ---) */
export function numericTokens(text) {
  return text.match(/(?<![\w.])(?:\d+\.\d+|\.\d+|\d+|---)(?![\w.])/g) || [];
}

const pages = [];
const withSeason = (base, season) => (season ? `${base}?season=${encodeURIComponent(season)}` : base);
for (const season of seasons.length ? seasons : [""]) {
  pages.push(["dashboard", season, withSeason("/", season)]);
  pages.push(["records", season, withSeason("/records", season)]);
  for (const id of players) pages.push([`player-${id}`, season, withSeason(`/players/${id}`, season)]);
}

mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const [name, season, url] of pages) {
  const res = await fetch(BASE + url, { headers: { cookie: "lang=ko" } });
  if (!res.ok) {
    console.error(`FAIL ${res.status} ${url}`);
    failed += 1;
    continue;
  }
  const text = visibleText(await res.text());
  const file = `${name}${season ? `.${season}` : ""}`;
  writeFileSync(path.join(outDir, `${file}.txt`), text + "\n");
  writeFileSync(path.join(outDir, `${file}.numbers.txt`), numericTokens(text).join("\n") + "\n");
  console.log(`ok   ${url}  (${numericTokens(text).length} numbers)`);
}
process.exit(failed ? 1 : 0);
