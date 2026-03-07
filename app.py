"""AI Resume Writer - Streamlit Application.

A multi-step pipeline that takes a job activity bank, resume template, and job description,
then produces an ATS-optimized and intent-aligned resume with human-in-the-loop controls.
"""

import streamlit as st
import json

from core.ingest import parse_activity_bank_csv, parse_activity_bank_json, parse_resume_template, parse_resume_template_from_pdf
from core.pipeline import (
    step1_ingest_and_vectorize,
    step2_analyze_job_description,
    step3_create_rubrics,
    step4_vectorize_and_match,
    step5_generate_statements,
    step6_assemble_ats_resume,
    step7_intent_rewrite,
)

st.set_page_config(page_title="AI Resume Writer", page_icon="📄", layout="wide")


# ── AI Process Log Helper ────────────────────────────────────────────────────

def ai_log(title: str, entries: list[dict]):
    """Render an expandable AI process log panel.

    Each entry is a dict with:
      - "label": Short description of the sub-step
      - "detail": Longer explanation or data summary
      - "data": (optional) Raw data to show in a code block
    """
    with st.expander(f"🤖 AI Process Log: {title}", expanded=False):
        for i, entry in enumerate(entries):
            st.markdown(f"**{i + 1}. {entry['label']}**")
            if entry.get("detail"):
                st.markdown(f"> {entry['detail']}")
            if entry.get("data"):
                st.code(entry["data"], language="text")
            if i < len(entries) - 1:
                st.divider()


# ── Session state initialization ─────────────────────────────────────────────
DEFAULTS = {
    "pipeline_step": 0,
    "activity_bank": [],
    "activities_by_id": {},
    "resume_template": None,
    "job_description_raw": "",
    "cleaned_jd": None,
    "ats_rubric": [],
    "ats_rubric_pre_dedup_count": 0,
    "intent_rubric": None,
    "vector_matches": {},
    "user_selections": {},
    "statements": [],
    "ats_resume": "",
    "intent_resume": "",
    "final_resume": "",
}
for key, default in DEFAULTS.items():
    if key not in st.session_state:
        st.session_state[key] = default


def reset_pipeline():
    for key, default in DEFAULTS.items():
        st.session_state[key] = default


# ── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("AI Resume Writer")
    st.markdown("---")

    steps = [
        "1. Upload Activity Bank",
        "2. Upload Resume Template",
        "3. Upload Job Description",
        "4. Review Cleaned JD & Rubrics",
        "5. Match Activities to Skills",
        "6. Review S-T-I Statements",
        "7. ATS Resume Assembly",
        "8. Intent-Driven Rewrite",
        "9. Final Resume",
    ]
    current = st.session_state.pipeline_step
    for i, step in enumerate(steps):
        if i < current:
            st.markdown(f"✅ {step}")
        elif i == current:
            st.markdown(f"▶️ **{step}**")
        else:
            st.markdown(f"⬜ {step}")

    st.markdown("---")
    if st.button("Reset Pipeline"):
        reset_pipeline()
        st.rerun()


# ── Step 0: Upload Activity Bank ─────────────────────────────────────────────
if st.session_state.pipeline_step == 0:
    st.header("Step 1: Upload Your Job Activity Bank")
    st.markdown(
        "Upload a CSV or JSON file with columns: "
        "`bulletID`, `Situation`, `Action`, `Impact`, `JobTitle`, `Company`, `DatesWorked`, `Location`"
    )

    uploaded = st.file_uploader("Activity Bank File", type=["csv", "json"])
    if uploaded:
        content = uploaded.read().decode("utf-8")
        if uploaded.name.endswith(".json"):
            activities = parse_activity_bank_json(content)
        else:
            activities = parse_activity_bank_csv(content)

        st.success(f"Parsed {len(activities)} activities")
        st.dataframe(
            [
                {
                    "ID": a.bullet_id,
                    "Situation": a.situation[:60] + "..." if len(a.situation) > 60 else a.situation,
                    "Action": a.action[:60] + "..." if len(a.action) > 60 else a.action,
                    "Impact": a.impact[:60] + "..." if len(a.impact) > 60 else a.impact,
                    "Job Title": a.job_title,
                    "Company": a.company,
                }
                for a in activities
            ],
            use_container_width=True,
        )

        ai_log("What happens when you click the button below", [
            {
                "label": "Skill Extraction (Gemini Flash)",
                "detail": "For each activity, AI reads the Situation, Action, and Impact fields and "
                          "extracts every skill, technology, tool, methodology, and competency — "
                          "including synonyms and aliases. For example, 'container orchestration' also "
                          "yields 'Kubernetes' and 'Docker'. This produces 5-15 skills per activity.",
            },
            {
                "label": "Vectorization (Gemini text-embedding-004)",
                "detail": "Each activity is converted into a numerical vector (embedding) that captures "
                          "its semantic meaning. The text sent to the embedding model leads with extracted "
                          "skills and the Action field — since that's where tools and technologies live — "
                          "followed by job title, situation context, and impact.",
                "data": "Embedding text format:\n"
                        "  Skills: kubernetes, docker, ci/cd, ...\n"
                        "  Action: Deployed container orchestration platform...\n"
                        "  Role: DevOps Engineer\n"
                        "  Context: Company needed to scale infrastructure...\n"
                        "  Result: Reduced deployment time by 40%",
            },
        ])

        if st.button("Extract Skills & Vectorize Activity Bank"):
            with st.spinner("AI is extracting skills from each activity, then embedding..."):
                activities = step1_ingest_and_vectorize(activities)
            st.session_state.activity_bank = activities
            st.session_state.activities_by_id = {a.bullet_id: a for a in activities}
            st.session_state.pipeline_step = 1
            st.rerun()

# ── Step 1: Upload Resume Template ───────────────────────────────────────────
elif st.session_state.pipeline_step == 1:
    st.header("Step 2: Upload Your Resume Template")
    st.markdown(
        "Upload a **PDF**, plain text, or JSON file defining your resume structure. "
        "PDFs will be auto-parsed for design and structure using AI."
    )

    # Show skill extraction results from previous step
    bank = st.session_state.activity_bank
    skills_found = sum(1 for a in bank if a.extracted_skills)
    avg_skills = sum(len(a.extracted_skills) for a in bank) / max(len(bank), 1)
    ai_log(f"Skill Extraction Results — {skills_found}/{len(bank)} activities processed", [
        {
            "label": f"Extracted an average of {avg_skills:.1f} skills per activity",
            "detail": "These skills are used for both embedding (better vector representation) "
                      "and keyword matching (synonym-aware matching against rubric items).",
        },
        {
            "label": "Sample extraction",
            "detail": f"Activity: {bank[0].bullet_id}" if bank else "No activities",
            "data": ", ".join(bank[0].extracted_skills[:15]) if bank and bank[0].extracted_skills else "No skills extracted",
        },
    ])

    uploaded = st.file_uploader("Resume Template", type=["txt", "json", "pdf"])
    if uploaded:
        if uploaded.name.lower().endswith(".pdf"):
            pdf_bytes = uploaded.read()
            with st.spinner("Extracting text from PDF and analyzing structure with AI..."):
                template = parse_resume_template_from_pdf(pdf_bytes)
        else:
            content = uploaded.read().decode("utf-8")
            template = parse_resume_template(content)

        st.subheader("Parsed Template")
        col1, col2 = st.columns(2)
        with col1:
            template.name = st.text_input("Name", value=template.name)
            template.email = st.text_input("Email", value=template.email)
            template.phone = st.text_input("Phone", value=template.phone)
        with col2:
            template.location = st.text_input("Location", value=template.location)
            template.linkedin = st.text_input("LinkedIn", value=template.linkedin)
            template.website = st.text_input("Website", value=template.website)

        sections_str = st.text_input(
            "Sections (comma-separated)",
            value=", ".join(template.sections),
        )
        template.sections = [s.strip().lower() for s in sections_str.split(",")]

        if uploaded.name.lower().endswith(".pdf"):
            ai_log("PDF Template Analysis", [
                {
                    "label": "Text extraction (pypdf)",
                    "detail": "Extracted raw text from all pages of the PDF.",
                },
                {
                    "label": "Structure detection (Gemini Flash)",
                    "detail": "AI analyzed the extracted text to identify: name (typically the largest "
                              "text at top), contact information, section headers and their order, "
                              "and formatting style. Normalized section names (e.g., 'Work Experience' → 'experience').",
                },
            ])

        if st.button("Save Template & Continue"):
            st.session_state.resume_template = template
            st.session_state.pipeline_step = 2
            st.rerun()

# ── Step 2: Upload Job Description ───────────────────────────────────────────
elif st.session_state.pipeline_step == 2:
    st.header("Step 3: Upload or Paste the Job Description")

    uploaded = st.file_uploader("Job Description (plain text)", type=["txt"])
    jd_text = ""
    if uploaded:
        jd_text = uploaded.read().decode("utf-8")

    jd_text = st.text_area(
        "Or paste the job description here:",
        value=jd_text,
        height=400,
    )

    if jd_text:
        ai_log("What happens when you click Analyze", [
            {
                "label": "Job Description Cleaning (Gemini Flash)",
                "detail": "AI reads the raw job description and extracts: required skills, "
                          "nice-to-have skills, valued personal qualities, and a holistic definition "
                          "of the ideal candidate.",
            },
            {
                "label": "ATS Rubric Generation (Gemini Flash)",
                "detail": "AI creates 8-15 grouped skill items that an ATS would scan for. "
                          "Related skills are merged (e.g., Docker + Kubernetes + containerization → "
                          "one item). Each item gets a priority tier: critical (🔴), important (🟡), "
                          "or nice-to-have (🟢), and a list of all ATS-scannable keywords.",
            },
            {
                "label": "Intent Rubric Generation (Gemini Flash)",
                "detail": "AI creates a separate rubric capturing what the hiring manager *actually* "
                          "wants beyond keywords: culture add, holistic experience match, growth potential, "
                          "motivation signals, and domain fluency. Each item is weighted 0.5-2.0.",
            },
        ])

    if jd_text and st.button("Analyze Job Description"):
        with st.spinner("AI is cleaning and analyzing the job description..."):
            cleaned = step2_analyze_job_description(jd_text)

        st.session_state.job_description_raw = jd_text
        st.session_state.cleaned_jd = cleaned

        with st.spinner("AI is creating ATS and Intent scoring rubrics..."):
            ats_rubric, intent_rubric = step3_create_rubrics(cleaned)

        st.session_state.ats_rubric = ats_rubric
        st.session_state.intent_rubric = intent_rubric
        st.session_state.pipeline_step = 3
        st.rerun()

# ── Step 3: Review Cleaned JD & Rubrics ──────────────────────────────────────
elif st.session_state.pipeline_step == 3:
    st.header("Step 4: Review Cleaned Job Description & Rubrics")

    cleaned = st.session_state.cleaned_jd
    tab1, tab2, tab3 = st.tabs(["Cleaned JD", "ATS Rubric", "Intent Rubric"])

    with tab1:
        ai_log("How the job description was analyzed", [
            {
                "label": f"Extracted {len(cleaned.required_skills)} required skills, "
                         f"{len(cleaned.nice_to_have_skills)} nice-to-haves, "
                         f"{len(cleaned.valued_qualities)} valued qualities",
                "detail": "AI read the full job description and categorized every requirement. "
                          "Hard requirements that could cause rejection if missing → required. "
                          "Bonus differentiators → nice-to-have. Personal traits → valued qualities.",
            },
        ])

        st.subheader("Required Skills")
        for s in cleaned.required_skills:
            st.markdown(f"- {s}")
        st.subheader("Nice-to-Have Skills")
        for s in cleaned.nice_to_have_skills:
            st.markdown(f"- {s}")
        st.subheader("Valued Qualities")
        for q in cleaned.valued_qualities:
            st.markdown(f"- {q}")
        st.subheader("Holistic Person Definition")
        st.write(cleaned.holistic_person_definition)

    with tab2:
        rubric = st.session_state.ats_rubric
        n_critical = sum(1 for i in rubric if i.priority == "critical")
        n_important = sum(1 for i in rubric if i.priority == "important")
        n_nice = sum(1 for i in rubric if i.priority == "nice_to_have")
        total_kw = sum(len(i.ats_keywords) for i in rubric)

        ai_log("How the ATS rubric was built", [
            {
                "label": f"Generated {len(rubric)} distinct skill groups "
                         f"({n_critical} critical, {n_important} important, {n_nice} nice-to-have)",
                "detail": "AI was instructed to GROUP related skills into single items rather than "
                          "creating separate entries for each keyword. For example, 'Docker', 'Kubernetes', "
                          "and 'containerization' become one item instead of three.",
            },
            {
                "label": f"Total of {total_kw} ATS keywords across all groups",
                "detail": "Each group contains multiple keywords that an ATS would scan for. "
                          "When we match activities later, we check against ALL keywords in the group.",
            },
            {
                "label": "Situation-Action framing",
                "detail": "Each rubric item includes a Situation (the type of challenge) and Action "
                          "(how a candidate would demonstrate it). These are used to build the embedding "
                          "query for semantic matching against your activity bank.",
            },
        ])

        st.subheader("ATS Scoring Rubric")
        priority_icons = {"critical": "🔴", "important": "🟡", "nice_to_have": "🟢"}
        for item in st.session_state.ats_rubric:
            icon = priority_icons.get(item.priority, "⚪")
            with st.expander(f"{icon} [{item.rubric_id}] {item.item} ({item.priority})"):
                if item.ats_keywords:
                    st.markdown(f"**ATS Keywords:** {', '.join(item.ats_keywords)}")
                st.markdown(f"**Category:** {item.category}")
                st.markdown(f"**Situation:** {item.situation_description}")
                st.markdown(f"**Action:** {item.action_description}")

    with tab3:
        st.subheader("Intent Scoring Rubric")
        intent = st.session_state.intent_rubric

        ai_log("How the intent rubric was built", [
            {
                "label": "Beyond keywords — what the hiring manager actually wants",
                "detail": "This rubric captures the *human intent* behind the job posting. "
                          "While the ATS rubric focuses on keyword matching, this rubric looks at: "
                          "culture add, holistic experience alignment, growth potential, motivation signals, "
                          "and appropriate use of domain language.",
            },
            {
                "label": f"Holistic candidate profile",
                "detail": intent.holistic_summary,
            },
            {
                "label": f"{len(intent.items)} scoring dimensions with weighted importance",
                "detail": "Items weighted 2.0 are critical to the hiring manager's vision. "
                          "Items weighted 0.5 are nice-to-have differentiators. "
                          "This rubric is used in Step 8 to rewrite the ATS resume for deeper alignment.",
            },
        ])

        st.info(f"**Holistic Summary:** {intent.holistic_summary}")
        for item in intent.items:
            st.markdown(
                f"- **[{item.rubric_id}] {item.category}** (weight: {item.weight}): "
                f"{item.description}"
            )

    if st.button("Proceed to Activity Matching"):
        with st.spinner("Vectorizing ATS rubric items, deduplicating, and finding matches..."):
            pre_count = len(st.session_state.ats_rubric)
            ats_rubric, matches = step4_vectorize_and_match(
                st.session_state.ats_rubric,
                st.session_state.activity_bank,
            )
        st.session_state.ats_rubric_pre_dedup_count = pre_count
        st.session_state.ats_rubric = ats_rubric
        st.session_state.vector_matches = matches
        st.session_state.pipeline_step = 4
        st.rerun()

# ── Step 4: Human-in-the-Loop Activity Matching ─────────────────────────────
elif st.session_state.pipeline_step == 4:
    st.header("Step 5: Match Activities to ATS Rubric Skills")
    st.markdown(
        "For each ATS rubric item, we found the **top 3** matching activities from your bank. "
        "Select the best match for each, or skip items that don't apply."
    )

    matches = st.session_state.vector_matches
    rubric = st.session_state.ats_rubric
    selections = st.session_state.user_selections
    pre_count = st.session_state.ats_rubric_pre_dedup_count
    deduped = pre_count - len(rubric) if pre_count > len(rubric) else 0

    ai_log("How matching works", [
        {
            "label": "Rubric vectorization (Gemini text-embedding-004)",
            "detail": "Each rubric item was converted into a query-style embedding that leads with "
                      "the skill label and all ATS keywords, giving the core skill the strongest signal.",
            "data": "Embedding query format:\n"
                    "  Skill: Containerization (Docker, Kubernetes)\n"
                    "  Keywords: Docker, Kubernetes, containerization, containers\n"
                    "  Context: Need to deploy and manage containerized services...\n"
                    "  Demonstrated by: Building and maintaining container orchestration...",
        },
        {
            "label": f"Vector deduplication: {pre_count} items → {len(rubric)} items"
                     + (f" ({deduped} merged)" if deduped else " (none needed)"),
            "detail": "After vectorization, any rubric items with cosine similarity ≥ 0.88 were "
                      "automatically merged. The lower-priority item's keywords are absorbed into "
                      "the higher-priority item." if deduped else
                      "No rubric items were similar enough to merge (all below 0.88 threshold).",
        },
        {
            "label": "Hybrid scoring for each activity",
            "detail": "Each activity is scored against each rubric item using three signals combined:\n"
                      "- **55% Semantic similarity** — Gemini embedding cosine distance (do these describe the same capability?)\n"
                      "- **30% Keyword overlap** — Do the rubric's ATS keywords appear in the activity's extracted skills or raw text? "
                      "Uses AI-extracted synonyms, so 'container orchestration' matches 'Kubernetes'.\n"
                      "- **15% Context bonus** — Does the activity's job title and domain language overlap with the rubric's framing?",
        },
        {
            "label": "Top 3 matches surfaced per rubric item",
            "detail": "The 3 highest-scoring activities are presented for your selection. "
                      "The score shown (e.g., [0.82]) is the hybrid score. "
                      "Higher = better match across all three signals.",
        },
    ])

    # Sort by priority: critical first, then important, then nice_to_have
    priority_order = {"critical": 0, "important": 1, "nice_to_have": 2}
    sorted_rubric = sorted(rubric, key=lambda x: priority_order.get(x.priority, 1))

    for item in sorted_rubric:
        item_matches = matches.get(item.rubric_id, [])
        if not item_matches:
            continue

        priority_icons = {"critical": "🔴", "important": "🟡", "nice_to_have": "🟢"}
        icon = priority_icons.get(item.priority, "⚪")
        with st.expander(f"{icon} [{item.rubric_id}] {item.item} ({item.priority})", expanded=(item.priority == "critical")):
            st.markdown(f"*{item.situation_description}*")
            if item.ats_keywords:
                st.caption(f"ATS Keywords: {', '.join(item.ats_keywords)}")

            options = ["-- Skip this item --"]
            option_details = [None]
            for m in item_matches:
                act = m.activity
                label = (
                    f"[{m.similarity_score:.2f}] {act.bullet_id}: "
                    f"{act.situation[:50]}... | {act.job_title} @ {act.company}"
                )
                options.append(label)
                option_details.append(m)

            # Determine default selection index
            default_idx = 0
            if item.rubric_id in selections:
                for idx, m in enumerate(item_matches):
                    if m.bullet_id == selections[item.rubric_id]:
                        default_idx = idx + 1
                        break

            choice = st.radio(
                f"Select match for {item.item}:",
                options,
                index=default_idx,
                key=f"match_{item.rubric_id}",
            )

            choice_idx = options.index(choice)
            if choice_idx > 0:
                selected_match = option_details[choice_idx]
                selections[item.rubric_id] = selected_match.bullet_id

                # Show full activity detail
                act = selected_match.activity
                st.markdown(f"**Situation:** {act.situation}")
                st.markdown(f"**Action:** {act.action}")
                st.markdown(f"**Impact:** {act.impact}")
                if act.extracted_skills:
                    st.caption(f"Extracted skills: {', '.join(act.extracted_skills[:12])}")
            elif item.rubric_id in selections:
                del selections[item.rubric_id]

    st.session_state.user_selections = selections
    st.info(f"Selected {len(selections)} out of {len(rubric)} rubric items.")

    if st.button("Generate S-T-I Statements"):
        if not selections:
            st.error("Please select at least one activity match.")
        else:
            with st.spinner("AI is writing polished S-T-I statements..."):
                statements = step5_generate_statements(
                    st.session_state.ats_rubric,
                    st.session_state.activities_by_id,
                    selections,
                )
            st.session_state.statements = statements
            st.session_state.pipeline_step = 5
            st.rerun()

# ── Step 5: Review S-T-I Statements ─────────────────────────────────────────
elif st.session_state.pipeline_step == 5:
    st.header("Step 6: Review Generated S-T-I Statements")
    st.markdown("Review each AI-generated bullet point. Edit any that need adjustments.")

    statements = st.session_state.statements

    ai_log(f"How {len(statements)} S-T-I statements were written", [
        {
            "label": "Writing model: Gemini 2.5 Pro (high-quality writing)",
            "detail": "Each bullet is written by the Pro model for maximum quality. "
                      "Flash is used for analysis tasks, but writing your resume bullets "
                      "requires the best language model available.",
        },
        {
            "label": "What the AI receives for each bullet",
            "detail": "For each rubric item + selected activity pair, the AI receives:\n"
                      "- The skill group label and ALL ATS keywords to weave in\n"
                      "- The situation/action framing from the rubric\n"
                      "- The original Situation, Action, and Impact from your activity bank\n"
                      "- The job title and company for context",
        },
        {
            "label": "Writing rules enforced",
            "detail": "1. Start with a strong action verb\n"
                      "2. Incorporate ATS keywords naturally (exact terms ATS systems scan for)\n"
                      "3. Preserve the truth of your original activity — no fabricated accomplishments\n"
                      "4. Quantify impact with original numbers where available\n"
                      "5. Keep to 1-2 lines maximum",
        },
    ])

    updated = []
    for i, s in enumerate(statements):
        with st.expander(f"🔹 {s['rubric_item']} — {s['job_title']} @ {s['company']}", expanded=True):
            edited = st.text_area(
                f"S-T-I Statement ({s['rubric_id']}):",
                value=s["statement"],
                height=100,
                key=f"stmt_{i}",
            )
            updated.append({**s, "statement": edited})

    st.session_state.statements = updated

    if st.button("Assemble ATS Resume"):
        with st.spinner("AI is assembling your ATS-optimized resume..."):
            ats_resume = step6_assemble_ats_resume(
                st.session_state.resume_template,
                updated,
            )
        st.session_state.ats_resume = ats_resume
        st.session_state.pipeline_step = 6
        st.rerun()

# ── Step 6: ATS Resume Assembly ─────────────────────────────────────────────
elif st.session_state.pipeline_step == 6:
    st.header("Step 7: ATS-Optimized Resume")
    st.markdown("This resume is structured to pass ATS keyword matching.")

    template = st.session_state.resume_template
    ai_log("How the resume was assembled", [
        {
            "label": "Assembly model: Gemini 2.5 Pro",
            "detail": "The Pro model organized all S-T-I statements into a complete resume "
                      "matching your template's structure.",
        },
        {
            "label": "Template structure followed",
            "detail": f"Name: {template.name}\n"
                      f"Sections: {', '.join(template.sections)}\n"
                      f"Contact: {template.email} | {template.phone}",
        },
        {
            "label": "Assembly rules",
            "detail": "1. Bullets grouped under the correct job title / company / dates\n"
                      "2. Sections ordered to match your template\n"
                      "3. Experience entries in reverse-chronological order\n"
                      "4. Bullet point text used EXACTLY as written — no rewording at this stage\n"
                      "5. Skills/projects sections populated based on evident competencies",
        },
    ])

    ats_resume = st.text_area(
        "ATS Resume (editable):",
        value=st.session_state.ats_resume,
        height=600,
    )
    st.session_state.ats_resume = ats_resume

    if st.button("Apply Intent-Driven Rewrite"):
        with st.spinner("AI is rewriting for hiring manager intent alignment..."):
            intent_resume = step7_intent_rewrite(
                ats_resume,
                st.session_state.intent_rubric,
            )
        st.session_state.intent_resume = intent_resume
        st.session_state.pipeline_step = 7
        st.rerun()

# ── Step 7: Intent-Driven Rewrite ────────────────────────────────────────────
elif st.session_state.pipeline_step == 7:
    st.header("Step 8: Intent-Aligned Resume")
    st.markdown(
        "This version maintains all ATS keywords while aligning with the hiring manager's true intent."
    )

    intent = st.session_state.intent_rubric

    ai_log("How the intent rewrite works", [
        {
            "label": "Rewrite model: Gemini 2.5 Pro",
            "detail": "The most capable model rewrites your ATS resume to align with the "
                      "hiring manager's true intent — not just keywords.",
        },
        {
            "label": "What the AI is optimizing for",
            "detail": f"Holistic target: {intent.holistic_summary}",
        },
        {
            "label": f"Intent rubric dimensions ({len(intent.items)} items)",
            "detail": "\n".join(
                f"- [{item.category}] (weight {item.weight}): {item.description}"
                for item in intent.items[:6]
            ) + (f"\n- ... and {len(intent.items) - 6} more" if len(intent.items) > 6 else ""),
        },
        {
            "label": "Rewrite rules",
            "detail": "1. Maintain ALL ATS keywords (no removals)\n"
                      "2. Adjust framing and emphasis to match the holistic ideal candidate\n"
                      "3. Strengthen culture-add signals\n"
                      "4. Enhance domain jargon where natural\n"
                      "5. Emphasize growth trajectory and motivation\n"
                      "6. Tell a cohesive narrative story\n"
                      "7. Keep all facts truthful — only adjust framing",
        },
    ])

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("ATS Version")
        st.text_area("ATS Resume:", value=st.session_state.ats_resume, height=500, disabled=True)
    with col2:
        st.subheader("Intent-Aligned Version")
        intent_resume = st.text_area(
            "Intent Resume (editable):",
            value=st.session_state.intent_resume,
            height=500,
        )
        st.session_state.intent_resume = intent_resume

    # Intent rubric display
    with st.expander("View Intent Scoring Rubric"):
        for item in st.session_state.intent_rubric.items:
            st.markdown(
                f"- **[{item.category}]** (weight: {item.weight}): {item.description}"
            )

    col_approve, col_redo = st.columns(2)
    with col_approve:
        if st.button("✅ Approve — Finalize Resume", type="primary"):
            st.session_state.final_resume = st.session_state.intent_resume
            st.session_state.pipeline_step = 8
            st.rerun()
    with col_redo:
        if st.button("🔄 Redo — Re-run Intent Rewrite"):
            with st.spinner("AI is re-generating the intent-aligned version..."):
                new_intent = step7_intent_rewrite(
                    st.session_state.ats_resume,
                    st.session_state.intent_rubric,
                )
            st.session_state.intent_resume = new_intent
            st.rerun()

# ── Step 8: Final Resume ─────────────────────────────────────────────────────
elif st.session_state.pipeline_step == 8:
    st.header("Step 9: Final Resume")
    st.success("Your resume is complete — optimized for both ATS and hiring manager intent!")

    final = st.text_area(
        "Final Resume:",
        value=st.session_state.final_resume,
        height=600,
    )

    st.download_button(
        label="📥 Download Resume (.txt)",
        data=final,
        file_name="resume_final.txt",
        mime="text/plain",
    )

    st.markdown("---")
    st.subheader("Pipeline Summary")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Activities in Bank", len(st.session_state.activity_bank))
    with col2:
        st.metric("ATS Rubric Items", len(st.session_state.ats_rubric))
    with col3:
        st.metric("Matched Statements", len(st.session_state.statements))

    ai_log("Full pipeline recap", [
        {
            "label": "Models used",
            "detail": "- **Gemini 2.5 Flash**: JD analysis, rubric generation, skill extraction, PDF parsing\n"
                      "- **Gemini 2.5 Pro**: S-T-I bullet writing, resume assembly, intent rewrite\n"
                      "- **Gemini text-embedding-004**: All vector embeddings (activity bank + rubric items)",
        },
        {
            "label": "Matching approach",
            "detail": "Hybrid scoring: 55% semantic similarity (Gemini embeddings) + "
                      "30% keyword overlap (AI-extracted skills with synonyms) + "
                      "15% domain context bonus. Rubric items are deduplicated at ≥ 0.88 cosine similarity.",
        },
        {
            "label": "Human-in-the-loop checkpoints",
            "detail": "- Step 5: You chose which activity best matches each rubric skill\n"
                      "- Step 6: You reviewed and edited every S-T-I bullet\n"
                      "- Step 7: You edited the assembled ATS resume\n"
                      "- Step 8: You approved or re-ran the intent-aligned rewrite",
        },
    ])
