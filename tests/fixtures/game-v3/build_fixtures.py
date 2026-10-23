"""
경기 기록지 v3.0 테스트 파일 생성기.

공식 템플릿(.xlsm)에 가짜 선수로 경기 하나를 입력해 네 가지 파일을 만든다.
  recalculated.xlsx  LibreOffice로 다시 계산해 저장 (Excel로 저장한 파일과 같음, 수식 결과 있음)
  uncached.xlsx      수식 결과 없이 저장 (Excel로 다시 저장하지 않은 파일)
  today-formula.xlsx 경기 날짜를 입력하지 않아 =TODAY() 수식이 남은 파일 (Excel처럼 다시 계산해 저장)
  reviewed.xlsx      검수까지 끝낸 파일 (검수 요약 = 검수 완료)

사용: python build_fixtures.py <템플릿.xlsm 경로>   (LibreOffice `soffice` 필요)
결과는 이 폴더에 덮어쓴다. 기대값은 expected.json (기록지 수식 결과를 손으로 옮긴 값).
"""
import datetime as dt
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent

GAME_DATE = dt.date(2026, 10, 17)
BATTERS = {  # 행: (타순, 이름, 포지션, 1~6타석, 득점, 타점, 도루, 7~12타석)
    2: (1, "가선수", "CF", ["안타", "볼넷", "희생플라이", "2루타"], 1, 2, 1, ["안타"]),
    3: (2, "나선수", "SS", ["삼진", "루킹삼진", "낫아웃출루", "땅볼"], 0, 0, 0, []),
    4: (3, "다선수", "1B", ["홈런", "뜬공", "사구", "직선타"], 1, 1, 0, []),
    5: (4, "라선수", "C", ["희생번트", "안타", "병살", "포수방해"], 0, 0, 0, []),
    6: (5, "마선수", "3B", ["볼넷", "3루타", "실책출루"], 1, 1, 0, []),
    7: (6, "바선수", "LF", ["야수선택", "땅볼", "안타"], 0, 0, 1, []),
    8: (7, "사선수", "RF", ["뜬공", "삼진", "볼넷"], 0, 0, 0, []),
    9: (8, "아선수", "2B", ["땅볼", "2루타", "안타"], 1, 0, 0, []),
    10: (9, "자선수", "DH", ["삼진", "뜬공"], 0, 0, 0, []),
    12: (9, "차선수", "PH", ["안타"], 0, 0, 0, []),  # 11행을 비우고 교체 선수
}
PITCHERS = [  # 이름, 결과, 아웃, 투구수, 피안타, 실점, 자책, 볼넷, 사구, 삼진, 피홈런
    ("카선수", "승", 12, 60, 3, 2, 1, 2, 1, 5, 1),
    ("타선수", "홀", 6, 25, 1, 0, 0, 1, 0, 3, 0),
    ("파선수", "세", 3, 12, 0, 0, 0, 0, 0, 2, 0),
]


def fill(template: Path, *, reviewed=False, today_formula=False) -> openpyxl.Workbook:
    wb = openpyxl.load_workbook(template)
    # 기록 방법 시트 '입력 예시' 표의 이름 칸(헤더 '이름' 바로 아래)을 가명으로
    guide = wb["기록 방법"]
    for row in guide.iter_rows():
        for c in row:
            if c.value == "이름":
                guide.cell(c.row + 1, c.column).value = "홍길동"

    g = wb["경기 정보"]
    if not today_formula:
        g["C4"] = GAME_DATE
    g["C5"], g["C6"], g["C7"], g["C8"], g["C9"], g["C10"] = "테스트팀", "원정", "테스트구장", 4, 2, 7
    if reviewed:
        g["C12"], g["C13"], g["C14"], g["C15"] = "기록원A", "기록원B", "검수자1", "검수자2"
        g["C16"], g["C22"] = GAME_DATE + dt.timedelta(days=1), GAME_DATE + dt.timedelta(days=2)
        g["C25"], g["C26"] = "확인 완료", "대조 완료"

    b = wb["타자 기록"]
    for r in range(2, 17):
        for col in list(range(1, 13)) + list(range(22, 28)):
            b.cell(r, col).value = None
    for r, (order, name, pos, pas, runs, rbi, sb, ext) in BATTERS.items():
        b.cell(r, 1).value, b.cell(r, 2).value, b.cell(r, 3).value = order, name, pos
        for i, v in enumerate(pas):
            b.cell(r, 4 + i).value = v
        b.cell(r, 10).value, b.cell(r, 11).value, b.cell(r, 12).value = runs, rbi, sb
        for i, v in enumerate(ext):
            b.cell(r, 22 + i).value = v

    t = wb["투수 기록"]
    for r in range(2, 12):
        for col in [1, 2, 3] + list(range(5, 13)):
            t.cell(r, col).value = None
    for i, row in enumerate(PITCHERS):
        for col, v in zip([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12], row):
            t.cell(2 + i, col).value = v

    wb["주요 기록"]["B1"] = "5회 1사 2루 가선수 2루타"
    return wb


def recalc(src: Path, dest: Path):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", tmp, str(src)],
                       check=True, capture_output=True, timeout=180)
        shutil.move(Path(tmp) / (src.stem + ".xlsx"), dest)


def main(template: Path):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        fill(template).save(HERE / "uncached.xlsx")
        fill(template, today_formula=True).save(tmp / "today-formula.xlsx")
        recalc(tmp / "today-formula.xlsx", HERE / "today-formula.xlsx")
        fill(template).save(tmp / "recalculated.xlsx")
        recalc(tmp / "recalculated.xlsx", HERE / "recalculated.xlsx")
        fill(template, reviewed=True).save(tmp / "reviewed.xlsx")
        recalc(tmp / "reviewed.xlsx", HERE / "reviewed.xlsx")
    print("생성 완료:", ", ".join(p.name for p in sorted(HERE.glob("*.xlsx"))))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
