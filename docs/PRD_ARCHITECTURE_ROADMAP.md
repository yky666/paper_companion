# Paper Companion PRD, Technical Architecture, and Roadmap

## 1. Product Summary

Paper Companion is a public-access online paper analysis platform for individual or small-group use. Users upload academic PDFs, organize papers into field partitions, generate structured analysis reports, extract and attach visual assets, ask questions about the paper, and generate Chinese or English narrated explainer videos.

The first version prioritizes local model inference to control API cost. It uses Supabase for authentication, database, and file storage, while AI analysis runs through Ollama deployed on the same cloud server as the website.

## 2. Confirmed MVP Scope

### Included

- Publicly accessible web application.
- User registration and login.
- User-specific paper library.
- Built-in academic field classification with manual correction.
- Field partitions for organizing papers.
- PDF upload as the only paper input method in v1.
- Local Ollama model for paper classification, summarization, report generation, and question answering.
- Fixed-structure paper analysis report.
- Personalized suggestions based on user profile.
- Markdown and HTML report export.
- PDF key page screenshots.
- PDF internal figure/table extraction.
- Caption, page number, and source metadata when available.
- Official/author asset extraction from links explicitly found inside the PDF.
- Text-based paper Q&A.
- Chinese and English explainer video generation.
- Video style: paper figures/screenshots/assets plus narration and subtitles.
- No digital human presenter in v1.
- Async task processing.
- Supabase Postgres polling queue.
- Multiple workers on one server, with concurrency controlled by environment variables.
- Worker locking, heartbeat, timeout recovery, and retry handling.
- Admin dashboard.
- RBAC role model with fixed built-in permissions.
- Desktop-first UI, with mobile kept basically usable.
- Tailwind CSS and shadcn/ui.
- Small-scale/internal usage.

### Excluded From MVP

- Paper URL, DOI, or arXiv link ingestion.
- Active web-wide image search.
- PDF export.
- Full mobile-first optimization.
- High concurrency architecture.
- Payment, plans, billing, and quota management.
- Multi-machine distributed workers.
- Online collaboration, public share links, or collaborative editing.
- Custom permission-item editor.
- Custom complex user-defined classification tree.
- Digital human video generation.
- Commercial-grade copyright clearance workflow.

## 3. Users and Roles

### Normal User

- Upload PDFs.
- View and manage own papers.
- Generate reports.
- Export Markdown/HTML reports.
- Ask questions about own papers.
- Generate explainer videos within allowed limits.

### Premium User

- Same as normal user.
- Higher limits for file size, task count, or video generation, depending on deployment configuration.

### Operations/Admin User

- View task queues and task status.
- Retry failed jobs.
- Inspect worker status.
- Handle abnormal files or failed records.

### Super Admin

- Manage users.
- Assign roles.
- View system-level configuration.
- Manage global settings such as upload size and visible concurrency limits.

## 4. User Profile Fields

The first version stores only the fields needed for personalized paper analysis:

- Name or nickname.
- Research direction.
- Education stage.
- Goal or use case.
- Preferred language.

## 5. Report Template

Each paper report uses a fixed structure:

- Background and problem.
- Paper objective.
- Key innovations.
- Core method.
- Experimental setup.
- Experimental results.
- Strengths.
- Limitations.
- Application scenarios.
- Suggestions based on the user profile and field.
- Reproduction difficulty.
- Reading strategy and follow-up recommendations.

## 6. Visual Asset Requirements

### PDF-Derived Assets

- Cover page screenshot.
- Key method page screenshot.
- Key experiment/result page screenshots.
- Extracted figures and tables where feasible.
- Page number and caption metadata where feasible.

### Official/Author Assets

The first version only follows links explicitly present in the PDF, such as:

- Project homepage.
- GitHub repository.
- arXiv page.
- Author page.

The crawler should:

- Download relevant images from linked official/author pages.
- Filter obvious irrelevant assets such as logos, avatars, icons, and tracking images.
- Store source URL metadata.
- Avoid claiming unrestricted reuse rights unless licensing information is explicit.

## 7. Video Generation Requirements

The first version generates a complete MP4 explainer video, without a digital human presenter.

Pipeline:

1. Generate a video outline from the paper report.
2. Generate a narration script in Chinese or English.
3. Select visual materials from PDF screenshots, extracted figures/tables, and official assets.
4. Generate narration audio using local TTS.
5. Generate subtitles.
6. Compose video using ffmpeg.
7. Store final MP4 and metadata.

Candidate local TTS options:

- ChatTTS.
- CosyVoice.
- Piper.
- Other locally deployable Chinese/English TTS engines.

## 8. Technical Architecture

### Core Stack

- Frontend and backend: Next.js full-stack application.
- UI: Tailwind CSS + shadcn/ui.
- Auth: Supabase Auth.
- Database: Supabase Postgres.
- Storage: Supabase Storage.
- Local LLM: Ollama.
- Task queue: Supabase Postgres polling table.
- Worker runtime: Node.js worker processes or separate worker service in the same repository.
- PDF parsing: server-side PDF text and metadata extraction.
- PDF screenshots: Poppler, MuPDF, or equivalent server-side renderer.
- Figure/table extraction: PDF rendering plus layout/image extraction tools.
- Video composition: ffmpeg.

### Deployment

- Website and Ollama run on the same cloud server.
- Supabase remains managed externally.
- Workers run on the same server.
- Multiple workers are controlled through environment variables.
- No multi-machine distribution in v1.

### High-Level Flow

1. User logs in.
2. User uploads PDF.
3. PDF is stored in Supabase Storage.
4. Paper record and analysis task are created in Supabase Postgres.
5. Worker claims task.
6. Worker downloads PDF, extracts text/assets, renders screenshots, follows PDF-embedded official links, and stores derived assets.
7. Worker chunks paper text and performs local Ollama analysis.
8. Worker writes classification, report, and searchable chunks to the database.
9. User views report and exports Markdown/HTML.
10. User asks questions; server retrieves relevant chunks and queries Ollama.
11. User triggers video generation; worker creates script, audio, subtitles, and MP4.

## 9. Data Model Draft

Main tables:

- `profiles`: user profile and preferences.
- `roles`: built-in roles.
- `user_roles`: user-role mapping.
- `papers`: uploaded paper metadata.
- `paper_fields`: built-in classification labels.
- `paper_assets`: screenshots, extracted figures/tables, official linked assets.
- `paper_chunks`: chunked text for retrieval.
- `analysis_reports`: generated reports and export content.
- `qa_sessions`: paper Q&A sessions.
- `qa_messages`: Q&A turns.
- `video_jobs`: explainer video generation jobs.
- `task_jobs`: generic async job queue.
- `worker_heartbeats`: worker liveness and status.
- `system_settings`: global configuration.

## 10. Task Queue Design

The MVP uses Supabase Postgres as a polling queue.

Required behavior:

- Workers poll pending tasks.
- A task is claimed atomically.
- Claimed tasks store `locked_by`, `locked_at`, and `heartbeat_at`.
- Workers periodically update heartbeat.
- Expired tasks return to retryable state.
- Failed tasks store error details.
- Retry count is capped.
- Concurrency is controlled by environment variables.

Suggested task types:

- `paper_parse`
- `asset_extract`
- `paper_analyze`
- `report_export`
- `video_generate`

## 11. Development Milestones

### Milestone 0: Project Foundation

- Create repository structure.
- Add Next.js app.
- Add environment configuration.
- Add linting and formatting.
- Add deployment notes.

### Milestone 1: Auth, RBAC, and Dashboard Shell

- Supabase Auth integration.
- Profile setup page.
- RBAC schema.
- Role assignment basics.
- Main app layout.
- Admin dashboard shell.

### Milestone 2: Paper Upload and Library

- PDF upload.
- Supabase Storage integration.
- Paper metadata table.
- Paper library page.
- Field partition UI.
- Manual classification editing.

### Milestone 3: Worker Queue

- `task_jobs` schema.
- Worker process.
- Atomic task claim.
- Heartbeat and timeout recovery.
- Retry handling.
- Admin task monitor.

### Milestone 4: PDF Parsing and Asset Extraction

- PDF text extraction.
- Page screenshot generation.
- Figure/table extraction prototype.
- Link extraction from PDF.
- Official/author asset crawler for explicit PDF links.
- Asset browser in paper detail page.

### Milestone 5: Ollama Analysis

- Ollama integration.
- Chunking pipeline.
- Classification prompt.
- Section-level summarization.
- Fixed-template report generation.
- Personalized suggestions.

### Milestone 6: Report View and Export

- Report detail page.
- Markdown export.
- HTML export.
- Asset references inside reports.

### Milestone 7: Paper Q&A

- Retrieval over paper chunks.
- Text Q&A UI.
- Source-aware answers.
- Session history.

### Milestone 8: Video Generation

- Video script generation.
- Chinese/English language option.
- Local TTS integration.
- Subtitle generation.
- ffmpeg composition.
- MP4 storage and playback.

### Milestone 9: Admin and Hardening

- User management.
- Role management.
- Task retry controls.
- Worker status page.
- Basic observability logs.
- Upload and task limits.
- Deployment checklist.

## 12. Engineering Effort Estimate

Because the first version includes local AI, PDF figure extraction, official asset crawling, async workers, RBAC, admin tools, and video generation, this is larger than a simple MVP.

Estimated solo development:

- Minimal usable internal alpha: 4 to 6 weeks.
- Strong MVP with video and admin workflows: 8 to 12 weeks.
- More stable product-ready version: 3 to 5 months.

Estimated small team:

- 2 developers: 5 to 8 weeks for strong MVP.
- 3 to 4 developers: 4 to 6 weeks if responsibilities are split across web, AI pipeline, and video/infra.

## 13. Token and Compute Estimate

Even with local models, token volume affects latency and throughput.

Per 10-20 page paper:

- Light analysis: about 10k-30k tokens.
- Standard report: about 40k-100k tokens.
- Deep report plus Q&A preparation: about 100k-300k tokens.
- Video script generation: about 5k-20k tokens.
- Each Q&A turn: about 2k-15k tokens, depending on retrieved context.

Recommended strategy:

- Avoid sending full papers in one prompt.
- Use chunking, staged summaries, and retrieval.
- Cache intermediate summaries.
- Store generated reports and video scripts.
- Let users regenerate sections selectively.

## 14. Risks and Mitigations

### Local Model Quality

Risk: Small local models may miss nuanced contributions or misread experiments.

Mitigation:

- Use staged prompts.
- Keep report structure fixed.
- Include source snippets and page references.
- Allow manual regeneration and editing.

### Performance

Risk: Ollama, TTS, and ffmpeg compete for CPU/GPU resources.

Mitigation:

- Limit worker concurrency.
- Separate task types by priority.
- Add model and video generation timeouts.

### PDF Complexity

Risk: Some PDFs have poor text layers, complex layouts, scanned pages, or inaccessible figures.

Mitigation:

- Store extraction confidence.
- Fall back to page screenshots.
- Mark unavailable captions explicitly.

### Copyright

Risk: Official/author assets may not be freely reusable.

Mitigation:

- Store source URLs.
- Do not claim commercial rights.
- Prefer user-visible citation/source labeling.
- Avoid broad web crawling in v1.

### Scope Creep

Risk: Video generation, RBAC, and asset extraction expand the MVP.

Mitigation:

- Keep fixed templates.
- Keep roles and permissions built in.
- Keep workers single-server.
- Keep exports to Markdown/HTML only.

## 15. Initial Repository Layout Proposal

```text
paper_companion/
  apps/
    web/
  packages/
    shared/
    worker/
  docs/
    PRD_ARCHITECTURE_ROADMAP.md
  infra/
    supabase/
    scripts/
  README.md
```

This layout can be adjusted when the actual Next.js project is scaffolded.
