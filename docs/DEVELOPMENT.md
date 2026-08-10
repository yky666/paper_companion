# Development Guide

## Prerequisites

- Node.js 22 or newer.
- npm 10 or newer.
- Supabase project.
- Ollama running locally or on the deployment server.
- ffmpeg available on `PATH`.
- A local TTS engine for video narration.

## Install

```bash
npm install
```

## Environment

Copy `.env.example` to `.env.local` for local web development and to `.env` for worker/server runtime as needed.

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OLLAMA_BASE_URL`

## Run Web App

```bash
npm run dev
```

## Run Worker

```bash
npm run worker
```

The worker package is currently a scaffold. The next implementation milestone is adding the Supabase RPC used to atomically claim tasks.
