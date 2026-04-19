// src/hooks/useDigitizer.ts
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

export function useDigitizer() {
  const [job, setJob] = useState<DigitizationJob | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const abortRef = useRef<boolean>(false);

  // ── startJob ───────────────────────────────────────────────────────────────
  // Accepts a single PDF/image File, or an array of image Files (batch mode).
  const startJob = useCallback(async (input: File | File[]) => {
    abortRef.current = false;

    const files = Array.isArray(input) ? input : [input];
    const firstFile = files[0];
    const fileType = detectFileType(firstFile);
    const isMultiImage = fileType === "image" && files.length > 1;

    // Preview: only for single images
    let preview: string | undefined;
    if (fileType === "image" && !isMultiImage) {
      preview = await imageFileToDataUrl(firstFile);
    }

    const displayName = isMultiImage
      ? `${files.length} images`
      : firstFile.name;

    const uploaded: UploadedFile = {
      id: generateId(),
      file: firstFile,
      type: fileType,
      name: displayName,
      size: files.reduce((acc, f) => acc + f.size, 0),
      preview,
    };

    // Count pages
    let totalPages = files.length; // 1 per image file; overridden for PDFs below
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

    // Process pages sequentially
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
          // each page maps to its own source file
          imageBase64 = await imageFileToBase64(files[i]);
          mediaType = getMediaType(files[i]);
        } else {
          imageBase64 = await imageFileToBase64(firstFile);
          mediaType = getMediaType(firstFile);
        }

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

        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          pages[i] = {
            pageNumber: pageNum,
            imageBase64,
            arabicText: ocrResult.text ?? "",
            status: "done",
            confidence: ocrResult.confidence,
            metadata: ocrResult.metadata,
            tokenCount: ocrResult.tokenCount,
            maxTokens: ocrResult.maxTokens,
            duration: ocrResult.duration,
          };
          return { ...prev, pages };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setJob((prev) => {
          if (!prev) return prev;
          const pages = [...prev.pages];
          pages[i] = {
            ...pages[i],
            status: "error",
            error: message,
            arabicText: "",
          };
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

  // ── removePage ─────────────────────────────────────────────────────────────
  // Removes one page from a completed job and adjusts selectedPage if needed.
  const removePage = useCallback((pageNumber: number) => {
    setJob((prev) => {
      if (!prev) return prev;
      const pages = prev.pages.filter((p) => p.pageNumber !== pageNumber);
      if (pages.length === 0) return null; // removed last page → reset
      return { ...prev, pages, totalPages: pages.length };
    });
    setSelectedPage((prev) => {
      // If the removed page was selected, move to the nearest remaining page
      return prev === pageNumber ? Math.max(1, pageNumber - 1) : prev;
    });
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
  // Exports all completed pages as a single .txt file with page separators.
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
    exportAllText,
    copyPageText,
  };
}
