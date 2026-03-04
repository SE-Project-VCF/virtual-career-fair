import { describe, it, expect } from "vitest";
import {
  formatResumeAsText,
  getBulletById,
  countChanges,
  formatPlainTextResume,
  type StructuredResume,
} from "../resumeFormatter";

const fullResume = {
  summary: { text: "Experienced software engineer." },
  skills: { items: ["React", "TypeScript", "Node.js"] },
  experience: [
    {
      expId: "exp1",
      company: "Acme Corp",
      title: "Software Engineer",
      start: "2021",
      end: "2023",
      bullets: [
        { bulletId: "b1", text: "Built APIs" },
        { bulletId: "b2", text: "Led migrations" },
      ],
    },
  ],
  projects: [
    {
      projId: "proj1",
      name: "My App",
      bullets: [
        { bulletId: "b3", text: "Deployed to AWS" },
      ],
    },
  ],
};

// ─── formatResumeAsText ───────────────────────────────────────────────────────

describe("formatResumeAsText", () => {
  it("includes summary section", () => {
    const text = formatResumeAsText(fullResume);
    expect(text).toContain("PROFESSIONAL SUMMARY");
    expect(text).toContain("Experienced software engineer.");
  });

  it("includes skills joined with bullet separator", () => {
    const text = formatResumeAsText(fullResume);
    expect(text).toContain("TECHNICAL SKILLS");
    expect(text).toContain("React • TypeScript • Node.js");
  });

  it("includes experience with title, company and date range", () => {
    const text = formatResumeAsText(fullResume);
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Software Engineer - Acme Corp (2021 - 2023)");
    expect(text).toContain("  • Built APIs");
    expect(text).toContain("  • Led migrations");
  });

  it("includes projects with bullets", () => {
    const text = formatResumeAsText(fullResume);
    expect(text).toContain("PROJECTS");
    expect(text).toContain("My App");
    expect(text).toContain("  • Deployed to AWS");
  });

  it("omits summary section when absent", () => {
    const text = formatResumeAsText({ skills: { items: ["Go"] } });
    expect(text).not.toContain("PROFESSIONAL SUMMARY");
  });

  it("omits skills section when empty", () => {
    const text = formatResumeAsText({ skills: { items: [] } });
    expect(text).not.toContain("TECHNICAL SKILLS");
  });

  it("omits experience section when absent", () => {
    const text = formatResumeAsText({ summary: { text: "Hi" } });
    expect(text).not.toContain("EXPERIENCE");
  });

  it("omits projects section when absent", () => {
    const text = formatResumeAsText({ summary: { text: "Hi" } });
    expect(text).not.toContain("PROJECTS");
  });

  it("handles experience entry with no end date", () => {
    const resume: StructuredResume = {
      experience: [
        {
          expId: "e1",
          company: "Corp",
          title: "Dev",
          start: "2020",
          end: "",
          bullets: [],
        },
      ],
    };
    const text = formatResumeAsText(resume);
    expect(text).toContain("Dev - Corp (2020)");
  });

  it("handles experience entry with no company", () => {
    const resume: StructuredResume = {
      experience: [
        {
          expId: "e1",
          company: "",
          title: "Freelancer",
          start: "2019",
          end: "2020",
          bullets: [],
        },
      ],
    };
    const text = formatResumeAsText(resume);
    expect(text).toContain("Freelancer (2019 - 2020)");
    expect(text).not.toContain(" - (");
  });

  it("returns empty string for empty resume", () => {
    expect(formatResumeAsText({})).toBe("");
  });
});

// ─── getBulletById ────────────────────────────────────────────────────────────

describe("getBulletById", () => {
  it("finds bullet in experience", () => {
    const result = getBulletById(fullResume, "b1");
    expect(result).toEqual({ text: "Built APIs", section: "experience", parentId: "exp1" });
  });

  it("finds bullet in projects", () => {
    const result = getBulletById(fullResume, "b3");
    expect(result).toEqual({ text: "Deployed to AWS", section: "projects", parentId: "proj1" });
  });

  it("returns null when bullet not found", () => {
    expect(getBulletById(fullResume, "nonexistent")).toBeNull();
  });

  it("returns null when resume has no experience or projects", () => {
    expect(getBulletById({}, "b1")).toBeNull();
  });
});

// ─── countChanges ─────────────────────────────────────────────────────────────

describe("countChanges", () => {
  it("returns zero counts when resumes are identical", () => {
    const result = countChanges(fullResume, fullResume);
    expect(result).toEqual({ removals: 0, edits: 0, insertions: 0 });
  });

  it("counts edited experience bullets", () => {
    const tailored: StructuredResume = {
      ...fullResume,
      experience: [
        {
          ...fullResume.experience[0],
          bullets: [
            { bulletId: "b1", text: "Built REST APIs" }, // changed
            { bulletId: "b2", text: "Led migrations" },
          ],
        },
      ],
    };
    const result = countChanges(fullResume, tailored);
    expect(result.edits).toBe(1);
    expect(result.removals).toBe(0);
    expect(result.insertions).toBe(0);
  });

  it("counts removed experience bullets", () => {
    const tailored: StructuredResume = {
      ...fullResume,
      experience: [
        {
          ...fullResume.experience[0],
          bullets: [{ bulletId: "b2", text: "Led migrations" }], // b1 removed
        },
      ],
    };
    const result = countChanges(fullResume, tailored);
    expect(result.removals).toBe(1);
  });

  it("counts inserted experience bullets", () => {
    const tailored: StructuredResume = {
      ...fullResume,
      experience: [
        {
          ...fullResume.experience[0],
          bullets: [
            { bulletId: "b1", text: "Built APIs" },
            { bulletId: "b2", text: "Led migrations" },
            { bulletId: "b99", text: "New bullet" }, // inserted
          ],
        },
      ],
    };
    const result = countChanges(fullResume, tailored);
    expect(result.insertions).toBe(1);
  });

  it("counts edited project bullets", () => {
    const tailored: StructuredResume = {
      ...fullResume,
      projects: [
        {
          ...fullResume.projects[0],
          bullets: [{ bulletId: "b3", text: "Deployed to GCP" }], // changed
        },
      ],
    };
    const result = countChanges(fullResume, tailored);
    expect(result.edits).toBe(1);
  });

  it("counts summary edit", () => {
    const tailored: StructuredResume = {
      ...fullResume,
      summary: { text: "Different summary." },
    };
    const result = countChanges(fullResume, tailored);
    expect(result.edits).toBe(1);
  });

  it("does not count summary edit when summaries match", () => {
    const result = countChanges(fullResume, fullResume);
    expect(result.edits).toBe(0);
  });

  it("handles empty resumes without error", () => {
    const result = countChanges({}, {});
    expect(result).toEqual({ removals: 0, edits: 0, insertions: 0 });
  });
});

// ─── formatPlainTextResume ────────────────────────────────────────────────────

describe("formatPlainTextResume", () => {
  it("returns input unchanged when already well-structured (>8 non-empty lines)", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");
    const result = formatPlainTextResume(lines);
    expect(result).toBe(lines.trim());
  });

  it("collapses consecutive blank lines in well-structured text", () => {
    const input = "Line 1\n\n\n\nLine 2\n" + Array.from({ length: 8 }, (_, i) => `L${i}`).join("\n");
    const result = formatPlainTextResume(input);
    // Should not have three consecutive blank lines
    expect(result).not.toMatch(/\n\n\n/);
  });

  it("returns trimmed text for short input (<=8 non-empty lines)", () => {
    const input = "  Short resume  ";
    const result = formatPlainTextResume(input);
    expect(result).toBe("Short resume");
  });

  it("returns input as-is when not a string", () => {
    // @ts-expect-error testing runtime guard
    expect(formatPlainTextResume(null)).toBe(null);
    // @ts-expect-error
    expect(formatPlainTextResume(undefined)).toBe(undefined);
  });

  it("returns empty string unchanged", () => {
    expect(formatPlainTextResume("")).toBe("");
  });
});
