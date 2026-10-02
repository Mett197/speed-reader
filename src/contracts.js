// Interface contract between the reader (UI/timing) and sync (storage/network) modules.
// Do not change a signature without telling the architect. All functions are async unless marked sync.

/**
 * @typedef {Object} BookMeta
 * @property {string} id          stable id: "k:<kavitaChapterId>" or "h:<hash>" for local files
 * @property {string} title
 * @property {string} [author]
 * @property {number} totalWords
 * @property {number} wordIndex   current position
 * @property {number} updatedAt   ms epoch, last-write-wins
 * @property {string} [source]    "kavita" | "local"
 * @property {number} [kavitaLibraryId]
 * @property {number} [kavitaSeriesId]
 * @property {number} [kavitaVolumeId]
 * @property {number} [kavitaChapterId]
 *
 * @typedef {Object} Bookmark
 * @property {string} id          "bm:<bookId>:<wordIndex>"
 * @property {string} bookId
 * @property {number} wordIndex
 * @property {string} [note]
 * @property {number} updatedAt
 * @property {boolean} [deleted]  tombstone so deletes sync
 *
 * @typedef {Object} Session
 * @property {string} id          "session:<startMs>"
 * @property {string} bookId
 * @property {number} startedAt
 * @property {number} endedAt
 * @property {number} words       words read in the session
 * @property {number} avgWpm
 *
 * @typedef {Object} Settings
 * @property {number} wpm
 * @property {string} theme       "light" | "sepia" | "dark" | "night" | "custom"
 * @property {{bg:string, fg:string, accent:string}} [custom]
 * @property {boolean} autoNight
 * @property {number} chunkSize   1..3 words shown at once
 * @property {number} pauseEverySentences  0 = off
 * @property {number} fontScale
 * @property {number} updatedAt
 */

// ---- reader module (src/reader/*): pure sync functions, unit-tested ----
export const READER_API = {
  // delay in ms for `word`; ctx = { baseWpm, isParagraphEnd, warmupIndex }
  getWordDelay: "(word: string, ctx: object) => number",
  // ORP index within the word's letters (punctuation excluded)
  getORPIndex: "(word: string) => number",
  // split words longer than maxLen into hyphen-joined chunks of <= maxLen chars
  splitLongWord: "(word: string, maxLen?: number) => string[]",
  // WCAG contrast ratio of two #rrggbb colors
  contrastRatio: "(fg: string, bg: string) => number",
  // gestures.js: progressive WPM step for a vertical drag (px, velocity px/ms) -> new wpm, clamped 100..1500
  dragToWpm: "(startWpm: number, dyPx: number, velocity: number) => number",
  // gestures.js: horizontal swipe distance -> signed word offset
  swipeToWords: "(dxPx: number) => number",
};

// ---- sync module (src/sync/*): local-first (IndexedDB), pushes to CouchDB when online ----
export const SYNC_API = {
  getBooks: "() => Promise<BookMeta[]>",
  saveBook: "(meta: BookMeta) => Promise<void>",
  saveProgress: "(bookId: string, wordIndex: number) => Promise<void>",
  getBookmarks: "(bookId: string) => Promise<Bookmark[]>",
  toggleBookmark: "(bookId: string, wordIndex: number, note?: string) => Promise<void>",
  logSession: "(s: Session) => Promise<void>",
  getStats: "() => Promise<{ totalWords: number, totalMs: number, avgWpm: number, days: Object }>",
  getSettings: "() => Promise<Settings>",
  saveSettings: "(s: Settings) => Promise<void>",
  syncNow: "() => Promise<{ pushed: number, pulled: number, online: boolean }>",
};

// ---- api module (src/api/*): same-origin /api/*, nginx adds secrets ----
export const API_API = {
  kavitaLogin: "() => Promise<void>  // POST /api/kavita/api/plugin/authenticate, JWT kept in memory",
  kavitaListBooks: "(query?: string) => Promise<BookMeta[]>  // POST /api/kavita/api/series/v2",
  kavitaFetchEpub: "(chapterId: number) => Promise<Blob>  // GET /api/kavita/api/download/chapter?chapterId=",
  kavitaSaveProgress: "(ids: {seriesId, volumeId, chapterId}, pageNum: number) => Promise<void>  // POST /api/kavita/api/reader/progress",
  llSearch: "(name: string) => Promise<Array<{ id, title, author }>>  // /api/ll/api?cmd=findBook&name=",
  llAddAndQueue: "(id: string) => Promise<void>  // cmd=addBook then cmd=queueBook",
};

export const WORD_SPLIT_MAX = 10;
export const MIN_CONTRAST = 7;
export const WPM_MIN = 100;
export const WPM_MAX = 1500;
