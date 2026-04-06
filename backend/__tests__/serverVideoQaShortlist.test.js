const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    serverTimestamp: jest.fn(() => "server-timestamp"),
    arrayUnion: jest.fn((...values) => ({ _type: "arrayUnion", values })),
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
      channel: jest.fn(() => ({
        addMembers: jest.fn().mockResolvedValue({}),
      })),
    })),
  },
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
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

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "employer-1", email: "e@test.com" });
  return "Bearer valid-token";
}

describe("server.js video / Q&A / shortlist endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/shortlist/list", () => {
    it("returns shortlist entries", async () => {
      const docSnap = mockDocSnap(
        {
          studentName: "Sam",
          studentEmail: "sam@test.com",
          notes: "n",
          addedAt: { toMillis: () => 5000 },
        },
        true,
        "stu-1"
      );

      db.collection.mockImplementation((name) => {
        if (name === "employers") {
          return {
            doc: jest.fn(() => ({
              collection: jest.fn(() => ({
                orderBy: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockQuerySnap([docSnap])),
                })),
              })),
            })),
          };
        }
        return { doc: jest.fn(), get: jest.fn() };
      });

      const res = await request(app).get("/api/shortlist/list").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.shortlist).toHaveLength(1);
      expect(res.body.shortlist[0].studentId).toBe("stu-1");
    });
  });

  describe("POST /api/shortlist/add", () => {
    it("returns 400 when studentId missing", async () => {
      const res = await request(app)
        .post("/api/shortlist/add")
        .set("Authorization", authHeader())
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing studentid/i);
    });

    it("returns 404 when student not found", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app)
        .post("/api/shortlist/add")
        .set("Authorization", authHeader())
        .send({ studentId: "missing" });

      expect(res.status).toBe(404);
    });

    it("adds student when valid", async () => {
      const setMock = jest.fn().mockResolvedValue(undefined);
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ email: "sam@test.com", name: "Sam Student" }, true, "stu-1")
              ),
            })),
          };
        }
        if (name === "employers") {
          return {
            doc: jest.fn(() => ({
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({ set: setMock })),
              })),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app)
        .post("/api/shortlist/add")
        .set("Authorization", authHeader())
        .send({ studentId: "stu-1", notes: "hi" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(setMock).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/shortlist/:studentId", () => {
    it("removes candidate", async () => {
      const del = jest.fn().mockResolvedValue(undefined);
      db.collection.mockImplementation((name) => {
        if (name === "employers") {
          return {
            doc: jest.fn(() => ({
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({ delete: del })),
              })),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).delete("/api/shortlist/stu-9").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(del).toHaveBeenCalled();
    });
  });

  describe("GET /api/sessions/active/:fairId", () => {
    it("returns sessions array", async () => {
      const sessionDoc = mockDocSnap(
        {
          fairId: "fair-1",
          isLive: true,
          scheduledTime: { toMillis: () => 9000 },
          jitsiRoom: "j",
          streamChatChannelId: "c",
        },
        true,
        "sess-1"
      );

      db.collection.mockImplementation((name) => {
        if (name === "video_sessions") {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue(mockQuerySnap([sessionDoc])),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).get("/api/sessions/active/fair-1").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].sessionId).toBe("sess-1");
    });
  });

  describe("POST /api/sessions/:sessionId/join", () => {
    it("returns 404 when session missing", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "video_sessions") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).post("/api/sessions/nope/join").set("Authorization", authHeader());

      expect(res.status).toBe(404);
    });

    it("joins existing session", async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      const sessionRef = {
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            {
              employerId: "employer-1",
              jitsiRoom: "room",
              streamChatChannelId: "ch",
              isPresentationMode: false,
            },
            true,
            "sess-99"
          )
        ),
        update,
      };
      db.collection.mockImplementation((name) => {
        if (name === "video_sessions") {
          return {
            doc: jest.fn(() => sessionRef),
          };
        }
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Joiner" }, true)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).post("/api/sessions/sess-99/join").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jitsiRoom).toBe("room");
      expect(update).toHaveBeenCalled();
    });
  });

  describe("GET /api/employer/booths", () => {
    it("returns empty booths when user has no company", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: null }, true)),
            })),
          };
        }
        return { doc: jest.fn(), get: jest.fn() };
      });

      const res = await request(app).get("/api/employer/booths").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.booths).toEqual([]);
    });

    it("returns 404 when user doc missing", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).get("/api/employer/booths").set("Authorization", authHeader());

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/employer/qa-sessions", () => {
    it("returns empty sessions when company missing", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "users") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, true)),
            })),
          };
        }
        return { doc: jest.fn() };
      });

      const res = await request(app).get("/api/employer/qa-sessions").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });
  });
});
