"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type BattingStat = {
  season: string;
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div
      style={{
        background: "#1a1f2e",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#e2e8f0" }}>
        {label}
      </div>
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            color: p.color,
            lineHeight: 1.8,
          }}
        >
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function SeasonChart({
  batting,
  pitching,
  lang = "ko",
}: {
  batting: BattingStat[];
  pitching: PitchingStat[];
  lang?: "ko" | "en";
}) {
  // 시즌별 데이터 정리 (Career 제외, 연도순 정렬)
  const battingSeasons = batting
    .filter((b) => b.season && b.season !== "Career" && b.ab > 0)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((b) => {
      const avg = parseFloat((b.hits / b.ab).toFixed(3));
      const obp = b.pa > 0 ? parseFloat(((b.hits + b.bb + b.hbp) / b.pa).toFixed(3)) : 0;
      const slg = parseFloat(
        (
          (b.hits - b.doubles - b.triples - b.hr +
            b.doubles * 2 +
            b.triples * 3 +
            b.hr * 4) /
          b.ab
        ).toFixed(3)
      );
      const ops = parseFloat((obp + slg).toFixed(3));
      return {
        season: b.season,
        [lang === "ko" ? "타율" : "AVG"]: avg,
        [lang === "ko" ? "출루율" : "OBP"]: obp,
        OPS: ops,
        [lang === "ko" ? "안타" : "H"]: b.hits,
        [lang === "ko" ? "홈런" : "HR"]: b.hr,
        [lang === "ko" ? "타점" : "RBI"]: b.rbi,
        [lang === "ko" ? "도루" : "SB"]: b.sb,
        [lang === "ko" ? "삼진" : "SO"]: b.so,
        [lang === "ko" ? "볼넷" : "BB"]: b.bb,
      };
    });

  const pitchingSeasons = pitching
    .filter((p) => p.season && p.season !== "Career" && p.ip > 0)
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((p) => {
      const era = parseFloat(((p.er / p.ip) * 5).toFixed(2));
      const whip = parseFloat(((p.ha + p.bb) / p.ip).toFixed(2));
      return {
        season: p.season,
        ERA: era,
        WHIP: whip,
        [lang === "ko" ? "승" : "W"]: p.w,
        [lang === "ko" ? "삼진" : "SO"]: p.so,
        [lang === "ko" ? "이닝" : "IP"]: p.ip,
      };
    });

  const hasBatting = battingSeasons.length >= 2;
  const hasPitching = pitchingSeasons.length >= 2;

  if (!hasBatting && !hasPitching) return null;

  const avgKey = lang === "ko" ? "타율" : "AVG";
  const obpKey = lang === "ko" ? "출루율" : "OBP";
  const hKey = lang === "ko" ? "안타" : "H";
  const hrKey = lang === "ko" ? "홈런" : "HR";
  const rbiKey = lang === "ko" ? "타점" : "RBI";
  const sbKey = lang === "ko" ? "도루" : "SB";
  const soKeyB = lang === "ko" ? "삼진" : "SO";
  const bbKey = lang === "ko" ? "볼넷" : "BB";
  const wKey = lang === "ko" ? "승" : "W";
  const soKeyP = lang === "ko" ? "삼진" : "SO";
  const ipKey = lang === "ko" ? "이닝" : "IP";

  return (
    <div style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        📈 {lang === "ko" ? "시즌 성장 추이" : "Season Growth Trends"}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {lang === "ko" ? "2시즌 이상 데이터 필요" : "Requires 2+ seasons"}
        </span>
      </h2>

      {hasBatting && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* 타율/출루율/OPS 차트 */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: "20px 16px 10px 8px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 12,
                paddingLeft: 12,
              }}
            >
              {lang === "ko" ? "타율 · 출루율 · OPS" : "AVG · OBP · OPS"}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={battingSeasons}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="season" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} domain={[0, "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
                />
                <Line
                  type="monotone"
                  dataKey={avgKey}
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#22c55e" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey={obpKey}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#60a5fa" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="OPS"
                  stroke="#eab308"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#eab308" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 안타/홈런/타점/도루 차트 */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: "20px 16px 10px 8px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 12,
                paddingLeft: 12,
              }}
            >
              {lang === "ko" ? "안타 · 홈런 · 타점 · 도루" : "H · HR · RBI · SB"}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={battingSeasons}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="season" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
                />
                <Line type="monotone" dataKey={hKey} stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} />
                <Line type="monotone" dataKey={hrKey} stroke="#eab308" strokeWidth={2} dot={{ r: 4, fill: "#eab308" }} />
                <Line type="monotone" dataKey={rbiKey} stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} />
                <Line type="monotone" dataKey={sbKey} stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasPitching && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          {/* ERA/WHIP 차트 */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: "20px 16px 10px 8px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 12,
                paddingLeft: 12,
              }}
            >
              ERA · WHIP
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pitchingSeasons}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="season" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ERA" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="WHIP" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 승/삼진/이닝 차트 */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: "20px 16px 10px 8px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 12,
                paddingLeft: 12,
              }}
            >
              {lang === "ko" ? "승 · 삼진 · 이닝" : "W · SO · IP"}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pitchingSeasons}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="season" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={wKey} stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} />
                <Line type="monotone" dataKey={soKeyP} stroke="#60a5fa" strokeWidth={2} dot={{ r: 4, fill: "#60a5fa" }} />
                <Line type="monotone" dataKey={ipKey} stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}