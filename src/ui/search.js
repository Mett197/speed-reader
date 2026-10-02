// Pure full-text search over a words array.

export function normalize(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Returns [{index, snippet}] where index is the first word of each match.
export function searchWords(words, query, { max = 200, context = 4 } = {}) {
  const q = normalize(query).split(/\s+/).filter(Boolean);
  if (!q.length || !words || !words.length) return [];
  const strip = (w) => normalize(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const norm = words.map(strip);
  const out = [];
  for (let i = 0; i + q.length <= words.length && out.length < max; i++) {
    let ok = true;
    for (let k = 0; k < q.length; k++) {
      const t = q[k].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const hit = k === q.length - 1 ? norm[i + k].startsWith(t) : norm[i + k] === t;
      if (!hit) { ok = false; break; }
    }
    if (ok) {
      const from = Math.max(0, i - context);
      const to = Math.min(words.length, i + q.length + context);
      out.push({ index: i, snippet: words.slice(from, to).join(" ") });
    }
  }
  return out;
}
