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
  if (file.type === "application/pdf") return "pdf";
  return "image";
}

export function useDigitizer() {
  const [job, setJob] = useState<DigitizationJob | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const abortRef = useRef<boolean>(false);

  const startJob = useCallback(async (file: File) => {
    abortRef.current = false;
    const fileType = detectFileType(file);

    let preview: string | undefined;
    if (fileType === "image") {
      preview = await imageFileToDataUrl(file);
    }

    const uploaded: UploadedFile = {
      id: generateId(),
      file,
      type: fileType,
      name: file.name,
      size: file.size,
      preview,
    };

    // Count pages
    let totalPages = 1;
    if (fileType === "pdf") {
      totalPages = await getPdfPageCount(file);
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

      // Update current page being processed
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
          imageBase64 = await renderPdfPageToBase64(file, pageNum);
          mediaType = "image/png";
        } else {
          imageBase64 = await imageFileToBase64(file);
          mediaType = getMediaType(file);
        }

        const res = await fetch("/api/digitize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64, mediaType }),
        });

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

    // Mark job complete
    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: abortRef.current ? "error" : "complete",
        completedAt: new Date(),
      };
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

  const exportAllText = useCallback(() => {
    if (!job) return;
    const allText = job.pages
      .filter((p) => p.status === "done")
      .map((p) => `--- صفحة ${p.pageNumber} ---\n\n${p.arabicText}`)
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
    exportAllText,
    copyPageText,
  };
}
