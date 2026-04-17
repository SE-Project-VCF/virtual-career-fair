const {
  normalizeTagString,
  interestTagsFromUserData,
  skillsFromUserData,
  mapStudentRecord,
  studentMatchesInterestQuery,
} = require("../helpers/studentUserMapping");

describe("normalizeTagString", () => {
  it("returns empty for object or null", () => {
    expect(normalizeTagString(null)).toBe("");
    expect(normalizeTagString({})).toBe("");
  });

  it("trims and lowercases", () => {
    expect(normalizeTagString("  AI  ")).toBe("ai");
  });
});

describe("skillsFromUserData", () => {
  it("prefers string", () => {
    expect(skillsFromUserData({ skills: "a, b" })).toBe("a, b");
  });

  it("joins string array", () => {
    expect(skillsFromUserData({ skills: ["x", "y"] })).toBe("x, y");
  });

  it("stringifies unexpected types", () => {
    expect(skillsFromUserData({ skills: 42 })).toBe("42");
  });

  it("returns empty for nullish", () => {
    expect(skillsFromUserData({ skills: null })).toBe("");
  });
});

describe("interestTagsFromUserData", () => {
  it("collects from array of strings and objects", () => {
    const tags = interestTagsFromUserData({
      interestTags: [" Finance ", { name: "AI" }, { tag: "ml" }],
    });
    expect(tags).toContain("finance");
    expect(tags).toContain("ai");
    expect(tags).toContain("ml");
  });

  it("parses comma-separated string field", () => {
    const tags = interestTagsFromUserData({
      interestTags: "a;b",
    });
    expect(tags.length).toBeGreaterThanOrEqual(1);
  });
});

describe("mapStudentRecord", () => {
  it("maps core fields", () => {
    const r = mapStudentRecord("uid1", {
      firstName: "A",
      lastName: "B",
      email: "e@e.com",
      major: "CS",
      skills: "py",
      interestTags: ["ai"],
    });
    expect(r).toEqual({
      id: "uid1",
      firstName: "A",
      lastName: "B",
      email: "e@e.com",
      major: "CS",
      skills: "py",
      interestTags: ["ai"],
    });
  });
});

describe("studentMatchesInterestQuery", () => {
  const student = {
    id: "1",
    firstName: "a",
    lastName: "b",
    email: "e",
    major: "m",
    skills: "",
    interestTags: ["finance", "ai"],
  };

  it("allows when interest empty", () => {
    expect(studentMatchesInterestQuery(student, "")).toBe(true);
  });

  it("matches tag substring", () => {
    expect(studentMatchesInterestQuery(student, "fin")).toBe(true);
    expect(studentMatchesInterestQuery(student, "zzz")).toBe(false);
  });
});
