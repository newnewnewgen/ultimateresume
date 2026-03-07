"""AI engine for all LLM-powered operations using Google Gemini."""

from __future__ import annotations

import json
import os
from typing import Any

import google.generativeai as genai

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
    INTENT_REWRITE,
    PARSE_PDF_RESUME_TEMPLATE,
    WRITE_STI_STATEMENT,
)

# Model used for all AI calls — swap to "gemini-1.5-flash" for faster/cheaper calls
GEMINI_MODEL = "gemini-2.0-flash"


def _get_model() -> genai.GenerativeModel:
    """Configure the Gemini client and return a GenerativeModel."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL)


def _call_gemini(prompt: str, max_output_tokens: int = 4096) -> str:
    """Make a call to Gemini and return the text response."""
    model = _get_model()
    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_output_tokens,
            temperature=0.3,
        ),
    )
    return response.text


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from a response that might contain markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        # Remove markdown code fences
        lines = text.split("\n")
        # Drop first line (```json or ```) and last line (```)
        json_lines = []
        in_block = False
        for line in lines:
            if line.strip().startswith("```") and not in_block:
                in_block = True
                continue
            if line.strip() == "```" and in_block:
                break
            if in_block:
                json_lines.append(line)
        text = "\n".join(json_lines)
    return json.loads(text)


def clean_job_description(raw_text: str) -> CleanedJobDescription:
    """Use AI to clean and structure a raw job description."""
    prompt = CLEAN_JOB_DESCRIPTION.format(job_description=raw_text)
    response = _call_gemini(prompt)
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
    response = _call_gemini(prompt, max_output_tokens=8192)
    data = _extract_json(response)

    items = []
    for raw in data.get("rubric_items", []):
        items.append(
            ATSRubricItem(
                rubric_id=raw["rubric_id"],
                category=raw["category"],
                item=raw["item"],
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
    response = _call_gemini(prompt, max_output_tokens=8192)
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
) -> str:
    """Use AI to write a polished S-T-I statement for a matched activity."""
    from core.models import ActivityBullet

    prompt = WRITE_STI_STATEMENT.format(
        rubric_item=rubric_item.item,
        situation_desc=rubric_item.situation_description,
        action_desc=rubric_item.action_description,
        original_situation=activity.situation,
        original_action=activity.action,
        original_impact=activity.impact,
        job_title=activity.job_title,
        company=activity.company,
    )
    return _call_gemini(prompt, max_output_tokens=512).strip()


def assemble_resume(
    template: "ResumeTemplate",
    statements: list[dict],
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

    prompt = ASSEMBLE_RESUME.format(
        name=template.name,
        location=template.location,
        email=template.email,
        phone=template.phone,
        linkedin=template.linkedin,
        website=template.website,
        sections=", ".join(template.sections),
        statements_block=statements_block,
    )
    return _call_gemini(prompt, max_output_tokens=8192).strip()


def intent_rewrite(
    ats_resume: str,
    intent_rubric: IntentRubric,
) -> str:
    """Use AI to rewrite the ATS resume to align with intent rubric."""
    rubric_text = ""
    for item in intent_rubric.items:
        rubric_text += (
            f"  [{item.category}] (weight: {item.weight}): {item.description}\n"
        )

    prompt = INTENT_REWRITE.format(
        ats_resume=ats_resume,
        intent_rubric=rubric_text,
        holistic_summary=intent_rubric.holistic_summary,
    )
    return _call_gemini(prompt, max_output_tokens=8192).strip()


def parse_pdf_resume_template(pdf_text: str) -> dict:
    """Use AI to parse a PDF resume's text into structured template data."""
    prompt = PARSE_PDF_RESUME_TEMPLATE.format(pdf_text=pdf_text)
    response = _call_gemini(prompt, max_output_tokens=4096)
    return _extract_json(response)
