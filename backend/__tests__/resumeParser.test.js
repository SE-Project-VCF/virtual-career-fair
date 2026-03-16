jest.mock("mammoth", () => ({
  extractRawText: jest.fn(),
}));

const mammoth = require("mammoth");
const { toStructuredResume, extractTextFromBuffer } = require("../resumeParser");

describe("resumeParser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses summary, skills, experience, and projects from sectioned text", () => {
    const raw = `Professional Summary
Built production-ready web apps.

Technical Skills
JavaScript, React, Node.js, SQL

Experience
Software Engineer - Acme Corp | 2022 - Present
Developed REST APIs and frontend features
Improved performance by 20%

Projects
Career Fair Platform
Built an event platform for students and employers`;

    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text).toMatch(/production-ready web apps/i);
    expect(parsed.skills.items).toEqual(
      expect.arrayContaining(["JavaScript", "React", "Node.js", "SQL"])
    );
    expect(parsed.experience.length).toBeGreaterThan(0);
    expect(parsed.experience[0].bullets.length).toBeGreaterThan(0);
    expect(parsed.projects.length).toBeGreaterThan(0);
  });

  it("falls back and still extracts skills from comma-separated lines", () => {
    const raw = `Name\nContact\nJava, Python, TypeScript, Docker, Kubernetes\nOther content`;
    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items).toEqual(
      expect.arrayContaining(["Java", "Python", "TypeScript", "Docker", "Kubernetes"])
    );
  });

  it("extracts DOCX text through mammoth", async () => {
    mammoth.extractRawText.mockResolvedValue({ value: "Docx resume text" });

    const text = await extractTextFromBuffer(Buffer.from("dummy"), "resume.docx");

    expect(text).toBe("Docx resume text");
    expect(mammoth.extractRawText).toHaveBeenCalledTimes(1);
  });
});
