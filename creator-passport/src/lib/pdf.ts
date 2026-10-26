export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Basic safety screen for an uploaded PDF guide. Returns an error message, or null when it looks fine.
 * It checks the file really is a PDF and refuses PDFs that contain scripts, launch actions or
 * embedded files. This is a first filter only; admins still review new guides by default.
 */
export function inspectPdf(buf: Buffer): string | null {
  if (buf.length < 8 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return "That file is not a valid PDF.";
  }
  if (buf.length > MAX_PDF_BYTES) {
    return "PDF is too large. The limit is 10 MB.";
  }
  const text = buf.toString("latin1");
  if (/\/(JavaScript|JS|Launch|EmbeddedFiles?|OpenAction|RichMedia|XFA|SubmitForm|ImportData)\b/.test(text)) {
    return "This PDF contains scripts or embedded content, which isn't allowed. Export a plain PDF and try again.";
  }
  return null;
}

export function safeFileName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60);
  return `${base || "guide"}.pdf`;
}
