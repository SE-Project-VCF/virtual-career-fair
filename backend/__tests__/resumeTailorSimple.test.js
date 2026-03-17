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
