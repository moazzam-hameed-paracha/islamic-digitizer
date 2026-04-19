# مرقمن — Islamic Manuscript Digitizer

A production-ready **Next.js 15 + TypeScript + Modular SCSS** SPA for digitizing Arabic Islamic manuscripts, backed by the locally-running **Qari-OCR-0.1-VL-2B** model via Gradio.

---

## Architecture

```
Browser (Next.js SPA)
    │  upload image / render PDF page → base64
    ▼
Next.js API Route  /api/digitize
    │  POST { data: ["data:image/png;base64,..."] }
    ▼
Gradio server  http://localhost:7860/api/predict
    │  running  oddadmix/Qari-OCR-0.1-VL-2B-Instruct
    ▼
{ data: ["extracted Arabic text"] }
    │  derive metadata (lines, diacritics, headings)
    ▼
Browser  →  ResultViewer (split image / text view)
```

---

## Features

- 📄 **PDF support** — Multi-page PDFs rendered page-by-page via `pdfjs-dist`
- 🖼️ **Image support** — JPEG, PNG, WebP, GIF
- 🤖 **Qari-OCR** — Specialized Arabic OCR model (Qwen2-VL 2B fine-tune)
- 📖 **Split-view** — Side-by-side original image + extracted Arabic text
- 🔤 **RTL-first UI** — Fully right-to-left Arabic interface with Amiri font
- 📊 **Metadata** — Auto-detected confidence, line count, diacritics, headings
- 💾 **Export** — Download as `.txt` or `.json`
- ⚡ **Sequential processing** — Pages processed one-by-one with live progress

---

## Tech Stack

| Layer        | Technology                               |
|-------------|-------------------------------------------|
| Framework   | Next.js 15 (App Router)                   |
| Language    | TypeScript 5                              |
| Styling     | Modular SCSS + CSS Custom Properties      |
| PDF Engine  | pdfjs-dist 4                              |
| OCR Model   | `oddadmix/Qari-OCR-0.1-VL-2B-Instruct`  |
| OCR Server  | Gradio (Python, local)                    |
| Fonts       | Amiri (Arabic), Cinzel (Display), Lato (UI) |

---

## Getting Started

### 1. Start the Qari OCR Python server

```bash
pip install gradio transformers qwen-vl-utils torch pillow
python qari_ocr.py        # your existing Gradio script
# → Running on http://localhost:7860
```

### 2. Clone & install the Next.js app

```bash
git clone <your-repo>
cd islamic-digitizer
npm install
```

### 3. Configure environment (optional)

```bash
cp .env.example .env.local
```

The default Gradio URL is `http://localhost:7860`. If you changed the port, edit `.env.local`:

```env
GRADIO_URL=http://localhost:7860
```

### 4. Run the dev server

```bash
npm run dev
# → http://localhost:3000
```

### 5. Build for production

```bash
npm run build && npm start
```

---

## Project Structure

```
src/
├── app/
│   ├── api/digitize/route.ts   # Gradio proxy (calls /api/predict)
│   ├── globals.scss            # Global styles & Google Fonts
│   ├── layout.tsx              # Root layout (RTL, lang="ar")
│   ├── page.tsx                # Main SPA page
│   └── page.module.scss
├── components/
│   ├── Header/                 # App header with Islamic ornaments
│   ├── FileUploader/           # Drag-and-drop upload zone
│   ├── ProcessingStatus/       # Progress bar + page dot indicators
│   ├── PageNavigator/          # Sidebar page list
│   ├── ResultViewer/           # Split/text/image tab viewer
│   └── ExportPanel/            # Export & stats panel
├── hooks/
│   └── useDigitizer.ts         # Core state machine & processing logic
├── styles/
│   └── _variables.scss         # Design tokens
├── types/index.ts
└── utils/
    ├── pdfUtils.ts             # PDF → canvas → base64
    └── imageUtils.ts           # Image file → base64
```

---

## Gradio API Protocol

The Next.js API route speaks directly to Gradio's built-in REST API:

```http
POST http://localhost:7860/api/predict
Content-Type: application/json

{ "data": ["data:image/png;base64,<base64>"] }
```

```json
{ "data": ["extracted Arabic text..."], "duration": 3.14 }
```

---

## License

MIT

