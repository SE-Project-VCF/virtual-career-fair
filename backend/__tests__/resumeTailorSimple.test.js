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
});
