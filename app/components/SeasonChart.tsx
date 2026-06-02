"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { parseIP, formatIP } from "@/lib/statFormatting";

// ── Types ─────────────────────────────────────────────────────────────────────

type BattingStat = {
  season: string;
  game_id?: number | null;
  games?: { date?: string | null; opponent?: string | null } | null;
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  rbi: number;
  doubles: number;
  triples: number;
  runs: number;
};

type PitchingStat = {
  season: string;
  game_id?: number | null;
  games?: { date?: string | null; opponent?: string | null } | null;
  ip: number;
  er: number;
  w: number;
  l: number;
  sv: number;
  so: number;
  ha: number;
  bb: number;
  runs_allowed: number;
  hr_allowed: number;
};

type ChartRow = Record<string, string | number>;

// ── Helpers ───────────────────────────────────────────────────────────────────

// "2026-05-29" → "5/29"
function shortDate(d?: string | null): string {
  if (!d) return "?";
  const m = d.match(/\d{4}-(\d{1,2})-(\d{1,2})/);
  return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : d.slice(5) || d;
}

function computeBatRow(
  b: { pa: number; ab: number; hits: number; hr: number; rbi: number;
       bb: number; hbp: number; so: number; sb: number;
       doubles: number; triples: number },
  xLabel: string,
  lang: string
): ChartRow {
  const avg = b.ab > 0 ? parseFloat((b.hits / b.ab).toFixed(3)) : 0;
  const obp = b.pa > 0 ? parseFloat(((b.hits + b.bb + b.hbp) / b.pa).toFixed(3)) : 0;
  const slg = b.ab > 0
    ? parseFloat(((b.hits - b.doubles - b.triples - b.hr
        + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab).toFixed(3))
    : 0;
  return {
    season: xLabel,
    [lang === "ko" ? "타율"  : "AVG"]: avg,
    [lang === "ko" ? "출루율": "OBP"]: obp,
    OPS:                               parseFloat((obp + slg).toFixed(3)),
    [lang === "ko" ? "안타"  : "H"  ]: b.hits,
    [lang === "ko" ? "홈런"  : "HR" ]: b.hr,
    [lang === "ko" ? "타점"  : "RBI"]: b.rbi,
    [lang === "ko" ? "도루"  : "SB" ]: b.sb,
  };
}

function computePitRow(
  ipDec: number,
  er: number, ha: number, bb: number, w: number, so: number,
  xLabel: string,
  lang: string
): ChartRow {
  const era  = ipDec > 0 ? parseFloat(((er / ipDec) * 5).toFixed(2)) : 0;
  const whip = ipDec > 0 ? parseFloat(((ha + bb) / ipDec).toFixed(2)) : 0;
  return {
    season: xLabel,
    ERA:  era,
    WHIP: whip,
    [lang === "ko" ? "승"  : "W" ]: w,
    [lang === "ko" ? "삼진": "SO"]: so,
    [lang === "ko" ? "이닝": "IP"]: parseFloat(ipDec.toFixed(2)),
  };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface-high)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "10px 14px", fontSize: 12,
      color: "var(--text)", boxShadow: "var(--shadow)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between",
          gap: 16, color: p.color, lineHeight: 1.8 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SeasonChart({
  batting,
  pitching,
  lang = "ko",
}: {
  batting: BattingStat[];
  pitching: PitchingStat[];
  lang?: "ko" | "en";
}) {
  const chartGridColor   = "var(--border)";
  const chartAxisColor   = "var(--text)";
  const chartPanelBg     = "var(--inline-muted-surface)";
  const chartPanelBorder = "1px solid var(--border)";
  const chartLegendStyle = { fontSize: 11, color: "var(--text)" };

  // ── Batting ────────────────────────────────────────────────────────────────

  const validBatting = batting.filter(
    b => b.season && b.season !== "Career" && (b.ab || 0) > 0
  );
  const uniqueBatSeasons = Array.from(new Set(validBatting.map(b => b.season)));
  const isMultiSeasonBat = uniqueBatSeasons.length >= 2;

  let battingData: ChartRow[] = [];
  let batMode = "";

  if (isMultiSeasonBat) {
    // Aggregate per season year to remove duplicates
    const byYear = new Map<string, BattingStat>();
    for (const b of validBatting) {
      const yr = b.season.trim();
      const e = byYear.get(yr);
      if (e) {
        byYear.set(yr, {
          ...e,
          pa:      (e.pa      || 0) + (b.pa      || 0),
          ab:      (e.ab      || 0) + (b.ab      || 0),
          hits:    (e.hits    || 0) + (b.hits    || 0),
          hr:      (e.hr      || 0) + (b.hr      || 0),
          rbi:     (e.rbi     || 0) + (b.rbi     || 0),
          bb:      (e.bb      || 0) + (b.bb      || 0),
          hbp:     (e.hbp     || 0) + (b.hbp     || 0),
          so:      (e.so      || 0) + (b.so      || 0),
          sb:      (e.sb      || 0) + (b.sb      || 0),
          doubles: (e.doubles || 0) + (b.doubles || 0),
          triples: (e.triples || 0) + (b.triples || 0),
          runs:    (e.runs    || 0) + (b.runs    || 0),
        });
      } else {
        byYear.set(yr, { ...b });
      }
    }
    battingData = Array.from(byYear.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([yr, agg]) => computeBatRow(agg, yr, lang));
    batMode = lang === "ko" ? "시즌별" : "By Season";
  } else if (uniqueBatSeasons.length === 1) {
    // Single season → per-game
    battingData = validBatting
      .filter(b => b.games?.date)
      .sort((a, b) => (a.games?.date || "").localeCompare(b.games?.date || ""))
      .map(b => computeBatRow(b, shortDate(b.games?.date), lang));
    const yr = uniqueBatSeasons[0];
    batMode = lang === "ko" ? `경기별 (${yr})` : `Per Game (${yr})`;
  }

  // ── Pitching ───────────────────────────────────────────────────────────────

  const validPitching = pitching.filter(
    p => p.season && p.season !== "Career" && parseIP(p.ip) > 0
  );
  const uniquePitSeasons = Array.from(new Set(validPitching.map(p => p.season)));
  const isMultiSeasonPit = uniquePitSeasons.length >= 2;

  let pitchingData: ChartRow[] = [];
  let pitMode = "";

  if (isMultiSeasonPit) {
    type PitAgg = { ip: number; er: number; ha: number; bb: number; w: number; so: number };
    const byYear = new Map<string, PitAgg>();
    for (const p of validPitching) {
      const yr  = p.season.trim();
      const dec = parseIP(p.ip);
      const e   = byYear.get(yr);
      if (e) {
        byYear.set(yr, {
          ip: e.ip + dec,
          er: e.er + (p.er || 0),
          ha: e.ha + (p.ha || 0),
          bb: e.bb + (p.bb || 0),
          w:  e.w  + (p.w  || 0),
          so: e.so + (p.so || 0),
        });
      } else {
        byYear.set(yr, { ip: dec, er: p.er||0, ha: p.ha||0, bb: p.bb||0, w: p.w||0, so: p.so||0 });
      }
    }
    pitchingData = Array.from(byYear.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([yr, agg]) => computePitRow(agg.ip, agg.er, agg.ha, agg.bb, agg.w, agg.so, yr, lang));
    pitMode = lang === "ko" ? "시즌별" : "By Season";
  } else if (uniquePitSeasons.length === 1) {
    pitchingData = validPitching
      .filter(p => p.games?.date)
      .sort((a, b) => (a.games?.date || "").localeCompare(b.games?.date || ""))
      .map(p => {
        const dec = parseIP(p.ip);
        return computePitRow(dec, p.er||0, p.ha||0, p.bb||0, p.w||0, p.so||0,
          shortDate(p.games?.date), lang);
      });
    const yr = uniquePitSeasons[0];
    pitMode = lang === "ko" ? `경기별 (${yr})` : `Per Game (${yr})`;
  }

  const hasBatting  = battingData.length  >= 2;
  const hasPitching = pitchingData.length >= 2;

  if (!hasBatting && !hasPitching) return null;

  const avgKey  = lang === "ko" ? "타율"  : "AVG";
  const obpKey  = lang === "ko" ? "출루율": "OBP";
  const hKey    = lang === "ko" ? "안타"  : "H";
  const hrKey   = lang === "ko" ? "홈런"  : "HR";
  const rbiKey  = lang === "ko" ? "타점"  : "RBI";
  const sbKey   = lang === "ko" ? "도루"  : "SB";
  const wKey    = lang === "ko" ? "승"    : "W";
  const soKeyP  = lang === "ko" ? "삼진"  : "SO";
  const ipKey   = lang === "ko" ? "이닝"  : "IP";

  // Shared chart panel wrapper
  const Panel = ({ title, badge, children }: {
    title: string; badge?: string; children: React.ReactNode;
  }) => (
    <div style={{ background: chartPanelBg, border: chartPanelBorder,
      borderRadius: 14, padding: "20px 16px 10px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8,
        marginBottom: 12, paddingLeft: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
            border: "1px solid rgba(164,201,255,0.2)" }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20,
        display: "flex", alignItems: "center", gap: 8 }}>
        📈 {lang === "ko" ? "성장 추이" : "Growth Trends"}
      </h2>

      {/* ── Batting charts ── */}
      {hasBatting && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 16, marginBottom: hasPitching ? 20 : 0 }}>

          {/* 타율·출루율·OPS */}
          <Panel title={lang === "ko" ? "타율 · 출루율 · OPS" : "AVG · OBP · OPS"} badge={batMode}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={battingData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="season" stroke={chartAxisColor} fontSize={11} />
                <YAxis stroke={chartAxisColor} fontSize={10} domain={[0, "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={chartLegendStyle} />
                <Line type="monotone" dataKey={avgKey} stroke="#22c55e" strokeWidth={2}
                  dot={{ r: 4, fill: "#22c55e" }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey={obpKey} stroke="#60a5fa" strokeWidth={2}
                  dot={{ r: 4, fill: "#60a5fa" }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="OPS" stroke="#eab308" strokeWidth={2}
                  dot={{ r: 4, fill: "#eab308" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* 안타·홈런·타점·도루 */}
          <Panel title={lang === "ko" ? "안타 · 홈런 · 타점 · 도루" : "H · HR · RBI · SB"} badge={batMode}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={battingData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="season" stroke={chartAxisColor} fontSize={11} />
                <YAxis stroke={chartAxisColor} fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={chartLegendStyle} />
                <Line type="monotone" dataKey={hKey}   stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} />
                <Line type="monotone" dataKey={hrKey}  stroke="#eab308" strokeWidth={2} dot={{ r: 4, fill: "#eab308" }} />
                <Line type="monotone" dataKey={rbiKey} stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} />
                <Line type="monotone" dataKey={sbKey}  stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* ── Pitching charts ── */}
      {hasPitching && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* ERA·WHIP */}
          <Panel title="ERA · WHIP" badge={pitMode}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pitchingData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="season" stroke={chartAxisColor} fontSize={11} />
                <YAxis stroke={chartAxisColor} fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={chartLegendStyle} />
                <Line type="monotone" dataKey="ERA"  stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="WHIP" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* 승·삼진·이닝 */}
          <Panel title={lang === "ko" ? "승 · 삼진 · 이닝" : "W · SO · IP"} badge={pitMode}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pitchingData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="season" stroke={chartAxisColor} fontSize={11} />
                <YAxis stroke={chartAxisColor} fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={chartLegendStyle} />
                <Line type="monotone" dataKey={wKey}   stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} />
                <Line type="monotone" dataKey={soKeyP} stroke="#60a5fa" strokeWidth={2} dot={{ r: 4, fill: "#60a5fa" }} />
                <Line type="monotone" dataKey={ipKey}  stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  );
}
