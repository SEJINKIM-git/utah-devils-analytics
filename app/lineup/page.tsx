import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/app/components/LangToggle";
import LineupSimulator from "@/app/components/LineupSimulator";
import SeasonFilter from "@/app/components/SeasonFilter";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import {
  buildPlayerIdentityKey,
  dedupePlayersByIdentity,
  findRelatedPlayersByIdentity,
  normalizePlayerName,
} from "@/lib/playerIdentity";
import { isLikelyPlayerName } from "@/lib/playerNameValidation";
import {
  getLatestRosterUploadForSeason,
  type RosterSnapshotPlayer,
} from "@/lib/rosterSnapshot";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason } from "@/lib/season";
import { getSeasonVisibility, isLockedSeason } from "@/lib/seasonVisibility";
import { Lang } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function findRosterPlayerMatches(players: any[], snapshotPlayer: RosterSnapshotPlayer) {
  const exactKey = buildPlayerIdentityKey(snapshotPlayer.name, snapshotPlayer.number);
  const normalizedName = normalizePlayerName(snapshotPlayer.name);

  const exact = players.filter(
    (player) => buildPlayerIdentityKey(player.name, player.number) === exactKey
  );
  if (exact.length > 0) return exact;

  const sameName = players.filter(
    (player) => normalizePlayerName(player.name) === normalizedName
  );
  if (sameName.length > 0) return sameName;

  if (snapshotPlayer.number) {
    const sameNumber = players.filter((player) => player.number === snapshotPlayer.number);
    if (sameNumber.length > 0) return sameNumber;
  }

  return [];
}

export default async function LineupPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const params = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;
  const preferredSeason = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;

  const { data: rawPlayers } = await supabase.from("players").select("*").order("number");
  const { data: allBattingRaw } = await supabase.from("batting_stats").select("season");
  const { data: allPitchingRaw } = await supabase.from("pitching_stats").select("season");
  const { data: rosterUploads } = await supabase
    .from("roster_uploads")
    .select("filename,players_snapshot,source,uploaded_at")
    .order("uploaded_at", { ascending: false });
  const visibility = await getSeasonVisibility(supabase, [
    ...(allBattingRaw || []).map((b: any) => b.season),
    ...(allPitchingRaw || []).map((p: any) => p.season),
    preferredSeason,
  ], preferredSeason, "2026");
  const seasons = visibility.seasons.length > 0 ? visibility.seasons : [preferredSeason || "2026"];
  const selectedSeason = normalizeSelectedSeason(params.season, seasons, preferredSeason || "2026", preferredSeason);
  const isPlaceholderSeason = isLockedSeason(selectedSeason, visibility.activatedSeasons);
  const { data: batting } = isPlaceholderSeason
    ? { data: [] as any[] }
    : await supabase.from("batting_stats").select("*").eq("season", selectedSeason);
  const latestRosterUpload = isPlaceholderSeason
    ? null
    : getLatestRosterUploadForSeason(rosterUploads || [], selectedSeason);
  const rosterSnapshotPlayers = latestRosterUpload?.snapshot?.players || [];

  let lineups: any[] = [];
  if (!isPlaceholderSeason) {
    try {
    const { data } = await supabase
      .from("lineups")
      .select("*")
      .eq("season", selectedSeason)
      .order("created_at", { ascending: false });
    if (data) lineups = data;
    } catch (e) {}
  }

  const validPlayers = (rawPlayers || []).filter((player) => isLikelyPlayerName(player.name));
  const playerEntries = isPlaceholderSeason
    ? []
    : rosterSnapshotPlayers.length > 0
      ? rosterSnapshotPlayers
          .map((snapshotPlayer) => {
            const relatedPlayers = findRosterPlayerMatches(validPlayers, snapshotPlayer);
            if (relatedPlayers.length === 0) return null;

            return {
              player: [...relatedPlayers].sort((a, b) => b.id - a.id)[0],
              relatedPlayers,
              canonicalName: snapshotPlayer.name,
              canonicalNumber: snapshotPlayer.number,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : dedupePlayersByIdentity(validPlayers).map((player) => ({
          player,
          relatedPlayers: findRelatedPlayersByIdentity(validPlayers, player),
          canonicalName: player.name,
          canonicalNumber: player.number,
        }));

  const playersWithStats = playerEntries
    .map(({ player, relatedPlayers, canonicalName, canonicalNumber }) => {
      const relatedIds = new Set(relatedPlayers.map((entry) => entry.id));
      const merged = (batting || []).reduce(
        (acc, row) => {
          if (!relatedIds.has(row.player_id)) return acc;

          return {
            pa: acc.pa + (row.pa || 0),
            ab: acc.ab + (row.ab || 0),
            hits: acc.hits + (row.hits || 0),
            doubles: acc.doubles + (row.doubles || 0),
            triples: acc.triples + (row.triples || 0),
            hr: acc.hr + (row.hr || 0),
            bb: acc.bb + (row.bb || 0),
            hbp: acc.hbp + (row.hbp || 0),
          };
        },
        { pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 }
      );

      const avg = merged.ab > 0 ? (merged.hits / merged.ab).toFixed(3) : "---";
      const obp = merged.pa > 0 ? ((merged.hits + merged.bb + merged.hbp) / merged.pa).toFixed(3) : "---";
      const slg = merged.ab > 0
        ? ((merged.hits - merged.doubles - merged.triples - merged.hr + merged.doubles * 2 + merged.triples * 3 + merged.hr * 4) / merged.ab).toFixed(3)
        : "---";
      const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";

      return {
        ...player,
        name: getPlayerDisplayName(canonicalName, lang),
        number: canonicalNumber,
        avg,
        obp,
        slg,
        ops,
        pa: merged.pa,
        hits: merged.hits,
      };
    })
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, lang === "ko" ? "ko" : "en"));

  return (
    <div className="app-page-shell">
      <div className="app-page-header" style={{ padding: "24px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Link href={`/?season=${selectedSeason}`} style={{ textDecoration: "none" }}>
                <Image src="/logos/cap-logo.png" alt="Utah Devils" width={42} height={42} style={{ borderRadius: 12 }} />
              </Link>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                {lang === "ko" ? `라인업 시뮬레이터 · ${selectedSeason}` : `Lineup Simulator · ${selectedSeason}`}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--inline-muted-surface)", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)" }}>
                {lang === "ko" ? "← 대시보드" : "← Dashboard"}
              </Link>
              <Link href={`/schedule?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(34,197,94,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "📅 일정" : "📅 Schedule"}
              </Link>
              <Link href={`/team-analysis?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(59,130,246,0.12)", color: "#60a5fa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "🤖 팀 분석" : "🤖 AI Analysis"}
              </Link>
              <LangToggle lang={lang} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SeasonFilter seasons={seasons} basePath="/lineup" lang={lang} />
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        {isPlaceholderSeason && (
          <div className="app-page-note" style={{ marginBottom: 18, padding: "16px 18px", borderRadius: 14, fontSize: 13, lineHeight: 1.7 }}>
            {lang === "ko"
              ? "2026 시즌은 공식 기록 업로드 전까지 라인업 시뮬레이터를 비워 둡니다."
              : "The 2026 lineup simulator stays blank until official records are uploaded."}
          </div>
        )}
        <LineupSimulator players={playersWithStats} savedLineups={lineups} lang={lang} season={selectedSeason} />
      </div>
    </div>
  );
}
