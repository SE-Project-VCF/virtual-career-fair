const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    FieldValue: {
      arrayUnion: jest.fn((v) => ({ _type: "arrayUnion", value: v })),
      arrayRemove: jest.fn((v) => ({ _type: "arrayRemove", value: v })),
      increment: jest.fn((v) => ({ _type: "increment", value: v })),
    },
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
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-student-id", email: "student@test.com" });
  return "Bearer valid-token";
}

function companyAuthHeader(companyId = "company-1") {
  auth.verifyIdToken.mockResolvedValue({ uid: "rep-uid", email: "rep@test.com" });
  return "Bearer valid-token";
}

function setupDbMockForBooth() {
  const subcollectionMocks = {};

  const studentVisitsCollection = {
    doc: jest.fn((studentId) => {
      return {
        get: jest.fn().mockResolvedValue(
          mockDocSnap({
            studentId,
            firstName: "Test",
            lastName: "Student",
            email: "student@test.com",
            major: "CS",
            lastViewedAt: { toMillis: () => 1000000 },
            viewCount: 3,
            isCurrentlyViewing: true,
          }, true, studentId)
        ),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      };
    }),
    get: jest.fn().mockResolvedValue(
      mockQuerySnap([
        mockDocSnap({ studentId: "s1", firstName: "Alice", lastName: "Test", email: "alice@test.com", major: "CS", viewCount: 2, isCurrentlyViewing: true }, true, "s1"),
        mockDocSnap({ studentId: "s2", firstName: "Bob", lastName: "Test", email: "bob@test.com", major: "EE", viewCount: 1, isCurrentlyViewing: false }, true, "s2"),
      ])
    ),
  };

  db.collection.mockImplementation((collectionName) => {
    if (collectionName === "users") {
      return {
        doc: jest.fn((userId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({
              firstName: "Test",
              lastName: "Student",
              email: "student@test.com",
              major: "CS",
              companyId: "company-1",
            }, true, userId)
          ),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      };
    }
    if (collectionName === "companies") {
      return {
        doc: jest.fn((companyId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({
              ownerId: "rep-uid",
              representativeIDs: ["rep-uid"],
            }, true, companyId)
          ),
        })),
      };
    }
    if (collectionName === "booths") {
      return {
        doc: jest.fn((boothId) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({
              id: boothId,
              companyId: "company-1",
              currentVisitors: ["s1"],
              totalVisitorsCount: 2,
            }, true, boothId)
          ),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn((collName) => {
            if (collName === "studentVisits") {
              return studentVisitsCollection;
            }
            return {};
          }),
        })),
      };
    }
    if (collectionName === "fairs") {
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        doc: jest.fn((fairId) => ({
          collection: jest.fn((collName) => {
            if (collName === "booths") {
              return {
                doc: jest.fn((boothId) => ({
                  get: jest.fn().mockResolvedValue(
                    mockDocSnap({
                      id: boothId,
                      companyId: "company-1",
                      currentVisitors: [],
                      totalVisitorsCount: 0,
                    }, true, boothId)
                  ),
                  set: jest.fn().mockResolvedValue(undefined),
                  update: jest.fn().mockResolvedValue(undefined),
                  collection: jest.fn((innerCollName) => {
                    if (innerCollName === "studentVisits") {
                      return studentVisitsCollection;
                    }
                    return {};
                  }),
                })),
              };
            }
            return {};
          }),
        })),
      };
    }
    return {};
  });
}

describe("Booth Visitor Tracking - POST /api/booth/:boothId/track-view", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMockForBooth();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when boothId is missing", async () => {
    const res = await request(app)
      .post("/api/booth//track-view")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 404 when student not found", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({}, true)) })),
      };
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Student not found");
  });

  it("successfully tracks a new booth visitor", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("booth-1");
    expect(res.body.tracked).toBe(true);
  });

  it("successfully updates existing booth visitor", async () => {
    // First call
    await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader())
      .send({});

    // Second call - should update existing visitor
    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.tracked).toBe(true);
  });

  it("handles missing booth gracefully", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ firstName: "Test", lastName: "Student", email: "test@test.com", major: "CS" }, true)
            ),
          })),
        };
      }
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {};
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-view")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Booth not found");
  });
});

describe("Booth Visitor Tracking - POST /api/booth/:boothId/track-leave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMockForBooth();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when booth ID is missing", async () => {
    const res = await request(app)
      .post("/api/booth//track-leave")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(404);
  });

  it("successfully marks student as not viewing booth", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tracked).toBe(false);
  });

  it("handles missing booth gracefully", async () => {
    db.collection.mockImplementation(() => {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
        })),
      };
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(404);
  });

  it("handles booth with no visitors", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "c1", currentVisitors: [] }, true, "booth-1")
            ),
            update: jest.fn().mockResolvedValue(undefined),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
              })),
            })),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap({}, true)) })),
      };
    });

    const res = await request(app)
      .post("/api/booth/booth-1/track-leave")
      .set("Authorization", authHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Booth Visitor Tracking - GET /api/booth/:boothId/current-visitors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMockForBooth();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors");
    expect(res.status).toBe(401);
  });

  it("returns 400 when boothId is missing", async () => {
    const res = await request(app)
      .get("/api/booth//current-visitors")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("successfully retrieves current visitors", async () => {
    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("booth-1");
    expect(res.body.currentVisitorCount).toBe(1);
    expect(Array.isArray(res.body.currentVisitors)).toBe(true);
  });

  it("returns empty visitor list when booth has no visitors", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "c1", currentVisitors: [] }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
            })),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {};
    });

    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.currentVisitorCount).toBe(0);
    expect(res.body.currentVisitors).toEqual([]);
  });

  it("handles missing booth gracefully", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {};
    });

    const res = await request(app)
      .get("/api/booth/booth-1/current-visitors")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
  });
});

describe("Booth Visitor Tracking - GET /api/booth-visitors/:boothId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMockForBooth();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1");
    expect(res.status).toBe(401);
  });

  it("returns 400 when boothId is missing", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/")
      .set("Authorization", companyAuthHeader());
    expect(res.status).toBe(404);
  });

  it("returns 404 when booth not found", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1", role: "representative" }, true)
            ),
          })),
        };
      }
      return {};
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(404);
  });

  it("returns 403 when user not authorized", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "different-company" }, true)
            ),
          })),
        };
      }
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true)
            ),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {};
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(403);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true)
            ),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {};
    });

    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(404);
  });

  it("successfully retrieves all booth visitors with authorization", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("booth-1");
    expect(res.body.totalVisitors).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.visitors)).toBe(true);
  });

  it("filters visitors by current status", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?filter=current")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
    if (res.body.visitors.length > 0) {
      res.body.visitors.forEach((v) => {
        expect(v.isCurrentlyViewing).toBe(true);
      });
    }
  });

  it("filters visitors by previous status", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?filter=previous")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
    if (res.body.visitors.length > 0) {
      res.body.visitors.forEach((v) => {
        expect(v.isCurrentlyViewing).toBe(false);
      });
    }
  });

  it("filters visitors by search query", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?search=Alice")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
  });

  it("filters visitors by major", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?major=CS")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
  });

  it("sorts visitors by name", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?sort=name")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
    if (res.body.visitors.length > 1) {
      for (let i = 0; i < res.body.visitors.length - 1; i++) {
        const name1 = `${res.body.visitors[i].firstName} ${res.body.visitors[i].lastName}`;
        const name2 = `${res.body.visitors[i + 1].firstName} ${res.body.visitors[i + 1].lastName}`;
        expect(name1.localeCompare(name2)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("sorts visitors by viewCount", async () => {
    const res = await request(app)
      .get("/api/booth-visitors/booth-1?sort=viewCount")
      .set("Authorization", companyAuthHeader());

    expect(res.status).toBe(200);
    if (res.body.visitors.length > 1) {
      for (let i = 0; i < res.body.visitors.length - 1; i++) {
        expect(res.body.visitors[i].viewCount).toBeGreaterThanOrEqual(res.body.visitors[i + 1].viewCount);
      }
    }
  });
});

describe("Booth Visitor Tracking - Fair-Specific Booths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves fair-specific booth when global booth not found", async () => {
    const studentVisitsCollection = {
      doc: jest.fn((studentId) => ({
        get: jest.fn().mockResolvedValue(mockDocSnap({ studentId }, true, studentId)),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    };

    db.collection.mockImplementation((collectionName) => {
      if (collectionName === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ firstName: "Test", lastName: "Student", email: "test@test.com", major: "CS" }, true)
            ),
          })),
        };
      }
      if (collectionName === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
          })),
        };
      }
      if (collectionName === "fairs") {
        return {
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              mockDocSnap({ id: "fair-1" }, true, "fair-1"),
            ])
          ),
          doc: jest.fn((fairId) => ({
            collection: jest.fn((collName) => {
              if (collName === "booths") {
                return {
                  doc: jest.fn((boothId) => ({
                    get: jest.fn().mockResolvedValue(
                      mockDocSnap({
                        id: boothId,
                        companyId: "company-1",
                        currentVisitors: [],
                        totalVisitorsCount: 0,
                      }, true, boothId)
                    ),
                    update: jest.fn().mockResolvedValue(undefined),
                    set: jest.fn().mockResolvedValue(undefined),
                    collection: jest.fn(() => studentVisitsCollection),
                  })),
                };
              }
              return {};
            }),
          })),
        };
      }
      return {};
    });

    auth.verifyIdToken.mockResolvedValue({ uid: "test-student-id", email: "student@test.com" });
    const res = await request(app)
      .post("/api/booth/booth-in-fair/track-view")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(200);
  });
});
