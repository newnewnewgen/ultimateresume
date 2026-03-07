"""Data ingestion utilities for activity bank and resume template."""

from __future__ import annotations

import csv
import io
import json

from core.models import ActivityBullet, ResumeTemplate


def parse_activity_bank_csv(content: str) -> list[ActivityBullet]:
    """Parse a CSV string into ActivityBullet objects.

    Expected columns: bulletID, Situation, Action, Impact, JobTitle, Company, DatesWorked, Location
    """
    reader = csv.DictReader(io.StringIO(content))
    activities = []
    for row in reader:
        # Normalize column names (handle various casings)
        normalized = {k.strip().lower().replace(" ", ""): v.strip() for k, v in row.items()}

        activities.append(
            ActivityBullet(
                bullet_id=normalized.get("bulletid", ""),
                situation=normalized.get("situation", ""),
                action=normalized.get("action", ""),
                impact=normalized.get("impact", ""),
                job_title=normalized.get("jobtitle", ""),
                company=normalized.get("company", ""),
                dates_worked=normalized.get("datesworked", ""),
                location=normalized.get("location", ""),
            )
        )
    return activities


def parse_activity_bank_json(content: str) -> list[ActivityBullet]:
    """Parse a JSON string into ActivityBullet objects."""
    data = json.loads(content)
    if isinstance(data, dict):
        data = data.get("activities", data.get("bullets", [data]))
    activities = []
    for row in data:
        activities.append(
            ActivityBullet(
                bullet_id=str(row.get("bulletID", row.get("bullet_id", ""))),
                situation=row.get("Situation", row.get("situation", "")),
                action=row.get("Action", row.get("action", "")),
                impact=row.get("Impact", row.get("impact", "")),
                job_title=row.get("JobTitle", row.get("job_title", "")),
                company=row.get("Company", row.get("company", "")),
                dates_worked=row.get("DatesWorked", row.get("dates_worked", "")),
                location=row.get("Location", row.get("location", "")),
            )
        )
    return activities


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyPDF2."""
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def parse_resume_template_from_pdf(pdf_bytes: bytes) -> ResumeTemplate:
    """Parse a PDF resume into a ResumeTemplate by extracting text and using AI to analyze structure."""
    from core.ai_engine import parse_pdf_resume_template

    pdf_text = _extract_text_from_pdf(pdf_bytes)
    if not pdf_text.strip():
        raise ValueError("Could not extract any text from the PDF. The file may be image-based or corrupted.")

    data = parse_pdf_resume_template(pdf_text)

    return ResumeTemplate(
        name=data.get("name", ""),
        location=data.get("location", ""),
        email=data.get("email", ""),
        phone=data.get("phone", ""),
        linkedin=data.get("linkedin", ""),
        website=data.get("website", ""),
        sections=data.get("sections", ["experience", "skills", "projects", "education"]),
        raw_text=pdf_text,
    )


def parse_resume_template(content: str) -> ResumeTemplate:
    """Parse a resume template from plain text or JSON.

    Supports JSON format:
    {
        "name": "...", "location": "...", "email": "...", "phone": "...",
        "linkedin": "...", "website": "...",
        "sections": ["experience", "skills", "projects", "education"]
    }

    Or plain text where it extracts key-value pairs and section headers.
    """
    content = content.strip()

    # Try JSON first — but only if it actually looks like valid JSON
    if content.startswith("{"):
        try:
            data = json.loads(content)
            return ResumeTemplate(
                name=data.get("name", ""),
                location=data.get("location", ""),
                email=data.get("email", ""),
                phone=data.get("phone", ""),
                linkedin=data.get("linkedin", ""),
                website=data.get("website", ""),
                sections=data.get("sections", ["experience", "skills", "projects", "education"]),
                raw_text=content,
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass  # Fall through to plain text parsing

    # Plain text parsing
    template = ResumeTemplate(raw_text=content)
    lines = content.split("\n")

    known_sections = {
        "experience", "work experience", "professional experience",
        "skills", "technical skills", "core competencies",
        "projects", "personal projects",
        "education", "certifications",
        "summary", "professional summary", "objective",
    }

    found_sections = []
    for line in lines:
        stripped = line.strip().lower().rstrip(":")
        # Check for name (typically first non-empty line)
        if not template.name and stripped and stripped not in known_sections:
            template.name = line.strip()
            continue

        # Check for known field patterns
        lower = line.strip().lower()
        if "linkedin.com" in lower or "linkedin:" in lower:
            template.linkedin = line.strip().split(":", 1)[-1].strip() if ":" in line else line.strip()
        elif "@" in line and "." in line:
            template.email = line.strip().split(":", 1)[-1].strip() if ":" in line else line.strip()
        elif any(p in lower for p in ["phone:", "tel:", "cell:"]):
            template.phone = line.strip().split(":", 1)[-1].strip()
        elif any(p in lower for p in ["location:", "address:", "city:"]):
            template.location = line.strip().split(":", 1)[-1].strip()
        elif any(p in lower for p in ["website:", "portfolio:", "github:"]):
            template.website = line.strip().split(":", 1)[-1].strip()

        # Check for section headers
        if stripped in known_sections:
            # Normalize section names
            section_map = {
                "work experience": "experience",
                "professional experience": "experience",
                "technical skills": "skills",
                "core competencies": "skills",
                "personal projects": "projects",
                "professional summary": "summary",
                "objective": "summary",
            }
            normalized = section_map.get(stripped, stripped)
            if normalized not in found_sections:
                found_sections.append(normalized)

    if found_sections:
        template.sections = found_sections

    return template
