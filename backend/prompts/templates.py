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
You are an expert ATS (Applicant Tracking System) analyst. Create a focused ATS scoring rubric
from the job description below.

RAW JOB DESCRIPTION (primary source of truth — use exact language and specific requirements from here):
---
{job_description_raw}
---

PRE-EXTRACTED SKILLS (use as a starting checklist, but derive specificity from the raw JD above):
  Required: {required_skills}
  Nice-to-have: {nice_to_have_skills}
  Valued qualities: {valued_qualities}

CRITICAL RULES:
1. Derive rubric items from the SPECIFIC requirements in the raw JD, not the pre-extracted summaries.
   Use the exact behaviors, contexts, and outcomes the JD describes — not generic category names.
   BAD item: "Product Management Experience"
   GOOD item: "Cross-functional Roadmap Prioritization" (if the JD mentions roadmap ownership + stakeholder alignment)
2. GROUP related skills into a SINGLE rubric item. For example:
   - "Docker" and "Kubernetes" and "containerization" → ONE item: "Containerization (Docker, Kubernetes)"
   - "Python" and "Go" and "Java" → ONE item: "Programming Languages (Python, Go, Java)"
   - "CI/CD" and "DevOps" and "automated deployment" → ONE item: "CI/CD & DevOps Practices"
3. Each rubric item must represent a DISTINCT skill area — no two items should match the same resume bullet.
4. Assign a priority tier based on the JD's language:
   - "critical": Explicitly required / "must have" — missing this likely means rejection
   - "important": Strongly preferred or implied as necessary
   - "nice_to_have": Bonus skills that differentiate candidates
5. The "item" field should be specific and behavioral (what does success look like?), and "ats_keywords"
   should list ALL the specific keywords/phrases an ATS would scan for within that group.
6. situation_description: Frame it as the actual challenge the employer is hiring for (from the JD context).
   action_description: Describe specific actions that would demonstrate competency (use JD language).

Return EXACTLY this JSON format (no extra text):
{{
  "rubric_items": [
    {{
      "rubric_id": "ATS-001",
      "category": "technical_skill|soft_skill|domain_knowledge|tool_platform|methodology",
      "priority": "critical|important|nice_to_have",
      "item": "Specific, behavioral skill label derived from JD language",
      "ats_keywords": ["keyword1", "keyword2", "keyword3"],
      "situation_description": "The actual challenge/context from the JD that requires this skill",
      "action_description": "Specific actions that demonstrate this skill, using JD language"
    }},
    ...
  ]
}}

Aim for 8-15 DISTINCT rubric items. Fewer, well-grouped items are better than many overlapping ones.
Each item should map to a different type of work experience that the JD is explicitly looking for.
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
4. Incorporate ATS keywords by weaving them into the description of real work —
   do NOT lead with them or make the bullet sound keyword-engineered
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

TARGET ROLE CONTEXT:
  {role_context}

IDEAL CANDIDATE PROFILE (use only for the summary section):
  {holistic_person}

TEMPLATE STRUCTURE:
  Name: {name}
  Location: {location}
  Email: {email}
  Phone: {phone}
  LinkedIn: {linkedin}
  Website: {website}
  Sections: {sections}

CONSOLIDATED SKILLS (extracted from selected activities):
{skills_list}

═══════════════════════════════════════════════════════════
PRE-GROUPED WORK HISTORY — COPY THESE BULLETS VERBATIM
Do NOT rewrite, shorten, or replace any bullet. Do NOT add
bullets not listed here. Each role and its bullets are final.
═══════════════════════════════════════════════════════════
{work_history_block}
═══════════════════════════════════════════════════════════

FORMATTING RULES:
1. Output the experience section using EXACTLY the roles and bullets above — no additions, no omissions, no rewording
2. Order sections to match: {sections}
3. Order jobs reverse-chronologically (most recent first)
4. For the skills section, organize the consolidated skills into logical categories (Languages, Frameworks, Tools, Methodologies)
5. Order skills to lead with those most relevant to the target role
6. If the template includes a summary/objective section, write a concise 2-3 sentence professional summary using the target role context and ideal candidate profile above
7. Do NOT fabricate any content outside of the summary — all experience bullets come from the pre-grouped block above

Return the resume as clean, formatted plain text ready for a document.

Use EXACTLY this structure — replace each [placeholder] with real content:

{name}
{location} | {email} | {phone}
{linkedin} | {website}

For each section in [{sections}], output a section header in ALL CAPS followed by its content:

- summary → Write a 2-3 sentence professional summary using the role context and ideal candidate profile.
- experience → Copy EVERY role and bullet from the PRE-GROUPED WORK HISTORY block above, verbatim. Do not skip any bullet. Do not reword. Paste them exactly.
- education → Output the section header. Leave the content blank (the user will fill it in).
- projects → Output the section header. Leave the content blank (the user will fill it in).
- skills → Organize the consolidated skills into logical categories (Languages, Frameworks, Tools, Methodologies). Order by relevance to the target role.
- certifications → Output the section header. Leave the content blank (the user will fill it in).
- For any other section → Output the section header and leave the content blank.

CRITICAL: The experience section MUST contain all the role headers and bullet points from the PRE-GROUPED WORK HISTORY block. Do not output an empty experience section.
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
7. The summary section may be lightly reworded for narrative cohesion, but keep it concise.
8. Preserve the candidate's natural voice. The output should read like the same person wrote it.
9. If a bullet is already well-aligned, copy it VERBATIM. Most bullets should be unchanged.

Return the COMPLETE resume as formatted plain text, with only the minimal edits applied.
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
