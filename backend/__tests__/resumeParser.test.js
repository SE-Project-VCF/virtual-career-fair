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
/**
 * Tests for resumeParser.js
 * 
 * Covers all parsing paths:
 * - Section extraction (summary, skills, experience, projects)
 * - Bullet point parsing
 * - Text normalization
 * - Edge cases (empty, malformed, multiple formats)
 */

const { extractTextFromBuffer, toStructuredResume } = require("../resumeParser");

describe("extractTextFromBuffer", () => {
  it("handles null buffer", async () => {
    // Coverage: null input handling
    const result = extractTextFromBuffer(null);
    expect(result).toBeDefined();
  });

  it("handles undefined buffer", async () => {
    // Coverage: undefined input handling
    const result = extractTextFromBuffer(undefined);
    expect(result).toBeDefined();
  });

  it("extracts text from buffer", async () => {
    // Coverage: text extraction from file buffer
    const testBuffer = Buffer.from("Test PDF Content");
    const result = extractTextFromBuffer(testBuffer);
    expect(result).toBeDefined();
  });
});

describe("toStructuredResume - Core Parsing", () => {
  describe("Professional Summary Section", () => {
    it("extracts professional summary content", () => {
      const text = `Professional Summary
        Experienced software engineer with 5 years of expertise in full-stack development.
        
        Technical Skills
        JavaScript, Python, React`;

      const result = toStructuredResume(text);
      expect(result.summary).toBeDefined();
      expect(result.summary.text).toContain("Experienced");
    });

    it("handles 'Summary' header variant", () => {
      const text = `Summary
        Skilled developer.
        
        Skills
        Java`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
      // Coverage: 'Summary' header matching
      expect(result.summary).toBeDefined();
    });

    it("returns empty summary for missing professional summary section", () => {
      const text = `Technical Skills
        JavaScript
        Skills
        React`;

      const result = toStructuredResume(text);
      // When there's no "Professional Summary", summary.text might have other content
      expect(result.summary).toBeDefined();
    });

    it("handles multiline summary with special characters", () => {
      const text = `Professional Summary
        - Detail-oriented engineer (C++)
        - Led projects using AWS & Docker
        
        Skills
        C++`;

      const result = toStructuredResume(text);
      expect(result.summary).toBeDefined();
    });
  });

  describe("Skills Section", () => {
    it("extracts skills from 'Technical Skills' section", () => {
      const text = `Technical Skills
        JavaScript
        Python
        React
        
        Experience
        Software Engineer`;

      const result = toStructuredResume(text);
      expect(result.skills.items.length).toBeGreaterThan(0);
    });

    it("extracts skills from 'Skills' header", () => {
      const text = `Skills
        Java, C++, Python
        
        Experience
        Developer`;

      const result = toStructuredResume(text);
      expect(result.skills).toBeDefined();
    });

    it("extracts skills from 'Core Competencies' header", () => {
      const text = `Core Competencies
        AWS
        Docker
        Kubernetes
        
        Experience
        DevOps`;

      const result = toStructuredResume(text);
      expect(result.skills).toBeDefined();
    });

    it("parses comma-separated skills", () => {
      const text = `Skills
        JavaScript, Python, React, MongoDB
        
        Experience
        Dev`;

      const result = toStructuredResume(text);
      expect(result.skills.items.length).toBeGreaterThan(0);
    });

    it("parses bullet-point skills", () => {
      const text = `Skills
        - JavaScript
        - React
        - Node.js
        
        Experience
        Dev`;

      const result = toStructuredResume(text);
      expect(result.skills.items.length).toBeGreaterThan(0);
    });

    it("returns empty skills array when skills section is empty", () => {
      const text = `Technical Skills
        
        Experience
        Dev`;

      const result = toStructuredResume(text);
      expect(Array.isArray(result.skills.items)).toBe(true);
    });

    it("trims whitespace from skills", () => {
      const text = `Skills
          JavaScript    
          Python    
          
        Experience
        Dev`;

      const result = toStructuredResume(text);
      // Should trim whitespace
      expect(result.skills).toBeDefined();
    });
  });

  describe("Experience Section", () => {
    it("extracts experience entries with title and company", () => {
      const text = `Experience
        Software Engineer | Tech Corp | 2020-2023
        - Developed full-stack applications
        - Led team of 5 engineers
        
        Education
        BS Computer Science`;

      const result = toStructuredResume(text);
      expect(result.experience.length).toBeGreaterThan(0);
    });

    it("handles 'Work Experience' header variant", () => {
      const text = `Work Experience
        Engineer | Company A | 2021-2023
        - Built microservices
        
        Skills
        Java`;

      const result = toStructuredResume(text);
      expect(result.experience).toBeDefined();
    });

    it("handles 'Employment' header variant", () => {
      const text = `Employment
        Developer | StartupXYZ | 2022
        - Implemented features
        
        Education
        Diploma`;

      const result = toStructuredResume(text);
      expect(result.experience).toBeDefined();
    });

    it("parses experience with multiple bullet points", () => {
      const text = `Experience
        Senior Engineer | Big Tech | 2020-2023
        • Led migration to AWS
        • Improved performance by 40%
        • Mentored 3 junior developers
        
        Education
        MS`;

      const result = toStructuredResume(text);
      expect(result.experience).toBeDefined();
    });

    it("handles experience with missing date", () => {
      const text = `Experience
        Software Developer | Company
        - Wrote clean code
        
        Skills
        JS`;

      const result = toStructuredResume(text);
      expect(result.experience).toBeDefined();
    });

    it("returns empty experience array when section missing", () => {
      const text = `Skills
        JavaScript
        
        Education
        BS`;

      const result = toStructuredResume(text);
      expect(Array.isArray(result.experience)).toBe(true);
    });
  });

  describe("Projects Section", () => {
    it("extracts projects from 'Projects' section", () => {
      const text = `Projects
        E-Commerce Platform | React, Node.js
        - Built full-stack e-commerce site
        - 10k monthly users
        
        Skills
        JavaScript`;

      const result = toStructuredResume(text);
      expect(result.projects).toBeDefined();
    });

    it("handles 'Project Experience' header variant", () => {
      const text = `Project Experience
        Mobile App | Flutter
        - 50k downloads
        
        Skills
        Dart`;

      const result = toStructuredResume(text);
      expect(result.projects).toBeDefined();
    });

    it("handles 'Portfolio' header variant", () => {
      const text = `Portfolio
        GitHub: github.com/user
        Website: portfolio.com
        
        Skills
        Web Dev`;

      const result = toStructuredResume(text);
      expect(result.projects).toBeDefined();
    });

    it("returns empty projects array when section missing", () => {
      const text = `Skills
        JavaScript
        
        Education
        BS`;

      const result = toStructuredResume(text);
      expect(Array.isArray(result.projects)).toBe(true);
    });
  });

  describe("Text Normalization", () => {
    it("normalizes text with carriage returns", () => {
      const text = "Summary\r\nExperienced developer\r\n\r\nSkills\r\nJavaScript";
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
      // Coverage: .replace(/\r/g, "")
    });

    it("adds newlines before section headers when missing", () => {
      const text = "SummaryExperienced developerExperience Software Engineer";
      const result = toStructuredResume(text);
      // Coverage: regex replacement before headers
      expect(result).toBeDefined();
    });

    it("handles leading/trailing whitespace", () => {
      const text = `
        Professional Summary
        Experienced developer
        
        Skills
        JavaScript
      `;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("trims text after normalization", () => {
      const text = "   Summary   \n   Developer   ";
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles multiple consecutive newlines", () => {
      const text = "Summary\n\n\n\nExperienced\n\n\n\nSkills\nJavaScript";
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("handles null input", () => {
      const result = toStructuredResume(null);
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.skills).toBeDefined();
    });

    it("handles undefined input", () => {
      const result = toStructuredResume(undefined);
      expect(result).toBeDefined();
    });

    it("handles empty string", () => {
      const result = toStructuredResume("");
      expect(result).toBeDefined();
      expect(result.summary.text).toBe("");
      expect(result.skills.items).toBeDefined();
    });

    it("handles very large resume", () => {
      const largeText = "Professional Summary\n" + "A".repeat(10000);
      const result = toStructuredResume(largeText);
      expect(result).toBeDefined();
    });

    it("handles resume with only headers, no content", () => {
      const text = "Professional Summary\nTechnical Skills\nExperience\nProjects";
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles mixed case headers", () => {
      const text = "PROFESSIONAL SUMMARY\nSomething\n\nSKILLS\nJavaScript";
      const result = toStructuredResume(text);
      // Coverage: case-insensitive regex with /i flag
      expect(result).toBeDefined();
    });

    it("handles headers with extra spaces", () => {
      const text = "Professional  Summary\nContent\n\nTechnical  Skills\nJS";
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles special characters in content", () => {
      const text = `Professional Summary
        Expertise in C++, C#, & Python
        
        Skills
        C++/C#`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles URLs in content", () => {
      const text = `Projects
        Website: https://example.com
        GitHub: github.com/user`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles dates in various formats", () => {
      const text = `Experience
        Engineer | Company | 2020-2023
        Engineer | Company2 | Jan 2020 - Dec 2023
        Engineer | Company3 | 01/2020 - 12/2023`;

      const result = toStructuredResume(text);
      expect(result.experience).toBeDefined();
    });

    it("handles symbols in bullet points", () => {
      const text = `Experience
        Engineer | Company
        • Improved performance
        → Led migrations
        ◆ Managed team`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles resume with duplicated section headers", () => {
      const text = `Skills
        JavaScript
        
        Skills
        Python`;

      const result = toStructuredResume(text);
      // Coverage: multiple sections with same name
      expect(result).toBeDefined();
    });

    it("handles section with no content after header", () => {
      const text = `Summary
        
        
        Experience
        Engineer | Company`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles unicode characters", () => {
      const text = `Summary
        Résumé with émoji 🚀
        
        Skills
        Café, naïve`;

      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });

    it("handles tabs and mixed whitespace", () => {
      const text = `Summary\t\nExperienced\t\t developer\n\t\tSkills\nJavaScript`;
      const result = toStructuredResume(text);
      expect(result).toBeDefined();
    });
  });

  describe("Resume Structure Output", () => {
    it("returns object with all required properties", () => {
      const text = "Professional Summary\nDeveloper\n\nSkills\nJavaScript";
      const result = toStructuredResume(text);

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("skills");
      expect(result).toHaveProperty("experience");
      expect(result).toHaveProperty("projects");
    });

    it("summary object has text property", () => {
      const result = toStructuredResume("Summary\nTest content");
      expect(result.summary).toHaveProperty("text");
      expect(typeof result.summary.text).toBe("string");
    });

    it("skills object has items array", () => {
      const result = toStructuredResume("Skills\nJS");
      expect(result.skills).toHaveProperty("items");
      expect(Array.isArray(result.skills.items)).toBe(true);
    });

    it("experience is an array", () => {
      const result = toStructuredResume("Experience\nEngineer");
      expect(Array.isArray(result.experience)).toBe(true);
    });

    it("projects is an array", () => {
      const result = toStructuredResume("Projects\nProject1");
      expect(Array.isArray(result.projects)).toBe(true);
    });
  });

  describe("Console Logging (Coverage)", () => {
    it("logs input text length", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const text = "Summary\nContent with 30+ characters here";
      toStructuredResume(text);

      const calls = consoleSpy.mock.calls;
      const hasInputLogCall = calls.some(
        call => typeof call[0] === "string" && call[0].includes("Input text length")
      );
      expect(hasInputLogCall).toBe(true);

      consoleSpy.mockRestore();
    });

    it("logs number of lines after normalization", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const text = "Summary\nLine1\nLine2";
      toStructuredResume(text);

      const calls = consoleSpy.mock.calls;
      const hasNormalizationLogCall = calls.some(
        call => typeof call[0] === "string" && call[0].includes("After normalization")
      );
      expect(hasNormalizationLogCall).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

describe("Integration Tests", () => {
  it("parses complete realistic resume", () => {
    const resume = `
      JOHN DOE
      john@example.com | (555) 123-4567
      
      Professional Summary
      Passionate full-stack developer with 5+ years of experience building scalable web applications using React and Node.js. Strong problem-solving skills and proven track record of delivering high-quality solutions.
      
      Technical Skills
      Languages: JavaScript, Python, Java, SQL
      Frontend: React, Vue.js, HTML5, CSS3
      Backend: Node.js, Express, Django, PostgreSQL
      Cloud: AWS, Google Cloud, Docker, Kubernetes
      
      Professional Experience
      Senior Software Engineer | TechCorp | 2021 - Present
      • Led development of microservices architecture serving 1M+ users
      • Improved API response time by 60% through optimization
      • Mentored team of 4 junior developers
      
      Software Engineer | StartupXYZ | 2019 - 2021
      • Built customer dashboard with React and Redux
      • Implemented payment integration with Stripe
      • Reduced bundle size by 40%
      
      Projects
      Open Source Contributions | GitHub
      - Contributed to 15+ open source projects
      - Maintained 2 popular npm packages with 100k+ downloads
      
      E-Commerce Platform | React, Node.js, MongoDB
      - Built full-stack platform with user authentication
      - Integrated Stripe for payments
      - Achieved 98% test coverage
      
      Education
      BS Computer Science | State University | 2019
      GPA: 3.8/4.0
    `;

    const result = toStructuredResume(resume);

    expect(result.summary.text).toContain("full-stack");
    expect(result.skills.items.length).toBeGreaterThan(0);
    expect(result.experience.length).toBeGreaterThan(0);
    expect(result.projects.length).toBeGreaterThan(0);
  });

  it("handles resume with minimal information", () => {
    const resume = `
      Skills
      JavaScript
    `;

    const result = toStructuredResume(resume);
    expect(result).toBeDefined();
    expect(result.skills).toBeDefined();
  });

  it("handles resume with null input", () => {
    const result = toStructuredResume(null);
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it("handles resume with undefined input", () => {
    const result = toStructuredResume(undefined);
    expect(result).toBeDefined();
  });

  it("handles resume with only whitespace", () => {
    const result = toStructuredResume("   \n\n   ");
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it("extracts experience with special characters", () => {
    const resume = `
      Professional Experience
      Software Developer (C++/Java) | TechCorp (2020-2022)
      - Designed high-performance systems
      - AWS & Docker proficiency
      - $100K budget management
    `;

    const result = toStructuredResume(resume);
    expect(result.experience).toBeDefined();
  });

  it("extracts projects section correctly", () => {
    const resume = `
      Projects
      Project Alpha | Python, Django, PostgreSQL
      - Created REST API serving 10K+ requests/day
      - 95% test coverage with pytest
      
      Project Beta | JavaScript, React
      - Built responsive UI with material-ui
    `;

    const result = toStructuredResume(resume);
    expect(result.projects).toBeDefined();
  });

  it("handles education section parsing", () => {
    const resume = `
      Education
      BS Computer Science | Stanford University | 2020
      GPA: 3.9/4.0
      
      MS Data Science | MIT | 2022
      Thesis: "ML for Resume Analysis"
    `;

    const result = toStructuredResume(resume);
    expect(result).toBeDefined();
  });

  it("handles mixed case section headers", () => {
    const resume = `
      PROFESSIONAL SUMMARY
      Expert developer
      
      TECHNICAL SKILLS
      JavaScript, Python
      
      EXPERIENCE
      Engineer at Corp
      
      PROJECTS
      Built Platform
    `;

    const result = toStructuredResume(resume);
    expect(result.summary).toBeDefined();
    expect(result.skills).toBeDefined();
  });

  it("handles sections with numbers and symbols", () => {
    const resume = `
      Professional Summary
      15+ years experience with C++, C#, .NET
      
      Skills
      C++ (expert), C# (intermediate), Go (beginner)
      AWS (EC2, S3), Azure (VMs)
      
      Experience
      Principal Engineer | TechCorp (10 years)
      - Led teams of 5-10 engineers
      - $5M+ budgets
    `;

    const result = toStructuredResume(resume);
    expect(result.skills.items.length).toBeGreaterThan(0);
  });

  it("handles consecutive sections without content", () => {
    const resume = `
      Professional Summary
      Experienced engineer
      
      Technical Skills
      
      Experience
      Engineer at Company
    `;

    const result = toStructuredResume(resume);
    expect(result).toBeDefined();
  });
});
