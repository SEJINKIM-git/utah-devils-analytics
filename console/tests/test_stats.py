import pytest

from core.stats import (ERA_BASE_INNINGS, InvalidInningsError, batting_rates, ip_to_outs, outs_to_ip,
                        pitching_rates)


@pytest.mark.parametrize("ip,outs", [(0, 0), (3, 9), (3.1, 10), (3.2, 11), (46.2, 140), ("12.1", 37), (None, 0)])
def test_ip_to_outs(ip, outs):
    assert ip_to_outs(ip) == outs


@pytest.mark.parametrize("bad", [13.5, 46.6, 85.4, 3.3])
def test_invalid_notation_rejected(bad):
    with pytest.raises(InvalidInningsError):
        ip_to_outs(bad)


def test_roundtrip():
    for outs in range(0, 400):
        assert ip_to_outs(outs_to_ip(outs)) == outs


def test_notation_sum_bug_is_avoided():
    # 기록지 SUM: 30.2 + 55.2 = 85.4 (불가능한 값). 아웃카운트로 더하면 86.1
    assert outs_to_ip(ip_to_outs(30.2) + ip_to_outs(55.2)) == "86.1"


def test_batting_matches_scoresheet_2023_total():
    # 2023 시트 '통산' 행: H63 AB208 PA257 BB43 HBP4 2B9 3B6 HR0 → .303 / .428 / .404 / .832
    r = batting_rates(hits=63, ab=208, pa=257, bb=43, hbp=4, doubles=9, triples=6, hr=0)
    assert round(r.avg, 4) == 0.3029
    assert round(r.obp, 4) == 0.4280
    assert round(r.slg, 4) == 0.4038
    assert round(r.ops, 4) == 0.8319


def test_era_uses_true_innings():
    # ER 37, 46.2이닝(=46⅔). 5이닝 기준 ERA = 37*5/46.667 = 3.964
    r = pitching_rates(outs=140, er=37, ha=66, bb=42, hbp=10, so=88)
    assert ERA_BASE_INNINGS == 5
    assert round(r.era, 3) == 3.964


def test_zero_denominators():
    assert batting_rates(0, 0, 0, 0, 0, 0, 0, 0).avg is None
    assert pitching_rates(0, 0, 0, 0, 0, 0).era is None
