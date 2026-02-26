jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => Date.now() })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("../firebase", () => ({
  db: {
    collection: jest.fn(),
  },
  auth: {},
}));

const { removeUndefined, generateInviteCode, parseUTCToTimestamp, verifyAdmin } = require("../helpers");
const { db } = require("../firebase");

describe("removeUndefined", () => {
  it("removes keys with undefined values", () => {
    expect(removeUndefined({ a: 1, b: undefined, c: 3 })).toEqual({ a: 1, c: 3 });
  });

  it("keeps null, false, 0, and empty string values", () => {
    const input = { a: null, b: false, c: 0, d: "" };
    expect(removeUndefined(input)).toEqual(input);
  });

  it("returns empty object for all-undefined input", () => {
    expect(removeUndefined({ a: undefined, b: undefined })).toEqual({});
  });

  it("returns same shape when no undefined values exist", () => {
    const input = { x: 1, y: "hello" };
    expect(removeUndefined(input)).toEqual(input);
  });

  it("handles empty object", () => {
    expect(removeUndefined({})).toEqual({});
  });
});

describe("generateInviteCode", () => {
  it("returns a string of length 8", () => {
    const code = generateInviteCode();
    expect(typeof code).toBe("string");
    expect(code).toHaveLength(8);
  });

  it("returns only uppercase hex characters", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-F0-9]{8}$/);
  });

  it("returns different values on successive calls", () => {
    const codes = new Set(Array.from({ length: 10 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("parseUTCToTimestamp", () => {
  it("throws when dateTimeString is null", () => {
    expect(() => parseUTCToTimestamp(null)).toThrow("Date string is required");
  });

  it("throws when dateTimeString is undefined", () => {
    expect(() => parseUTCToTimestamp(undefined)).toThrow("Date string is required");
  });

  it("throws when dateTimeString is empty", () => {
    expect(() => parseUTCToTimestamp("")).toThrow("Date string is required");
  });

  it("parses ISO string with Z suffix", () => {
    const result = parseUTCToTimestamp("2024-06-15T14:30:00Z");
    expect(result.toMillis()).toBe(new Date("2024-06-15T14:30:00Z").getTime());
  });

  it("parses ISO string with timezone offset", () => {
    const result = parseUTCToTimestamp("2024-06-15T14:30:00+05:00");
    expect(result.toMillis()).toBe(new Date("2024-06-15T14:30:00+05:00").getTime());
  });

  it("parses ISO string without timezone as UTC", () => {
    const result = parseUTCToTimestamp("2024-06-15T14:30:00");
    expect(result.toMillis()).toBe(new Date("2024-06-15T14:30:00Z").getTime());
  });

  it("parses datetime-local format as UTC", () => {
    const result = parseUTCToTimestamp("2024-06-15T14:30");
    expect(result.toMillis()).toBe(new Date("2024-06-15T14:30Z").getTime());
  });

  it("throws for invalid date string", () => {
    expect(() => parseUTCToTimestamp("not-a-date")).toThrow("Invalid date string");
  });
});

describe("verifyAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns error when userId is falsy", async () => {
    const result = await verifyAdmin(null);
    expect(result).toEqual({ error: "Missing userId", status: 400 });
  });

  it("returns error when user doc does not exist", async () => {
    const mockDoc = { exists: false };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc) })),
    });

    const result = await verifyAdmin("user123");
    expect(result).toEqual({ error: "User not found", status: 404 });
  });

  it("returns error when user role is not administrator", async () => {
    const mockDoc = { exists: true, data: () => ({ role: "student" }) };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc) })),
    });

    const result = await verifyAdmin("user123");
    expect(result).toEqual({ error: "Only administrators can manage schedules", status: 403 });
  });

  it("returns null when user is administrator", async () => {
    const mockDoc = { exists: true, data: () => ({ role: "administrator" }) };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc) })),
    });

    const result = await verifyAdmin("admin-user");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Additional tests added to improve coverage
// ---------------------------------------------------------------------------

const {
  evaluateFairStatusForFair,
  validateJobInput,
  verifyFirebaseToken,
} = require("../helpers");
const admin = require("firebase-admin");
const { auth } = require("../firebase");

// Re-export auth so verifyFirebaseToken can be tested
// (the mock above sets auth to {}, so we assign verifyIdToken here per test)

describe("evaluateFairStatusForFair", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when fair document does not exist", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: false }) })),
    });

    await expect(evaluateFairStatusForFair("fair-1")).rejects.toThrow("Fair not found");
  });

  it("returns isLive true with source manual when isLive flag is true", async () => {
    const fairData = { isLive: true, name: "Spring Fair", description: "A great fair" };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => fairData }),
      })),
    });
    admin.firestore.Timestamp.now.mockReturnValue({ toMillis: () => 1000000 });

    const result = await evaluateFairStatusForFair("fair-1");

    expect(result).toEqual({
      isLive: true,
      source: "manual",
      name: "Spring Fair",
      description: "A great fair",
    });
  });

  it("returns isLive true with source schedule when within scheduled window", async () => {
    const now = 1000000;
    admin.firestore.Timestamp.now.mockReturnValue({ toMillis: () => now });

    const fairData = {
      isLive: false,
      name: "Scheduled Fair",
      description: null,
      startTime: { toMillis: () => now - 500 },
      endTime: { toMillis: () => now + 500 },
    };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => fairData }),
      })),
    });

    const result = await evaluateFairStatusForFair("fair-2");

    expect(result).toEqual({
      isLive: true,
      source: "schedule",
      name: "Scheduled Fair",
      description: null,
    });
  });

  it("returns isLive false when scheduled window has not started", async () => {
    const now = 1000000;
    admin.firestore.Timestamp.now.mockReturnValue({ toMillis: () => now });

    const fairData = {
      isLive: false,
      name: "Future Fair",
      description: undefined,
      startTime: { toMillis: () => now + 1000 },
      endTime: { toMillis: () => now + 5000 },
    };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => fairData }),
      })),
    });

    const result = await evaluateFairStatusForFair("fair-3");

    expect(result.isLive).toBe(false);
    expect(result.source).toBe("manual");
  });

  it("returns isLive false when scheduled window has ended", async () => {
    const now = 1000000;
    admin.firestore.Timestamp.now.mockReturnValue({ toMillis: () => now });

    const fairData = {
      isLive: false,
      name: "Past Fair",
      description: "Done",
      startTime: { toMillis: () => now - 5000 },
      endTime: { toMillis: () => now - 1000 },
    };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => fairData }),
      })),
    });

    const result = await evaluateFairStatusForFair("fair-4");

    expect(result.isLive).toBe(false);
    expect(result.source).toBe("manual");
    expect(result.name).toBe("Past Fair");
    expect(result.description).toBe("Done");
  });

  it("returns isLive false and null name/description when fields are missing", async () => {
    const now = 1000000;
    admin.firestore.Timestamp.now.mockReturnValue({ toMillis: () => now });

    const fairData = { isLive: false };
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => fairData }),
      })),
    });

    const result = await evaluateFairStatusForFair("fair-5");

    expect(result).toEqual({ isLive: false, source: "manual", name: null, description: null });
  });
});

describe("validateJobInput", () => {
  const validInput = {
    companyId: "company-1",
    name: "Software Engineer",
    description: "Build great things.",
    majorsAssociated: "Computer Science",
    applicationLink: "https://example.com/apply",
  };

  it("returns null for fully valid input", () => {
    expect(validateJobInput(validInput)).toBeNull();
  });

  it("returns error when companyId is missing", () => {
    expect(validateJobInput({ ...validInput, companyId: "" })).toBe("Company ID is required");
  });

  it("returns error when name is missing", () => {
    expect(validateJobInput({ ...validInput, name: "" })).toBe("Job title is required");
  });

  it("returns error when name is only whitespace", () => {
    expect(validateJobInput({ ...validInput, name: "   " })).toBe("Job title is required");
  });

  it("returns error when name exceeds 200 characters", () => {
    expect(validateJobInput({ ...validInput, name: "A".repeat(201) })).toBe(
      "Job title must be 200 characters or less"
    );
  });

  it("returns error when description is missing", () => {
    expect(validateJobInput({ ...validInput, description: "" })).toBe(
      "Job description is required"
    );
  });

  it("returns error when description is only whitespace", () => {
    expect(validateJobInput({ ...validInput, description: "   " })).toBe(
      "Job description is required"
    );
  });

  it("returns error when description exceeds 5000 characters", () => {
    expect(validateJobInput({ ...validInput, description: "B".repeat(5001) })).toBe(
      "Job description must be 5000 characters or less"
    );
  });

  it("returns error when majorsAssociated is missing", () => {
    expect(validateJobInput({ ...validInput, majorsAssociated: "" })).toBe("Skills are required");
  });

  it("returns error when majorsAssociated is only whitespace", () => {
    expect(validateJobInput({ ...validInput, majorsAssociated: "   " })).toBe("Skills are required");
  });

  it("returns error when majorsAssociated exceeds 500 characters", () => {
    expect(validateJobInput({ ...validInput, majorsAssociated: "C".repeat(501) })).toBe(
      "Skills must be 500 characters or less"
    );
  });

  it("returns error when applicationLink is not a valid URL", () => {
    expect(validateJobInput({ ...validInput, applicationLink: "not-a-url" })).toBe(
      "Invalid application URL format"
    );
  });

  it("returns null when applicationLink is empty string (optional)", () => {
    expect(validateJobInput({ ...validInput, applicationLink: "" })).toBeNull();
  });

  it("returns null when applicationLink is only whitespace (optional)", () => {
    expect(validateJobInput({ ...validInput, applicationLink: "   " })).toBeNull();
  });

  it("returns null when applicationLink is undefined (optional)", () => {
    const { applicationLink, ...inputWithout } = validInput;
    expect(validateJobInput(inputWithout)).toBeNull();
  });
});

describe("verifyFirebaseToken", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it("returns 401 when Authorization header is missing", async () => {
    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing or invalid Authorization header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    req.headers.authorization = "Basic sometoken";

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing or invalid Authorization header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.user and calls next when token is valid", async () => {
    req.headers.authorization = "Bearer valid-token";
    auth.verifyIdToken = jest.fn().mockResolvedValue({ uid: "user-1", email: "user@example.com" });

    await verifyFirebaseToken(req, res, next);

    expect(auth.verifyIdToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toEqual({ uid: "user-1", email: "user@example.com" });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when token verification throws", async () => {
    req.headers.authorization = "Bearer bad-token";
    auth.verifyIdToken = jest.fn().mockRejectedValue(new Error("Token expired"));

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });
});
