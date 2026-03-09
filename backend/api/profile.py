"""Profile endpoints — store and retrieve user profile data.

In this initial migration, profile data is passed directly in requests
(no database layer yet). Supabase persistence will be added in a later step.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.models import EducationEntry, UserProfile

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class EducationIn(BaseModel):
    school: str = ""
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    gpa: str = ""
    description: str = ""
    bullets: list[str] = []


class ProfileIn(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""
    summary: str = ""
    education: list[EducationIn] = []
    skills: list[str] = []
    awards: list[str] = []
    certifications: list[str] = []
    additional_sections: dict[str, list[str]] = {}
    sections: list[str] = ["summary", "experience", "education", "skills"]
    style_notes: str = ""


class ResumeTemplateOut(BaseModel):
    name: str
    location: str
    email: str
    phone: str
    linkedin: str
    website: str
    sections: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_user_profile(p: ProfileIn) -> UserProfile:
    return UserProfile(
        name=p.name,
        email=p.email,
        phone=p.phone,
        location=p.location,
        linkedin=p.linkedin,
        website=p.website,
        summary=p.summary,
        education=[
            EducationEntry(
                school=e.school,
                degree=e.degree,
                field_of_study=e.field_of_study,
                location=e.location,
                start_date=e.start_date,
                end_date=e.end_date,
                gpa=e.gpa,
                description=e.description,
                bullets=list(e.bullets),
            )
            for e in p.education
        ],
        skills=list(p.skills),
        awards=list(p.awards),
        certifications=list(p.certifications),
        additional_sections=dict(p.additional_sections),
        sections=list(p.sections),
        style_notes=p.style_notes,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/resume-template", response_model=ResumeTemplateOut)
async def get_resume_template(profile: ProfileIn):
    """Convert a full profile into the minimal resume template header fields."""
    try:
        user_profile = _to_user_profile(profile)
        template = user_profile.to_resume_template()
        return ResumeTemplateOut(
            name=template.name,
            location=template.location,
            email=template.email,
            phone=template.phone,
            linkedin=template.linkedin,
            website=template.website,
            sections=template.sections,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/validate", response_model=dict)
async def validate_profile(profile: ProfileIn):
    """Validate a profile and return a list of any missing required fields."""
    missing = []
    if not profile.name.strip():
        missing.append("name")
    if not profile.email.strip():
        missing.append("email")

    return {
        "valid": len(missing) == 0,
        "missing_fields": missing,
    }
