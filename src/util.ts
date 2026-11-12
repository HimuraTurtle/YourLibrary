// Small, dependency-free helpers shared across adapters and the aggregator.

/** Extracts a leading 4-digit year from strings like "2017", "2017-11-15", "2017-05-06T14:42:39Z". */
export function parseYear(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^\s*(\d{4})/.exec(value);
  if (!m) return undefined;
  const year = Number.parseInt(m[1] ?? "", 10);
  return Number.isFinite(year) ? year : undefined;
}

/** Strips "https://doi.org/" / "http://dx.doi.org/" prefixes to return the bare DOI. */
export function normalizeDoi(doi: string | null | undefined): string | undefined {
  if (!doi) return undefined;
  const trimmed = doi.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}

/** Rebuilds an abstract string from OpenAlex's inverted-index representation. */
export function reconstructAbstract(
  inverted: Record<string, number[]> | null | undefined,
): string | undefined {
  if (!inverted || typeof inverted !== "object") return undefined;
  const words: { pos: number; word: string }[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (typeof pos === "number") words.push({ pos, word });
    }
  }
  if (words.length === 0) return undefined;
  words.sort((a, b) => a.pos - b.pos);
  return words.map((w) => w.word).join(" ");
}

/** Normalizes a title/name for deduplication: lowercase, letters/numbers only, single spaces. */
export function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
