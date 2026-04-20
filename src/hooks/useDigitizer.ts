"use client";

import { useState, useCallback, useRef } from "react";
import { DigitizationJob, UploadedFile, PageResult, FileType } from "@/types";
import { renderPdfPageToBase64, getPdfPageCount } from "@/utils/pdfUtils";
import { imageFileToBase64, imageFileToDataUrl, getMediaType } from "@/utils/imageUtils";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function detectFileType(file: File): FileType {
  if (file.type === "application/pdf" && process.env.NEXT_PUBLIC_ENABLE_PDF !== "false") return "pdf";
  return "image";
}

/** Shared helper — calls the OCR API and returns a partial PageResult. */
async function runOcr(
  imageBase64: string,
  mediaType: string
): Promise<Partial<PageResult>> {
  const res = await fetch("/api/digitize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mediaType }),
  });

  if (res.status === 422) {
    const errBody = await res.json();
    if (errBody.error === "MAX_TOKENS_REACHED") {
      throw new Error(
        `Max tokens reached (${errBody.tokenCount ?? "?"}/${errBody.maxTokens ?? "?"}): output was truncated before completion.`
      );
    }
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const ocrResult = await res.json();
  return {
    arabicText: ocrResult.text ?? "",
    status: "done" as const,
    tokenCount: ocrResult.tokenCount,
    maxTokens: ocrResult.maxTokens,
    duration: ocrResult.duration,
  };
}

export function useDigitizer() {
  const [job, setJob] = useState<DigitizationJob | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const abortRef = useRef<boolean>(false);

  // ── startJob ───────────────────────────────────────────────────────────────
  const startJob = useCallback(async (input: File | File[]) => {
    abortRef.current = false;

    const files = Array.isArray(input) ? input : [input];
    const firstFile = files[0];
    const fileType = detectFileType(firstFile);
    const isMultiImage = fileType === "image" && files.length > 1;

    let preview: string | undefined;
    if (fileType === "image" && !isMultiImage) {
      preview = await imageFileToDataUrl(firstFile);
    }

    const displayName = isMultiImage ? `${files.length} images` : firstFile.name;

    const uploaded: UploadedFile = {
      id: generateId(),
      file: firstFile,
      type: fileType,
      name: displayName,
      size: files.reduce((acc, f) => acc + f.size, 0),
      preview,
    };

    let totalPages = files.length;
    if (fileType === "pdf") {
      totalPages = await getPdfPageCount(firstFile);
    }

    const initialPages: PageResult[] = Array.from({ length: totalPages }, (_, i) => ({
      pageNumber: i + 1,
      imageBase64: "",
      arabicText: "",
      status: "pending",
    }));

    const newJob: DigitizationJob = {
      id: generateId(),
      file: uploaded,
      sourceFiles: isMultiImage ? files : undefined,
      totalPages,
      currentPage: 0,
      pages: initialPages,
      status: "processing",
      startedAt: new Date(),
    };

    setJob(newJob);
    setSelectedPage(1);

    for (let i = 0; i < totalPages; i++) {
      if (abortRef.current) break;

      const pageNum = i + 1;

      setJob((prev) => {
        if (!prev) return prev;
        const pages = [...prev.pages];
        pages[i] = { ...pages[i], status: "processing" };
        return { ...prev, currentPage: pageNum, pages };
      });

      try {
        let imageBase64: string;
        let mediaType: string;

        if (fileType === "pdf") {
          imageBase64 = await renderPdfPageToBase64(firstFile, pageNum);
          mediaType = "image/png";
        } else if (isMultiImage) {
          imageBase64 = await imageFileToBase64(files[i]);
          mediaType = getMediaType(files[i]);
        } else {
          imageBase64 = await imageFileToBase64(firstFile);
          mediaType = getMediaType(firstFile);
        }

        const ocrResult = await runOcr(imageBase64, mediaType);

        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          pages[i] = { pageNumber: pageNum, imageBase64, ...ocrResult } as PageResult;
          return { ...prev, pages };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          pages[i] = { ...pages[i], status: "error", error: message, arabicText: "" };
          return { ...prev, pages };
        });
      }
    }

    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: abortRef.current ? "error" : "complete",
        completedAt: new Date(),
      };
    });
  }, []);

  // ── reorderPages ───────────────────────────────────────────────────────────
  // Moves a page from fromIndex to toIndex (both 0-based array indices).
  // Also adjusts selectedPage so the highlighted page follows the new numbering.
  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setJob((prev) => {
      if (!prev) return prev;
      const pages = [...prev.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      const renumbered = pages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
      return { ...prev, pages: renumbered };
    });

    // Keep the selected page tracking the moved page or adjust for shifts.
    setSelectedPage((prevSelected) => {
      const prevIndex = prevSelected - 1; // convert to 0-based
      if (prevIndex === fromIndex) return toIndex + 1;
      if (fromIndex < toIndex) {
        if (prevIndex > fromIndex && prevIndex <= toIndex) return prevSelected - 1;
      } else {
        if (prevIndex >= toIndex && prevIndex < fromIndex) return prevSelected + 1;
      }
      return prevSelected;
    });
  }, []);

  // ── insertPages ────────────────────────────────────────────────────────────
  // Inserts new image(s) or PDF pages at a given position.
  // afterPageNumber = 0  → insert before page 1 (at the start)
  // afterPageNumber = N  → insert after page N
  const insertPages = useCallback(async (input: File | File[], afterPageNumber: number) => {
    abortRef.current = false;

    const files = Array.isArray(input) ? input : [input];
    const firstFile = files[0];
    const fileType = detectFileType(firstFile);

    let newPageCount = files.length;
    if (fileType === "pdf") {
      newPageCount = await getPdfPageCount(firstFile);
    }

    // Insert placeholder pages at position afterPageNumber in the array.
    setJob((prev) => {
      if (!prev) return prev;
      const placeholders: PageResult[] = Array.from({ length: newPageCount }, () => ({
        pageNumber: 0,
        imageBase64: "",
        arabicText: "",
        status: "pending" as const,
      }));
      const pages = [...prev.pages];
      pages.splice(afterPageNumber, 0, ...placeholders);
      const renumbered = pages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
      return {
        ...prev,
        pages: renumbered,
        totalPages: renumbered.length,
        status: "processing",
      };
    });

    // The new pages have numbers: afterPageNumber+1 … afterPageNumber+newPageCount
    for (let i = 0; i < newPageCount; i++) {
      if (abortRef.current) break;

      const pageNum = afterPageNumber + i + 1;

      setJob((prev) => {
        if (!prev) return prev;
        const pages = [...prev.pages];
        const idx = pages.findIndex((p) => p.pageNumber === pageNum);
        if (idx === -1) return prev;
        pages[idx] = { ...pages[idx], status: "processing" };
        return { ...prev, currentPage: pageNum, pages };
      });

      try {
        let imageBase64: string;
        let mediaType: string;

        if (fileType === "pdf") {
          imageBase64 = await renderPdfPageToBase64(firstFile, i + 1);
          mediaType = "image/png";
        } else {
          imageBase64 = await imageFileToBase64(files[i]);
          mediaType = getMediaType(files[i]);
        }

        const ocrResult = await runOcr(imageBase64, mediaType);

        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          const idx = pages.findIndex((p) => p.pageNumber === pageNum);
          if (idx === -1) return prev;
          pages[idx] = { pageNumber: pageNum, imageBase64, ...ocrResult } as PageResult;
          return { ...prev, pages };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          const idx = pages.findIndex((p) => p.pageNumber === pageNum);
          if (idx === -1) return prev;
          pages[idx] = { ...pages[idx], status: "error", error: message, arabicText: "" };
          return { ...prev, pages };
        });
      }
    }

    // Restore status based on whether all pages succeeded.
    setJob((prev) => {
      if (!prev) return prev;
      const allSettled = prev.pages.every(
        (p) => p.status === "done" || p.status === "error"
      );
      return {
        ...prev,
        status: allSettled ? "complete" : "error",
        completedAt: new Date(),
      };
    });

    // Auto-select the first newly inserted page.
    setSelectedPage(afterPageNumber + 1);
  }, []);

  // ── removePage ─────────────────────────────────────────────────────────────
  const removePage = useCallback((pageNumber: number) => {
    setJob((prev) => {
      if (!prev) return prev;
      const pages = prev.pages
        .filter((p) => p.pageNumber !== pageNumber)
        .map((p, i) => ({ ...p, pageNumber: i + 1 }));
      if (pages.length === 0) return null;
      return { ...prev, pages, totalPages: pages.length };
    });
    setSelectedPage((prev) => (prev === pageNumber ? Math.max(1, pageNumber - 1) : prev));
  }, []);

  const cancelJob = useCallback(() => {
    abortRef.current = true;
    setJob((prev) => (prev ? { ...prev, status: "error" } : null));
  }, []);

  const resetJob = useCallback(() => {
    abortRef.current = true;
    setJob(null);
    setSelectedPage(1);
  }, []);

  // ── exportAllText ──────────────────────────────────────────────────────────
  const exportAllText = useCallback(() => {
    if (!job) return;
    const allText = job.pages
      .filter((p) => p.status === "done")
      .map((p) => `════════════════════\nصفحة ${p.pageNumber}\n════════════════════\n\n${p.arabicText}`)
      .join("\n\n");

    const blob = new Blob([allText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.file.name.replace(/\.[^.]+$/, "")}-digitized.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [job]);

  const copyPageText = useCallback(
    async (pageNumber: number) => {
      if (!job) return;
      const page = job.pages.find((p) => p.pageNumber === pageNumber);
      if (page?.arabicText) {
        await navigator.clipboard.writeText(page.arabicText);
      }
    },
    [job]
  );

  return {
    job,
    selectedPage,
    setSelectedPage,
    startJob,
    cancelJob,
    resetJob,
    removePage,
    reorderPages,
    insertPages,
    exportAllText,
    copyPageText,
  };
}
