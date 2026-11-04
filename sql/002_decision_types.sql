-- 판단 유형 enum 보강
-- 상황 기록 화면이 제공하던 '내야 전진', '노더블 얼라인'이 enum에 없어 저장이 실패했다.
-- (대타/대주자/수비 시프트는 코드에서 기존 enum 값 pinch_hitter/pinch_runner/defensive_alignment로 맞춤)
-- 추가만 하므로 기존 데이터·코드에 영향 없음.

alter type public.decision_type add value if not exists 'infield_in';
alter type public.decision_type add value if not exists 'no_doubles';
