const WORD_BOUNDARY = new Set([" ", "-", "_", ".", "/", ":"]);

export function score(query: string, haystack: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  const idx = h.indexOf(q);
  if (idx < 0) return 0;

  let s = 1000 - idx;
  const prev = idx === 0 ? " " : (h[idx - 1] ?? "");
  if (idx === 0 || WORD_BOUNDARY.has(prev)) s += 500;
  if (h === q) s += 2000;
  return s;
}

export function scoreTarget(query: string, fields: ReadonlyArray<string | undefined>): number {
  if (!query) return 1;
  let best = 0;
  for (const f of fields) {
    if (!f) continue;
    const s = score(query, f);
    if (s > best) best = s;
  }
  return best;
}
