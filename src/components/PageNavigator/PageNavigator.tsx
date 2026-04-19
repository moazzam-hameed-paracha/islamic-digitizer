// src/components/PageNavigator/PageNavigator.tsx
"use client";

import { PageResult } from "@/types";
import styles from "./PageNavigator.module.scss";
import clsx from "clsx";

interface PageNavigatorProps {
  pages: PageResult[];
  selectedPage: number;
  onSelectPage: (page: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending:    "في الانتظار",
  processing: "جارٍ المعالجة",
  done:       "مكتملة",
  error:      "خطأ",
};

export default function PageNavigator({
  pages,
  selectedPage,
  onSelectPage,
}: PageNavigatorProps) {
  return (
    <nav className={styles.nav} aria-label="تنقل بين الصفحات">
      <p className={styles.heading}>الصفحات</p>

      <ul className={styles.list} role="list">
        {pages.map((page) => (
          <li key={page.pageNumber}>
            <button
              className={clsx(styles.pageBtn, {
                [styles.selected]:   page.pageNumber === selectedPage,
                [styles.done]:       page.status === "done",
                [styles.processing]: page.status === "processing",
                [styles.error]:      page.status === "error",
              })}
              onClick={() => onSelectPage(page.pageNumber)}
              aria-current={page.pageNumber === selectedPage ? "page" : undefined}
              aria-label={`صفحة ${page.pageNumber} — ${STATUS_LABEL[page.status]}`}
            >
              <span className={styles.pageNum}>{page.pageNumber}</span>

              <span className={styles.statusDot} aria-hidden="true" />

              {page.status === "processing" && (
                <span className={styles.spinner} aria-hidden="true" />
              )}

              {page.metadata && page.status === "done" && (
                <span className={styles.meta} dir="rtl">
                  {page.metadata.estimatedLines} سطر
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
