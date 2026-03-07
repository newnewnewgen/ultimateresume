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
You are an expert ATS (Applicant Tracking System) analyst. Based on the following
cleaned job description data, create a focused ATS scoring rubric.

REQUIRED SKILLS: {required_skills}
NICE-TO-HAVE SKILLS: {nice_to_have_skills}
VALUED QUALITIES: {valued_qualities}

CRITICAL RULES:
1. GROUP related skills into a SINGLE rubric item. For example:
   - "Docker" and "Kubernetes" and "containerization" → ONE item: "Containerization (Docker, Kubernetes)"
   - "Python" and "Go" and "Java" → ONE item: "Programming Languages (Python, Go, Java)"
   - "CI/CD" and "DevOps" and "automated deployment" → ONE item: "CI/CD & DevOps Practices"
   - "communication skills" and "cross-functional collaboration" → ONE item: "Cross-Functional Communication"
2. Each rubric item must represent a DISTINCT skill area — no two items should match the same resume bullet.
3. Assign a priority tier to each item:
   - "critical": Explicitly required — missing this likely means rejection
   - "important": Strongly preferred or implied as necessary
   - "nice_to_have": Bonus skills that differentiate candidates
4. The "item" field should be a concise label, and "ats_keywords" should list ALL the specific
   keywords/phrases an ATS would scan for within that group.

For each item, also write it as a Situation (what is the task/challenge) and Action (ways to accomplish it).

Return EXACTLY this JSON format (no extra text):
{{
  "rubric_items": [
    {{
      "rubric_id": "ATS-001",
      "category": "technical_skill|soft_skill|domain_knowledge|tool_platform|methodology",
      "priority": "critical|important|nice_to_have",
      "item": "Concise skill group label",
      "ats_keywords": ["keyword1", "keyword2", "keyword3"],
      "situation_description": "A situation/task description framing this skill group",
      "action_description": "Actions that demonstrate this skill group"
    }},
    ...
  ]
}}

Aim for 8-15 DISTINCT rubric items. Fewer, well-grouped items are better than many overlapping ones.
Each item should map to a different type of work experience.
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
You are an expert resume writer. Using the job activity below, write a polished
Situation - Task - Impact bullet point that aligns with the target skill/requirement.

TARGET SKILL/REQUIREMENT:
  Item: {rubric_item}
  ATS Keywords to incorporate: {ats_keywords}
  Situation Context: {situation_desc}
  Action Context: {action_desc}

IDEAL CANDIDATE PROFILE:
  {holistic_person}

SOURCE ACTIVITY:
  Original Situation: {original_situation}
  Original Action: {original_action}
  Original Impact: {original_impact}
  Job Title: {job_title}
  Company: {company}
  Verified Skills/Technologies: {extracted_skills}

OTHER BULLETS ALREADY WRITTEN FOR THIS RESUME (avoid repeating similar phrasing):
{other_bullets}

Write a single, powerful resume bullet point in S-T-I format. Rules:
1. Start with a strong action verb
2. Incorporate as many of the ATS keywords as naturally fit — these are the exact terms
   an ATS will scan for, so they must appear in the text
3. Use the verified skills/technologies list to ensure technical terms are accurate
4. Frame the bullet to reflect the ideal candidate profile where natural
5. Keep the core truth of the original activity - do NOT fabricate accomplishments
6. Quantify impact where possible (use original numbers if available)
7. Keep it to 1-2 lines maximum
8. Use different phrasing and action verbs from the other bullets listed above

Return ONLY the bullet point text, nothing else.
"""

ASSEMBLE_RESUME = """\
You are an expert resume formatter. Organize the following S-T-I statements into
a professional resume structure that matches the template format.

TARGET ROLE CONTEXT:
  {role_context}

IDEAL CANDIDATE PROFILE:
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

COMPLETED S-T-I STATEMENTS (with metadata):
{statements_block}

Rules:
1. Group bullets under the correct job title / company / dates
2. Order sections to match the template structure: {sections}
3. Within experience, order jobs reverse-chronologically
4. Do NOT rewrite or change any bullet point text - use them exactly as provided
5. For the skills section, use the consolidated skills list above — organize them into
   logical categories (e.g., Languages, Frameworks, Tools, Methodologies)
6. If the template includes a summary/objective section, write a concise 2-3 sentence
   professional summary tailored to the target role and ideal candidate profile
7. Order skills to lead with those most relevant to the target role

Return the resume as clean, formatted plain text ready for a document.
Use this exact format:

{name}
{location} | {email} | {phone}
{linkedin} | {website}

[For each section in the template, output the section header and content]
"""

INTENT_REWRITE = """\
You are a world-class resume strategist. You have a resume that already passes ATS
keyword matching. Now, rewrite it to deeply align with the hiring manager's TRUE INTENT.

CURRENT ATS-OPTIMIZED RESUME:
{ats_resume}

ATS KEYWORD CHECKLIST (every keyword below MUST appear in the final resume):
{ats_keyword_checklist}

INTENT SCORING RUBRIC:
{intent_rubric}

HOLISTIC IDEAL CANDIDATE:
{holistic_summary}

Rewrite the resume with these goals:
1. Maintain ALL ATS keywords from the checklist above — verify each one appears in the output
2. Adjust framing, emphasis, and narrative flow to match the holistic person they want
3. Strengthen culture-add signals
4. Enhance domain jargon usage where natural
5. Emphasize growth trajectory and motivation indicators
6. Make the overall narrative tell a cohesive story about why this person IS the ideal candidate
7. Keep all factual content truthful - only adjust framing and emphasis

Return the COMPLETE rewritten resume as formatted plain text.
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
