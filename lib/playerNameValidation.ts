const NON_PLAYER_KEYWORDS = [
  "투수",
  "포수",
  "유격",
  "유격수",
  "좌익",
  "좌익수",
  "우익",
  "우익수",
  "중견",
  "중견수",
  "내야",
  "외야",
  "지명타자",
  "지명",
  "볼넷",
  "볼",
  "스트라이크",
  "스트",
  "파울",
  "삼진",
  "헛스윙",
  "루킹",
  "낫아웃",
  "안타",
  "홈런",
  "사구",
  "사사구",
  "실책",
  "도루",
  "아웃",
  "플라이",
  "뜬공",
  "땅볼",
  "희생",
  "폭투",
  "보크",
  "송구",
  "포구",
  "진루",
  "득점",
  "타점",
  "수비",
  "공격",
  "교체",
  "라인업",
  "경기",
  "기록",
  "종료",
  "무실책",
  "버뮤다",
  "독침수거",
  "상대",
  "타자일순",
];

function normalizeCandidate(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^P\s+/i, "")
    .replace(/^투수(?:\s*교체)?\s*[:：]?\s*/u, "")
    .replace(/\([^)]+\)$/u, "")
    .trim();
}

export function isLikelyPlayerName(value: unknown) {
  const candidate = normalizeCandidate(value);
  const compact = candidate.replace(/\s+/g, "");

  if (!compact) return false;
  if (compact.length < 2 || compact.length > 6) return false;
  if (/[0-9/:]/.test(compact)) return false;
  if (!/^[가-힣A-Za-z]+$/u.test(compact)) return false;

  return !NON_PLAYER_KEYWORDS.some((keyword) => compact.includes(keyword));
}

export function sanitizeImportedPlayerName(value: unknown) {
  const candidate = normalizeCandidate(value);
  return isLikelyPlayerName(candidate) ? candidate : "";
}
