// src/types/index.ts

export type FileType = "pdf" | "image";

export interface UploadedFile {
  id: string;
  file: File;
  type: FileType;
  name: string;
  size: number;
  preview?: string; // base64 or object URL for images
}

export type PageStatus = "pending" | "processing" | "done" | "error";

export interface PageResult {
  pageNumber: number;
  imageBase64: string;       // the rendered page image sent to Claude
  arabicText: string;        // extracted Arabic OCR text
  status: PageStatus;
  error?: string;
  confidence?: "high" | "medium" | "low";
  metadata?: {
    hasHeadings: boolean;
    hasDiacritics: boolean;
    hasTables: boolean;
    estimatedLines: number;
  };
}

export interface DigitizationJob {
  id: string;
  file: UploadedFile;
  totalPages: number;
  currentPage: number;
  pages: PageResult[];
  status: "idle" | "processing" | "complete" | "error";
  startedAt?: Date;
  completedAt?: Date;
}

export interface ClaudeOCRResponse {
  text: string;
  confidence: "high" | "medium" | "low";
  metadata: {
    hasHeadings: boolean;
    hasDiacritics: boolean;
    hasTables: boolean;
    estimatedLines: number;
  };
}
