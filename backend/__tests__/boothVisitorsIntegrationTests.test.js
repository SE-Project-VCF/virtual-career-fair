/**
 * Booth Visitors - Focused Integration Tests
 * 
 * Real HTTP requests to booth visitor endpoints using supertest.
 * These tests execute actual endpoint code, generating measurable coverage.
 */

const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    increment: jest.fn((val) => ({ _type: "FieldValue.increment", value: val })),
    arrayUnion: jest.fn((val) => ({ _type: "FieldValue.arrayUnion", value: val })),
    arrayRemove: jest.fn((val) => ({ _type: "FieldValue.arrayRemove", value: val })),
  };
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
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

// Authentication helpers
function studentAuth(uid = "student-123") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

function companyAuth(uid = "company-rep") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@company.com` });
  return "Bearer valid-token";
}

// Firestore mock setup helper
function setupDbForTrackView(options = {}) {
  const {
    studentExists = true,
    boothExists = true,
    visitorExists = false,
  } = options;

  db.collection.mockImplementation((collName) => {
    // Users collection
    if (collName === "users") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              {
                firstName: "John",
                lastName: "Doe",
                email: "student@test.com",
                major: "Computer Science",
              },
              studentExists,
              "student-123"
            )
          ),
        })),
      };
    }

    // Booths collection
    if (collName === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              {
                currentVisitors: [],
                totalVisitorsCount: 0,
              },
              boothExists,
              boothId
            )
          ),
          update: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn((subCollName) => {
            // studentVisits subcollection
            if (subCollName === "studentVisits") {
              return {
                doc: jest.fn((studentId) => ({
                  get: jest.fn().mockResolvedValue(
                    mockDocSnap(null, visitorExists, studentId)
                  ),
                  set: jest.fn().mockResolvedValue(undefined),
                  update: jest.fn().mockResolvedValue(undefined),
                })),
              };
            }
            return {};
          }),
        })),
      };
    }

    // Fairs collection (for resolveBooth fallback)
    if (collName === "fairs") {
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return { doc: jest.fn(() => ({})) };
  });
}

function setupDbForTrackLeave() {
  db.collection.mockImplementation((collName) => {
    if (collName === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              {
                currentVisitors: ["student-123"],
              },
              true,
              boothId
            )
          ),
          update: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn((subCollName) => {
            if (subCollName === "studentVisits") {
              return {
                doc: jest.fn((studentId) => ({
                  get: jest.fn().mockResolvedValue(
                    mockDocSnap({ isCurrentlyViewing: true }, true, studentId)
                  ),
                  update: jest.fn().mockResolvedValue(undefined),
                })),
              };
            }
            return {};
          }),
        })),
      };
    }

    if (collName === "fairs") {
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return { doc: jest.fn(() => ({})) };
  });
}

function setupDbForCurrentVisitors() {
  const visitorData = {
    "student-1": {
      studentId: "student-1",
      firstName: "John",
      lastName: "Doe",
      major: "CS",
    },
    "student-2": {
      studentId: "student-2",
      firstName: "Jane",
      lastName: "Smith",
      major: "Math",
    },
  };

  db.collection.mockImplementation((collName) => {
    if (collName === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              {
                currentVisitors: ["student-1", "student-2"],
              },
              true,
              boothId
            )
          ),
          collection: jest.fn((subCollName) => {
            if (subCollName === "studentVisits") {
              return {
                doc: jest.fn((visitorId) => ({
                  get: jest.fn().mockResolvedValue(
                    mockDocSnap(visitorData[visitorId], true, visitorId)
                  ),
                })),
              };
            }
            return {};
          }),
        })),
      };
    }

    if (collName === "fairs") {
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return { doc: jest.fn(() => ({})) };
  });
}

function setupDbForBoothVisitors(options = {}) {
  const {
    visitors = [],
    userCompanyId = "company-A",
    boothCompanyId = "company-A",
  } = options;

  const visitorDocs = visitors.map((v) =>
    mockDocSnap(v, true, v.studentId)
  );

  db.collection.mockImplementation((collName) => {
    if (collName === "users") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ companyId: userCompanyId }, true, "company-rep")
          ),
        })),
      };
    }

    if (collName === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ companyId: boothCompanyId }, true, boothId)
          ),
          collection: jest.fn((subCollName) => {
            if (subCollName === "studentVisits") {
              return {
                get: jest.fn().mockResolvedValue(
                  mockQuerySnap(visitorDocs)
                ),
              };
            }
            return {};
          }),
        })),
      };
    }

    if (collName === "fairs") {
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return { doc: jest.fn(() => ({})) };
  });
}

// ============================================================
// Test Suites
// ============================================================

describe("POST /api/booth/:boothId/track-view - Track Visitor Entry", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns 404 when student not found", async () => {
    setupDbForTrackView({ studentExists: false });

    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 404 when booth not found", async () => {
    setupDbForTrackView({ boothExists: false });

    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(404);
  });

  it("creates visitor record on first view", async () => {
    setupDbForTrackView({ visitorExists: false });

    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(true);
  });

  it("updates visitor record on return visit", async () => {
    setupDbForTrackView({ visitorExists: true });

    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 on database error", async () => {
    db.collection.mockImplementation(() => {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(new Error("DB error")),
        })),
      };
    });

    const res = await request(app)
      .post("/api/booth/booth-123/track-view")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(500);
  });
});

describe("POST /api/booth/:boothId/track-leave - Track Visitor Exit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/booth/booth-123/track-leave")
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((collName) => {
      if (collName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      if (collName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn(() => ({})) };
    });

    const res = await request(app)
      .post("/api/booth/booth-123/track-leave")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(404);
  });

  it("marks visitor as not currently viewing", async () => {
    setupDbForTrackLeave();

    const res = await request(app)
      .post("/api/booth/booth-123/track-leave")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(false);
  });

  it("removes student from currentVisitors", async () => {
    setupDbForTrackLeave();

    const res = await request(app)
      .post("/api/booth/booth-123/track-leave")
      .set("Authorization", studentAuth())
      .send({});

    expect(res.status).toBe(200);
  });
});

describe("GET /api/booth/:boothId/current-visitors - View Current Booth Visitors", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .get("/api/booth/booth-123/current-visitors");

    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((collName) => {
      if (collName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      if (collName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn(() => ({})) };
    });

    const res = await request(app)
      .get("/api/booth/booth-123/current-visitors")
      .set("Authorization", studentAuth());

    expect(res.status).toBe(404);
  });

  it("returns current visitors with details", async () => {
    setupDbForCurrentVisitors();

    const res = await request(app)
      .get("/api/booth/booth-123/current-visitors")
      .set("Authorization", studentAuth());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.currentVisitorCount).toBe(2);
    expect(res.body.currentVisitors).toHaveLength(2);
  });

  it("returns empty list when no current visitors", async () => {
    db.collection.mockImplementation((collName) => {
      if (collName === "booths") {
        return {
          doc: jest.fn((boothId) => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ currentVisitors: [] }, true, boothId)
            ),
            collection: jest.fn((subCollName) => {
              if (subCollName === "studentVisits") {
                return {
                  get: jest.fn().mockResolvedValue(mockQuerySnap([])),
                };
              }
              return {};
            }),
          })),
        };
      }
      if (collName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn(() => ({})) };
    });

    const res = await request(app)
      .get("/api/booth/booth-123/current-visitors")
      .set("Authorization", studentAuth());

    expect(res.status).toBe(200);
    expect(res.body.currentVisitorCount).toBe(0);
  });
});

describe("GET /api/booth-visitors/:boothId - Company Analytics with Filtering/Sorting", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-123");

    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((collName) => {
      if (collName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      if (collName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn(() => ({})) };
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(404);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation((collName) => {
      if (collName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      if (collName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-A" }, true)
            ),
          })),
        };
      }
      if (collName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { doc: jest.fn(() => ({})) };
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(404);
  });

  it("returns 403 when company IDs don't match", async () => {
    setupDbForBoothVisitors({
      userCompanyId: "company-A",
      boothCompanyId: "company-B",
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(403);
  });

  it("returns all visitors when authorized", async () => {
    const visitors = [
      {
        studentId: "s1",
        firstName: "John",
        lastName: "Doe",
        major: "CS",
        isCurrentlyViewing: true,
        viewCount: 3,
        lastViewedAt: { toMillis: () => 2000 },
      },
      {
        studentId: "s2",
        firstName: "Jane",
        lastName: "Smith",
        major: "Math",
        isCurrentlyViewing: false,
        viewCount: 1,
        lastViewedAt: { toMillis: () => 1000 },
      },
    ];

    setupDbForBoothVisitors({ visitors });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalVisitors).toBe(2);
    expect(res.body.currentlyViewing).toBe(1);
  });

  it("filters current visitors (filter=current)", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", isCurrentlyViewing: true, firstName: "A" },
        { studentId: "s2", isCurrentlyViewing: false, firstName: "B" },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?filter=current")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].isCurrentlyViewing).toBe(true);
  });

  it("filters previous visitors (filter=previous)", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", isCurrentlyViewing: true, firstName: "A" },
        { studentId: "s2", isCurrentlyViewing: false, firstName: "B" },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?filter=previous")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].isCurrentlyViewing).toBe(false);
  });

  it("searches by name", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "John", lastName: "Doe", email: "john@test.com", isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Jane", lastName: "Smith", email: "jane@test.com", isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?search=john")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].firstName).toBe("John");
  });

  it("searches by email (case-insensitive)", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "John", email: "JOHN@TEST.COM", isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Jane", email: "jane@test.com", isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?search=john@test")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
  });

  it("filters by major", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "John", major: "Computer Science", isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Jane", major: "Mathematics", isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?major=Computer")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].major).toContain("Computer");
  });

  it("sorts by recent (default)", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "John", lastViewedAt: { toMillis: () => 1000 }, isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Jane", lastViewedAt: { toMillis: () => 3000 }, isCurrentlyViewing: true },
        { studentId: "s3", firstName: "Bob", lastViewedAt: { toMillis: () => 2000 }, isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors[0].studentId).toBe("s2");
    expect(res.body.visitors[1].studentId).toBe("s3");
    expect(res.body.visitors[2].studentId).toBe("s1");
  });

  it("sorts by name", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "Charlie", lastName: "Brown", isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Alice", lastName: "Adams", isCurrentlyViewing: true },
        { studentId: "s3", firstName: "Bob", lastName: "Baker", isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?sort=name")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors[0].firstName).toBe("Alice");
    expect(res.body.visitors[1].firstName).toBe("Bob");
    expect(res.body.visitors[2].firstName).toBe("Charlie");
  });

  it("sorts by viewCount", async () => {
    setupDbForBoothVisitors({
      visitors: [
        { studentId: "s1", firstName: "John", viewCount: 5, isCurrentlyViewing: true },
        { studentId: "s2", firstName: "Jane", viewCount: 10, isCurrentlyViewing: true },
        { studentId: "s3", firstName: "Bob", viewCount: 3, isCurrentlyViewing: true },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?sort=viewCount")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors[0].viewCount).toBe(10);
    expect(res.body.visitors[1].viewCount).toBe(5);
    expect(res.body.visitors[2].viewCount).toBe(3);
  });

  it("combines multiple filters with sorting", async () => {
    setupDbForBoothVisitors({
      visitors: [
        {
          studentId: "s1",
          firstName: "John",
          lastName: "Doe",
          major: "Computer Science",
          isCurrentlyViewing: true,
          viewCount: 5,
          lastViewedAt: { toMillis: () => 2000 },
        },
        {
          studentId: "s2",
          firstName: "Jane",
          lastName: "Smith",
          major: "Computer Science",
          isCurrentlyViewing: false,
          viewCount: 10,
          lastViewedAt: { toMillis: () => 3000 },
        },
        {
          studentId: "s3",
          firstName: "Bob",
          lastName: "Johnson",
          major: "Mathematics",
          isCurrentlyViewing: true,
          viewCount: 3,
          lastViewedAt: { toMillis: () => 1000 },
        },
      ],
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123?filter=current&major=Computer&sort=viewCount")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].studentId).toBe("s1");
  });

  it("returns 500 on database error", async () => {
    db.collection.mockImplementation(() => {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(new Error("DB error")),
        })),
      };
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-123")
      .set("Authorization", companyAuth());

    expect(res.status).toBe(500);
  });
});
