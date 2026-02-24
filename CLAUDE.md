# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (Next.js 16, port 3000)
- `npm run build` — Production build
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)

No test framework is configured.

## Environment

Copy `.env.example` to `.env.local`. Key variables:
- `AI_PROVIDER` — `gemini` (requires `GEMINI_API_KEY`) or `mock` (returns placeholder images, no API key needed)
- `GEMINI_MODEL` — defaults to `gemini-2.5-flash-image`
- `REMBG_MODEL` — rembg model for background removal (default: `u2net`). Requires `pip install rembg[cli]`

## Architecture

This is a **design variation and mockup tool** built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS v4.

### Workflow

The app follows a 3-step workflow defined by `WorkflowStep`: `upload` → `variations` → `mockup`

1. **Upload** — User uploads a source design image (`UploadZone`)
2. **Variations** — AI generates style variations of the design (`VariationGrid`), using a pluggable AI provider (Gemini/mock)
3. **Mockup** — Selected variations are composited onto mockup templates using Fabric.js (`MockupEditor`)

### Key layers

- **State**: Single Zustand store (`src/store/workflow-store.ts`) holds all workflow state
- **Types**: All domain types in `src/types/index.ts` — `DesignFile`, `GeneratedVariation`, `MockupTemplate`, `GeneratedMockup`
- **AI provider**: `src/lib/ai-provider.ts` defines the `AIProvider` interface; `src/lib/prompt-engine.ts` builds prompts for variation generation
- **API routes** (`src/app/api/`): `upload/`, `generate/`, `remove-bg/`, `mockup/`, `mockup/batch/`, `save/`
- **Image processing**: Uses `sharp` server-side and `@imgly/background-removal` for client-side bg removal

### Key dependencies

- **fabric** (v7) — Canvas-based mockup editor
- **zustand** — State management
- **sharp** — Server-side image processing
- **react-dropzone** — File upload UX
- **jszip + file-saver** — Batch export of mockups as ZIP
