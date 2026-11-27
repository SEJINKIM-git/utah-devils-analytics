"use client";

import { useCommand } from "@/app/components/command/CommandProvider";
import { getMetric } from "@/lib/metrics";

type Target = { player: number } | { team: true };

/**
 * 누르면 지표 설명 시트가 열리는 숫자(또는 표 머리글).
 *
 *   <MetricValue code="OBP" value="0.412" target={{ player: 12 }} season="2026" />
 *   <MetricValue code="OBP" target={{ team: true }}>출루율</MetricValue>     ← 표 머리글
 *
 * 글자 모양은 감싸는 쪽을 그대로 따른다. <button>이라 키보드로 열 수 있다.
 */
export default function MetricValue({
  code,
  value,
  target = { team: true },
  season,
  children,
  className,
}: {
  code: string;
  /** 화면에 보이는 값. 시트에도 그대로 나온다 */
  value?: string | number | null;
  target?: Target;
  season?: string;
  /** 값 대신 보여 줄 내용 (표 머리글의 지표 이름 등) */
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang, openMetric } = useCommand();
  const metric = getMetric(code);
  const shown = children ?? value ?? "---";
  if (!metric) return <>{shown}</>;

  const name = lang === "ko" ? metric.nameKo : metric.nameEn;
  const label =
    value === undefined || value === null
      ? lang === "ko" ? `${name} 설명 보기` : `About ${name}`
      : lang === "ko" ? `${name} ${value}, 설명 보기` : `${name} ${value}, show details`;

  return (
    <button
      type="button"
      className={className ? `metric-value ${className}` : "metric-value"}
      aria-label={label}
      aria-haspopup="dialog"
      title={`${name} · ${metric.code}`}
      onClick={(event) => {
        event.stopPropagation();
        openMetric({
          code: metric.code,
          season,
          ...("player" in target ? { playerId: target.player } : {}),
          ...(value === undefined || value === null ? {} : { value: String(value) }),
        });
      }}
    >
      {shown}
    </button>
  );
}
