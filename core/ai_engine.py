"""AI engine for all LLM-powered operations using Google Gemini."""

from __future__ import annotations

import json
import os
from typing import Any

from google import genai
from google.genai import types as genai_types

from core.models import (
    ATSRubricItem,
    CleanedJobDescription,
    IntentRubric,
    IntentRubricItem,
)
from prompts.templates import (
    ASSEMBLE_RESUME,
    CLEAN_JOB_DESCRIPTION,
    CREATE_ATS_RUBRIC,
    CREATE_INTENT_RUBRIC,
    EXTRACT_ACTIVITY_SKILLS,
    INTENT_REWRITE,
    PARSE_PDF_RESUME_TEMPLATE,
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
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    return genai.Client(api_key=api_key)


def _call_gemini(prompt: str, max_output_tokens: int = 8192, use_pro: bool = False, json_mode: bool = False) -> str:
    """Make a call to Gemini and return the text response.

    Args:
        use_pro: If True, use gemini-2.5-pro for higher quality writing.
        json_mode: If True, disable thinking (budget=0) for structured JSON
                   extraction. Thinking tokens consume the output budget and
                   cause empty responses on extraction tasks.
    """
    if use_pro:
        model_name = GEMINI_PRO
    elif json_mode:
        model_name = GEMINI_FLASH_JSON
    else:
        model_name = GEMINI_FLASH

    client = _get_client()
    thinking_config = genai_types.ThinkingConfig(thinking_budget=0) if json_mode else None
    response = client.models.generate_content(
        model=model_name,
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


def write_sti_statement(
    rubric_item: ATSRubricItem,
    activity: "ActivityBullet",
    holistic_person: str = "",
    previous_bullets: list[str] | None = None,
) -> str:
    """Use AI to write a polished S-T-I statement for a matched activity."""
    from core.models import ActivityBullet

    # Build other bullets context to avoid repetition
    other_bullets = "  (none yet — this is the first bullet)" if not previous_bullets else ""
    if previous_bullets:
        other_bullets = "\n".join(f"  - {b}" for b in previous_bullets)

    prompt = WRITE_STI_STATEMENT.format(
        rubric_item=rubric_item.item,
        ats_keywords=", ".join(rubric_item.ats_keywords) if rubric_item.ats_keywords else rubric_item.item,
        situation_desc=rubric_item.situation_description,
        action_desc=rubric_item.action_description,
        holistic_person=holistic_person or "Not provided",
        original_situation=activity.situation,
        original_action=activity.action,
        original_impact=activity.impact,
        job_title=activity.job_title,
        company=activity.company,
        extracted_skills=", ".join(activity.extracted_skills) if activity.extracted_skills else "Not available",
        other_bullets=other_bullets,
    )
    return _call_gemini(prompt, max_output_tokens=512, use_pro=True).strip()


def assemble_resume(
    template: "ResumeTemplate",
    statements: list[dict],
    role_context: str = "",
    holistic_person: str = "",
    consolidated_skills: list[str] | None = None,
) -> str:
    """Use AI to assemble S-T-I statements into a structured resume."""
    from core.models import ResumeTemplate

    statements_block = ""
    for s in statements:
        statements_block += (
            f"  - Bullet: {s['statement']}\n"
            f"    Job Title: {s['job_title']}\n"
            f"    Company: {s['company']}\n"
            f"    Dates: {s['dates']}\n"
            f"    Location: {s['location']}\n"
            f"    Target Skill: {s['rubric_item']}\n\n"
        )

    skills_list = "  Not available"
    if consolidated_skills:
        skills_list = ", ".join(consolidated_skills)

    prompt = ASSEMBLE_RESUME.format(
        name=template.name,
        location=template.location,
        email=template.email,
        phone=template.phone,
        linkedin=template.linkedin,
        website=template.website,
        sections=", ".join(template.sections),
        statements_block=statements_block,
        role_context=role_context or "Not provided",
        holistic_person=holistic_person or "Not provided",
        skills_list=skills_list,
    )
    return _call_gemini(prompt, max_output_tokens=8192, use_pro=True).strip()


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
    return _call_gemini(prompt, max_output_tokens=8192, use_pro=True).strip()


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
