"use client";

import type { ResumeDesign } from "@/lib/design";
import { designToStyles, ptToPx } from "@/lib/design";

interface Props {
  design: ResumeDesign;
}

export default function ResumePreview({ design }: Props) {
  const s = designToStyles(design);
  const { marginX, marginY, showDividers, accentColor } = design;

  // Convert inches to px for the preview (screen dpi = 96)
  const mxPx = Math.round(marginX * 96);
  const myPx = Math.round(marginY * 96);

  // Section header style merges the element style + optional divider colour override
  const sectionHeaderStyle = {
    ...s.sectionHeader,
    borderBottom: showDividers ? `1px solid ${accentColor}` : "none",
    display: "block" as const,
    marginTop: 18,
    marginBottom: 4,
    paddingBottom: 2,
  };

  const gap1: React.CSSProperties = { margin: "1px 0" };
  const gap2: React.CSSProperties = { margin: "2px 0" };

  return (
    <div
      className="bg-white shadow-[0_2px_20px_rgba(0,0,0,0.10)]"
      style={{
        width: design.pageSize === "A4" ? 793 : 816,
        minHeight: design.pageSize === "A4" ? 1122 : 1056,
        paddingLeft:  mxPx,
        paddingRight: mxPx,
        paddingTop:   myPx,
        paddingBottom: myPx,
        boxSizing: "border-box",
        fontFamily: s.body.fontFamily,
      }}
    >
      {/* ── Name & Contact ── */}
      <div style={{ textAlign: s.nameContact.textAlign, marginBottom: 6 }}>
        <div style={{ ...s.nameContact, borderBottom: "none" }}>
          Alexandra J. Morrison
        </div>
        <div style={{ ...s.body, marginTop: 2, textAlign: s.nameContact.textAlign }}>
          San Francisco, CA &nbsp;·&nbsp; alex.morrison@email.com &nbsp;·&nbsp; (415) 555-0192 &nbsp;·&nbsp; linkedin.com/in/alexmorrison
        </div>
      </div>

      {/* ── Summary ── */}
      {design.sections.find((s) => s.id === "summary")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((s) => s.id === "summary")?.label ?? "Summary"}
          </div>
          <p style={{ ...s.body, ...gap2 }}>
            Results-driven software engineer with 6+ years of experience building scalable web
            applications. Passionate about clean architecture, developer experience, and
            cross-functional collaboration. Proven track record of delivering high-impact
            features that improve user engagement.
          </p>
        </>
      )}

      {/* ── Experience ── */}
      {design.sections.find((sec) => sec.id === "experience")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "experience")?.label ?? "Experience"}
          </div>

          {/* Job 1 */}
          <div style={{ ...s.roleHeader, ...gap1, display: "flex", justifyContent: "space-between" }}>
            <span>Senior Software Engineer &nbsp;|&nbsp; Acme Corp</span>
            <span style={{ fontWeight: "400", color: s.body.color }}>Jan 2022 – Present</span>
          </div>
          <div style={{ ...s.body, ...gap2, color: "#555" }}>San Francisco, CA</div>
          <ul style={{ paddingLeft: ptToPx(14), margin: "3px 0 8px" }}>
            {["Architected a real-time data pipeline reducing report latency by 62%.",
              "Led migration from monolith to microservices, cutting deployment time by 40%.",
              "Mentored 4 junior engineers through weekly code reviews and pair programming."]
              .map((b, i) => (
                <li key={i} style={{ ...s.bullet, ...gap1 }}>{b}</li>
              ))}
          </ul>

          {/* Job 2 */}
          <div style={{ ...s.roleHeader, ...gap1, display: "flex", justifyContent: "space-between" }}>
            <span>Software Engineer &nbsp;|&nbsp; Beta Startup</span>
            <span style={{ fontWeight: "400", color: s.body.color }}>Jun 2019 – Dec 2021</span>
          </div>
          <div style={{ ...s.body, ...gap2, color: "#555" }}>Remote</div>
          <ul style={{ paddingLeft: ptToPx(14), margin: "3px 0 8px" }}>
            {["Built customer-facing dashboard used by 20,000+ daily active users.",
              "Reduced API response time by 35% through query optimisation and caching."]
              .map((b, i) => (
                <li key={i} style={{ ...s.bullet, ...gap1 }}>{b}</li>
              ))}
          </ul>
        </>
      )}

      {/* ── Education ── */}
      {design.sections.find((sec) => sec.id === "education")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "education")?.label ?? "Education"}
          </div>
          <div style={{ ...s.educationHeader, ...gap1, display: "flex", justifyContent: "space-between" }}>
            <span>B.S. Computer Science &nbsp;|&nbsp; University of California, Berkeley</span>
            <span style={{ fontWeight: "400", color: s.body.color }}>May 2019</span>
          </div>
          <div style={{ ...s.body, ...gap2, color: "#555" }}>GPA: 3.8 / 4.0 &nbsp;·&nbsp; Dean&apos;s List</div>
        </>
      )}

      {/* ── Projects ── */}
      {design.sections.find((sec) => sec.id === "projects")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "projects")?.label ?? "Projects"}
          </div>
          <div style={{ ...s.projectHeader, ...gap1, display: "flex", justifyContent: "space-between" }}>
            <span>OpenMetrics &nbsp;|&nbsp; TypeScript, Go, PostgreSQL</span>
            <span style={{ fontWeight: "400", color: s.body.color }}>2023</span>
          </div>
          <ul style={{ paddingLeft: ptToPx(14), margin: "3px 0 8px" }}>
            {["Open-source observability toolkit with 1,200+ GitHub stars.",
              "Integrated with Prometheus & Grafana for live alerting dashboards."]
              .map((b, i) => (
                <li key={i} style={{ ...s.bullet, ...gap1 }}>{b}</li>
              ))}
          </ul>
        </>
      )}

      {/* ── Volunteer ── */}
      {design.sections.find((sec) => sec.id === "volunteer")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "volunteer")?.label ?? "Volunteer"}
          </div>
          <div style={{ ...s.volunteerHeader, ...gap1, display: "flex", justifyContent: "space-between" }}>
            <span>Coding Instructor &nbsp;|&nbsp; Code for Good</span>
            <span style={{ fontWeight: "400", color: s.body.color }}>2020 – Present</span>
          </div>
          <ul style={{ paddingLeft: ptToPx(14), margin: "3px 0 8px" }}>
            <li style={{ ...s.bullet, ...gap1 }}>Teach weekly intro-to-Python classes to underprivileged youth.</li>
          </ul>
        </>
      )}

      {/* ── Skills ── */}
      {design.sections.find((sec) => sec.id === "skills")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "skills")?.label ?? "Skills"}
          </div>
          {[
            { cat: "Languages",   items: "TypeScript, Python, Go, SQL, Rust" },
            { cat: "Frameworks",  items: "React, Next.js, FastAPI, Node.js" },
            { cat: "Tools",       items: "Docker, Kubernetes, Terraform, GitHub Actions" },
          ].map(({ cat, items }) => (
            <div key={cat} style={{ ...s.skillsBlock, ...gap1 }}>
              <strong>{cat}:</strong> {items}
            </div>
          ))}
        </>
      )}

      {/* ── Certifications ── */}
      {design.sections.find((sec) => sec.id === "certifications")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "certifications")?.label ?? "Certifications"}
          </div>
          {["AWS Certified Solutions Architect – Associate (2023)",
            "Google Professional Cloud Developer (2022)"]
            .map((c, i) => (
              <div key={i} style={{ ...s.body, ...gap1 }}>• {c}</div>
            ))}
        </>
      )}

      {/* ── Awards ── */}
      {design.sections.find((sec) => sec.id === "awards")?.enabled && (
        <>
          <div style={sectionHeaderStyle}>
            {design.sections.find((sec) => sec.id === "awards")?.label ?? "Awards"}
          </div>
          {["Hackathon First Place – TechCrunch Disrupt 2022",
            "Employee of the Quarter – Acme Corp Q3 2023"]
            .map((a, i) => (
              <div key={i} style={{ ...s.body, ...gap1 }}>• {a}</div>
            ))}
        </>
      )}
    </div>
  );
}
