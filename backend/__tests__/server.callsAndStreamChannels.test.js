/**
 * Coverage for server.js routes that were previously untested or thinly covered:
 * - Stream Chat channel membership (add-member, ensure-member)
 * - 1v1 call scheduling and lifecycle (/api/calls/*)
 */
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1_000_000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
    fromDate: jest.fn((d) => ({ toMillis: () => d.getTime() })),
  };
  const FieldValue = {
    serverTimestamp: jest.fn(() => "server-ts"),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
    storage: jest.fn(() => ({
      bucket: jest.fn(() => ({ file: jest.fn() })),
    })),
  };
});

/** Single Stream Chat server instance (must match what server.js captured at load time). */
var mockStreamChatServerSingleton;
var mockChannelInstance;

jest.mock("stream-chat", () => {
  mockChannelInstance = {
    addMembers: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  };
  mockStreamChatServerSingleton = {
    upsertUser: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockReturnValue("tok"),
    queryChannels: jest.fn().mockResolvedValue([]),
    channel: jest.fn(() => mockChannelInstance),
  };
  return {
    StreamChat: {
      getInstance: jest.fn(() => mockStreamChatServerSingleton),
    },
  };
});

jest.mock("../firebase", () => ({
  db: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
  },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

function authHeader(uid = "emp-1") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

describe("POST /api/stream-channel/:channelId/add-member", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelInstance.addMembers.mockResolvedValue(undefined);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/stream-channel/ch1/add-member");
    expect(res.status).toBe(401);
  });

  it("adds authenticated user to channel", async () => {
    const res = await request(app)
      .post("/api/stream-channel/ch99/add-member")
      .set("Authorization", authHeader("user-xyz"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockChannelInstance.addMembers).toHaveBeenCalledWith(["user-xyz"]);
  });

  it("returns 500 when addMembers fails", async () => {
    mockChannelInstance.addMembers.mockRejectedValueOnce(new Error("stream unavailable"));

    const res = await request(app)
      .post("/api/stream-channel/ch99/add-member")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to add user/i);
  });
});

describe("POST /api/stream-channel/:channelId/ensure-member", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelInstance.addMembers.mockResolvedValue(undefined);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/stream-channel/ch1/ensure-member").send({});
    expect(res.status).toBe(401);
  });

  it("upserts user and adds member", async () => {
    const res = await request(app)
      .post("/api/stream-channel/ch77/ensure-member")
      .set("Authorization", authHeader("u1"))
      .send({ userName: "Display Name" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStreamChatServerSingleton.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", name: "Display Name" })
    );
    expect(mockChannelInstance.addMembers).toHaveBeenCalledWith(["u1"]);
  });

  it("treats already a member as success", async () => {
    mockChannelInstance.addMembers.mockRejectedValueOnce(new Error("User already a member of this channel"));

    const res = await request(app)
      .post("/api/stream-channel/ch77/ensure-member")
      .set("Authorization", authHeader("u1"))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when addMembers fails with other error", async () => {
    mockChannelInstance.addMembers.mockRejectedValueOnce(new Error("rate limited"));

    const res = await request(app)
      .post("/api/stream-channel/ch77/ensure-member")
      .set("Authorization", authHeader("u1"))
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to ensure user/i);
  });
});

describe("POST /api/calls/schedule-1v1", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const newCallRef = {
      id: "call-doc-1",
      set: jest.fn().mockResolvedValue(undefined),
    };
    const inviteRef = {
      id: "invite-doc-1",
      set: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(
              id === "stu-1"
                ? mockDocSnap({ firstName: "Sam", email: "s@test.com", name: "Sam Student" }, true, "stu-1")
                : mockDocSnap({ firstName: "Eve", email: "e@test.com", companyName: "Acme", name: "Eve Emp" }, true, "emp-1")
            ),
          })),
        };
      }
      if (name === "employers") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => newCallRef),
            })),
          })),
        };
      }
      if (name === "students") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => inviteRef),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn() })) };
    });
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/calls/schedule-1v1").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when studentId or proposedTimes missing", async () => {
    const res = await request(app)
      .post("/api/calls/schedule-1v1")
      .set("Authorization", authHeader("emp-1"))
      .send({ studentId: "stu-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 404 when student does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/calls/schedule-1v1")
      .set("Authorization", authHeader("emp-1"))
      .send({
        studentId: "missing",
        proposedTimes: [{ startTime: "2026-06-01T12:00:00.000Z", endTime: "2026-06-01T13:00:00.000Z" }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/student not found/i);
  });

  it("schedules call and creates records", async () => {
    const res = await request(app)
      .post("/api/calls/schedule-1v1")
      .set("Authorization", authHeader("emp-1"))
      .send({
        studentId: "stu-1",
        proposedTimes: [
          { startTime: "2026-06-01T12:00:00.000Z", endTime: "2026-06-01T13:00:00.000Z" },
        ],
        notes: "Coffee chat",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.callId).toBe("call-doc-1");
    expect(mockChannelInstance.create).toHaveBeenCalled();
  });

  it("returns 500 when Firestore set fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(
              id === "stu-1"
                ? mockDocSnap({ firstName: "Sam", email: "s@test.com" }, true)
                : mockDocSnap({ firstName: "Eve", email: "e@test.com" }, true)
            ),
          })),
        };
      }
      if (name === "employers") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                id: "c1",
                set: jest.fn().mockRejectedValue(new Error("firestore write failed")),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/calls/schedule-1v1")
      .set("Authorization", authHeader("emp-1"))
      .send({
        studentId: "stu-1",
        proposedTimes: [{ startTime: "2026-06-01T12:00:00.000Z", endTime: "2026-06-01T13:00:00.000Z" }],
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to schedule call/i);
  });
});

describe("GET /api/calls/my-scheduled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.collection.mockImplementation((name) => {
      if (name === "employers") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  docs: [
                    {
                      id: "c1",
                      data: () => ({
                        proposedTimes: [
                          {
                            startTime: { toMillis: () => 100 },
                            endTime: { toMillis: () => 200 },
                            status: "proposed",
                          },
                        ],
                        createdAt: { toMillis: () => 300 },
                        updatedAt: { toMillis: () => 400 },
                      }),
                    },
                  ],
                }),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });
  });

  it("returns scheduled calls for employer", async () => {
    const res = await request(app)
      .get("/api/calls/my-scheduled")
      .set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.calls).toHaveLength(1);
    expect(res.body.calls[0].callId).toBe("c1");
  });

  it("returns 500 when query fails", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("index missing")),
          })),
        })),
      })),
    }));

    const res = await request(app)
      .get("/api/calls/my-scheduled")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

describe("GET /api/calls/my-invitations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.collection.mockImplementation((name) => {
      if (name === "students") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  docs: [
                    {
                      id: "inv1",
                      data: () => ({
                        proposedTimes: [
                          {
                            startTime: { toMillis: () => 10 },
                            endTime: { toMillis: () => 20 },
                            status: "proposed",
                          },
                        ],
                        createdAt: { toMillis: () => 30 },
                        respondedAt: null,
                      }),
                    },
                  ],
                }),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });
  });

  it("returns invitations for student", async () => {
    const res = await request(app)
      .get("/api/calls/my-invitations")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invitations).toHaveLength(1);
  });

  it("returns 500 on failure", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("db error")),
          })),
        })),
      })),
    }));

    const res = await request(app)
      .get("/api/calls/my-invitations")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/calls/:callId/respond", () => {
  const callDocMock = {
    data: () => ({
      proposedTimes: [{ startTime: { seconds: 100 } }],
    }),
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.collection.mockImplementation((name) => {
      if (name === "employers") {
        return {
          collectionGroup: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue(mockQuerySnap([callDocMock])),
          })),
        };
      }
      if (name === "students") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                update: jest.fn().mockResolvedValue(undefined),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });
  });

  it("returns 400 for invalid response", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({ response: "maybe" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when accepted without time index", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({ response: "accepted" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/time index required/i);
  });

  it("returns 404 when call document not found", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "employers") {
        return {
          collectionGroup: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .patch("/api/calls/unknown/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({ response: "declined" });

    expect(res.status).toBe(404);
  });

  it("accepts invitation and updates employer call", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({
        response: "accepted",
        acceptedTimeIndex: 0,
        inviteId: "inv-99",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(callDocMock.ref.update).toHaveBeenCalled();
  });

  it("declines without inviteId still updates employer record", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({ response: "declined" });

    expect(res.status).toBe(200);
    expect(callDocMock.ref.update).toHaveBeenCalled();
  });

  it("returns 500 when employer call update fails", async () => {
    callDocMock.ref.update.mockRejectedValueOnce(new Error("permission denied"));

    const res = await request(app)
      .patch("/api/calls/call-1/respond")
      .set("Authorization", authHeader("stu-1"))
      .send({ response: "declined" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to respond/i);
  });
});

describe("GET /api/calls/:callId/join", () => {
  const callPayload = {
    callId: "call-1",
    employerId: "emp-1",
    studentId: "stu-1",
    jitsiRoom: "room-1",
    streamChatChannelId: "ch-1",
    studentName: "Sam",
    employerName: "Eve",
    status: "accepted",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when no scheduled call matches", async () => {
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .get("/api/calls/unknown/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not part of call", async () => {
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(
        mockQuerySnap([
          {
            data: () => callPayload,
          },
        ])
      ),
    });

    const res = await request(app)
      .get("/api/calls/call-1/join")
      .set("Authorization", authHeader("stranger"));

    expect(res.status).toBe(403);
  });

  it("returns join payload for participant", async () => {
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(
        mockQuerySnap([
          {
            data: () => callPayload,
          },
        ])
      ),
    });

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ firstName: "Sam", name: "Sam S" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/calls/call-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jitsiRoom).toBe("room-1");
    expect(res.body.callData.studentName).toBe("Sam");
  });

  it("returns 500 when Firestore throws", async () => {
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(new Error("network")),
    });

    const res = await request(app)
      .get("/api/calls/call-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/calls/:callId/cancel", () => {
  const callDoc = {
    data: () => ({
      employerId: "emp-1",
      studentId: "stu-1",
    }),
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([callDoc])),
    });
  });

  it("returns 404 when call missing", async () => {
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .patch("/api/calls/nope/cancel")
      .set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(404);
  });

  it("returns 403 for unrelated user", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/cancel")
      .set("Authorization", authHeader("other"));

    expect(res.status).toBe(403);
  });

  it("cancels for employer", async () => {
    const res = await request(app)
      .patch("/api/calls/call-1/cancel")
      .set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(callDoc.ref.update).toHaveBeenCalled();
  });

  it("returns 500 on update error", async () => {
    callDoc.ref.update.mockRejectedValueOnce(new Error("denied"));
    const res = await request(app)
      .patch("/api/calls/call-1/cancel")
      .set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(500);
  });
});

describe("GET /api/test-rating-route", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/test-rating-route");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
