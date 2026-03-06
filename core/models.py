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
    vector: list[float] = field(default_factory=list)

    @property
    def combined_text(self) -> str:
        return f"{self.situation} {self.action} {self.impact}"


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
    category: str = ""  # e.g. "key_skill", "key_word", "key_phrase"
    item: str = ""
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
