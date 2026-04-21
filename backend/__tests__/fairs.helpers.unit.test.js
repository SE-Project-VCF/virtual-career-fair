/**
 * Unit tests for fairs.js helpers exposed as router.testHelpers in NODE_ENV=test.
 */
jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
  auth: {},
}));

const fairsRouter = require("../routes/fairs");

describe("fairScheduleFromFairData", () => {
  const { fairScheduleFromFairData } = fairsRouter.testHelpers;

  it("returns {} when fairData is null or undefined", () => {
    expect(fairScheduleFromFairData(null)).toEqual({});
    expect(fairScheduleFromFairData(undefined)).toEqual({});
  });

  it("returns null millis when start/end timestamps are missing", () => {
    expect(fairScheduleFromFairData({})).toEqual({
      fairStartTime: null,
      fairEndTime: null,
    });
  });

  it("maps startTime and endTime via toMillis when present", () => {
    expect(
      fairScheduleFromFairData({
        startTime: { toMillis: () => 111 },
        endTime: { toMillis: () => 222 },
      }),
    ).toEqual({ fairStartTime: 111, fairEndTime: 222 });
  });
});

describe("serializeAnnouncementDoc", () => {
  const { serializeAnnouncementDoc } = fairsRouter.testHelpers;

  it("treats non-object fairSchedule like {}", () => {
    const doc = {
      id: "ann-1",
      data: () => ({
        title: null,
        description: undefined,
        published: 0,
        createdBy: undefined,
      }),
    };
    const out = serializeAnnouncementDoc(doc, "fair-x", null, "not-an-object");
    expect(out.fairStartTime).toBeNull();
    expect(out.fairEndTime).toBeNull();
    expect(out.title).toBe("");
    expect(out.description).toBe("");
    expect(out.published).toBe(false);
    expect(out.createdBy).toBeNull();
  });

  it("merges fairSchedule object and normalizes announcement fields", () => {
    const doc = {
      id: "ann-2",
      data: () => ({
        title: "  Hello  ",
        description: "  World  ",
        published: true,
        publishedAt: { toMillis: () => 10 },
        createdAt: { toMillis: () => 20 },
        updatedAt: { toMillis: () => 30 },
        createdBy: "uid-1",
      }),
    };
    const out = serializeAnnouncementDoc(doc, "fair-y", "Fair Y", {
      fairStartTime: 1,
      fairEndTime: 2,
    });
    expect(out.id).toBe("ann-2");
    expect(out.fairId).toBe("fair-y");
    expect(out.fairName).toBe("Fair Y");
    expect(out.title).toBe("Hello");
    expect(out.description).toBe("World");
    expect(out.published).toBe(true);
    expect(out.publishedAt).toBe(10);
    expect(out.createdAt).toBe(20);
    expect(out.updatedAt).toBe(30);
    expect(out.createdBy).toBe("uid-1");
    expect(out.fairStartTime).toBe(1);
    expect(out.fairEndTime).toBe(2);
  });
});
