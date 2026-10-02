// Fixed-size "pages" of words so a book can be navigated page by page.

export const WORDS_PER_PAGE = 250;

export function pageCount(total, size = WORDS_PER_PAGE) {
  return Math.max(1, Math.ceil(total / size));
}

// 1-based page the word index falls on.
export function pageOf(index, size = WORDS_PER_PAGE) {
  return Math.floor(Math.max(0, index) / size) + 1;
}

// Word index where a 1-based page starts, clamped to the book.
export function pageStart(page, total, size = WORDS_PER_PAGE) {
  const p = Math.min(Math.max(1, Math.round(page) || 1), pageCount(total, size));
  return Math.min((p - 1) * size, Math.max(0, total - 1));
}

// User-typed word number (1-based) to a clamped 0-based index.
export function wordToIndex(n, total) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(1, v), Math.max(1, total)) - 1;
}
