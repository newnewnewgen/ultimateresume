"""AI engine for all LLM-powered operations using Google Gemini."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from google import genai
from google.genai import types as genai_types
from google.genai import errors as genai_errors

from core.models import (
    ATSRubricItem,
    CleanedJobDescription,
    IntentRubric,
    IntentRubricItem,
    KnockoutItem,
)
from prompts.templates import (
    ASSEMBLE_RESUME,
    ASSEMBLE_LATEX_RESUME,
    CLEAN_JOB_DESCRIPTION,
    CREATE_ATS_RUBRIC,
    CREATE_INTENT_RUBRIC,
    CREATE_KNOCKOUT_RUBRIC,
    DEDUP_BULLETS,
    EDIT_LATEX_TEMPLATE,
    EXTRACT_ACTIVITY_SKILLS,
    GENERATE_LATEX_TEMPLATE,
    INTENT_REWRITE,
    PARSE_PDF_RESUME_TEMPLATE,
    PARSE_RESUME_DESIGN,
    PARSE_RESUME_FULL,
    PARSE_RESUME_TO_ACTIVITY_BANK,
    PARSE_RAW_TEXT_ACTIVITY,
    POLISH_RESUME,
    WRITE_STI_STATEMENT,
)

# Flash without thinking for JSON extraction (thinking tokens eat into output budget)
GEMINI_FLASH_JSON = "gemini-2.5-flash"
# Flash with thinking for analysis tasks
GEMINI_FLASH = "gemini-2.5-flash"
# Pro for important writing tasks (S-T-I statements, resume assembly, intent rewrite)
GEMINI_PRO = "gemini-2.5-pro"


def _get_client() -> genai.Client:
    """Return a configured Gemini client."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.")
    return genai.Client(api_key=api_key)


def _call_gemini(
    prompt: str,
    max_output_tokens: int = 8192,
    use_pro: bool = False,
    json_mode: bool = False,
    thinking_budget: int | None = None,
) -> str:
    """Make a call to Gemini and return the text response.

    Args:
        use_pro: If True, use gemini-2.5-pro for higher quality writing.
        json_mode: If True, disable thinking (budget=0) for structured JSON
                   extraction. Thinking tokens consume the output budget and
                   cause empty responses on extraction tasks.
        thinking_budget: Cap thinking tokens. On 2.5 Pro, thinking + output
                         share max_output_tokens, so an uncapped thinking pass
                         can exhaust the budget before any text is written.
                         Set this to reserve room for the actual response.
    """
    if use_pro:
        model_name = GEMINI_PRO
    elif json_mode:
        model_name = GEMINI_FLASH_JSON
    else:
        model_name = GEMINI_FLASH

    client = _get_client()
    if json_mode:
        thinking_config = genai_types.ThinkingConfig(thinking_budget=0)
    elif thinking_budget is not None:
        thinking_config = genai_types.ThinkingConfig(thinking_budget=thinking_budget)
    else:
        thinking_config = None

    # Retry on transient 503 errors with exponential backoff.
    # If Pro is unavailable after retries, fall back to Flash for one last attempt.
    max_retries = 3
    last_error: Exception | None = None
    models_to_try = [model_name]
    if use_pro and model_name == GEMINI_PRO:
        models_to_try.append(GEMINI_FLASH)  # Flash fallback

    for current_model in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=current_model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        max_output_tokens=max_output_tokens,
                        temperature=0.3,
                        thinking_config=thinking_config,
                    ),
                )
                text = response.text
                if not text or not text.strip():
                    finish_reason = None
                    try:
                        finish_reason = response.candidates[0].finish_reason
                    except Exception:
                        pass
                    raise ValueError(
                        f"Gemini returned an empty response. finish_reason={finish_reason}. "
                        "This may be due to token limits or a safety filter."
                    )
                return text
            except genai_errors.ServerError as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait = 10 * (2 ** attempt)  # 10s, 20s, 40s
                    time.sleep(wait)
                # else: fall through to next model or raise
            except Exception:
                raise  # non-503 errors propagate immediately

    raise last_error  # type: ignore[misc]


def _extract_thinking(response) -> str:
    """Extract thinking tokens from a Gemini response object."""
    thinking_parts: list[str] = []
    try:
        for part in response.candidates[0].content.parts:
            if getattr(part, "thought", False) and part.text:
                thinking_parts.append(part.text)
    except Exception:
        pass
    return "\n\n".join(thinking_parts)


def _call_gemini_with_thinking(
    prompt: str,
    max_output_tokens: int = 8192,
    use_pro: bool = False,
    thinking_budget: int | None = None,
) -> tuple[str, str]:
    """Like _call_gemini but also returns extracted thinking text as a second value.

    Returns:
        (response_text, thinking_text) — thinking_text is "" when no thinking occurred.
    """
    if use_pro:
        model_name = GEMINI_PRO
    else:
        model_name = GEMINI_FLASH

    client = _get_client()
    thinking_config = (
        genai_types.ThinkingConfig(thinking_budget=thinking_budget)
        if thinking_budget is not None
        else None
    )

    max_retries = 3
    last_error: Exception | None = None
    models_to_try = [model_name]
    if use_pro and model_name == GEMINI_PRO:
        models_to_try.append(GEMINI_FLASH)

    for current_model in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=current_model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        max_output_tokens=max_output_tokens,
                        temperature=0.3,
                        thinking_config=thinking_config,
                    ),
                )
                text = response.text
                if not text or not text.strip():
                    finish_reason = None
                    try:
                        finish_reason = response.candidates[0].finish_reason
                    except Exception:
                        pass
                    raise ValueError(
                        f"Gemini returned an empty response. finish_reason={finish_reason}."
                    )
                thinking = _extract_thinking(response)
                return text, thinking
            except genai_errors.ServerError as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait = 10 * (2 ** attempt)
                    time.sleep(wait)
            except Exception:
                raise

    raise last_error  # type: ignore[misc]


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from a response that might contain markdown fences or preamble."""
    text = text.strip()

    # Strip markdown code fences if present
    if "```" in text:
        import re
        match = re.search(r"```(?:json)?\s*\n([\s\S]*?)\n```", text)
        if match:
            text = match.group(1).strip()

    # Find the outermost JSON object or array (handles preamble/postamble)
    for start_char, end_char in [('{', '}'), ('[', ']')]:
        start = text.find(start_char)
        end = text.rfind(end_char)
        if start != -1 and end != -1 and end > start:
            candidate = text[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

    raise ValueError(f"Could not extract valid JSON from Gemini response. Raw text:\n{text[:500]!r}")


def clean_job_description(raw_text: str) -> CleanedJobDescription:
    """Use AI to clean and structure a raw job description."""
    prompt = CLEAN_JOB_DESCRIPTION.format(job_description=raw_text)
    response = _call_gemini(prompt, json_mode=True)
    data = _extract_json(response)

    return CleanedJobDescription(
        raw_text=raw_text,
        required_skills=data.get("required_skills", []),
        nice_to_have_skills=data.get("nice_to_have_skills", []),
        valued_qualities=data.get("valued_qualities", []),
        holistic_person_definition=data.get("holistic_person_definition", ""),
    )


def create_ats_rubric(cleaned_jd: CleanedJobDescription) -> list[ATSRubricItem]:
    """Use AI to create an ATS scoring rubric from the cleaned JD."""
    prompt = CREATE_ATS_RUBRIC.format(
        job_description_raw=cleaned_jd.raw_text or "(not provided)",
        required_skills=json.dumps(cleaned_jd.required_skills),
        nice_to_have_skills=json.dumps(cleaned_jd.nice_to_have_skills),
        valued_qualities=json.dumps(cleaned_jd.valued_qualities),
    )
    response = _call_gemini(prompt, max_output_tokens=8192, json_mode=True)
    data = _extract_json(response)

    items = []
    for raw in data.get("rubric_items", []):
        items.append(
            ATSRubricItem(
                rubric_id=raw["rubric_id"],
                category=raw.get("category", "technical_skill"),
                priority=raw.get("priority", "important"),
                item=raw["item"],
                ats_keywords=raw.get("ats_keywords", [raw["item"]]),
                situation_description=raw["situation_description"],
                action_description=raw["action_description"],
            )
        )
    return items


def create_intent_rubric(cleaned_jd: CleanedJobDescription) -> IntentRubric:
    """Use AI to create an Intent scoring rubric from the cleaned JD."""
    prompt = CREATE_INTENT_RUBRIC.format(
        required_skills=json.dumps(cleaned_jd.required_skills),
        nice_to_have_skills=json.dumps(cleaned_jd.nice_to_have_skills),
        valued_qualities=json.dumps(cleaned_jd.valued_qualities),
        holistic_person=cleaned_jd.holistic_person_definition,
    )
    response = _call_gemini(prompt, max_output_tokens=8192, json_mode=True)
    data = _extract_json(response)

    items = []
    for raw in data.get("items", []):
        items.append(
            IntentRubricItem(
                rubric_id=raw["rubric_id"],
                category=raw["category"],
                description=raw["description"],
                weight=raw.get("weight", 1.0),
            )
        )
    return IntentRubric(
        items=items,
        holistic_summary=data.get("holistic_summary", ""),
    )


def create_knockout_rubric(cleaned_jd: CleanedJobDescription) -> list[KnockoutItem]:
    """Use AI to identify hard knockout requirements from the JD."""
    prompt = CREATE_KNOCKOUT_RUBRIC.format(
        job_description_raw=cleaned_jd.raw_text or "(not provided)",
        required_skills=json.dumps(cleaned_jd.required_skills),
    )
    response = _call_gemini(prompt, max_output_tokens=2048, json_mode=True)
    data = _extract_json(response)

    items = []
    for raw in data.get("knockout_items", []):
        items.append(
            KnockoutItem(
                item_id=raw.get("item_id", ""),
                category=raw.get("category", "other"),
                requirement=raw.get("requirement", ""),
            )
        )
    return items


def generate_single_bullet(
    rubric_item: ATSRubricItem,
    activity: "ActivityBullet",
) -> str:
    """Generate a single resume bullet using Pro Gemini for higher quality inline generation."""
    prompt = WRITE_STI_STATEMENT.format(
        rubric_item=rubric_item.item,
        ats_keywords=", ".join(rubric_item.ats_keywords) if rubric_item.ats_keywords else rubric_item.item,
        situation_desc=rubric_item.situation_description,
        action_desc=rubric_item.action_description,
        secondary_rubric_context="",
        holistic_person="Not provided",
        original_situation=activity.situation,
        original_action=activity.action,
        original_impact=activity.impact,
        job_title=activity.job_title,
        company=activity.company,
        extracted_skills=", ".join(activity.extracted_skills) if activity.extracted_skills else "Not available",
    )
    text, _ = _call_gemini_with_thinking(prompt, max_output_tokens=2048, use_pro=True, thinking_budget=512)
    return text.strip()


def write_sti_statement(
    rubric_item: ATSRubricItem,
    activity: "ActivityBullet",
    holistic_person: str = "",
    secondary_rubric_items: list[ATSRubricItem] | None = None,
) -> str:
    """Use AI to write a grounded bullet point for a matched activity using Flash.

    If secondary_rubric_items are provided, their skill context is combined
    with the primary rubric item (used when the same bullet covers multiple
    equally-prioritized rubric requirements).
    """
    # Build secondary rubric context block
    secondary_rubric_context = ""
    if secondary_rubric_items:
        lines = ["ADDITIONAL SKILL REQUIREMENTS (incorporate alongside the primary):"]
        for sr in secondary_rubric_items:
            lines.append(f"  Item: {sr.item}")
            if sr.ats_keywords:
                lines.append(f"  Additional Keywords: {', '.join(sr.ats_keywords)}")
            if sr.action_description:
                lines.append(f"  Additional Context: {sr.action_description}")
        secondary_rubric_context = "\n".join(lines) + "\n"

    # Merge all ATS keywords (primary + secondary)
    all_keywords = list(rubric_item.ats_keywords)
    if secondary_rubric_items:
        for sr in secondary_rubric_items:
            all_keywords.extend(sr.ats_keywords)

    prompt = WRITE_STI_STATEMENT.format(
        rubric_item=rubric_item.item,
        ats_keywords=", ".join(all_keywords) if all_keywords else rubric_item.item,
        situation_desc=rubric_item.situation_description,
        action_desc=rubric_item.action_description,
        secondary_rubric_context=secondary_rubric_context,
        holistic_person=holistic_person or "Not provided",
        original_situation=activity.situation,
        original_action=activity.action,
        original_impact=activity.impact,
        job_title=activity.job_title,
        company=activity.company,
        extracted_skills=", ".join(activity.extracted_skills) if activity.extracted_skills else "Not available",
    )
    text, thinking = _call_gemini_with_thinking(prompt, max_output_tokens=8192, use_pro=False, thinking_budget=1024)
    return text.strip(), thinking


def dedup_bullets(statements: list[dict]) -> list[dict]:
    """Check all generated bullets for repeated opening verbs and fix only those.

    Takes the full statement dicts, operates only on successful ones (no error),
    and returns the list with any repeated-verb bullets minimally reworded.
    If no repetition is found, bullets are returned verbatim.
    """
    successful = [(i, s) for i, s in enumerate(statements) if s.get("statement") and not s.get("error")]
    if len(successful) < 2:
        return statements

    bullets_input = [{"id": str(i), "text": s["statement"]} for i, s in successful]
    prompt = DEDUP_BULLETS.format(bullets_json=json.dumps(bullets_input, indent=2))
    try:
        response = _call_gemini(prompt, max_output_tokens=16384, json_mode=True)
        data = _extract_json(response)
    except Exception:
        return statements  # dedup failure is non-fatal — return originals

    id_to_text = {item["id"]: item["text"] for item in data.get("bullets", [])}

    result = list(statements)
    for i, s in successful:
        updated_text = id_to_text.get(str(i))
        if updated_text and updated_text != s["statement"]:
            result[i] = {**s, "statement": updated_text}
    return result


def assemble_resume(
    template: "ResumeTemplate",
    statements: list[dict],
    role_context: str = "",
    holistic_person: str = "",
    consolidated_skills: list[str] | None = None,
) -> str:
    """Use AI to assemble S-T-I statements into a structured resume."""
    from collections import defaultdict

    PROJECT_TYPES = {"project", "competition"}

    # Separate work and project activities
    work_stmts    = [s for s in statements if s.get("entry_type", "work") not in PROJECT_TYPES]
    project_stmts = [s for s in statements if s.get("entry_type", "work") in PROJECT_TYPES]

    def _build_history_block(stmts: list[dict]) -> str:
        role_order: list[tuple] = []
        role_bullets: dict[tuple, list[str]] = defaultdict(list)
        for s in stmts:
            if not s.get("statement"):
                continue
            key = (s["job_title"], s["company"], s.get("dates", ""), s.get("location", ""))
            if key not in role_bullets:
                role_order.append(key)
            role_bullets[key].append(s["statement"])
        block = ""
        for job_title, company, dates, location in role_order:
            block += f"\n{job_title} | {company} | {dates} | {location}\n"
            for bullet in role_bullets[(job_title, company, dates, location)]:
                block += f"  • {bullet}\n"
        return block.strip() or "  None"

    work_history_block    = _build_history_block(work_stmts)
    project_history_block = _build_history_block(project_stmts)

    # Skills: deduplicate, then pass a capped list so the AI can pick the best ones
    raw_skills = consolidated_skills or template.skills or []
    seen: set[str] = set()
    deduped: list[str] = []
    for s in raw_skills:
        key = s.lower().strip()
        if key and key not in seen:
            seen.add(key)
            deduped.append(s)
    skills_list = ", ".join(deduped[:60]) if deduped else "  Not available"

    # Build education block
    education_block = "  Not provided"
    if template.education:
        lines = []
        for edu in template.education:
            degree_line = " ".join(filter(None, [edu.get("degree", ""), edu.get("field_of_study", "")]))
            date_line = " – ".join(filter(None, [edu.get("start_date", ""), edu.get("end_date", "")]))
            school_line = " | ".join(filter(None, [edu.get("school", ""), edu.get("location", ""), date_line]))
            gpa = edu.get("gpa", "")
            lines.append(school_line)
            if degree_line:
                lines.append(f"  {degree_line}" + (f" | GPA: {gpa}" if gpa else ""))
            if edu.get("description"):
                lines.append(f"  {edu['description']}")
            for b in edu.get("bullets", []):
                if b:
                    lines.append(f"  • {b}")
            lines.append("")
        education_block = "\n".join(lines).strip()

    awards_list = "\n".join(f"  • {a}" for a in template.awards) if template.awards else "  None"
    certifications_list = "\n".join(f"  • {c}" for c in template.certifications) if template.certifications else "  None"

    prompt = ASSEMBLE_RESUME.format(
        name=template.name,
        location=template.location,
        email=template.email,
        phone=template.phone,
        linkedin=template.linkedin,
        website=template.website,
        sections=", ".join(template.sections),
        work_history_block=work_history_block,
        project_history_block=project_history_block,
        role_context=role_context or "Not provided",
        skills_list=skills_list,
        education_block=education_block,
        awards_list=awards_list,
        certifications_list=certifications_list,
    )
    text, thinking = _call_gemini_with_thinking(prompt, max_output_tokens=16384, use_pro=True, thinking_budget=4096)
    return text.strip(), thinking


def intent_rewrite(
    ats_resume: str,
    intent_rubric: IntentRubric,
    ats_keywords: list[str] | None = None,
) -> str:
    """Use AI to rewrite the ATS resume to align with intent rubric."""
    rubric_text = ""
    for item in intent_rubric.items:
        rubric_text += (
            f"  [{item.category}] (weight: {item.weight}): {item.description}\n"
        )

    keyword_checklist = "  (no checklist provided)"
    if ats_keywords:
        keyword_checklist = ", ".join(sorted(set(ats_keywords)))

    prompt = INTENT_REWRITE.format(
        ats_resume=ats_resume,
        intent_rubric=rubric_text,
        holistic_summary=intent_rubric.holistic_summary,
        ats_keyword_checklist=keyword_checklist,
    )
    text, thinking = _call_gemini_with_thinking(prompt, max_output_tokens=8192, use_pro=True, thinking_budget=2048)
    return text.strip(), thinking


def polish_resume(resume_text: str, instruction: str) -> str:
    """Apply a user instruction to polish the resume using AI."""
    prompt = POLISH_RESUME.format(
        resume_text=resume_text,
        instruction=instruction,
    )
    text, thinking = _call_gemini_with_thinking(prompt, max_output_tokens=8192, use_pro=True, thinking_budget=1024)
    return text.strip(), thinking


def extract_skills_from_activities(activities: list) -> dict[str, list[str]]:
    """Use AI to extract skills/technologies from each activity bullet.

    Returns a dict mapping bullet_id -> list of extracted skills.
    Processes in batches of 20 to stay within token limits.
    """
    all_skills: dict[str, list[str]] = {}

    # Process in batches
    for i in range(0, len(activities), 20):
        batch = activities[i:i + 20]
        activities_json = json.dumps([
            {
                "bullet_id": a.bullet_id,
                "situation": a.situation,
                "action": a.action,
                "impact": a.impact,
                "job_title": a.job_title,
            }
            for a in batch
        ], indent=2)

        prompt = EXTRACT_ACTIVITY_SKILLS.format(activities_json=activities_json)
        response = _call_gemini(prompt, max_output_tokens=8192, json_mode=True)
        data = _extract_json(response)

        for item in data.get("activities", []):
            bid = item.get("bullet_id", "")
            skills = item.get("skills", [])
            all_skills[bid] = [s.lower().strip() for s in skills]

    return all_skills


def parse_pdf_resume_template(pdf_text: str) -> dict:
    """Use AI to parse a PDF resume's text into structured template data."""
    prompt = PARSE_PDF_RESUME_TEMPLATE.format(pdf_text=pdf_text)
    response = _call_gemini(prompt, max_output_tokens=4096, json_mode=True)
    return _extract_json(response)


def parse_resume_to_activities(pdf_text: str) -> list[dict]:
    """Use AI to decompose a resume's work experience bullets into S-A-I activity entries.

    Returns a list of dicts with keys: situation, action, impact,
    job_title, company, dates_worked, location.
    """
    prompt = PARSE_RESUME_TO_ACTIVITY_BANK.format(pdf_text=pdf_text)
    response = _call_gemini(prompt, max_output_tokens=8192, json_mode=True)
    data = _extract_json(response)
    return data.get("activities", [])


def parse_resume_full(resume_text: str) -> dict:
    """Parse a full resume into profile, education, activities, and style notes."""
    prompt = PARSE_RESUME_FULL.format(resume_text=resume_text)
    response = _call_gemini(prompt, max_output_tokens=8192, json_mode=True)
    return _extract_json(response)


def generate_latex_template(style_spec: str, profile: dict, sections: list[str]) -> str:
    """Generate a LaTeX resume template with lorem ipsum content."""
    prompt = GENERATE_LATEX_TEMPLATE.format(
        style_spec=style_spec,
        name=profile.get("name", "Your Name"),
        email=profile.get("email", "email@example.com"),
        phone=profile.get("phone", "555-555-5555"),
        location=profile.get("location", "City, State"),
        linkedin=profile.get("linkedin", ""),
        website=profile.get("website", ""),
        sections=", ".join(sections),
    )
    return _call_gemini(prompt, max_output_tokens=8192, use_pro=False).strip()


def edit_latex_with_ai(latex: str, instruction: str) -> str:
    """Apply a user instruction to edit a LaTeX template."""
    prompt = EDIT_LATEX_TEMPLATE.format(latex=latex, instruction=instruction)
    return _call_gemini(prompt, max_output_tokens=8192, use_pro=False).strip()


def parse_raw_text_to_activity(raw_text: str) -> list[dict]:
    """Parse free-form text into a list of structured STAR activity dicts."""
    prompt = PARSE_RAW_TEXT_ACTIVITY.format(raw_text=raw_text)
    result = _call_gemini(prompt, max_output_tokens=4096, json_mode=True)
    cleaned = result.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = json.loads(cleaned)
    return parsed.get("activities", [])


def assemble_latex_resume(latex_template: str, resume_text: str, profile: dict) -> str:
    """Replace lorem ipsum in a LaTeX template with real resume content."""
    prompt = ASSEMBLE_LATEX_RESUME.format(
        latex_template=latex_template,
        resume_text=resume_text,
        name=profile.get("name", ""),
        email=profile.get("email", ""),
        phone=profile.get("phone", ""),
        location=profile.get("location", ""),
        linkedin=profile.get("linkedin", ""),
        website=profile.get("website", ""),
    )
    return _call_gemini(prompt, max_output_tokens=8192, use_pro=True, thinking_budget=2048).strip()


# ── Layout extraction (sections + margins only) ────────────────────────────────

# Canonical section IDs and the keyword patterns that identify them in resume text
_SECTION_PATTERNS: list[tuple[str, str, list[str]]] = [
    # (id, default_label, [keyword patterns])
    ("summary",        "Summary",        ["summary", "objective", "profile", "about"]),
    ("experience",     "Experience",     ["experience", "employment", "work history", "career"]),
    ("education",      "Education",      ["education", "academic", "schooling", "degree"]),
    ("skills",         "Skills",         ["skill", "technical", "competenc", "proficienc", "expertise"]),
    ("projects",       "Projects",       ["project", "portfolio", "work sample"]),
    ("certifications", "Certifications", ["certif", "licens", "credential", "accreditation"]),
    ("awards",         "Awards",         ["award", "honor", "achiev", "recogn", "distinction"]),
    ("volunteer",      "Volunteer",      ["volunteer", "community", "nonprofit", "charity", "civic"]),
]

_DEFAULT_LAYOUT: dict = {
    "pageSize": "letter",
    "marginX":  0.75,
    "marginY":  0.75,
    "sections": [
        {"id": sid, "label": label, "enabled": False}
        for sid, label, _ in _SECTION_PATTERNS
    ],
}


def _detect_sections_from_text(text: str) -> list[dict]:
    """Scan plain text for section headings; return ordered list of SectionDef dicts."""
    lines = text.splitlines()
    found: list[tuple[int, str, str]] = []  # (line_index, id, label_as_found)
    seen_ids: set[str] = set()

    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or len(line) > 60:
            continue
        line_lc = line.lower()
        for sid, default_label, patterns in _SECTION_PATTERNS:
            if sid in seen_ids:
                continue
            if any(pat in line_lc for pat in patterns):
                found.append((i, sid, line.title()))
                seen_ids.add(sid)
                break

    # Build result: found sections first (in order), then missing sections disabled
    result = [{"id": sid, "label": label, "enabled": True} for _, sid, label in sorted(found)]
    for sid, default_label, _ in _SECTION_PATTERNS:
        if sid not in seen_ids:
            result.append({"id": sid, "label": default_label, "enabled": False})
    return result


def extract_design_from_docx(file_bytes: bytes) -> dict:
    """Extract page layout (sections + margins) from a DOCX file.

    Returns a partial ResumeDesign dict with only: pageSize, marginX, marginY, sections.
    Typography is intentionally excluded — the user's selected template is preserved.
    """
    import io
    from docx import Document

    layout = {
        "pageSize": "letter",
        "marginX":  0.75,
        "marginY":  0.75,
    }

    try:
        doc = Document(io.BytesIO(file_bytes))

        # ── Page margins ──────────────────────────────────────────────────────
        try:
            sec = doc.sections[0]
            left_in  = sec.left_margin.inches  if sec.left_margin  else 0.75
            right_in = sec.right_margin.inches if sec.right_margin else 0.75
            top_in   = sec.top_margin.inches   if sec.top_margin   else 0.75
            layout["marginX"] = round((left_in + right_in) / 2, 2)
            layout["marginY"] = round(top_in, 2)
        except Exception:
            pass

        # ── Section detection ─────────────────────────────────────────────────
        full_text = "\n".join(p.text for p in doc.paragraphs)
        layout["sections"] = _detect_sections_from_text(full_text)

    except Exception:
        layout["sections"] = _DEFAULT_LAYOUT["sections"]

    return layout


def extract_design_from_pdf(file_bytes: bytes) -> dict:
    """Extract page layout (sections + margins) from a PDF using AI.

    Returns a partial ResumeDesign dict with only: pageSize, marginX, marginY, sections.
    Typography is intentionally excluded — the user's selected template is preserved.
    """
    resume_text = ""

    # Try pdfminer first
    try:
        import io
        from pdfminer.high_level import extract_text as pdf_extract_text
        resume_text = pdf_extract_text(io.BytesIO(file_bytes))
    except Exception:
        pass

    # Fallback: pypdf
    if not resume_text.strip():
        try:
            import io
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            resume_text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
        except Exception:
            pass

    # If text extraction failed entirely, fall back to heuristic detection on empty text
    if not resume_text.strip():
        return dict(_DEFAULT_LAYOUT)

    # Try AI extraction first
    prompt = PARSE_RESUME_DESIGN.format(resume_text=resume_text[:6000])
    try:
        result = _call_gemini(prompt, max_output_tokens=1024, json_mode=True)
        cleaned = result.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned)
        # Validate and return only the layout fields
        return {
            "pageSize": parsed.get("pageSize", "letter"),
            "marginX":  float(parsed.get("marginX", 0.75)),
            "marginY":  float(parsed.get("marginY", 0.75)),
            "sections": parsed.get("sections") or _detect_sections_from_text(resume_text),
        }
    except Exception:
        # AI failed — fall back to heuristic section detection
        return {
            "pageSize": "letter",
            "marginX":  0.75,
            "marginY":  0.75,
            "sections": _detect_sections_from_text(resume_text),
        }
