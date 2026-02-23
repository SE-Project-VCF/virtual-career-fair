// console.test.js - Tests for console.js validation and CRUD logic

// Mock Firebase Admin before requiring console.js
jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
  };
});

// Mock readline to prevent interactive console from starting
jest.mock("readline", () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
}));

// Mock the firebase module that console.js imports (must be before require)
const mockCollection = jest.fn();
jest.mock("../firebase", () => ({
  db: {
    collection: mockCollection,
  },
}));

const {
  validateFieldsRecursive,
  validateFields,
  ALLOWED_COLLECTIONS,
  COLLECTION_FIELDS,
  listAll,
  addDocument,
  updateDocument,
  deleteDocument,
} = require("../console");

const { mockDocSnap, mockQuerySnap } = require("./testUtils");
const { db } = require("../firebase");

describe("ALLOWED_COLLECTIONS and COLLECTION_FIELDS", () => {
  it("should have correct allowed collections", () => {
    expect(ALLOWED_COLLECTIONS).toEqual([
      "students",
      "employers",
      "representatives",
      "jobs",
      "booths",
    ]);
  });

  it("should have field schemas for all allowed collections", () => {
    ALLOWED_COLLECTIONS.forEach((collection) => {
      expect(COLLECTION_FIELDS[collection]).toBeDefined();
      expect(typeof COLLECTION_FIELDS[collection]).toBe("object");
    });
  });

  it("should have correct student fields", () => {
    const studentFields = Object.keys(COLLECTION_FIELDS.students);
    expect(studentFields).toContain("firstName");
    expect(studentFields).toContain("lastName");
    expect(studentFields).toContain("email");
    expect(studentFields).toContain("major");
  });

  it("should have correct employer fields", () => {
    const employerFields = Object.keys(COLLECTION_FIELDS.employers);
    expect(employerFields).toContain("companyName");
    expect(employerFields).toContain("primaryLocation");
    expect(employerFields).toContain("boothId");
  });

  it("should have nested booth fields", () => {
    expect(COLLECTION_FIELDS.booths.boothTable).toBeDefined();
    expect(typeof COLLECTION_FIELDS.booths.boothTable).toBe("object");
    expect(COLLECTION_FIELDS.booths.boothTable.boothName).toBe(true);
    expect(COLLECTION_FIELDS.booths.boothTable.location).toBe(true);
  });
});

describe("validateFieldsRecursive", () => {
  const schema = {
    name: true,
    age: true,
    nested: {
      field1: true,
      field2: true,
    },
  };

  it("should return null for valid flat data", () => {
    const data = { name: "John", age: 30 };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBeNull();
  });

  it("should return error for invalid flat field", () => {
    const data = { name: "John", invalidField: "value" };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBe("❌ Invalid field 'invalidField'");
  });

  it("should return null for valid nested data", () => {
    const data = { name: "John", nested: { field1: "val1", field2: "val2" } };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBeNull();
  });

  it("should return error for invalid nested field with path", () => {
    const data = { name: "John", nested: { field1: "val1", invalidNested: "val" } };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBe("❌ Invalid field 'nested.invalidNested'");
  });

  it("should handle deeply nested paths correctly", () => {
    const deepSchema = { level1: { level2: { level3: true } } };
    const data = { level1: { level2: { invalidField: "val" } } };
    const result = validateFieldsRecursive(deepSchema, data);
    expect(result).toBe("❌ Invalid field 'level1.level2.invalidField'");
  });

  it("should return null for empty data", () => {
    const result = validateFieldsRecursive(schema, {});
    expect(result).toBeNull();
  });

  it("should handle null values in data", () => {
    const data = { name: null, age: 30 };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBeNull();
  });

  it("should return first invalid field when multiple are invalid", () => {
    const data = { invalid1: "val1", invalid2: "val2" };
    const result = validateFieldsRecursive(schema, data);
    expect(result).toBe("❌ Invalid field 'invalid1'");
  });
});

describe("validateFields", () => {
  it("should validate students collection with valid data", () => {
    const validStudent = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      major: "CS",
    };
    expect(validateFields("students", validStudent)).toBeNull();
  });

  it("should reject students with invalid fields", () => {
    const invalidStudent = {
      firstName: "John",
      invalidField: "value",
    };
    expect(validateFields("students", invalidStudent)).toBe(
      "❌ Invalid field 'invalidField'"
    );
  });

  it("should validate employers collection with valid data", () => {
    const validEmployer = {
      companyName: "Tech Corp",
      primaryLocation: "NYC",
      email: "hr@tech.com",
    };
    expect(validateFields("employers", validEmployer)).toBeNull();
  });

  it("should reject employers with invalid fields", () => {
    const invalidEmployer = {
      companyName: "Tech Corp",
      notAField: "value",
    };
    expect(validateFields("employers", invalidEmployer)).toBe(
      "❌ Invalid field 'notAField'"
    );
  });

  it("should validate representatives collection with valid data", () => {
    const validRep = {
      firstName: "Jane",
      lastName: "Smith",
      company: "Tech Corp",
      email: "jane@tech.com",
    };
    expect(validateFields("representatives", validRep)).toBeNull();
  });

  it("should validate jobs collection with valid data", () => {
    const validJob = {
      name: "Software Engineer",
      description: "Build apps",
      applicationLink: "https://apply.com",
      employer: "comp-id",
    };
    expect(validateFields("jobs", validJob)).toBeNull();
  });

  it("should validate booths collection with valid flat data", () => {
    const validBooth = {
      employer: "comp-id",
    };
    expect(validateFields("booths", validBooth)).toBeNull();
  });

  it("should validate booths collection with nested boothTable", () => {
    const validBooth = {
      employer: "comp-id",
      boothTable: {
        boothName: "Booth 1",
        location: "Hall A",
        description: "Our booth",
      },
    };
    expect(validateFields("booths", validBooth)).toBeNull();
  });

  it("should reject booths with invalid nested fields", () => {
    const invalidBooth = {
      employer: "comp-id",
      boothTable: {
        boothName: "Booth 1",
        invalidNestedField: "value",
      },
    };
    expect(validateFields("booths", invalidBooth)).toBe(
      "❌ Invalid field 'boothTable.invalidNestedField'"
    );
  });

  it("should handle empty data objects", () => {
    expect(validateFields("students", {})).toBeNull();
    expect(validateFields("employers", {})).toBeNull();
  });
});

describe("listAll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
  });

  it("should log message when collection is empty", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockQuerySnap([]));
    db.collection.mockReturnValue({ get: mockGet });

    await listAll("students");

    expect(db.collection).toHaveBeenCalledWith("students");
    expect(mockGet).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("No documents found in 'students'");
  });

  it("should log all documents when collection has data", async () => {
    const mockDocs = [
      mockDocSnap({ name: "John" }, true, "id1"),
      mockDocSnap({ name: "Jane" }, true, "id2"),
    ];
    const mockGet = jest.fn().mockResolvedValue(mockQuerySnap(mockDocs));
    db.collection.mockReturnValue({ get: mockGet });

    await listAll("students");

    expect(console.log).toHaveBeenCalledWith("id1:", { name: "John" });
    expect(console.log).toHaveBeenCalledWith("id2:", { name: "Jane" });
  });

  it("should call Firestore with correct collection name", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockQuerySnap([]));
    db.collection.mockReturnValue({ get: mockGet });

    await listAll("employers");

    expect(db.collection).toHaveBeenCalledWith("employers");
  });
});

describe("addDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
  });

  it("should add valid document to Firestore", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "new-doc-id" });
    db.collection.mockReturnValue({ add: mockAdd });

    const validData = { firstName: "John", lastName: "Doe" };
    await addDocument("students", validData);

    expect(db.collection).toHaveBeenCalledWith("students");
    expect(mockAdd).toHaveBeenCalledWith(validData);
    expect(console.log).toHaveBeenCalledWith("✅ Added document with ID: new-doc-id");
  });

  it("should reject invalid document and not call Firestore", async () => {
    const mockAdd = jest.fn();
    db.collection.mockReturnValue({ add: mockAdd });

    const invalidData = { firstName: "John", invalidField: "value" };
    await addDocument("students", invalidData);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("❌ Invalid field 'invalidField'");
  });

  it("should validate data before adding", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "new-id" });
    db.collection.mockReturnValue({ add: mockAdd });

    const validEmployer = { companyName: "Tech Corp", email: "hr@tech.com" };
    await addDocument("employers", validEmployer);

    expect(mockAdd).toHaveBeenCalledWith(validEmployer);
    expect(console.log).toHaveBeenCalledWith("✅ Added document with ID: new-id");
  });

  it("should handle nested data validation", async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: "booth-id" });
    db.collection.mockReturnValue({ add: mockAdd });

    const validBooth = {
      employer: "comp-id",
      boothTable: { boothName: "Booth 1", location: "Hall A" },
    };
    await addDocument("booths", validBooth);

    expect(mockAdd).toHaveBeenCalledWith(validBooth);
  });
});

describe("updateDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
  });

  it("should update existing document with valid data", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap({ name: "Old" }, true, "doc-id"));
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, update: mockUpdate });
    db.collection.mockReturnValue({ doc: mockDoc });

    const validData = { firstName: "Jane" };
    await updateDocument("students", "doc-id", validData);

    expect(db.collection).toHaveBeenCalledWith("students");
    expect(mockDoc).toHaveBeenCalledWith("doc-id");
    expect(mockUpdate).toHaveBeenCalledWith(validData);
    expect(console.log).toHaveBeenCalledWith("✅ Updated document with ID: doc-id");
  });

  it("should reject invalid data and not update", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap({ name: "Old" }, true, "doc-id"));
    const mockUpdate = jest.fn();
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, update: mockUpdate });
    db.collection.mockReturnValue({ doc: mockDoc });

    const invalidData = { firstName: "Jane", badField: "value" };
    await updateDocument("students", "doc-id", invalidData);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("❌ Invalid field 'badField'");
  });

  it("should handle document not found", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap(null, false, "doc-id"));
    const mockUpdate = jest.fn();
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, update: mockUpdate });
    db.collection.mockReturnValue({ doc: mockDoc });

    const validData = { firstName: "Jane" };
    await updateDocument("students", "doc-id", validData);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("❌ Document 'doc-id' not found");
  });

  it("should validate before checking document existence", async () => {
    const mockGet = jest.fn();
    const mockUpdate = jest.fn();
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, update: mockUpdate });
    db.collection.mockReturnValue({ doc: mockDoc });

    const invalidData = { invalidField: "value" };
    await updateDocument("students", "doc-id", invalidData);

    // Validation fails early, so we never call get
    expect(mockGet).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("❌ Invalid field 'invalidField'");
  });
});

describe("deleteDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
  });

  it("should delete existing document", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap({ name: "Data" }, true, "doc-id"));
    const mockDelete = jest.fn().mockResolvedValue(undefined);
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, delete: mockDelete });
    db.collection.mockReturnValue({ doc: mockDoc });

    await deleteDocument("students", "doc-id");

    expect(db.collection).toHaveBeenCalledWith("students");
    expect(mockDoc).toHaveBeenCalledWith("doc-id");
    expect(mockDelete).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("🗑️ Deleted document with ID: doc-id");
  });

  it("should handle document not found", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap(null, false, "doc-id"));
    const mockDelete = jest.fn();
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, delete: mockDelete });
    db.collection.mockReturnValue({ doc: mockDoc });

    await deleteDocument("students", "doc-id");

    expect(mockDelete).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("❌ Document 'doc-id' not found");
  });

  it("should call delete on correct document reference", async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDocSnap({}, true, "specific-id"));
    const mockDelete = jest.fn().mockResolvedValue(undefined);
    const mockDoc = jest.fn().mockReturnValue({ get: mockGet, delete: mockDelete });
    db.collection.mockReturnValue({ doc: mockDoc });

    await deleteDocument("employers", "specific-id");

    expect(mockDoc).toHaveBeenCalledWith("specific-id");
    expect(mockDelete).toHaveBeenCalled();
  });
});
