"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Jake Ryan's classic resume — pre-built demo data
const JAKE_DATA = {
  profile: {
    name: "Jake Ryan",
    email: "jake@su.edu",
    phone: "123-456-7890",
    location: "Georgetown, TX",
    linkedin: "https://linkedin.com/in/jake",
    website: "https://github.com/jakeryan",
    summary: "Computer Science graduate with hands-on software engineering internship experience and research background. Skilled in Python, C++, JavaScript, and cloud tooling. Passionate about building developer tools and data-driven applications.",
    skills: ["Python", "C/C++", "JavaScript", "SQL", "HTML/CSS", "R", "Git", "Docker", "Travis CI", "Google Cloud Platform", "React", "Flask", "PostgreSQL"],
    awards: ["Dean's List 2019–2021"],
    certifications: [],
    education: [
      {
        sort_order: 0,
        school: "Southwestern University",
        degree: "B.S.",
        field_of_study: "Computer Science",
        location: "Georgetown, TX",
        start_date: "Aug 2018",
        end_date: "May 2021",
        gpa: "3.8 / 4.0",
        description: "",
        bullets: ["Relevant coursework: Data Structures, Algorithms, Operating Systems, Databases, Computer Networks"],
      },
      {
        sort_order: 1,
        school: "Blinn College",
        degree: "Associate's",
        field_of_study: "Liberal Arts",
        location: "Bryan, TX",
        start_date: "Aug 2016",
        end_date: "May 2018",
        gpa: "",
        description: "",
        bullets: [],
      },
    ],
  },
  activities: [
    {
      bullet_id: "jake_work_001",
      entry_type: "work",
      job_title: "Software Engineer Intern",
      company: "Apple",
      dates_worked: "Jan 2021 – Aug 2021",
      location: "Cupertino, CA",
      situation: "The developer tools team needed to improve CI/CD pipeline performance and reduce build times that were slowing down 50+ engineers across multiple product teams.",
      action: "Developed RESTful APIs in Node.js to expose build metrics to internal dashboards, wrote Python automation scripts to parallelize test execution, and refactored legacy shell scripts to reduce redundant steps in the pipeline.",
      impact: "Reduced average build time by 35% and improved developer productivity measurably. Automation scripts adopted by two additional teams.",
      extracted_skills: ["Node.js", "Python", "REST APIs", "CI/CD", "Shell scripting", "Git"],
    },
    {
      bullet_id: "jake_work_002",
      entry_type: "work",
      job_title: "Undergraduate Research Assistant",
      company: "Southwestern University",
      dates_worked: "Jun 2020 – May 2021",
      location: "Georgetown, TX",
      situation: "Professor needed assistance processing large genomics datasets and running statistical analyses to support ongoing machine learning research publications.",
      action: "Built data ingestion pipelines in Python (pandas, NumPy) to clean and normalize datasets of 1M+ rows, ran regression and classification experiments in R, and co-authored methodology sections of research papers.",
      impact: "Contributed to 2 published conference papers. Data pipeline reduced preprocessing time from 4 hours to 20 minutes.",
      extracted_skills: ["Python", "pandas", "NumPy", "R", "Data analysis", "Machine learning", "Research"],
    },
    {
      bullet_id: "jake_project_001",
      entry_type: "project",
      job_title: "Gitlytics — Full-Stack Web App",
      company: "Personal Project",
      dates_worked: "Jun 2020 – Present",
      location: "",
      situation: "Teams lacked visibility into individual GitHub contribution patterns across collaborative repositories, making it hard to identify bottlenecks and recognize contributors.",
      action: "Built a full-stack application with a Flask REST backend and React frontend. Integrated GitHub OAuth for authentication, stored data in PostgreSQL, and built D3.js visualizations for contribution heatmaps and commit frequency charts.",
      impact: "Adopted by 3 university project teams. Visualizes contribution patterns across 20+ repositories. Starred 50+ times on GitHub.",
      extracted_skills: ["Python", "Flask", "React", "PostgreSQL", "D3.js", "OAuth", "REST APIs", "Git"],
    },
    {
      bullet_id: "jake_project_002",
      entry_type: "project",
      job_title: "Simple Platformer Game",
      company: "Course Project (CS 3500)",
      dates_worked: "Jan 2020 – May 2020",
      location: "",
      situation: "Course required building a non-trivial C++ application demonstrating OOP principles, memory management, and use of external libraries.",
      action: "Designed and implemented a 2D side-scrolling platformer in C++ using the SDL2 library. Built a custom physics engine for gravity and collision detection, implemented sprite animation state machines, and managed game state with a scene manager.",
      impact: "Received A grade. Codebase of 4,000+ lines demonstrating proficiency in OOP, memory management, and game loop architecture.",
      extracted_skills: ["C++", "SDL2", "Object-oriented programming", "Game development", "Physics simulation"],
    },
  ],
};

export default function WelcomeBox({ firstName }: { firstName?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parseAndRedirect(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/ingest/resume`,
        { method: "POST", body: form }
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const parsed = await res.json();
      sessionStorage.setItem("pendingResumeData", JSON.stringify(parsed));
      router.push("/activities");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    }
  }

  function tryJake() {
    sessionStorage.setItem("pendingResumeData", JSON.stringify(JAKE_DATA));
    router.push("/activities");
  }

  function goManual() {
    sessionStorage.setItem("setupMode", "manual");
    router.push("/activities");
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden mb-10">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-100">
        <h2 className="text-base font-semibold text-zinc-900">
          Welcome{firstName ? `, ${firstName}` : ""}! Let&apos;s get you set up.
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          To generate tailored resumes, we need to build your activity bank — a library of your work experiences, projects, and accomplishments. Choose how to get started:
        </p>
      </div>

      {/* Options */}
      <div className="divide-y divide-zinc-100">
        {/* Option 1: Upload resume */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">1</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900">Upload your existing resume</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              We&apos;ll extract your profile info, work history, and experiences automatically — then let you review before saving.
            </p>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <label className={`shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Parsing…" : "Upload resume"}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseAndRedirect(f); }}
            />
          </label>
        </div>

        {/* Option 2: Manual */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 text-xs font-semibold">2</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900">Add your information manually</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fill out your profile and add work experiences one by one. Takes about 10 minutes.
            </p>
          </div>
          <button
            onClick={goManual}
            className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Start manually
          </button>
        </div>
      </div>

      {/* Option 3: Jake's resume — text link */}
      <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100">
        <p className="text-xs text-zinc-500">
          Not ready to add your own info?{" "}
          <button onClick={tryJake} className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 transition-colors">
            Try a demo with a pre-built sample resume
          </button>{" "}
          to see how the tool works first.
        </p>
      </div>

      {/* Privacy disclaimer */}
      <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-200">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="font-medium text-zinc-500">Your privacy:</span> Uploaded resume files are processed immediately and never stored on our servers — only the extracted text is used. Your data is encrypted in transit and at rest. You can delete your profile and all associated data at any time from your account settings, and nothing will be retained or used after deletion.
        </p>
      </div>
    </div>
  );
}
