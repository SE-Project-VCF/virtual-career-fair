const { mockDocSnap, mockQuerySnap } = require("./testUtils");

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
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db } = require("../firebase");
const { verifyAdmin } = require("../helpers");

describe("GET /api/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error when userId is missing (verifyAdmin returns 400)", async () => {
    verifyAdmin.mockResolvedValue({ error: "Missing userId", status: 400 });

    const res = await request(app).get("/api/fair-schedules");
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });

    const res = await request(app).get("/api/fair-schedules?userId=user1");
    expect(res.status).toBe(403);
  });

  it("returns schedules on success", async () => {
    verifyAdmin.mockResolvedValue(null);

    const schedules = [
      {
        id: "s1",
        data: () => ({
          name: "Fair 1",
          startTime: { toMillis: () => 1000 },
          endTime: { toMillis: () => 2000 },
          description: "First fair",
          createdAt: { toMillis: () => 500 },
          updatedAt: { toMillis: () => 600 },
          createdBy: "admin1",
          updatedBy: "admin1",
        }),
      },
    ];

    db.collection.mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockQuerySnap(schedules)),
      }),
    });

    const res = await request(app).get("/api/fair-schedules?userId=admin1");
    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0].name).toBe("Fair 1");
    expect(res.body.schedules[0].startTime).toBe(1000);
  });
});

describe("GET /api/public/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns schedules sorted by startTime", async () => {
    const schedules = [
      {
        id: "s2",
        data: () => ({
          name: "Later Fair",
          startTime: { toMillis: () => 3000 },
          endTime: { toMillis: () => 4000 },
          description: null,
        }),
      },
      {
        id: "s1",
        data: () => ({
          name: "Earlier Fair",
          startTime: { toMillis: () => 1000 },
          endTime: { toMillis: () => 2000 },
          description: "First",
        }),
      },
    ];

    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap(schedules)),
    });

    const res = await request(app).get("/api/public/fair-schedules");
    expect(res.status).toBe(200);
    expect(res.body.schedules[0].name).toBe("Earlier Fair");
    expect(res.body.schedules[1].name).toBe("Later Fair");
  });

  it("returns empty array when no schedules", async () => {
    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app).get("/api/public/fair-schedules");
    expect(res.status).toBe(200);
    expect(res.body.schedules).toEqual([]);
  });
});

describe("POST /api/fair-schedules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns error when not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({ userId: "user1", startTime: "2024-06-15T10:00", endTime: "2024-06-15T18:00" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when startTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({ userId: "admin1", endTime: "2024-06-15T18:00" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when endTime is missing", async () => {
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({ userId: "admin1", startTime: "2024-06-15T10:00" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when endTime is before startTime", async () => {
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({
        userId: "admin1",
        startTime: "2024-06-15T18:00",
        endTime: "2024-06-15T10:00",
      });
    expect(res.status).toBe(400);
  });

  it("returns 500 when database add fails", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      add: jest.fn().mockRejectedValueOnce(new Error("DB error")),
    });

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({
        userId: "admin1",
        name: "Spring Fair",
        startTime: "2024-06-15T10:00",
        endTime: "2024-06-15T18:00",
        description: "Annual spring fair",
      });
    expect(res.status).toBe(500);
  });

  it("creates schedule successfully", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "new-sched-id" }),
    });

    const res = await request(app)
      .post("/api/fair-schedules")
      .send({
        userId: "admin1",
        name: "Spring Fair",
        startTime: "2024-06-15T10:00",
        endTime: "2024-06-15T18:00",
        description: "Annual spring fair",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schedule.name).toBe("Spring Fair");
  });
});

describe("PUT /api/fair-schedules/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .put("/api/fair-schedules/s1")
      .send({ userId: "user1", name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
    });

    const res = await request(app)
      .put("/api/fair-schedules/s1")
      .send({ userId: "admin1", name: "Updated" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when end time is before start time", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            startTime: { toMillis: () => 2000 },
            endTime: { toMillis: () => 3000 },
          }),
        }),
      })),
    });

    const res = await request(app)
      .put("/api/fair-schedules/s1")
      .send({
        userId: "admin1",
        startTime: "2024-06-15T18:00",
        endTime: "2024-06-15T10:00",
      });
    expect(res.status).toBe(400);
  });

  it("returns 500 when database update fails", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            startTime: { toMillis: () => 1000 },
            endTime: { toMillis: () => 2000 },
          }),
        }),
        update: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .put("/api/fair-schedules/s1")
      .send({ userId: "admin1", name: "Updated Fair" });
    expect(res.status).toBe(500);
  });

  it("updates schedule successfully", async () => {
    verifyAdmin.mockResolvedValue(null);

    const updatedData = {
      name: "Updated Fair",
      startTime: { toMillis: () => 1000 },
      endTime: { toMillis: () => 2000 },
      description: "Updated desc",
    };

    const docRef = {
      get: jest.fn()
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            startTime: { toMillis: () => 1000 },
            endTime: { toMillis: () => 2000 },
          }),
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "s1",
          data: () => updatedData,
        }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app)
      .put("/api/fair-schedules/s1")
      .send({ userId: "admin1", name: "Updated Fair", description: "Updated desc" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schedule.name).toBe("Updated Fair");
  });
});

describe("DELETE /api/fair-schedules/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not admin", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app).delete("/api/fair-schedules/s1?userId=user1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
    });

    const res = await request(app).delete("/api/fair-schedules/s1?userId=admin1");
    expect(res.status).toBe(404);
  });

  it("returns 500 when database delete fails", async () => {
    verifyAdmin.mockResolvedValue(null);

    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true }),
        delete: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      })),
    });

    const res = await request(app).delete("/api/fair-schedules/s1?userId=admin1");
    expect(res.status).toBe(500);
  });

  it("deletes schedule successfully", async () => {
    verifyAdmin.mockResolvedValue(null);

    const deleteMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true }),
        delete: deleteMock,
      })),
    });

    const res = await request(app).delete("/api/fair-schedules/s1?userId=admin1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
  });
});
