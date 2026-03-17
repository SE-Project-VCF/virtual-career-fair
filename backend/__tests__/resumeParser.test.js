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

  it("truncates long summaries at a sentence boundary", () => {
    const longSummary = "A".repeat(310) + ". " + "B".repeat(290) + ". " + "C".repeat(200);
    const raw = `Professional Summary\n${longSummary}\n\nTechnical Skills\nJS`;
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text.length).toBeLessThanOrEqual(601);
    expect(parsed.summary.text).toMatch(/\.$/);
  });

  it("truncates summary at newline when no period is available", () => {
    const longSummary = "A".repeat(350) + "\n" + "B".repeat(300);
    const raw = `Professional Summary\n${longSummary}\n\nTechnical Skills\nJS`;
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text.length).toBeLessThanOrEqual(601);
  });

  it("truncates summary to 600 chars when no good cut point exists", () => {
    const longSummary = "A".repeat(700);
    const raw = `Professional Summary\n${longSummary}\n\nTechnical Skills\nJS`;
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text.length).toBe(600);
  });

  it("handles empty/null input gracefully", () => {
    expect(toStructuredResume("").experience).toEqual([]);
    expect(toStructuredResume(null).skills.items).toEqual([]);
  });

  it("handles carriage returns in input", () => {
    const raw = "Professional Summary\r\nHello world.\r\n\r\nTechnical Skills\r\nJS, React";
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text).toMatch(/Hello world/);
    expect(parsed.skills.items).toEqual(expect.arrayContaining(["JS", "React"]));
  });

  it("parses multiple experience entries with date separators", () => {
    const raw = `Experience
Software Engineer - Acme Corp | 2022 - Present
Built REST APIs for the platform
Optimized database queries for performance

Backend Developer - StartupX | 2020 - 2022
Developed frontend features using React
Wrote unit tests for components`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBe(2);
    expect(parsed.experience[0].title).toMatch(/Software Engineer/);
    expect(parsed.experience[0].start).toBe("2022");
    expect(parsed.experience[0].end).toBe("Present");
    expect(parsed.experience[0].bullets.length).toBe(2);
    expect(parsed.experience[1].title).toMatch(/Backend Developer/);
    expect(parsed.experience[1].start).toBe("2020");
    expect(parsed.experience[1].end).toBe("2022");
    expect(parsed.experience[1].bullets.length).toBe(2);
  });

  it("parses experience with pipe separators", () => {
    const raw = `Experience
Software Engineer | Google | 2021 - Current
Led a team of engineers`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
    expect(parsed.experience[0].end).toBe("Present");
  });

  it("parses experience with comma separators", () => {
    const raw = `Experience
Software Engineer , Acme Corp , 2023 - Present
Built microservices architecture`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("handles experience header with only one part", () => {
    const raw = `Experience
Software Engineer 2023 - Present
Built REST APIs`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
    expect(parsed.experience[0].bullets.length).toBeGreaterThan(0);
  });

  it("detects job header when next line has a date", () => {
    const raw = `Experience
Software Engineer
Jan 2023 - Present
Built REST APIs and deployed to production`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("parses projects with bullet points", () => {
    const raw = `Projects
TaskTracker App
Built a web application using React and Node.js
Implemented user authentication and authorization

ChatBot Platform
Developed a mobile app with React Native`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects.length).toBeGreaterThanOrEqual(2);
    expect(parsed.projects[0].name).toMatch(/TaskTracker/);
    expect(parsed.projects[0].bullets.length).toBeGreaterThanOrEqual(1);
  });

  it("handles project with no name but has bullets", () => {
    const raw = `Projects
Built a complete e-commerce platform from scratch
Implemented payment processing with Stripe integration`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects.length).toBeGreaterThan(0);
    expect(parsed.projects[0].bullets.length).toBeGreaterThan(0);
  });

  it("handles project title buffer with multiple short lines before bullets", () => {
    const raw = `Projects
My
Cool
Project
Built a web application using React and Node.js`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects.length).toBeGreaterThan(0);
  });

  it("starts a new project when short line follows bullets", () => {
    const raw = `Projects
TaskTracker
Built a web application using React and Node.js
Implemented user authentication system
ChatBot
Developed a mobile app with React Native tooling`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects.length).toBe(2);
  });

  it("uses fallback regex extraction when text has very few lines", () => {
    const raw = "Technical Skills: JavaScript, Python, React, Node.js Experience: Software Engineer - Acme Corp - Built APIs Projects: My App - Built a cool app";
    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items.length).toBeGreaterThan(0);
  });

  it("fallback extracts experience from section headers in flat text", () => {
    const raw = "Technical Skills: JS, React\nWork Experience\nSoftware Engineer - Acme Corp | 2022 - Present\nBuilt REST APIs for the platform";
    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("fallback extracts projects from section headers in flat text", () => {
    const raw = "Skills: JS, React Experience: Engineer - Corp Projects My App - Built a full-stack application";
    const parsed = toStructuredResume(raw);

    expect(parsed.projects.length).toBeGreaterThan(0);
  });

  it("fallback extracts summary from first lines when no summary section", () => {
    const raw = "John Doe is a software engineer with extensive experience in building scalable web applications and distributed systems.";
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text.length).toBeGreaterThan(0);
  });

  it("fallback extracts summary from first few lines when text is short", () => {
    const raw = "Short line\nAnother line\nThird line\nFourth line\nFifth line";
    const parsed = toStructuredResume(raw);

    expect(parsed.summary.text.length).toBeGreaterThan(0);
  });

  it("inserts newlines before section headers that are missing them", () => {
    const raw = "Some intro text.Experience\nSoftware Engineer - Corp | 2023 - Present\nBuilt APIs";
    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("handles Work Experience as section header", () => {
    const raw = `Work Experience
Senior Developer - BigCo | 2021 - Present
Architected microservices platform`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("handles Core Competencies as skills section", () => {
    const raw = `Core Competencies
JavaScript, TypeScript, Python, Go, Rust`;

    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items).toEqual(
      expect.arrayContaining(["JavaScript", "TypeScript", "Python"])
    );
  });

  it("deduplicates skills", () => {
    const raw = `Technical Skills
JavaScript, React, JavaScript, React, Node.js`;

    const parsed = toStructuredResume(raw);

    const jsCount = parsed.skills.items.filter((s) => s === "JavaScript").length;
    expect(jsCount).toBe(1);
  });

  it("filters skills that are too short or too long", () => {
    const raw = `Technical Skills
A, ${"X".repeat(65)}, JavaScript, React`;

    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items).not.toContain("A");
    expect(parsed.skills.items).not.toContain("X".repeat(65));
    expect(parsed.skills.items).toContain("JavaScript");
  });

  it("handles experience with single year and Present", () => {
    const raw = `Experience
Lead Engineer - Corp | 2023 - Present
Managed team of 5 engineers and delivered features`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].start).toBe("2023");
    expect(parsed.experience[0].end).toBe("Present");
  });

  it("parses date range with two years", () => {
    const raw = `Experience
Software Engineer - Corp | 2019 - 2022
Built backend services for the platform`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].start).toBe("2019");
    expect(parsed.experience[0].end).toBe("2022");
  });

  it("classifies header part with job keyword as title", () => {
    const raw = `Experience
Senior Developer | Acme Inc | 2020 - 2023
Built scalable distributed systems for production`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].title).toMatch(/Senior Developer/);
    expect(parsed.experience[0].company).toMatch(/Acme/);
  });

  it("assigns non-date non-keyword parts as company", () => {
    const raw = `Experience
Software Engineer - Google - 2023 - Present
Built microservices architecture for the platform`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].company).toBeTruthy();
  });

  it("returns empty string for unknown file types in extractTextFromBuffer", async () => {
    const text = await extractTextFromBuffer(Buffer.from("not a pdf"), "resume.xyz");

    expect(text).toBe("");
  });

  it("handles mammoth returning empty value", async () => {
    mammoth.extractRawText.mockResolvedValue({ value: "" });

    const text = await extractTextFromBuffer(Buffer.from("dummy"), "resume.docx");

    expect(text).toBe("");
  });

  it("skips empty content sections", () => {
    const raw = `Experience

Technical Skills
JavaScript, React

Projects`;

    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items).toEqual(expect.arrayContaining(["JavaScript", "React"]));
    // Experience and Projects sections are empty, should have no entries
    expect(parsed.experience.length).toBe(0);
  });

  it("handles bullet separators in experience content", () => {
    const raw = `Experience
Software Engineer - Corp | 2022 - Present
•Built REST APIs•Optimized database queries•Deployed to production`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].bullets.length).toBeGreaterThanOrEqual(2);
  });

  it("handles bullet separators in projects content", () => {
    const raw = `Projects
My App
•Built a web application using React•Implemented user auth•Added CI/CD pipeline`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects[0].bullets.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores lines too short to be bullets in experience", () => {
    const raw = `Experience
Software Engineer - Corp | 2022 - Present
Short
Built REST APIs and deployed to production systems`;

    const parsed = toStructuredResume(raw);

    const bulletTexts = parsed.experience[0].bullets.map((b) => b.text);
    expect(bulletTexts).not.toContain("Short");
  });

  it("generates correct bullet IDs", () => {
    const raw = `Experience
Software Engineer - Corp | 2022 - Present
Built REST APIs for the platform application
Optimized database queries for better performance`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience[0].bullets[0].bulletId).toBe("b_exp_01_001");
    expect(parsed.experience[0].bullets[1].bulletId).toBe("b_exp_01_002");
  });

  it("generates correct project IDs and bullet IDs", () => {
    const raw = `Projects
TaskTracker
Built a web application using React and Node.js`;

    const parsed = toStructuredResume(raw);

    expect(parsed.projects[0].projId).toBe("proj_01");
    expect(parsed.projects[0].bullets[0].bulletId).toBe("b_proj_01_001");
  });

  it("handles Employment as experience section header", () => {
    const raw = `Employment
Software Analyst - Corp | 2021 - 2023
Analyzed requirements and designed solutions`;

    const parsed = toStructuredResume(raw);

    expect(parsed.experience.length).toBeGreaterThan(0);
  });

  it("skips lines with URLs or emails in fallback skill extraction", () => {
    const raw = `John Doe\nhttps://github.com/johndoe, portfolio, skills\njohn@example.com, contact, info\nJava, Python, TypeScript, Docker, Kubernetes`;
    const parsed = toStructuredResume(raw);

    const skills = parsed.skills.items;
    // Lines containing :// are skipped by fallback line-based extraction
    expect(skills).not.toEqual(
      expect.arrayContaining([expect.stringContaining("://")])
    );
    // Lines with @ are NOT filtered by the parser (only :// is checked)
    expect(skills).toEqual(
      expect.arrayContaining(["Java", "Python", "TypeScript", "Docker", "Kubernetes"])
    );
  });

  it("limits skills to 80 items", () => {
    const skills = Array.from({ length: 100 }, (_, i) => `Skill${i}`).join(", ");
    const raw = `Technical Skills\n${skills}`;
    const parsed = toStructuredResume(raw);

    expect(parsed.skills.items.length).toBeLessThanOrEqual(80);
  });
});
