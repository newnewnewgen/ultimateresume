"""Pipeline orchestrator - coordinates the full resume generation flow."""

from __future__ import annotations

from core.models import (
    ActivityBullet,
    ATSRubricItem,
    CleanedJobDescription,
    GeneratedResume,
    IntentRubric,
    PipelineState,
    ResumeTemplate,
    VectorMatch,
)
from core.vectorizer import (
    find_all_matches,
    vectorize_activity_bank,
    vectorize_ats_rubric,
)
from core.ai_engine import (
    assemble_resume,
    clean_job_description,
    create_ats_rubric,
    create_intent_rubric,
    intent_rewrite,
    write_sti_statement,
)


def step1_ingest_and_vectorize(
    activities: list[ActivityBullet],
) -> list[ActivityBullet]:
    """Step 1: Vectorize the activity bank."""
    return vectorize_activity_bank(activities)


def step2_analyze_job_description(raw_text: str) -> CleanedJobDescription:
    """Step 2: AI-clean the job description."""
    return clean_job_description(raw_text)


def step3_create_rubrics(
    cleaned_jd: CleanedJobDescription,
) -> tuple[list[ATSRubricItem], IntentRubric]:
    """Step 3: Create both ATS and Intent rubrics."""
    ats = create_ats_rubric(cleaned_jd)
    intent = create_intent_rubric(cleaned_jd)
    return ats, intent


def step4_vectorize_and_match(
    ats_rubric: list[ATSRubricItem],
    activities: list[ActivityBullet],
    top_k: int = 3,
) -> tuple[list[ATSRubricItem], dict[str, list[VectorMatch]]]:
    """Step 4: Vectorize ATS rubric and find matches."""
    ats_rubric = vectorize_ats_rubric(ats_rubric)
    matches = find_all_matches(ats_rubric, activities, top_k)
    return ats_rubric, matches


def step5_generate_statements(
    ats_rubric: list[ATSRubricItem],
    activities_by_id: dict[str, ActivityBullet],
    selections: dict[str, str],  # rubric_id -> selected bullet_id
) -> list[dict]:
    """Step 5: Generate S-T-I statements for each rubric item using selected activities."""
    results = []
    for item in ats_rubric:
        selected_id = selections.get(item.rubric_id)
        if not selected_id:
            continue
        activity = activities_by_id.get(selected_id)
        if not activity:
            continue

        statement = write_sti_statement(item, activity)
        item.matched_bullet_ids = [selected_id]
        item.generated_statement = statement

        results.append({
            "rubric_id": item.rubric_id,
            "rubric_item": item.item,
            "statement": statement,
            "job_title": activity.job_title,
            "company": activity.company,
            "dates": activity.dates_worked,
            "location": activity.location,
            "bullet_id": activity.bullet_id,
        })
    return results


def step6_assemble_ats_resume(
    template: ResumeTemplate,
    statements: list[dict],
) -> str:
    """Step 6: Assemble S-T-I statements into ATS-optimized resume."""
    return assemble_resume(template, statements)


def step7_intent_rewrite(
    ats_resume: str,
    intent_rubric: IntentRubric,
) -> str:
    """Step 7: Rewrite resume to align with intent rubric."""
    return intent_rewrite(ats_resume, intent_rubric)
