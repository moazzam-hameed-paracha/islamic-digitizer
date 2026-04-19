// src/components/ResultViewer/ResultViewer.tsx
"use client";

import { useState } from "react";
import { PageResult } from "@/types";
import styles from "./ResultViewer.module.scss";
import clsx from "clsx";

interface ResultViewerProps {
  page: PageResult;
  onCopy: () => Promise<void>;
}

type Tab = "text" | "image" | "split";

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   "دقة عالية",
  medium: "دقة متوسطة",
  low:    "دقة منخفضة",
};

export default function ResultViewer({ page, onCopy }: ResultViewerProps) {
  const [tab, setTab] = useState<Tab>("split");
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (page.status === "pending") {
    return (
      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon} aria-hidden="true">⏳</span>
        <p>في الانتظار للمعالجة</p>
      </div>
    );
  }

  if (page.status === "processing") {
    return (
      <div className={styles.placeholder}>
        <span className={styles.loadingRing} aria-hidden="true" />
        <p>جارٍ استخراج النص العربي...</p>
        <p className={styles.placeholderSub}>يتم إرسال الصفحة إلى Qari-OCR المحلي</p>
      </div>
    );
  }

  if (page.status === "error") {
    return (
      <div className={clsx(styles.placeholder, styles.placeholderError)}>
        <span className={styles.placeholderIcon} aria-hidden="true">⚠️</span>
        <p>فشلت معالجة هذه الصفحة</p>
        <p className={styles.placeholderSub}>{page.error}</p>
      </div>
    );
  }

  const imageSrc = page.imageBase64
    ? `data:image/png;base64,${page.imageBase64}`
    : null;

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Tabs */}
        <div className={styles.tabs} dir="ltr" role="tablist">
          {(["split", "text", "image"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={clsx(styles.tab, { [styles.activeTab]: tab === t })}
              onClick={() => setTab(t)}
            >
              {t === "split" ? "عرض مزدوج" : t === "text" ? "النص" : "الصورة"}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRight} dir="rtl">
          {/* Font size */}
          <div className={styles.fontSizeGroup} aria-label="حجم الخط">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                className={clsx(styles.fontSizeBtn, { [styles.activeFontSize]: fontSize === s })}
                onClick={() => setFontSize(s)}
                aria-label={`حجم خط ${s}`}
              >
                {s === "sm" ? "ص" : s === "md" ? "ص" : "ص"}
              </button>
            ))}
          </div>

          {/* Confidence badge */}
          {page.confidence && (
            <span
              className={clsx(styles.badge, {
                [styles.badgeHigh]:   page.confidence === "high",
                [styles.badgeMedium]: page.confidence === "medium",
                [styles.badgeLow]:    page.confidence === "low",
              })}
            >
              {CONFIDENCE_LABEL[page.confidence]}
            </span>
          )}

          {/* Metadata chips */}
          {page.metadata?.hasDiacritics && (
            <span className={styles.chip}>تشكيل</span>
          )}
          {page.metadata?.hasHeadings && (
            <span className={styles.chip}>عناوين</span>
          )}

          {/* Copy button */}
          <button className={styles.copyBtn} onClick={handleCopy} disabled={!page.arabicText}>
            {copied ? (
              <>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8.5 L6.5 12 L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                تم النسخ
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                نسخ النص
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className={clsx(styles.content, {
          [styles.splitView]: tab === "split",
          [styles.textOnly]:  tab === "text",
          [styles.imageOnly]: tab === "image",
        })}
      >
        {/* Image panel */}
        {(tab === "image" || tab === "split") && imageSrc && (
          <div className={styles.imagePanel}>
            <p className={styles.panelLabel}>الصورة الأصلية</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={`صفحة ${page.pageNumber}`}
              className={styles.pageImage}
            />
          </div>
        )}

        {/* Text panel */}
        {(tab === "text" || tab === "split") && (
          <div className={styles.textPanel}>
            <p className={styles.panelLabel}>النص المستخرج</p>
            <div
              className={clsx(styles.arabicText, {
                [styles.fontSm]: fontSize === "sm",
                [styles.fontMd]: fontSize === "md",
                [styles.fontLg]: fontSize === "lg",
              })}
              dir="rtl"
              lang="ar"
            >
              {page.arabicText || (
                <span className={styles.emptyText}>لم يُستخرج نص من هذه الصفحة.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Page footer */}
      <div className={styles.footer} dir="rtl">
        <span>صفحة {page.pageNumber}</span>
        {page.metadata && (
          <span>~ {page.metadata.estimatedLines} سطر · {page.arabicText.length} حرف</span>
        )}
      </div>
    </div>
  );
}
