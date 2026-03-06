# AI Resume Writer

An expert AI-powered resume generation pipeline that produces resumes optimized for both ATS (Applicant Tracking Systems) and hiring manager intent.

## How It Works

The pipeline follows a 9-step process:

### 1. Upload Activity Bank
Upload your job activity bank (CSV or JSON) containing your career accomplishments in Situation-Action-Impact format. Each activity is vectorized for semantic matching.

**Required columns:** `bulletID`, `Situation`, `Action`, `Impact`, `JobTitle`, `Company`, `DatesWorked`, `Location`

### 2. Upload Resume Template
Upload a template (JSON or plain text) defining your resume structure — name, contact info, and section order.

### 3. Upload Job Description
Paste or upload the target job description in plain text.

### 4. AI Analysis & Rubric Generation
The AI:
- Cleans and structures the job description into required skills, nice-to-haves, valued qualities, and a holistic candidate definition
- Creates an **ATS Scoring Rubric** — keywords, skills, and phrases that ATS systems scan for, each framed as a Situation-Action pair
- Creates an **Intent Scoring Rubric** — what the hiring manager *actually* wants (culture add, growth potential, motivation, domain fluency)

### 5. Vector Matching (Human-in-the-Loop)
Each ATS rubric item is vectorized and matched against your activity bank. For each skill/requirement, the top 3 matching activities are presented. **You choose** which activity best demonstrates each skill.

### 6. S-T-I Statement Generation
AI writes polished Situation-Task-Impact bullet points using your selected activities, incorporating ATS keywords naturally while preserving the truth of your experience.

### 7. ATS Resume Assembly
AI assembles all S-T-I statements into a structured resume matching your template format — grouped by job, reverse-chronological, with proper sections.

### 8. Intent-Driven Rewrite (Human-in-the-Loop)
AI rewrites the resume to align with the Intent Scoring Rubric — adjusting framing, emphasis, and narrative while maintaining all ATS keywords. **You approve or request a redo.**

### 9. Final Resume
Download your finished resume — optimized for both ATS parsing and hiring manager intent.

## Setup

### Prerequisites
- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
pip install -r requirements.txt
```

### Configuration

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### Running

```bash
streamlit run app.py
```

The app opens at `http://localhost:8501`.

## Project Structure

```
├── app.py                          # Streamlit UI (main entry point)
├── core/
│   ├── models.py                   # Data models (ActivityBullet, Rubrics, etc.)
│   ├── ingest.py                   # CSV/JSON/template parsing
│   ├── vectorizer.py               # Sentence-transformer embeddings & matching
│   ├── ai_engine.py                # Claude API calls for all AI operations
│   └── pipeline.py                 # Pipeline orchestrator
├── prompts/
│   └── templates.py                # All AI prompt templates
├── data/
│   └── samples/                    # Sample data files for testing
│       ├── activity_bank_sample.csv
│       ├── resume_template_sample.json
│       └── job_description_sample.txt
└── requirements.txt
```

## Architecture

- **Vectorization:** Uses `all-MiniLM-L6-v2` sentence-transformer for semantic embeddings
- **AI Engine:** Claude (via Anthropic SDK) for all natural language tasks
- **Matching:** Cosine similarity between rubric vectors and activity bank vectors
- **UI:** Streamlit with session state for pipeline persistence

## Sample Data

Sample files are provided in `data/samples/` to test the full pipeline without your own data.
