"""Pipeline endpoints — drive the resume generation steps."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.models import (
    ActivityBullet,
    ATSRubricItem,
    CleanedJobDescription,
    IntentRubric,
    IntentRubricItem,
    KnockoutItem,
    ResumeTemplate,
)
from core.pipeline import (
    step1_ingest_and_vectorize,
    step2_analyze_job_description,
    step3_create_rubrics,
    step4_vectorize_and_match,
    step5_generate_statements,
    step6_assemble_ats_resume,
    step7_intent_rewrite,
)
from core.ai_engine import generate_single_bullet

router = APIRouter()


# ── Request / Response schemas ────────────────────────────────────────────────

class ActivityIn(BaseModel):
    bullet_id: str
    entry_type: str = "work"
    situation: str
    action: str
    impact: str
    job_title: str
    company: str
    dates_worked: str
    location: str
    extracted_skills: list[str] = []


class Step1Request(BaseModel):
    activities: list[ActivityIn]


class ActivityOut(BaseModel):
    bullet_id: str
    entry_type: str
    vector: list[float] = []  # embedding — populated after step 1
    situation: str
    action: str
    impact: str
    job_title: str
    company: str
    dates_worked: str
    location: str
    extracted_skills: list[str]


class Step1Response(BaseModel):
    activities: list[ActivityOut]


class Step2Request(BaseModel):
    job_description: str


class Step2Response(BaseModel):
    required_skills: list[str]
    nice_to_have_skills: list[str]
    valued_qualities: list[str]
    holistic_person_definition: str


class ATSRubricItemOut(BaseModel):
    rubric_id: str
    category: str
    priority: str
    item: str
    ats_keywords: list[str]
    situation_description: str
    action_description: str


class IntentRubricItemOut(BaseModel):
    rubric_id: str
    category: str
    description: str
    weight: float


class IntentRubricOut(BaseModel):
    items: list[IntentRubricItemOut]
    holistic_summary: str


class Step3Request(BaseModel):
    required_skills: list[str]
    nice_to_have_skills: list[str]
    valued_qualities: list[str]
    holistic_person_definition: str
    job_description_raw: str = ""


class KnockoutItemOut(BaseModel):
    item_id: str
    category: str
    requirement: str


class Step3Response(BaseModel):
    ats_rubric: list[ATSRubricItemOut]
    intent_rubric: IntentRubricOut
    knockout_rubric: list[KnockoutItemOut] = []


class VectorMatchOut(BaseModel):
    rubric_id: str
    bullet_id: str
    similarity_score: float


class Step4Request(BaseModel):
    ats_rubric: list[ATSRubricItemOut]
    activities: list[ActivityOut]
    top_k: int = 5


class Step4Response(BaseModel):
    ats_rubric: list[ATSRubricItemOut]
    matches: dict[str, list[VectorMatchOut]]


class Step5Request(BaseModel):
    ats_rubric: list[ATSRubricItemOut]
    activities: list[ActivityOut]
    selections: dict[str, list[str]]
    holistic_person: str = ""


class StatementOut(BaseModel):
    bullet_id: str
    statement: str
    error: str | None
    job_title: str
    company: str
    dates: str
    location: str
    entry_type: str = "work"
    rubric_ids: list[str]
    rubric_items: list[str]
    primary_rubric_id: str
    primary_rubric_item: str
    rewrite_logic: str


class Step5Response(BaseModel):
    statements: list[StatementOut]
    thinking: str = ""


class ResumeTemplateIn(BaseModel):
    name: str = ""
    location: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    sections: list[str] = ["summary", "experience", "education", "skills"]
    skills: list[str] = []
    awards: list[str] = []
    certifications: list[str] = []
    education: list[dict] = []


class Step6Request(BaseModel):
    template: ResumeTemplateIn
    statements: list[StatementOut]
    role_context: str = ""
    holistic_person: str = ""
    consolidated_skills: list[str] = []


class Step6Response(BaseModel):
    ats_resume: str
    thinking: str = ""


class Step7Request(BaseModel):
    ats_resume: str
    intent_rubric: IntentRubricOut
    ats_keywords: list[str] = []


class Step7Response(BaseModel):
    final_resume: str
    thinking: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_activity_bullet(a: ActivityIn | ActivityOut) -> ActivityBullet:
    return ActivityBullet(
        bullet_id=a.bullet_id,
        entry_type=a.entry_type,
        situation=a.situation,
        action=a.action,
        impact=a.impact,
        job_title=a.job_title,
        company=a.company,
        dates_worked=a.dates_worked,
        location=a.location,
        extracted_skills=list(a.extracted_skills),
        vector=list(a.vector) if isinstance(a, ActivityOut) and a.vector else [],
    )


def _activity_out(a: ActivityBullet) -> ActivityOut:
    return ActivityOut(
        bullet_id=a.bullet_id,
        entry_type=a.entry_type,
        situation=a.situation,
        action=a.action,
        impact=a.impact,
        job_title=a.job_title,
        company=a.company,
        dates_worked=a.dates_worked,
        location=a.location,
        extracted_skills=a.extracted_skills,
        vector=list(a.vector) if a.vector else [],
    )


def _to_ats_rubric_item(r: ATSRubricItemOut) -> ATSRubricItem:
    return ATSRubricItem(
        rubric_id=r.rubric_id,
        category=r.category,
        priority=r.priority,
        item=r.item,
        ats_keywords=list(r.ats_keywords),
        situation_description=r.situation_description,
        action_description=r.action_description,
    )


def _ats_rubric_item_out(r: ATSRubricItem) -> ATSRubricItemOut:
    return ATSRubricItemOut(
        rubric_id=r.rubric_id,
        category=r.category,
        priority=r.priority,
        item=r.item,
        ats_keywords=r.ats_keywords,
        situation_description=r.situation_description,
        action_description=r.action_description,
    )


def _to_intent_rubric(r: IntentRubricOut) -> IntentRubric:
    return IntentRubric(
        items=[
            IntentRubricItem(
                rubric_id=i.rubric_id,
                category=i.category,
                description=i.description,
                weight=i.weight,
            )
            for i in r.items
        ],
        holistic_summary=r.holistic_summary,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/step1", response_model=Step1Response)
async def step1(req: Step1Request):
    """Extract skills and vectorize the activity bank."""
    try:
        activities = [_to_activity_bullet(a) for a in req.activities]
        result = step1_ingest_and_vectorize(activities)
        return Step1Response(activities=[_activity_out(a) for a in result])
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step2", response_model=Step2Response)
async def step2(req: Step2Request):
    """Clean and structure a raw job description."""
    try:
        cleaned = step2_analyze_job_description(req.job_description)
        return Step2Response(
            required_skills=cleaned.required_skills,
            nice_to_have_skills=cleaned.nice_to_have_skills,
            valued_qualities=cleaned.valued_qualities,
            holistic_person_definition=cleaned.holistic_person_definition,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step3", response_model=Step3Response)
async def step3(req: Step3Request):
    """Create ATS and Intent rubrics from a cleaned job description."""
    try:
        cleaned = CleanedJobDescription(
            raw_text=req.job_description_raw,
            required_skills=req.required_skills,
            nice_to_have_skills=req.nice_to_have_skills,
            valued_qualities=req.valued_qualities,
            holistic_person_definition=req.holistic_person_definition,
        )
        ats_rubric, intent_rubric, knockout_rubric = step3_create_rubrics(cleaned)
        return Step3Response(
            ats_rubric=[_ats_rubric_item_out(r) for r in ats_rubric],
            intent_rubric=IntentRubricOut(
                items=[
                    IntentRubricItemOut(
                        rubric_id=i.rubric_id,
                        category=i.category,
                        description=i.description,
                        weight=i.weight,
                    )
                    for i in intent_rubric.items
                ],
                holistic_summary=intent_rubric.holistic_summary,
            ),
            knockout_rubric=[
                KnockoutItemOut(
                    item_id=k.item_id,
                    category=k.category,
                    requirement=k.requirement,
                )
                for k in knockout_rubric
            ],
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step4", response_model=Step4Response)
async def step4(req: Step4Request):
    """Vectorize ATS rubric, deduplicate, and find top-k matches."""
    try:
        ats_rubric = [_to_ats_rubric_item(r) for r in req.ats_rubric]
        activities = [_to_activity_bullet(a) for a in req.activities]
        ats_rubric, matches = step4_vectorize_and_match(ats_rubric, activities, req.top_k)

        matches_out: dict[str, list[VectorMatchOut]] = {}
        for rubric_id, vm_list in matches.items():
            matches_out[rubric_id] = [
                VectorMatchOut(
                    rubric_id=vm.rubric_id,
                    bullet_id=vm.bullet_id,
                    similarity_score=vm.similarity_score,
                )
                for vm in vm_list
            ]

        return Step4Response(
            ats_rubric=[_ats_rubric_item_out(r) for r in ats_rubric],
            matches=matches_out,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step5", response_model=Step5Response)
async def step5(req: Step5Request):
    """Generate STI statements for selected activity/rubric pairs in parallel."""
    try:
        ats_rubric = [_to_ats_rubric_item(r) for r in req.ats_rubric]
        activities = [_to_activity_bullet(a) for a in req.activities]
        activities_by_id = {a.bullet_id: a for a in activities}

        results, thinking = step5_generate_statements(
            ats_rubric=ats_rubric,
            activities_by_id=activities_by_id,
            selections=req.selections,
            holistic_person=req.holistic_person,
        )
        return Step5Response(
            statements=[
                StatementOut(
                    bullet_id=r["bullet_id"],
                    statement=r.get("statement", ""),
                    error=r.get("error"),
                    job_title=r.get("job_title", ""),
                    company=r.get("company", ""),
                    dates=r.get("dates", ""),
                    location=r.get("location", ""),
                    rubric_ids=r.get("rubric_ids", []),
                    rubric_items=r.get("rubric_items", []),
                    primary_rubric_id=r.get("primary_rubric_id", ""),
                    primary_rubric_item=r.get("primary_rubric_item", ""),
                    rewrite_logic=r.get("rewrite_logic", ""),
                )
                for r in results
            ],
            thinking=thinking,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step6", response_model=Step6Response)
async def step6(req: Step6Request):
    """Assemble STI statements into a full ATS-optimized resume."""
    try:
        template = ResumeTemplate(
            name=req.template.name,
            location=req.template.location,
            email=req.template.email,
            phone=req.template.phone,
            linkedin=req.template.linkedin,
            website=req.template.website,
            sections=req.template.sections,
            skills=req.template.skills,
            awards=req.template.awards,
            certifications=req.template.certifications,
            education=req.template.education,
        )
        # Convert StatementOut back to plain dicts for the pipeline function
        statements = [s.model_dump() for s in req.statements]

        ats_resume, thinking = step6_assemble_ats_resume(
            template=template,
            statements=statements,
            role_context=req.role_context,
            holistic_person=req.holistic_person,
            consolidated_skills=req.consolidated_skills or None,
        )
        return Step6Response(ats_resume=ats_resume, thinking=thinking)
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/step7", response_model=Step7Response)
async def step7(req: Step7Request):
    """Rewrite the ATS resume to align with intent rubric."""
    try:
        intent_rubric = _to_intent_rubric(req.intent_rubric)
        final, thinking = step7_intent_rewrite(
            ats_resume=req.ats_resume,
            intent_rubric=intent_rubric,
            ats_keywords=req.ats_keywords or None,
        )
        return Step7Response(final_resume=final, thinking=thinking)
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


class GenerateBulletRequest(BaseModel):
    rubric_item: ATSRubricItemOut
    activity: ActivityOut


class GenerateBulletResponse(BaseModel):
    statement: str


@router.post("/generate-bullet", response_model=GenerateBulletResponse)
async def generate_bullet(req: GenerateBulletRequest):
    """Generate a single resume bullet using Pro Gemini for a matched activity/rubric pair."""
    try:
        rubric = _to_ats_rubric_item(req.rubric_item)
        activity = _to_activity_bullet(req.activity)
        statement = generate_single_bullet(rubric, activity)
        return GenerateBulletResponse(statement=statement)
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
