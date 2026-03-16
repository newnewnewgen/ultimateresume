"""Data models for the AI Resume Writer pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ActivityBullet:
    """A single job activity from the user's activity bank."""

    bullet_id: str
    situation: str
    action: str
    impact: str
    job_title: str
    company: str
    dates_worked: str
    location: str
    entry_type: str = "work"
    vector: list[float] = field(default_factory=list)
    extracted_skills: list[str] = field(default_factory=list)  # AI-extracted skills/technologies

    @property
    def combined_text(self) -> str:
        parts = []
        if self.situation:
            parts.append(f"Situation: {self.situation}")
        if self.action:
            parts.append(f"Action: {self.action}")
        if self.impact:
            parts.append(f"Impact: {self.impact}")
        return ". ".join(parts)


@dataclass
class EducationEntry:
    """A single education record."""
    school: str = ""
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    gpa: str = ""
    description: str = ""
    bullets: list[str] = field(default_factory=list)


@dataclass
class UserProfile:
    """Complete user profile — replaces ResumeTemplate as the primary data store."""
    # Contact
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""
    summary: str = ""
    # Education
    education: list[EducationEntry] = field(default_factory=list)
    # Other content
    skills: list[str] = field(default_factory=list)
    awards: list[str] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)
    additional_sections: dict[str, list[str]] = field(default_factory=dict)
    # Formatting
    sections: list[str] = field(default_factory=lambda: ["summary", "experience", "education", "skills"])
    latex_template: str = ""
    style_notes: str = ""

    def to_resume_template(self) -> "ResumeTemplate":
        return ResumeTemplate(
            name=self.name,
            location=self.location,
            email=self.email,
            phone=self.phone,
            linkedin=self.linkedin,
            website=self.website,
            sections=self.sections,
        )


@dataclass
class ResumeTemplate:
    """Parsed resume template with structural information."""

    name: str = ""
    location: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    summary_section: bool = True
    sections: list[str] = field(default_factory=lambda: ["experience", "skills", "projects", "education"])
    raw_text: str = ""
    skills: list[str] = field(default_factory=list)
    awards: list[str] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)
    education: list[dict] = field(default_factory=list)


@dataclass
class CleanedJobDescription:
    """AI-cleaned and structured job description."""

    raw_text: str = ""
    required_skills: list[str] = field(default_factory=list)
    nice_to_have_skills: list[str] = field(default_factory=list)
    valued_qualities: list[str] = field(default_factory=list)
    holistic_person_definition: str = ""


@dataclass
class ATSRubricItem:
    """A single item in the ATS scoring rubric."""

    rubric_id: str = ""
    category: str = ""  # technical_skill, soft_skill, domain_knowledge, tool_platform, methodology
    priority: str = "important"  # critical, important, nice_to_have
    item: str = ""  # concise skill group label
    ats_keywords: list[str] = field(default_factory=list)  # all ATS-scannable keywords in this group
    situation_description: str = ""  # task framing
    action_description: str = ""  # ways to accomplish
    vector: list[float] = field(default_factory=list)
    matched_bullet_ids: list[str] = field(default_factory=list)  # user-chosen matches
    generated_statement: str = ""  # AI-written S-T-I


@dataclass
class IntentRubricItem:
    """A single item in the Intent scoring rubric."""

    rubric_id: str = ""
    category: str = ""  # culture_add, experience_match, skill_match, growth, motivation, jargon
    description: str = ""
    weight: float = 1.0


@dataclass
class IntentRubric:
    """The full intent scoring rubric."""

    items: list[IntentRubricItem] = field(default_factory=list)
    holistic_summary: str = ""


@dataclass
class VectorMatch:
    """A candidate match between a rubric vector and an activity bank vector."""

    rubric_id: str
    bullet_id: str
    similarity_score: float
    activity: Optional[ActivityBullet] = None
    match_reason: str = ""


@dataclass
class ResumeSection:
    """A section of the generated resume."""

    section_name: str
    entries: list[ResumeEntry] = field(default_factory=list)


@dataclass
class ResumeEntry:
    """A single entry within a resume section."""

    job_title: str = ""
    company: str = ""
    dates: str = ""
    location: str = ""
    bullets: list[str] = field(default_factory=list)


@dataclass
class GeneratedResume:
    """The fully generated resume."""

    header: ResumeTemplate = field(default_factory=ResumeTemplate)
    sections: list[ResumeSection] = field(default_factory=list)
    ats_version_text: str = ""
    intent_version_text: str = ""
    final_version_text: str = ""


@dataclass
class KnockoutItem:
    """A hard knockout requirement from the job description."""
    item_id: str = ""
    category: str = "other"  # education, experience, location, certification, other
    requirement: str = ""


@dataclass
class PipelineState:
    """Full state of the resume generation pipeline."""

    activity_bank: list[ActivityBullet] = field(default_factory=list)
    resume_template: Optional[ResumeTemplate] = None
    job_description_raw: str = ""
    cleaned_jd: Optional[CleanedJobDescription] = None
    ats_rubric: list[ATSRubricItem] = field(default_factory=list)
    intent_rubric: Optional[IntentRubric] = None
    vector_matches: dict[str, list[VectorMatch]] = field(default_factory=dict)
    generated_resume: Optional[GeneratedResume] = None
    current_step: int = 0
