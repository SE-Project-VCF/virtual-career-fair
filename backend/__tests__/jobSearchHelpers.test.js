const {
  parseSkillTokens,
  jobMatchesSkill,
  jobMatchesKeyword,
  jobMatchesLocationFilter,
} = require("../helpers/jobSearchHelpers");

describe("parseSkillTokens", () => {
  it("returns empty for non-string", () => {
    expect(parseSkillTokens(null)).toEqual([]);
    expect(parseSkillTokens(1)).toEqual([]);
  });

  it("splits and lowercases", () => {
    expect(parseSkillTokens(" A , B ")).toEqual(["a", "b"]);
  });
});

describe("jobMatchesSkill", () => {
  it("matches token equality or substring", () => {
    expect(jobMatchesSkill("python, java", "python")).toBe(true);
    expect(jobMatchesSkill("python", "py")).toBe(true);
    expect(jobMatchesSkill("java", "python")).toBe(false);
  });

  it("allows all when skill empty", () => {
    expect(jobMatchesSkill("x", "")).toBe(true);
    expect(jobMatchesSkill("x", "   ")).toBe(true);
  });
});

describe("jobMatchesKeyword", () => {
  const job = { name: "Engineer", description: "Build apps" };

  it("matches name or description", () => {
    expect(jobMatchesKeyword(job.name, job.description, "eng")).toBe(true);
    expect(jobMatchesKeyword(job.name, job.description, "apps")).toBe(true);
    expect(jobMatchesKeyword(job.name, job.description, "zzz")).toBe(false);
  });

  it("allows all when q empty", () => {
    expect(jobMatchesKeyword("a", "b", "")).toBe(true);
  });
});

describe("jobMatchesLocationFilter", () => {
  it("matches remote jobs for remote query", () => {
    const remote = { locationIsRemote: true };
    expect(jobMatchesLocationFilter(remote, "remote")).toBe(true);
    expect(jobMatchesLocationFilter({ locationIsRemote: false }, "remote")).toBe(false);
  });

  it("matches city for on-site", () => {
    const onsite = {
      locationIsRemote: false,
      locationCity: "Austin",
      locationState: "TX",
      location: null,
    };
    expect(jobMatchesLocationFilter(onsite, "austin")).toBe(true);
    expect(jobMatchesLocationFilter(onsite, "tx")).toBe(true);
  });

  it("returns false when no structured location", () => {
    expect(
      jobMatchesLocationFilter({ locationIsRemote: false, locationCity: null }, "x")
    ).toBe(false);
  });
});
