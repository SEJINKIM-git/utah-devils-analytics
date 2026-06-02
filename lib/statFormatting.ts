// Converts decimal innings to baseball notation: 3.333 → "3.1", 1.667 → "1.2"
export function formatIP(ip: number | string | null | undefined): string {
  const v = parseFloat(String(ip ?? 0));
  if (!isFinite(v) || v < 0) return "0";
  const full = Math.floor(v);
  const outs = Math.round((v - full) * 3); // 0, 1, or 2
  return outs === 0 ? String(full) : `${full}.${outs}`;
}

export function formatRateStat(
  value: unknown,
  digits = 3,
  fallback = "---"
) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "---") return fallback;

  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return fallback;

  return parsed.toFixed(digits);
}
