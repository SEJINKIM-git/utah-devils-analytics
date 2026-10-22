"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/translations";

export default function TermFilter({
  terms,
  current,
  basePath = "/",
  lang = "ko",
}: {
  terms: string[];
  current: string | null;
  basePath?: string;
  lang?: Lang;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (terms.length === 0) return null;

  const handleChange = (term: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term) params.set("term", term);
    else params.delete("term");
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <div className="app-season-filter" aria-label={lang === "ko" ? "학기 선택" : "Term"}>
      <button
        onClick={() => handleChange(null)}
        className={!current ? "app-season-chip active" : "app-season-chip"}
      >
        {lang === "ko" ? "시즌 전체" : "Full season"}
      </button>
      {terms.map((term) => (
        <button
          key={term}
          onClick={() => handleChange(term)}
          className={current === term ? "app-season-chip active" : "app-season-chip"}
        >
          {term}
        </button>
      ))}
    </div>
  );
}
