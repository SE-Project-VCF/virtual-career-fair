/**
 * Branch coverage for server.js: Q&A session creation, booth scheduling,
 * public booth Q&A GET, and call-invitation join edge cases.
 */
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1_700_000_000_000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
    fromDate: jest.fn((d) => ({ toMillis: () => new Date(d).getTime() })),
  };
  const FieldValue = {
    serverTimestamp: jest.fn(() => "sv-ts"),
    arrayUnion: jest.fn((...values) => ({ _arrayUnion: values })),
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

var mockStreamChannelInstance;

jest.mock("stream-chat", () => {
  mockStreamChannelInstance = {
    addMembers: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  };
  return {
    StreamChat: {
      getInstance: jest.fn(() => ({
        upsertUser: jest.fn().mockResolvedValue({}),
        createToken: jest.fn().mockReturnValue("tok"),
        queryChannels: jest.fn().mockResolvedValue([]),
        channel: jest.fn(() => mockStreamChannelInstance),
      })),
    },
  };
});

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), collectionGroup: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../resumeParser", () => ({
  extractTextFromBuffer: jest.fn(),
  toStructuredResume: jest.fn(),
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

function authHeader(uid = "emp-1") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

describe("server.js POST /api/sessions/create-qa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const sessionRef = {
      id: "new-session-id",
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ firstName: "Pat", email: "p@test.com", name: "Pat" }, true)
            ),
          })),
        };
      }
      if (name === "video_sessions") {
        return {
          doc: jest.fn(() => sessionRef),
        };
      }
      return { doc: jest.fn() };
    });
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/sessions/create-qa").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields missing", async () => {
    const res = await request(app)
      .post("/api/sessions/create-qa")
      .set("Authorization", authHeader())
      .send({ fairId: "f1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 200 and creates session when valid", async () => {
    const res = await request(app)
      .post("/api/sessions/create-qa")
      .set("Authorization", authHeader())
      .send({
        fairId: "fair-1",
        title: "AMA",
        description: "Ask me anything",
        scheduledTime: "2026-12-01T15:00:00.000Z",
        maxDuration: 45,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBe("new-session-id");
    expect(mockStreamChannelInstance.create).toHaveBeenCalled();
  });

  it("returns 500 when session set fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ firstName: "A" }, true)),
          })),
        };
      }
      if (name === "video_sessions") {
        return {
          doc: jest.fn(() => ({
            id: "x",
            set: jest.fn().mockRejectedValue(new Error("write denied")),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/sessions/create-qa")
      .set("Authorization", authHeader())
      .send({
        fairId: "f",
        title: "T",
        scheduledTime: "2026-12-01T15:00:00.000Z",
      });

    expect(res.status).toBe(500);
  });
});

describe("server.js GET /api/sessions/active/:fairId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when query fails", async () => {
    db.collection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(new Error("index")),
    }));

    const res = await request(app)
      .get("/api/sessions/active/fair-x")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to fetch sessions/i);
  });
});

describe("server.js POST /api/sessions/:sessionId/join", () => {
  beforeEach(() => jest.clearAllMocks());

  it("joins as student when employer hosts (role branch)", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "video_sessions") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                {
                  employerId: "boss-1",
                  jitsiRoom: "jr",
                  streamChatChannelId: "sc",
                },
                true,
                "sess-1"
              )
            ),
            update,
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ firstName: "Student" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/sessions/sess-1/join")
      .set("Authorization", authHeader("student-99"));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(res.body.userName).toBe("Student");
  });

  it("returns 500 when update throws", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "video_sessions") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ employerId: "e", jitsiRoom: "j", streamChatChannelId: "c" }, true)
            ),
            update: jest.fn().mockRejectedValue(new Error("fail")),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "U" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/sessions/s1/join")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

describe("server.js GET /api/employer/booths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns booths matching companyId", async () => {
    const fairDoc = mockDocSnap({ name: "Spring Fair" }, true, "fair-1");
    const boothDoc = mockDocSnap(
      { name: "Booth A", companyId: "co-1", employerId: "other" },
      true,
      "booth-1"
    );

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "co-1" }, true)),
          })),
        };
      }
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn((id) => ({
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([boothDoc])),
            })),
          })),
        };
      }
      return { doc: jest.fn(), get: jest.fn() };
    });

    const res = await request(app).get("/api/employer/booths").set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(1);
    expect(res.body.booths[0].id).toBe("booth-1");
    expect(res.body.booths[0].fairName).toBe("Spring Fair");
  });

  it("returns 500 on unexpected error", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("boom")),
      })),
    }));

    const res = await request(app).get("/api/employer/booths").set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

describe("server.js GET /api/employer/qa-sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when user missing", async () => {
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

    const res = await request(app).get("/api/employer/qa-sessions").set("Authorization", authHeader());

    expect(res.status).toBe(404);
  });

  it("aggregates qaSessions array from accessible booths", async () => {
    const futureMs = Date.now() + 60 * 60 * 1000;
    const qaSession = {
      id: "qs-1",
      title: "Live Q&A",
      description: "d",
      scheduledTime: { toMillis: () => futureMs },
      duration: 30,
      createdAt: { toMillis: () => 1 },
      status: "scheduled",
    };
    const boothDoc = mockDocSnap(
      {
        companyId: "co-1",
        employerId: "emp-1",
        qaSessions: [qaSession],
      },
      true,
      "b1"
    );
    const fairDoc = mockDocSnap({ name: "F" }, true, "fair-1");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "co-1" }, true)),
          })),
        };
      }
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([boothDoc])),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/employer/qa-sessions").set("Authorization", authHeader("emp-1"));

    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.sessions[0].title).toBe("Live Q&A");
  });

  it("returns 500 when fairs get fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
          })),
        };
      }
      if (name === "fairs") {
        return {
          get: jest.fn().mockRejectedValue(new Error("network")),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/employer/qa-sessions").set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

describe("server.js POST /api/booth/:boothId/schedule-qa-session", () => {
  const futureIso = "2030-06-15T12:00:00.000Z";

  beforeEach(() => jest.clearAllMocks());

  function mockBoothAndUser({ boothData, userData }) {
    const fairDoc = mockDocSnap({}, true, "fair-1");
    const fairBoothDoc = mockDocSnap(boothData, true, "booth-1");

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(fairBoothDoc),
              })),
            })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(userData, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });
  }

  it("returns 400 when fields missing", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/schedule-qa-session")
      .set("Authorization", authHeader())
      .send({ title: "T" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when scheduled time is not in the future", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/schedule-qa-session")
      .set("Authorization", authHeader())
      .send({
        title: "T",
        scheduledTime: "2000-01-01T00:00:00.000Z",
        duration: 30,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });

  it("returns 400 when duration out of range", async () => {
    const res = await request(app)
      .post("/api/booth/booth-1/schedule-qa-session")
      .set("Authorization", authHeader())
      .send({
        title: "T",
        scheduledTime: futureIso,
        duration: 500,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 1 and 480/i);
  });

  it("returns 404 when booth not found in any fair", async () => {
    const fairDoc = mockDocSnap({}, true, "fair-1");
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/booth/missing/schedule-qa-session")
      .set("Authorization", authHeader())
      .send({ title: "T", scheduledTime: futureIso, duration: 30 });

    expect(res.status).toBe(404);
  });

  it("returns 404 when employer user doc missing", async () => {
    const fairDoc = mockDocSnap({}, true, "fair-1");
    const boothDoc = mockDocSnap({ companyId: "co-1", employerId: "emp-1" }, true, "b1");
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(boothDoc),
              })),
            })),
          })),
        };
      }
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
      .post("/api/booth/b1/schedule-qa-session")
      .set("Authorization", authHeader())
      .send({ title: "T", scheduledTime: futureIso, duration: 30 });

    expect(res.status).toBe(404);
  });

  it("returns 403 when employer cannot manage booth", async () => {
    mockBoothAndUser({
      boothData: { companyId: "other-co", employerId: "other-emp" },
      userData: { companyId: "co-1" },
    });

    const res = await request(app)
      .post("/api/booth/booth-1/schedule-qa-session")
      .set("Authorization", authHeader("emp-1"))
      .send({ title: "T", scheduledTime: futureIso, duration: 30 });

    expect(res.status).toBe(403);
  });

  it("returns 200 when scheduling succeeds", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const fairDoc = mockDocSnap({}, true, "fair-1");
    const boothDoc = mockDocSnap({ companyId: "co-1", employerId: "emp-1" }, true, "booth-1");

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(boothDoc),
                update,
              })),
            })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "co-1" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/booth/booth-1/schedule-qa-session")
      .set("Authorization", authHeader("emp-1"))
      .send({ title: "Office hours", scheduledTime: futureIso, duration: 60 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it("returns 500 when booth update fails", async () => {
    const fairDoc = mockDocSnap({}, true, "fair-1");
    const boothDoc = mockDocSnap({ companyId: "co-1", employerId: "emp-1" }, true, "b1");

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(boothDoc),
                update: jest.fn().mockRejectedValue(new Error("denied")),
              })),
            })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "co-1" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/booth/b1/schedule-qa-session")
      .set("Authorization", authHeader("emp-1"))
      .send({ title: "T", scheduledTime: futureIso, duration: 30 });

    expect(res.status).toBe(500);
  });
});

describe("server.js GET /api/booth/:boothId/qa-session", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty when booth not in any fair", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/booth/unknown/qa-session");

    expect(res.status).toBe(200);
    expect(res.body.qaSessions).toEqual([]);
    expect(res.body.qaSession).toBeNull();
  });

  it("returns upcoming sessions from qaSessions array", async () => {
    const start = Date.now() + 30 * 60 * 1000;
    const boothDoc = mockDocSnap(
      {
        qaSessions: [
          {
            id: "s1",
            title: "Talk",
            description: "",
            scheduledTime: { toMillis: () => start },
            duration: 45,
            jitsiRoom: "j",
            streamChatChannelId: "c",
            status: "scheduled",
          },
        ],
      },
      true,
      "booth-x"
    );
    const fairDoc = mockDocSnap({}, true, "fair-1");

    const qaSessionCol = {
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(boothDoc),
              })),
            })),
          })),
        };
      }
      if (name === "qa_sessions") {
        return qaSessionCol;
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/booth/booth-x/qa-session");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.qaSessions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns legacy single qaSession object", async () => {
    const future = Date.now() + 20 * 60 * 1000;
    const boothDoc = mockDocSnap(
      {
        qaSession: {
          id: "legacy-1",
          title: "Legacy",
          description: "d",
          scheduledTime: { toMillis: () => future },
          duration: 20,
          jitsiRoom: "j1",
          streamChatChannelId: "c1",
          status: "scheduled",
        },
      },
      true,
      "booth-y"
    );
    const fairDoc = mockDocSnap({}, true, "fair-1");

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [fairDoc] }),
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(boothDoc),
              })),
            })),
          })),
        };
      }
      if (name === "qa_sessions") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            set: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/booth/booth-y/qa-session");

    expect(res.status).toBe(200);
    expect(res.body.qaSession).toBeTruthy();
    expect(res.body.qaSession.title || res.body.qaSessions[0].title).toBe("Legacy");
  });

  it("returns 500 when fairs get throws", async () => {
    db.collection.mockImplementation(() => ({
      get: jest.fn().mockRejectedValue(new Error("db")),
    }));

    const res = await request(app).get("/api/booth/b1/qa-session");

    expect(res.status).toBe(500);
  });
});

describe("server.js POST /api/call-invitations/:invitationId/join", () => {
  /** Frozen "now" so server `new Date()` matches invitation time math. */
  const T0 = 1_000_000_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: T0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockInvitationGet(data) {
    db.collection.mockImplementation((name) => {
      if (name === "call_invitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(data, !!data)),
            update: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ displayName: "Joiner", email: "j@test.com" }, true)),
          })),
        };
      }
      return { doc: jest.fn() };
    });
  }

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/call-invitations/inv-1/join");
    expect(res.status).toBe(401);
  });

  it("returns 404 when invitation missing", async () => {
    mockInvitationGet(null);

    const res = await request(app)
      .post("/api/call-invitations/missing/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is neither employer nor student", async () => {
    mockInvitationGet({
      employerId: "e1",
      studentId: "s1",
      status: "accepted",
      scheduledTime: 1_000_000_000_000 + 5 * 60 * 1000,
      duration: 30,
      jitsiRoom: "room",
      employerName: "E",
      studentName: "S",
      description: "",
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stranger"));

    expect(res.status).toBe(403);
  });

  it("returns 409 when invitation not accepted", async () => {
    mockInvitationGet({
      employerId: "e1",
      studentId: "stu-1",
      status: "pending",
      scheduledTime: 1_000_000_000_000,
      duration: 30,
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(409);
  });

  it("returns 400 when join window not open yet (>15m before start)", async () => {
    const start = T0 + 20 * 60 * 1000;
    mockInvitationGet({
      employerId: "e1",
      studentId: "stu-1",
      status: "accepted",
      scheduledTime: start,
      duration: 30,
      jitsiRoom: "r",
      employerName: "E",
      studentName: "S",
      description: "",
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not yet available/i);
  });

  it("returns 400 when call already ended", async () => {
    const start = T0 - 60 * 60 * 1000;
    mockInvitationGet({
      employerId: "e1",
      studentId: "stu-1",
      status: "accepted",
      scheduledTime: start,
      duration: 15,
      jitsiRoom: "r",
      employerName: "E",
      studentName: "S",
      description: "",
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended/i);
  });

  it("returns 200 with join details inside window", async () => {
    const start = T0 + 5 * 60 * 1000;
    mockInvitationGet({
      employerId: "e1",
      studentId: "stu-1",
      status: "accepted",
      scheduledTime: start,
      duration: 60,
      jitsiRoom: "room-z",
      employerName: "Emp",
      studentName: "Stu",
      description: "Hi",
      startedAt: null,
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jitsiRoom).toBe("room-z");
  });

  it("returns 500 when user fetch fails", async () => {
    const start = T0 + 5 * 60 * 1000;
    db.collection.mockImplementation((name) => {
      if (name === "call_invitations") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                {
                  employerId: "e1",
                  studentId: "stu-1",
                  status: "accepted",
                  scheduledTime: start,
                  duration: 60,
                  jitsiRoom: "r",
                  employerName: "E",
                  studentName: "S",
                  description: "",
                },
                true
              )
            ),
            update: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error("offline")),
          })),
        };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/call-invitations/inv-1/join")
      .set("Authorization", authHeader("stu-1"));

    expect(res.status).toBe(500);
  });
});
