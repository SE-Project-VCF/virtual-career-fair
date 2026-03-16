/**
 * __tests__/patchValidator.test.js
 *
 * Tests for the PatchValidator class
 */

const PatchValidator = require("../patchValidator");

describe("PatchValidator", () => {
  const mockResume = {
    summary: {
      text: "Experienced full-stack developer with 5 years of experience in web development."
    },
    skills: {
      items: ["JavaScript", "React", "Node.js", "Python", "SQL"]
    },
    experience: [
      {
        id: "exp_0",
        title: "Senior Developer",
        company: "TechCorp",
        bullets: [
          { bulletId: "bullet_1", text: "Built web applications using React and Node.js" },
          { bulletId: "bullet_2", text: "Led team of 5 engineers to deliver projects on time" }
        ]
      }
    ],
    projects: [
      {
        id: "proj_0",
        title: "E-commerce Platform",
        bullets: [
          { bulletId: "bullet_p1", text: "Developed full-stack e-commerce solution with payment integration" }
        ]
      }
    ]
  };

  const jobDescription = `
    We are looking for a React developer with experience in building scalable web applications.
    Must have experience with: React, JavaScript, REST APIs, PostgreSQL
    Prefer: TypeScript, Node.js, AWS
  `;

  let validator;

  beforeEach(() => {
    validator = new PatchValidator(mockResume, jobDescription);
  });

  // --- constructor ---

  test("should initialize validator with resume and job description", () => {
    expect(validator.resume).toEqual(mockResume);
    expect(validator.jobKeywords.has("react")).toBe(true);
    expect(validator.jobKeywords.has("scalable")).toBe(true);
  });

  test("should initialize with empty job description", () => {
    const v = new PatchValidator(mockResume);
    expect(v.jobKeywords.size).toBe(0);
    expect(v.jobDescription).toBe("");
  });

  test("should handle null resume fields gracefully", () => {
    const v = new PatchValidator({ experience: null, projects: null });
    expect(v.bulletMap.size).toBe(0);
    expect(v.summaryText).toBe("");
  });

  // --- buildBulletMap ---

  test("should build bullet map correctly", () => {
    expect(validator.bulletMap.has("bullet_1")).toBe(true);
    expect(validator.bulletMap.get("bullet_1").text).toBe("Built web applications using React and Node.js");
    expect(validator.bulletMap.get("bullet_1").parentType).toBe("experience");
  });

  test("should include project bullets in bullet map", () => {
    expect(validator.bulletMap.has("bullet_p1")).toBe(true);
    expect(validator.bulletMap.get("bullet_p1").parentType).toBe("projects");
  });

  test("should handle empty experience and projects arrays", () => {
    const v = new PatchValidator({ experience: [], projects: [], summary: { text: "" } });
    expect(v.bulletMap.size).toBe(0);
  });

  // --- extractJobKeywords ---

  test("should filter out short words from job keywords", () => {
    expect(validator.jobKeywords.has("we")).toBe(false);
    expect(validator.jobKeywords.has("in")).toBe(false);
    expect(validator.jobKeywords.has("for")).toBe(false);
  });

  test("should strip non-alphanumeric chars from keywords", () => {
    const v = new PatchValidator(mockResume, "experience with: React!");
    expect(v.jobKeywords.has("react")).toBe(true);
    expect(v.jobKeywords.has("experience")).toBe(true);
  });

  // --- validatePatches ---

  test("should return error for non-array input", () => {
    const result = validator.validatePatches("not an array");
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("not an array");
  });

  test("should handle empty array", () => {
    const result = validator.validatePatches([]);
    expect(result.valid).toBe(false);
    expect(result.summary.validPatches).toBe(0);
  });

  test("should validate a good replace_bullet patch", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1", section: "experience" },
      beforeText: "Built web applications using React and Node.js",
      afterText: "Built scalable React web applications with Node.js backend APIs",
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(true);
    expect(result.patches.length).toBe(1);
    expect(result.patches[0].confidence).toBeGreaterThan(0.5);
  });

  test("should reject patch with wrong beforeText", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1", section: "experience" },
      beforeText: "Wrong text that doesn't match",
      afterText: "New text",
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.level === "error")).toBe(true);
  });

  // --- _validateBasicStructure ---

  test("should reject patch missing opId", () => {
    const result = validator.validatePatches([{
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      afterText: "text"
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing opId");
  });

  test("should reject patch missing type", () => {
    const result = validator.validatePatches([{
      opId: "p1",
      target: { bulletId: "bullet_1" },
      afterText: "text"
    }]);
    expect(result.valid).toBe(false);
  });

  test("should reject patch missing target", () => {
    const result = validator.validatePatches([{
      opId: "p1",
      type: "replace_bullet",
      afterText: "text"
    }]);
    expect(result.valid).toBe(false);
  });

  test("should reject unknown patch type", () => {
    const result = validator.validatePatches([{
      opId: "p1",
      type: "unknown_type",
      target: {},
      afterText: "text"
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("Unknown patch type");
  });

  test("should reject non-removal patch with empty afterText", () => {
    const result = validator.validatePatches([{
      opId: "p1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      afterText: ""
    }]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("afterText must be non-empty");
  });

  test("should allow removal patches without afterText", () => {
    const result = validator.validatePatches([{
      opId: "p1",
      type: "remove_skill",
      target: { skillName: "Python" },
    }]);
    expect(result.valid).toBe(true);
  });

  // --- _validateLengthSanity ---

  test("should warn when afterText is much longer than beforeText", () => {
    const patches = [{
      opId: "p1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      beforeText: "Built web applications using React and Node.js",
      afterText: "Built highly scalable, cloud-native, microservices-based web applications using React and Node.js with comprehensive testing, CI/CD pipelines, and production monitoring dashboards for enterprise clients across multiple continents",
    }];

    const result = validator.validatePatches(patches);
    const lengthConcern = result.patches[0]?.concerns?.find(c => c.type === "length");
    expect(lengthConcern).toBeDefined();
  });

  test("should flag when replacement is significantly shorter (truncation)", () => {
    const patches = [{
      opId: "p1",
      type: "replace_bullet",
      target: { bulletId: "bullet_2" },
      beforeText: "Led team of 5 engineers to deliver projects on time",
      afterText: "Led team",
    }];

    const result = validator.validatePatches(patches);
    const truncConcern = result.patches[0]?.concerns?.find(c => c.type === "truncation");
    expect(truncConcern).toBeDefined();
  });

  test("should skip length check for removal types", () => {
    const patches = [{
      opId: "p1",
      type: "remove_bullet",
      target: { bulletId: "bullet_1" },
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(true);
  });

  // --- detectHallucinations ---

  test("should detect hallucinated metrics in replace operations", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_2", section: "experience" },
      beforeText: "Led team of 5 engineers to deliver projects on time",
      afterText: "Led team of 5 engineers to deliver 50+ projects on time with 99% on-time delivery",
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.message.includes("metric"))).toBe(true);
  });

  test("should skip hallucination check for removal patches", () => {
    const result = validator.detectHallucinations({
      type: "remove_skill",
      target: { skillName: "Python" }
    });
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(1);
  });

  test("should flag inserted bullets with metrics", () => {
    const result = validator.detectHallucinations({
      type: "insert_bullet",
      afterText: "Achieved 95% test coverage across all services"
    });
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("flag");
  });

  test("should not flag insert_bullet without metrics", () => {
    const result = validator.detectHallucinations({
      type: "insert_bullet",
      afterText: "Built REST APIs using Node.js and Express"
    });
    expect(result.detected).toBe(false);
  });

  test("should not flag replace when same metrics are preserved", () => {
    const result = validator.detectHallucinations({
      type: "replace_bullet",
      beforeText: "Led team of 5 engineers",
      afterText: "Led cross-functional team of 5 engineers"
    });
    expect(result.detected).toBe(false);
  });

  // --- extractMetrics ---

  test("should extract years", () => {
    const metrics = validator.extractMetrics("Worked from 2020 to 2024");
    expect(metrics).toContain("2020");
    expect(metrics).toContain("2024");
  });

  test("should extract year ranges", () => {
    const metrics = validator.extractMetrics("Experience 2020-2024");
    expect(metrics).toContain("2020-2024");
  });

  test("should extract percentages", () => {
    const metrics = validator.extractMetrics("Improved performance by 50%");
    expect(metrics).toContain("50%");
  });

  test("should extract money tokens", () => {
    const metrics = validator.extractMetrics("Saved $100K in costs and generated $5M revenue");
    expect(metrics).toContain("$100K");
    expect(metrics).toContain("$5M");
  });

  test("should extract version numbers", () => {
    const metrics = validator.extractMetrics("Upgraded from v2.1.0 to 3.2");
    expect(metrics).toContain("v2.1.0");
    expect(metrics).toContain("3.2");
  });

  test("should extract ordinal metrics", () => {
    const metrics = validator.extractMetrics("Won first 10 competitions and top 5 ranking");
    expect(metrics).toContain("first 10");
    expect(metrics).toContain("top 5");
  });

  test("should extract usage metrics", () => {
    const metrics = validator.extractMetrics("Reached 1000+ users globally");
    expect(metrics).toContain("1000+ users");
  });

  // --- _isDigits ---

  test("should return false for empty string", () => {
    expect(validator._isDigits("")).toBe(false);
  });

  test("should return false for null", () => {
    expect(validator._isDigits(null)).toBe(false);
  });

  test("should return true for valid digits", () => {
    expect(validator._isDigits("12345")).toBe(true);
  });

  test("should return false for non-digits", () => {
    expect(validator._isDigits("12a3")).toBe(false);
  });

  // --- _isYear ---

  test("should recognize valid year", () => {
    expect(validator._isYear("2024")).toBe(true);
  });

  test("should reject non-year strings", () => {
    expect(validator._isYear("24")).toBe(false);
    expect(validator._isYear("abcd")).toBe(false);
  });

  // --- _isYearOrYearRange ---

  test("should recognize year range", () => {
    expect(validator._isYearOrYearRange("2020-2024")).toBe(true);
  });

  test("should reject invalid year range", () => {
    expect(validator._isYearOrYearRange("20-24")).toBe(false);
    expect(validator._isYearOrYearRange("abc")).toBe(false);
  });

  // --- _isPercentage ---

  test("should recognize valid percentage", () => {
    expect(validator._isPercentage("50%")).toBe(true);
    expect(validator._isPercentage("99.5%")).toBe(true);
  });

  test("should reject invalid percentage", () => {
    expect(validator._isPercentage("50")).toBe(false);
    expect(validator._isPercentage("%")).toBe(false);
    expect(validator._isPercentage("abc%")).toBe(false);
  });

  // --- _isMoneyToken ---

  test("should recognize money with K suffix", () => {
    expect(validator._isMoneyToken("$100K")).toBe(true);
  });

  test("should recognize money with M suffix", () => {
    expect(validator._isMoneyToken("$5M")).toBe(true);
  });

  test("should recognize money without suffix", () => {
    expect(validator._isMoneyToken("$500")).toBe(true);
  });

  test("should reject too-short money token", () => {
    expect(validator._isMoneyToken("$")).toBe(false);
  });

  test("should reject non-money token", () => {
    expect(validator._isMoneyToken("100")).toBe(false);
  });

  // --- _isVersionToken ---

  test("should recognize version with v prefix", () => {
    expect(validator._isVersionToken("v2.1.0")).toBe(true);
  });

  test("should recognize version without prefix", () => {
    expect(validator._isVersionToken("3.2")).toBe(true);
  });

  test("should reject single-part version", () => {
    expect(validator._isVersionToken("3")).toBe(false);
  });

  test("should reject 4+ part version", () => {
    expect(validator._isVersionToken("1.2.3.4")).toBe(false);
  });

  test("should reject version with empty parts", () => {
    expect(validator._isVersionToken("1..2")).toBe(false);
  });

  // --- validateByType ---

  test("should validate replace_bullet missing bulletId", () => {
    const result = validator.validateByType({
      type: "replace_bullet",
      target: {},
      beforeText: "text",
      afterText: "new text"
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing target.bulletId");
  });

  test("should validate replace_bullet with non-existent bullet", () => {
    const result = validator.validateByType({
      type: "replace_bullet",
      target: { bulletId: "nonexistent" },
      beforeText: "text",
      afterText: "new text"
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("Bullet not found");
  });

  test("should validate insert_bullet missing parentId", () => {
    const result = validator.validateByType({
      type: "insert_bullet",
      target: {},
      afterText: "new bullet"
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing target.parentId");
  });

  test("should validate remove_skill missing skillName", () => {
    const result = validator.validateByType({
      type: "remove_skill",
      target: {}
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing target.skillName");
  });

  test("should warn when skill not found in resume", () => {
    const result = validator.validateByType({
      type: "remove_skill",
      target: { skillName: "Haskell" }
    });
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeLessThan(1);
    expect(result.issues[0].message).toContain("not found in resume");
  });

  test("should validate remove_skill when skill exists", () => {
    const result = validator.validateByType({
      type: "remove_skill",
      target: { skillName: "Python" }
    });
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1);
  });

  test("should validate remove_bullet missing bulletId", () => {
    const result = validator.validateByType({
      type: "remove_bullet",
      target: {}
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing target.bulletId");
  });

  test("should warn when remove_bullet target not found", () => {
    const result = validator.validateByType({
      type: "remove_bullet",
      target: { bulletId: "nonexistent" }
    });
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeLessThan(1);
  });

  test("should validate suppress_section missing parentId", () => {
    const result = validator.validateByType({
      type: "suppress_section",
      target: {}
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("missing target.parentId");
  });

  test("should return valid for unknown type in validateByType", () => {
    const result = validator.validateByType({
      type: "some_future_type",
      target: {}
    });
    expect(result.valid).toBe(true);
  });

  // --- validateSkillAlignment ---

  test("should flag uncertain skill additions", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1", section: "experience" },
      beforeText: "Built web applications using React and Node.js",
      afterText: "Built web applications using React, Node.js, and Kubernetes",
    }];

    const result = validator.validatePatches(patches);
    expect(result.issues.some(i => i.message.includes("Kubernetes"))).toBe(true);
  });

  test("should not flag tokens that are in job keywords", () => {
    const result = validator.validateSkillAlignment({
      beforeText: "Built apps",
      afterText: "Built scalable React applications with PostgreSQL"
    });
    // scalable, react, postgresql are all in the job description
    expect(result.confidence).toBe(1);
  });

  test("should skip alignment check when no job description", () => {
    const noJobValidator = new PatchValidator(mockResume, "");
    const patches = [{
      opId: "p1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      beforeText: "Built web applications using React and Node.js",
      afterText: "Built web applications using React, Node.js, and Kubernetes",
    }];

    const result = noJobValidator.validatePatches(patches);
    // No skill alignment issues since there's no job description
    expect(result.issues.every(i => !i.message.includes("not found in job"))).toBe(true);
  });

  test("should filter generic words from suspicious tokens", () => {
    const result = validator.validateSkillAlignment({
      beforeText: "Built apps",
      afterText: "Built and created scalable robust efficient apps using backend frontend"
    });
    // All new tokens are either generic or in job keywords
    expect(result.concerns.length).toBe(0);
  });

  // --- tokenize ---

  test("should lowercase and split text", () => {
    const tokens = validator.tokenize("Hello World");
    expect(tokens).toEqual(["hello", "world"]);
  });

  test("should strip special chars", () => {
    const tokens = validator.tokenize("React! (framework)");
    expect(tokens).toContain("react");
    expect(tokens).toContain("framework");
  });

  test("should handle empty string", () => {
    const tokens = validator.tokenize("");
    expect(tokens).toEqual([]);
  });

  test("should handle null", () => {
    const tokens = validator.tokenize(null);
    expect(tokens).toEqual([]);
  });

  // --- detectPatchConflicts ---

  test("should detect conflicting patches on same bullet", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built web applications using React and Node.js (version 1)",
      },
      {
        opId: "patch_2",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built web applications using React and Node.js (version 2)",
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.issues.some(i => i.message.includes("Multiple patches"))).toBe(true);
  });

  test("should not flag non-conflicting patches", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "replace_bullet", target: { bulletId: "bullet_1" } },
      { opId: "p2", type: "replace_bullet", target: { bulletId: "bullet_2" } },
    ]);
    expect(conflicts.length).toBe(0);
  });

  test("should detect conflicts for remove_skill patches", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "remove_skill", target: { skillName: "Python" } },
      { opId: "p2", type: "remove_skill", target: { skillName: "Python" } },
    ]);
    expect(conflicts.length).toBe(1);
  });

  test("should detect conflicts for suppress_section patches", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "suppress_section", target: { parentId: "exp_0" } },
      { opId: "p2", type: "suppress_section", target: { parentId: "exp_0" } },
    ]);
    expect(conflicts.length).toBe(1);
  });

  test("should detect conflicts for replace_summary patches", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "replace_summary", target: {} },
      { opId: "p2", type: "replace_summary", target: {} },
    ]);
    expect(conflicts.length).toBe(1);
  });

  test("should detect conflicts for insert_bullet patches on same parent", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "insert_bullet", target: { parentId: "exp_0" } },
      { opId: "p2", type: "insert_bullet", target: { parentId: "exp_0" } },
    ]);
    expect(conflicts.length).toBe(1);
  });

  test("should detect conflicts for remove_bullet patches", () => {
    const conflicts = validator.detectPatchConflicts([
      { opId: "p1", type: "remove_bullet", target: { bulletId: "bullet_1" } },
      { opId: "p2", type: "remove_bullet", target: { bulletId: "bullet_1" } },
    ]);
    expect(conflicts.length).toBe(1);
  });

  // --- confidence summary ---

  test("should provide confidence summary", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      beforeText: "Built web applications using React and Node.js",
      afterText: "Built scalable React web applications with Node.js backends",
    }];

    const result = validator.validatePatches(patches);
    expect(result.summary).toHaveProperty("averageConfidence");
    expect(result.summary.validPatches).toBe(1);
    expect(result.summary).toHaveProperty("errorCount");
    expect(result.summary).toHaveProperty("warningCount");
    expect(result.summary).toHaveProperty("flagCount");
  });

  // --- validate replace_summary ---

  test("should validate replace_summary patches", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_summary",
      target: { section: "summary" },
      beforeText: "Experienced full-stack developer with 5 years of experience in web development.",
      afterText: "Experienced React and Node.js developer with 5 years of expertise building scalable web applications and REST APIs.",
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(true);
    expect(result.patches[0].type).toBe("replace_summary");
  });

  test("should reject replace_summary with wrong beforeText", () => {
    const result = validator.validateByType({
      type: "replace_summary",
      target: {},
      beforeText: "Wrong summary text",
      afterText: "New summary"
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain("does not match original summary");
  });

  // --- validate insert_bullet ---

  test("should validate insert_bullet patches", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "exp_0", section: "experience", afterBulletId: "bullet_2" },
      afterText: "Implemented REST APIs using Node.js and PostgreSQL",
    }];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(true);
  });

  // --- _extractOrdinalMetric edge cases ---

  test("should not extract ordinal without following number", () => {
    const metrics = validator.extractMetrics("This is the first approach");
    expect(metrics).not.toContain("first approach");
  });

  test("should handle second ordinal", () => {
    const metrics = validator.extractMetrics("Won second 5 award");
    expect(metrics).toContain("second 5");
  });

  // --- _extractUsageMetric edge cases ---

  test("should extract views usage metric", () => {
    const metrics = validator.extractMetrics("Got 500+ views daily");
    expect(metrics).toContain("500+ views");
  });

  test("should not extract usage metric for non-usage labels", () => {
    const metrics = validator.extractMetrics("Used 500+ libraries");
    expect(metrics).not.toContain("500+ libraries");
  });

  // --- _extractStandaloneMetrics edge ---

  test("should not count non-numeric with + as usage metric without next word", () => {
    const metrics = validator.extractMetrics("abc+");
    expect(metrics.length).toBe(0);
  });
});
