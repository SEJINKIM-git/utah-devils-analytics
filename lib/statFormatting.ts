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
