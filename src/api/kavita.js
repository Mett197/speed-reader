// Kavita client. Same-origin only: nginx injects the plugin apiKey on the authenticate call.
//
// Verified against Kavita main (raw.githubusercontent.com/Kareadita/Kavita/main/API):
// * FilterV2Dto { name?, statements: [{comparison, field, value}], combination (Or=0, And=1),
//   sortOptions {sortField, isAscending}, limitTo }, JSON serialized camelCase.
// * FilterField: SeriesName=1, Formats=21. FilterComparison: Equal=0, Contains=5.
// * SortField: SortName=1. MangaFormat: Epub=3.
// * POST /api/series/v2 (FromQuery UserParams, FromBody FilterV2Dto), GET /api/series/volumes.
// * ProgressDto requires volumeId, chapterId, pageNum, seriesId, libraryId (bookScrollId optional).
// * PluginController POST authenticate takes apiKey and pluginName from the query.
// Assumed (not verified against a running server): response shapes (token, refreshToken,
// SeriesDto.format, VolumeDto.chapters[].id) and that libraryId may be omitted when unknown.

const BASE = "/api/kavita";
const FIELD_SERIES_NAME = 1;
const FIELD_FORMATS = 21;
const CMP_EQUAL = 0;
const CMP_CONTAINS = 5;
const COMBINATION_AND = 1;
const SORT_NAME = 1;
const FORMAT_EPUB = 3;

let token = null;

export function _resetKavita() {
  token = null;
}

export async function kavitaLogin() {
  const res = await fetch(`${BASE}/api/plugin/authenticate?pluginName=speedreader`, { method: "POST" });
  if (!res.ok) throw new Error(`Kavita login failed (${res.status})`);
  const data = await res.json();
  if (!data || !data.token) throw new Error("Kavita login returned no token");
  token = data.token;
}

// Single helper for every authenticated call; re-logs in once on a 401.
async function authedFetch(path, init = {}) {
  if (!token) await kavitaLogin();
  const send = () =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
  let res = await send();
  if (res.status === 401) {
    await kavitaLogin();
    res = await send();
  }
  if (!res.ok) throw new Error(`Kavita request failed (${res.status}) ${path.split("?")[0]}`);
  return res;
}

function postJson(path, body) {
  return authedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function kavitaListBooks(query = "") {
  const statements = [{ comparison: CMP_EQUAL, field: FIELD_FORMATS, value: String(FORMAT_EPUB) }];
  if (query) statements.push({ comparison: CMP_CONTAINS, field: FIELD_SERIES_NAME, value: query });
  const filter = {
    statements,
    combination: COMBINATION_AND,
    sortOptions: { sortField: SORT_NAME, isAscending: true },
    limitTo: 0,
  };
  const series = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await (await postJson(`/api/series/v2?pageNumber=${page}&pageSize=100`, filter)).json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    series.push(...batch);
    if (batch.length < 100) break;
  }
  const epubs = series.filter((s) => s.format === FORMAT_EPUB);
  const books = [];
  for (const s of epubs) {
    const volumes = await (await authedFetch(`/api/series/volumes?seriesId=${s.id}`)).json();
    for (const v of Array.isArray(volumes) ? volumes : []) {
      for (const c of v.chapters || []) {
        books.push({
          id: `k:${c.id}`,
          title: v.chapters.length > 1 && c.titleName ? `${s.name} - ${c.titleName}` : s.name,
          totalWords: Number(c.wordCount) || Number(s.wordCount) || 0,
          wordIndex: 0,
          updatedAt: 0,
          source: "kavita",
          kavitaLibraryId: s.libraryId,
          kavitaSeriesId: s.id,
          kavitaVolumeId: v.id,
          kavitaChapterId: c.id,
          author: s.author || "",
        });
      }
    }
  }
  return books;
}

export async function kavitaFetchEpub(chapterId) {
  const res = await authedFetch(`/api/download/chapter?chapterId=${encodeURIComponent(chapterId)}`);
  return res.blob();
}

export async function kavitaSaveProgress(ids, pageNum) {
  await postJson("/api/reader/progress", {
    seriesId: ids.seriesId,
    volumeId: ids.volumeId,
    chapterId: ids.chapterId,
    libraryId: ids.libraryId ?? 0,
    ...(ids.bookScrollId ? { bookScrollId: ids.bookScrollId } : {}),
    pageNum,
  });
}
