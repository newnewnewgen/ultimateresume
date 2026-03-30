"""Ingest endpoints — parse uploaded resume or activity bank files."""

import asyncio

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from core.ingest import (
    parse_activity_bank_csv,
    parse_activity_bank_json,
    parse_full_resume,
)

router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────────

class ActivityOut(BaseModel):
    bullet_id: str
    entry_type: str
    situation: str
    action: str
    impact: str
    job_title: str
    company: str
    dates_worked: str
    location: str


class EducationOut(BaseModel):
    school: str
    degree: str
    field_of_study: str
    location: str
    start_date: str
    end_date: str
    gpa: str
    description: str
    bullets: list[str]


class ProfileOut(BaseModel):
    name: str
    email: str
    phone: str
    location: str
    linkedin: str
    website: str
    summary: str
    education: list[EducationOut]
    skills: list[str]
    awards: list[str]
    certifications: list[str]
    additional_sections: dict[str, list[str]]
    sections: list[str]
    style_notes: str


class ParseResumeResponse(BaseModel):
    profile: ProfileOut
    activities: list[ActivityOut]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _activity_out(a) -> ActivityOut:
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
    )


def _profile_out(p) -> ProfileOut:
    return ProfileOut(
        name=p.name,
        email=p.email,
        phone=p.phone,
        location=p.location,
        linkedin=p.linkedin,
        website=p.website,
        summary=p.summary,
        education=[
            EducationOut(
                school=e.school,
                degree=e.degree,
                field_of_study=e.field_of_study,
                location=e.location,
                start_date=e.start_date,
                end_date=e.end_date,
                gpa=e.gpa,
                description=e.description,
                bullets=e.bullets,
            )
            for e in p.education
        ],
        skills=p.skills,
        awards=p.awards,
        certifications=p.certifications,
        additional_sections=p.additional_sections,
        sections=p.sections,
        style_notes=p.style_notes,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/resume", response_model=ParseResumeResponse)
async def parse_resume(file: UploadFile = File(...)):
    """Parse a PDF or DOCX resume into profile + activity bank."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    contents = await file.read()
    try:
        profile, activities, _style_notes = await asyncio.to_thread(parse_full_resume, contents, file.filename)
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc
    return ParseResumeResponse(
        profile=_profile_out(profile),
        activities=[_activity_out(a) for a in activities],
    )


@router.post("/activity-bank", response_model=list[ActivityOut])
async def parse_activity_bank(file: UploadFile = File(...)):
    """Parse a CSV or JSON activity bank file."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    contents = (await file.read()).decode("utf-8")
    try:
        if file.filename.endswith(".json"):
            activities = parse_activity_bank_json(contents)
        else:
            activities = parse_activity_bank_csv(contents)
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc
    return [_activity_out(a) for a in activities]
