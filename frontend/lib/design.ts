import type { CSSProperties } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ElementStyle {
  fontFamily: string;    // e.g. "Georgia, 'Times New Roman', serif"
  fontSize: number;      // pt
  fontWeight: string;    // "400" | "600" | "700"
  color: string;         // hex e.g. "#111111"
  textTransform: string; // "none" | "uppercase" | "capitalize"
  letterSpacing: string; // e.g. "0em" | "0.08em"
  lineHeight: number;    // e.g. 1.4
  textAlign: string;     // "left" | "center" | "right"
  borderBottom: string;  // "none" | "1px solid #bbbbbb"
}

export interface SectionDef {
  id: string;       // internal id used by pipeline: "experience" | "education" | "skills" | "projects" | "awards" | "certifications" | "volunteer"
  label: string;    // display alias shown in resume output, e.g. "Personal Projects"
  enabled: boolean;
}

export interface ResumeDesign {
  pages: 1 | 2;
  pageSize: "letter" | "A4";
  marginX: number;      // inches (left/right)
  marginY: number;      // inches (top/bottom)
  accentColor: string;  // hex, used for dividers / highlights
  showDividers: boolean;
  templateId?: "simple" | "modern";
  sections: SectionDef[];
  elements: {
    nameContact: ElementStyle;     // Full name + contact line at top of resume
    sectionHeader: ElementStyle;   // ALL CAPS section titles (EXPERIENCE, EDUCATION, …)
    roleHeader: ElementStyle;      // Job title | Company | Dates line (work experience)
    educationHeader: ElementStyle; // School | Degree | Dates line
    projectHeader: ElementStyle;   // Project name | Tech | Dates line
    volunteerHeader: ElementStyle; // Role | Organization | Dates line
    skillsBlock: ElementStyle;     // Skills section content (category labels + item lists)
    body: ElementStyle;            // General body / description text
    bullet: ElementStyle;          // Bullet list items (• …)
  };
}

// ── Defaults ───────────────────────────────────────────────────────────────────
// Mirrors the hardcoded CSS in ResumeEditor.tsx exactly.

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS  = "Arial, Helvetica, sans-serif";

const baseText: ElementStyle = {
  fontFamily:    SERIF,
  fontSize:      10.5,
  fontWeight:    "400",
  color:         "#222222",
  textTransform: "none",
  letterSpacing: "0em",
  lineHeight:    1.55,
  textAlign:     "left",
  borderBottom:  "none",
};

export const DEFAULT_DESIGN: ResumeDesign = {
  pages:        1,
  pageSize:     "letter",
  marginX:      1.0,
  marginY:      0.75,
  accentColor:  "#bbbbbb",
  showDividers: true,
  sections: [
    { id: "summary",          label: "Summary",          enabled: true },
    { id: "experience",       label: "Experience",        enabled: true },
    { id: "education",        label: "Education",         enabled: true },
    { id: "skills",           label: "Skills",            enabled: true },
    { id: "projects",         label: "Projects",          enabled: true },
    { id: "certifications",   label: "Certifications",    enabled: true },
    { id: "awards",           label: "Awards",            enabled: true },
    { id: "volunteer",        label: "Volunteer",         enabled: true },
  ],
  elements: {
    nameContact: {
      ...baseText,
      fontFamily:    SERIF,
      fontSize:      16,
      fontWeight:    "700",
      color:         "#111111",
      textAlign:     "center",
      lineHeight:    1.3,
    },
    sectionHeader: {
      ...baseText,
      fontFamily:    SANS,
      fontSize:      9,
      fontWeight:    "700",
      color:         "#111111",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      borderBottom:  "1px solid #bbbbbb",
      lineHeight:    1.4,
    },
    roleHeader: {
      ...baseText,
      fontSize:   10.5,
      fontWeight: "600",
      color:      "#111111",
    },
    educationHeader: {
      ...baseText,
      fontSize:   10.5,
      fontWeight: "600",
      color:      "#111111",
    },
    projectHeader: {
      ...baseText,
      fontSize:   10.5,
      fontWeight: "600",
      color:      "#111111",
    },
    volunteerHeader: {
      ...baseText,
      fontSize:   10.5,
      fontWeight: "600",
      color:      "#111111",
    },
    skillsBlock: {
      ...baseText,
      fontSize:   10.5,
      lineHeight: 1.55,
    },
    body: {
      ...baseText,
    },
    bullet: {
      ...baseText,
    },
  },
};

// ── Preset templates ───────────────────────────────────────────────────────────

const TNR = "'Times New Roman', Georgia, serif";

/** Jake's Resume style: classic Times New Roman, black dividers, bold role headers. */
export const SIMPLE_DESIGN: ResumeDesign = {
  pages:        1,
  pageSize:     "letter",
  marginX:      0.75,
  marginY:      0.75,
  accentColor:  "#000000",
  showDividers: true,
  templateId:   "simple",
  sections:     DEFAULT_DESIGN.sections,
  elements: {
    nameContact: {
      fontFamily:    TNR,
      fontSize:      18,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.2,
      textAlign:     "center",
      borderBottom:  "none",
    },
    sectionHeader: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "uppercase",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "1px solid #000000",
    },
    roleHeader: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    educationHeader: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    projectHeader: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    volunteerHeader: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "700",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    skillsBlock: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    body: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    bullet: {
      fontFamily:    TNR,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         "#000000",
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
  },
};

const CAL   = "Calibri, 'Gill Sans', Arial, sans-serif";
const BLUE  = "#1d4ed8";
const SLATE = "#1e293b";
const MUTED = "#334155";

/** Modern / wiki-style: Calibri, left-aligned name, blue section headers. */
export const MODERN_DESIGN: ResumeDesign = {
  pages:        1,
  pageSize:     "letter",
  marginX:      0.75,
  marginY:      0.75,
  accentColor:  BLUE,
  showDividers: true,
  templateId:   "modern",
  sections:     DEFAULT_DESIGN.sections,
  elements: {
    nameContact: {
      fontFamily:    CAL,
      fontSize:      22,
      fontWeight:    "400",
      color:         SLATE,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.2,
      textAlign:     "left",
      borderBottom:  "none",
    },
    sectionHeader: {
      fontFamily:    CAL,
      fontSize:      11,
      fontWeight:    "700",
      color:         BLUE,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  `2px solid ${BLUE}`,
    },
    roleHeader: {
      fontFamily:    CAL,
      fontSize:      11,
      fontWeight:    "600",
      color:         SLATE,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    educationHeader: {
      fontFamily:    CAL,
      fontSize:      11,
      fontWeight:    "600",
      color:         SLATE,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    projectHeader: {
      fontFamily:    CAL,
      fontSize:      11,
      fontWeight:    "600",
      color:         SLATE,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    volunteerHeader: {
      fontFamily:    CAL,
      fontSize:      11,
      fontWeight:    "600",
      color:         SLATE,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.4,
      textAlign:     "left",
      borderBottom:  "none",
    },
    skillsBlock: {
      fontFamily:    CAL,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         MUTED,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.5,
      textAlign:     "left",
      borderBottom:  "none",
    },
    body: {
      fontFamily:    CAL,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         MUTED,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.5,
      textAlign:     "left",
      borderBottom:  "none",
    },
    bullet: {
      fontFamily:    CAL,
      fontSize:      10.5,
      fontWeight:    "400",
      color:         MUTED,
      textTransform: "none",
      letterSpacing: "0em",
      lineHeight:    1.5,
      textAlign:     "left",
      borderBottom:  "none",
    },
  },
};

// ── CSS helpers ────────────────────────────────────────────────────────────────

/** Convert pt to px (96 dpi screen, 72 pt/in → 1pt = 4/3 px) */
export function ptToPx(pt: number): number {
  return Math.round((pt * 96) / 72);
}

export interface ElementCSS {
  fontFamily:    string;
  fontSize:      string;   // e.g. "14px"
  fontWeight:    string;
  color:         string;
  textTransform: CSSProperties["textTransform"];
  letterSpacing: string;
  lineHeight:    string;
  textAlign:     CSSProperties["textAlign"];
  borderBottom:  string;
}

/** Convert an ElementStyle to React inline-style-compatible CSS values. */
export function elementToCSS(s: ElementStyle): ElementCSS {
  return {
    fontFamily:    s.fontFamily,
    fontSize:      `${ptToPx(s.fontSize)}px`,
    fontWeight:    s.fontWeight,
    color:         s.color,
    textTransform: s.textTransform as CSSProperties["textTransform"],
    letterSpacing: s.letterSpacing,
    lineHeight:    String(s.lineHeight),
    textAlign:     s.textAlign as CSSProperties["textAlign"],
    borderBottom:  s.borderBottom,
  };
}

/** Return CSSProperties for every element type in the design. */
export function designToStyles(d: ResumeDesign): Record<keyof ResumeDesign["elements"], ElementCSS> {
  return {
    nameContact:     elementToCSS(d.elements.nameContact),
    sectionHeader:   elementToCSS(d.elements.sectionHeader),
    roleHeader:      elementToCSS(d.elements.roleHeader),
    educationHeader: elementToCSS(d.elements.educationHeader),
    projectHeader:   elementToCSS(d.elements.projectHeader),
    volunteerHeader: elementToCSS(d.elements.volunteerHeader),
    skillsBlock:     elementToCSS(d.elements.skillsBlock),
    body:            elementToCSS(d.elements.body),
    bullet:          elementToCSS(d.elements.bullet),
  };
}
