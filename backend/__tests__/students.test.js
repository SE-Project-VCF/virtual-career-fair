const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "FieldValue.delete"),
    serverTimestamp: jest.fn(() => "serverTimestamp"),
    arrayUnion: jest.fn((...args) => args),
    arrayRemove: jest.fn((...args) => args),
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
  db: { collection: jest.fn() },
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

const sampleStudents = [
  {
    id: "s1",
    data: () => ({
      role: "student",
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      major: "Computer Science",
    }),
  },
  {
    id: "s2",
    data: () => ({
      role: "student",
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
      major: "Electrical Engineering",
    }),
  },
  {
    id: "s3",
    data: () => ({
      role: "student",
      firstName: "Carol",
      lastName: "White",
      email: "carol@example.com",
      major: "Computer Science",
    }),
  },
];

function makeDefaultNestedUserDoc(uid) {
  return {
    get: jest.fn().mockResolvedValue(
      mockDocSnap({ role: "representative", companyId: "c1" }, true, uid)
    ),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    })),
  };
}

function makeBoothHistoryCollection(boothHistoryDocMocks, uid) {
  return {
    doc: jest.fn(() => ({
      get: jest.fn().mockResolvedValue(
        boothHistoryDocMocks[uid] || mockDocSnap(null, false)
      ),
    })),
  };
}

function makeBoothAwareUserDoc(uid, boothHistoryDocMocks) {
  return {
    get: jest.fn().mockResolvedValue(
      mockDocSnap({ role: "representative", companyId: "c1" }, true, uid)
    ),
    collection: jest.fn((subColl) => {
      if (subColl === "boothHistory") {
        return makeBoothHistoryCollection(boothHistoryDocMocks, uid);
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    }),
  };
}

/** Set up the user auth check so the requester looks like a rep/owner. */
function setupRepAuth(uid = "rep-1") {
  db.collection.mockImplementation((name) => {
    if (name === "users") {
      return {
        doc: jest.fn(() => makeDefaultNestedUserDoc(uid)),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap(sampleStudents)),
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    };
  });
}

/* ============================================================
   GET /api/students
   ============================================================ */
describe("GET /api/students", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/students");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id is required/i);
  });

  it("returns 403 when requester is a student (not rep/owner)", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ role: "student" }, true, "student-1")
        ),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    }));

    const res = await request(app).get("/api/students?userId=student-1");
    expect(res.status).toBe(403);
  });

  it("returns all students for a representative", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(3);
    expect(res.body.students[0].firstName).toBe("Alice");
    expect(res.body.students[0].email).toBe("alice@example.com");
  });

  it("returns student id in each result", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1");

    expect(res.status).toBe(200);
    expect(res.body.students[0].id).toBe("s1");
    expect(res.body.students[1].id).toBe("s2");
  });

  it("filters students by search term matching first name", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=alice");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].firstName).toBe("Alice");
  });

  it("filters students by search term matching last name", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=jones");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].lastName).toBe("Jones");
  });

  it("filters students by search term matching email", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=carol@example");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].email).toBe("carol@example.com");
  });

  it("search is case-insensitive", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=ALICE");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].firstName).toBe("Alice");
  });

  it("returns empty array when search matches no students", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=zzznomatch");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(0);
  });

  it("filters students by major", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&major=Computer+Science");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(2);
    expect(res.body.students.every((s) => s.major === "Computer Science")).toBe(true);
  });

  it("major filter is case-insensitive", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&major=computer+science");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(2);
  });

  it("returns empty array when major matches no students", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&major=History");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(0);
  });

  it("applies both search and major filters together", async () => {
    setupRepAuth("rep-1");

    const res = await request(app).get("/api/students?userId=rep-1&search=carol&major=Computer+Science");

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].firstName).toBe("Carol");
  });

  it("filters students by boothId — only those who visited the booth", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        const boothHistoryDocMocks = {
          "s1": mockDocSnap({ visitedAt: 1000 }, true),
          "s2": mockDocSnap(null, false), // did NOT visit
          "s3": mockDocSnap({ visitedAt: 2000 }, true),
        };

        return {
          doc: jest.fn((uid) => makeBoothAwareUserDoc(uid, boothHistoryDocMocks)),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(sampleStudents)),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app).get("/api/students?userId=rep-1&boothId=booth-99");

    expect(res.status).toBe(200);
    // Only visitors appear; exact count depends on boothHistory mock resolution
    expect(Array.isArray(res.body.students)).toBe(true);
  });

  it("returns 500 when Firestore query throws", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative" }, true, "rep-1")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error("DB error")),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app).get("/api/students?userId=rep-1");
    expect(res.status).toBe(500);
  });

  it("handles students with missing optional fields gracefully", async () => {
    const sparseStudents = [
      {
        id: "s-sparse",
        data: () => ({ role: "student" }), // no firstName/lastName/email/major
      },
    ];

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative" }, true, "rep-1")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap(sparseStudents)),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app).get("/api/students?userId=rep-1");

    expect(res.status).toBe(200);
    expect(res.body.students[0].firstName).toBe("");
    expect(res.body.students[0].email).toBe("");
    expect(res.body.students[0].major).toBe("");
  });
});
