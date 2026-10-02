import JSZip from "jszip";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Minimal EPUB 3 from plain text. chapters: [{ title, startIndex }] word offsets as parseText counts them.
export async function makeEpub({ title, author = "", text, chapters = [] }) {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const starts = [];
  let w = 0;
  for (const p of paras) { starts.push(w); w += p.split(/\s+/).filter(Boolean).length; }

  const cuts = [{ title: chapters[0]?.startIndex > 0 || !chapters.length ? title : chapters[0].title, at: 0 }];
  for (const c of chapters) {
    const at = starts.findIndex((s) => s >= c.startIndex);
    if (at > 0 && at > cuts[cuts.length - 1].at) cuts.push({ title: c.title, at });
    else if (at === 0) cuts[0].title = c.title;
  }
  const sections = cuts.map((c, i) => ({ title: c.title, paras: paras.slice(c.at, cuts[i + 1]?.at ?? paras.length) }));

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const items = sections.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = sections.map((_, i) => `<itemref idref="c${i}"/>`).join("");
  zip.file("OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">speedreader-${Date.now()}</dc:identifier>` +
    `<dc:title>${esc(title)}</dc:title>${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}<dc:language>en</dc:language>` +
    `<meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta></metadata>` +
    `<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest>` +
    `<spine>${spine}</spine></package>`);
  zip.file("OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head>` +
    `<body><nav epub:type="toc"><ol>${sections.map((s, i) => `<li><a href="c${i}.xhtml">${esc(s.title)}</a></li>`).join("")}</ol></nav></body></html>`);
  sections.forEach((s, i) => {
    zip.file(`OEBPS/c${i}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title></title></head>` +
      `<body>${s.paras.map((p) => `<p>${esc(p)}</p>`).join("\n")}</body></html>`);
  });
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}
