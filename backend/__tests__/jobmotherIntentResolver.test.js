"use strict";

const {
  resolveJobmotherIntents,
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
});
