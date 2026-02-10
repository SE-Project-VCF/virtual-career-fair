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
