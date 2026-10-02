// LazyLibrarian client: findBook, addBook, queueBook, getWanted; nginx adds the apikey.

const BASE = "/api/ll/api";

async function call(params) {
  const qs = new URLSearchParams(params).toString();
  let res;
  try {
    res = await fetch(`${BASE}?${qs}`);
  } catch (e) {
    throw new Error(`LazyLibrarian unreachable: ${e.message}`);
  }
  if (!res.ok) throw new Error(`LazyLibrarian ${params.cmd} failed (${res.status})`);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain-text replies such as "OK" are fine
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const status = String(data.status ?? data.Success ?? "").toLowerCase();
    if (status === "error" || status === "failed" || data.error) {
      throw new Error(`LazyLibrarian ${params.cmd}: ${data.error || data.message || data.status}`);
    }
  } else if (typeof data === "string" && /^\s*error/i.test(data)) {
    throw new Error(`LazyLibrarian ${params.cmd}: ${data.trim()}`);
  }
  return data;
}

function asList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["results", "books", "data"]) if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

export async function llSearch(name) {
  const data = await call({ cmd: "findBook", name });
  return asList(data).map((b) => ({
    id: String(b.bookid ?? b.BookID ?? b.id ?? ""),
    title: String(b.bookname ?? b.BookName ?? b.title ?? ""),
    author: String(b.authorname ?? b.AuthorName ?? b.author ?? ""),
  })).filter((b) => b.id);
}

export async function llAddAndQueue(id) {
  await call({ cmd: "addBook", id });
  await call({ cmd: "queueBook", id, type: "eBook" });
}

// Books LazyLibrarian is still looking for: [{ id, title, author, status }].
export async function llWanted() {
  const data = await call({ cmd: "getWanted" });
  return asList(data).map((b) => ({
    id: String(b.bookid ?? b.BookID ?? b.id ?? ""),
    title: String(b.bookname ?? b.BookName ?? b.title ?? ""),
    author: String(b.authorname ?? b.AuthorName ?? b.author ?? ""),
    status: String(b.status ?? b.Status ?? "Wanted"),
  }));
}
