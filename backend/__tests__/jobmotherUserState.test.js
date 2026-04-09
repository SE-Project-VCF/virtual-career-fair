"use strict";

const {
  sanitizeJobmotherTips,
  parseNeedsClarification,
  profileBasicsComplete,
  hasResumeUploaded,
} = require("../jobmotherUserState");

describe("sanitizeJobmotherTips", () => {
  it("returns empty for non-array or missing", () => {
    expect(sanitizeJobmotherTips({})).toEqual([]);
    expect(sanitizeJobmotherTips({ tips: null })).toEqual([]);
    expect(sanitizeJobmotherTips({ tips: "x" })).toEqual([]);
  });

  it("trims, caps count and length", () => {
    expect(
      sanitizeJobmotherTips({
        tips: ["  a ", "b", "", "c", "d", "e"],
      })
    ).toEqual(["a", "b", "c"]);
    const long = "x".repeat(300);
    expect(sanitizeJobmotherTips({ tips: [long] })).toEqual(["x".repeat(240)]);
  });
});

describe("parseNeedsClarification", () => {
  it("is true only when strictly true", () => {
    expect(parseNeedsClarification({ needsClarification: true })).toBe(true);
    expect(parseNeedsClarification({ needsClarification: "true" })).toBe(false);
    expect(parseNeedsClarification({})).toBe(false);
  });
});

describe("profileBasicsComplete", () => {
  it("detects first+last or displayName", () => {
    expect(profileBasicsComplete({ firstName: "A", lastName: "B" })).toBe(true);
    expect(profileBasicsComplete({ displayName: "AB" })).toBe(true);
    expect(profileBasicsComplete({ firstName: "A" })).toBe(false);
  });
});

describe("hasResumeUploaded", () => {
  it("checks paths", () => {
    expect(hasResumeUploaded({ currentResumePath: "p" })).toBe(true);
    expect(hasResumeUploaded({ resumePath: "x" })).toBe(true);
    expect(hasResumeUploaded({})).toBe(false);
  });
});
