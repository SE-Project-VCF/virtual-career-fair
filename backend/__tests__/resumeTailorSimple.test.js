const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

const {
  generateResumeChanges,
  applyChanges,
  reformatResumeWithGemini,
} = require("../resumeTailorSimple");

describe("resumeTailorSimple", () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      generateResumeChanges("resume", "job description")
    ).rejects.toThrow(/missing gemini_api_key/i);
  });

  it("parses change array wrapped in markdown json block", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "```json\n[{\"type\":\"edit\",\"section\":\"Summary\",\"original\":\"A\",\"replacement\":\"B\",\"reason\":\"match\"}]\n```",
      },
    });

    const changes = await generateResumeChanges("resume text", "job text", "Engineer");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "edit", original: "A", replacement: "B" });
  });

  it("parses plain JSON response without markdown wrapping", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '[{"type":"add","section":"Skills","original":null,"replacement":"Docker","reason":"relevant"}]',
      },
    });

    const changes = await generateResumeChanges("resume", "job desc");
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("add");
  });

  it("parses JSON wrapped in generic code block", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '```\n[{"type":"remove","section":"Skills","original":"PHP","replacement":null,"reason":"not needed"}]\n```',
      },
    });

    const changes = await generateResumeChanges("resume", "job desc");
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("remove");
  });

  it("throws when Gemini returns a non-array JSON response", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"type":"edit"}',
      },
    });

    await expect(generateResumeChanges("resume", "job desc")).rejects.toThrow(
      /Failed to generate changes/
    );
  });

  it("uses the custom jobTitle parameter", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "[]" },
    });

    await generateResumeChanges("resume", "job desc", "Data Scientist");
    const promptArg = mockGenerateContent.mock.calls[0][0];
    expect(promptArg).toContain("Data Scientist");
  });

  it("defaults jobTitle to Software Engineer", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "[]" },
    });

    await generateResumeChanges("resume", "job desc");
    const promptArg = mockGenerateContent.mock.calls[0][0];
    expect(promptArg).toContain("Software Engineer");
  });

  it("applies approved changes in remove/edit/add order", async () => {
    const input = "Summary\nOld sentence\nSkills\nPython\n";
    const approved = [
      { type: "add", replacement: "Added line" },
      { type: "edit", original: "Old sentence", replacement: "New sentence" },
      { type: "remove", original: "Python" },
    ];

    const result = await applyChanges(input, approved);

    expect(result).toContain("New sentence");
    expect(result).not.toContain("Python");
    expect(result).toContain("Added line");
  });

  it("applies remove-only changes", async () => {
    const result = await applyChanges("Keep this\nRemove this\nEnd", [
      { type: "remove", original: "Remove this\n" },
    ]);
    expect(result).not.toContain("Remove this");
    expect(result).toContain("Keep this");
  });

  it("applies edit-only changes", async () => {
    const result = await applyChanges("Old text here", [
      { type: "edit", original: "Old text", replacement: "New text" },
    ]);
    expect(result).toBe("New text here");
  });

  it("applies add-only changes", async () => {
    const result = await applyChanges("Existing content", [
      { type: "add", replacement: "Appended content" },
    ]);
    expect(result).toContain("Existing content");
    expect(result).toContain("Appended content");
  });

  it("skips remove change when original is missing", async () => {
    const input = "Line one\nLine two";
    const result = await applyChanges(input, [
      { type: "remove", original: null },
    ]);
    expect(result).toBe(input);
  });

  it("skips edit change when original is missing", async () => {
    const input = "Line one";
    const result = await applyChanges(input, [
      { type: "edit", original: null, replacement: "New" },
    ]);
    expect(result).toBe(input);
  });

  it("skips edit change when replacement is missing", async () => {
    const input = "Line one";
    const result = await applyChanges(input, [
      { type: "edit", original: "Line one", replacement: null },
    ]);
    expect(result).toBe(input);
  });

  it("skips add change when replacement is missing", async () => {
    const input = "Line one";
    const result = await applyChanges(input, [{ type: "add", replacement: null }]);
    expect(result).toBe(input);
  });

  it("collapses three or more consecutive newlines to double newlines", async () => {
    const input = "Section A\n\n\n\n\nSection B\n\n\n\nSection C";
    const result = await applyChanges(input, []);
    expect(result).not.toMatch(/\n\n\n/);
    expect(result).toContain("Section A\n\nSection B\n\nSection C");
  });

  it("handles empty approvedChanges array", async () => {
    const input = "Resume text";
    const result = await applyChanges(input, []);
    expect(result).toBe("Resume text");
  });

  it("reformats resume text via Gemini", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => "PROFESSIONAL SUMMARY\nFormatted resume",
      },
    });

    const formatted = await reformatResumeWithGemini("raw resume");
    expect(formatted).toContain("PROFESSIONAL SUMMARY");
  });

  it("returns original text when Gemini reformat fails", async () => {
    mockGenerateContent.mockRejectedValue(new Error("API down"));

    const original = "raw resume text";
    const formatted = await reformatResumeWithGemini(original);

    expect(formatted).toBe(original);
  });

  it("throws when GEMINI_API_KEY is missing for reformatResumeWithGemini", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(reformatResumeWithGemini("resume text")).rejects.toThrow(
      /missing gemini_api_key/i
    );
  });
});
/**
 * Tests for resumeTailorSimple.js
 * Covers all three exported functions:
 *   - generateResumeChanges
 *   - applyChanges
 *   - reformatResumeWithGemini
 */

const {
  generateResumeChanges,
  applyChanges,
  reformatResumeWithGemini,
} = require("../resumeTailorSimple");

// ---------------------------------------------------------------------------
// Shared mock factory – recreated per describe block as needed
// ---------------------------------------------------------------------------

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(function () {
    this.getGenerativeModel = jest.fn(() => ({
      generateContent: (...args) => mockGenerateContent(...args),
    }));
    return this;
  }),
}));

// ---------------------------------------------------------------------------
// generateResumeChanges
// ---------------------------------------------------------------------------

describe("generateResumeChanges", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-123";
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      generateResumeChanges("resume text", "job desc")
    ).rejects.toThrow("Missing GEMINI_API_KEY");
  });

  it("returns a parsed array of changes on success", async () => {
    const changes = [
      {
        type: "edit",
        section: "Summary",
        original: "Experienced engineer",
        replacement: "Experienced engineer with React expertise",
        reason: "Highlights React",
      },
    ];
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => JSON.stringify(changes) },
    });

    const result = await generateResumeChanges("resume text", "job desc");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("edit");
    expect(result[0].section).toBe("Summary");
  });

  it("returns multiple change types in a single response", async () => {
    const changes = [
      { type: "add", section: "Skills", original: null, replacement: "Docker", reason: "r1" },
      { type: "remove", section: "Summary", original: "Old text", replacement: null, reason: "r2" },
      { type: "edit", section: "Experience", original: "managed", replacement: "led", reason: "r3" },
    ];
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => JSON.stringify(changes) },
    });

    const result = await generateResumeChanges("resume", "desc", "Senior SWE");

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.type)).toEqual(["add", "remove", "edit"]);
  });

  it("strips ```json code-fence wrapper before parsing", async () => {
    const changes = [{ type: "add", section: "Skills", original: null, replacement: "AWS", reason: "cloud" }];
    const wrapped = "```json\n" + JSON.stringify(changes) + "\n```";
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => wrapped },
    });

    const result = await generateResumeChanges("resume", "desc");

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].replacement).toBe("AWS");
  });

  it("strips plain ``` code-fence wrapper before parsing", async () => {
    const changes = [{ type: "edit", section: "Skills", original: "JS", replacement: "JavaScript", reason: "full name" }];
    const wrapped = "```\n" + JSON.stringify(changes) + "\n```";
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => wrapped },
    });

    const result = await generateResumeChanges("resume", "desc");

    expect(result[0].original).toBe("JS");
  });

  it("throws when the parsed response is not an array", async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => JSON.stringify({ error: "not an array" }) },
    });

    await expect(generateResumeChanges("resume", "desc")).rejects.toThrow(
      "Failed to generate changes"
    );
  });

  it("throws when the Gemini response contains invalid JSON", async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => "this is not json at all" },
    });

    await expect(generateResumeChanges("resume", "desc")).rejects.toThrow(
      "Failed to generate changes"
    );
  });

  it("throws when generateContent itself rejects", async () => {
    mockGenerateContent = jest.fn().mockRejectedValue(new Error("API quota exceeded"));

    await expect(generateResumeChanges("resume", "desc")).rejects.toThrow(
      "Failed to generate changes: API quota exceeded"
    );
  });

  it("uses the default job title when none is supplied", async () => {
    const changes = [{ type: "edit", section: "Skills", original: "A", replacement: "B", reason: "r" }];
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => JSON.stringify(changes) },
    });

    const result = await generateResumeChanges("resume text", "job desc");

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it("handles an empty array of changes without error", async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => "[]" },
    });

    const result = await generateResumeChanges("resume", "desc");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyChanges
// ---------------------------------------------------------------------------

describe("applyChanges", () => {
  const baseResume = "John Doe\nExperienced engineer\nSkills: JavaScript\nOld section";

  it("applies a single edit change", async () => {
    const changes = [
      { type: "edit", original: "Experienced engineer", replacement: "Experienced React engineer" },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).toContain("Experienced React engineer");
    expect(result).not.toContain("Experienced engineer");
  });

  it("applies a single remove change", async () => {
    const changes = [
      { type: "remove", original: "Old section" },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).not.toContain("Old section");
  });

  it("applies a single add change", async () => {
    const changes = [
      { type: "add", replacement: "Docker, Kubernetes" },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).toContain("Docker, Kubernetes");
  });

  it("applies multiple changes of different types", async () => {
    const changes = [
      { type: "edit", original: "Experienced engineer", replacement: "Senior engineer" },
      { type: "remove", original: "Old section" },
      { type: "add", replacement: "New certification" },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).toContain("Senior engineer");
    expect(result).not.toContain("Old section");
    expect(result).toContain("New certification");
  });

  it("sorts changes: remove first, then edit, then add", async () => {
    const applied = [];
    const resume = "AAA BBB CCC";
    const changes = [
      { type: "add", replacement: "NEW" },
      { type: "edit", original: "BBB", replacement: "XXX" },
      { type: "remove", original: "CCC" },
    ];
    const result = await applyChanges(resume, changes);
    // remove runs first so CCC is gone, then edit replaces BBB with XXX, then NEW is appended
    expect(result).toContain("XXX");
    expect(result).not.toContain("CCC");
    expect(result).toContain("NEW");
  });

  it("returns the original resume when changes array is empty", async () => {
    const result = await applyChanges(baseResume, []);
    expect(result).toBe(baseResume.trim());
  });

  it("skips edit change when original is missing", async () => {
    const changes = [
      { type: "edit", original: null, replacement: "Something" },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).not.toContain("Something");
  });

  it("skips edit change when replacement is missing", async () => {
    const changes = [
      { type: "edit", original: "Experienced engineer", replacement: null },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).toContain("Experienced engineer");
  });

  it("skips remove change when original is missing", async () => {
    const changes = [
      { type: "remove", original: null },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).toBe(baseResume.trim());
  });

  it("skips add change when replacement is missing", async () => {
    const changes = [
      { type: "add", replacement: null },
    ];
    const result = await applyChanges(baseResume, changes);
    expect(result).not.toContain("null");
  });

  it("collapses three or more consecutive blank lines into double newline", async () => {
    const spaceyResume = "Section A\n\n\n\nSection B";
    const result = await applyChanges(spaceyResume, []);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("Section A");
    expect(result).toContain("Section B");
  });

  it("trims leading and trailing whitespace", async () => {
    const padded = "   \n\nContent here\n\n   ";
    const result = await applyChanges(padded, []);
    expect(result).toBe("Content here");
  });

  it("add change appends content on a new line", async () => {
    const simple = "Line one";
    const changes = [{ type: "add", replacement: "Line two" }];
    const result = await applyChanges(simple, changes);
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
    const lines = result.split("\n");
    const oneIdx = lines.findIndex((l) => l.includes("Line one"));
    const twoIdx = lines.findIndex((l) => l.includes("Line two"));
    expect(twoIdx).toBeGreaterThan(oneIdx);
  });
});

// ---------------------------------------------------------------------------
// reformatResumeWithGemini
// ---------------------------------------------------------------------------

describe("reformatResumeWithGemini", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-123";
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    console.log.mockRestore();
    console.error.mockRestore();
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(reformatResumeWithGemini("resume text")).rejects.toThrow(
      "Missing GEMINI_API_KEY"
    );
  });

  it("returns formatted text from Gemini on success", async () => {
    const formatted = "PROFESSIONAL SUMMARY\n\nExperienced engineer\n\nSKILLS\n\nJavaScript, React";
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => `  ${formatted}  ` },
    });

    const result = await reformatResumeWithGemini("raw resume content");

    expect(result).toBe(formatted);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("logs start and success messages", async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => "Formatted resume" },
    });

    await reformatResumeWithGemini("some resume");

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[REFORMAT] Reformatting resume")
    );
    expect(console.log).toHaveBeenCalledWith("[REFORMAT] Resume formatted successfully");
  });

  it("falls back to original text when generateContent throws", async () => {
    const originalText = "Original unformatted resume";
    mockGenerateContent = jest.fn().mockRejectedValue(new Error("Gemini unavailable"));

    const result = await reformatResumeWithGemini(originalText);

    expect(result).toBe(originalText);
  });

  it("logs error and fallback messages on Gemini failure", async () => {
    mockGenerateContent = jest.fn().mockRejectedValue(new Error("Timeout"));

    await reformatResumeWithGemini("resume content");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[REFORMAT] Error reformatting resume with Gemini"),
      expect.any(Error)
    );
    expect(console.log).toHaveBeenCalledWith("[REFORMAT] Falling back to original text");
  });

  it("includes resume character length in the start log", async () => {
    const resumeText = "A".repeat(250);
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => "Formatted" },
    });

    await reformatResumeWithGemini(resumeText);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("250 chars")
    );
  });

  it("handles empty resume text without error", async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => "" },
    });

    const result = await reformatResumeWithGemini("");

    expect(result).toBe("");
  });
});
