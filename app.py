"""AI Resume Writer — Streamlit Application."""

import concurrent.futures
import json
import re

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from core.ingest import (
    parse_activity_bank_csv,
    parse_activity_bank_json,
    parse_full_resume,
)
from core.models import ActivityBullet, EducationEntry, UserProfile
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


# ── LaTeX → HTML live preview ─────────────────────────────────────────────────

def _latex_to_html(latex: str) -> str:
    """Convert a LaTeX resume to approximate HTML for an always-on live preview.

    Not pixel-perfect, but fast and always in sync with the editor.
    """
    # Extract body between \begin{document} and \end{document}
    m = re.search(r"\\begin\{document\}(.*?)(?:\\end\{document\}|$)", latex, re.DOTALL)
    body = m.group(1).strip() if m else latex

    # Strip comments
    body = re.sub(r"(?m)%.*$", "", body)

    # ── Environments ──
    body = re.sub(r"\\begin\{itemize\}", "<ul>", body)
    body = re.sub(r"\\end\{itemize\}", "</ul>", body)
    body = re.sub(r"\\begin\{enumerate\}", "<ol>", body)
    body = re.sub(r"\\end\{enumerate\}", "</ol>", body)
    body = re.sub(r"\\begin\{center\}", '<div style="text-align:center">', body)
    body = re.sub(r"\\end\{center\}", "</div>", body)
    body = re.sub(r"\\begin\{multicols\}\{\d+\}", '<div style="column-count:2;column-gap:2em">', body)
    body = re.sub(r"\\end\{multicols\}", "</div>", body)
    body = re.sub(r"\\begin\{[^}]+\}", "", body)
    body = re.sub(r"\\end\{[^}]+\}", "", body)

    # ── Section headers ──
    body = re.sub(
        r"\\section\*?\{([^}]*)\}",
        r'<h2 style="font-size:1em;font-weight:bold;text-transform:uppercase;'
        r'border-bottom:1px solid #333;margin:0.9em 0 0.2em;letter-spacing:.05em">\1</h2>',
        body,
    )
    body = re.sub(
        r"\\subsection\*?\{([^}]*)\}",
        r'<h3 style="font-size:0.95em;margin:0.5em 0 0.1em">\1</h3>',
        body,
    )

    # ── Inline formatting (handle one level of nested braces) ──
    for _ in range(3):  # resolve nesting up to 3 levels
        body = re.sub(r"\\textbf\{([^{}]*)\}", r"<strong>\1</strong>", body)
        body = re.sub(r"\\textit\{([^{}]*)\}", r"<em>\1</em>", body)
        body = re.sub(r"\\emph\{([^{}]*)\}", r"<em>\1</em>", body)
        body = re.sub(r"\\underline\{([^{}]*)\}", r"<u>\1</u>", body)
        body = re.sub(r"\\texttt\{([^{}]*)\}", r"<code>\1</code>", body)
        body = re.sub(r"\\textsc\{([^{}]*)\}", r'<span style="font-variant:small-caps">\1</span>', body)
        body = re.sub(r"\\textcolor\{[^}]*\}\{([^{}]*)\}", r"\1", body)

    # ── Layout helpers ──
    # \hfill → right-align the trailing content on the same line
    body = re.sub(
        r"([^\n]*?)\\hfill([^\n]*)",
        r'<div style="display:flex;justify-content:space-between"><span>\1</span><span>\2</span></div>',
        body,
    )
    body = re.sub(r"\\\\(?:\[[^\]]+\])?", "<br>", body)  # line breaks
    body = re.sub(r"\\newline", "<br>", body)
    body = re.sub(
        r"\\(?:hrule|hrulefill|noindent\\rule\{[^}]*\}\{[^}]*\}|rule\{[^}]*\}\{[^}]*\})",
        '<hr style="margin:0.25em 0;border:0;border-top:1px solid #444">',
        body,
    )

    # ── Spacing ──
    body = re.sub(r"\\vspace\*?\{[^}]*\}", '<div style="margin:0.4em 0"></div>', body)
    body = re.sub(r"\\hspace\*?\{[^}]*\}", "&nbsp;&nbsp;", body)
    body = re.sub(r"\\bigskip", '<div style="margin:0.7em 0"></div>', body)
    body = re.sub(r"\\medskip", '<div style="margin:0.4em 0"></div>', body)
    body = re.sub(r"\\smallskip", '<div style="margin:0.2em 0"></div>', body)
    body = re.sub(r"\\noindent|\\centering|\\raggedright|\\raggedleft|\\justifying", "", body)

    # ── List items ──
    body = re.sub(r"\\item\s*\[([^\]]*)\]", r"<li><strong>\1</strong>&nbsp;", body)
    body = re.sub(r"\\item\b", "<li>", body)

    # ── Links ──
    body = re.sub(r"\\href\{([^}]*)\}\{([^}]*)\}", r'<a href="\1">\2</a>', body)
    body = re.sub(r"\\url\{([^}]*)\}", r'<a href="\1">\1</a>', body)

    # ── Special characters ──
    body = body.replace("~", "&nbsp;")
    body = body.replace("---", "—").replace("--", "–")
    body = body.replace("``", "\u201c").replace("''", "\u201d")
    body = body.replace("\\&", "&amp;").replace("\\%", "%")
    body = body.replace("\\$", "$").replace("\\#", "#")
    body = body.replace("\\_", "_")

    # ── Sweep remaining LaTeX commands ──
    body = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}", r"\1", body)
    body = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", "", body)
    body = re.sub(r"[{}]", "", body)

    # ── Paragraph breaks ──
    body = re.sub(r"\n{2,}", "</p><p>", body)
    body = re.sub(r"\n", " ", body)

    return f"<div><p>{body}</p></div>"


def _latex_preview_html(latex: str, font_css: str = "font-family: 'Latin Modern', Georgia, serif;") -> str:
    """Wrap latex_to_html output in a full styled HTML document."""
    content = _latex_to_html(latex) if latex.strip() else "<p style='color:#aaa'>No LaTeX content yet. Generate a template to see a live preview here.</p>"
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #e8e8e8; {font_css} font-size: 10pt; line-height: 1.4; }}
  .paper {{
    background: white;
    margin: 12px auto;
    padding: 0.75in 0.75in 0.75in 0.75in;
    max-width: 8.5in;
    min-height: 10in;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }}
  h2 {{ break-after: avoid; }}
  ul, ol {{ padding-left: 1.4em; margin: 0.15em 0 0.3em; }}
  li {{ margin: 0.1em 0; }}
  p {{ margin: 0.2em 0; }}
  a {{ color: #1a0dab; text-decoration: none; }}
  code {{ font-family: monospace; font-size: 0.9em; }}
  hr {{ margin: 0.3em 0; border: 0; border-top: 1px solid #444; }}
</style>
</head>
<body>
  <div class="paper">
    {content}
  </div>
</body>
</html>"""


# ── AI Process Log Helper ────────────────────────────────────────────────────

def ai_log(title: str, entries: list[dict]):
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
    # Onboarding
    "app_stage": "onboard",          # "onboard" | "pipeline"
    "onboard_step": "choose",        # "choose" | "upload" | "edit"
    "user_profile": None,            # UserProfile
    "experience_bank": [],           # list[ActivityBullet] — raw, unvectorized
    "latex_chat_history": [],        # list of chat messages for LaTeX editor
    # Pipeline
    "pipeline_step": 0,
    "activity_bank": [],             # list[ActivityBullet] — vectorized
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
    "latex_resume": "",
}
for key, default in DEFAULTS.items():
    if key not in st.session_state:
        st.session_state[key] = default


def reset_all():
    for key, default in DEFAULTS.items():
        st.session_state[key] = default


def reset_pipeline():
    pipeline_keys = [
        "pipeline_step", "activity_bank", "activities_by_id", "resume_template",
        "job_description_raw", "cleaned_jd", "ats_rubric", "ats_rubric_pre_dedup_count",
        "intent_rubric", "vector_matches", "user_selections", "statements",
        "ats_resume", "intent_resume", "final_resume", "latex_resume",
    ]
    for key in pipeline_keys:
        st.session_state[key] = DEFAULTS[key]


# ── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("AI Resume Writer")
    st.markdown("---")

    if st.session_state.app_stage == "onboard":
        st.markdown("**Onboarding**")
        stages = ["1. Choose path", "2. Upload resume", "3. Build your database"]
        stage_map = {"choose": 0, "upload": 1, "edit": 2}
        current_stage = stage_map.get(st.session_state.onboard_step, 0)
        for i, label in enumerate(stages):
            prefix = "✅" if i < current_stage else ("▶" if i == current_stage else "○")
            st.markdown(f"{prefix} {label}")
        if current_stage > 0:
            st.markdown("---")
            if st.button("← Restart Onboarding"):
                reset_all()
                st.rerun()
    else:
        st.markdown("**Pipeline**")
        steps = [
            "1. Job Description",
            "2. Review JD & Rubrics",
            "3. Match Activities",
            "4. Review Bullets",
            "5. ATS Resume",
            "6. Intent Rewrite",
            "7. Final Resume",
        ]
        for i, label in enumerate(steps):
            prefix = "✅" if i < st.session_state.pipeline_step else ("▶" if i == st.session_state.pipeline_step else "○")
            st.markdown(f"{prefix} {label}")

        if st.session_state.pipeline_step > 0:
            st.markdown("---")
            if st.button("↩ Back to Database"):
                st.session_state.app_stage = "onboard"
                st.session_state.onboard_step = "edit"
                reset_pipeline()
                st.rerun()

        st.markdown("---")
        if st.button("🔄 Start Over"):
            reset_all()
            st.rerun()

# ════════════════════════════════════════════════════════════════════════════
# ONBOARDING
# ════════════════════════════════════════════════════════════════════════════

if st.session_state.app_stage == "onboard":

    # ── Step: Choose path ────────────────────────────────────────────────────
    if st.session_state.onboard_step == "choose":
        st.title("AI Resume Writer")
        st.markdown("Build a tailored, ATS-optimized resume in minutes.")
        st.divider()

        col_a, col_b = st.columns(2, gap="large")
        with col_a:
            st.subheader("I have an existing resume")
            st.markdown(
                "Upload a PDF or DOCX — AI will extract all your experience, "
                "profile info, and even replicate your resume's visual style in LaTeX."
            )
            if st.button("Upload my resume →", type="primary", use_container_width=True):
                st.session_state.onboard_step = "upload"
                st.rerun()

        with col_b:
            st.subheader("I'm starting from scratch")
            st.markdown(
                "Enter your experience and profile info manually using our guided editor. "
                "Choose a LaTeX template style and we'll generate a professional resume."
            )
            if st.button("Start from scratch →", use_container_width=True):
                st.session_state.user_profile = UserProfile()
                st.session_state.experience_bank = []
                st.session_state.onboard_step = "edit"
                st.rerun()

    # ── Step: Upload existing resume ─────────────────────────────────────────
    elif st.session_state.onboard_step == "upload":
        st.header("Upload Your Resume")
        st.markdown("Upload a PDF or DOCX resume. AI will extract all your information.")

        uploaded = st.file_uploader(
            "Resume file",
            type=["pdf", "docx"],
            label_visibility="collapsed",
        )

        if uploaded:
            st.success(f"File ready: {uploaded.name}")
            if st.button("Parse Resume →", type="primary"):
                file_bytes = uploaded.read()
                filename = uploaded.name
                with st.spinner("AI is reading your resume — extracting experience, profile, and design style..."):
                    try:
                        profile, activities, style_notes = parse_full_resume(file_bytes, filename)
                        # Auto-generate LaTeX template from style notes
                        if style_notes and not profile.latex_template:
                            from core.ai_engine import generate_latex_template
                            latex = generate_latex_template(
                                style_spec=style_notes,
                                profile={
                                    "name": profile.name, "email": profile.email,
                                    "phone": profile.phone, "location": profile.location,
                                    "linkedin": profile.linkedin, "website": profile.website,
                                },
                                sections=profile.sections,
                            )
                            profile.latex_template = latex
                        st.session_state.user_profile = profile
                        st.session_state.experience_bank = activities
                        st.session_state.onboard_step = "edit"
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to parse resume: {exc}")

        if st.button("← Back"):
            st.session_state.onboard_step = "choose"
            st.rerun()

    # ── Step: Database editor ─────────────────────────────────────────────────
    elif st.session_state.onboard_step == "edit":
        if st.session_state.user_profile is None:
            st.session_state.user_profile = UserProfile()

        profile: UserProfile = st.session_state.user_profile

        st.header("Your Resume Database")
        st.markdown("Review and edit all your information below. This is your master database — used across all resumes.")

        tab_exp, tab_profile, tab_template = st.tabs([
            "Experience Bank",
            "Profile & Education",
            "Resume Template",
        ])

        # ── Tab 1: Experience Bank ───────────────────────────────────────────
        with tab_exp:
            st.markdown(
                "Add all your experiences — work, projects, competitions, volunteering. "
                "Each row is one accomplishment written in **Situation / Action / Impact** format."
            )

            # Convert experience_bank to DataFrame
            bank = st.session_state.experience_bank
            if bank:
                df_data = [
                    {
                        "entry_type": a.entry_type,
                        "title": a.job_title,
                        "organization": a.company,
                        "dates": a.dates_worked,
                        "location": a.location,
                        "situation": a.situation,
                        "action": a.action,
                        "impact": a.impact,
                    }
                    for a in bank
                ]
            else:
                df_data = [{
                    "entry_type": "work",
                    "title": "",
                    "organization": "",
                    "dates": "",
                    "location": "",
                    "situation": "",
                    "action": "",
                    "impact": "",
                }]

            df = pd.DataFrame(df_data)

            col_filter, col_sort = st.columns([2, 2])
            with col_filter:
                filter_type = st.selectbox(
                    "Filter by type:",
                    ["All", "work", "project", "competition", "volunteering", "other"],
                    key="bank_filter",
                )
            with col_sort:
                sort_col = st.selectbox(
                    "Sort by:",
                    ["None", "title", "organization", "dates", "entry_type"],
                    key="bank_sort",
                )

            display_df = df.copy()
            if filter_type != "All":
                display_df = display_df[display_df["entry_type"] == filter_type]
            if sort_col != "None":
                display_df = display_df.sort_values(sort_col)

            edited_df = st.data_editor(
                display_df,
                num_rows="dynamic",
                use_container_width=True,
                height=500,
                column_config={
                    "entry_type": st.column_config.SelectboxColumn(
                        "Type",
                        options=["work", "project", "competition", "volunteering", "other"],
                        required=True,
                        help="Category of this experience",
                        width="small",
                    ),
                    "title": st.column_config.TextColumn(
                        "Title",
                        help="Job title (work), project name, competition name, etc.",
                        width="medium",
                    ),
                    "organization": st.column_config.TextColumn(
                        "Organization",
                        help="Company, team, event organizer, or school",
                        width="medium",
                    ),
                    "dates": st.column_config.TextColumn(
                        "Dates",
                        help="e.g. 'Jan 2022 – Mar 2023' or '2022'",
                        width="small",
                    ),
                    "location": st.column_config.TextColumn(
                        "Location",
                        help="City, State or Remote (optional)",
                        width="small",
                    ),
                    "situation": st.column_config.TextColumn(
                        "Situation",
                        help="What was the context, challenge, or goal? (1-2 sentences)",
                        width="large",
                    ),
                    "action": st.column_config.TextColumn(
                        "Action",
                        help="What did you specifically do? Include tools and methods.",
                        width="large",
                    ),
                    "impact": st.column_config.TextColumn(
                        "Impact",
                        help="What was the outcome? Quantify where possible.",
                        width="large",
                    ),
                },
                key="experience_editor",
            )

            col_save, col_import = st.columns([2, 2])
            with col_save:
                if st.button("Save Experience Bank", type="primary"):
                    new_bank = []
                    for i, row in edited_df.iterrows():
                        if not any([str(row.get("title", "")), str(row.get("situation", "")), str(row.get("action", ""))]):
                            continue  # skip empty rows
                        new_bank.append(ActivityBullet(
                            bullet_id=f"B{len(new_bank) + 1:03d}",
                            entry_type=str(row.get("entry_type", "work")),
                            situation=str(row.get("situation", "")),
                            action=str(row.get("action", "")),
                            impact=str(row.get("impact", "")),
                            job_title=str(row.get("title", "")),
                            company=str(row.get("organization", "")),
                            dates_worked=str(row.get("dates", "")),
                            location=str(row.get("location", "")),
                        ))
                    st.session_state.experience_bank = new_bank
                    st.success(f"Saved {len(new_bank)} entries.")

            with col_import:
                with st.expander("Import from CSV / JSON"):
                    import_file = st.file_uploader("Import file", type=["csv", "json"], key="bank_import")
                    if import_file:
                        content = import_file.read().decode("utf-8")
                        if import_file.name.endswith(".json"):
                            imported = parse_activity_bank_json(content)
                        else:
                            imported = parse_activity_bank_csv(content)
                        if st.button("Add to bank"):
                            existing = st.session_state.experience_bank
                            offset = len(existing)
                            for i, a in enumerate(imported):
                                a.bullet_id = f"B{offset + i + 1:03d}"
                            st.session_state.experience_bank = existing + imported
                            st.success(f"Added {len(imported)} entries.")
                            st.rerun()

        # ── Tab 2: Profile & Education ───────────────────────────────────────
        with tab_profile:
            st.subheader("Contact Information")
            c1, c2 = st.columns(2)
            with c1:
                profile.name = st.text_input("Full Name", value=profile.name)
                profile.email = st.text_input("Email", value=profile.email)
                profile.phone = st.text_input("Phone", value=profile.phone)
            with c2:
                profile.location = st.text_input("Location", value=profile.location, help="City, State")
                profile.linkedin = st.text_input("LinkedIn URL", value=profile.linkedin)
                profile.website = st.text_input("Website / Portfolio", value=profile.website)

            profile.summary = st.text_area(
                "Professional Summary (optional)",
                value=profile.summary,
                height=80,
                help="Leave blank — AI will generate one tailored to each job application.",
            )

            st.divider()
            st.subheader("Education")

            # Dynamic education list
            if "edu_entries" not in st.session_state:
                st.session_state.edu_entries = profile.education if profile.education else []

            edu_list = st.session_state.edu_entries
            for i, edu in enumerate(edu_list):
                with st.expander(f"🎓 {edu.school or f'School {i+1}'}", expanded=(i == 0)):
                    e1, e2 = st.columns(2)
                    with e1:
                        edu.school = st.text_input("School / University", value=edu.school, key=f"edu_school_{i}")
                        edu.degree = st.text_input("Degree", value=edu.degree, key=f"edu_degree_{i}", help="e.g. B.S., M.S., Ph.D.")
                        edu.field_of_study = st.text_input("Field of Study", value=edu.field_of_study, key=f"edu_field_{i}")
                    with e2:
                        edu.location = st.text_input("Location", value=edu.location, key=f"edu_loc_{i}")
                        edu.start_date = st.text_input("Start Date", value=edu.start_date, key=f"edu_start_{i}", help="e.g. Sept 2018")
                        edu.end_date = st.text_input("End Date", value=edu.end_date, key=f"edu_end_{i}", help="e.g. May 2022 or Present")
                        edu.gpa = st.text_input("GPA (optional)", value=edu.gpa, key=f"edu_gpa_{i}")
                    edu.description = st.text_area(
                        "Description / Honors (optional)",
                        value=edu.description,
                        height=60,
                        key=f"edu_desc_{i}",
                        help="Honors, awards, relevant coursework, etc.",
                    )
                    bullets_text = st.text_area(
                        "Bullet points (one per line, optional)",
                        value="\n".join(edu.bullets),
                        height=60,
                        key=f"edu_bullets_{i}",
                    )
                    edu.bullets = [b.strip() for b in bullets_text.split("\n") if b.strip()]
                    if st.button(f"Remove this school", key=f"edu_remove_{i}"):
                        edu_list.pop(i)
                        st.rerun()

            if st.button("+ Add School"):
                edu_list.append(EducationEntry())
                st.rerun()

            st.divider()
            st.subheader("Skills, Awards & More")

            c3, c4 = st.columns(2)
            with c3:
                skills_text = st.text_area(
                    "Key Skills",
                    value="\n".join(profile.skills),
                    height=120,
                    help="One skill per line, or comma-separated. Include tools, languages, frameworks, methodologies.",
                )
                profile.skills = [s.strip() for s in skills_text.replace(",", "\n").split("\n") if s.strip()]

                awards_text = st.text_area(
                    "Awards & Honors",
                    value="\n".join(profile.awards),
                    height=80,
                    help="One award per line",
                )
                profile.awards = [a.strip() for a in awards_text.split("\n") if a.strip()]
            with c4:
                certs_text = st.text_area(
                    "Certifications",
                    value="\n".join(profile.certifications),
                    height=80,
                    help="One certification per line",
                )
                profile.certifications = [c.strip() for c in certs_text.split("\n") if c.strip()]

                # Additional custom sections
                st.markdown("**Additional Sections**")
                for section_name, section_content in list(profile.additional_sections.items()):
                    col_sn, col_sc, col_rm = st.columns([2, 4, 1])
                    with col_sn:
                        st.text(section_name)
                    with col_sc:
                        new_content = st.text_area(
                            f"Content for {section_name}",
                            value="\n".join(section_content),
                            height=60,
                            label_visibility="collapsed",
                            key=f"add_sec_{section_name}",
                        )
                        profile.additional_sections[section_name] = [l.strip() for l in new_content.split("\n") if l.strip()]
                    with col_rm:
                        if st.button("✕", key=f"rm_sec_{section_name}"):
                            del profile.additional_sections[section_name]
                            st.rerun()

                new_section_name = st.text_input("Add new section (e.g. Publications, Languages):", key="new_section_input")
                if st.button("+ Add Section") and new_section_name:
                    profile.additional_sections[new_section_name] = []
                    st.rerun()

            # Save profile
            if st.button("Save Profile", type="primary"):
                profile.education = edu_list
                st.session_state.user_profile = profile
                st.success("Profile saved.")

        # ── Tab 3: Resume Template (LaTeX) ───────────────────────────────────
        with tab_template:
            st.subheader("Resume Template Designer")

            # ── Style controls (compact row) ──────────────────────────────────
            ctrl1, ctrl2, ctrl3, ctrl4, ctrl5 = st.columns([2, 2, 1, 1, 1])
            with ctrl1:
                preset = st.selectbox(
                    "Style Preset",
                    ["Modern Minimal", "Classic Professional", "Technical", "Compact / Dense"],
                    help="Starting point for the visual design",
                    label_visibility="collapsed",
                )
            with ctrl2:
                font_family = st.selectbox(
                    "Font Family",
                    ["Default (LaTeX Computer Modern)", "Helvetica / Arial (sans-serif)", "Times New Roman (serif)", "Palatino (elegant serif)", "Lato"],
                    label_visibility="collapsed",
                )
            with ctrl3:
                font_size = st.select_slider(
                    "Font Size",
                    options=["9pt", "10pt", "11pt", "12pt"],
                    value="10pt",
                    label_visibility="collapsed",
                )
            with ctrl4:
                style_spec = f"Preset: {preset}. Font: {font_family}. Font size: {font_size}."
                if profile.style_notes:
                    style_spec += f" Also match: {profile.style_notes}"
                generate_clicked = st.button("Generate", type="primary", use_container_width=True)
            with ctrl5:
                clear_clicked = st.button("Clear", use_container_width=True)

            if generate_clicked:
                p = st.session_state.user_profile or UserProfile()
                with st.spinner("Generating LaTeX template..."):
                    from core.ai_engine import generate_latex_template
                    latex = generate_latex_template(
                        style_spec=style_spec,
                        profile={
                            "name": p.name or "Your Name",
                            "email": p.email or "email@example.com",
                            "phone": p.phone or "555-555-5555",
                            "location": p.location or "City, State",
                            "linkedin": p.linkedin,
                            "website": p.website,
                        },
                        sections=p.sections,
                    )
                st.session_state.user_profile.latex_template = latex
                st.session_state.latex_chat_history = []
                st.rerun()

            if clear_clicked:
                st.session_state.user_profile.latex_template = ""
                st.session_state.latex_chat_history = []
                st.rerun()

            # ── Side-by-side: editor (left) + live preview (right) ────────────
            current_latex = st.session_state.user_profile.latex_template if st.session_state.user_profile else ""

            # Pick a CSS font that roughly matches the LaTeX font choice
            _font_css_map = {
                "Helvetica / Arial (sans-serif)": "font-family: Arial, Helvetica, sans-serif;",
                "Times New Roman (serif)": "font-family: 'Times New Roman', Times, serif;",
                "Palatino (elegant serif)": "font-family: Palatino, 'Book Antiqua', serif;",
                "Lato": "font-family: Lato, 'Helvetica Neue', Arial, sans-serif;",
            }
            preview_font_css = _font_css_map.get(font_family, "font-family: 'Latin Modern', Georgia, serif;")

            editor_col, preview_col = st.columns([1, 1], gap="small")

            with editor_col:
                st.caption("LaTeX Source — edit directly:")
                edited_latex = st.text_area(
                    "LaTeX",
                    value=current_latex,
                    height=620,
                    label_visibility="collapsed",
                    key="latex_editor",
                    placeholder="Click 'Generate' above to create a template, then edit it here.",
                )
                if edited_latex != current_latex and st.session_state.user_profile:
                    st.session_state.user_profile.latex_template = edited_latex

                col_dl, col_size = st.columns([2, 1])
                with col_dl:
                    st.download_button(
                        "📥 Download .tex",
                        data=edited_latex or "",
                        file_name="resume_template.tex",
                        mime="text/plain",
                        disabled=not edited_latex,
                    )
                with col_size:
                    st.caption(f"{len(edited_latex.splitlines())} lines" if edited_latex else "")

            with preview_col:
                st.caption("Live Preview — updates as you type:")
                preview_html = _latex_preview_html(edited_latex or "", font_css=preview_font_css)
                components.html(preview_html, height=640, scrolling=True)

            # ── AI chat below ──────────────────────────────────────────────────
            st.markdown("---")
            st.markdown("**AI Chat — describe a change to apply:**")
            for msg in st.session_state.latex_chat_history:
                role, text = msg
                with st.chat_message(role):
                    st.markdown(text)

            instruction = st.chat_input(
                "e.g. 'make section headers bold navy blue', 'use two columns for skills', 'increase line spacing to 1.15'"
            )
            if instruction:
                st.session_state.latex_chat_history.append(("user", instruction))
                with st.spinner("Applying change..."):
                    from core.ai_engine import edit_latex_with_ai
                    new_latex = edit_latex_with_ai(
                        latex=st.session_state.user_profile.latex_template or edited_latex,
                        instruction=instruction,
                    )
                st.session_state.user_profile.latex_template = new_latex
                st.session_state.latex_chat_history.append(("assistant", f"Applied: {instruction}"))
                st.rerun()

        st.divider()
        bank_count = len(st.session_state.experience_bank)
        has_profile = bool(st.session_state.user_profile and st.session_state.user_profile.name)
        if bank_count == 0:
            st.warning("Add at least one entry to your Experience Bank before continuing.")
        col_cont, _ = st.columns([2, 4])
        with col_cont:
            if st.button(
                f"Continue to Job Description → ({bank_count} entries)",
                type="primary",
                disabled=(bank_count == 0),
            ):
                # Sync education from session state
                if st.session_state.user_profile:
                    if "edu_entries" in st.session_state:
                        st.session_state.user_profile.education = st.session_state.edu_entries
                    st.session_state.resume_template = st.session_state.user_profile.to_resume_template()
                st.session_state.app_stage = "pipeline"
                st.session_state.pipeline_step = 0
                st.rerun()

# ════════════════════════════════════════════════════════════════════════════
# PIPELINE
# ════════════════════════════════════════════════════════════════════════════

elif st.session_state.app_stage == "pipeline":

    # ── Step 0: Job Description ──────────────────────────────────────────────
    if st.session_state.pipeline_step == 0:
        st.header("Step 2: Upload Job Description")
        bank = st.session_state.experience_bank
        st.info(f"Experience bank: **{len(bank)} entries** loaded from your database.")

        jd_file = st.file_uploader("Job Description file (optional)", type=["txt"], label_visibility="collapsed")
        jd_prefill = ""
        if jd_file:
            jd_prefill = jd_file.read().decode("utf-8")
        jd_text = st.text_area(
            "Paste the full job description here:",
            value=jd_prefill,
            height=350,
            placeholder="Paste the full job description here...",
        )
        if jd_text.strip():
            st.caption(f"{len(jd_text.split())} words")

        ai_log("What happens when you click Analyze", [
            {
                "label": "Thread 1 — Activity Bank: Skill Extraction + Vectorization",
                "detail": "AI extracts 5-15 skills per entry (including synonyms), then converts each to a semantic vector embedding.",
            },
            {
                "label": "Thread 2 — Job Description: Analysis + Rubric Generation",
                "detail": "AI cleans the JD into required skills, nice-to-haves, and valued qualities. "
                          "Then creates an ATS rubric (8-15 grouped skill items) and an Intent rubric.",
            },
        ])

        if st.button("Analyze Job Description →", type="primary", disabled=not jd_text.strip()):
            jd_text_val = jd_text.strip()
            activities_raw = st.session_state.experience_bank

            def _process_activities():
                return step1_ingest_and_vectorize(activities_raw)

            def _process_jd():
                cleaned = step2_analyze_job_description(jd_text_val)
                ats_rubric, intent_rubric = step3_create_rubrics(cleaned)
                return cleaned, ats_rubric, intent_rubric

            with st.spinner("Running AI in parallel — skill extraction, JD analysis, rubric generation..."):
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                    fut_act = executor.submit(_process_activities)
                    fut_jd = executor.submit(_process_jd)
                    activities = fut_act.result()
                    cleaned, ats_rubric, intent_rubric = fut_jd.result()

            # Vectorize and match rubric
            with st.spinner("Matching activities to job requirements..."):
                ats_rubric, vector_matches = step4_vectorize_and_match(ats_rubric, activities, top_k=5)

            st.session_state.activity_bank = activities
            st.session_state.activities_by_id = {a.bullet_id: a for a in activities}
            st.session_state.job_description_raw = jd_text_val
            st.session_state.cleaned_jd = cleaned
            st.session_state.ats_rubric = ats_rubric
            st.session_state.ats_rubric_pre_dedup_count = len(ats_rubric)
            st.session_state.intent_rubric = intent_rubric
            st.session_state.vector_matches = vector_matches
            st.session_state.pipeline_step = 1
            st.rerun()

    # ── Step 1: Review Cleaned JD & Rubrics ──────────────────────────────────
    elif st.session_state.pipeline_step == 1:
        st.header("Step 3: Review Cleaned Job Description & Rubrics")

        cleaned = st.session_state.cleaned_jd
        bank = st.session_state.activity_bank
        skills_found = sum(1 for a in bank if a.extracted_skills)
        avg_skills = sum(len(a.extracted_skills) for a in bank) / max(len(bank), 1)

        ai_log(f"Processing results — {len(bank)} activities, {len(st.session_state.ats_rubric)} rubric items", [
            {
                "label": f"Activity bank: {skills_found}/{len(bank)} activities enriched with extracted skills (avg {avg_skills:.1f} per activity)",
                "detail": "Skills are used for both vector embedding and keyword matching against rubric items.",
                "data": f"Sample — {bank[0].bullet_id}: {', '.join(bank[0].extracted_skills[:15])}" if bank and bank[0].extracted_skills else "No sample available",
            },
            {
                "label": f"JD analysis: {len(cleaned.required_skills)} required skills, {len(cleaned.nice_to_have_skills)} nice-to-haves, {len(cleaned.valued_qualities)} valued qualities",
                "detail": "Hard requirements → required. Bonus differentiators → nice-to-have. Personal traits → valued qualities.",
            },
            {
                "label": f"ATS rubric: {len(st.session_state.ats_rubric)} grouped skill items generated",
                "detail": "Related skills are merged. Each item has a priority tier and ATS-scannable keywords.",
            },
            {
                "label": f"Intent rubric: {len(st.session_state.intent_rubric.items)} dimensions generated",
                "detail": "Captures culture add, holistic experience alignment, growth potential, motivation signals, domain fluency.",
            },
        ])

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
            st.markdown(cleaned.holistic_person_definition)

        with tab2:
            priority_colors = {"critical": "🔴", "important": "🟡", "nice_to_have": "🟢"}
            for item in st.session_state.ats_rubric:
                icon = priority_colors.get(item.priority, "⚪")
                with st.expander(f"{icon} [{item.priority.upper()}] {item.item}"):
                    st.markdown(f"**Category:** {item.category}")
                    st.markdown(f"**ATS Keywords:** {', '.join(item.ats_keywords)}")
                    st.markdown(f"**Situation:** {item.situation_description}")
                    st.markdown(f"**Action:** {item.action_description}")

        with tab3:
            st.markdown(f"**Holistic Summary:** {st.session_state.intent_rubric.holistic_summary}")
            for item in st.session_state.intent_rubric.items:
                st.markdown(f"- **[{item.category}]** (weight {item.weight}): {item.description}")

        if st.button("Proceed to Match Activities →", type="primary"):
            st.session_state.pipeline_step = 2
            st.rerun()

    # ── Step 2: Match Activities to Skills ───────────────────────────────────
    elif st.session_state.pipeline_step == 2:
        st.header("Step 4: Match Activities to Job Requirements")

        rubric = st.session_state.ats_rubric
        matches = st.session_state.vector_matches
        rubric_by_id = {item.rubric_id: item for item in rubric}
        priority_order = {"critical": 0, "important": 1, "nice_to_have": 2}
        THRESHOLD = 0.5

        # Load previous selections if any
        new_selections: dict[str, list[str]] = {
            rid: list(bids) for rid, bids in st.session_state.user_selections.items()
        }

        # Auto-select on first load
        if not new_selections:
            for item in rubric:
                item_matches = matches.get(item.rubric_id, [])
                auto = [m.bullet_id for m in item_matches if m.bullet_id and m.activity and m.similarity_score >= THRESHOLD]
                if not auto and item_matches:
                    best = max(item_matches, key=lambda m: m.similarity_score)
                    if best.bullet_id and best.activity:
                        auto = [best.bullet_id]
                new_selections[item.rubric_id] = auto

        priority_colors = {"critical": "🔴", "important": "🟡", "nice_to_have": "🟢"}

        for item in sorted(rubric, key=lambda r: priority_order.get(r.priority, 1)):
            icon = priority_colors.get(item.priority, "⚪")
            with st.expander(f"{icon} [{item.priority.upper()}] {item.item}", expanded=True):
                st.caption(f"ATS keywords: {', '.join(item.ats_keywords[:6])}")
                item_matches = matches.get(item.rubric_id, [])

                if not item_matches:
                    st.warning("No matches found for this rubric item.")
                    continue

                selected_for_item = new_selections.get(item.rubric_id, [])

                for m_idx, m in enumerate(item_matches):
                    if not m.bullet_id or not m.activity:
                        continue
                    score = m.similarity_score
                    score_icon = "🟢" if score >= THRESHOLD else ("🟡" if score >= 0.35 else "🔴")
                    act = m.activity
                    label = (
                        f"{score_icon} **{act.job_title}** @ {act.company} "
                        f"({act.dates_worked}) — score: {score:.2f}"
                    )
                    checked = m.bullet_id in selected_for_item
                    col_check, col_content = st.columns([0.05, 0.95], gap="small")
                    with col_check:
                        new_checked = st.checkbox(
                            label,
                            value=checked,
                            key=f"sel_{item.rubric_id}_{m.bullet_id}_{m_idx}",
                            label_visibility="collapsed",
                        )
                    with col_content:
                        header_md = (
                            f"{score_icon} `{m.bullet_id}` &nbsp;**{act.job_title}**"
                            f"{' @ ' + act.company if act.company else ''}"
                            f"{' · ' + act.dates_worked if act.dates_worked else ''}"
                            f" &nbsp;<span style='color:gray;font-size:0.85em'>score: {score:.2f}</span>"
                        )
                        st.markdown(header_md, unsafe_allow_html=True)
                        if act.situation:
                            st.markdown(f"<span style='color:#555;font-size:0.88em'>**S:** {act.situation}</span>", unsafe_allow_html=True)
                        if act.action:
                            st.markdown(f"<span style='color:#555;font-size:0.88em'>**A:** {act.action}</span>", unsafe_allow_html=True)
                        if act.impact:
                            st.markdown(f"<span style='color:#555;font-size:0.88em'>**I:** {act.impact}</span>", unsafe_allow_html=True)
                    if new_checked:
                        if m.bullet_id not in selected_for_item:
                            selected_for_item.append(m.bullet_id)
                    else:
                        if m.bullet_id in selected_for_item:
                            selected_for_item.remove(m.bullet_id)
                    st.markdown("<div style='margin:0.4em 0;border-top:1px solid #f0f0f0'></div>", unsafe_allow_html=True)

                new_selections[item.rubric_id] = selected_for_item

                # Gap handling
                if not selected_for_item:
                    st.error(f"No activity selected for **{item.item}** — this is a gap in your resume.")
                    gap_input = st.text_area(
                        f"Describe a relevant experience for '{item.item}':",
                        key=f"gap_{item.rubric_id}",
                        height=80,
                        placeholder="e.g. 'I worked on X using Y, which resulted in Z.'",
                    )
                    if gap_input.strip():
                        from core.models import ActivityBullet as AB
                        synthetic_id = f"CUSTOM_{item.rubric_id}"
                        synthetic = AB(
                            bullet_id=synthetic_id,
                            entry_type="other",
                            situation="User-provided context",
                            action=gap_input.strip(),
                            impact="",
                            job_title="Custom Entry",
                            company="",
                            dates_worked="",
                            location="",
                        )
                        st.session_state.activities_by_id[synthetic_id] = synthetic
                        new_selections[item.rubric_id] = [synthetic_id]

        st.session_state.user_selections = new_selections

        # Summary of selections
        all_selected_ids = set(bid for bids in new_selections.values() for bid in bids)
        total_unique = len(all_selected_ids)
        multi_claimed = {
            bid: [rid for rid, bids in new_selections.items() if bid in bids]
            for bid in all_selected_ids
            if sum(1 for bids in new_selections.values() if bid in bids) > 1
        }

        total_rubric_covered = len(new_selections)
        st.divider()

        col_info, col_multi = st.columns([1, 1])
        with col_info:
            st.info(
                f"**{total_unique} unique bullets** selected across "
                f"**{total_rubric_covered}/{len(rubric)} rubric items** — "
                f"{total_unique} rewrites will be generated."
            )
        if multi_claimed:
            with col_multi:
                with st.expander(f"⚡ {len(multi_claimed)} bullet(s) cover multiple skills", expanded=True):
                    for bid, rids in multi_claimed.items():
                        items_for_bid = [rubric_by_id[rid] for rid in rids if rid in rubric_by_id]
                        sorted_items = sorted(items_for_bid, key=lambda r: priority_order.get(r.priority, 1))
                        top_priority = sorted_items[0].priority
                        top_items = [r for r in sorted_items if r.priority == top_priority]
                        if len(top_items) > 1:
                            logic = f"will **combine** {' + '.join(r.item for r in top_items)}"
                        else:
                            logic = f"written for **{top_items[0].item}** ({top_priority})"
                        st.markdown(f"- `{bid}` covers {len(rids)} skills → {logic}")

        if st.button("Generate Bullets", type="primary"):
            if not new_selections:
                st.error("Please select at least one activity.")
            else:
                holistic = ""
                if st.session_state.cleaned_jd:
                    holistic = st.session_state.cleaned_jd.holistic_person_definition
                with st.spinner("AI is writing bullets (parallel Flash calls)..."):
                    statements = step5_generate_statements(
                        st.session_state.ats_rubric,
                        st.session_state.activities_by_id,
                        new_selections,
                        holistic_person=holistic,
                    )
                failed = [s for s in statements if s.get("error")]
                if failed:
                    st.warning(
                        f"{len(failed)} bullet(s) failed (likely a temporary API overload). "
                        "They are shown below — you can retry them or continue with the rest."
                    )
                st.session_state.statements = statements
                st.session_state.pipeline_step = 3
                st.rerun()

    # ── Step 3: Review S-T-I Statements ──────────────────────────────────────
    elif st.session_state.pipeline_step == 3:
        st.header("Step 5: Review Generated Bullets")
        st.markdown("Review each AI-generated bullet point. Edit any that need adjustments.")

        statements = st.session_state.statements

        multi_cover = sum(1 for s in statements if len(s.get("rubric_items", [])) > 1)
        ai_log(f"{len(statements)} bullets generated", [
            {
                "label": f"One bullet per unique activity — {len(statements)} bullets cover {sum(len(s.get('rubric_ids', [])) for s in statements)} rubric items",
                "detail": f"{multi_cover} bullet(s) cover multiple skills in a single natural sentence.",
            },
            {
                "label": "Priority-based rewrite logic",
                "detail": "• Single skill → written for that skill\n"
                          "• Multiple skills, one highest priority → written for top-priority\n"
                          "• Equal top priority → AI combines both skill contexts",
            },
            {
                "label": "Speed optimization",
                "detail": "All bullets generated in parallel (Flash model). A dedup pass fixes any repeated opening verbs.",
            },
        ])

        failed_bullets = [s for s in statements if s.get("error")]
        if failed_bullets:
            st.error(
                f"{len(failed_bullets)} bullet(s) failed to generate (API error). "
                "You can retry them below, or manually write the bullet in the text box."
            )
            if st.button("Retry failed bullets", type="secondary"):
                holistic = st.session_state.cleaned_jd.holistic_person_definition if st.session_state.cleaned_jd else ""
                good_statements = [s for s in statements if not s.get("error")]
                retried = []
                with st.spinner("Retrying failed bullets..."):
                    for s in failed_bullets:
                        activity = st.session_state.activities_by_id.get(s["bullet_id"])
                        rubric_by_id = {item.rubric_id: item for item in st.session_state.ats_rubric}
                        primary = rubric_by_id.get(s["primary_rubric_id"])
                        if not activity or not primary:
                            retried.append(s)
                            continue
                        secondary_ids = [rid for rid in s.get("rubric_ids", []) if rid != s["primary_rubric_id"]]
                        secondary = [rubric_by_id[rid] for rid in secondary_ids if rid in rubric_by_id]
                        try:
                            from core.ai_engine import write_sti_statement
                            stmt = write_sti_statement(
                                primary, activity,
                                holistic_person=holistic,
                                secondary_rubric_items=secondary or None,
                            )
                            retried.append({**s, "statement": stmt, "error": None})
                        except Exception as exc:
                            retried.append({**s, "error": str(exc)})
                st.session_state.statements = good_statements + retried
                st.rerun()

        updated = []
        for i, s in enumerate(statements):
            rubric_items_list = s.get("rubric_items", [s.get("primary_rubric_item", "")])
            rewrite_logic = s.get("rewrite_logic", "")
            covers_label = " + ".join(rubric_items_list) if len(rubric_items_list) > 1 else (rubric_items_list[0] if rubric_items_list else "")

            has_error = bool(s.get("error"))
            header = f"{'⚠️' if has_error else '🔹'} {s['bullet_id']} — {s['job_title']} @ {s['company']}"
            with st.expander(header, expanded=True):
                if has_error:
                    st.warning(f"Failed to generate: {s['error']}")
                if len(rubric_items_list) > 1:
                    st.caption(f"⚡ Covers {len(rubric_items_list)} skills: {covers_label}")
                    st.caption(f"Rewrite logic: {rewrite_logic}")
                else:
                    st.caption(f"Skill: {covers_label}")
                edited = st.text_area(
                    "Bullet:",
                    value=s["statement"],
                    height=100,
                    key=f"stmt_{i}",
                )
                updated.append({**s, "statement": edited})

        st.session_state.statements = updated

        if st.button("Assemble ATS Resume", type="primary"):
            cleaned_jd = st.session_state.cleaned_jd
            holistic = cleaned_jd.holistic_person_definition if cleaned_jd else ""
            role_context = ""
            if cleaned_jd:
                role_context = (
                    f"Required skills: {', '.join(cleaned_jd.required_skills[:10])}. "
                    f"Nice-to-have: {', '.join(cleaned_jd.nice_to_have_skills[:5])}."
                )
            consolidated_skills = set()
            for s in updated:
                act = st.session_state.activities_by_id.get(s.get("bullet_id"))
                if act and act.extracted_skills:
                    consolidated_skills.update(act.extracted_skills)
            with st.spinner("AI is assembling your ATS-optimized resume..."):
                ats_resume = step6_assemble_ats_resume(
                    st.session_state.resume_template,
                    updated,
                    role_context=role_context,
                    holistic_person=holistic,
                    consolidated_skills=sorted(consolidated_skills),
                )
            st.session_state.ats_resume = ats_resume
            st.session_state.pipeline_step = 4
            st.rerun()

    # ── Step 4: ATS Resume ───────────────────────────────────────────────────
    elif st.session_state.pipeline_step == 4:
        st.header("Step 6: ATS-Optimized Resume")
        st.markdown("This resume is structured to pass ATS keyword matching.")

        template = st.session_state.resume_template
        ai_log("How the resume was assembled", [
            {"label": "Assembly model: Gemini 2.5 Pro", "detail": "Organizes all bullets into a complete resume matching your template structure."},
            {"label": "Template structure followed", "detail": f"Name: {template.name}\nSections: {', '.join(template.sections)}\nContact: {template.email} | {template.phone}"},
            {"label": "Assembly rules", "detail": "1. Bullets grouped under the correct job title / company / dates\n2. Sections ordered to match your template\n3. Experience in reverse-chronological order\n4. Bullets used EXACTLY as written\n5. Skills built from AI-extracted skills\n6. Summary tailored to target role"},
        ])

        ats_resume = st.text_area(
            "ATS Resume (editable):",
            value=st.session_state.ats_resume,
            height=600,
        )
        st.session_state.ats_resume = ats_resume

        if st.button("Apply Intent-Driven Rewrite", type="primary"):
            all_ats_kw = []
            for item in st.session_state.ats_rubric:
                all_ats_kw.extend(item.ats_keywords)
            with st.spinner("AI is rewriting for hiring manager intent alignment..."):
                intent_resume = step7_intent_rewrite(
                    ats_resume,
                    st.session_state.intent_rubric,
                    ats_keywords=all_ats_kw,
                )
            st.session_state.intent_resume = intent_resume
            st.session_state.pipeline_step = 5
            st.rerun()

    # ── Step 5: Intent-Driven Rewrite ────────────────────────────────────────
    elif st.session_state.pipeline_step == 5:
        st.header("Step 7: Intent-Aligned Resume")
        st.markdown("This version maintains all ATS keywords while aligning with the hiring manager's true intent.")

        intent = st.session_state.intent_rubric

        ai_log("How the intent rewrite works", [
            {"label": "Rewrite model: Gemini 2.5 Pro", "detail": "Rewrites for hiring manager intent — not just keywords."},
            {"label": "What the AI is optimizing for", "detail": f"Holistic target: {intent.holistic_summary}"},
            {"label": f"Intent rubric dimensions ({len(intent.items)} items)", "detail": "\n".join(f"- [{item.category}] (weight {item.weight}): {item.description}" for item in intent.items[:6]) + (f"\n- ... and {len(intent.items) - 6} more" if len(intent.items) > 6 else "")},
            {"label": "Rewrite rules", "detail": "Surgical, word-level edits only — preserves the candidate's natural voice.\nOnly changes what genuinely adds alignment. No added marketing language."},
        ])

        col1, col2 = st.columns(2)
        with col1:
            st.subheader("ATS Version")
            st.text_area("ATS Resume:", value=st.session_state.ats_resume, height=500, disabled=True)
        with col2:
            st.subheader("Intent-Aligned Version")
            intent_resume = st.text_area("Intent Resume (editable):", value=st.session_state.intent_resume, height=500)
            st.session_state.intent_resume = intent_resume

        with st.expander("View Intent Scoring Rubric"):
            for item in st.session_state.intent_rubric.items:
                st.markdown(f"- **[{item.category}]** (weight: {item.weight}): {item.description}")

        col_approve, col_redo = st.columns(2)
        with col_approve:
            if st.button("✅ Approve — Finalize Resume", type="primary"):
                st.session_state.final_resume = st.session_state.intent_resume
                st.session_state.pipeline_step = 6
                st.rerun()
        with col_redo:
            if st.button("🔄 Redo — Re-run Intent Rewrite"):
                all_ats_kw = []
                for item in st.session_state.ats_rubric:
                    all_ats_kw.extend(item.ats_keywords)
                with st.spinner("AI is re-generating the intent-aligned version..."):
                    new_intent = step7_intent_rewrite(
                        st.session_state.ats_resume,
                        st.session_state.intent_rubric,
                        ats_keywords=all_ats_kw,
                    )
                st.session_state.intent_resume = new_intent
                st.rerun()

    # ── Step 6: Final Resume ─────────────────────────────────────────────────
    elif st.session_state.pipeline_step == 6:
        st.header("Step 8: Final Resume")
        st.success("Your resume is complete — optimized for both ATS and hiring manager intent!")

        tab_text, tab_latex = st.tabs(["Plain Text", "LaTeX Output"])

        with tab_text:
            final = st.text_area("Final Resume:", value=st.session_state.final_resume, height=600)
            st.download_button(
                label="📥 Download Resume (.txt)",
                data=final,
                file_name="resume_final.txt",
                mime="text/plain",
            )

        with tab_latex:
            profile = st.session_state.user_profile
            has_template = profile and profile.latex_template
            if not has_template:
                st.info("You didn't create a LaTeX template in the setup step. Go back to the database editor and use the Resume Template tab to create one.")
                if st.button("← Go back to Template Designer"):
                    st.session_state.app_stage = "onboard"
                    st.session_state.onboard_step = "edit"
                    st.rerun()
            else:
                if not st.session_state.latex_resume:
                    if st.button("Generate LaTeX Resume", type="primary"):
                        with st.spinner("AI is populating your LaTeX template with resume content..."):
                            from core.ai_engine import assemble_latex_resume
                            latex_out = assemble_latex_resume(
                                latex_template=profile.latex_template,
                                resume_text=st.session_state.final_resume,
                                profile={
                                    "name": profile.name, "email": profile.email,
                                    "phone": profile.phone, "location": profile.location,
                                    "linkedin": profile.linkedin, "website": profile.website,
                                },
                            )
                        st.session_state.latex_resume = latex_out
                        st.rerun()
                else:
                    latex_out = st.text_area(
                        "LaTeX Resume (editable):",
                        value=st.session_state.latex_resume,
                        height=600,
                        key="final_latex_editor",
                    )
                    st.session_state.latex_resume = latex_out
                    st.download_button(
                        "📥 Download .tex",
                        data=latex_out,
                        file_name="resume_final.tex",
                        mime="text/plain",
                    )
                    if st.button("Regenerate LaTeX"):
                        st.session_state.latex_resume = ""
                        st.rerun()

        st.markdown("---")
        st.subheader("Pipeline Summary")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Entries in Bank", len(st.session_state.experience_bank))
        with col2:
            st.metric("ATS Rubric Items", len(st.session_state.ats_rubric))
        with col3:
            st.metric("Matched Statements", len(st.session_state.statements))
