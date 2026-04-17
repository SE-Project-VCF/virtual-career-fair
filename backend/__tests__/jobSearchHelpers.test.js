const {
  serializeJobDoc,
  parseSkillTokens,
  jobMatchesSkill,
  jobMatchesKeyword,
  jobMatchesLocationFilter,
} = require("../helpers/jobSearchHelpers");

describe("serializeJobDoc", () => {
  it("maps Firestore doc to API job shape", () => {
    const doc = {
      id: "job-1",
      data: () => ({
        companyId: "c1",
        name: "Title",
        description: "Desc",
        majorsAssociated: "a,b",
        applicationLink: "https://x.com",
        createdAt: { toMillis: () => 5000 },
        locationIsRemote: true,
        locationCity: null,
        locationState: null,
        location: null,
        applicationForm: { id: "f1", title: "Form" },
      }),
    };
    const row = serializeJobDoc(doc);
    expect(row).toEqual({
      id: "job-1",
      companyId: "c1",
      name: "Title",
      description: "Desc",
      majorsAssociated: "a,b",
      applicationLink: "https://x.com",
      createdAt: 5000,
      locationIsRemote: true,
      locationCity: null,
      locationState: null,
      location: null,
      applicationForm: { id: "f1", title: "Form" },
    });
  });

  it("uses null createdAt when timestamp missing", () => {
    const doc = {
      id: "j2",
      data: () => ({
        companyId: "c1",
        name: "T",
        description: "D",
        majorsAssociated: "m",
        applicationLink: null,
        createdAt: null,
        locationIsRemote: false,
        locationCity: "Austin",
        locationState: "TX",
        location: "Austin, TX",
        applicationForm: null,
      }),
    };
    const row = serializeJobDoc(doc);
    expect(row.createdAt).toBeNull();
    expect(row.locationCity).toBe("Austin");
  });
});

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

  it("matches remote synonyms and remote work phrase", () => {
    const remoteJob = { locationIsRemote: true };
    expect(jobMatchesLocationFilter(remoteJob, "wfh")).toBe(true);
    expect(jobMatchesLocationFilter(remoteJob, "work from home")).toBe(true);
    expect(jobMatchesLocationFilter(remoteJob, "remote work")).toBe(true);
  });

  it("matches combined city state string", () => {
    const onsite = {
      locationIsRemote: false,
      locationCity: "San",
      locationState: "Diego",
      location: null,
    };
    expect(jobMatchesLocationFilter(onsite, "san diego")).toBe(true);
  });

  it("matches location label when city state miss", () => {
    const onsite = {
      locationIsRemote: false,
      locationCity: "x",
      locationState: "y",
      location: "SoMa HQ",
    };
    expect(jobMatchesLocationFilter(onsite, "soma")).toBe(true);
  });

  it("returns true when location filter empty", () => {
    expect(jobMatchesLocationFilter({ locationIsRemote: true }, "   ")).toBe(true);
  });
});
