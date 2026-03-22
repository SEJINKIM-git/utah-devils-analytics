type BasicPlayer = {
  id: number;
  name: string;
  number: number | null;
};

export function normalizePlayerName(name: string) {
  return String(name || "").replace(/\s+/g, "").trim().toLowerCase();
}

export function buildPlayerIdentityKey(name: string, number: number | null | undefined) {
  return `${number ?? 0}:${normalizePlayerName(name)}`;
}

export function dedupePlayersByIdentity<T extends BasicPlayer>(players: T[]) {
  const deduped = new Map<string, T>();

  for (const player of [...players].sort((a, b) => b.id - a.id)) {
    const key = buildPlayerIdentityKey(player.name, player.number);
    if (!deduped.has(key)) {
      deduped.set(key, player);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const numberA = a.number ?? 0;
    const numberB = b.number ?? 0;
    if (numberA !== numberB) return numberA - numberB;
    return a.name.localeCompare(b.name, "ko");
  });
}

export function findRelatedPlayersByIdentity<T extends BasicPlayer>(players: T[], target: T) {
  const targetName = normalizePlayerName(target.name);
  const targetNumber = target.number ?? 0;
  const byId = (entries: T[]) =>
    Array.from(new Map(entries.map((player) => [player.id, player])).values()).sort((a, b) => a.id - b.id);

  const exactMatches = players.filter(
    (player) =>
      (player.number ?? 0) === targetNumber &&
      normalizePlayerName(player.name) === targetName
  );
  if (exactMatches.length > 0) return byId(exactMatches);

  const sameNameMatches = players.filter(
    (player) => normalizePlayerName(player.name) === targetName
  );
  if (sameNameMatches.length > 0) return byId(sameNameMatches);

  const sameNumberMatches = players.filter((player) => (player.number ?? 0) === targetNumber);
  if (sameNumberMatches.length > 0) return byId(sameNumberMatches);

  return [target];
}
