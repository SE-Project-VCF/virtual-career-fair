/**
 * Unit tests for Q&A booth session mutation helpers (no HTTP server).
 */

const {
  employerAuthorizedForQaBooth,
  deleteQaSessionAtBooth,
  applyQaSessionArrayItemUpdates,
  tryPutQaSessionAtFairBooth,
  validatePutQaSessionRequestBody,
  sendPutQaSessionOutcomeResponse,
  tryDeleteQaSessionAtFairBooth,
  sendDeleteQaSessionOutcomeResponse,
} = require("../lib/qaSessionMutations");

const mockAdmin = {
  firestore: {
    FieldValue: {
      arrayRemove: jest.fn((x) => ({ op: "remove", x })),
      delete: jest.fn(() => ({ op: "delete" })),
    },
    Timestamp: {
      now: jest.fn(() => ({ _ts: "now" })),
      fromDate: jest.fn((d) => ({ _ts: "fromDate", d })),
    },
  },
};

describe("employerAuthorizedForQaBooth", () => {
  it("returns true when company matches", () => {
    expect(
      employerAuthorizedForQaBooth({ companyId: "c1", employerId: "e1" }, "c1", "x")
    ).toBe(true);
  });

  it("returns true when employerId matches", () => {
    expect(
      employerAuthorizedForQaBooth({ companyId: "c1", employerId: "e1" }, "other", "e1")
    ).toBe(true);
  });

  it("returns false when neither matches", () => {
    expect(
      employerAuthorizedForQaBooth({ companyId: "c1", employerId: "e1" }, "c2", "e2")
    ).toBe(false);
  });
});

describe("validatePutQaSessionRequestBody", () => {
  it("rejects empty body", () => {
    const v = validatePutQaSessionRequestBody({});
    expect(v.ok).toBe(false);
    expect(v.status).toBe(400);
  });

  it("accepts title only", () => {
    expect(validatePutQaSessionRequestBody({ title: "T" }).ok).toBe(true);
  });

  it("rejects past scheduledTime", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const v = validatePutQaSessionRequestBody({ scheduledTime: past });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/future/);
  });

  it("accepts future scheduledTime", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validatePutQaSessionRequestBody({ scheduledTime: future }).ok).toBe(true);
  });

  it("rejects invalid duration", () => {
    expect(validatePutQaSessionRequestBody({ duration: 0 }).ok).toBe(false);
    expect(validatePutQaSessionRequestBody({ duration: 500 }).ok).toBe(false);
  });

  it("accepts valid duration", () => {
    expect(validatePutQaSessionRequestBody({ duration: 30 }).ok).toBe(true);
  });
});

describe("applyQaSessionArrayItemUpdates", () => {
  it("merges partial fields", () => {
    const existing = {
      id: "s1",
      title: "Old",
      description: "D",
      scheduledTime: "old",
      duration: 30,
    };
    const out = applyQaSessionArrayItemUpdates(
      existing,
      { title: "New" },
      mockAdmin
    );
    expect(out.title).toBe("New");
    expect(out.description).toBe("D");
    expect(mockAdmin.firestore.Timestamp.fromDate).not.toHaveBeenCalled();
  });

  it("updates scheduledTime when provided", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const existing = {
      id: "s1",
      title: "T",
      description: "",
      scheduledTime: null,
      duration: 30,
    };
    applyQaSessionArrayItemUpdates(existing, { scheduledTime: future }, mockAdmin);
    expect(mockAdmin.firestore.Timestamp.fromDate).toHaveBeenCalled();
  });
});

describe("deleteQaSessionAtBooth", () => {
  it("removes session from array when found", async () => {
    const session = { id: "sid" };
    const update = jest.fn().mockResolvedValue(undefined);
    const fairBoothRef = { update };
    const boothData = { qaSessions: [session, { id: "other" }] };
    const r = await deleteQaSessionAtBooth(fairBoothRef, boothData, "b1", "sid", mockAdmin);
    expect(r).toBe("deleted");
    expect(update).toHaveBeenCalled();
  });

  it("returns missing_in_array when id not in array", async () => {
    const r = await deleteQaSessionAtBooth(
      { update: jest.fn() },
      { qaSessions: [{ id: "x" }] },
      "b1",
      "missing",
      mockAdmin
    );
    expect(r).toBe("missing_in_array");
  });

  it("deletes legacy qaSession when boothId matches sessionId", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const r = await deleteQaSessionAtBooth(
      { update },
      { qaSession: { title: "L" } },
      "same-id",
      "same-id",
      mockAdmin
    );
    expect(r).toBe("deleted");
  });

  it("returns not_found otherwise", async () => {
    const r = await deleteQaSessionAtBooth(
      { update: jest.fn() },
      { qaSession: {} },
      "b1",
      "other",
      mockAdmin
    );
    expect(r).toBe("not_found");
  });
});

describe("tryPutQaSessionAtFairBooth", () => {
  it("returns skip when doc missing", async () => {
    const r = await tryPutQaSessionAtFairBooth(
      {},
      { exists: false },
      "sid",
      "c",
      "e",
      {},
      mockAdmin
    );
    expect(r.code).toBe("skip");
  });

  it("returns forbidden when not authorized", async () => {
    const r = await tryPutQaSessionAtFairBooth(
      {},
      { exists: true, data: () => ({ companyId: "x", employerId: "y" }) },
      "sid",
      "c",
      "e",
      {},
      mockAdmin
    );
    expect(r.code).toBe("forbidden");
  });

  it("returns session_not_found when no qaSessions array", async () => {
    const r = await tryPutQaSessionAtFairBooth(
      {},
      {
        exists: true,
        data: () => ({ companyId: "c", qaSession: {} }),
      },
      "sid",
      "c",
      "e",
      {},
      mockAdmin
    );
    expect(r.code).toBe("session_not_found");
  });

  it("updates when session exists", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const fairBoothRef = { update };
    const boothData = {
      companyId: "c1",
      qaSessions: [{ id: "sid", title: "T", description: "", scheduledTime: null, duration: 30 }],
    };
    const r = await tryPutQaSessionAtFairBooth(
      fairBoothRef,
      { exists: true, data: () => boothData },
      "sid",
      "c1",
      "e",
      { title: "New" },
      mockAdmin
    );
    expect(r.code).toBe("updated");
    expect(r.session.title).toBe("New");
    expect(update).toHaveBeenCalled();
  });
});

describe("sendPutQaSessionOutcomeResponse", () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  it("returns false when skip", () => {
    const res = makeRes();
    expect(sendPutQaSessionOutcomeResponse(res, { code: "skip" })).toBe(false);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("sends 403 when forbidden", () => {
    const res = makeRes();
    expect(sendPutQaSessionOutcomeResponse(res, { code: "forbidden" })).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("sends 200 when updated", () => {
    const res = makeRes();
    expect(
      sendPutQaSessionOutcomeResponse(res, { code: "updated", session: { id: "1" } })
    ).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, session: { id: "1" } })
    );
  });

  it("sends 404 when session_not_found", () => {
    const res = makeRes();
    expect(sendPutQaSessionOutcomeResponse(res, { code: "session_not_found" })).toBe(true);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("tryDeleteQaSessionAtFairBooth", () => {
  it("returns skip when doc missing", async () => {
    const r = await tryDeleteQaSessionAtFairBooth(
      {},
      { exists: false },
      "b",
      "s",
      "c",
      "e",
      mockAdmin
    );
    expect(r.code).toBe("skip");
  });

  it("returns forbidden when not authorized", async () => {
    const r = await tryDeleteQaSessionAtFairBooth(
      {},
      { exists: true, data: () => ({ companyId: "x" }) },
      "b",
      "s",
      "c",
      "e",
      mockAdmin
    );
    expect(r.code).toBe("forbidden");
  });
});

describe("sendDeleteQaSessionOutcomeResponse", () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  it("returns false on skip", () => {
    const res = makeRes();
    expect(sendDeleteQaSessionOutcomeResponse(res, { code: "skip" })).toBe(false);
  });

  it("sends success on deleted", () => {
    const res = makeRes();
    expect(sendDeleteQaSessionOutcomeResponse(res, { code: "deleted" })).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("sends 403 on forbidden", () => {
    const res = makeRes();
    expect(sendDeleteQaSessionOutcomeResponse(res, { code: "forbidden" })).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("sends 404 on session_not_found", () => {
    const res = makeRes();
    expect(sendDeleteQaSessionOutcomeResponse(res, { code: "session_not_found" })).toBe(true);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
