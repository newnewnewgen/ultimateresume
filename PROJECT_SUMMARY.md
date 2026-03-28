# UltimateResume — Project Summary

> AI-powered resume generation optimized for both ATS parsing and hiring manager intent.

## Overview

UltimateResume is a full-stack platform that generates targeted resumes by semantically matching your real work accomplishments to job requirements, producing polished bullet points, and rewriting them with hiring manager psychology in mind. The system keeps humans in the loop at every critical decision point rather than fully automating the process.

## Tech Stack

### Backend (Python)
- **Framework:** FastAPI with async request handling
- **AI/ML:** Google Gemini 2.5 Flash (extraction tasks) + Gemini 2.5 Pro (quality writing)
- **Vector Search:** Gemini Embedding API (`gemini-embedding-001`) with hybrid scoring
- **Data Validation:** Pydantic BaseModel for all API contracts and pipeline state
- **File Parsing:** pypdf (PDF), python-docx (DOCX), stdlib CSV/JSON
- **Concurrency:** ThreadPoolExecutor (8 workers) for parallel bullet generation
- **Deployment:** Railway (Nixpacks builder, Uvicorn ASGI server)

### Frontend (TypeScript)
- **Framework:** Next.js 16.1.6 with React 19.2.3
- **Styling:** Tailwind CSS v4 + PostCSS
- **Rich Text:** Tiptap composable editor for resume editing
- **Auth:** Supabase Auth with SSR support (@supabase/ssr)
- **Type Safety:** Full strict TypeScript with API types aligned to backend models
- **Deployment:** Vercel

### Database & Auth
- **Supabase (PostgreSQL):** profiles, education, pipeline_sessions tables
- **Auth:** Supabase Auth (OAuth2 + email), server-side session management

### Export
- **LaTeX:** AI-generated professional resume templates for PDF export

## Pipeline Architecture

The resume generation follows a 9-step stateful pipeline:

| Step | Name | Type | Description |
|------|------|------|-------------|
| 1 | Upload Activity Bank | Input | Parse CSV/JSON with Situation-Action-Impact accomplishments |
| 2 | Upload Resume Template | Input | Define contact info and desired section structure |
| 3 | Upload Job Description | Input | Paste target job posting |
| 4 | Analysis & Rubric Generation | AI | Create ATS keyword rubric + hiring intent rubric |
| 5 | Vector Matching | Human-in-Loop | Top 3 activity matches per requirement; user selects best |
| 6 | Statement Generation | AI | Parallel generation of polished S-T-I bullet points |
| 7 | ATS Resume Assembly | AI | Structure resume matching user's template |
| 8 | Intent Rewrite | Human-in-Loop | Adjust narrative tone for hiring manager psychology |
| 9 | Export | Output | Download optimized resume |

### Hybrid Vector Matching

The matching algorithm combines three signals to avoid pure semantic search weaknesses:

- **Semantic similarity (55%):** Gemini embeddings capture meaning beyond exact words
- **Keyword overlap (30%):** Exact skill and phrase matching for ATS compatibility
- **Context bonus (15%):** Job title and domain relevance scoring

## Key Engineering Patterns

- **Dual-model AI strategy:** Flash for speed/extraction, Pro for quality writing. Thinking tokens disabled for JSON extraction, capped for reasoning tasks.
- **Structured prompt engineering:** 18 reusable prompt templates demanding exact JSON output formats to avoid parsing failures.
- **Stateful sessions:** Full pipeline state persists in Supabase, enabling pause/resume across browser sessions.
- **Shared core modules:** Both the Streamlit prototype and production FastAPI backend consume the same `core/` logic (models, AI engine, vectorizer, pipeline).
- **Parallel processing:** 8-worker thread pool for bullet generation, batch embedding in groups of 100.
- **Deduplication pass:** Post-generation cleanup fixes repeated opening verbs across bullets.

## Project Structure

```
ultimateresume/
├── backend/                  FastAPI application
│   ├── main.py              App entry + CORS middleware
│   ├── api/                 Route handlers (ingest, pipeline, profile, design)
│   └── railway.toml         Deployment config
├── core/                    Shared business logic (~2,870 LOC)
│   ├── models.py            14 Pydantic data classes
│   ├── ai_engine.py         Gemini API integration (1,700+ LOC)
│   ├── vectorizer.py        Embedding + hybrid matching (380+ LOC)
│   ├── ingest.py            Multi-format file parsing
│   └── pipeline.py          Step orchestrator (225 LOC)
├── prompts/
│   └── templates.py         18 structured prompt templates
├── frontend/                Next.js application
│   ├── app/                 Pages and layouts
│   │   ├── (auth)/          Login, signup flows
│   │   └── (app)/           Protected routes (profile, activities, sessions)
│   └── lib/                 API client, Supabase utilities, TypeScript types
├── app.py                   Original Streamlit prototype
└── data/samples/            Test data files
```

## Deployment Architecture

| Component | Platform | Health Check |
|-----------|----------|-------------|
| Frontend | Vercel | Automatic |
| Backend API | Railway (Uvicorn) | `/api/health` |
| Database + Auth | Supabase (PostgreSQL) | Managed |
