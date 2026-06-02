"use client";

import { useState } from "react";

export default function SbEditCell({
  playerId,
  season,
  initialSb,
}: {
  playerId: number;
  season: string;
  initialSb: number;
}) {
  const [sb, setSb]           = useState(initialSb);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(initialSb));
  const [saving, setSaving]   = useState(false);

  async function save() {
    const val = Math.max(0, parseInt(draft) || 0);
    setSaving(true);
    try {
      const res = await fetch("/api/stats/sb", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, season, sb: val }),
      });
      if (res.ok) { setSb(val); setEditing(false); }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  save();
            if (e.key === "Escape") setEditing(false);
          }}
          style={{
            width: 38, fontSize: 12, padding: "2px 4px", textAlign: "center",
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 4, color: "#fff",
          }}
          autoFocus
        />
        <button onClick={save} disabled={saving}
          style={{ fontSize: 11, background: "none", border: "none", color: "#22c55e", cursor: "pointer", padding: 0 }}>
          ✓
        </button>
        <button onClick={() => setEditing(false)}
          style={{ fontSize: 11, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0 }}>
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      title="클릭해서 도루 수정"
      onClick={() => { setDraft(String(sb)); setEditing(true); }}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontWeight: 700, fontSize: "inherit",
        color: sb >= 6 ? "#a78bfa" : "rgba(226,232,240,0.85)",
      }}
    >
      {sb}
    </button>
  );
}
