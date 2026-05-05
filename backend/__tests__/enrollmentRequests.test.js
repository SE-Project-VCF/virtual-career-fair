const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1_500_000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = { delete: jest.fn(() => ({ __fv: "delete" })) };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    })),
  },
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), collectionGroup: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

const VALID = "Bearer valid-token";

const FAIR_UPCOMING = {
  name: "Spring",
  startTime: { toMillis: () => 2_000_000 },
  endTime: { toMillis: () => 3_000_000 },
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "rep-uid", email: "r@test.com" });
  verifyAdmin.mockResolvedValue({ error: "No", status: 403 });
});

describe("POST /api/fairs/:fairId/enrollment-requests", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/fairs/f1/enrollment-requests").send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 when fair not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 400 when fair already started", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                {
                  ...FAIR_UPCOMING,
                  startTime: { toMillis: () => 1_000_000 },
                  endTime: { toMillis: () => 3_000_000 },
                },
                true,
                "f1",
              ),
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "c1" }, true, "rep-uid"),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "o1", representativeIDs: ["rep-uid"] }, true, "c1"),
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/before the fair starts/i);
  });

  it("returns 201 and writes request when valid", async () => {
    const setFn = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_UPCOMING, true, "f1")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              if (sub === "enrollmentRequests") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                    set: setFn,
                  })),
                };
              }
              return { doc: jest.fn(() => ({ get: jest.fn() })) };
            }),
          })),
      };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "c1" }, true, "rep-uid"),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", ownerId: "o1", representativeIDs: ["rep-uid"] }, true, "c1"),
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({ message: "Please add us" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(setFn).toHaveBeenCalled();
  });

  it("returns 400 when boothIds is provided as empty array", async () => {
    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({ boothIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty array/i);
  });

  it("returns 200 with alreadyPending when duplicate pending request exists", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_UPCOMING, true, "f1")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              if (sub === "enrollmentRequests") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(
                      mockDocSnap({ status: "pending", companyName: "Acme" }, true, "c1"),
                    ),
                  })),
                };
              }
              return { doc: jest.fn(() => ({ get: jest.fn() })) };
            }),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "c1" }, true, "rep-uid"),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", ownerId: "o1", representativeIDs: ["rep-uid"] }, true, "c1"),
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.alreadyPending).toBe(true);
    expect(res.body.success).toBe(true);
  });

  it("returns 403 when boothIds includes a booth for another company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_UPCOMING, true, "f1")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              if (sub === "enrollmentRequests") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              return { doc: jest.fn(() => ({ get: jest.fn() })) };
            }),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "c1" }, true, "rep-uid"),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", ownerId: "o1", representativeIDs: ["rep-uid"] }, true, "c1"),
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          doc: jest.fn((bid) => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "other-co", boothName: "X" }, true, bid),
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID)
      .send({ boothIds: ["b-other"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong/i);
  });
});

describe("GET /api/fairs/:fairId/enrollment-requests", () => {
  beforeEach(() => {
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "a@test.com" });
    verifyAdmin.mockResolvedValue(null);
  });

  it("returns 403 for non-admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "No", status: 403 });
    const res = await request(app)
      .get("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID);
    expect(res.status).toBe(403);
  });

  it("returns pending requests for admin with names and booth labels", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        const reqCol = {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                id: "c1",
                data: () => ({
                  companyName: "Acme",
                  requestedBy: "u1",
                  boothIds: ["b1"],
                  message: "Hi",
                  status: "pending",
                  createdAt: { toMillis: () => 100 },
                  updatedAt: { toMillis: () => 100 },
                }),
              },
            ]),
          ),
        };
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub) => (sub === "enrollmentRequests" ? reqCol : { get: jest.fn() })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn((uid) => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ firstName: "Pat", lastName: "Jordan", email: "pat@test.com" }, true, uid),
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ boothName: "Engineering" }, true, id)),
          })),
        };
      }
      return {};
    });
    const res = await request(app)
      .get("/api/fairs/f1/enrollment-requests")
      .set("Authorization", VALID);
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].companyId).toBe("c1");
    expect(res.body.requests[0].requestedByName).toBe("Pat Jordan");
    expect(res.body.requests[0].booths).toEqual([{ id: "b1", boothName: "Engineering" }]);
  });
});

describe("POST approve / reject enrollment request", () => {
  beforeEach(() => {
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "a@test.com" });
    verifyAdmin.mockResolvedValue(null);
  });

  it("approve returns 404 when no request doc", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub) => {
              if (sub === "enrollmentRequests") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              return { doc: jest.fn() };
            }),
          })),
        };
      }
      return {};
    });
    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests/c1/approve")
      .set("Authorization", VALID);
    expect(res.status).toBe(404);
  });

  it("reject updates request doc", async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub) => {
              if (sub === "enrollmentRequests") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(
                      mockDocSnap({ status: "pending", companyName: "Acme" }, true, "c1"),
                    ),
                    update: updateFn,
                  })),
                };
              }
              return { doc: jest.fn() };
            }),
          })),
        };
      }
      return {};
    });
    const res = await request(app)
      .post("/api/fairs/f1/enrollment-requests/c1/reject")
      .set("Authorization", VALID)
      .send({ reason: "No space" });
    expect(res.status).toBe(200);
    expect(updateFn).toHaveBeenCalled();
  });
});

describe("GET /api/fairs/pending-enrollment-request-counts", () => {
  beforeEach(() => {
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "a@test.com" });
    verifyAdmin.mockResolvedValue(null);
  });

  it("returns 403 for non-admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "No", status: 403 });
    const res = await request(app)
      .get("/api/fairs/pending-enrollment-request-counts")
      .set("Authorization", VALID);
    expect(res.status).toBe(403);
  });

  it("aggregates counts by fair id", async () => {
    function fairDoc(id, pendingSize) {
      return {
        id,
        ref: {
          collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ size: pendingSize }),
          })),
        },
      };
    }
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [fairDoc("fair-a", 2), fairDoc("fair-b", 1)],
          }),
        };
      }
      return { get: jest.fn(), doc: jest.fn() };
    });
    const res = await request(app)
      .get("/api/fairs/pending-enrollment-request-counts")
      .set("Authorization", VALID);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ "fair-a": 2, "fair-b": 1 });
  });
});
