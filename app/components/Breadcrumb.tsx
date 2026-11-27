"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCommand } from "@/app/components/command/CommandProvider";
import { buildCrumbs, locateNav } from "@/lib/nav";
import type { Lang } from "@/lib/translations";

/**
 * 모든 화면 위쪽의 현재 위치 ("팀 › 선수 › 가선수")와, 같은 묶음의 다른 화면으로 가는 탭.
 */
export default function Breadcrumb({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { crumbLeaf, season: activeSeason } = useCommand();
  const season = searchParams.get("season") || activeSeason;
  const crumbs = buildCrumbs(pathname, lang, crumbLeaf);
  const located = locateNav(pathname);
  if (crumbs.length === 0 || !located) return null;

  const withSeason = (href: string) => (season ? `${href}?season=${encodeURIComponent(season)}` : href);
  const tabs = located.group.items;

  return (
    <div className="crumb-bar">
      <nav aria-label={lang === "ko" ? "현재 위치" : "Breadcrumb"}>
        <ol className="crumb-list">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="crumb-item">
              {index > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
              {crumb.href ? (
                <Link href={withSeason(crumb.href)} className="crumb-link">{crumb.label}</Link>
              ) : (
                <span className="crumb-current" aria-current="page">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {tabs.length > 1 && (
        <nav className="group-tabs" aria-label={lang === "ko" ? `${located.group.labelKo} 화면` : `${located.group.labelEn} screens`}>
          {tabs.map((item) => {
            const active = located.item?.href === item.href;
            return (
              <Link key={item.href} href={withSeason(item.href)} className={active ? "group-tab active" : "group-tab"} aria-current={active ? "page" : undefined}>
                {lang === "ko" ? item.labelKo : item.labelEn}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
