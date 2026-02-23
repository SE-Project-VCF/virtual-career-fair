// Shared mock setup and utilities for endpoint tests

// Must be called BEFORE requiring server.js in each test file
function setupMocks() {
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
        createToken: jest.fn().mockReturnValue("mock-stream-token"),
        queryChannels: jest.fn().mockResolvedValue([]),
      })),
    },
  }));
}

function mockDocSnap(data, exists = true, id = "mock-doc-id") {
  return { exists, data: () => data, id };
}

function mockQuerySnap(docs = []) {
  return {
    docs,
    empty: docs.length === 0,
    forEach: (cb) => docs.forEach(cb),
  };
}

// Create a chainable collection mock with configurable behavior
function createCollectionMock(config = {}) {
  const docRef = {
    get: jest.fn().mockResolvedValue(
      mockDocSnap(config.docData, config.docExists !== false, config.docId || "mock-doc-id")
    ),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    id: config.docId || "mock-doc-id",
  };

  const collectionRef = {
    doc: jest.fn(() => docRef),
    add: jest.fn().mockResolvedValue({ id: config.newDocId || "new-doc-id" }),
    get: jest.fn().mockResolvedValue(mockQuerySnap(config.docs || [])),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };

  return { collectionRef, docRef };
}

module.exports = { setupMocks, mockDocSnap, mockQuerySnap, createCollectionMock };
