// Converts baseball notation IP to decimal innings for arithmetic.
// "3.1" (3⅓) → 3.333..., "3.2" (3⅔) → 3.667..., "3" → 3.0
// Digits ≥ 3 in the fractional place are assumed already-decimal (e.g. 3.333…).
export function parseIP(ip: number | string | null | undefined): number {
  const v = parseFloat(String(ip ?? 0));
  if (!isFinite(v) || v < 0) return 0;
  const full = Math.floor(v);
  const digit = Math.round((v - full) * 10); // 3.1 → 1, 3.2 → 2, 3.0 → 0
  if (digit === 1) return full + 1 / 3;
  if (digit === 2) return full + 2 / 3;
  if (digit === 0) return full;
  return v; // digit ≥ 3 → already decimal
}

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
