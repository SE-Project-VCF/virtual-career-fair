"use strict";

/** Avoid loading real firebase-admin (needs credentials); jobmotherUserState still pulls ./firebase at import. */
jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
}));

const { db } = require("../firebase");
const {
  buildJobmotherUserStateBlock,
  sanitizeJobmotherTips,
  parseNeedsClarification,
  profileBasicsComplete,
  hasResumeUploaded,
  normalizeRole,
  countUnseenJobInvitations,
  countPendingCallInvitations,
} = require("../jobmotherUserState");

function makeWhereMock(docDatas) {
  return {
    where: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({
        docs: docDatas.map((d) => ({ data: () => d })),
      }),
    })),
  };
}

describe("normalizeRole", () => {
  it("maps company to companyowner and lowercases roles", () => {
    expect(normalizeRole("company")).toBe("companyowner");
    expect(normalizeRole("  Student ")).toBe("student");
    expect(normalizeRole("Representative")).toBe("representative");
  });

  it("returns empty string for missing or non-string roles", () => {
    expect(normalizeRole("")).toBe("");
    expect(normalizeRole(null)).toBe("");
    expect(normalizeRole(undefined)).toBe("");
    expect(normalizeRole(42)).toBe("");
  });
});

describe("countUnseenJobInvitations / countPendingCallInvitations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("counts only sent job invitations", async () => {
    db.collection.mockImplementation(() =>
      makeWhereMock([{ status: "sent" }, { status: "viewed" }, { status: undefined }])
    );
    await expect(countUnseenJobInvitations("u1")).resolves.toBe(1);
    expect(db.collection).toHaveBeenCalledWith("jobInvitations");
  });

  it("counts pending call invitations and treats missing status as empty", async () => {
    db.collection.mockImplementation(() =>
      makeWhereMock([{ status: "pending" }, { status: "done" }, { status: undefined }])
    );
    await expect(countPendingCallInvitations("u1", "studentId")).resolves.toBe(1);
    expect(db.collection).toHaveBeenCalledWith("call_invitations");
  });
});

describe("sanitizeJobmotherTips", () => {
  it("returns empty for non-array or missing", () => {
    expect(sanitizeJobmotherTips(null)).toEqual([]);
    expect(sanitizeJobmotherTips({})).toEqual([]);
    expect(sanitizeJobmotherTips({ tips: null })).toEqual([]);
    expect(sanitizeJobmotherTips({ tips: "x" })).toEqual([]);
  });

  it("trims, caps count and length", () => {
    expect(
      sanitizeJobmotherTips({
        tips: ["  a ", "b", "", "c", "d", "e"],
      })
    ).toEqual(["a", "b", "c"]);
    const long = "x".repeat(300);
    expect(sanitizeJobmotherTips({ tips: [long] })).toEqual(["x".repeat(240)]);
  });

  it("filters out non-string tip entries", () => {
    expect(
      sanitizeJobmotherTips({
        tips: ["ok", 1, null, "  z ", false, "last"],
      })
    ).toEqual(["ok", "z", "last"]);
  });
});

describe("parseNeedsClarification", () => {
  it("is true only when strictly true", () => {
    expect(parseNeedsClarification({ needsClarification: true })).toBe(true);
    expect(parseNeedsClarification({ needsClarification: "true" })).toBe(false);
    expect(parseNeedsClarification({})).toBe(false);
    expect(parseNeedsClarification(null)).toBe(false);
    expect(parseNeedsClarification([])).toBe(false);
  });
});

describe("profileBasicsComplete", () => {
  it("detects first+last or displayName", () => {
    expect(profileBasicsComplete({ firstName: "A", lastName: "B" })).toBe(true);
    expect(profileBasicsComplete({ displayName: "AB" })).toBe(true);
    expect(profileBasicsComplete({ firstName: "A" })).toBe(false);
    expect(profileBasicsComplete({ firstName: 1, lastName: "B" })).toBe(false);
    expect(profileBasicsComplete({ displayName: "   " })).toBe(false);
  });
});

describe("hasResumeUploaded", () => {
  it("checks paths", () => {
    expect(hasResumeUploaded({ currentResumePath: "p" })).toBe(true);
    expect(hasResumeUploaded({ resumePath: "x" })).toBe(true);
    expect(hasResumeUploaded({ currentResumePath: "   " })).toBe(false);
    expect(hasResumeUploaded({})).toBe(false);
  });
});

describe("buildJobmotherUserStateBlock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes student invitation counts and fair line when fairId set", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return makeWhereMock([{ status: "sent" }, { status: "viewed" }]);
      }
      if (name === "call_invitations") {
        return makeWhereMock([{ status: "pending" }, { status: "done" }]);
      }
      return makeWhereMock([]);
    });
    const block = await buildJobmotherUserStateBlock(
      "u1",
      { role: "student", firstName: "A", lastName: "B" },
      "fair-1"
    );
    expect(block).toContain("unseenJobInvitationsCount: 1");
    expect(block).toContain("pendingIncomingCallInvitationsCount: 1");
    expect(block).toContain("inside a fair");
  });

  it("includes employer outgoing call count", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "call_invitations") {
        return makeWhereMock([{ status: "pending" }, { status: "pending" }]);
      }
      return makeWhereMock([]);
    });
    const block = await buildJobmotherUserStateBlock(
      "u1",
      { role: "representative", companyId: "c1" },
      undefined
    );
    expect(block).toContain("pendingOutgoingCallInvitationsCount: 2");
    expect(block).toContain("not inside a fair");
  });

  it("treats role company as company owner for outgoing call count", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "call_invitations") {
        return makeWhereMock([{ status: "pending" }]);
      }
      return makeWhereMock([]);
    });
    const block = await buildJobmotherUserStateBlock("u1", { role: "company" }, null);
    expect(block).toContain("pendingOutgoingCallInvitationsCount: 1");
  });

  it("adds adminRole for administrator", async () => {
    db.collection.mockImplementation(() => makeWhereMock([]));
    const block = await buildJobmotherUserStateBlock("u1", { role: "administrator" }, null);
    expect(block).toContain("adminRole: true");
  });

  it("uses unknown for unseen job count when query throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return {
          where: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("firestore")),
          })),
        };
      }
      if (name === "call_invitations") {
        return makeWhereMock([]);
      }
      return makeWhereMock([]);
    });
    const block = await buildJobmotherUserStateBlock("u1", { role: "student" }, null);
    expect(block).toContain("unseenJobInvitationsCount: unknown");
    errSpy.mockRestore();
  });

  it("uses unknown for pending incoming calls when that query throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    db.collection.mockImplementation((name) => {
      if (name === "jobInvitations") {
        return makeWhereMock([{ status: "sent" }]);
      }
      if (name === "call_invitations") {
        return {
          where: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("firestore")),
          })),
        };
      }
      return makeWhereMock([]);
    });
    const block = await buildJobmotherUserStateBlock("u1", { role: "student" }, null);
    expect(block).toContain("pendingIncomingCallInvitationsCount: unknown");
    errSpy.mockRestore();
  });

  it("uses unknown for outgoing calls when employer query throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    db.collection.mockImplementation(() => ({
      where: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("firestore")),
      })),
    }));
    const block = await buildJobmotherUserStateBlock("u1", { role: "companyOwner" }, null);
    expect(block).toContain("pendingOutgoingCallInvitationsCount: unknown");
    errSpy.mockRestore();
  });

  it("uses empty role string when userDoc.role is not a string", async () => {
    db.collection.mockImplementation(() => makeWhereMock([]));
    const block = await buildJobmotherUserStateBlock("u1", { role: 99 }, null);
    expect(block).toContain("profileBasicsComplete: false");
    expect(block).not.toContain("adminRole");
  });

  it("covers student branch with zero counts", async () => {
    db.collection.mockImplementation(() => makeWhereMock([]));
    const block = await buildJobmotherUserStateBlock("u1", { role: "student" }, undefined);
    expect(block).toContain("unseenJobInvitationsCount: 0");
    expect(block).toContain("pendingIncomingCallInvitationsCount: 0");
  });
});
