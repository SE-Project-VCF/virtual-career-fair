const { mockDocSnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
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

const mockChannel = {
  create: jest.fn().mockResolvedValue({}),
  addMembers: jest.fn().mockResolvedValue({}),
  query: jest.fn().mockResolvedValue({ members: [] }),
};

jest.mock("../streamServerClient", () => ({
  streamServerClient: {
    channel: jest.fn(() => mockChannel),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "student-uid", email: "s@test.com" });
});

describe("POST /api/fairs/:fairId/lounge/join", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/fairs/fair1/lounge/join");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a student", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative" })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/fair1/lounge/join")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only students/i);
  });

  it("returns 404 when fair does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/fair-missing/lounge/join")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fair not found/i);
  });

  it("returns 200 and creates channel on successful join", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true, "fair1")),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const { streamServerClient } = require("../streamServerClient");

    const res = await request(app)
      .post("/api/fairs/fair1/lounge/join")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.channelId).toBe("lounge-fair1");
    expect(streamServerClient.channel).toHaveBeenCalledWith(
      "messaging",
      "lounge-fair1",
      expect.objectContaining({ name: "Spring Fair Networking Lounge" })
    );
    expect(mockChannel.create).toHaveBeenCalled();
    expect(mockChannel.addMembers).toHaveBeenCalledWith(["student-uid"]);
  });

  it("returns 500 when Stream errors", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true, "fair1")),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    mockChannel.create.mockRejectedValueOnce(new Error("Stream error"));

    const res = await request(app)
      .post("/api/fairs/fair1/lounge/join")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to join/i);
  });
});

describe("GET /api/fairs/:fairId/lounge/attendees", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/fairs/fair1/lounge/attendees");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a student", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative" })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/fairs/fair1/lounge/attendees")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only students/i);
  });

  it("returns empty attendees when channel has no members", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    mockChannel.query.mockResolvedValueOnce({ members: [] });

    const res = await request(app)
      .get("/api/fairs/fair1/lounge/attendees")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.attendees).toEqual([]);
  });

  it("returns attendee profiles for channel members", async () => {
    const studentProfile = {
      role: "student",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@test.com",
      major: "Computer Science",
      expectedGradYear: 2025,
      skills: "React, Python",
      linkedinUrl: "https://linkedin.com/in/jane",
    };

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((uid) => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(studentProfile, true, uid)
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    mockChannel.query.mockResolvedValueOnce({
      members: [{ user_id: "student-uid" }, { user_id: "system" }],
    });

    const res = await request(app)
      .get("/api/fairs/fair1/lounge/attendees")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.attendees).toHaveLength(1);
    expect(res.body.attendees[0]).toMatchObject({
      uid: "student-uid",
      firstName: "Jane",
      lastName: "Smith",
      major: "Computer Science",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
  });

  it("filters out non-student members", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn((uid) => {
            if (uid === "rep-uid") {
              return { get: jest.fn().mockResolvedValue(mockDocSnap({ role: "representative" }, true, uid)) };
            }
            return { get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student", firstName: "A", lastName: "B", email: "a@b.com", major: "CS", skills: "" }, true, uid)) };
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    mockChannel.query.mockResolvedValueOnce({
      members: [{ user_id: "student-uid" }, { user_id: "rep-uid" }],
    });

    const res = await request(app)
      .get("/api/fairs/fair1/lounge/attendees")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.attendees).toHaveLength(1);
    expect(res.body.attendees[0].uid).toBe("student-uid");
  });

  it("returns 500 when Stream query errors", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    mockChannel.query.mockRejectedValueOnce(new Error("Stream error"));

    const res = await request(app)
      .get("/api/fairs/fair1/lounge/attendees")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to fetch/i);
  });
});
