export type Lang = "ko" | "en";

const translations = {
  // Header
  "site.title": { ko: "Utah Devils Analytics", en: "Utah Devils Analytics" },
  "site.season": { ko: "시즌", en: "Season" },
  "site.players": { ko: "Players", en: "Players" },
  "site.career": { ko: "통산 기록", en: "Career Stats" },

  // Nav
  "nav.upload": { ko: "📊 업로드", en: "📊 Upload" },
  "nav.import": { ko: "📚 역대 기록", en: "📚 History" },
  "nav.back": { ko: "← 대시보드로 돌아가기", en: "← Back to Dashboard" },

  // Search
  "search.placeholder": { ko: "선수 검색 (이름 또는 등번호)", en: "Search player (name or number)" },
  "search.noResult": { ko: "에 해당하는 선수가 없습니다", en: "No players found for" },

  // Team Stats
  "stats.teamAvg": { ko: "팀 타율", en: "Team AVG" },
  "stats.teamOBP": { ko: "팀 출루율", en: "Team OBP" },
  "stats.teamERA": { ko: "팀 ERA", en: "Team ERA" },
  "stats.sb": { ko: "도루", en: "SB" },
  "stats.wls": { ko: "승-패-세", en: "W-L-SV" },
  "stats.so": { ko: "삼진(타)", en: "SO(B)" },

  // Batting Table
  "batting.title": { ko: "⚾ 타자 기록", en: "⚾ Batting Stats" },
  "batting.sortOps": { ko: "OPS 순", en: "by OPS" },
  "batting.name": { ko: "이름", en: "Name" },
  "batting.pa": { ko: "타석", en: "PA" },
  "batting.ab": { ko: "타수", en: "AB" },
  "batting.h": { ko: "안타", en: "H" },
  "batting.rbi": { ko: "타점", en: "RBI" },
  "batting.bb": { ko: "볼넷", en: "BB" },
  "batting.so": { ko: "삼진", en: "SO" },
  "batting.sb": { ko: "도루", en: "SB" },
  "batting.avg": { ko: "타율", en: "AVG" },
  "batting.obp": { ko: "출루율", en: "OBP" },
  "batting.slg": { ko: "장타율", en: "SLG" },
  "batting.runs": { ko: "득점", en: "R" },
  "batting.doubles": { ko: "2루타", en: "2B" },
  "batting.triples": { ko: "3루타", en: "3B" },
  "batting.hr": { ko: "홈런", en: "HR" },
  "batting.hbp": { ko: "사구", en: "HBP" },

  // Pitching Table
  "pitching.title": { ko: "🏏 투수 기록", en: "🏏 Pitching Stats" },
  "pitching.sortEra": { ko: "ERA 순", en: "by ERA" },
  "pitching.w": { ko: "승", en: "W" },
  "pitching.l": { ko: "패", en: "L" },
  "pitching.sv": { ko: "세", en: "SV" },
  "pitching.ip": { ko: "이닝", en: "IP" },
  "pitching.ha": { ko: "피안타", en: "HA" },
  "pitching.er": { ko: "자책", en: "ER" },
  "pitching.bb": { ko: "볼넷", en: "BB" },
  "pitching.so": { ko: "삼진", en: "SO" },
  "pitching.ra": { ko: "실점", en: "RA" },
  "pitching.hra": { ko: "피홈런", en: "HRA" },
  "pitching.wl": { ko: "승-패", en: "W-L" },
  "pitching.save": { ko: "세이브", en: "Save" },

  // Player Detail
  "player.notFound": { ko: "선수를 찾을 수 없습니다.", en: "Player not found." },
  "player.pitcher": { ko: "투수", en: "Pitcher" },
  "player.seasonData": { ko: "시즌 데이터", en: "Season Data" },
  "player.battingRecord": { ko: "⚾ 타격 기록", en: "⚾ Batting Stats" },
  "player.pitchingRecord": { ko: "🏏 투수 기록", en: "🏏 Pitching Stats" },

  // OPS Grades
  "grade.elite": { ko: "엘리트", en: "Elite" },
  "grade.allstar": { ko: "올스타급", en: "All-Star" },
  "grade.aboveAvg": { ko: "평균 이상", en: "Above Avg" },
  "grade.belowAvg": { ko: "평균 이하", en: "Below Avg" },
  "grade.needsWork": { ko: "개선 필요", en: "Needs Work" },

  // ERA Grades
  "grade.ace": { ko: "에이스", en: "Ace" },
  "grade.excellent": { ko: "우수", en: "Excellent" },
  "grade.average": { ko: "보통", en: "Average" },
  "grade.unstable": { ko: "불안정", en: "Unstable" },

  // AI Report
  "ai.title": { ko: "AI 분석 리포트", en: "AI Analysis Report" },
  "ai.analyze": { ko: "🤖 AI 분석 받기", en: "🤖 Get AI Analysis" },
  "ai.reanalyze": { ko: "🔄 최신 기록으로 재분석", en: "🔄 Re-analyze with Latest" },
  "ai.loading": { ko: "AI 분석 중... (10~15초)", en: "Analyzing... (10~15s)" },
  "ai.description": { ko: "AI가 이 선수의 기록을 분석하여 피드백을 생성합니다", en: "AI will analyze this player's stats and generate feedback" },
  "ai.networkError": { ko: "네트워크 오류가 발생했습니다", en: "Network error occurred" },
  "ai.lastAnalysis": { ko: "마지막 분석", en: "Last analysis" },
  "ai.strengths": { ko: "✦ 강점", en: "✦ Strengths" },
  "ai.improvements": { ko: "⚡ 개선 포인트", en: "⚡ Areas to Improve" },
  "ai.trainingPlan": { ko: "📋 훈련 방향", en: "📋 Training Plan" },

  // Upload Page
  "upload.title": { ko: "📊 데이터 업로드", en: "📊 Data Upload" },
  "upload.desc": { ko: "엑셀 파일을 업로드하여 선수 기록을 추가합니다", en: "Upload Excel files to add player stats" },
  "upload.format": { ko: "📋 엑셀 파일 양식", en: "📋 Excel File Format" },
  "upload.drag": { ko: "엑셀 파일을 드래그하거나 클릭하여 선택", en: "Drag or click to select an Excel file" },
  "upload.button": { ko: "📤 데이터 업로드하기", en: "📤 Upload Data" },
  "upload.uploading": { ko: "업로드 중...", en: "Uploading..." },
  "upload.success": { ko: "✅ 업로드 성공!", en: "✅ Upload Success!" },
  "upload.error": { ko: "❌ 오류 발생", en: "❌ Error" },
  "upload.check": { ko: "→ 대시보드에서 확인하기", en: "→ Check Dashboard" },

  // Import Page
  "import.title": { ko: "📚 역대 기록 임포트", en: "📚 Import Career Stats" },
  "import.desc": { ko: "Career Total 엑셀 파일을 업로드하여 역대 선수 기록을 한 번에 가져옵니다", en: "Upload Career Total Excel to import all historical player stats" },
  "import.format": { ko: "📋 지원하는 엑셀 형식", en: "📋 Supported Excel Format" },
  "import.auto": { ko: "각 시트의 타자기록 + 투수기록 섹션을 자동으로 감지합니다. 이미 존재하는 기록은 건너뜁니다.", en: "Auto-detects batting + pitching sections. Existing records are skipped." },
  "import.drag": { ko: "Career Total 엑셀 파일을 드래그하거나 클릭", en: "Drag or click to select Career Total Excel" },
  "import.button": { ko: "📚 역대 기록 임포트하기", en: "📚 Import Career Stats" },
  "import.importing": { ko: "임포트 중...", en: "Importing..." },
  "import.success": { ko: "✅ 임포트 성공!", en: "✅ Import Success!" },

  // Season
  "season.career": { ko: "통산", en: "Career" },

  // Lang
  "lang.toggle": { ko: "EN", en: "한" },
} as const;

export type TransKey = keyof typeof translations;

export function t(key: TransKey, lang: Lang): string {
  return translations[key]?.[lang] || key;
}

export default translations;