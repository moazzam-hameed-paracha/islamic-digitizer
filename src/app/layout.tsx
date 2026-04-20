// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "مرقمن — Islamic Manuscript Digitizer",
  description:
    "AI-powered digitization of Arabic Islamic manuscripts and books. Upload PDFs or images and extract accurate Arabic text.",
  keywords: ["Arabic OCR", "Islamic manuscript", "Arabic text", "digitization", "مخطوط"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
