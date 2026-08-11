# Backend Pipeline

The current implementation includes a real server-side paper analysis path:

1. Browser uploads a PDF to `POST /api/analyze`.
2. Next.js writes the uploaded file to a temporary server directory.
3. `pdftotext` extracts UTF-8 text from the PDF.
4. The server sends the extracted text to local Ollama.
5. Ollama returns a structured JSON report.
6. The browser renders the report and can export Markdown or HTML.

## Current Runtime

- PDF text extraction: `pdftotext`
- Model server: Ollama at `http://127.0.0.1:11434`
- Default model: `gemma3:4b`
- Route: `apps/web/src/app/api/analyze/route.ts`

## Known Limits

- Scanned PDFs without a text layer need OCR support.
- The current prompt truncates paper text to fit the local model context.
- Figure extraction, asset crawling, RAG storage, Supabase persistence, and ffmpeg MP4 generation are still upcoming milestones.
- Browser-side WebM video preview exists; server-side MP4 generation is not connected yet.
