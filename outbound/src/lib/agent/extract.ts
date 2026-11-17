/**
 * Reads the text out of a file in the browser. The original file is never uploaded: only this text is sent,
 * and the server removes phone numbers and personal emails from it again.
 */

export const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const PLAIN = ["txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "html", "htm"];

export const extensionOf = (name: string) => (name.toLowerCase().split(".").pop() ?? "").trim();

/** The visible text of one slide or notes page: every <a:t> run, one paragraph per <a:p>. */
export function textFromOoxml(xml: string): string {
  const paras = xml.split(/<\/a:p>/i).map((p) => [...p.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)].map((m) => m[1]).join("")).filter((t) => t.trim());
  return paras.join("\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export const stripHtml = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

/** A PDF with almost no text for its page count is a scan: reading it needs a different route. */
export const looksScanned = (chars: number, pages: number) => pages > 0 && chars < 40 * pages;

export async function extractText(file: File): Promise<{ text: string; pages: number | null }> {
  const ext = extensionOf(file.name);
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is over 50 MB.");
  if (PLAIN.includes(ext)) {
    const raw = await file.text();
    return { text: ext === "html" || ext === "htm" ? stripHtml(raw) : raw, pages: null };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: r.value, pages: null };
  }
  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const n = (f: string) => Number(f.match(/(\d+)\.xml$/)?.[1] ?? 0);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => n(a) - n(b));
    const out: string[] = [];
    for (const f of slides) {
      const num = n(f);
      const body = textFromOoxml(await zip.files[f].async("string"));
      const notesFile = `ppt/notesSlides/notesSlide${num}.xml`;
      const notes = zip.files[notesFile] ? textFromOoxml(await zip.files[notesFile].async("string")) : "";
      out.push(`## Slide ${num}\n${body}${notes ? `\n\nSpeaker notes: ${notes}` : ""}`);
    }
    return { text: out.join("\n\n"), pages: slides.length };
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = pdf.numPages;
    const out: string[] = [];
    for (let i = 1; i <= Math.min(pages, 400); i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out.push((content.items as Array<{ str?: string; hasEOL?: boolean }>).map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim());
    }
    const text = out.join("\n\n");
    if (looksScanned(text.length, pages)) throw new Error("This PDF looks scanned, so there is no text to read. Scans and images need the extra consent step, which comes next.");
    return { text, pages };
  }
  throw new Error(`.${ext || "that type"} files are not supported yet. Try PDF, Word, PowerPoint, text, Markdown or CSV.`);
}
