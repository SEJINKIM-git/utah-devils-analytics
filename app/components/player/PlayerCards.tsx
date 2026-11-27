"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

export type PlayerCard = {
  /** 주소의 ?view= 값 */
  id: string;
  title: string;
  hint: string;
  content: React.ReactNode;
};

/**
 * 선수 페이지의 기능 카드. 첫 화면에는 제목만 보이고, 누르면 그 카드의 표·차트가 펼쳐진다.
 * 열린 카드는 주소의 ?view=gamelog|season|splits|ai|goals 에 남아 바로 열 수 있다.
 * 내용은 접혀 있어도 화면에 그대로 들어 있다(숨기기만 한다).
 */
export default function PlayerCards({ cards }: { cards: PlayerCard[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view");
  const open = cards.some((card) => card.id === requested) ? requested : null;
  const scrolled = useRef<string | null>(null);

  // 주소로 바로 열었을 때 그 카드가 보이도록
  useEffect(() => {
    if (!open || scrolled.current === open) return;
    scrolled.current = open;
    document.getElementById(`pcard-${open}`)?.scrollIntoView({ block: "start" });
  }, [open]);

  const toggle = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (open === id) params.delete("view");
    else params.set("view", id);
    scrolled.current = id; // 직접 누른 카드는 화면을 옮기지 않는다
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="pcard-list">
      {cards.map((card) => {
        const isOpen = open === card.id;
        return (
          <section key={card.id} id={`pcard-${card.id}`} className={isOpen ? "pcard open" : "pcard"} data-view={card.id}>
            <h2>
              <button
                type="button"
                className="pcard-head"
                aria-expanded={isOpen}
                aria-controls={`pcard-body-${card.id}`}
                onClick={() => toggle(card.id)}
              >
                <span>
                  <span className="pcard-title">{card.title}</span>
                  <span className="pcard-hint" style={{ display: "block" }}>{card.hint}</span>
                </span>
                <ChevronDown size={20} strokeWidth={1.8} aria-hidden="true" className={isOpen ? "msheet-chevron open" : "msheet-chevron"} />
              </button>
            </h2>
            <div id={`pcard-body-${card.id}`} className="pcard-body" hidden={!isOpen}>
              {card.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
