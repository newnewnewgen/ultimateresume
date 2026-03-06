"""AI Resume Writer - Streamlit Application.

A multi-step pipeline that takes a job activity bank, resume template, and job description,
then produces an ATS-optimized and intent-aligned resume with human-in-the-loop controls.
"""

import streamlit as st
import json

from core.ingest import parse_activity_bank_csv, parse_activity_bank_json, parse_resume_template
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

# ── Session state initialization ─────────────────────────────────────────────
DEFAULTS = {
    "pipeline_step": 0,
    "activity_bank": [],
    "activities_by_id": {},
    "resume_template": None,
    "job_description_raw": "",
    "cleaned_jd": None,
    "ats_rubric": [],
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

        if st.button("Vectorize Activity Bank & Continue"):
            with st.spinner("Embedding activity bank (this may take a moment)..."):
                activities = step1_ingest_and_vectorize(activities)
            st.session_state.activity_bank = activities
            st.session_state.activities_by_id = {a.bullet_id: a for a in activities}
            st.session_state.pipeline_step = 1
            st.rerun()

# ── Step 1: Upload Resume Template ───────────────────────────────────────────
elif st.session_state.pipeline_step == 1:
    st.header("Step 2: Upload Your Resume Template")
    st.markdown(
        "Upload a plain text or JSON file defining your resume structure "
        "(name, contact info, section order)."
    )

    uploaded = st.file_uploader("Resume Template", type=["txt", "json"])
    if uploaded:
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
        st.subheader("ATS Scoring Rubric")
        for item in st.session_state.ats_rubric:
            with st.expander(f"[{item.rubric_id}] {item.item} ({item.category})"):
                st.markdown(f"**Situation:** {item.situation_description}")
                st.markdown(f"**Action:** {item.action_description}")

    with tab3:
        st.subheader("Intent Scoring Rubric")
        intent = st.session_state.intent_rubric
        st.info(f"**Holistic Summary:** {intent.holistic_summary}")
        for item in intent.items:
            st.markdown(
                f"- **[{item.rubric_id}] {item.category}** (weight: {item.weight}): "
                f"{item.description}"
            )

    if st.button("Proceed to Activity Matching"):
        with st.spinner("Vectorizing ATS rubric items and finding matches..."):
            ats_rubric, matches = step4_vectorize_and_match(
                st.session_state.ats_rubric,
                st.session_state.activity_bank,
            )
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

    for item in rubric:
        item_matches = matches.get(item.rubric_id, [])
        if not item_matches:
            continue

        with st.expander(f"🎯 [{item.rubric_id}] {item.item}", expanded=True):
            st.markdown(f"*{item.situation_description}*")

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
