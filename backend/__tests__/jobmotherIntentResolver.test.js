"use strict";

const {
  JOBMOTHER_INTENT_IDS,
  resolveJobmotherIntents,
  buildIntentCatalogForPrompt,
  intentAllowedForRole,
  intentToLink,
} = require("../jobmotherIntentResolver");

describe("resolveJobmotherIntents", () => {
  it("returns empty links for non-array intents", () => {
    expect(resolveJobmotherIntents(null, { role: "student" })).toEqual({
      links: [],
      droppedIntents: [],
    });
  });

  it("drops unknown intent ids", () => {
    const { links, droppedIntents } = resolveJobmotherIntents(
      [{ id: "GO_DASHBOARD" }, { id: "FAKE_INTENT" }],
      { role: "student" }
    );
    expect(links).toEqual([{ path: "/dashboard", label: "Dashboard" }]);
    expect(droppedIntents).toContain("FAKE_INTENT");
  });

  it("drops student-only intents for non-students", () => {
    const { links, droppedIntents } = resolveJobmotherIntents(
      [{ id: "GO_JOB_INVITATIONS" }],
      { role: "representative", companyId: "c1" }
    );
    expect(links).toEqual([]);
    expect(droppedIntents).toContain("GO_JOB_INVITATIONS");
  });

  it("maps student job invitations", () => {
    const { links } = resolveJobmotherIntents([{ id: "GO_JOB_INVITATIONS" }], {
      role: "student",
    });
    expect(links).toEqual([{ path: "/dashboard/job-invitations", label: "Job Invitations" }]);
  });

  it("maps representative manage booth when companyId present", () => {
    const { links } = resolveJobmotherIntents([{ id: "GO_MANAGE_BOOTH" }], {
      role: "representative",
      companyId: "co-99",
    });
    expect(links).toEqual([{ path: "/company/co-99/booth", label: "Manage Booth" }]);
  });

  it("drops GO_MANAGE_BOOTH for representative without companyId", () => {
    const { links, droppedIntents } = resolveJobmotherIntents([{ id: "GO_MANAGE_BOOTH" }], {
      role: "representative",
    });
    expect(links).toEqual([]);
    expect(droppedIntents).toContain("GO_MANAGE_BOOTH");
  });

  it("maps GO_MANAGE_BOOTH for company owner to companies", () => {
    const { links } = resolveJobmotherIntents([{ id: "GO_MANAGE_BOOTH" }], {
      role: "companyOwner",
    });
    expect(links).toEqual([{ path: "/companies", label: "Manage Companies" }]);
  });

  it("drops GO_SUBMISSIONS for non-representative", () => {
    const { droppedIntents } = resolveJobmotherIntents([{ id: "GO_SUBMISSIONS" }], {
      role: "companyOwner",
    });
    expect(droppedIntents).toContain("GO_SUBMISSIONS");
  });

  it("maps GO_SUBMISSIONS for representative with companyId", () => {
    const { links } = resolveJobmotherIntents([{ id: "GO_SUBMISSIONS" }], {
      role: "representative",
      companyId: "c1",
    });
    expect(links).toEqual([{ path: "/company/c1/submissions", label: "Submissions" }]);
  });

  it("drops fair intents without fairId", () => {
    const { droppedIntents } = resolveJobmotherIntents([{ id: "GO_FAIR_BOOTHS" }], {
      role: "student",
    });
    expect(droppedIntents).toContain("GO_FAIR_BOOTHS");
  });

  it("maps fair intents when fairId present", () => {
    const { links } = resolveJobmotherIntents(
      [{ id: "GO_FAIR_LANDING" }, { id: "GO_FAIR_BOOTHS" }],
      { role: "student", fairId: "fair-1" }
    );
    expect(links).toEqual([
      { path: "/fair/fair-1", label: "Fair home" },
      { path: "/fair/fair-1/booths", label: "Fair booths" },
    ]);
  });

  it("ignores CLARIFY for links", () => {
    const { links } = resolveJobmotherIntents([{ id: "CLARIFY" }, { id: "GO_FAIRS" }], {
      role: "student",
    });
    expect(links).toEqual([{ path: "/fairs", label: "Browse Fairs" }]);
  });

  it("dedupes same path and caps at 3 links", () => {
    const { links } = resolveJobmotherIntents(
      [
        { id: "GO_DASHBOARD" },
        { id: "GO_DASHBOARD" },
        { id: "GO_FAIRS" },
        { id: "GO_CHAT" },
        { id: "GO_PROFILE" },
      ],
      { role: "student" }
    );
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.path)).toEqual(["/dashboard", "/fairs", "/dashboard/chat"]);
  });

  it("drops intents when raw id is missing or not a string", () => {
    expect(resolveJobmotherIntents([{}], { role: "student" }).links).toEqual([]);
    expect(resolveJobmotherIntents([{ id: 123 }], { role: "student" }).links).toEqual([]);
  });

  it("skips second intent when it maps to same path as prior (seenPaths) without adding duplicate", () => {
    const { links } = resolveJobmotherIntents([{ id: "GO_FAIRS" }, { id: "GO_FAIRS" }], {
      role: "student",
    });
    expect(links).toEqual([{ path: "/fairs", label: "Browse Fairs" }]);
  });
});

describe("JOBMOTHER_INTENT_IDS", () => {
  it("exports a frozen list including core intents", () => {
    expect(JOBMOTHER_INTENT_IDS).toContain("GO_DASHBOARD");
    expect(JOBMOTHER_INTENT_IDS).toContain("CLARIFY");
  });
});

describe("buildIntentCatalogForPrompt", () => {
  it("returns a multi-line catalog string with intent ids", () => {
    const catalog = buildIntentCatalogForPrompt();
    expect(catalog).toContain("GO_DASHBOARD");
    expect(catalog).toContain("Do not output URLs");
    expect(catalog.split("\n").length).toBeGreaterThan(5);
  });
});

describe("intentAllowedForRole / intentToLink (spot checks)", () => {
  it("administrator can GO_ADMIN", () => {
    expect(intentAllowedForRole("GO_ADMIN", { role: "administrator" })).toBe(true);
    expect(intentToLink("GO_ADMIN", { role: "administrator" })).toEqual({
      path: "/admin",
      label: "Admin Panel",
    });
  });

  it("student cannot GO_ADMIN", () => {
    expect(intentAllowedForRole("GO_ADMIN", { role: "student" })).toBe(false);
  });

  it("returns false for unknown intent and null link", () => {
    expect(intentAllowedForRole("NOT_A_REAL_INTENT", { role: "student" })).toBe(false);
    expect(intentToLink("NOT_A_REAL_INTENT", { role: "student" })).toBeNull();
  });

  it("normalizes company role to company owner for GO_COMPANIES and GO_MANAGE_BOOTH", () => {
    expect(intentAllowedForRole("GO_COMPANIES", { role: "company" })).toBe(true);
    expect(intentToLink("GO_MANAGE_BOOTH", { role: "company" })).toEqual({
      path: "/companies",
      label: "Manage Companies",
    });
  });

  it("allows GO_COMPANIES for administrator", () => {
    expect(intentAllowedForRole("GO_COMPANIES", { role: "administrator" })).toBe(true);
  });

  it("allows GO_BOOTHS for student and GO_SHORTLIST for company owner", () => {
    expect(intentAllowedForRole("GO_BOOTHS", { role: "student" })).toBe(true);
    expect(intentAllowedForRole("GO_SHORTLIST", { role: "companyOwner" })).toBe(true);
  });

  it("intentToLink GO_SUBMISSIONS returns null without companyId", () => {
    expect(intentToLink("GO_SUBMISSIONS", { role: "representative" })).toBeNull();
  });

  it("intentToLink GO_FAIR_LANDING and GO_FAIR_BOOTHS return null without fairId", () => {
    expect(intentToLink("GO_FAIR_LANDING", { role: "student" })).toBeNull();
    expect(intentToLink("GO_FAIR_BOOTHS", { role: "student" })).toBeNull();
  });

  it("intentToLink GO_MANAGE_BOOTH returns null for student", () => {
    expect(intentToLink("GO_MANAGE_BOOTH", { role: "student" })).toBeNull();
  });

  it("normalizes company role for GO_BOOTHS link", () => {
    expect(intentToLink("GO_BOOTHS", { role: "company" })).toEqual({
      path: "/booths",
      label: "Browse Booths",
    });
  });

  it("intentToLink returns expected paths for student and employer intents", () => {
    const st = { role: "student", fairId: "f1" };
    expect(intentToLink("GO_CHAT", st)).toMatchObject({ path: "/dashboard/chat" });
    expect(intentToLink("GO_FAIRY_PAGE", st)).toMatchObject({
      path: "/dashboard/fairy-jobmother",
    });
    expect(intentToLink("GO_PROFILE", st)).toMatchObject({ path: "/profile" });
    expect(intentToLink("GO_CALL_INVITATIONS", st)).toMatchObject({
      path: "/dashboard/call-invitations",
    });
    expect(intentToLink("GO_STUDENT_1X1", st)).toMatchObject({ path: "/dashboard/1x1-calls" });
    expect(intentToLink("GO_TAILORED_RESUMES", st)).toMatchObject({
      path: "/dashboard/tailored-resumes",
    });
    expect(intentToLink("GO_BOOTH_HISTORY", st)).toMatchObject({
      path: "/dashboard/booth-history",
    });
    const emp = { role: "representative", companyId: "c1", fairId: "f1" };
    expect(intentToLink("GO_COMPANIES", { role: "administrator" })).toMatchObject({
      path: "/companies",
    });
    expect(intentToLink("GO_SHORTLIST", emp)).toMatchObject({ path: "/dashboard/shortlist" });
    expect(intentToLink("GO_QA_SESSIONS", emp)).toMatchObject({ path: "/dashboard/qa-sessions" });
    expect(intentToLink("GO_MY_CALLS", emp)).toMatchObject({ path: "/dashboard/my-calls" });
  });
});
