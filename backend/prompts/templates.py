"""All AI prompt templates for the resume writer pipeline."""

CLEAN_JOB_DESCRIPTION = """\
You are an expert recruiter and hiring analyst. Analyze the following job description
and extract structured information.

JOB DESCRIPTION:
{job_description}

Return your analysis in EXACTLY this JSON format (no extra text):
{{
  "required_skills": ["skill1", "skill2", ...],
  "nice_to_have_skills": ["skill1", "skill2", ...],
  "valued_qualities": ["quality1", "quality2", ...],
  "holistic_person_definition": "A 2-3 sentence description of the ideal candidate as a whole person"
}}

Be thorough - extract every skill, technology, experience requirement, and personal quality mentioned.
Distinguish clearly between hard requirements and nice-to-haves.
"""

CREATE_ATS_RUBRIC = """\
You are an expert ATS (Applicant Tracking System) analyst. Create a focused, keyword-driven ATS
scoring rubric from the job description below.

RAW JOB DESCRIPTION (primary source of truth):
---
{job_description_raw}
---

PRE-EXTRACTED SKILLS (starting checklist — derive specificity from the raw JD above):
  Required: {required_skills}
  Nice-to-have: {nice_to_have_skills}
  Valued qualities: {valued_qualities}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT BELONGS IN THIS RUBRIC (ATS = keyword matching):
  ✓ Specific tools, platforms, languages, frameworks
  ✓ Technical methodologies (CI/CD, TDD, microservices, agile, etc.)
  ✓ Domain-specific practices (A/B testing, financial modeling, HIPAA compliance, etc.)
  ✓ Concrete deliverables (API design, data pipelines, product roadmaps, etc.)
  ✓ Measurable processes (query optimization, load testing, cost reduction, etc.)
  ✓ Industry certifications, standards, or compliance frameworks (SOC 2, PMP, HIPAA, etc.)

WHAT DOES NOT BELONG — HARD EXCLUSIONS:
  ✗ Education requirements: "Bachelor's degree", "accredited university", "MBA", "B.S. in X"
    → These go in the Knockout rubric, NOT here.
  ✗ Years-of-experience thresholds: "1-3 years", "5+ years", "minimum X years of experience"
    → These go in the Knockout rubric, NOT here.
  ✗ Soft skills: creativity, adaptability, "innovative thinking", problem-solving mindset,
    communication, collaboration, leadership presence, work ethic, passion, curiosity,
    "ownership mindset", "growth mindset", "reinventing what is possible", "making an impact",
    "thriving in ambiguity", "constantly evolving environment", "cross-functional teamwork"
  ✗ Mission / culture / philosophy phrases: anything from a "we believe…" or "we value…"
    company boilerplate section — these describe sentiment, not searchable skills
  ✗ Anything vague enough that any resume would contain it (e.g., "problem solving", "results")
  ✗ Any item where you cannot quote 2+ exact keyword strings directly from resume-bullet-style
    text in the JD — if the JD only describes it in a "culture" or "about us" paragraph, skip it

HARD REJECT TEST (apply to every item before including it):
  1. Would this keyword appear in an actual resume bullet point (not in an education section
     or tenure statement)? → If NO → do not include this item.
  2. Can I quote at least 2 specific searchable strings verbatim from the JD for this item?
     → If NO → do not include this item.
  3. Is this a soft skill, culture phrase, education requirement, or years-of-experience threshold?
     → If YES → do not include this item, period.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
1. Every rubric item must pass all three HARD REJECT TESTS above before being included.
   When in doubt, omit. A rubric with 8 tight items beats one with 14 that includes soft skills.
2. Break broad categories into specific skills. Examples:
   BAD:  "Product Management Experience (3+ years)"
   GOOD: THREE separate items — "Product Roadmap & Prioritization", "User Story & Requirements Writing",
         "Go-to-Market & Launch Execution" — each with its own tight keyword list.
   BAD:  "Data Experience"
   GOOD: "SQL & Relational Databases", "Data Pipeline Engineering (Spark, Airflow)", "BI & Analytics
         Tooling (Tableau, Looker, dbt)" — depending on what the JD actually specifies.
3. GROUP only when skills are truly synonymous or always co-occur:
   - "Docker" + "Kubernetes" + "containerization" → ONE item
   - "React" + "Vue" + "Angular" (JD lists alternatives) → ONE item
   - Do NOT group unlike things just to reduce item count.
4. Each item must represent a DISTINCT skill cluster — no two items should match the same resume bullet.
5. Assign priority from JD language:
   - "critical": explicitly required / must-have
   - "important": strongly preferred or clearly implied
   - "nice_to_have": bonus / differentiator
6. "ats_keywords" — EXACT verbatim strings copied from the job posting ONLY.
   Do NOT paraphrase. Do NOT add synonyms or practitioner variants. Do NOT add related tools
   not mentioned in the posting. Copy the exact text the posting uses.
   If the JD says "CI/CD", write "CI/CD" — not "continuous deployment" or "Jenkins".
   If the JD says "React.js", write "React.js" — not "React" or "ReactJS".
   Target 2–5 keywords per item.
   KEYWORD BUDGET: The total ats_keywords count across ALL rubric items combined must be 25–35.
   Budget accordingly — allocate more keywords to critical items, fewer to nice-to-have items.
7. situation_description: the real business problem this skill solves, from JD context.
   action_description: concrete practitioner actions that demonstrate this skill.

Return EXACTLY this JSON format (no extra text):
{{
  "rubric_items": [
    {{
      "rubric_id": "ATS-001",
      "category": "technical_skill|domain_knowledge|tool_platform|methodology",
      "priority": "critical|important|nice_to_have",
      "item": "Specific, concrete skill cluster derived from JD (never a soft skill or broad bucket)",
      "ats_keywords": ["exact JD term 1", "exact JD term 2", "exact JD term 3"],
      "situation_description": "The concrete business challenge from the JD requiring this skill",
      "action_description": "Specific practitioner actions that demonstrate competency"
    }},
    ...
  ]
}}

Aim for 8–14 DISTINCT items. Prefer specificity over breadth — it is better to have 10 tight
items than 6 broad ones. Omit "soft_skill" from category entirely.
Remember: 25–35 total keywords across ALL items. Quality over quantity.
"""

CREATE_INTENT_RUBRIC = """\
You are an expert hiring consultant who deeply understands what hiring managers
actually want beyond keyword matching. Based on this job description data, create
an Intent Scoring Rubric that captures the TRUE intent of the hiring manager.

REQUIRED SKILLS: {required_skills}
NICE-TO-HAVE SKILLS: {nice_to_have_skills}
VALUED QUALITIES: {valued_qualities}
HOLISTIC PERSON: {holistic_person}

Create rubric items across these categories:
- culture_add: How the candidate adds to company culture
- experience_match: Holistic experience alignment (not just keywords)
- skill_match: Deep skill alignment beyond surface-level matching
- growth_potential: Indicators of learning ability and career trajectory
- motivation_passion: Signs of genuine interest and drive
- domain_jargon: Appropriate use of industry/domain language

Return EXACTLY this JSON format (no extra text):
{{
  "holistic_summary": "2-3 sentences defining the ideal candidate holistically",
  "items": [
    {{
      "rubric_id": "INT-001",
      "category": "culture_add|experience_match|skill_match|growth_potential|motivation_passion|domain_jargon",
      "description": "What the hiring manager is really looking for",
      "weight": 1.0
    }},
    ...
  ]
}}

Produce 10-20 intent rubric items. Assign weights from 0.5 (nice-to-have) to 2.0 (critical).
"""

WRITE_STI_STATEMENT = """\
You are a resume writer. Using the job activity below, write a clear, grounded resume
bullet point that demonstrates the target skill(s).

PRIMARY SKILL/REQUIREMENT:
  Item: {rubric_item}
  ATS Keywords to incorporate: {ats_keywords}
  Situation Context: {situation_desc}
  Action Context: {action_desc}
{secondary_rubric_context}
IDEAL CANDIDATE PROFILE:
  {holistic_person}

SOURCE ACTIVITY:
  Original Situation: {original_situation}
  Original Action: {original_action}
  Original Impact: {original_impact}
  Job Title: {job_title}
  Company: {company}
  Verified Skills/Technologies: {extracted_skills}

Write a single resume bullet point. Rules:
1. Start with a plain, specific action verb describing what the person actually did
   (e.g., "Built", "Analyzed", "Led", "Audited", "Collaborated", "Deployed", "Trained")
2. Do NOT use abstract or inflated openers: no "Catalyzed", "Leveraged", "Spearheaded",
   "Championed", "Harnessed", "Applied X principles to", or similar marketing language
3. Do NOT reference credentials, degrees, or academic background as the source of the action
   (e.g., NEVER write "Leveraged a technical degree to..." or "Applied business strategy to...")
4. Inject ATS keywords by weaving them naturally into the bullet. Use the EXACT string
   from the job posting — not synonyms, not abbreviations (unless the posting itself uses
   them). 'Adobe Creative Cloud' and 'Adobe Creative Suite' are different strings to an
   ATS parser. 'CI/CD' is not the same as 'continuous deployment'. Match the posting exactly.
5. Use only the verified skills/technologies listed — do not invent tools or methods
   not present in the source activity
6. Keep the core truth of the original activity — do NOT fabricate accomplishments
7. Quantify impact where the original provides numbers; do not invent metrics
8. Keep it to 1-2 lines maximum — simple, clear, and technical
9. Write plainly — it should sound like a competent professional describing their work,
   not a copywriter trying to impress

Return ONLY the bullet point text, nothing else.
"""

DEDUP_BULLETS = """\
You are a resume editor. Below is a list of resume bullet points that were written
independently and may contain repeated action verbs or very similar phrasing.

BULLETS:
{bullets_json}

Your task:
1. Identify any bullets that share the same opening action verb as another bullet
2. For those bullets ONLY, rewrite the opening verb to a different plain verb that
   still accurately describes the action (e.g., swap "Led" for "Managed", "Built" for "Developed")
3. Do NOT change anything else — keep the rest of each bullet exactly as written
4. If two bullets have no repetition issues, return them VERBATIM — do not touch them
5. Do NOT add words, remove words, or reframe any bullet beyond changing the one opening verb

Return EXACTLY this JSON format (no extra text):
{{
  "bullets": [
    {{"id": "...", "text": "..."}},
    ...
  ]
}}

Return ALL bullets in the same order, whether changed or not.
"""

ASSEMBLE_RESUME = """\
You are an expert resume formatter. Your job is to arrange pre-written content into a
complete, professional resume. You are a FORMATTER, not a writer — do not invent
any new bullets, job titles, companies, or accomplishments.

TARGET ROLE CONTEXT (for skills ordering only):
  {role_context}

TEMPLATE STRUCTURE:
  Name: {name}
  Location: {location}
  Email: {email}
  Phone: {phone}
  LinkedIn: {linkedin}
  Website: {website}
  Sections: {sections}

CONSOLIDATED SKILLS (extracted from selected activities + user profile):
{skills_list}

EDUCATION DATA:
{education_block}

AWARDS:
{awards_list}

CERTIFICATIONS:
{certifications_list}

═══════════════════════════════════════════════════════════
PRE-GROUPED WORK HISTORY — COPY THESE BULLETS VERBATIM
Do NOT rewrite, shorten, or replace any bullet. Do NOT add
bullets not listed here. Each role and its bullets are final.
═══════════════════════════════════════════════════════════
{work_history_block}
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
PRE-GROUPED PROJECT HISTORY — COPY THESE BULLETS VERBATIM
Same rules: no rewrites, no additions.
═══════════════════════════════════════════════════════════
{project_history_block}
═══════════════════════════════════════════════════════════

FORMATTING RULES:
1. Output the experience section using EXACTLY the roles and bullets from WORK HISTORY — no additions, no omissions, no rewording
2. Output the projects section using EXACTLY the entries and bullets from PROJECT HISTORY — same rules
3. Order sections to match: {sections}
4. Order jobs/projects reverse-chronologically (most recent first)
5. For the skills section: select the most relevant hard technical skills from CONSOLIDATED SKILLS; group into at most 4 categories (e.g. Languages, Frameworks, Tools, Cloud/Infra); include at most 6–8 skills per category; omit generic soft skills (communication, leadership, teamwork, etc.)
6. Do NOT fabricate any content — all bullets come from the pre-grouped blocks above
7. OMIT any section entirely (no header, no blank line) if it has no content to show

Return the resume as clean, formatted plain text ready for a document.

Use EXACTLY this structure:

{name}
{location} | {email} | {phone}
{linkedin} | {website}

For each section in [{sections}], output a section header in ALL CAPS followed by its content:

- summary → OMIT entirely. Do not write a summary under any circumstances.
- experience → Copy EVERY role and bullet from the PRE-GROUPED WORK HISTORY block, verbatim. If WORK HISTORY is "None", OMIT this section.
- projects → Copy EVERY project and bullet from the PRE-GROUPED PROJECT HISTORY block, verbatim. If PROJECT HISTORY is "None", OMIT this section entirely (no header).
- education → Format and output every entry from EDUCATION DATA. If empty, OMIT this section.
- skills → Organize the most relevant hard skills from CONSOLIDATED SKILLS (max 4 categories, max 6–8 per category). If empty, OMIT this section.
- awards → List each award from AWARDS. If "None", OMIT this section.
- certifications → List each certification from CERTIFICATIONS. If "None", OMIT this section.
- For any other section → OMIT (output nothing).

CRITICAL: The experience section MUST contain all role headers and bullets from the PRE-GROUPED WORK HISTORY block. Do not output an empty experience section.
"""

INTENT_REWRITE = """\
You are a precise resume editor. You have a resume that already passes ATS keyword
matching. Your job is to make MINIMAL, SURGICAL edits to better align it with the
hiring manager's true intent — without changing the voice, structure, or substance.

CURRENT ATS-OPTIMIZED RESUME:
{ats_resume}

ATS KEYWORD CHECKLIST (these must appear in the final resume — most already do):
{ats_keyword_checklist}

INTENT SCORING RUBRIC:
{intent_rubric}

HOLISTIC IDEAL CANDIDATE:
{holistic_summary}

EDITING RULES — READ CAREFULLY:
1. Make the SMALLEST possible change that achieves alignment. If a bullet already implies
   something, do NOT add it explicitly — it is already there.
2. Prefer single-word or short-phrase swaps over restructuring entire sentences.
3. Do NOT expand bullet length significantly. If a bullet is one line, keep it one line.
4. Do NOT add concepts, claims, or qualities that aren't in the original text. "Implied"
   does not mean "missing" — leave implied things implied.
5. Do NOT add flowery marketing language or abstract leadership claims (e.g., "embedded a
   culture of...", "championed a vision of...") unless the original explicitly says so.
6. For missing ATS keywords that genuinely aren't covered: insert them naturally into an
   existing bullet where they fit — do not create new bullets or rewrite entire sections.
7. Preserve the candidate's natural voice. The output should read like the same person wrote it.
9. If a bullet is already well-aligned, copy it VERBATIM. Most bullets should be unchanged.

Return the COMPLETE resume as formatted plain text, with only the minimal edits applied.
"""

POLISH_RESUME = """\
You are an expert resume editor. You have a complete, ATS-optimized resume and a specific
instruction from the user. Apply the instruction precisely and return the full polished resume.

CURRENT RESUME:
{resume_text}

USER INSTRUCTION:
{instruction}

RULES:
1. Apply ONLY what the instruction asks — do not make unrequested changes.
2. Preserve the exact formatting: ALL CAPS section headers, role | company | dates | location lines,
   bullet points starting with •, and blank lines between sections.
3. Do NOT fabricate new accomplishments, job titles, companies, or dates.
4. Do NOT add sections that aren't already present.
5. If the instruction asks to improve language or tighten bullets, do so conservatively.
6. Keep the candidate's natural voice — no flowery marketing language.

Return the COMPLETE resume as formatted plain text with only the requested changes applied.
"""

EXTRACT_ACTIVITY_SKILLS = """\
You are an expert resume analyst. For each job activity below, extract ALL skills,
technologies, tools, methodologies, and competencies demonstrated.

ACTIVITIES:
{activities_json}

For each activity, extract:
- Hard skills: specific technologies, tools, programming languages, frameworks, platforms
- Methodologies: Agile, CI/CD, TDD, microservices, etc.
- Soft skills: leadership, communication, mentoring, cross-functional collaboration, etc.
- Domain knowledge: fintech, healthcare, e-commerce, data engineering, etc.

Include BOTH the explicit terms used AND common synonyms/aliases. For example:
- If they say "container orchestration" → also include "Kubernetes", "Docker"
- If they say "automated testing" → also include "CI/CD", "test automation"
- If they say "led a team" → include "leadership", "team management", "mentoring"

Return EXACTLY this JSON format (no extra text):
{{
  "activities": [
    {{
      "bullet_id": "the bullet ID",
      "skills": ["skill1", "skill2", "skill3", ...]
    }},
    ...
  ]
}}

Be thorough — extract every skill signal, even implied ones. Include 5-15 skills per activity.
"""

PARSE_PDF_RESUME_TEMPLATE = """\
You are an expert resume analyst. You have been given the extracted text from a PDF resume.
Analyze its structure and extract the template information.

EXTRACTED TEXT:
{pdf_text}

Identify:
1. The person's name (usually the largest text at the top)
2. Contact information: email, phone, location, LinkedIn URL, website/portfolio
3. The section headers used in this resume and their order (e.g., Experience, Skills, Education, Projects, Summary)
4. The general formatting style (how sections are structured)

Return EXACTLY this JSON format (no extra text):
{{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number",
  "location": "City, State",
  "linkedin": "linkedin url or empty string",
  "website": "website url or empty string",
  "sections": ["section1", "section2", "section3"],
  "formatting_notes": "Brief description of the resume's formatting style"
}}

For sections, normalize names: use "experience" (not "Work Experience"), "skills" (not "Technical Skills"),
"education", "projects", "summary", "certifications", etc.
"""

PARSE_RESUME_TO_ACTIVITY_BANK = """\
You are an expert resume analyst. You have been given the extracted text from a PDF resume.
Your job is to decompose every work experience bullet point into structured Situation-Action-Impact
(S-A-I) entries that can be used as a job activity bank.

EXTRACTED RESUME TEXT:
{pdf_text}

For each role in the work experience section, find every bullet point or accomplishment and
decompose it into three parts:
- Situation: The context, challenge, or goal that prompted this work. What problem existed,
  or what needed to be done? (1-2 sentences inferred from the bullet)
- Action: What the person specifically did — the concrete steps, tools used, or methods applied.
  Use the exact technologies/tools mentioned in the bullet. (1-2 sentences)
- Impact: The outcome or result — quantified if numbers are present, qualitative if not.
  If no impact is stated, describe the business value delivered. (1 sentence)

If a bullet is already very detailed, split its content accurately across S, A, I.
If a bullet is sparse (e.g., just "Built a dashboard"), infer reasonable Situation and Impact
from the role and company context — but do NOT fabricate specific metrics or tools not stated.

Also extract for each role:
- job_title: The person's title at that role
- company: Company name
- dates_worked: Employment dates as written (e.g., "Jan 2021 – Mar 2023")
- location: City, State or "Remote" if specified; empty string if not mentioned

Skip bullets that are not accomplishments (e.g., generic responsibility statements with no
specific action or outcome, like "Responsible for team communication").

Return EXACTLY this JSON format (no extra text):
{{
  "activities": [
    {{
      "situation": "...",
      "action": "...",
      "impact": "...",
      "job_title": "...",
      "company": "...",
      "dates_worked": "...",
      "location": "..."
    }},
    ...
  ]
}}

Return ALL activities across ALL roles. Order them as they appear in the resume (most recent first).
"""

PARSE_RESUME_FULL = """\
You are an expert resume analyst. Parse the following resume text into structured data.
Extract EVERYTHING — contact info, all work experience and other activities, education,
skills, awards, and also note the visual formatting style.

RESUME TEXT:
{resume_text}

Return EXACTLY this JSON format (no extra text):
{{
  "profile": {{
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "phone number",
    "location": "City, State",
    "linkedin": "linkedin URL or empty string",
    "website": "website URL or empty string",
    "summary": "professional summary/objective if present, else empty string",
    "skills": ["skill1", "skill2"],
    "awards": ["award1", "award2"],
    "certifications": ["cert1", "cert2"],
    "sections": ["experience", "education", "skills"]
  }},
  "education": [
    {{
      "school": "University Name",
      "degree": "B.S., M.S., Ph.D., etc.",
      "field_of_study": "Computer Science",
      "location": "City, State or empty",
      "start_date": "2018",
      "end_date": "2022",
      "gpa": "3.8 or empty",
      "description": "honors, relevant coursework, or empty",
      "bullets": ["relevant coursework: ...", "honors: ..."]
    }}
  ],
  "activities": [
    {{
      "entry_type": "work|project|competition|volunteering|other",
      "title": "Job Title / Project Name / Competition Name",
      "organization": "Company / Event / Organization name",
      "dates": "Jan 2021 – Mar 2023",
      "location": "City, State or Remote or empty",
      "situation": "Context or challenge that prompted this work (1-2 sentences inferred from bullet)",
      "action": "What the person specifically did, including tools/technologies used",
      "impact": "Outcome or result — quantified if numbers present, qualitative if not"
    }}
  ],
  "style_notes": "Detailed description of visual design for LaTeX replication: font family (serif/sans-serif), approximate font size, layout (single/two-column), section separator style (lines/none/bold), header style, bullet style, spacing, any distinctive design choices"
}}

For activities:
- Decompose EACH bullet point in the work/project/volunteer experience sections into S-A-I format
- For entry_type: use "work" for jobs, "project" for personal/academic projects, "competition" for hackathons/contests, "volunteering" for volunteer work, "other" for anything else
- Do NOT include education bullets here — put them in the education array
- If a bullet is sparse, infer reasonable Situation and Impact from context — but do NOT fabricate specific metrics or tools not stated

For style_notes: be specific and detailed so a LaTeX expert could recreate the look.
"""

GENERATE_LATEX_TEMPLATE = """\
You are an expert LaTeX typesetter. Generate a complete, compilable LaTeX resume template
using the style specifications below. Use lorem ipsum placeholder text for ALL content —
this is a design preview only.

STYLE SPECIFICATION:
{style_spec}

USER INFO (use for header only — lorem ipsum everywhere else):
Name: {name}
Email: {email}
Phone: {phone}
Location: {location}
LinkedIn: {linkedin}
Website: {website}

SECTIONS TO INCLUDE: {sections}

Rules:
1. Output ONLY the complete LaTeX source — no explanation, no markdown, no code fences
2. The document must compile with pdflatex
3. Use standard LaTeX packages only (geometry, fontenc, inputenc, hyperref, enumitem, titlesec, xcolor, multicol if needed)
4. For experience entries: show 2-3 lorem ipsum bullet points per role
5. For skills: show categorized lorem ipsum skill lists
6. For education: show 1-2 lorem ipsum entries
7. The visual output should match the style specification as closely as possible
8. Make it look like a real, professional resume — not a template skeleton
9. Margins should be appropriate (typically 0.5–1 inch)
10. Keep it to 1 page if possible given the section count

Common style presets for reference:
- "Modern Minimal": \\usepackage[default]{{lato}} or similar sans-serif, thin horizontal rules, clean spacing
- "Classic Professional": \\usepackage{{palatino}} or Times, centered header, traditional layout
- "Technical": Clean monospace accents for skills section, structured grid
- "Compact": Tight spacing, 10pt font, maximizes content density

Output the complete .tex file content.
"""

EDIT_LATEX_TEMPLATE = """\
You are an expert LaTeX typesetter. Edit the LaTeX resume template below according to
the user's instruction. Make ONLY the changes requested — preserve everything else exactly.

CURRENT LATEX:
{latex}

USER INSTRUCTION:
{instruction}

Rules:
1. Output ONLY the complete modified LaTeX source — no explanation, no markdown, no code fences
2. The output must be a complete, valid LaTeX document (not a diff or partial)
3. Make only the changes the user requested — do not "improve" anything else
4. Preserve all lorem ipsum placeholder content unless the instruction specifically changes it
"""

ASSEMBLE_LATEX_RESUME = """\
You are an expert LaTeX typesetter. You have a LaTeX resume template (with lorem ipsum content)
and the final approved resume content in plain text. Replace the lorem ipsum content with the
real resume content, preserving the exact LaTeX formatting, structure, and style.

LATEX TEMPLATE (with lorem ipsum):
{latex_template}

REAL RESUME CONTENT (plain text — use this to replace lorem ipsum):
{resume_text}

USER PROFILE:
  Name: {name}
  Email: {email}
  Phone: {phone}
  Location: {location}
  LinkedIn: {linkedin}
  Website: {website}

Rules:
1. Output ONLY the complete LaTeX source with real content — no explanation, no code fences
2. Keep the EXACT same LaTeX structure, packages, and styling as the template
3. Replace lorem ipsum bullet points with the real bullets from the resume content
4. Replace lorem ipsum role titles/companies/dates with real ones from the resume content
5. Replace lorem ipsum skills/education/awards with real ones
6. Do NOT invent content — only use what is provided in the real resume content
7. The output must compile with pdflatex
"""

PARSE_RAW_TEXT_ACTIVITY = """\
You are a resume writer. The user has pasted raw text describing one or more work experiences,
projects, or accomplishments. Parse it into a list of structured STAR (Situation–Action–Impact)
activity entries — one entry per distinct role, project, or experience.

RAW TEXT:
{raw_text}

Return EXACTLY this JSON (no extra text, no code fences):
{{
  "activities": [
    {{
      "entry_type": "work|project|competition|volunteering|other",
      "job_title": "role title or project name",
      "company": "company / organization name, or empty string",
      "dates_worked": "date range (e.g. Jan 2022 – Mar 2024), or empty string",
      "location": "city, state or remote, or empty string",
      "situation": "1–2 sentences: What was the context, challenge, or problem?",
      "action": "1–3 sentences: What did YOU specifically do? Use strong action verbs.",
      "impact": "1–2 sentences: What was the measurable outcome? Include numbers if present.",
      "extracted_skills": ["skill1", "skill2", "..."]
    }}
  ]
}}

Rules:
- Create ONE entry per distinct role, project, or experience described.
- If the text describes a single experience, return an array with exactly one item.
- If multiple experiences are described (e.g. multiple jobs, projects, or bullet sets for
  different roles), split them into separate entries.
- Group bullet points that clearly belong to the same role/project into one entry.
- Do not fabricate details not implied by the text; leave fields as "" if genuinely unknown.
- Infer entry_type from context (internship → "work", side project → "project", etc.).
- extracted_skills: 3–10 specific skills, tools, or technologies per entry.
- Write situation/action/impact as polished resume-style prose (past tense, active voice).
"""

CREATE_KNOCKOUT_RUBRIC = """\
You are a recruiter screening resumes. Identify the HARD KNOCKOUT requirements from this job
description — requirements that screen candidates out immediately if not met.

RAW JOB DESCRIPTION:
---
{job_description_raw}
---

PRE-EXTRACTED SKILLS (reference only):
  Required: {required_skills}

Knockout requirements are typically:
  - Minimum education level (e.g., "Bachelor's degree required", "MBA required")
  - Required years of experience (e.g., "5+ years of X required", "minimum 3 years in Y")
  - Required location or work authorization (e.g., "Must be authorized to work in US", "Must be in NYC")
  - Specific required licenses or certifications (e.g., "CPA required", "active security clearance")
  - Other absolute prerequisites explicitly marked as required

Do NOT include:
  - "Preferred" or "nice to have" qualifications
  - Soft skills or personality traits
  - General job duties or responsibilities
  - Any requirement where the posting uses language like "preferred", "a plus", "ideally",
    "experience with", "familiarity with", or "bonus"

Return EXACTLY this JSON format (no extra text):
{{
  "knockout_items": [
    {{
      "item_id": "KO-001",
      "category": "education|experience|location|certification|other",
      "requirement": "Clear, direct statement of the hard requirement"
    }},
    ...
  ]
}}

If there are no clear knockout requirements, return {{"knockout_items": []}}.
Aim for 2–6 items. Only include true hard gates — when in doubt, leave it out.
"""

PARSE_RESUME_DESIGN = """\
You are a resume layout analyst. Analyze the resume text below and extract ONLY the page layout
information: which sections are present (and in what order), and estimate the page margins.

RESUME TEXT:
---
{resume_text}
---

Return ONLY a valid JSON object matching this exact schema (no markdown, no extra text):
{{
  "pageSize": "letter",
  "marginX": 0.75,
  "marginY": 0.75,
  "sections": [
    {{"id": "summary",        "label": "Summary",        "enabled": true}},
    {{"id": "experience",     "label": "Experience",     "enabled": true}},
    {{"id": "education",      "label": "Education",      "enabled": true}},
    {{"id": "skills",         "label": "Skills",         "enabled": true}},
    {{"id": "projects",       "label": "Projects",       "enabled": false}},
    {{"id": "certifications", "label": "Certifications", "enabled": false}},
    {{"id": "awards",         "label": "Awards",         "enabled": false}},
    {{"id": "volunteer",      "label": "Volunteer",      "enabled": false}}
  ]
}}

INSTRUCTIONS:
- sections: list ALL eight section IDs above; set "enabled": true only for sections that actually
  appear in the resume text; preserve the order they appear (sections not found go at the bottom
  with enabled: false)
- label: use the exact heading text from the resume if it differs from the default (e.g. "Work
  Experience" instead of "Experience"), otherwise keep the default
- pageSize: "letter" for North American resumes, "A4" for others — infer from context
- marginX / marginY: estimate in inches based on how much white space the layout appears to have
  (typical range 0.5–1.25 in); default to 0.75 if uncertain
- Do NOT return any typography or color fields — only the fields shown in the schema above
"""
