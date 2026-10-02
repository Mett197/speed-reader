// Sentence navigation over a word array.

const END_RE = /[.!?…]+["'”’)\]»]*$/u;
const CLOSERS_RE = /["'”’)\]»]+$/u;
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
  "cf", "no", "fig", "inc", "ltd", "co", "mt", "gen", "col", "capt", "lt", "sgt",
]);

function endsSentence(token, next) {
  if (!END_RE.test(token)) return false;
  const core = token.replace(CLOSERS_RE, "").replace(/^[^\p{L}\p{N}]+/u, "");
  if (/…$|\.{2,}$/.test(core)) {
    // ellipsis: only a sentence end when the next word is not lowercase
    return !(next && /^[^\p{L}\p{N}]*\p{Ll}/u.test(next));
  }
  if (core.endsWith(".")) {
    const stem = core.slice(0, -1).toLowerCase();
    if (ABBREVIATIONS.has(stem)) return false;
    // single capital initial such as "J."
    if (/^\p{Lu}$/u.test(core.slice(0, -1))) return false;
  }
  return true;
}

export function getSentenceStarts(words) {
  if (!words || words.length === 0) return [];
  const starts = [0];
  for (let i = 1; i < words.length; i++) {
    if (endsSentence(words[i - 1], words[i])) starts.push(i);
  }
  return starts;
}

// Smallest position in sorted `a` with a[pos] > x (a.length when none).
function upper(a, x) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// Within the first `grace` words of a sentence, go to the previous sentence
// (like a music player's back button), otherwise to the start of this one.
export function prevSentenceStart(starts, index, grace = 3) {
  if (!starts.length) return 0;
  const p = upper(starts, index) - 1; // last start <= index
  if (p < 0) return starts[0];
  if (index - starts[p] < grace) return starts[Math.max(0, p - 1)];
  return starts[p];
}

export function nextSentenceStart(starts, index) {
  if (!starts.length) return 0;
  const p = upper(starts, index);
  return p >= starts.length ? starts[starts.length - 1] : starts[p];
}
