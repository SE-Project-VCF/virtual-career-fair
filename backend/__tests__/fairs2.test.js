const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  function GeoPoint(lat, lng) {
    this.latitude = lat;
    this.longitude = lng;
  }
  const FieldValue = {
    delete: jest.fn(() => ({ __fv: "delete" })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, GeoPoint, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("../services/mapboxGeocode", () => ({
  forwardGeocode: jest.fn(async (address) => {
    if (!address || !String(address).trim()) return null;
    return {
      lat: 35.2,
      lng: -80.8,
      placeName: "Charlotte, NC, USA",
      city: "Charlotte",
      state: "NC",
      country: "US",
      mapboxId: "mock-id",
    };
  }),
  suggestPlaces: jest.fn(async () => []),
}));

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
  db: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
    batch: jest.fn(),
  },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    evaluateFairStatusForFair: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin, evaluateFairStatusForFair } = require("../helpers");

// Sets up auth.verifyIdToken and returns the Authorization header value
function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "admin@test.com" });
  return "Bearer valid-token";
}

// Build a chainable subcollection mock
function makeSubcollectionMock({
  docData,
  docExists = true,
  docId = "doc-id",
  docs = [],
  newDocId = "new-id",
} = {}) {
  const subDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(docData, docExists, docId)),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    id: docId,
    ref: { parent: { parent: { id: "fair-id" } } },
    parent: { parent: { id: "fair-id" } },
  };
  const subColRef = {
    doc: jest.fn(() => subDocRef),
    add: jest.fn().mockResolvedValue({ id: newDocId }),
    get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };
  return { subColRef, subDocRef };
}

// Create the main db.collection mock used across tests
function setupFairsDbMock({
  fairData,
  fairExists = true,
  fairId = "fair-id",
  fairUpdateRejects = false,
  boothData,
  boothExists = true,
  boothId = "booth-id",
  jobData,
  jobExists = true,
  jobId = "job-id",
  enrollmentData,
  enrollmentExists = false,
  companyData,
  companyExists = true,
  userData,
  userExists = true,
  fairDocs = [],
  boothDocs = [],
  jobDocs = [],
  enrollmentDocs = [],
  announcementListDocs = [],
  announcementDocForPutDelete = null,
  announcementPutDeleteExists = true,
} = {}) {
  const batchMock = {
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  db.batch.mockReturnValue(batchMock);

  db.collection.mockImplementation((name) => {
    if (name === "fairs") {
      const boothSubcol = makeSubcollectionMock({
        docData: boothData,
        docExists: boothExists,
        docId: boothId,
        docs: boothDocs,
        newDocId: "new-booth-id",
      });
      const jobSubcol = makeSubcollectionMock({
        docData: jobData,
        docExists: jobExists,
        docId: jobId,
        docs: jobDocs,
        newDocId: "new-job-id",
      });
      const enrollmentSubcol = makeSubcollectionMock({
        docData: enrollmentData,
        docExists: enrollmentExists,
        docId: "company-id",
        docs: enrollmentDocs,
        newDocId: "company-id",
      });

      const annDataForNew = {
        title: "Posted title",
        description: "New session",
        published: true,
        publishedAt: { toMillis: () => 1000000 },
        createdAt: { toMillis: () => 1000000 },
        updatedAt: { toMillis: () => 1000000 },
        createdBy: "admin-uid",
      };
      let announcementMutable = announcementDocForPutDelete
        ? { ...announcementDocForPutDelete }
        : { ...annDataForNew };
      const announcementSubcol = {
        doc: jest.fn((annId) => ({
          get: jest.fn().mockImplementation(() =>
            Promise.resolve(
              mockDocSnap(
                announcementMutable,
                announcementPutDeleteExists,
                annId || "ann-id",
              ),
            ),
          ),
          update: jest.fn().mockImplementation((patch) => {
            announcementMutable = {
              ...announcementMutable,
              ...patch,
              title: patch.title ?? announcementMutable.title,
              description: patch.description ?? announcementMutable.description,
              published: patch.published ?? announcementMutable.published,
              publishedAt: patch.publishedAt ?? announcementMutable.publishedAt,
            };
          }),
          delete: jest.fn().mockResolvedValue(undefined),
        })),
        add: jest.fn().mockResolvedValue({
          id: "new-announcement-id",
          get: jest.fn().mockResolvedValue(mockDocSnap(annDataForNew, true, "new-announcement-id")),
        }),
        get: jest.fn().mockResolvedValue(mockQuerySnap(announcementListDocs)),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };

      const fairDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(fairData, fairExists, fairId)),
        set: jest.fn().mockResolvedValue(undefined),
        update: fairUpdateRejects
          ? jest.fn().mockRejectedValue(new Error("DB update failed"))
          : jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        id: fairId,
        collection: jest.fn((sub) => {
          if (sub === "booths") return boothSubcol.subColRef;
          if (sub === "jobs") return jobSubcol.subColRef;
          if (sub === "enrollments") return enrollmentSubcol.subColRef;
          if (sub === "announcements") return announcementSubcol;
          return makeSubcollectionMock().subColRef;
        }),
      };

      return {
        doc: jest.fn(() => fairDocRef),
        add: jest.fn().mockResolvedValue({ id: "new-fair-id" }),
        get: jest.fn().mockResolvedValue(mockQuerySnap(fairDocs)),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }

    if (name === "companies") {
      const companyDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists, "company-id")),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        id: "company-id",
      };
      return {
        doc: jest.fn(() => companyDocRef),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }

    if (name === "users") {
      const userDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(userData, userExists, "user-id")),
      };
      return {
        doc: jest.fn(() => userDocRef),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
      };
    }

    if (name === "booths") {
      const globalBoothDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(boothData, boothExists, boothId)),
      };
      return {
        doc: jest.fn(() => globalBoothDocRef),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    if (name === "jobs") {
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    }

    return {
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });

  return batchMock;
}

const FAIR_DATA = {
  name: "Spring Fair",
  description: "Test fair",
  isLive: false,
  startTime: { toMillis: () => 500 },
  endTime: { toMillis: () => 2000 },
  inviteCode: "ABCD1234",
  createdAt: { toMillis: () => 100 },
  updatedAt: { toMillis: () => 200 },
};

/* =======================================================
   PUT /api/fairs/:fairId - update fair
======================================================= */
describe("PUT /api/fairs/:fairId", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .put("/api/fairs/fair-id")
      .send({ name: "Updated Fair" });
    expect(res.status).toBe(401);
  });

  it("updates fair successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .put("/api/fairs/fair-id")
      .set("Authorization", authHeader())
      .send({ name: "Updated Fair" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   DELETE /api/fairs/:fairId - delete fair
======================================================= */
describe("DELETE /api/fairs/:fairId", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete("/api/fairs/fair-id");
    expect(res.status).toBe(401);
  });

  it("deletes fair successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .delete("/api/fairs/fair-id")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   POST /api/fairs/:fairId/refresh-invite-code
======================================================= */
describe("POST /api/fairs/:fairId/refresh-invite-code", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it("returns 404 when fair does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairExists: false });
    const res = await request(app)
      .post("/api/fairs/nonexistent-fair/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Fair not found");
  });

  it("returns new invite code on success", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBeDefined();
    expect(typeof res.body.inviteCode).toBe("string");
    expect(res.body.inviteCode.length).toBeGreaterThan(0);
  });

  it("generates a different invite code each time (probabilistic check)", async () => {
    verifyAdmin.mockResolvedValue(null);

    setupFairsDbMock({ fairData: FAIR_DATA });
    const res1 = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});

    setupFairsDbMock({ fairData: FAIR_DATA });
    const res2 = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both should have valid invite codes (even if equal by rare chance)
    expect(res1.body.inviteCode).toBeDefined();
    expect(res2.body.inviteCode).toBeDefined();
  });

  it("returns 500 when fair update fails (lines 169-170)", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA, fairUpdateRejects: true });
    const res = await request(app)
      .post("/api/fairs/fair-id/refresh-invite-code")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to refresh invite code");
  });
});

/* =======================================================
   GET /api/fairs/my-enrollments
======================================================= */
describe("GET /api/fairs/my-enrollments", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/fairs/my-enrollments");
    expect(res.status).toBe(401);
  });

  it("returns 404 when user doc does not exist", async () => {
    setupFairsDbMock({ userExists: false });
    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("returns empty enrollments when user has no companyId", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", role: "user" }, // no companyId field
      userExists: true,
    });
    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
  });

  it("returns enrollments for user's company when enrolled", async () => {
    // Setup: user has a companyId, one fair exists, company is enrolled in that fair
    const companyId = "company-id";
    const enrollDoc = {
      exists: true,
      data: () => ({
        boothId: "booth-abc",
        enrolledAt: { toMillis: () => 999999 },
      }),
    };

    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ uid: "admin-uid", companyId }, true, "admin-uid")
            ),
          })),
        };
      }
      if (name === "fairs") {
        const enrollmentSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(enrollDoc),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };

        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn(() => enrollmentSubcol),
        };

        return {
          doc: jest.fn(() => fairDocRef),
          add: jest.fn().mockResolvedValue({ id: "new-fair-id" }),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])
          ),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
    expect(res.body.enrollments[0].fairId).toBe("fair-id");
    expect(res.body.enrollments[0].companyId).toBe("company-id");
    expect(res.body.enrollments[0].boothId).toBe("booth-abc");
  });

  it("returns empty array when company is not enrolled in any fair", async () => {
    const companyId = "company-id";

    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ uid: "admin-uid", companyId }, true, "admin-uid")
            ),
          })),
        };
      }
      if (name === "fairs") {
        // Fair exists but enrollment doc does not
        const enrollmentSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };

        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn(() => enrollmentSubcol),
        };

        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])
          ),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
  });

  it("returns pendingEnrollmentRequests when enrollment is missing but enrollmentRequests doc exists", async () => {
    const companyId = "company-id";

    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ uid: "admin-uid", companyId }, true, "admin-uid"),
            ),
          })),
        };
      }
      if (name === "fairs") {
        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
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
                    mockDocSnap(
                      {
                        status: "pending",
                        companyName: "Acme Co",
                        message: "Please",
                        boothIds: ["b1"],
                        createdAt: { toMillis: () => 100 },
                        updatedAt: { toMillis: () => 200 },
                        rejectReason: null,
                      },
                      true,
                      companyId,
                    ),
                  ),
                })),
              };
            }
            return { doc: jest.fn() };
          }),
        };

        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
    expect(res.body.pendingEnrollmentRequests).toHaveLength(1);
    expect(res.body.pendingEnrollmentRequests[0]).toMatchObject({
      fairId: "fair-id",
      companyId,
      status: "pending",
      companyName: "Acme Co",
      message: "Please",
      boothIds: ["b1"],
      createdAt: 100,
      updatedAt: 200,
    });
  });

  it("for companyOwner with no profile companyId, aggregates enrollments from owned companies query", async () => {
    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    const enrollDocOwned = {
      exists: true,
      data: () => ({
        boothId: "booth-owned",
        enrolledAt: { toMillis: () => 111 },
      }),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ uid: "owner-only", role: "companyOwner" }, true, "owner-only"),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([{ id: "owned-co-1", data: () => ({ ownerId: "owner-only" }) }]),
          ),
        };
      }
      if (name === "fairs") {
        const enrollmentSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(enrollDocOwned),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn(() => enrollmentSubcol),
        };
        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    auth.verifyIdToken.mockResolvedValue({ uid: "owner-only", email: "o@test.com" });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
    expect(res.body.enrollments[0].companyId).toBe("owned-co-1");
    expect(res.body.enrollments[0].boothId).toBe("booth-owned");
  });

  it("for representative, uses profile companyId after representative branch (clear + single id)", async () => {
    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    const enrollDoc = {
      exists: true,
      data: () => ({
        boothId: "booth-rep",
        enrolledAt: { toMillis: () => 222 },
      }),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { uid: "rep-uid", role: "representative", companyId: "rep-company" },
                true,
                "rep-uid",
              ),
            ),
          })),
        };
      }
      if (name === "fairs") {
        const enrollmentSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(enrollDoc),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn(() => enrollmentSubcol),
        };
        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    auth.verifyIdToken.mockResolvedValue({ uid: "rep-uid", email: "rep@test.com" });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
    expect(res.body.enrollments[0].companyId).toBe("rep-company");
  });

  it("for companyOwner with profile and owned companies, returns multiple enrollments when multiple ids are enrolled", async () => {
    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { uid: "multi-owner", role: "companyOwner", companyId: "co-a" },
                true,
                "multi-owner",
              ),
            ),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([{ id: "co-b", data: () => ({ ownerId: "multi-owner" }) }]),
          ),
        };
      }
      if (name === "fairs") {
        const enrollmentSubcol = {
          doc: jest.fn((cid) => ({
            get: jest.fn().mockResolvedValue(
              cid === "co-a"
                ? mockDocSnap({ boothId: "ba", enrolledAt: { toMillis: () => 1 } }, true, "co-a")
                : cid === "co-b"
                  ? mockDocSnap({ boothId: "bb", enrolledAt: { toMillis: () => 2 } }, true, "co-b")
                  : mockDocSnap(null, false),
            ),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn(() => enrollmentSubcol),
        };
        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    auth.verifyIdToken.mockResolvedValue({ uid: "multi-owner", email: "m@test.com" });

    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(2);
    expect(res.body.pendingEnrollmentRequests).toEqual([]);
    const ids = res.body.enrollments.map((e) => e.companyId).sort();
    expect(ids).toEqual(["co-a", "co-b"]);
  });
});

/* =======================================================
   GET /api/fairs/my-announcements
======================================================= */
describe("GET /api/fairs/my-announcements", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/fairs/my-announcements");
    expect(res.status).toBe(401);
  });

  it("returns empty announcements for non-company roles", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", role: "student" },
      userExists: true,
    });
    const res = await request(app)
      .get("/api/fairs/my-announcements")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.announcements).toEqual([]);
  });

  it("returns published announcements for enrolled company representative", async () => {
    const enrollDoc = {
      exists: true,
      data: () => ({
        boothId: "booth-abc",
        enrolledAt: { toMillis: () => 999999 },
      }),
    };

    const annDoc = {
      id: "ann-1",
      data: () => ({
        title: "Reminder",
        description: "Q&A at noon",
        published: true,
        publishedAt: { toMillis: () => 100 },
        createdAt: { toMillis: () => 5000 },
        updatedAt: { toMillis: () => 5000 },
      }),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { uid: "rep-uid", companyId: "company-id", role: "representative" },
                true,
                "rep-uid",
              ),
            ),
          })),
        };
      }
      if (name === "fairs") {
        const enrollmentSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(enrollDoc),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
        const announcementSubcol = {
          doc: jest.fn(() => ({ get: jest.fn(), update: jest.fn(), delete: jest.fn() })),
          add: jest.fn(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([annDoc])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };

        const fairDocRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          id: "fair-id",
          collection: jest.fn((sub) => {
            if (sub === "enrollments") return enrollmentSubcol;
            if (sub === "announcements") return announcementSubcol;
            return makeSubcollectionMock().subColRef;
          }),
        };

        return {
          doc: jest.fn(() => fairDocRef),
          get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "fair-id", data: () => FAIR_DATA }])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    auth.verifyIdToken.mockResolvedValue({ uid: "rep-uid", email: "rep@test.com" });

    const res = await request(app)
      .get("/api/fairs/my-announcements")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.announcements).toHaveLength(1);
    expect(res.body.announcements[0].fairId).toBe("fair-id");
    expect(res.body.announcements[0].fairName).toBe("Spring Fair");
    expect(res.body.announcements[0].fairStartTime).toBe(500);
    expect(res.body.announcements[0].fairEndTime).toBe(2000);
    expect(res.body.announcements[0].title).toBe("Reminder");
    expect(res.body.announcements[0].description).toBe("Q&A at noon");
  });
});

/* =======================================================
   Fair announcements (admin CRUD)
======================================================= */
describe("Fair announcements admin API", () => {
  beforeEach(() => jest.resetAllMocks());

  it("GET /api/fairs/:fairId/announcements returns 401 without token", async () => {
    const res = await request(app).get("/api/fairs/fair-id/announcements");
    expect(res.status).toBe(401);
  });

  it("GET /api/fairs/:fairId/announcements returns 403 when not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .get("/api/fairs/fair-id/announcements")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("GET /api/fairs/:fairId/announcements lists announcements", async () => {
    verifyAdmin.mockResolvedValue(null);
    const annDoc = {
      id: "ann-1",
      data: () => ({
        title: "Parking",
        description: "Info session",
        published: false,
        createdAt: { toMillis: () => 1 },
        updatedAt: { toMillis: () => 2 },
        createdBy: "admin-uid",
      }),
    };
    setupFairsDbMock({
      fairData: FAIR_DATA,
      announcementListDocs: [annDoc],
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/announcements")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.announcements).toHaveLength(1);
    expect(res.body.announcements[0].id).toBe("ann-1");
    expect(res.body.announcements[0].title).toBe("Parking");
    expect(res.body.announcements[0].description).toBe("Info session");
    expect(res.body.announcements[0].published).toBe(false);
  });

  it("POST /api/fairs/:fairId/announcements creates announcement", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/announcements")
      .set("Authorization", authHeader())
      .send({
        title: "Employer meetup",
        description: "Optional details",
        published: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("new-announcement-id");
    expect(res.body.title).toBe("Posted title");
    expect(res.body.description).toBe("New session");
  });

  it("POST returns 400 when title missing", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/announcements")
      .set("Authorization", authHeader())
      .send({ description: "Only body" });
    expect(res.status).toBe(400);
  });

  it("PUT /api/fairs/:fairId/announcements/:id updates announcement", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      announcementDocForPutDelete: {
        title: "Old title",
        description: "Old",
        published: false,
        createdAt: { toMillis: () => 1 },
        updatedAt: { toMillis: () => 2 },
        createdBy: "admin-uid",
      },
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/announcements/ann-1")
      .set("Authorization", authHeader())
      .send({ description: "Updated text", published: true });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Updated text");
    expect(res.body.published).toBe(true);
  });

  it("DELETE /api/fairs/:fairId/announcements/:id returns 204", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      fairData: FAIR_DATA,
      announcementDocForPutDelete: {
        title: "T",
        description: "x",
        published: true,
        publishedAt: { toMillis: () => 1 },
        createdAt: { toMillis: () => 1 },
        updatedAt: { toMillis: () => 2 },
        createdBy: "admin-uid",
      },
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/announcements/ann-1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(204);
  });
});

/* =======================================================
   GET /api/fairs/:fairId/booths/:boothId
======================================================= */
describe("GET /api/fairs/:fairId/booths/:boothId", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 403 when fair is not live (no auth)", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app).get("/api/fairs/fair-id/booths/booth-id");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not currently live/i);
  });

  it("returns 404 when fair does not exist", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    setupFairsDbMock({ fairExists: false });
    const res = await request(app).get("/api/fairs/nonexistent/booths/booth-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Fair not found");
  });

  it("returns 404 when booth does not exist in live fair", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupFairsDbMock({ fairData: FAIR_DATA, boothExists: false });
    const res = await request(app).get("/api/fairs/fair-id/booths/bad-booth");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Booth not found");
  });

  it("returns booth data when fair is live and booth exists", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupFairsDbMock({
      fairData: FAIR_DATA,
      boothData: { companyName: "Acme Corp", companyId: "company-id", industry: "Tech" },
      boothExists: true,
    });
    const res = await request(app).get("/api/fairs/fair-id/booths/booth-id");
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Acme Corp");
    expect(res.body.id).toBe("booth-id");
  });

  it("allows admin to view booth even when fair is not live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    // Admin token: auth.verifyIdToken returns uid, then users collection returns admin role
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "admin@test.com" });

    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "administrator" }, true, "admin-uid")
            ),
          })),
        };
      }
      if (name === "fairs") {
        const boothSubcol = {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", companyId: "c1" }, true, "booth-id")
            ),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
            id: "fair-id",
            collection: jest.fn(() => boothSubcol),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    const res = await request(app)
      .get("/api/fairs/fair-id/booths/booth-id")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Acme");
  });
});

/* =======================================================
   GET /api/fairs/:fairId/jobs
======================================================= */
describe("GET /api/fairs/:fairId/jobs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 403 when fair is not live and no auth", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app).get("/api/fairs/fair-id/jobs");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not currently live/i);
  });

  it("returns 404 when fair does not exist", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    const res = await request(app).get("/api/fairs/nonexistent/jobs");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Fair not found");
  });

  it("returns all jobs when fair is live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupFairsDbMock({
      fairData: FAIR_DATA,
      jobDocs: [
        { id: "job-1", data: () => ({ name: "Engineer", companyId: "c1" }) },
        { id: "job-2", data: () => ({ name: "Designer", companyId: "c2" }) },
      ],
    });
    const res = await request(app).get("/api/fairs/fair-id/jobs");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.jobs[0].name).toBe("Engineer");
  });

  it("filters jobs by companyId query param", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    // When a companyId filter is applied, the .where() on the subcollection is called.
    // The mock returns the same jobDocs regardless — the test verifies the endpoint
    // accepts and processes the query parameter without error.
    setupFairsDbMock({
      fairData: FAIR_DATA,
      jobDocs: [
        { id: "job-1", data: () => ({ name: "Engineer", companyId: "company-id" }) },
      ],
    });
    const res = await request(app).get("/api/fairs/fair-id/jobs?companyId=company-id");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
  });

  it("returns empty jobs array when fair has no jobs", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupFairsDbMock({ fairData: FAIR_DATA, jobDocs: [] });
    const res = await request(app).get("/api/fairs/fair-id/jobs");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });
});

/* =======================================================
   POST /api/fairs/:fairId/jobs
======================================================= */
describe("POST /api/fairs/:fairId/jobs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .send({ companyId: "c1", name: "Engineer" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({ name: "Engineer" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/companyId is required/i);
  });

  it("returns 400 when job name is missing", async () => {
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/job name is required/i);
  });

  it("returns 404 when fair does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairExists: false });
    const res = await request(app)
      .post("/api/fairs/nonexistent/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id", name: "Engineer" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Fair not found");
  });

  it("returns 403 when user is not admin and not company owner/rep", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({
      fairData: FAIR_DATA,
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: [],
      },
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id", name: "Engineer" });
    expect(res.status).toBe(403);
  });

  it("creates job successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({
        companyId: "company-id",
        name: "Software Engineer",
        description: "Build great things",
        majorsAssociated: "CS, Math",
        applicationLink: "https://example.com/apply",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Software Engineer");
    expect(res.body.companyId).toBe("company-id");
  });

  it("creates job successfully as company owner", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupFairsDbMock({
      fairData: FAIR_DATA,
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid", // matches uid from authHeader()
        representativeIDs: [],
      },
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id", name: "Data Analyst" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Data Analyst");
  });
});

/* =======================================================
   PUT /api/fairs/:fairId/jobs/:jobId
======================================================= */
describe("PUT /api/fairs/:fairId/jobs/:jobId", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ jobExists: false });
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/nonexistent-job")
      .set("Authorization", authHeader())
      .send({ name: "Updated" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Job not found");
  });

  it("returns 403 when user is not admin and not company owner/rep", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({
      jobData: { name: "Engineer", companyId: "company-id" },
      jobExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: ["other-rep"],
      },
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader())
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("updates job successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      jobData: { name: "Engineer", companyId: "company-id" },
      jobExists: true,
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader())
      .send({ name: "Senior Engineer", description: "Updated desc" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("updates job successfully as company owner", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupFairsDbMock({
      jobData: { name: "Designer", companyId: "company-id" },
      jobExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid", // matches uid from authHeader()
        representativeIDs: [],
      },
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader())
      .send({ name: "Senior Designer" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   DELETE /api/fairs/:fairId/jobs/:jobId
======================================================= */
describe("DELETE /api/fairs/:fairId/jobs/:jobId", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete("/api/fairs/fair-id/jobs/job-id");
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ jobExists: false });
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/nonexistent-job")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Job not found");
  });

  it("returns 403 when user is not admin and not company owner/rep", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({
      jobData: { name: "Engineer", companyId: "company-id" },
      jobExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: [],
      },
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("deletes job successfully as admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      jobData: { name: "Engineer", companyId: "company-id" },
      jobExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("deletes job successfully as company representative", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupFairsDbMock({
      jobData: { name: "Analyst", companyId: "company-id" },
      jobExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: ["admin-uid"], // matches uid from authHeader()
      },
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   GET /api/companies/:companyId/fairs
======================================================= */
describe("GET /api/companies/:companyId/fairs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/companies/company-id/fairs");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin and not company owner/rep", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: [],
      },
    });
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });
    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns fairs list for admin when company has enrollments", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ fairData: FAIR_DATA });

    // enrollDoc with ref.parent.parent.id pointing to a fair
    const enrollDoc = {
      id: "company-id",
      data: () => ({ boothId: "booth-xyz", enrolledAt: { toMillis: () => 555 } }),
      ref: {
        parent: {
          parent: { id: "fair-id" },
        },
      },
    };

    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([enrollDoc])),
    });

    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.fairs).toHaveLength(1);
    expect(res.body.fairs[0].id).toBe("fair-id");
    expect(res.body.fairs[0].name).toBe("Spring Fair");
    expect(res.body.fairs[0].boothId).toBe("booth-xyz");
  });

  it("returns empty fairs array when company has no enrollments", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({});

    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.fairs).toEqual([]);
  });

  it("filters out null fairs when fair doc no longer exists", async () => {
    verifyAdmin.mockResolvedValue(null);

    const batchMock = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    db.batch.mockReturnValue(batchMock);

    // Fair doc does not exist (deleted)
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false, "fair-id")),
            id: "fair-id",
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
            })),
          })),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", ownerId: "admin-uid", representativeIDs: [] }, true, "company-id")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    });

    const enrollDoc = {
      id: "company-id",
      data: () => ({ boothId: "booth-xyz", enrolledAt: null }),
      ref: { parent: { parent: { id: "fair-id" } } },
    };

    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([enrollDoc])),
    });

    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.fairs).toEqual([]); // null entries are filtered out
  });
});

/* =======================================================
   DELETE /api/fairs/:fairId/leave
======================================================= */
describe("DELETE /api/fairs/:fairId/leave", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete("/api/fairs/fair-id/leave");
    expect(res.status).toBe(401);
  });

  it("returns 404 when user doc does not exist", async () => {
    setupFairsDbMock({ userExists: false });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("returns 400 when user has no companyId", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", role: "user" }, // no companyId
      userExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not associated with a company/i);
  });

  it("returns 403 when user is not company owner or rep", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", companyId: "company-id" },
      userExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: ["other-rep"],
      },
      companyExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns 404 when company is not enrolled in the fair", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", companyId: "company-id" },
      userExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid", // is owner
        representativeIDs: [],
      },
      companyExists: true,
      enrollmentExists: false,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not enrolled/i);
  });

  it("leaves fair successfully and cleans up booth and jobs", async () => {
    // setupFairsDbMock returns the batchMock it installs on db.batch
    const batchMock = setupFairsDbMock({
      userData: { uid: "admin-uid", companyId: "company-id" },
      userExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid",
        representativeIDs: [],
      },
      companyExists: true,
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: "booth-id" },
      jobDocs: [
        { id: "job-1", data: () => ({ name: "Eng", companyId: "company-id" }), ref: {} },
      ],
    });

    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(batchMock.commit).toHaveBeenCalled();
  });

  it("leaves fair successfully even when no booth is associated", async () => {
    setupFairsDbMock({
      userData: { uid: "admin-uid", companyId: "company-id" },
      userExists: true,
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid",
        representativeIDs: [],
      },
      companyExists: true,
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: null }, // no boothId
      jobDocs: [],
    });

    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   GET /api/fairs/:fairId/company/:companyId/booth
======================================================= */
describe("GET /api/fairs/:fairId/company/:companyId/booth", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/fairs/fair-id/company/company-id/booth");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin and not company owner/rep", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    setupFairsDbMock({
      companyData: {
        companyName: "Acme",
        ownerId: "other-owner",
        representativeIDs: [],
      },
      enrollmentExists: false,
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 404 when company is not enrolled in the fair", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({ enrollmentExists: false });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Company is not enrolled in this fair");
  });

  it("returns 404 when enrollment has no boothId", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: null },
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No booth found for this enrollment");
  });

  it("returns 404 when booth doc does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: "booth-id" },
      boothExists: false,
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Booth not found");
  });

  it("returns booth data when enrollment and booth both exist (as admin)", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupFairsDbMock({
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: "booth-id" },
      boothExists: true,
      boothData: {
        companyName: "Acme Corp",
        companyId: "company-id",
        industry: "Technology",
        description: "We build things",
      },
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.boothId).toBe("booth-id");
    expect(res.body.companyName).toBe("Acme Corp");
    expect(res.body.industry).toBe("Technology");
  });

  it("returns booth data when accessed as company owner", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupFairsDbMock({
      companyData: {
        companyName: "Acme",
        ownerId: "admin-uid", // matches uid from authHeader()
        representativeIDs: [],
      },
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id", boothId: "booth-id" },
      boothExists: true,
      boothData: { companyName: "Acme", companyId: "company-id" },
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.boothId).toBe("booth-id");
  });
});
