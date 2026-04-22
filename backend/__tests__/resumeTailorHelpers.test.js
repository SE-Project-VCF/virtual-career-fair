const {
  extractFirstJsonObject,
  normalizeTokens,
  containsNewNumbers,
  GENERIC_VERBS,
  findSuspiciousTokens,
  parseGeminiJson,
  buildBulletMap,
  resolveOriginalText,
  verifyPatches,
  extractTextFromReason,
  extractRemovedText,
  normalizeRemovalPatch,
  findMatchingExperience,
  findMatchingProject,
  mapSuppressSectionParentId,
  mapPatchParentIds,
  logTailorV2Debug,
} = require("../resumeTailorHelpers");

describe("extractFirstJsonObject", () => {
  it("returns null for falsy input", () => {
    expect(extractFirstJsonObject(null)).toBeNull();
    expect(extractFirstJsonObject("")).toBeNull();
    expect(extractFirstJsonObject(undefined)).toBeNull();
  });

  it("returns null when no braces found", () => {
    expect(extractFirstJsonObject("no json here")).toBeNull();
  });

  it("returns null when only opening brace", () => {
    expect(extractFirstJsonObject("{ no close")).toBeNull();
  });

  it("returns null when closing brace before opening", () => {
    expect(extractFirstJsonObject("} before {")).toBeNull();
  });

  it("extracts JSON from surrounding text", () => {
    const result = extractFirstJsonObject('prefix {"key": "value"} suffix');
    expect(result).toBe('{"key": "value"}');
  });

  it("extracts nested JSON", () => {
    const result = extractFirstJsonObject('```json\n{"a": {"b": 1}}\n```');
    expect(result).toBe('{"a": {"b": 1}}');
  });
});

describe("normalizeTokens", () => {
  it("returns empty array for falsy input", () => {
    expect(normalizeTokens(null)).toEqual([]);
    expect(normalizeTokens("")).toEqual([]);
    expect(normalizeTokens(undefined)).toEqual([]);
  });

  it("lowercases and splits on whitespace", () => {
    expect(normalizeTokens("Hello World")).toEqual(["hello", "world"]);
  });

  it("strips non-alphanumeric except allowed chars", () => {
    expect(normalizeTokens("C++ and C#")).toEqual(["c++", "and", "c#"]);
  });

  it("preserves dots, hyphens, slashes, percent", () => {
    expect(normalizeTokens("Node.js CI/CD 50%")).toEqual(["node.js", "ci/cd", "50%"]);
  });

  it("filters empty strings from split", () => {
    expect(normalizeTokens("  extra   spaces  ")).toEqual(["extra", "spaces"]);
  });
});

describe("containsNewNumbers", () => {
  it("returns false when no new numbers", () => {
    expect(containsNewNumbers("improved by 20%", "enhanced by 20%")).toBe(false);
  });

  it("returns true when afterText introduces new numbers", () => {
    expect(containsNewNumbers("improved performance", "improved by 50%")).toBe(true);
  });

  it("returns false when both texts have no numbers", () => {
    expect(containsNewNumbers("no numbers", "still no numbers")).toBe(false);
  });

  it("handles decimal numbers", () => {
    expect(containsNewNumbers("score 3.5", "score 3.5 and 4.0")).toBe(true);
  });

  it("returns false when all numbers exist in before", () => {
    expect(containsNewNumbers("10 and 20", "20 and 10")).toBe(false);
  });
});

describe("GENERIC_VERBS", () => {
  it("is a Set containing common verbs", () => {
    expect(GENERIC_VERBS).toBeInstanceOf(Set);
    expect(GENERIC_VERBS.has("and")).toBe(true);
    expect(GENERIC_VERBS.has("built")).toBe(true);
    expect(GENERIC_VERBS.has("react")).toBe(false);
  });
});

describe("findSuspiciousTokens", () => {
  it("returns empty when afterText has no new tokens", () => {
    expect(findSuspiciousTokens("used React", "React used", new Set())).toEqual([]);
  });

  it("flags new tokens not in original or skills", () => {
    const result = findSuspiciousTokens("used React", "used React and Angular", new Set(["react"]));
    expect(result).toContain("angular");
  });

  it("ignores generic verbs", () => {
    const result = findSuspiciousTokens("built app", "built and created app", new Set());
    expect(result).toEqual([]);
  });

  it("ignores short tokens (< 3 chars)", () => {
    const result = findSuspiciousTokens("a b", "a b cd efg", new Set());
    expect(result).toEqual(["efg"]);
  });

  it("does not flag tokens that are in allowedSkills", () => {
    const result = findSuspiciousTokens("original", "original typescript", new Set(["typescript"]));
    expect(result).toEqual([]);
  });
});

describe("parseGeminiJson", () => {
  it("parses valid JSON directly", () => {
    const result = parseGeminiJson('{"key": "value"}');
    expect(result.parsed).toEqual({ key: "value" });
    expect(result.error).toBeUndefined();
  });

  it("extracts JSON from markdown code block", () => {
    const result = parseGeminiJson('```json\n{"key": "value"}\n```');
    expect(result.parsed).toEqual({ key: "value" });
  });

  it("returns error when no valid JSON found", () => {
    const result = parseGeminiJson("not json at all");
    expect(result.error).toBeDefined();
    expect(result.raw).toBeDefined();
  });

  it("returns error with raw text when extracted JSON is also invalid", () => {
    const result = parseGeminiJson("prefix {invalid json} suffix");
    expect(result.error).toContain("malformed");
    expect(result.raw).toBeDefined();
  });

  it("truncates raw text to 1500 chars on failure", () => {
    const longText = "x".repeat(2000);
    const result = parseGeminiJson(longText);
    expect(result.raw.length).toBeLessThanOrEqual(1500);
  });
});

describe("buildBulletMap", () => {
  it("builds map from experience bullets", () => {
    const structured = {
      experience: [
        { bullets: [{ bulletId: "b1", text: "Did thing A" }, { bulletId: "b2", text: "Did thing B" }] },
      ],
    };
    const map = buildBulletMap(structured);
    expect(map.get("b1")).toBe("Did thing A");
    expect(map.get("b2")).toBe("Did thing B");
  });

  it("builds map from project bullets", () => {
    const structured = {
      projects: [
        { bullets: [{ bulletId: "p1", text: "Built X" }] },
      ],
    };
    const map = buildBulletMap(structured);
    expect(map.get("p1")).toBe("Built X");
  });

  it("handles missing experience and projects", () => {
    const map = buildBulletMap({});
    expect(map.size).toBe(0);
  });

  it("combines experience and project bullets", () => {
    const structured = {
      experience: [{ bullets: [{ bulletId: "e1", text: "exp" }] }],
      projects: [{ bullets: [{ bulletId: "p1", text: "proj" }] }],
    };
    const map = buildBulletMap(structured);
    expect(map.size).toBe(2);
  });
});

describe("resolveOriginalText", () => {
  const bulletMap = new Map([["b1", "bullet text"]]);

  it("returns summary text for replace_summary", () => {
    expect(resolveOriginalText("replace_summary", "summary", bulletMap, "b1")).toBe("summary");
  });

  it("returns bullet text for replace_bullet", () => {
    expect(resolveOriginalText("replace_bullet", "summary", bulletMap, "b1")).toBe("bullet text");
  });

  it("returns empty string for missing bullet", () => {
    expect(resolveOriginalText("replace_bullet", "summary", bulletMap, "missing")).toBe("");
  });

  it("returns empty string for insert_bullet", () => {
    expect(resolveOriginalText("insert_bullet", "summary", bulletMap, "b1")).toBe("");
  });

  it("returns null for unknown type", () => {
    expect(resolveOriginalText("unknown_type", "summary", bulletMap, "b1")).toBeNull();
  });
});

describe("verifyPatches", () => {
  const structured = {
    summary: { text: "Original summary" },
    experience: [{ bullets: [{ bulletId: "b1", text: "Original bullet" }] }],
    skills: { items: ["React", "TypeScript"] },
  };

  it("rejects malformed patches", () => {
    const result = verifyPatches(structured, { patches: [{}] });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].level).toBe("reject");
    expect(result.verifiedPatches).toHaveLength(0);
  });

  it("rejects unknown patch types", () => {
    const result = verifyPatches(structured, {
      patches: [{ opId: "op1", type: "unknown", target: {}, afterText: "text" }],
    });
    expect(result.issues[0].reason).toContain("Unknown patch type");
  });

  it("rejects replace_summary when beforeText doesn't match", () => {
    const result = verifyPatches(structured, {
      patches: [{
        opId: "op1", type: "replace_summary",
        target: {}, beforeText: "wrong text", afterText: "new summary",
      }],
    });
    expect(result.issues[0].reason).toContain("beforeText does not match");
  });

  it("accepts valid replace_summary patch", () => {
    const result = verifyPatches(structured, {
      patches: [{
        opId: "op1", type: "replace_summary",
        target: {}, beforeText: "Original summary", afterText: "Better summary",
      }],
    });
    expect(result.verifiedPatches).toHaveLength(1);
  });

  it("flags suspicious new tokens", () => {
    const result = verifyPatches(structured, {
      patches: [{
        opId: "op1", type: "replace_summary",
        target: {}, beforeText: "Original summary", afterText: "Used kubernetes extensively",
      }],
    });
    const flagIssue = result.issues.find(i => i.level === "flag");
    expect(flagIssue).toBeDefined();
    expect(flagIssue.tokens).toContain("kubernetes");
    // Patch still passes through (flag, not reject)
    expect(result.verifiedPatches).toHaveLength(1);
  });

  it("does not flag tokens that are in resume skills", () => {
    const result = verifyPatches(structured, {
      patches: [{
        opId: "op1", type: "replace_summary",
        target: {}, beforeText: "Original summary", afterText: "Used react and typescript",
      }],
    });
    const flagIssue = result.issues.find(i => i.level === "flag");
    expect(flagIssue).toBeUndefined();
  });

  it("handles empty patches array", () => {
    const result = verifyPatches(structured, { patches: [] });
    expect(result.verifiedPatches).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it("handles missing patches property", () => {
    const result = verifyPatches(structured, {});
    expect(result.verifiedPatches).toHaveLength(0);
  });
});

describe("extractTextFromReason", () => {
  it("extracts quoted text", () => {
    expect(extractTextFromReason('Remove "React Native" project', "suppress_section")).toBe("React Native");
  });

  it("extracts first words when no quotes", () => {
    expect(extractTextFromReason("Not relevant to position", "remove_bullet")).toBe("Not relevant to");
  });

  it("returns empty string for empty reason", () => {
    expect(extractTextFromReason("", "remove_bullet")).toBe("");
  });

  it("extracts project name for suppress_section", () => {
    const result = extractTextFromReason("Legacy App project is not relevant", "suppress_section");
    expect(result).toBeDefined();
  });

  it("truncates long suppress_section text", () => {
    const longReason = "A".repeat(60) + " project is not relevant";
    const result = extractTextFromReason(longReason, "suppress_section");
    expect(result.length).toBeLessThan(longReason.length);
  });
});

describe("extractRemovedText", () => {
  it("uses skillName for remove_skill", () => {
    expect(extractRemovedText({ type: "remove_skill", target: { skillName: "Python" } })).toBe("Python");
  });

  it("uses beforeText for remove_bullet", () => {
    expect(extractRemovedText({ type: "remove_bullet", beforeText: "Old bullet" })).toBe("Old bullet");
  });

  it("falls back to reason for other types", () => {
    const result = extractRemovedText({ type: "suppress_section", reason: 'Remove "Old Project" section' });
    expect(result).toBe("Old Project");
  });

  it("returns default for suppress_section with no info", () => {
    expect(extractRemovedText({ type: "suppress_section" })).toBe("(project/job)");
  });

  it("returns default for unknown removal type", () => {
    expect(extractRemovedText({ type: "remove_bullet" })).toBe("(item)");
  });
});

describe("normalizeRemovalPatch", () => {
  it("returns non-removal patches unchanged", () => {
    const patch = { type: "replace_bullet", afterText: "new text" };
    expect(normalizeRemovalPatch(patch, 0)).toBe(patch);
  });

  it("sets removedText from skillName for remove_skill", () => {
    const patch = { type: "remove_skill", target: { skillName: "Java" } };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removedText).toBe("Java");
  });

  it("sets removalReason from reason field", () => {
    const patch = { type: "remove_skill", target: { skillName: "Java" }, reason: "Not relevant" };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removalReason).toBe("Not relevant");
  });

  it("sets default removalReason when none provided", () => {
    const patch = { type: "remove_skill", target: { skillName: "Java" } };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removalReason).toBe("Not relevant to this position");
  });

  it("does not overwrite existing removedText", () => {
    const patch = { type: "remove_skill", target: { skillName: "Java" }, removedText: "Custom" };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removedText).toBe("Custom");
  });

  it("overwrites removedText when it is 'undefined' string", () => {
    const patch = { type: "remove_skill", target: { skillName: "Java" }, removedText: "undefined" };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removedText).toBe("Java");
  });

  it("handles suppress_section type", () => {
    const patch = { type: "suppress_section", reason: 'Remove "Old App" section' };
    const result = normalizeRemovalPatch(patch, 0);
    expect(result.removedText).toBe("Old App");
  });
});

describe("findMatchingExperience", () => {
  const entries = [
    { title: "Software Engineer", company: "Acme Corp", expId: "e1" },
    { title: "Intern", company: "Startup Inc", expId: "e2" },
  ];

  it("matches by title", () => {
    expect(findMatchingExperience(entries, "Software Engineer", "")).toEqual(entries[0]);
  });

  it("matches by company", () => {
    expect(findMatchingExperience(entries, "Acme Corp", "")).toEqual(entries[0]);
  });

  it("matches case-insensitively", () => {
    expect(findMatchingExperience(entries, "software engineer", "")).toEqual(entries[0]);
  });

  it("falls back to parentId", () => {
    expect(findMatchingExperience(entries, "", "Intern")).toEqual(entries[1]);
  });

  it("returns undefined when no match", () => {
    expect(findMatchingExperience(entries, "Unknown", "")).toBeUndefined();
  });
});

describe("findMatchingProject", () => {
  const entries = [
    { name: "Todo App", projId: "p1" },
    { name: "Chat Platform", projId: "p2" },
  ];

  it("matches by name", () => {
    expect(findMatchingProject(entries, "Todo App", "")).toEqual(entries[0]);
  });

  it("matches partial name", () => {
    expect(findMatchingProject(entries, "Chat", "")).toEqual(entries[1]);
  });

  it("falls back to parentId", () => {
    expect(findMatchingProject(entries, "", "Todo")).toEqual(entries[0]);
  });

  it("returns undefined when no match", () => {
    expect(findMatchingProject(entries, "Unknown", "")).toBeUndefined();
  });
});

describe("mapSuppressSectionParentId", () => {
  const structured = {
    experience: [{ title: "Engineer", company: "Acme", expId: "exp-1" }],
    projects: [{ name: "Cool Project", projId: "proj-1" }],
  };

  it("maps experience parentId to expId", () => {
    const patch = { target: { section: "experience", parentId: "Engineer", removedText: "Engineer" } };
    mapSuppressSectionParentId(patch, structured);
    expect(patch.target.parentId).toBe("exp-1");
  });

  it("maps project parentId to projId", () => {
    const patch = { target: { section: "projects", parentId: "Cool Project", removedText: "Cool Project" } };
    mapSuppressSectionParentId(patch, structured);
    expect(patch.target.parentId).toBe("proj-1");
  });

  it("keeps original parentId when no match found for experience", () => {
    const patch = { target: { section: "experience", parentId: "Unknown", removedText: "Unknown" } };
    mapSuppressSectionParentId(patch, structured);
    expect(patch.target.parentId).toBe("Unknown");
  });
});

describe("mapPatchParentIds", () => {
  const structured = {
    experience: [{ title: "Engineer", company: "Acme", expId: "exp-1" }],
  };

  it("calls mapSuppressSectionParentId for suppress_section patches", () => {
    const patch = { type: "suppress_section", target: { section: "experience", parentId: "Engineer", removedText: "Engineer" } };
    mapPatchParentIds(patch, structured);
    expect(patch.target.parentId).toBe("exp-1");
  });

  it("returns patch unchanged for non-suppress types", () => {
    const patch = { type: "replace_bullet", target: { bulletId: "b1" } };
    const result = mapPatchParentIds(patch, structured);
    expect(result).toBe(patch);
  });

  it("handles remove_bullet with education section", () => {
    const patch = { type: "remove_bullet", target: { bulletId: "b1", section: "education", removedText: "GPA" } };
    const result = mapPatchParentIds(patch, structured);
    expect(result).toBe(patch);
  });
});

describe("logTailorV2Debug", () => {
  it("does not throw with valid input", () => {
    expect(() => logTailorV2Debug(
      { patches: [{}], skill_suggestions: ["React"] },
      { patches: [{}], summary: { errorCount: 0 } }
    )).not.toThrow();
  });

  it("handles empty/missing fields", () => {
    expect(() => logTailorV2Debug({}, {})).not.toThrow();
  });
});
