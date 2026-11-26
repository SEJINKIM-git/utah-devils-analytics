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
 *  - 메뉴: 하단 네 칸(선수 · 경기 · 팀 · 검색), 사이드바 묶음, 현재 위치 표시
 *  - 선수 페이지: 큰 숫자 3개, 기능 카드 전환(?view=), 비교 버튼, 즐겨찾기 → 대시보드 카드
 *  - 기존 주소가 그대로 열리고 ?season= 이 유지되는지
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

const browser = await chromium.launch();

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

      // ── 메뉴 재편 ──
      const crumbs = (await page.locator(".crumb-item").allTextContents()).map((text) => text.replace("›", "").trim());
      check(`[${tag}] 현재 위치: 팀 › 선수 › 이름`, crumbs.length === 3 && crumbs[0] === (lang === "ko" ? "팀" : "Team") && crumbs[1] === (lang === "ko" ? "선수" : "Players") && crumbs[2].length > 0, crumbs.join(" > "));
      if (mobile) {
        const slots = (await page.locator(".mobile-nav-item").allTextContents()).map((text) => text.trim());
        check(`[${tag}] 하단 메뉴 네 칸`, JSON.stringify(slots) === JSON.stringify(lang === "ko" ? ["선수", "경기", "팀", "검색"] : ["Players", "Games", "Team", "Search"]), slots.join(","));
        check(`[${tag}] 지금 묶음(선수) 표시`, (await page.locator('[data-testid="mobile-nav-player"]').getAttribute("aria-current")) === "true");
        const slot = await sizeOf(page, ".mobile-nav-item");
        check(`[${tag}] 하단 메뉴 누르는 영역 44px`, slot !== null && slot.h >= 44 && slot.w >= 44, JSON.stringify(slot));
        check(`[${tag}] 가로 스크롤 없음 (선수 페이지)`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      } else {
        const groups = (await page.locator(".sidebar-section-label").allTextContents()).map((text) => text.trim());
        check(`[${tag}] 사이드바 묶음: 선수 · 경기 · 팀 (관리는 로그인 전 숨김)`, JSON.stringify(groups) === JSON.stringify(lang === "ko" ? ["선수", "경기", "팀"] : ["Players", "Games", "Team"]), groups.join(","));
        check(`[${tag}] 사이드바 항목 8개 중 업로드만 숨김`, (await page.locator(".sidebar-nav-item").count()) === 8);
      }

      // ── 선수 페이지: 요약 먼저 ──
      check(`[${tag}] 큰 숫자 3개`, (await page.locator(".player-hero-number").count()) === 3);
      const heroCodes = (await page.locator(".player-hero-number-label").allTextContents()).join(" ");
      check(`[${tag}] 큰 숫자는 타율·출루율·OPS`, ["AVG", "OBP", "OPS"].every((code) => heroCodes.includes(code)), heroCodes);
      if (lang === "ko") check(`[${tag}] 쉬운 말이 먼저 (출루율 + 작은 OBP)`, heroCodes.includes("출루율") && heroCodes.includes("타율"), heroCodes);
      const cards = page.locator(".pcard");
      check(`[${tag}] 기능 카드 5개`, (await cards.count()) === 5);
      check(`[${tag}] 처음에는 모두 접혀 있음`, (await page.locator('.pcard-head[aria-expanded="true"]').count()) === 0);
      const cta = page.locator('[data-testid="compare-cta"]');
      check(`[${tag}] 비교 버튼 → /compare?a=`, ((await cta.getAttribute("href")) || "").startsWith(`/compare?a=${PLAYER_ID}&season=${SEASON}`), await cta.getAttribute("href"));
      const ctaSize = await sizeOf(page, '[data-testid="compare-cta"]');
      check(`[${tag}] 비교 버튼 누르는 영역 44px`, ctaSize !== null && ctaSize.h >= 44, JSON.stringify(ctaSize));

      // 카드 전환: 키보드로 열기 → 주소에 ?view= → 다른 카드 → 닫기
      await page.locator('.pcard[data-view="season"] .pcard-head').focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(/view=season/);
      check(`[${tag}] 시즌 기록 카드 열림 (?view=season, season 유지)`, (await page.locator("#pcard-body-season").isVisible()) && page.url().includes(`season=${SEASON}`), page.url());
      await shot(page, `player-season-${tag}`);
      await page.locator('.pcard[data-view="gamelog"] .pcard-head').click();
      await page.waitForURL(/view=gamelog/);
      check(`[${tag}] 카드는 하나만 열림`, (await page.locator("#pcard-body-gamelog").isVisible()) && !(await page.locator("#pcard-body-season").isVisible()));
      await page.locator('.pcard[data-view="gamelog"] .pcard-head').click();
      await page.waitForURL((url) => !url.search.includes("view="));
      check(`[${tag}] 다시 누르면 접힘`, (await page.locator('.pcard-head[aria-expanded="true"]').count()) === 0);

      // 주소로 바로 열기
      for (const viewId of ["gamelog", "season", "splits", "ai", "goals"]) {
        await page.goto(`${BASE}/players/${PLAYER_ID}?season=${SEASON}&view=${viewId}`, { waitUntil: "networkidle" });
        check(`[${tag}] ?view=${viewId} 로 바로 열림`, await page.locator(`#pcard-body-${viewId}`).isVisible());
      }

      // ── 즐겨찾기: 별 → 대시보드 카드 → 다시 누르면 사라짐 ──
      await page.goto(`${BASE}/?season=${SEASON}`, { waitUntil: "networkidle" });
      check(`[${tag}] 즐겨찾기가 없으면 영역 숨김`, (await page.locator('[data-testid="favorite-players"]').count()) === 0);
      await page.goto(`${BASE}/players/${PLAYER_ID}?season=${SEASON}`, { waitUntil: "networkidle" });
      const star = page.locator('[data-testid="favorite-toggle"]');
      await star.focus();
      await page.keyboard.press("Enter");
      check(`[${tag}] 별 버튼 켜짐`, (await star.getAttribute("aria-pressed")) === "true");
      await page.goto(`${BASE}/?season=${SEASON}`, { waitUntil: "networkidle" });
      const favCard = page.locator(".fav-card");
      check(`[${tag}] 대시보드에 즐겨찾기 선수 카드`, (await favCard.count()) === 1);
      await page.locator(".fav-card-value").filter({ hasText: /\d|---/ }).waitFor({ timeout: 10_000 }).catch(() => {});
      check(`[${tag}] 카드에 대표 지표 하나`, /^(\d\.\d{2,3}|---)$/.test(((await page.locator(".fav-card-value").textContent()) || "").trim()), await page.locator(".fav-card-value").textContent());
      await shot(page, `home-favorites-${tag}`);
      await favCard.click();
      await page.waitForURL(new RegExp(`/players/${PLAYER_ID}\\?season=${SEASON}`));
      await star.click();
      check(`[${tag}] 별 버튼 꺼짐`, (await star.getAttribute("aria-pressed")) === "false");
      await page.goto(`${BASE}/?season=${SEASON}`, { waitUntil: "networkidle" });
      check(`[${tag}] 즐겨찾기를 빼면 영역이 다시 숨겨짐`, (await page.locator('[data-testid="favorite-players"]').count()) === 0);

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

// ── 기존 주소: 그대로 열리고 ?season= 이 유지된다 (주소를 옮기지 않았으므로 리다이렉트도 없다) ──
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  for (const route of ["/", "/records", "/lineup", "/compare", "/team-analysis", "/situations/hub", "/situations/offense", "/situations/defense", "/situations/game-notes", "/situations/post-game", "/schedule", "/calendar", "/game-review", `/players/${PLAYER_ID}`]) {
    const response = await page.goto(`${BASE}${route}?season=${SEASON}`, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    check(`[기존 주소] ${route}`, response?.status() === 200 && url.pathname === route && url.searchParams.get("season") === SEASON, `${response?.status()} ${page.url()}`);
  }
  // 운영 화면은 여전히 로그인으로 보낸다 (인증 범위 그대로)
  for (const route of ["/upload", "/files", "/import"]) {
    await page.goto(`${BASE}${route}?season=${SEASON}`, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    check(`[기존 주소] ${route} → 로그인 (돌아올 주소에 season 유지)`, url.pathname === "/login" && (url.searchParams.get("next") || "").includes(`season=${SEASON}`), page.url());
  }
  // 비교 화면은 ?a= 로 첫 선수를 미리 고른다
  await page.goto(`${BASE}/compare?a=${PLAYER_ID}&season=${SEASON}`, { waitUntil: "networkidle" });
  check("[비교] ?a= 로 넘어온 주소가 열린다", new URL(page.url()).searchParams.get("a") === PLAYER_ID);
  await context.close();
}

await browser.close();
console.log(`\n${passed}개 통과, ${failures.length}개 실패`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
