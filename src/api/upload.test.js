import { describe, it, expect, vi } from "vitest";
vi.mock("./kavita.js", () => ({ kavitaScanLibraries: vi.fn(() => Promise.resolve()) }));
import { uploadPath, uploadBook, safeName } from "./upload.js";

describe("upload", () => {
  it("builds LazyLibrarian-style paths with safe names", () => {
    expect(uploadPath("Babel", "R. F. Kuang")).toBe("/api/upload/R.%20F.%20Kuang/Babel/Babel.epub");
    expect(uploadPath("a/b:c", "")).toBe("/api/upload/Unknown/a%20b%20c/a%20b%20c.epub");
    expect(safeName("..hidden", "x")).toBe("hidden");
  });
  it("treats 409 as already there and throws on other errors", async () => {
    expect(await uploadBook(new Blob(["x"]), { title: "T" }, async () => ({ status: 409, ok: false }))).toBe("exists");
    expect(await uploadBook(new Blob(["x"]), { title: "T" }, async () => ({ status: 201, ok: true }))).toBe("uploaded");
    await expect(uploadBook(new Blob(["x"]), { title: "T" }, async () => ({ status: 403, ok: false }))).rejects.toThrow("403");
  });
});
