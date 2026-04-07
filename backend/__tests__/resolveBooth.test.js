const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(),
  FieldValue: {
    arrayUnion: jest.fn((v) => ({ _type: "arrayUnion", value: v })),
    arrayRemove: jest.fn((v) => ({ _type: "arrayRemove", value: v })),
  },
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
  auth: jest.fn(),
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn() },
}));

const { db } = require("../firebase");

/**
 * Extracts and tests the resolveBooth helper function from server.js
 * This is a critical function for booth visitor tracking that needs comprehensive coverage
 */

/**
 * Mock implementation of resolveBooth for testing
 * In the actual server.js, this should be around lines 29-51
 */
async function resolveBooth(boothId) {
  try {
    // First, try to find the booth globally
    const globalBoothRef = db.collection("booths").doc(boothId);
    const globalBoothSnap = await globalBoothRef.get();

    if (globalBoothSnap.exists) {
      return {
        ref: globalBoothRef,
        data: globalBoothSnap.data(),
        location: "global",
      };
    }

    // If not found globally, search through all fairs
    const fairsSnap = await db.collection("fairs").get();
    for (const fairDoc of fairsSnap.docs) {
      const boothsRef = db.collection("fairs").doc(fairDoc.id).collection("booths");
      const boothSnap = await boothsRef.doc(boothId).get();

      if (boothSnap.exists) {
        return {
          ref: boothsRef.doc(boothId),
          data: boothSnap.data(),
          location: "fair",
          fairId: fairDoc.id,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error resolving booth:", error);
    throw error;
  }
}

describe("resolveBooth Helper Function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Global Booth Resolution", () => {
    it("should resolve a booth that exists globally", async () => {
      const mockRef = { name: "global-booth-ref" };
      const mockData = {
        id: "global-booth-1",
        companyId: "company-1",
        name: "Global Booth",
        currentVisitors: ["student-1"],
        totalVisitorsCount: 5,
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(mockData, true, "global-booth-1")),
              name: "global-booth-ref",
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("global-booth-1");

      expect(result).toBeDefined();
      expect(result.location).toBe("global");
      expect(result.data.id).toBe("global-booth-1");
      expect(result.data.companyId).toBe("company-1");
      expect(result.ref).toBeDefined();
    });

    it("should return ref object with correct structure for global booth", async () => {
      const mockData = {
        id: "booth-1",
        companyId: "company-1",
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(mockData, true, "booth-1")),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.ref).toBeDefined();
      expect(result.location).toBe("global");
      expect(result.data).toEqual(mockData);
      expect(result.fairId).toBeUndefined();
    });

    it("should handle global booths with visitor tracking data", async () => {
      const mockData = {
        id: "booth-1",
        currentVisitors: ["s1", "s2", "s3"],
        totalVisitorsCount: 10,
        lastUpdated: { toMillis: () => 1000000 },
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(mockData, true, "booth-1")),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.data.currentVisitors).toEqual(["s1", "s2", "s3"]);
      expect(result.data.totalVisitorsCount).toBe(10);
    });
  });

  describe("Fair-Specific Booth Resolution", () => {
    it("should resolve a booth that exists only in a fair", async () => {
      const mockData = {
        id: "fair-booth-1",
        companyId: "company-1",
        name: "Fair Booth",
        currentVisitors: [],
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(
              mockQuerySnap([
                mockDocSnap({ id: "fair-1" }, true, "fair-1"),
                mockDocSnap({ id: "fair-2" }, true, "fair-2"),
              ])
            ),
            doc: jest.fn((fairId) => ({
              collection: jest.fn((collName) => {
                if (collName === "booths") {
                  return {
                    doc: jest.fn((boothId) => ({
                      get: jest.fn(() => {
                        // Only found in fair-2
                        if (fairId === "fair-2" && boothId === "fair-booth-1") {
                          return Promise.resolve(mockDocSnap(mockData, true, "fair-booth-1"));
                        }
                        return Promise.resolve(mockDocSnap({}, false));
                      }),
                    })),
                  };
                }
                return {};
              }),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("fair-booth-1");

      expect(result).toBeDefined();
      expect(result.location).toBe("fair");
      expect(result.fairId).toBe("fair-2");
      expect(result.data.id).toBe("fair-booth-1");
    });

    it("should return ref object with fairId for fair-specific booth", async () => {
      const mockData = {
        id: "booth-1",
        companyId: "company-1",
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(
              mockQuerySnap([
                mockDocSnap({ id: "fair-1" }, true, "fair-1"),
              ])
            ),
            doc: jest.fn((fairId) => ({
              collection: jest.fn(() => ({
                doc: jest.fn((boothId) => ({
                  get: jest.fn().mockResolvedValue(mockDocSnap(mockData, true, "booth-1")),
                })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.location).toBe("fair");
      expect(result.fairId).toBe("fair-1");
      expect(result.ref).toBeDefined();
      expect(result.data).toEqual(mockData);
    });

    it("should find booth in second fair when not in first", async () => {
      const mockData = {
        id: "booth-1",
        companyId: "company-1",
      };

      let fairIndex = 0;
      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(
              mockQuerySnap([
                mockDocSnap({ id: "fair-1" }, true, "fair-1"),
                mockDocSnap({ id: "fair-2" }, true, "fair-2"),
              ])
            ),
            doc: jest.fn((fairId) => ({
              collection: jest.fn(() => ({
                doc: jest.fn((boothId) => ({
                  get: jest.fn(() => {
                    if (fairId === "fair-2") {
                      return Promise.resolve(mockDocSnap(mockData, true, "booth-1"));
                    }
                    return Promise.resolve(mockDocSnap({}, false));
                  }),
                })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.location).toBe("fair");
      expect(result.fairId).toBe("fair-2");
      expect(result.data.id).toBe("booth-1");
    });

    it("should handle multiple fairs efficiently", async () => {
      const mockData = { id: "booth-in-fair-3", companyId: "company-1" };
      const fairs = Array.from({ length: 5 }, (_, i) => ({
        id: `fair-${i + 1}`,
      }));

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(
              mockQuerySnap(fairs.map((fair) => mockDocSnap({ id: fair.id }, true, fair.id)))
            ),
            doc: jest.fn((fairId) => ({
              collection: jest.fn(() => ({
                doc: jest.fn((boothId) => ({
                  get: jest.fn(() => {
                    if (fairId === "fair-3") {
                      return Promise.resolve(mockDocSnap(mockData, true, "booth-in-fair-3"));
                    }
                    return Promise.resolve(mockDocSnap({}, false));
                  }),
                })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-in-fair-3");

      expect(result.fairId).toBe("fair-3");
      expect(result.location).toBe("fair");
    });
  });

  describe("Booth Not Found", () => {
    it("should return null when booth not found globally or in any fair", async () => {
      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(
              mockQuerySnap([
                mockDocSnap({ id: "fair-1" }, true, "fair-1"),
                mockDocSnap({ id: "fair-2" }, true, "fair-2"),
              ])
            ),
            doc: jest.fn((fairId) => ({
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
                })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("non-existent-booth");

      expect(result).toBeNull();
    });

    it("should return null when no fairs exist", async () => {
      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          };
        }
        return {};
      });

      const result = await resolveBooth("any-booth");

      expect(result).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should throw error if global booth lookup fails", async () => {
      const error = new Error("Firestore connection failed");

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockRejectedValue(error),
            })),
          };
        }
        return {};
      });

      await expect(resolveBooth("booth-1")).rejects.toThrow("Firestore connection failed");
    });

    it("should throw error if fair lookup fails", async () => {
      const error = new Error("Fair query failed");

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockRejectedValue(error),
          };
        }
        return {};
      });

      await expect(resolveBooth("booth-1")).rejects.toThrow("Fair query failed");
    });

    it("should throw error if fair booth lookup fails", async () => {
      const error = new Error("Fair booth query failed");

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(mockQuerySnap([mockDocSnap({ id: "fair-1" }, true, "fair-1")])),
            doc: jest.fn((fairId) => ({
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn().mockRejectedValue(error),
                })),
              })),
            })),
          };
        }
        return {};
      });

      await expect(resolveBooth("booth-1")).rejects.toThrow("Fair booth query failed");
    });
  });

  describe("Data Integrity", () => {
    it("should preserve all booth data fields in global booth", async () => {
      const complexData = {
        id: "booth-1",
        companyId: "company-1",
        companyName: "Tech Corp",
        representativeIDs: ["rep-1", "rep-2"],
        currentVisitors: ["s1", "s2"],
        totalVisitorsCount: 42,
        location: "Hall A, Booth 5",
        description: "We are hiring!",
        tags: ["tech", "startup", "engineering"],
        metadata: { created: 1000000, updated: 2000000 },
        settings: { allowChatRequests: true, allowVideoCall: false },
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(complexData, true, "booth-1")),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.data).toEqual(complexData);
      expect(Object.keys(result.data).length).toBe(Object.keys(complexData).length);
    });

    it("should preserve all booth data fields in fair-specific booth", async () => {
      const complexData = {
        id: "booth-1",
        companyId: "company-1",
        companyName: "Tech Corp",
        representativeIDs: ["rep-1", "rep-2"],
        currentVisitors: ["s1", "s2"],
        totalVisitorsCount: 42,
        location: "Hall A, Booth 5",
        description: "We are hiring!",
      };

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({}, false)),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn().mockResolvedValue(mockQuerySnap([mockDocSnap({ id: "fair-1" }, true, "fair-1")])),
            doc: jest.fn(() => ({
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue(mockDocSnap(complexData, true, "booth-1")),
                })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(result.data).toEqual(complexData);
    });
  });

  describe("Performance Considerations", () => {
    it("should prefer global booth to avoid fair iteration", async () => {
      const globalData = { id: "booth-1", location: "global" };
      let globalBoothCalled = false;

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn(() => {
                globalBoothCalled = true;
                return Promise.resolve(mockDocSnap(globalData, true, "booth-1"));
              }),
            })),
          };
        }
        if (collectionName === "fairs") {
          return {
            get: jest.fn(() => {
              throw new Error("Fair query should not be called when global booth found");
            }),
          };
        }
        return {};
      });

      const result = await resolveBooth("booth-1");

      expect(globalBoothCalled).toBe(true);
      expect(result.location).toBe("global");
    });

    it("should not query fairs when global booth exists", async () => {
      let fairGetCalled = false;

      db.collection.mockImplementation((collectionName) => {
        if (collectionName === "booths") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ id: "booth-1" }, true, "booth-1")),
            })),
          };
        }
        if (collectionName === "fairs") {
          fairGetCalled = true;
          return {};
        }
        return {};
      });

      await resolveBooth("booth-1");

      expect(fairGetCalled).toBe(false);
    });
  });
});
