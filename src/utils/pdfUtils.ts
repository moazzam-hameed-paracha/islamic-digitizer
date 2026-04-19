// src/utils/pdfUtils.ts
"use client";

/**
 * Dynamically imports pdfjs-dist (client-side only) and renders each PDF
 * page to a canvas, returning base64-encoded PNG images.
 */

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    // Use the bundled legacy worker via CDN to avoid Next.js bundling issues
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  return pdfjsLib;
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

export async function renderPdfPageToBase64(
  file: File,
  pageNumber: number,
  scale = 2.0
): Promise<string> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Return base64 without the data URL prefix
  return canvas.toDataURL("image/png").split(",")[1];
}
