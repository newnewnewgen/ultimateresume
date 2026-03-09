/**
 * Typed API client for the FastAPI backend.
 * All functions throw on non-2xx responses.
 */

import type {
  Activity,
  ATSRubricItem,
  IntentRubric,
  Profile,
  ResumeTemplate,
  Statement,
  VectorMatch,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function parseResume(
  file: File
): Promise<{ profile: Profile; activities: Activity[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/ingest/resume`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function parseActivityBank(file: File): Promise<Activity[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/ingest/activity-bank`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Pipeline steps ────────────────────────────────────────────────────────────

export async function step1VectorizeActivities(
  activities: Activity[]
): Promise<{ activities: Activity[] }> {
  return apiFetch("/api/pipeline/step1", {
    method: "POST",
    body: JSON.stringify({ activities }),
  });
}

export async function step2AnalyzeJD(jobDescription: string): Promise<{
  required_skills: string[];
  nice_to_have_skills: string[];
  valued_qualities: string[];
  holistic_person_definition: string;
}> {
  return apiFetch("/api/pipeline/step2", {
    method: "POST",
    body: JSON.stringify({ job_description: jobDescription }),
  });
}

export async function step3CreateRubrics(jdAnalysis: {
  required_skills: string[];
  nice_to_have_skills: string[];
  valued_qualities: string[];
  holistic_person_definition: string;
}): Promise<{ ats_rubric: ATSRubricItem[]; intent_rubric: IntentRubric }> {
  return apiFetch("/api/pipeline/step3", {
    method: "POST",
    body: JSON.stringify(jdAnalysis),
  });
}

export async function step4MatchActivities(
  atsRubric: ATSRubricItem[],
  activities: Activity[],
  topK = 5
): Promise<{
  ats_rubric: ATSRubricItem[];
  matches: Record<string, VectorMatch[]>;
}> {
  return apiFetch("/api/pipeline/step4", {
    method: "POST",
    body: JSON.stringify({ ats_rubric: atsRubric, activities, top_k: topK }),
  });
}

export async function step5GenerateStatements(
  atsRubric: ATSRubricItem[],
  activities: Activity[],
  selections: Record<string, string[]>,
  holisticPerson = ""
): Promise<{ statements: Statement[] }> {
  return apiFetch("/api/pipeline/step5", {
    method: "POST",
    body: JSON.stringify({
      ats_rubric: atsRubric,
      activities,
      selections,
      holistic_person: holisticPerson,
    }),
  });
}

export async function step6AssembleResume(
  template: ResumeTemplate,
  statements: Statement[],
  roleContext = "",
  holisticPerson = "",
  consolidatedSkills: string[] = []
): Promise<{ ats_resume: string }> {
  return apiFetch("/api/pipeline/step6", {
    method: "POST",
    body: JSON.stringify({
      template,
      statements,
      role_context: roleContext,
      holistic_person: holisticPerson,
      consolidated_skills: consolidatedSkills,
    }),
  });
}

export async function step7IntentRewrite(
  atsResume: string,
  intentRubric: IntentRubric,
  atsKeywords: string[] = []
): Promise<{ final_resume: string }> {
  return apiFetch("/api/pipeline/step7", {
    method: "POST",
    body: JSON.stringify({
      ats_resume: atsResume,
      intent_rubric: intentRubric,
      ats_keywords: atsKeywords,
    }),
  });
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getResumeTemplate(
  profile: Profile
): Promise<ResumeTemplate> {
  return apiFetch("/api/profile/resume-template", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function validateProfile(
  profile: Profile
): Promise<{ valid: boolean; missing_fields: string[] }> {
  return apiFetch("/api/profile/validate", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

// ── Design ────────────────────────────────────────────────────────────────────

export async function generateLatexTemplate(
  styleSpec: string,
  profile: Pick<Profile, "name" | "email" | "phone" | "location" | "linkedin" | "website">,
  sections: string[]
): Promise<{ latex: string }> {
  return apiFetch("/api/design/generate-template", {
    method: "POST",
    body: JSON.stringify({ style_spec: styleSpec, profile, sections }),
  });
}

export async function editLatexTemplate(
  latex: string,
  instruction: string
): Promise<{ latex: string }> {
  return apiFetch("/api/design/edit-template", {
    method: "POST",
    body: JSON.stringify({ latex, instruction }),
  });
}

export async function assembleLatexResume(
  latexTemplate: string,
  resumeText: string,
  profile: Pick<Profile, "name" | "email" | "phone" | "location" | "linkedin" | "website">
): Promise<{ latex: string }> {
  return apiFetch("/api/design/assemble-latex", {
    method: "POST",
    body: JSON.stringify({
      latex_template: latexTemplate,
      resume_text: resumeText,
      profile,
    }),
  });
}
