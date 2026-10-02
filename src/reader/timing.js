// Pure timing helpers for the RSVP reader.

const LETTER_RE = /[\p{L}\p{N}]/gu;
const DIGIT_RE = /\p{N}/u;
const END_RE = /[.!?…]+["'”’)\]»]*$/u;
const PAUSE_RE = /[,;:]+["'”’)\]»]*$/u;

function countLetters(word) {
  const m = word.match(LETTER_RE);
  return m ? m.length : 0;
}

export function getWordDelay(word, ctx = {}) {
  const { baseWpm = 300, isParagraphEnd = false, warmupIndex = -1 } = ctx;
  const base = 60000 / baseWpm;
  const letters = countLetters(word);

  let m = 1 + Math.min(0.8, (0.3 * Math.max(0, letters - 6)) / 6);
  if (letters <= 3) m *= 0.85;

  let punct = 1;
  if (END_RE.test(word)) punct = 2.2;
  else if (PAUSE_RE.test(word)) punct = 1.5;
  if (isParagraphEnd) punct = Math.max(punct, 2.5);
  m *= punct;

  if (DIGIT_RE.test(word) || letters > 12) m *= 1.3;

  let delay = base * m;
  if (Number.isInteger(warmupIndex) && warmupIndex >= 0 && warmupIndex <= 4) {
    delay /= 0.6 + 0.1 * warmupIndex;
  }
  return delay;
}

// Index into the original word of the optimal recognition point.
export function getORPIndex(word) {
  const n = countLetters(word);
  const k = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  let seen = 0;
  for (let i = 0; i < word.length; i++) {
    if (/[\p{L}\p{N}]/u.test(word[i])) {
      if (seen === k) return i;
      seen++;
    }
  }
  return 0;
}

const isVowel = (c) => /[aeiouyAEIOUYÀ-ÆÈ-ÏÒ-ÖÙ-Ýà-æè-ïò-öù-ý]/.test(c);

// Chunks of <= maxLen chars; every chunk but the last ends with "-"
// (an existing hyphen at the cut is reused instead of adding another).
export function splitLongWord(word, maxLen = 10) {
  if (word.length <= maxLen) return [word];
  const out = [];
  let rest = word;
  while (rest.length > maxLen) {
    const cmax = maxLen - 1;
    let cut = -1;
    for (let i = cmax; i >= 2; i--) {
      if (rest[i - 1] === "-") { cut = i; break; }
    }
    if (cut > 0) {
      out.push(rest.slice(0, cut));
    } else {
      cut = cmax;
      for (let c = cmax; c >= Math.max(2, cmax - 2); c--) {
        if (isVowel(rest[c - 1]) !== isVowel(rest[c])) { cut = c; break; }
      }
      while (cut > 1 && rest[cut] === "-") cut--;
      out.push(rest.slice(0, cut) + "-");
    }
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}
