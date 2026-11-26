/**
 * 화면 흐름 E2E (Playwright).
 *
 *   node tests/e2e/mock-supabase.mjs &                     # 가상 기록
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 ... npm run build && npx next start -p 3100 &
 *   BASE_URL=http://localhost:3100 node tests/e2e/ui-flows.mjs
 *   BASE_URL=... SHOT_DIR=docs/screenshots/palette node tests/e2e/ui-flows.mjs   # 스크린숏도 저장
 *
 * 확인하는 것
 *  - 검색 팔레트: 열기(단축키·버튼) → "출루" 입력 → 지표 선택 → 지표 설명 시트 표시 → 닫기 (키보드만으로)
 *  - combobox 역할, aria-activedescendant
 *  - 숫자를 눌러 시트 열기, 시트의 값이 화면 값과 같은지
 *  - 누르는 영역 44px, 글자 대비 4.5:1 (다크·라이트)
 * 390px(휴대폰)과 1280px(PC), 한·영, 다크·라이트에서 돌린다.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOT_DIR = process.env.SHOT_DIR || "";
const SEASON = process.env.E2E_SEASON ?? "2026";
const PLAYER_ID = process.env.E2E_PLAYER_ID ?? "1";

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}

/** 글자색과 그 뒤 배경색의 대비. 반투명 배경은 뒤 배경과 섞어서 계산한다. */
async function contrastOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = (value) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = "1"] = m[1].split(/[,/ ]+/).filter(Boolean);
      return { r: +r, g: +g, b: +b, a: +a };
    };
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 1) break;
    }
    let base = { r: 255, g: 255, b: 255 };
    for (const layer of layers.reverse()) {
      base = { r: layer.r * layer.a + base.r * (1 - layer.a), g: layer.g * layer.a + base.g * (1 - layer.a), b: layer.b * layer.a + base.b * (1 - layer.a) };
    }
    const fg = parse(getComputedStyle(el).color);
    const text = { r: fg.r * fg.a + base.r * (1 - fg.a), g: fg.g * fg.a + base.g * (1 - fg.a), b: fg.b * fg.a + base.b * (1 - fg.a) };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [hi, lo] = [lum(text), lum(base)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

async function sizeOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
}

// PW_CHANNEL=chrome 이면 설치돼 있는 Chrome을 쓴다 (CI 러너는 Playwright 내장 브라우저를 설치할 수 없다)
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});

for (const width of [390, 1280]) {
  for (const theme of ["dark", "light"]) {
    for (const lang of ["ko", "en"]) {
      const tag = `${width}-${theme}-${lang}`;
      const mobile = width < 881;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 800 }, deviceScaleFactor: 2, hasTouch: mobile });
      await context.addCookies([{ name: "lang", value: lang, url: BASE }]);
      await context.addInitScript((value) => window.localStorage.setItem("ud-theme", value), theme);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));

      const metricName = lang === "ko" ? "출루율" : "On-base %";
      const query = lang === "ko" ? "출루" : "on base";

      // ── 홈 ──
      await page.goto(`${BASE}/?season=${SEASON}`, { waitUntil: "networkidle" });
      check(`[${tag}] 테마 적용`, (await page.getAttribute("html", "data-theme")) === theme);
      await shot(page, `home-${tag}`);

      // ── 검색 팔레트 열기 ──
      await page.goto(`${BASE}/records?season=${SEASON}`, { waitUntil: "networkidle" });
      if (mobile) await page.click('[data-testid="open-search-mobile"]');
      else await page.keyboard.press("Control+K");
      const input = page.locator('input[role="combobox"]');
      await input.waitFor({ state: "visible" });
      check(`[${tag}] 팔레트 열림 + 입력창 포커스`, await input.evaluate((el) => document.activeElement === el));
      check(`[${tag}] 안내 문구`, (await input.getAttribute("placeholder")) === (lang === "ko" ? "선수 이름이나 궁금한 걸 입력하세요" : "Type a player's name or a question"));
      check(`[${tag}] 예시 칩 3개`, (await page.locator(".cmdk-chip").count()) === 3);
      const chip = await sizeOf(page, ".cmdk-chip");
      check(`[${tag}] 칩 누르는 영역 44px`, chip !== null && chip.h >= 44, JSON.stringify(chip));
      await shot(page, `search-empty-${tag}`);

      // ── "출루" 입력 → 지표 ──
      await input.fill(query);
      const first = page.locator('[role="option"]').first();
      await first.waitFor({ state: "visible" });
      check(`[${tag}] 첫 결과가 ${metricName}`, ((await first.textContent()) || "").includes(metricName));
      const activeId = await input.getAttribute("aria-activedescendant");
      check(`[${tag}] aria-activedescendant가 선택된 항목`, Boolean(activeId) && (await page.locator(`[id="${activeId}"]`).getAttribute("aria-selected")) === "true");
      check(`[${tag}] listbox 연결`, (await input.getAttribute("aria-controls")) === "cmdk-listbox" && (await page.locator("#cmdk-listbox").getAttribute("role")) === "listbox");
      const option = await sizeOf(page, '[role="option"]');
      check(`[${tag}] 결과 항목 높이 44px 이상`, option !== null && option.h >= 44, JSON.stringify(option));
      for (const selector of [".cmdk-item-title", ".cmdk-item-sub", ".cmdk-group-label"]) {
        const ratio = await contrastOf(page, selector);
        check(`[${tag}] 대비 4.5:1 ${selector}`, ratio !== null && ratio >= 4.5, ratio?.toFixed(2));
      }
      await shot(page, `search-${tag}`);

      // 화살표로 이동하면 activedescendant가 바뀐다
      const optionCount = await page.locator('[role="option"]').count();
      if (optionCount > 1) {
        await page.keyboard.press("ArrowDown");
        check(`[${tag}] ↓ 로 이동`, (await input.getAttribute("aria-activedescendant")) !== activeId);
        await page.keyboard.press("ArrowUp");
      }

      // ── Enter → 지표 설명 시트 ──
      await page.keyboard.press("Enter");
      const sheet = page.locator('.msheet[role="dialog"]');
      await sheet.waitFor({ state: "visible" });
      check(`[${tag}] 팔레트 닫힘`, (await page.locator(".cmdk").count()) === 0);
      check(`[${tag}] 시트 제목 ${metricName}`, ((await page.locator("#msheet-title").textContent()) || "").trim() === metricName);
      check(`[${tag}] 시트에 코드 OBP`, ((await page.locator(".msheet-code").textContent()) || "").trim() === "OBP");
      check(`[${tag}] 계산법 표시`, ((await page.locator(".msheet-formula").textContent()) || "").includes("÷"));
      await page.locator('[data-testid="msheet-team-value"]').filter({ hasText: /\d|---/ }).waitFor({ timeout: 10_000 }).catch(() => {});
      const teamValue = ((await page.locator('[data-testid="msheet-team-value"]').textContent()) || "").trim();
      check(`[${tag}] 팀 값 표시`, /^(\d?\.\d{3}|---)$/.test(teamValue), teamValue);
      await page.waitForTimeout(350); // 시트가 올라오는 움직임(0.2초)이 끝난 뒤에 잰다
      const box = await sheet.boundingBox();
      if (mobile) check(`[${tag}] 시트가 아래에서 올라옴`, box !== null && Math.round(box.y + box.height) >= 840 && Math.round(box.width) === width, JSON.stringify(box));
      else check(`[${tag}] 시트가 오른쪽 옆 패널`, box !== null && Math.round(box.x + box.width) === width && Math.round(box.width) === 420, JSON.stringify(box));
      for (const selector of [".msheet-summary", ".msheet-number-label", ".msheet-formula", ".msheet-note", ".msheet-toggle"]) {
        const ratio = await contrastOf(page, selector);
        check(`[${tag}] 대비 4.5:1 ${selector}`, ratio !== null && ratio >= 4.5, ratio?.toFixed(2));
      }
      for (const selector of [".msheet-close", ".msheet-toggle", ".msheet-link"]) {
        const size = await sizeOf(page, selector);
        check(`[${tag}] 누르는 영역 44px ${selector}`, size !== null && size.h >= 44 && size.w >= 44, JSON.stringify(size));
      }
      await shot(page, `metric-sheet-${tag}`);

      // 키보드로 펼치기: 팀 순위
      await page.locator(".msheet-toggle").first().focus();
      await page.keyboard.press("Enter");
      await page.locator("#msheet-rank-list").waitFor({ state: "visible" });
      check(`[${tag}] 팀 순위 펼침`, (await page.locator(".msheet-toggle").first().getAttribute("aria-expanded")) === "true");

      // Esc로 닫기
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      check(`[${tag}] Esc로 시트 닫힘`, true);

      // ── "/" 단축키 (PC) ──
      if (!mobile) {
        await page.locator("body").click({ position: { x: 600, y: 300 } });
        await page.keyboard.press("/");
        await input.waitFor({ state: "visible" });
        check(`[${tag}] "/" 로 열림`, true);
        await page.keyboard.press("Escape");
        await page.locator(".cmdk").waitFor({ state: "detached" });
        check(`[${tag}] Esc로 팔레트 닫힘`, true);
      }

      // ── 숫자를 눌러 시트 열기 (/records) ──
      const cell = page.locator("tbody .metric-value").first();
      if (await cell.count()) {
        const cellText = ((await cell.textContent()) || "").trim();
        await cell.focus();
        await page.keyboard.press("Enter");
        await sheet.waitFor({ state: "visible" });
        const shown = ((await page.locator('[data-testid="msheet-player-value"]').textContent()) || "").trim();
        check(`[${tag}] 숫자를 눌러 연 시트의 값 = 화면 값`, shown === cellText, `${shown} vs ${cellText}`);
        await page.locator('[data-testid="msheet-rank"]').filter({ hasText: /\d|—|-/ }).waitFor({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(350);
        await shot(page, `metric-sheet-player-${tag}`);
        await page.keyboard.press("Escape");
        await sheet.waitFor({ state: "detached" });
        check(`[${tag}] 닫으면 눌렀던 숫자로 포커스 복귀`, await cell.evaluate((el) => document.activeElement === el));
      } else {
        console.log(`  (기록이 없어 숫자 누르기 확인을 건너뜀: ${tag})`);
      }

      // ── 표 머리글 ──
      const header = page.locator("thead .metric-value").first();
      check(`[${tag}] 표 머리글이 버튼`, (await header.count()) > 0 && (await header.evaluate((el) => el.tagName)) === "BUTTON");

      // ── 선수 + 지표 → 선수 페이지에서 시트 ──
      await page.goto(`${BASE}/players/${PLAYER_ID}?season=${SEASON}&metric=OBP`, { waitUntil: "networkidle" });
      const opened = await sheet.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      check(`[${tag}] 주소의 ?metric= 으로 시트 열림`, opened);
      if (opened) {
        await page.keyboard.press("Escape");
        await sheet.waitFor({ state: "detached" });
        await page.waitForURL((url) => !url.search.includes("metric="), { timeout: 5_000 }).catch(() => {});
        check(`[${tag}] 닫으면 주소에서 metric이 빠지고 season은 남는다`, !page.url().includes("metric=") && page.url().includes(`season=${SEASON}`), page.url());
      }
      await shot(page, `player-${tag}`);

      // ── AI에게 물어보기 ──
      await page.goto(`${BASE}/records?season=${SEASON}`, { waitUntil: "networkidle" });
      if (mobile) await page.click('[data-testid="open-search-mobile"]');
      else await page.click('[data-testid="open-search"]');
      await input.waitFor({ state: "visible" });
      await input.fill(lang === "ko" ? "다음 경기 선발 추천해줘" : "who should start next game");
      await page.locator('[role="option"]').first().waitFor({ state: "visible" });
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/team-analysis\?/);
      check(`[${tag}] 질문이 /team-analysis로 넘어감 (season 유지)`, page.url().includes("q=") && page.url().includes(`season=${SEASON}`), page.url());
      await page.locator(".ask-banner-question").waitFor({ state: "visible" });
      check(`[${tag}] 넘어온 질문 표시`, true);

      check(`[${tag}] 화면 오류 없음`, errors.length === 0, errors.join(" | "));
      await context.close();
    }
  }
}

await browser.close();
console.log(`\n${passed}개 통과, ${failures.length}개 실패`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
