# RAGResume — Project Postmortem

**Status: SUNSET.** Archived 2026-09-17. Not maintained. Superseded by a full rebuild.

This document records what was built, what failed, and what should carry forward.
It is written to be read once, at the start of the rebuild.

---

## What this was

An AI resume generator. Three inputs — an activity bank of Situation-Action-Impact
bullets, a resume template, and a job description — run through a 9-step pipeline that
produced a resume optimized for both ATS keyword matching and hiring-manager intent.

**Final state:** ~15,000 LOC across two parallel implementations, 45 commits, 20 prompt
templates, 24 LLM call sites, 0 tests.

---

## Scorecard

| | |
|---|---|
| Lines of code | ~15,000 (7,344 Python / 7,652 TypeScript) |
| Tests | **0** |
| Architectures built | 3 (Streamlit → FastAPI+Next.js → partial redesign) |
| Architectures retired | **0** |
| Prompt templates | 20 |
| LLM call sites | 24 |
| Tracked files that are build artifacts | 53 of 145 (37%) |
| Commits whose message is pasted `git status` output | 9 of 45 |
| Times the same truncation bug was "fixed" | 5 |

---

## Failures

### 1. Three architectures, none retired

The project started as a Streamlit monolith, then grew a FastAPI backend and a Next.js
frontend (`222747e`). The Streamlit app was never deleted.

Both copies are still in the tree and have **diverged**:

| File | Old (`core/`) | New (`backend/core/`) | Divergence |
|---|---|---|---|
| `ai_engine.py` | 463 lines | 899 lines | 537 diff lines |
| `pipeline.py` | 224 lines | 322 lines | 156 diff lines |
| `vectorizer.py` | 352 lines | 358 lines | 23 diff lines |
| `models.py` | 198 lines | 211 lines | 16 diff lines |

Plus `app.py` (1,341 lines) and `prompts/templates.py` (517 lines vs the backend's 800).

That is roughly **3,400 lines of dead code that still imports cleanly and looks live**.
Every bug fix after the fork had to be applied twice, and in practice often wasn't. There
was no way to tell, opening a file, whether you were editing the code that runs.

**Root cause:** migrating by addition instead of replacement. The old path was kept "until
the new one works," and that condition was never formally checked, so it never expired.

### 2. Zero tests across 15,000 lines

This is the root cause of most of what follows. Every regression was caught by running the
app by hand and eyeballing a resume. Correctness was a vibe.

The failure mode specific to LLM pipelines: **wrong output is well-formed.** A bullet
written without the ATS keyword list still reads like a good bullet. A prompt missing its
context still returns confident prose. Nothing throws. Without assertions on output
quality, there is no signal at all — and there was none for the project's entire life.

### 3. The same bug was fixed five times

Bullet truncation, in commit order:

```
54a2427  raise write_sti_statement token budget from 512 to 4096
24b9b9d  fix truncation, expand ATS keywords with semantic variants
a4546c2  disable thinking tokens for STI statement generation
02911df  1024 thinking budget, 8192 output tokens
148a7ad  raise max_output_tokens to 16384
```

Five commits, each moving a number or toggling a flag. **Nobody ever measured how long the
output actually needed to be.** Each fix meant "the one bullet I happened to look at wasn't
cut off this time." The underlying interaction — that on Gemini 2.5, thinking tokens and
output tokens share the same `max_output_tokens` budget, so an uncapped thinking pass can
consume the entire allowance before a single character is emitted — was eventually
understood and is now documented in a docstring. It took five attempts to get there because
there was no test that would fail when a bullet got clipped.

### 4. Model and SDK churn consumed a large share of total effort

Anthropic → Gemini (`8ef2f35`). `gemini-2.0-flash` deprecated mid-project → 2.5
(`3b353bf`). Legacy `google.generativeai` → `google.genai`. Then thinking-budget tuning
across four more commits.

Model IDs were **hardcoded constants inside the engine**, so every provider change edited
core logic rather than configuration. The current state shows the residue:

```python
GEMINI_FLASH_JSON = "gemini-2.5-flash"   # "no-thinking model for JSON"
GEMINI_FLASH      = "gemini-2.5-flash"   # "flash with thinking"
```

Two constants with different documented purposes, identical values, and live branching
logic that still selects between them. The abstraction outlived the distinction it existed
to express, and nothing flagged it because nothing tested it.

### 5. Prompt sprawl with no way to evaluate a prompt

20 templates, 800 lines. Prompts were edited by intuition and judged by reading one output.

Worse, several prompts exist **to compensate for other prompts**: `RERANK_MATCHES` fixes bad
retrieval, `EXPAND_RUBRIC_QUERY` fixes weak rubric queries, `DEDUP_BULLETS` fixes the
assembler emitting near-duplicates. Each added latency and cost to patch a quality problem
upstream that could not be measured, only worked around. **LLM calls compensating for LLM
calls** is what a pipeline does when it has no evaluation harness.

### 6. Context plumbing was manual and rotted silently

A dedicated audit (`261f4c2`) found that:

- the S-T-I writer never received the activity's `extracted_skills`, nor the holistic
  candidate definition
- the assembler never received the job description or the intent rubric
- the intent rewriter was told to "maintain ALL ATS keywords" **without being given the
  keyword list**

These gaps existed for weeks. Nothing detected them, because — see failure #2 — missing
context produces plausible output, not an error. And because the codebase had already
forked, the fix had to be written twice.

The deeper problem is that context was passed as ad-hoc keyword arguments through four call
layers. There was no object representing "everything this pipeline knows," so "does this
step have what it needs?" could only be answered by reading every function signature in the
chain.

### 7. The API is a log of procedure calls, not an interface

```
POST /api/pipeline/step1 … /step7
```

Endpoint names encode **pipeline position**. Reordering a stage, inserting one, or re-running
just one is a breaking API change. The redesign in `7485ce1` (parallel rubric generation,
knockout screening, inline bullet generation) spent most of its effort fighting this
naming, because the steps had stopped being sequential but the URLs insisted they were.

### 8. A stateless backend forced embeddings through the browser

There is no database. No cache. The backend holds nothing between requests.

The consequence is visible in the wire format:

```python
class ActivityOut(BaseModel):
    vector: list[float] = []   # embedding — populated after step 1
```
```typescript
vector?: number[];
```

**Every embedding round-trips to the browser as JSON and back on every subsequent step.**
768 floats per activity, serialized, shipped, parsed, shipped again. Embeddings are never
stored, so they cannot be cached, cannot be reused across sessions, and cannot be
incrementally updated when one activity changes.

This is the single most expensive structural mistake in the project. The activity bank is
the user's durable, reusable asset — the one thing genuinely worth persisting — and the
architecture made it the one thing that could not be.

### 9. Git hygiene

- **53 of 145 tracked files are `__pycache__` artifacts** (37% of the repo). A `.gitignore`
  listing `__pycache__/` exists, but was added *after* those files were already tracked, so
  it never had any effect. Ignore rules do not untrack.
- **9 of 45 commit messages are pasted `git status` output.** Example:
  `"modified: backend/api/pipeline.py modified: backend/core/__pycache__/ai_engine.cpython-313.pyc …"`
- Net effect: the history cannot be read, searched, or bisected. Reconstructing *why* a
  change was made required reading the diff, and the diffs are half `.pyc` noise.

### 10. Human-in-the-loop was bolted on per-step, not designed

Five bespoke review surfaces — `MatchReview`, `BulletEditor`, `RubricEditor`,
`KnockoutCheck`, `ResumeEditor` — each with its own state shape and UI.

There is no shared concept of *a decision the user made*. So user decisions do not survive a
re-run: **change one word in the job description and every activity selection, every hand-edited
bullet, and every approval is discarded.** For a tool whose entire value proposition is
tailoring one resume per application, that is close to fatal. The most expensive input in
the system — human judgment — was the only input treated as disposable.

---

## What worked, and should survive the rebuild

Not everything here was wrong. These held up:

1. **The core decomposition.** Separating *what the JD asks for* (rubric) from *what you've
   actually done* (activity bank), then matching between them, is the right shape for this
   problem. It is why the output was ever good.

2. **The dual rubric.** Splitting ATS-keyword matching from hiring-manager intent is a real
   product insight, not just an implementation detail. They genuinely are different
   objectives that want different optimization, and modeling them separately produced
   noticeably better resumes than a single blended pass.

3. **Hybrid retrieval beat pure vector search.** 55% semantic + 30% keyword + 15% domain
   context outperformed cosine similarity alone by a wide margin. Pure embedding similarity
   consistently surfaced thematically-adjacent-but-wrong activities.

4. **Enrich at index time, not query time.** AI skill extraction with synonym expansion at
   ingest — so "container orchestration" indexes alongside "Kubernetes" and "Docker" — did
   more for match quality than any amount of query-side cleverness. The general lesson:
   pay the cost once at write time, not on every read.

5. **Rubric deduplication by vector similarity.** The JD analyzer naturally emitted 20–30
   overlapping rubric items; merging above 0.88 cosine similarity cut that to a usable
   8–15 without losing coverage.

6. **Human-in-the-loop at match selection specifically.** Of the five review surfaces, this
   is the one that earned its place. The model cannot know which of your experiences you
   want to lead with. That judgment is irreducibly the user's, and the UI for it was
   correct even though its persistence was not.

---

## Learnings for the rebuild

Ordered by expected payoff.

**1. Build the eval harness before the second prompt.**
A golden set of (activity bank, job description) → expected matches, plus assertions on
output (length bounds, required keywords present, no fabricated numbers). Everything in
failures #2, #3, #5 and #6 traces back to not having this. It is not optional
infrastructure for an LLM pipeline; it is the only instrument panel that exists.

**2. Persist the activity bank and its embeddings server-side.**
It is the durable, reusable, expensive-to-compute asset. Give it a real database, embed on
write, cache by content hash, re-embed only what changed. This alone deletes failure #8 and
makes cross-session reuse possible — which is the actual product (many applications, one
bank), not a nice-to-have.

**3. Model the user's decisions as first-class persisted data.**
A selection, an edit, an approval — each keyed to what it was a decision *about*, so it can
be replayed when upstream inputs change. Re-running with a tweaked JD should preserve every
still-valid choice and surface only what genuinely needs re-deciding. This is the difference
between a demo and a tool someone uses twice.

**4. One codebase. Migration means deletion.**
If the old path still runs, the migration is not done. Delete in the same commit that
promotes the replacement, or do not start.

**5. A single typed context object threaded through the pipeline.**
One object that holds everything known so far. Each step declares what it reads. "Is the
context complete at this step?" becomes a type question answerable by the compiler instead
of an archaeology expedition through four layers of `**kwargs`.

**6. Model IDs, token budgets and thinking budgets are configuration.**
Not constants in the engine. Providers deprecate models on their schedule, not yours —
`gemini-2.0-flash` disappeared mid-project. Changing a model should touch one config file
and zero lines of logic.

**7. Resource-based API, not step-numbered.**
`/rubrics`, `/matches`, `/bullets`, `/resume` — nouns that can be created, re-run and
re-fetched independently. `/step4` encodes an ordering assumption into the URL space and
charges you a breaking change every time the pipeline shape evolves. It evolved three times.

**8. Fewer LLM calls, not more.**
When output quality is poor, the reflex was to add a corrective LLM pass. That compounds
latency, cost and failure modes while hiding the original defect. Fix the upstream prompt,
verified against the eval set from learning #1. Reranking, query expansion and dedup passes
are all symptoms — treat them as evidence something upstream is broken.

**9. `.gitignore` before the first commit, and write real commit messages.**
Both are ten-second habits whose absence cost real archaeology time. Ignore rules do not
retroactively untrack files.

---

## The one-sentence version

The product thinking was sound and parts of the retrieval design were genuinely good, but
the project shipped no tests, never retired what it replaced, and treated the two most
valuable assets in the system — the user's activity bank and the user's decisions — as
disposable request payloads instead of persistent state.
