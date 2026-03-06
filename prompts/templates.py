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
cleaned job description data, create a detailed ATS scoring rubric.

REQUIRED SKILLS: {required_skills}
NICE-TO-HAVE SKILLS: {nice_to_have_skills}
VALUED QUALITIES: {valued_qualities}

For each key skill, keyword, or key phrase that an ATS would scan for, create a rubric item.
For each item, also write it as a Situation (what is the task/challenge) and Action (ways to accomplish it),
as if describing how a candidate would demonstrate this skill.

Return EXACTLY this JSON format (no extra text):
{{
  "rubric_items": [
    {{
      "rubric_id": "ATS-001",
      "category": "key_skill|key_word|key_phrase",
      "item": "the exact keyword or phrase the ATS looks for",
      "situation_description": "A situation/task description framing this skill",
      "action_description": "Actions that demonstrate this skill"
    }},
    ...
  ]
}}

Be comprehensive - include every keyword, skill, technology, and phrase an ATS would match on.
Typically produce 15-30 rubric items for a thorough job description.
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
  Situation Context: {situation_desc}
  Action Context: {action_desc}

SOURCE ACTIVITY:
  Original Situation: {original_situation}
  Original Action: {original_action}
  Original Impact: {original_impact}
  Job Title: {job_title}
  Company: {company}

Write a single, powerful resume bullet point in S-T-I format. Rules:
1. Start with a strong action verb
2. Incorporate keywords from the target skill naturally
3. Keep the core truth of the original activity - do NOT fabricate accomplishments
4. Quantify impact where possible (use original numbers if available)
5. Keep it to 1-2 lines maximum

Return ONLY the bullet point text, nothing else.
"""

ASSEMBLE_RESUME = """\
You are an expert resume formatter. Organize the following S-T-I statements into
a professional resume structure that matches the template format.

TEMPLATE STRUCTURE:
  Name: {name}
  Location: {location}
  Email: {email}
  Phone: {phone}
  LinkedIn: {linkedin}
  Website: {website}
  Sections: {sections}

COMPLETED S-T-I STATEMENTS (with metadata):
{statements_block}

Rules:
1. Group bullets under the correct job title / company / dates
2. Order sections to match the template structure: {sections}
3. Within experience, order jobs reverse-chronologically
4. Do NOT rewrite or change any bullet point text - use them exactly as provided
5. If there are skills or projects sections in the template, create appropriate content
   based on the skills evident from the bullets

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

INTENT SCORING RUBRIC:
{intent_rubric}

HOLISTIC IDEAL CANDIDATE:
{holistic_summary}

Rewrite the resume with these goals:
1. Maintain ALL ATS keywords and phrases (do not remove any)
2. Adjust framing, emphasis, and narrative flow to match the holistic person they want
3. Strengthen culture-add signals
4. Enhance domain jargon usage where natural
5. Emphasize growth trajectory and motivation indicators
6. Make the overall narrative tell a cohesive story about why this person IS the ideal candidate
7. Keep all factual content truthful - only adjust framing and emphasis

Return the COMPLETE rewritten resume as formatted plain text.
"""
