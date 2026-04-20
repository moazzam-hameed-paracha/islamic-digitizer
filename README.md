# مرقمن — Islamic Manuscript Digitizer

A production-ready **Next.js 15 + TypeScript + Modular SCSS** SPA for digitizing Arabic Islamic manuscripts, backed by a locally-running **Qari-OCR-0.1-VL-2B** model served via **FastAPI**.

---

## Architecture

```
Browser (Next.js SPA)
    │  upload image / render PDF page → base64
    ▼
Next.js API Route  /api/digitize
    │  POST { imageBase64, mediaType }
    ▼
FastAPI server  http://localhost:7860/api/digitize
    │  running  oddadmix/Qari-OCR-0.1-VL-2B-Instruct
    │  → grayscale pre-processing → Qwen2-VL inference
    │  → streamed token generation
    ▼
{ id, text, duration, tokenCount, maxTokens }
    │  derive confidence level from Arabic character density
    ▼
Browser  →  ResultViewer (split image / text view)
```

---

## Features

- 📄 **PDF support** — Multi-page PDFs rendered page-by-page via `pdfjs-dist` *(can be disabled via env — see Configuration)*
- 🖼️ **Image support** — JPEG, PNG, WebP, GIF; drag multiple images for batch processing
- 🤖 **Qari-OCR** — Specialized Arabic OCR model (Qwen2-VL 2B fine-tune on Islamic manuscripts)
- 📖 **Split-view** — Side-by-side original image + extracted Arabic text with S/M/L font size controls
- 🔍 **Image lightbox** — Click any page image to expand it to full-screen for closer inspection
- ↕️ **Drag-and-sort pages** — Reorder pages in the sidebar by dragging them to a new position
- ➕ **Insert pages** — Use the "Insert" tab in the sidebar to splice new images or a PDF into any position (beginning, between pages, or end), which are then automatically processed
- 🪙 **Token tracking** — Per-page token count and model limit displayed in the result footer
- ⏱️ **Live elapsed timer** — Seconds counter shown while a page is being processed
- ⛔ **Max-token guard** — If the model hits its token limit mid-generation, the API aborts and surfaces a clear error rather than returning silently truncated text
- 💾 **Export** — Download all pages as a single `.txt` file with page separators
- ⚡ **Sequential processing** — Pages processed one-by-one with live progress bar and dot indicators

---

## Tech Stack

| Layer       | Technology                                        |
|-------------|---------------------------------------------------|
| Framework   | Next.js 15 (App Router)                           |
| Language    | TypeScript 5                                      |
| Styling     | Modular SCSS + Design Tokens (`_variables.scss`)  |
| PDF Engine  | pdfjs-dist 4                                      |
| OCR Model   | `oddadmix/Qari-OCR-0.1-VL-2B-Instruct`           |
| OCR Server  | FastAPI + Uvicorn (Python, local)                 |
| ML Runtime  | PyTorch + HuggingFace Transformers                |
| Fonts       | Amiri (Arabic), Cinzel (Display), Lato (UI)       |

---

## Getting Started

### 1. Start the Qari OCR Python server

The OCR backend is a **FastAPI** app (`main.py`), managed with `uv`.

```bash
# Install uv if you don't have it
pip install uv

# Install Python dependencies
uv sync

# Run the server (defaults to http://localhost:7860)
uv run uvicorn main:app --host 0.0.0.0 --port 7860
```

The server loads the model on startup — expect ~30–60 seconds before it's ready. You'll see `[SUCCESS] Model Ready.` in the logs when it's accepting requests.

> **GPU note:** CUDA is used automatically when available. CPU inference is supported but significantly slower.

### 2. Install the Next.js app

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` as needed (defaults are fine for local development):

```env
# URL of the FastAPI OCR server
OCR_SERVER_URL=http://localhost:7860

# Set to "false" to disable PDF uploads (image-only mode)
NEXT_PUBLIC_ENABLE_PDF=true
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

## Configuration

| Variable                 | Default                 | Description                                                                 |
|--------------------------|-------------------------|-----------------------------------------------------------------------------|
| `OCR_SERVER_URL`         | `http://localhost:7860` | Base URL of the FastAPI OCR server. Change if you moved the port or host.  |
| `NEXT_PUBLIC_ENABLE_PDF` | `true`                  | Set to `"false"` to hide PDF upload support entirely (image-only mode).    |

---

## Workflow

### Basic digitization
1. Upload a PDF or one / multiple images on the home screen.
2. Pages are processed sequentially — watch the progress bar and status dots.
3. Click any page thumbnail in the sidebar to view it in Split / Text / Image mode.
4. Use **Copy Text** to copy a single page, or **Export All** when complete.

### Reordering pages
- Drag the `⠿` handle on any page in the sidebar to a new position.
- Page numbers update automatically and the selected page follows the move.

### Inserting pages
1. Switch to the **Insert** tab in the sidebar (only available when not processing).
2. Choose a **position** — beginning, after any existing page, or end.
3. Click **Choose file(s) & insert** and pick one or more images or a PDF.
4. The new pages are inserted at the chosen position and processed immediately.

### Expanding images
- Click any page image (or the ⛶ button in the image panel header) to open it in a full-screen lightbox.
- Click outside the image or the ✕ button to close.

---

## Project Structure

```
.
├── main.py                         # FastAPI OCR server (Qwen2-VL inference)
├── pyproject.toml                  # Python dependencies (managed by uv)
├── .env.example                    # Environment variable template
└── src/
    ├── app/
    │   ├── api/digitize/route.ts   # Next.js proxy to FastAPI; handles 422 max-token errors
    │   ├── globals.scss            # Global styles & Google Fonts imports
    │   ├── layout.tsx              # Root layout (lang="en")
    │   ├── page.tsx                # Main SPA page (hero + workspace)
    │   └── page.module.scss        # Full-viewport layout; panels scroll independently
    ├── components/
    │   ├── Header/                 # Slim sticky header with Islamic ornament
    │   ├── FileUploader/           # Drag-and-drop zone; PDF badge conditional on env
    │   ├── ProcessingStatus/       # Progress bar, page dots, live elapsed timer
    │   ├── PageNavigator/          # Sidebar with "Pages" (drag-sort) and "Insert" tabs
    │   ├── ResultViewer/           # Split/text/image tabs; image lightbox; footer stats
    │   └── ExportPanel/            # Export all pages + reset
    ├── hooks/
    │   └── useDigitizer.ts         # Core state machine: startJob, reorderPages, insertPages
    ├── styles/
    │   └── _variables.scss         # Design tokens (palette, spacing, typography, breakpoints)
    ├── types/index.ts              # Shared TypeScript types
    └── utils/
        ├── pdfUtils.ts             # PDF page → canvas → base64
        └── imageUtils.ts           # Image file → base64 / data URL
```

---

## API Protocol

The Next.js route proxies requests to the FastAPI server.

**Request (Next.js → FastAPI)**
```http
POST http://localhost:7860/api/digitize
Content-Type: application/json

{ "dataUrl": "data:image/png;base64,<base64>" }
```

**Success response**
```json
{
  "id": "a1b2c3d4",
  "text": "بسم الله الرحمن الرحيم ...",
  "duration": 14.82,
  "tokenCount": 1423,
  "maxTokens": 2000
}
```

**Max-token error (HTTP 422)**

When the model fills its entire token budget before finishing, the server aborts and returns:

```json
{
  "detail": {
    "code": "MAX_TOKENS_REACHED",
    "message": "Output was truncated: the model hit the 2000-token limit before finishing.",
    "tokenCount": 2000,
    "maxTokens": 2000
  }
}
```

The Next.js route surfaces this as a descriptive page-level error in the UI.

---

## Changing the Token Limit

Edit `MAX_TOKENS` in `main.py`:

```python
MAX_TOKENS = 2000  # increase for longer pages, decrease for faster responses
```

---

## License

MIT
