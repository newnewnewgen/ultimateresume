"""Pipeline orchestrator - coordinates the full resume generation flow."""

from __future__ import annotations

from core.models import (
    ActivityBullet,
    ATSRubricItem,
    CleanedJobDescription,
    GeneratedResume,
    IntentRubric,
    KnockoutItem,
    PipelineState,
    ResumeTemplate,
    VectorMatch,
)
from core.vectorizer import (
    deduplicate_rubric,
    find_all_matches,
    vectorize_activity_bank,
    vectorize_ats_rubric,
)
from core.ai_engine import (
    assemble_resume,
    clean_job_description,
    create_ats_rubric,
    create_intent_rubric,
    create_knockout_rubric,
    dedup_bullets,
    extract_skills_from_activities,
    intent_rewrite,
    write_sti_statement,
)


def step1_ingest_and_vectorize(
    activities: list[ActivityBullet],
) -> list[ActivityBullet]:
    """Step 1: Extract skills from activities, then vectorize the activity bank."""
    # First, use AI to extract skills/technologies from each activity
    skills_map = extract_skills_from_activities(activities)
    for activity in activities:
        activity.extracted_skills = skills_map.get(activity.bullet_id, [])
    # Then vectorize (embeddings will include extracted skills for better signal)
    return vectorize_activity_bank(activities)


def step2_analyze_job_description(raw_text: str) -> CleanedJobDescription:
    """Step 2: AI-clean the job description."""
    return clean_job_description(raw_text)


def step3_create_rubrics(
    cleaned_jd: CleanedJobDescription,
) -> tuple[list[ATSRubricItem], IntentRubric, list[KnockoutItem]]:
    """Step 3: Create ATS, Intent, and Knockout rubrics in parallel."""
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        ats_future      = executor.submit(create_ats_rubric, cleaned_jd)
        intent_future   = executor.submit(create_intent_rubric, cleaned_jd)
        knockout_future = executor.submit(create_knockout_rubric, cleaned_jd)
        ats     = ats_future.result()
        intent  = intent_future.result()
        knockout = knockout_future.result()

    return ats, intent, knockout


def step4_vectorize_and_match(
    ats_rubric: list[ATSRubricItem],
    activities: list[ActivityBullet],
    top_k: int = 5,
) -> tuple[list[ATSRubricItem], dict[str, list[VectorMatch]]]:
    """Step 4: Vectorize ATS rubric, deduplicate overlapping items, and find matches."""
    ats_rubric = vectorize_ats_rubric(ats_rubric)
    ats_rubric = deduplicate_rubric(ats_rubric)
    matches = find_all_matches(ats_rubric, activities, top_k)
    return ats_rubric, matches


_PRIORITY_RANK = {"critical": 0, "important": 1, "nice_to_have": 2}


def step5_generate_statements(
    ats_rubric: list[ATSRubricItem],
    activities_by_id: dict[str, ActivityBullet],
    selections: dict[str, list[str]],  # rubric_id -> list of selected bullet_ids
    holistic_person: str = "",
) -> list[dict]:
    """Step 5: Generate one bullet per unique selected activity, in parallel.

    Each activity bullet is written exactly once, even if selected by multiple
    rubric items. All bullets are generated simultaneously using Flash, then a
    single dedup pass fixes any repeated opening verbs.
    """
    import concurrent.futures
    from collections import defaultdict

    rubric_by_id = {item.rubric_id: item for item in ats_rubric}

    # Build reverse map: bullet_id -> list of rubric items that selected it
    bullet_to_rubrics: dict[str, list[ATSRubricItem]] = defaultdict(list)
    for rubric_id, bullet_ids in selections.items():
        rubric_item = rubric_by_id.get(rubric_id)
        if not rubric_item:
            continue
        for bullet_id in bullet_ids:
            if rubric_item not in bullet_to_rubrics[bullet_id]:
                bullet_to_rubrics[bullet_id].append(rubric_item)

    # Sort order: critical first, then by bullet_id for stability
    def _bullet_sort_key(bullet_id: str) -> tuple:
        rubrics = bullet_to_rubrics[bullet_id]
        top_priority = min(_PRIORITY_RANK.get(r.priority, 1) for r in rubrics)
        return (top_priority, bullet_id)

    sorted_bullet_ids = [
        bid for bid in sorted(bullet_to_rubrics.keys(), key=_bullet_sort_key)
        if activities_by_id.get(bid)
    ]

    # Pre-compute rubric context for each bullet
    slot_contexts: dict[str, tuple] = {}
    for bullet_id in sorted_bullet_ids:
        rubric_items = bullet_to_rubrics[bullet_id]
        sorted_rubrics = sorted(rubric_items, key=lambda r: _PRIORITY_RANK.get(r.priority, 1))
        top_priority = sorted_rubrics[0].priority
        top_rubrics = [r for r in sorted_rubrics if r.priority == top_priority]
        primary_rubric = top_rubrics[0]
        secondary_rubrics = top_rubrics[1:] if len(top_rubrics) > 1 else []
        slot_contexts[bullet_id] = (rubric_items, primary_rubric, secondary_rubrics)

    def _write_one(bullet_id: str) -> dict:
        activity = activities_by_id[bullet_id]
        rubric_items, primary_rubric, secondary_rubrics = slot_contexts[bullet_id]

        if len(rubric_items) == 1:
            rewrite_logic = primary_rubric.item
        elif secondary_rubrics:
            combined = ", ".join(r.item for r in [primary_rubric] + secondary_rubrics)
            rewrite_logic = f"Combined ({combined})"
        else:
            rewrite_logic = f"{primary_rubric.item} ({primary_rubric.priority} — highest priority)"

        thinking_text = ""
        try:
            statement, thinking_text = write_sti_statement(
                primary_rubric,
                activity,
                holistic_person=holistic_person,
                secondary_rubric_items=secondary_rubrics if secondary_rubrics else None,
            )
            error_msg = None
        except Exception as exc:
            statement = ""
            error_msg = str(exc)

        # Update rubric item tracking
        for r in rubric_items:
            if bullet_id not in r.matched_bullet_ids:
                r.matched_bullet_ids.append(bullet_id)
        if statement:
            primary_rubric.generated_statement = statement

        return {
            "bullet_id": activity.bullet_id,
            "statement": statement,
            "thinking": thinking_text,
            "error": error_msg,
            "job_title": activity.job_title,
            "company": activity.company,
            "dates": activity.dates_worked,
            "location": activity.location,
            "entry_type": activity.entry_type,
            "rubric_ids": [r.rubric_id for r in rubric_items],
            "rubric_items": [r.item for r in rubric_items],
            "primary_rubric_id": primary_rubric.rubric_id,
            "primary_rubric_item": primary_rubric.item,
            "rewrite_logic": rewrite_logic,
        }

    # Generate all bullets in parallel
    results_map: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_to_id = {executor.submit(_write_one, bid): bid for bid in sorted_bullet_ids}
        for future in concurrent.futures.as_completed(future_to_id):
            bid = future_to_id[future]
            try:
                results_map[bid] = future.result()
            except Exception as exc:
                activity = activities_by_id[bid]
                rubric_items, primary_rubric, secondary_rubrics = slot_contexts[bid]
                results_map[bid] = {
                    "bullet_id": bid,
                    "statement": "",
                    "thinking": "",
                    "error": str(exc),
                    "job_title": activity.job_title,
                    "company": activity.company,
                    "dates": activity.dates_worked,
                    "location": activity.location,
                    "entry_type": activity.entry_type,
                    "rubric_ids": [r.rubric_id for r in rubric_items],
                    "rubric_items": [r.item for r in rubric_items],
                    "primary_rubric_id": primary_rubric.rubric_id,
                    "primary_rubric_item": primary_rubric.item,
                    "rewrite_logic": primary_rubric.item,
                }

    # Restore sort order, then fix any repeated opening verbs
    results = [results_map[bid] for bid in sorted_bullet_ids]

    # Aggregate all per-bullet thinking into one block
    thinking_blocks = []
    for r in results:
        t = r.pop("thinking", "")
        if t and r.get("job_title"):
            label = f"{r['job_title']} @ {r['company']}".strip(" @")
            thinking_blocks.append(f"### {label}\n{t}")
    combined_thinking = "\n\n---\n\n".join(thinking_blocks)

    results = dedup_bullets(results)
    return results, combined_thinking


def step6_assemble_ats_resume(
    template: ResumeTemplate,
    statements: list[dict],
    role_context: str = "",
    holistic_person: str = "",
    consolidated_skills: list[str] | None = None,
    all_activities: list[dict] | None = None,
) -> tuple[str, str]:
    """Step 6: Assemble S-T-I statements into ATS-optimized resume.

    Returns:
        (ats_resume_text, thinking_text)
    """
    return assemble_resume(
        template,
        statements,
        role_context=role_context,
        holistic_person=holistic_person,
        consolidated_skills=consolidated_skills,
        all_activities=all_activities,
    )


def step7_intent_rewrite(
    ats_resume: str,
    ats_keywords: list[str] | None = None,
) -> tuple[str, str]:
    """Step 7: Insert genuinely absent ATS keywords — no other changes.

    Returns:
        (resume_text, thinking_text)
    """
    return intent_rewrite(ats_resume, ats_keywords=ats_keywords)
