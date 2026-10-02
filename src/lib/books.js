import JSZip from "jszip";

export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(file);

  // Find the container.xml to get the content.opf path
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  // Parse container.xml to find rootfile path
  const rootfileMatch = containerXml.match(/rootfile[^>]*full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error("Invalid EPUB: cannot find rootfile");

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

  // Read the OPF file
  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("Invalid EPUB: cannot read OPF");

  // Extract metadata
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

  const metadata = {
    title: titleMatch ? titleMatch[1].trim() : null,
    author: authorMatch ? authorMatch[1].trim() : null,
    cover: null,
  };

  // Find cover image - try multiple methods
  // Method 1: Look for meta cover element
  const metaCoverMatch = opfContent.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"/i);
  // Method 2: Look for item with properties="cover-image"
  const coverImageMatch = opfContent.match(/<item[^>]*properties="cover-image"[^>]*href="([^"]+)"/i);
  // Method 3: Look for item with id containing "cover" and image media-type
  const coverIdMatch = opfContent.match(/<item[^>]*id="[^"]*cover[^"]*"[^>]*href="([^"]+)"[^>]*media-type="image\/[^"]+"/i);
  // Method 4: Alternate format for cover-image property
  const coverImageMatch2 = opfContent.match(/<item[^>]*href="([^"]+)"[^>]*properties="cover-image"/i);

  let coverHref = null;
  if (coverImageMatch) {
    coverHref = coverImageMatch[1];
  } else if (coverImageMatch2) {
    coverHref = coverImageMatch2[1];
  } else if (metaCoverMatch) {
    // Need to find the href for this id
    const coverId = metaCoverMatch[1];
    const itemMatch = opfContent.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, "i"));
    if (itemMatch) coverHref = itemMatch[1];
  } else if (coverIdMatch) {
    coverHref = coverIdMatch[1];
  }

  // Load cover image if found (as base64 data URL for persistence)
  if (coverHref) {
    const coverPath = coverHref.startsWith("/") ? coverHref.slice(1) : opfDir + coverHref;
    const coverFile = zip.file(coverPath);
    if (coverFile) {
      const coverBase64 = await coverFile.async("base64");
      const mimeMatch = coverHref.match(/\.(jpe?g|png|gif|webp)$/i);
      const mimeType = mimeMatch ? `image/${mimeMatch[1].toLowerCase().replace("jpg", "jpeg")}` : "image/jpeg";
      metadata.cover = `data:${mimeType};base64,${coverBase64}`;
    }
  }

  // Get spine items (reading order)
  const spineMatches = [
    ...opfContent.matchAll(/<itemref[^>]*idref="([^"]+)"/g),
  ];
  const manifestMatches = [
    ...opfContent.matchAll(
      /<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="application\/xhtml\+xml"/g,
    ),
  ];

  // Also try alternate manifest format
  const manifestMatches2 = [
    ...opfContent.matchAll(
      /<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*media-type="application\/xhtml\+xml"/g,
    ),
  ];

  // Build manifest map
  const manifest = {};
  manifestMatches.forEach((m) => {
    manifest[m[1]] = m[2];
  });
  manifestMatches2.forEach((m) => {
    manifest[m[2]] = m[1];
  });

  // Get ordered content files
  // page = index among the spine itemrefs, which is how Kavita counts book pages
  // (its reading order index); unresolved itemrefs still occupy an index.
  const contentFiles = spineMatches
    .map((m, i) => ({ href: manifest[m[1]], page: i }))
    .filter((c) => c.href);

  // If spine parsing failed, try to get all xhtml files
  if (contentFiles.length === 0) {
    const allFiles = Object.keys(zip.files).filter(
      (f) => f.endsWith(".xhtml") || f.endsWith(".html") || f.endsWith(".htm"),
    );
    allFiles.forEach((f, i) => contentFiles.push({ href: f, page: i }));
  }

  // Extract text from each content file, tracking chapter boundaries
  let fullText = "";
  let runningWordCount = 0;
  const chapters = [];
  const spine = [];
  let chapterIndex = 0;
  for (const { href, page } of contentFiles) {
    const filePath = href.startsWith("/") ? href.slice(1) : opfDir + href;
    const content = await zip.file(filePath)?.async("text");
    if (content) {
      // Try to find a heading to use as the chapter title before stripping tags
      const headingMatch = content.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      let chapterTitle = null;
      if (headingMatch) {
        chapterTitle = headingMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }

      // Strip HTML tags, preserve paragraph breaks
      const textContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<\/?(p|div|br|h[1-6]|blockquote|li|tr)[^>]*>/gi, "\n\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/[^\S\n]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (textContent) {
        chapterIndex += 1;
        const wordsInChapter = textContent.split(/\s+/).filter((w) => w.length > 0).length;
        // Skip near-empty files (e.g. title/cover pages) as separate chapters,
        // but still include their words in the running count.
        if (wordsInChapter >= 30) {
          chapters.push({
            title: chapterTitle || `Chapter ${chapters.length + 1}`,
            startIndex: runningWordCount,
          });
        }
        spine.push({ page, startIndex: runningWordCount });
        runningWordCount += wordsInChapter;
        fullText += textContent + " ";
      }
    }
  }

  return { text: fullText.trim(), metadata, chapters, spine };
}

// Parse text into words and paragraph break positions
export function parseText(text) {
  const paragraphs = text.split(/\n\n+/);
  const words = [];
  const breaks = new Set();
  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).filter((w) => w.length > 0);
    if (paraWords.length > 0) {
      if (words.length > 0) {
        breaks.add(words.length);
      }
      words.push(...paraWords);
    }
  }
  return { words, breaks };
}
