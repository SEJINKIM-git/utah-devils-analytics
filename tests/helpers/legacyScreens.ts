/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 기존 화면의 집계 코드를 그대로 옮긴 참조 구현 (조회 함수 도입 전 `main` 953af24 기준).
 *
 *  - legacyRecords:    app/records/page.tsx 의 타자·투수 표
 *  - legacyPlayerPage: app/players/[id]/page.tsx 의 선택 시즌 합계와 통산 표의 시즌별 줄
 *
 * 조회 함수(lib/metrics/query.ts)가 같은 값을 내는지 비교하는 데만 쓴다. 고치지 않는다.
 * 원본 화면 코드가 Supabase 행을 any로 다뤘기 때문에 이 파일만 any를 허용한다.
 */
import { filterRecordsForSeason } from "@/lib/careerStats";
import { buildPlayerIdentityKey, findRelatedPlayersByIdentity } from "@/lib/playerIdentity";
import { getLatestRosterUploadForSeason } from "@/lib/rosterSnapshot";
import { isLockedSeason } from "@/lib/seasonVisibility";
import { formatIP, parseIP } from "@/lib/statFormatting";
import { computeObp, eraFromInnings, formatRate, obpDenominator, whipFromInnings } from "@/lib/statFormulas";
import { selectEffectiveBattingRows, selectEffectiveStatRows } from "@/lib/statRows";
import type { MetricDataset } from "@/lib/metrics/query";

function hasBattingActivity(record: any) {
  return [record.pa, record.ab, record.runs, record.hits, record.doubles, record.triples, record.hr, record.rbi, record.bb, record.hbp, record.so, record.sb].some(
    (value) => Number(value) > 0
  );
}

function hasPitchingActivity(record: any) {
  return [record.w, record.l, record.sv, record.hld, record.ip, record.ha, record.runs_allowed, record.er, record.bb, record.hbp, record.so, record.hr_allowed].some(
    (value) => Number(value) > 0
  );
}

export function legacyRecords(dataset: MetricDataset, season: string) {
  const players = dataset.players;
  const playerById = new Map(players.map((p) => [p.id, p]));
  const allBatting: any[] = selectEffectiveBattingRows(dataset.batting as any[]);
  const allPitching: any[] = selectEffectiveStatRows(dataset.pitching as any[]);
  const allGames = dataset.games;
  const isPlaceholderSeason = isLockedSeason(season, dataset.activatedSeasons);

  const batting = isPlaceholderSeason ? [] : filterRecordsForSeason(allBatting, season, { lockedSeasons: dataset.lockedSeasons });
  const pitching = isPlaceholderSeason ? [] : filterRecordsForSeason(allPitching, season, { lockedSeasons: dataset.lockedSeasons });
  const latestRosterUpload = isPlaceholderSeason ? null : getLatestRosterUploadForSeason(dataset.rosterUploads, season);
  const latestRosterSnapshot = latestRosterUpload?.snapshot || null;
  const rosterUploadedAt = latestRosterUpload?.upload?.uploaded_at ? new Date(latestRosterUpload.upload.uploaded_at).getTime() : null;
  const validGameIds = new Set(
    allGames
      .filter((g) => g.season === season)
      .filter((g) => {
        if (!rosterUploadedAt) return true;
        if (!g.created_at) return false;
        return new Date(g.created_at).getTime() >= rosterUploadedAt;
      })
      .map((g) => g.id)
  );
  const rosterKeys = new Set((latestRosterSnapshot?.players || []).map((p: any) => buildPlayerIdentityKey(p.name, p.number)));
  const shouldGateStatsToPostRosterGames = Boolean(latestRosterUpload);

  const battingByPlayer = new Map<string, any>();
  for (const b of batting) {
    if (shouldGateStatsToPostRosterGames) {
      if (!b.game_id || !validGameIds.has(b.game_id)) continue;
    }
    const player = playerById.get(b.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identityKey)) continue;
    if (battingByPlayer.has(identityKey)) {
      const acc = battingByPlayer.get(identityKey);
      battingByPlayer.set(identityKey, {
        ...acc,
        player: acc.player.id > player.id ? acc.player : player,
        player_id: acc.player.id > player.id ? acc.player.id : player.id,
        pa: acc.pa + (b.pa || 0),
        obp_den: obpDenominator(acc) + obpDenominator(b),
        ab: acc.ab + (b.ab || 0),
        runs: acc.runs + (b.runs || 0),
        hits: acc.hits + (b.hits || 0),
        doubles: acc.doubles + (b.doubles || 0),
        triples: acc.triples + (b.triples || 0),
        hr: acc.hr + (b.hr || 0),
        rbi: acc.rbi + (b.rbi || 0),
        bb: acc.bb + (b.bb || 0),
        hbp: acc.hbp + (b.hbp || 0),
        so: acc.so + (b.so || 0),
        sb: acc.sb + (b.sb || 0),
      });
    } else {
      battingByPlayer.set(identityKey, { ...b, player_id: player.id, player });
    }
  }
  const uniqueBatting = Array.from(battingByPlayer.values()).filter(hasBattingActivity);

  const pitchingByPlayer = new Map<string, any>();
  for (const p of pitching) {
    if (shouldGateStatsToPostRosterGames) {
      if (!p.game_id || !validGameIds.has(p.game_id)) continue;
    }
    const player = playerById.get(p.player_id);
    if (!player) continue;
    const identityKey = buildPlayerIdentityKey(player.name, player.number);
    if (rosterKeys.size > 0 && !rosterKeys.has(identityKey)) continue;
    if (pitchingByPlayer.has(identityKey)) {
      const acc = pitchingByPlayer.get(identityKey);
      pitchingByPlayer.set(identityKey, {
        ...acc,
        player: acc.player.id > player.id ? acc.player : player,
        player_id: acc.player.id > player.id ? acc.player.id : player.id,
        w: acc.w + (p.w || 0),
        l: acc.l + (p.l || 0),
        sv: acc.sv + (p.sv || 0),
        hld: acc.hld + (p.hld || 0),
        ip: parseIP(acc.ip) + parseIP(p.ip),
        ha: acc.ha + (p.ha || 0),
        runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
        er: acc.er + (p.er || 0),
        bb: acc.bb + (p.bb || 0),
        hbp: acc.hbp + (p.hbp || 0),
        so: acc.so + (p.so || 0),
        hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
      });
    } else {
      pitchingByPlayer.set(identityKey, { ...p, player_id: player.id, player, ip: parseIP(p.ip) });
    }
  }
  const uniquePitching = Array.from(pitchingByPlayer.values()).filter(hasPitchingActivity);

  const battingWithPlayers = uniqueBatting
    .map((b) => {
      const avg = b.ab > 0 ? (b.hits / b.ab).toFixed(3) : "---";
      const obp = formatRate(computeObp(b), 3);
      const slg =
        b.ab > 0
          ? ((b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab).toFixed(3)
          : "---";
      const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
      return { ...b, avg, obp, slg, ops, opsNum: parseFloat(ops) || 0 };
    })
    .sort((a: any, b: any) => b.opsNum - a.opsNum);

  const pitchingWithPlayers = uniquePitching
    .map((p) => {
      const era = formatRate(eraFromInnings(p.er, p.ip));
      const whip = formatRate(whipFromInnings(p.ha, p.bb, p.ip));
      return { ...p, era, whip, eraNum: parseFloat(era) || 99 };
    })
    .sort((a: any, b: any) => a.eraNum - b.eraNum);

  // 화면에 실제로 찍히는 칸만 (표의 열 순서)
  return {
    batting: battingWithPlayers.map((b) => ({
      number: b.player.number, name: b.player.name, playerId: b.player.id, sbPlayerId: b.player_id,
      pa: b.pa, ab: b.ab, hits: b.hits, doubles: b.doubles, triples: b.triples, hr: b.hr, rbi: b.rbi, bb: b.bb, so: b.so, sb: b.sb ?? 0,
      avg: b.avg, obp: b.obp, ops: b.ops,
    })),
    pitching: pitchingWithPlayers.map((p) => ({
      number: p.player.number, name: p.player.name,
      w: p.w, l: p.l, sv: p.sv, ip: formatIP(p.ip), ha: p.ha, er: p.er, bb: p.bb, so: p.so, era: p.era, whip: p.whip,
    })),
  };
}

export function legacyPlayerPage(dataset: MetricDataset, playerId: number, selectedSeason: string) {
  const player = dataset.players.find((p) => p.id === playerId)!;
  const relatedPlayers = findRelatedPlayersByIdentity(
    [player, ...dataset.players.filter((p) => p.number === player.number), ...dataset.players.filter((p) => p.name === player.name)],
    player
  );
  const relatedPlayerIds = new Set(relatedPlayers.map((entry) => entry.id));
  const allBatting: any[] = selectEffectiveBattingRows((dataset.batting as any[]).filter((row) => relatedPlayerIds.has(row.player_id)));
  const allPitching: any[] = selectEffectiveStatRows((dataset.pitching as any[]).filter((row) => relatedPlayerIds.has(row.player_id)));
  const allGames = dataset.games;

  const latestRosterUpload = getLatestRosterUploadForSeason(dataset.rosterUploads, selectedSeason);
  const rosterUploadedAt = latestRosterUpload?.upload?.uploaded_at ? new Date(latestRosterUpload.upload.uploaded_at).getTime() : null;
  const validGameIds = new Set(
    allGames
      .filter((g) => g.season === selectedSeason)
      .filter((g) => {
        if (!rosterUploadedAt) return true;
        if (!g.created_at) return false;
        return new Date(g.created_at).getTime() >= rosterUploadedAt;
      })
      .map((g) => g.id)
  );
  const shouldGateStats = Boolean(latestRosterUpload);

  const batRecords = filterRecordsForSeason(allBatting, selectedSeason, { lockedSeasons: dataset.lockedSeasons })
    .filter((b) => !shouldGateStats || !b.game_id || validGameIds.has(b.game_id));
  const pitRecords = filterRecordsForSeason(allPitching, selectedSeason, { lockedSeasons: dataset.lockedSeasons })
    .filter((p) => !shouldGateStats || !p.game_id || validGameIds.has(p.game_id))
    .filter((record) => parseIP(record.ip) > 0);

  const batByGame = new Map<number, any>();
  for (const b of batRecords) {
    if (b.game_id == null) continue;
    const prev = batByGame.get(b.game_id);
    if (!prev || (b.pa || 0) >= (prev.pa || 0)) batByGame.set(b.game_id, b);
  }
  const dedupedBat = Array.from(batByGame.values());

  const pitByGame = new Map<number, any>();
  for (const p of pitRecords) {
    if (p.game_id == null) continue;
    const prev = pitByGame.get(p.game_id);
    if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) pitByGame.set(p.game_id, p);
  }
  const dedupedPit = Array.from(pitByGame.values());

  const bat = dedupedBat.length > 0 ? dedupedBat.reduce((acc, b) => ({
    ...acc,
    pa: acc.pa + (b.pa || 0), obp_den: obpDenominator(acc) + obpDenominator(b), ab: acc.ab + (b.ab || 0), runs: acc.runs + (b.runs || 0),
    hits: acc.hits + (b.hits || 0), doubles: acc.doubles + (b.doubles || 0),
    triples: acc.triples + (b.triples || 0), hr: acc.hr + (b.hr || 0),
    rbi: acc.rbi + (b.rbi || 0), bb: acc.bb + (b.bb || 0), hbp: acc.hbp + (b.hbp || 0),
    so: acc.so + (b.so || 0), sb: acc.sb + (b.sb || 0),
  }), { ...dedupedBat[0], pa: 0, obp_den: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0 }) : null;

  const pitch = dedupedPit.length > 0 ? dedupedPit.reduce((acc, p) => ({
    ...acc,
    w: acc.w + (p.w || 0), l: acc.l + (p.l || 0), sv: acc.sv + (p.sv || 0),
    hld: acc.hld + (p.hld || 0),
    ip: parseIP(acc.ip) + parseIP(p.ip),
    ha: acc.ha + (p.ha || 0), runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
    er: acc.er + (p.er || 0), bb: acc.bb + (p.bb || 0), hbp: acc.hbp + (p.hbp || 0),
    so: acc.so + (p.so || 0), hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
  }), { ...dedupedPit[0], w: 0, l: 0, sv: 0, hld: 0, ip: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, hbp: 0, so: 0, hr_allowed: 0 }) : null;

  const avg = bat && bat.ab > 0 ? (bat.hits / bat.ab).toFixed(3) : "---";
  const obp = bat ? formatRate(computeObp(bat), 3) : "---";
  const slg = bat && bat.ab > 0 ? ((bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab).toFixed(3) : "---";
  const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
  const era = pitch && pitch.ip > 0 ? formatRate(eraFromInnings(pitch.er, pitch.ip)) : null;
  const whip = pitch && pitch.ip > 0 ? formatRate(whipFromInnings(pitch.ha, pitch.bb, pitch.ip)) : null;

  // 통산 표의 시즌별 줄
  const careerSeasonKeys = Array.from(new Set([...allBatting.map((b) => b.season), ...allPitching.map((p) => p.season)].filter(Boolean))).sort() as string[];
  const careerRows = careerSeasonKeys.map((season) => {
    const bMap = new Map<number, any>();
    for (const b of allBatting.filter((x) => x.season === season)) {
      if (b.game_id == null) continue;
      const prev = bMap.get(b.game_id);
      if (!prev || (b.pa || 0) >= (prev.pa || 0)) bMap.set(b.game_id, b);
    }
    const bArr: any[] = Array.from(bMap.values());
    const pMap = new Map<number, any>();
    for (const p of allPitching.filter((x) => x.season === season)) {
      if (p.game_id == null) continue;
      const prev = pMap.get(p.game_id);
      if (!prev || parseIP(p.ip) >= parseIP(prev.ip)) pMap.set(p.game_id, p);
    }
    const pArr = Array.from(pMap.values()).filter((p) => parseIP(p.ip) > 0);
    const row: Record<string, any> = { season };
    if (bArr.length > 0) {
      const sum = (k: string) => bArr.reduce((s, b) => s + (b[k] || 0), 0);
      const ab = sum("ab"), hits = sum("hits"), doubles = sum("doubles"), triples = sum("triples"), hr = sum("hr");
      const obpDen = bArr.reduce((s, b) => s + obpDenominator(b), 0);
      const obpN = computeObp({ hits, bb: sum("bb"), hbp: sum("hbp"), obp_den: obpDen }) ?? 0;
      const slgN = ab > 0 ? (hits - doubles - triples - hr + doubles * 2 + triples * 3 + hr * 4) / ab : 0;
      Object.assign(row, { pa: sum("pa"), ab, hits, hr, rbi: sum("rbi"), sb: sum("sb"), avg: ab > 0 ? hits / ab : 0, obp: obpN, slg: slgN, ops: obpN + slgN });
    }
    if (pArr.length > 0) {
      const sum = (k: string) => pArr.reduce((s, p) => s + (p[k] || 0), 0);
      const totalIp = pArr.reduce((s, p) => s + parseIP(p.ip), 0);
      Object.assign(row, { ip: totalIp, ha: sum("ha"), er: sum("er"), bb_p: sum("bb"), so: sum("so"), w: sum("w"), l: sum("l"),
        era: eraFromInnings(sum("er"), totalIp) ?? 0, whip: whipFromInnings(sum("ha"), sum("bb"), totalIp) ?? 0 });
    }
    return row;
  }).filter((r) => r.pa !== undefined || r.ip !== undefined);

  return { bat, pitch, avg, obp, slg, ops, era, whip, ip: pitch ? formatIP(pitch.ip) : null, careerRows };
}
