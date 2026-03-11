// ── Shared types ──────────────────────────────────────────────────────────────

export interface Activity {
  bullet_id: string;
  entry_type: string;
  situation: string;
  action: string;
  impact: string;
  job_title: string;
  company: string;
  dates_worked: string;
  location: string;
  extracted_skills: string[];
  vector?: number[];
}

export interface Education {
  school: string;
  degree: string;
  field_of_study: string;
  location: string;
  start_date: string;
  end_date: string;
  gpa: string;
  description: string;
  bullets: string[];
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
  education: Education[];
  skills: string[];
  awards: string[];
  certifications: string[];
  additional_sections: Record<string, string[]>;
  sections: string[];
  style_notes: string;
}

export interface ATSRubricItem {
  rubric_id: string;
  category: string;
  priority: string;
  item: string;
  ats_keywords: string[];
  situation_description: string;
  action_description: string;
}

export interface IntentRubricItem {
  rubric_id: string;
  category: string;
  description: string;
  weight: number;
}

export interface IntentRubric {
  items: IntentRubricItem[];
  holistic_summary: string;
}

export interface VectorMatch {
  rubric_id: string;
  bullet_id: string;
  similarity_score: number;
}

export interface Statement {
  bullet_id: string;
  statement: string;
  error: string | null;
  job_title: string;
  company: string;
  dates: string;
  location: string;
  entry_type?: string;
  rubric_ids: string[];
  rubric_items: string[];
  primary_rubric_id: string;
  primary_rubric_item: string;
  rewrite_logic: string;
}

export interface KnockoutItem {
  item_id: string;
  category: string;
  requirement: string;
}

export interface GeneratedBullet {
  statement: string;
  generating: boolean;
  error?: string;
  rubricId: string;
}

export interface ResumeTemplate {
  name: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  website: string;
  sections: string[];
}
