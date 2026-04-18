/**
 * parseDocxGameRecord.js
 *
 * 경기 기록 Word(.docx) 파일을 파싱하여 구조화된 데이터로 변환합니다.
 * 실제 9_26_VS_선학_경기_기록.docx 파일 구조를 기반으로 설계되었습니다.
 *
 * 파일 구조:
 *   [투구 기록 섹션]
 *     "1회초 "         ← 이닝 헤더
 *     "선발 박상언 "   ← 선발 투수
 *     "106 볼"         ← 구종/결과 라인
 *     "2회"            ← 이닝 헤더 (투수 이닝 경계)
 *     "황서현"         ← 투수 교체
 *     ...
 *   [타자 요약 섹션] (파일 하단)
 *     "이지성 삼진 "               ← 이름 + 결과 (스페이스 1개)
 *     "            (볼넷) 1타점"   ← continuation (선행 공백)
 *     "황서현  투수 앞 땅볼"        ← 이름 + 결과 (스페이스 2개 이상)
 *     "김태경(대타) 중전 안타"      ← 이름(역할) + 결과
 *
 * npm install mammoth
 */

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * docx 파일을 파싱합니다.
 * @param {File} file
 * @returns {Promise<{ gameInfo, battingStats, pitchingStats }>}
 */
export async function parseDocxGameRecord(file) {
  const mammoth = (await import('mammoth/mammoth.browser')).default;
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });

  // 빈 줄 제거, 원본 문자열 유지 (선행 공백 판단에 필요)
  const lines = value.split('\n').filter(l => l.trim().length > 0);
  return parseGameLines(lines);
}

// ─── 내부 파싱 ───────────────────────────────────────────────────────────────

const NON_PLAYER_KEYWORDS = [
  '투수', '포수', '유격', '유격수', '좌익', '좌익수', '우익', '우익수', '중견', '중견수',
  '내야', '외야', '볼넷', '볼', '스트', '스트라이크', '파울', '삼진', '헛스윙', '루킹',
  '낫아웃', '안타', '홈런', '사구', '사사구', '실책', '도루', '아웃', '플라이', '뜬공',
  '땅볼', '희생', '폭투', '보크', '송구', '포구', '진루', '득점', '타점', '수비', '공격',
  '교체', '라인업', '경기', '기록', '종료', '무실책', '버뮤다', '독침수거', '상대', '타자일순',
];

function sanitizePlayerName(value) {
  return String(value || '')
    .trim()
    .replace(/^P\s+/i, '')
    .replace(/^투수(?:\s*교체)?\s*[:：]?\s*/u, '')
    .replace(/\([^)]+\)$/u, '')
    .trim();
}

function isLikelyPlayerName(value) {
  const candidate = sanitizePlayerName(value).replace(/\s+/g, '');
  if (!candidate) return false;
  if (candidate.length < 2 || candidate.length > 6) return false;
  if (/[0-9/:]/.test(candidate)) return false;
  if (!/^[가-힣A-Za-z]+$/u.test(candidate)) return false;
  return !NON_PLAYER_KEYWORDS.some((keyword) => candidate.includes(keyword));
}

function buildParsedGame(pitchingMap, battingMap) {
  const score_them = Object.values(pitchingMap).reduce((sum, pitcher) => sum + pitcher.runs, 0);
  const score_us = Object.values(battingMap).reduce((sum, batter) => sum + batter.runs, 0);
  const result = score_us > score_them ? 'W' : score_us < score_them ? 'L' : 'D';

  return {
    gameInfo: { opponent: '', date: '', score_us, score_them, result },
    battingStats: Object.values(battingMap),
    pitchingStats: Object.values(pitchingMap),
  };
}

function parseGameLines(lines) {
  if (lines.some((line) => /^(?:\d+)(?:회)?[초말](?:\s|$)/u.test(line.trim()))) {
    return parseStructuredGameLines(lines);
  }

  // 투구 섹션과 타자 요약 섹션 분리
  // 타자 요약 섹션: 이닝 헤더·선발·구종 라인이 없고 한글 이름 패턴이 나오는 지점
  const summaryStart = findBattingSummaryStart(lines);
  const pitchLines = lines.slice(0, summaryStart);
  const summaryLines = lines.slice(summaryStart);

  return buildParsedGame(
    parsePitchingSection(pitchLines),
    parseBattingSection(summaryLines)
  );
}

export { parseGameLines };

function parseStructuredGameLines(lines) {
  const pitchingMap = {};
  const battingMap = {};
  let currentHalf = null;
  let currentPitcher = null;
  let currentBatter = null;
  let pendingInningCredit = false;

  const ensurePitcherRecord = (name) => {
    if (!name || !isLikelyPlayerName(name)) return null;
    const sanitized = sanitizePlayerName(name);
    if (!pitchingMap[sanitized]) pitchingMap[sanitized] = initPitcher(sanitized);
    currentPitcher = sanitized;
    if (pendingInningCredit) {
      pitchingMap[sanitized].innings++;
      pendingInningCredit = false;
    }
    return pitchingMap[sanitized];
  };

  const applyPitchingEvent = (line) => {
    const pitcher = ensurePitcherRecord(currentPitcher);
    if (!pitcher) return;

    if (line.includes('삼진') || line.includes('낫아웃')) pitcher.strikeouts++;
    if (line.includes('볼넷') || line.includes('사구') || line.includes('몸 맞는 볼')) pitcher.walks++;
    if (/안타|1루타|2루타|3루타|홈런/.test(line)) pitcher.hits++;

    const runsMatch = line.match(/\(실점(\d+)\)/) || line.match(/\((\d+)실점\)/);
    if (runsMatch) {
      pitcher.runs += parseInt(runsMatch[1], 10);
    } else if (line.includes('실점') && !line.includes('비실점') && !line.includes('무실점')) {
      pitcher.runs += 1;
    }
  };

  const handlePitchingLine = (line) => {
    if (!line) return;

    const pitcherMatch =
      line.match(/^P\s+([가-힣]{2,5})$/u) ||
      line.match(/^투수(?:\s*교체)?\s*[:：]?\s*([가-힣]{2,5})$/u) ||
      line.match(/^([가-힣]{2,5})$/u);

    if (pitcherMatch && isLikelyPlayerName(pitcherMatch[1])) {
      ensurePitcherRecord(pitcherMatch[1]);
      return;
    }

    applyPitchingEvent(line);
  };

  const handleBattingLine = (rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    if (/^\s{2,}/.test(rawLine) && currentBatter && battingMap[currentBatter]) {
      applyBattingResult(battingMap[currentBatter], trimmed);
      return;
    }

    const match = trimmed.match(/^([가-힣]{2,5}(?:\([^)]+\))?)\s*(.*)$/u);
    if (!match) return;

    const name = sanitizePlayerName(match[1]);
    const result = match[2].trim();

    if (!isLikelyPlayerName(name)) return;

    currentBatter = name;
    if (!battingMap[name]) battingMap[name] = initBatter(name);
    if (result) applyBattingResult(battingMap[name], result);
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const inningMatch = trimmed.match(/^(\d+)(?:회)?([초말])(?:\s+(.*))?$/u);
    if (inningMatch) {
      currentHalf = inningMatch[2] === '초' ? 'top' : 'bottom';
      currentBatter = null;
      if (currentHalf === 'top') pendingInningCredit = true;

      const remainder = (inningMatch[3] || '').trim();
      if (remainder) {
        if (currentHalf === 'top') handlePitchingLine(remainder);
        if (currentHalf === 'bottom') handleBattingLine(remainder);
      }
      continue;
    }

    if (currentHalf === 'top') handlePitchingLine(trimmed);
    if (currentHalf === 'bottom') handleBattingLine(rawLine);
  }

  for (const pitcher of Object.values(pitchingMap)) {
    pitcher.avgSpeed = pitcher.speedCount > 0
      ? Math.round((pitcher.speedTotal / pitcher.speedCount) * 10) / 10
      : 0;
    pitcher.earnedRuns = pitcher.runs;
    delete pitcher.speedTotal;
    delete pitcher.speedCount;
  }

  return buildParsedGame(pitchingMap, battingMap);
}

/**
 * 타자 요약 섹션이 시작되는 인덱스를 반환합니다.
 * 구종 숫자 라인("106 볼" 등)이 완전히 끝나고 이름+결과 패턴이 시작되는 지점.
 */
function findBattingSummaryStart(lines) {
  const PITCH_LINE  = /^\d{2,3}\s/;                    // "106 볼", "93 스트" 등
  const INNING_HDR  = /^\d+회/;
  const STARTER     = /^선발\s/;

  let lastPitchIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (PITCH_LINE.test(t) || INNING_HDR.test(t) || STARTER.test(t)) {
      lastPitchIdx = i;
    }
  }

  // lastPitchIdx 이후 첫 번째 한글 이름 라인을 요약 시작점으로 설정
  for (let i = lastPitchIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const nameMatch = line.match(/^([가-힣]{2,5}(?:\([^)]+\))?)/u);
    if (nameMatch && isLikelyPlayerName(nameMatch[1])) return i;
  }
  return lines.length; // 요약 섹션 없음
}

// ─── 투구 기록 파싱 ──────────────────────────────────────────────────────────

/**
 * BUG-1 수정: 이닝 헤더를 continue로 스킵했기 때문에
 * 같은 루프에서 innings++가 절대 실행되지 않던 버그를 수정.
 *
 * 수정 방법: 이닝 헤더 발견 시 즉시 현재 투수의 이닝 카운터를 올린 뒤,
 * 투수가 교체되면 새 투수를 등록하는 2단계 구조로 변경.
 */
function parsePitchingSection(lines) {
  const pitchingMap = {};   // { 이름: PitcherRecord }
  let currentPitcher = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── 이닝 헤더 감지 ───────────────────────────────────────────────────
    // BUG-1 FIX: 이닝 헤더를 continue로만 처리하지 않고,
    //            현재 투수의 innings를 올린 뒤 continue
    if (/^\d+회/.test(line)) {
      if (currentPitcher && pitchingMap[currentPitcher]) {
        pitchingMap[currentPitcher].innings++;
      }
      continue;
    }

    // ── 선발 투수 등록 ───────────────────────────────────────────────────
    if (line.startsWith('선발')) {
      const name = line.replace('선발', '').trim();
      currentPitcher = name;
      if (!pitchingMap[name]) pitchingMap[name] = initPitcher(name);
      continue;
    }

    // ── 투수 교체 감지 (한글 이름만 있는 라인) ───────────────────────────
    const nameOnly = line.match(/^([가-힣]{2,5})$/u);
    if (nameOnly && isLikelyPlayerName(nameOnly[1])) {
      currentPitcher = nameOnly[1];
      if (!pitchingMap[currentPitcher]) pitchingMap[currentPitcher] = initPitcher(currentPitcher);
      continue;
    }

    if (!currentPitcher) continue;
    const p = pitchingMap[currentPitcher];

    // ── 결과 파싱 ────────────────────────────────────────────────────────
    // 삼진
    if (line.includes('삼진') || line.includes('낫아웃')) p.strikeouts++;

    // 볼넷/사구 (중복 방지: '볼넷'이 있으면 '볼'도 포함되므로 먼저 체크)
    if (line.includes('볼넷') || line.includes('사구') || line.includes('몸 맞는 볼')) p.walks++;

    // 피안타 (2루타·3루타·홈런도 안타에 포함)
    if (/안타|1루타|2루타|3루타|홈런/.test(line)) p.hits++;

    // 실점: "(실점2)", "(1실점)", "실점" 패턴 모두 처리
    const runsMatch = line.match(/\(실점(\d+)\)/) || line.match(/\((\d+)실점\)/);
    if (runsMatch) {
      p.runs += parseInt(runsMatch[1]);
    } else if (line.includes('실점') && !line.includes('비실점') && !line.includes('무실점')) {
      p.runs += 1;
    }

    // 구속 (60~160km/h 범위)
    const speedMatch = line.match(/^(\d{2,3})\s/);
    if (speedMatch) {
      const spd = parseInt(speedMatch[1]);
      if (spd >= 60 && spd <= 160) {
        p.speedTotal += spd;
        p.speedCount++;
      }
    }
  }

  // 평균 구속 계산 및 내부 집계 필드 제거
  for (const p of Object.values(pitchingMap)) {
    p.avgSpeed = p.speedCount > 0
      ? Math.round((p.speedTotal / p.speedCount) * 10) / 10
      : 0;
    p.earnedRuns = p.runs; // docx에서 자책/비자책 구분 없으므로 실점 = 자책
    delete p.speedTotal;
    delete p.speedCount;
  }

  return pitchingMap;
}

// ─── 타자 요약 섹션 파싱 ─────────────────────────────────────────────────────

/**
 * BUG-2 수정: 실제 파일의 타자 요약 섹션 구조:
 *   1) "이름 결과"        (스페이스 1개, 같은 라인)
 *   2) "이름  결과"       (스페이스 2개+, 같은 라인)
 *   3) "이름"             (이름만, 다음 라인들이 결과)
 *   4) "            결과" (선행 공백 → 이전 타자의 continuation)
 *
 * 수정 방법: currentBatter 추적 + 선행 공백 라인을 continuation으로 처리
 */
function parseBattingSection(lines) {
  const battingMap = {};
  let currentBatter = null;

  // 한글 이름 패턴 (2~5자, 괄호 역할 포함 — 예: 김태경(대타))
  const NAME_RE = /^([가-힣]{2,5}(?:\([가-힣]+\))?)\s*(.*)/;

  for (const rawLine of lines) {
    const isContinuation = rawLine.match(/^\s{2,}/); // 선행 공백 2개 이상 → 이전 타자 continuation
    const line = rawLine.trim();
    if (!line) continue;

    if (isContinuation && currentBatter) {
      // continuation 라인: 현재 타자의 추가 타석 결과
      applyBattingResult(battingMap[currentBatter], line);
      continue;
    }

    // 새 타자 라인
    const m = NAME_RE.exec(line);
    if (!m) continue;

    const rawName = m[1];
    const result  = m[2].trim();

    // 이름에서 역할 괄호 제거 (예: "김태경(대타)" → "김태경")
    const name = sanitizePlayerName(rawName);
    if (!isLikelyPlayerName(name)) continue;
    currentBatter = name;
    if (!battingMap[name]) battingMap[name] = initBatter(name);

    if (result) {
      applyBattingResult(battingMap[name], result);
    }
  }

  return battingMap;
}

/**
 * 한 타석 결과 문자열을 타자 기록에 반영합니다.
 */
function applyBattingResult(b, result) {
  if (!b || !result) return;

  // 타점
  const rbiMatch = result.match(/(\d+)타점/);
  if (rbiMatch) b.rbi += parseInt(rbiMatch[1]);
  else if (result.includes('타점')) b.rbi++;

  // 득점
  if (result.includes('득점')) b.runs++;

  // 결과 분류 (우선순위 순)
  if (result.includes('홈런'))          { b.atBats++; b.hits++; b.homeRuns++; }
  else if (result.includes('3루타'))     { b.atBats++; b.hits++; b.triples++;  }
  else if (result.includes('2루타'))     { b.atBats++; b.hits++; b.doubles++;  }
  else if (result.includes('1루타') || result.includes('안타')) { b.atBats++; b.hits++; }
  else if (result.includes('삼진'))      { b.atBats++; b.strikeouts++;         }
  else if (result.includes('볼넷') || result.includes('사사구')) { b.walks++; }
  else if (result.includes('몸 맞는 볼') || result.includes('사구')) { b.hbp++; }
  else if (/땅볼|뜬공|플라이|직선타|라인드라이브|파울|아웃/.test(result)) { b.atBats++; }
}

// ─── 초기화 헬퍼 ─────────────────────────────────────────────────────────────

function initBatter(name) {
  return {
    name,
    atBats: 0, runs: 0, hits: 0,
    doubles: 0, triples: 0, homeRuns: 0,
    rbi: 0, walks: 0, hbp: 0, strikeouts: 0,
  };
}

function initPitcher(name) {
  return {
    name,
    innings: 0, hits: 0, runs: 0, earnedRuns: 0,
    walks: 0, strikeouts: 0, avgSpeed: 0,
    speedTotal: 0, speedCount: 0,
  };
}
