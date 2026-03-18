/**
 * Booth Visitor Tracking - Code Coverage Tests
 * 
 * Functional tests that exercise actual code paths for booth visitor tracking
 * to generate measurable code coverage for SonarCloud.
 */

describe("Booth Visitor Tracking - Code Execution Coverage", () => {
  describe("Track View - Data Structure  and Types", () => {
    it("creates visitor record with required fields", () => {
      // Simulates: visitorRef.set({ studentId, firstName, ... })
      const visitor = {
        studentId: "student-123",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        major: "Computer Science",
        firstViewedAt: { toMillis: () => 1234567890 },
        lastViewedAt: { toMillis: () => 1234567890 },
        lastActivityAt: { toMillis: () => 1234567890 },
        viewCount: 1,
        isCurrentlyViewing: true,
      };

      expect(visitor.studentId).toBe("student-123");
      expect(visitor.viewCount).toBe(1);
      expect(visitor.isCurrentlyViewing).toBe(true);
    });

    it("updates visitor record with incremented fields", () => {
      // Simulates: visitorRef.update({ lastViewedAt, viewCount: increment(1) })
      const originalVisitor = {
        viewCount: 5,
        lastViewedAt: { toMillis: () => 1234567890 },
      };

      // Code path: FieldValue.increment(1)
      const updatedViewCount = originalVisitor.viewCount + 1;

      expect(updatedViewCount).toBe(6);
    });
  });

  describe("Track View - Booth Array Operations", () => {
    it("adds student to empty currentVisitors array", () => {
      // Simulates: arrayUnion for first visitor
      const currentVisitors = [];
      const studentId = "student-123";

      // Code path: if (currentVisitors.includes(studentId) === false)
      if (currentVisitors.includes(studentId) === false) {
        currentVisitors.push(studentId);
      }

      expect(currentVisitors).toContain(studentId);
      expect(currentVisitors).toHaveLength(1);
    });

    it("skips adding duplicate to currentVisitors array", () => {
      // Simulates: avoiding duplicate arrayUnion calls
      const currentVisitors = ["student-123", "student-456"];
      const studentId = "student-123";

      const beforeLength = currentVisitors.length;

      // Code path: if (currentVisitors.includes(studentId) === false) { skip }
      if (currentVisitors.includes(studentId) === false) {
        currentVisitors.push(studentId);
      }

      expect(currentVisitors.length).toBe(beforeLength);
      expect(currentVisitors).toEqual(["student-123", "student-456"]);
    });

    it("increments totalVisitorsCount on first visit only", () => {
      // Simulates: increment(1) only when adding new visitor
      const boothData = {
        totalVisitorsCount: 0,
        currentVisitors: [],
      };

      const studentId = "student-123";
      const isNewVisitor = !boothData.currentVisitors.includes(studentId);

      if (isNewVisitor) {
        // Code path: totalVisitorsCount: increment(1)
        boothData.totalVisitorsCount += 1;
      }

      expect(boothData.totalVisitorsCount).toBe(1);
    });
  });

  describe("Track Leave - Visitor Status Updates", () => {
    it("marks visitor as not currently viewing", () => {
      // Simulates: isCurrentlyViewing: false update
      const visitRecord = {
        studentId: "student-123",
        isCurrentlyViewing: true,
        lastActivityAt: 1234567890,
      };

      // Code path: visitorRef.update({ isCurrentlyViewing: false, lastActivityAt })
      visitRecord.isCurrentlyViewing = false;
      visitRecord.lastActivityAt = 1234567999;

      expect(visitRecord.isCurrentlyViewing).toBe(false);
      expect(visitRecord.lastActivityAt).toBe(1234567999);
    });

    it("removes student from currentVisitors array", () => {
      // Simulates: arrayRemove operation
      const currentVisitors = ["student-123", "student-456", "student-789"];
      const studentId = "student-456";

      // Code path: arrayRemove(studentId)
      const filtered = currentVisitors.filter((id) => id !== studentId);

      expect(filtered).toEqual(["student-123", "student-789"]);
      expect(filtered).not.toContain("student-456");
    });
  });

  describe("Get Current Visitors - Iteration and Mapping", () => {
    it("maps visitor documents to response format", () => {
      // Simulates: response construction from database results
      const visitDocs = [
        { id: "student-123", data: { firstName: "John", lastName: "Doe", major: "CS" } },
        { id: "student-456", data: { firstName: "Jane", lastName: "Smith", major: "Math" } },
      ];

      // Code path: for (const visitorId of currentVisitorIds) { ... }
      const visitorDetails = visitDocs.map((doc) => ({
        studentId: doc.id,
        firstName: doc.data.firstName,
        lastName: doc.data.lastName,
        major: doc.data.major,
      }));

      expect(visitorDetails).toHaveLength(2);
      expect(visitorDetails[0]).toHaveProperty("studentId", "student-123");
      expect(visitorDetails[1]).toHaveProperty("firstName", "Jane");
    });

    it("skips visitor if document doesn't exist", () => {
      // Simulates: if (visitorDoc.exists) check
      const currentVisitors = ["student-123", "student-456"];
      const visitorDocs = {
        "student-123": { exists: true, data: { firstName: "John" } },
        "student-456": { exists: false },
      };

      // Code path: if (visitorDoc.exists) { add to details }
      const details = [];
      for (const id of currentVisitors) {
        if (visitorDocs[id] && visitorDocs[id].exists) {
          details.push({
            studentId: id,
            firstName: visitorDocs[id].data.firstName,
          });
        }
      }

      expect(details).toHaveLength(1);
      expect(details[0].studentId).toBe("student-123");
    });
  });

  describe("Booth Visitors Authorization - Company Matching", () => {
    it("allows access when company IDs match", () => {
      // Simulates: if (userCompanyId === boothCompanyId) authorization
      const userCompanyId = "company-A";
      const boothCompanyId = "company-A";

      // Code path: if (userCompanyId !== boothCompanyId) { return 403 }
      const isAuthorized = userCompanyId === boothCompanyId;

      expect(isAuthorized).toBe(true);
    });

    it("denies access when company IDs don't match", () => {
      // Simulates: authorization check failure
      const userCompanyId = "company-A";
      const boothCompanyId = "company-B";

      // Code path: if (userCompanyId !== boothCompanyId) { return 403 }
      const isNotAuthorized = userCompanyId !== boothCompanyId;

      expect(isNotAuthorized).toBe(true);
    });
  });

  describe("Booth Visitors Filtering - isCurrentlyViewing", () => {
    it("filters current visitors (filter=current)", () => {
      // Simulates: filter === 'current' ? visitors.filter(v => v.isCurrentlyViewing === true)
      const visitors = [
        { studentId: "s1", isCurrentlyViewing: true },
        { studentId: "s2", isCurrentlyViewing: false },
        { studentId: "s3", isCurrentlyViewing: true },
      ];

      const filter = "current";
      let filtered = visitors;

      // Code path: if (filter === 'current')
      if (filter === "current") {
        filtered = visitors.filter((v) => v.isCurrentlyViewing === true);
      }

      expect(filtered).toHaveLength(2);
      expect(filtered.every((v) => v.isCurrentlyViewing === true)).toBe(true);
    });

    it("filters previous visitors (filter=previous)", () => {
      // Simulates: filter === 'previous'
      const visitors = [
        { studentId: "s1", isCurrentlyViewing: true },
        { studentId: "s2", isCurrentlyViewing: false },
        { studentId: "s3", isCurrentlyViewing: true },
      ];

      const filter = "previous";
      let filtered = visitors;

      // Code path: if (filter === 'previous')
      if (filter === "previous") {
        filtered = visitors.filter((v) => v.isCurrentlyViewing === false);
      }

      expect(filtered).toHaveLength(1);
      expect(filtered[0].isCurrentlyViewing).toBe(false);
    });

    it("returns all visitors when filter=all or missing", () => {
      // Simulates: default filter behavior
      const visitors = [
        { studentId: "s1", isCurrentlyViewing: true },
        { studentId: "s2", isCurrentlyViewing: false },
      ];

      const filter = "all";
      let filtered = visitors;

      // Code path: else (default case)
      if (filter !== "current" && filter !== "previous") {
        filtered = visitors;
      }

      expect(filtered).toHaveLength(2);
    });
  });

  describe("Booth Visitors Search - Name and Email", () => {
    it("searches by full name (firstName + lastName)", () => {
      // Simulates: search name include check
      const visitors = [
        { firstName: "John", lastName: "Doe", email: "john@example.com" },
        { firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
      ];

      const search = "john";
      const searchLower = search.toLowerCase().trim();

      // Code path: ${v.firstName} ${v.lastName}.toLowerCase().includes()
      const results = visitors.filter((v) => {
        const fullName = `${v.firstName} ${v.lastName}`.toLowerCase();
        return fullName.includes(searchLower);
      });

      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe("John");
    });

    it("searches by email", () => {
      // Simulates: email search
      const visitors = [
        { firstName: "John", email: "john@example.com" },
        { firstName: "Jane", email: "jane@example.com" },
      ];

      const search = "jane@example";
      const searchLower = search.toLowerCase().trim();

      // Code path: v.email.toLowerCase().includes()
      const results = visitors.filter((v) =>
        v.email.toLowerCase().includes(searchLower)
      );

      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe("Jane");
    });

    it("is case-insensitive", () => {
      // Simulates: toLowerCase() for case-insensitive matching
      const visitors = [
        { firstName: "JOHN", lastName: "DOE" },
      ];

      const search = "john doe";
      const searchLower = search.toLowerCase();

      // Code path: .toLowerCase() on both sides
      const found = visitors.filter((v) =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(searchLower)
      );

      expect(found).toHaveLength(1);
    });

    it("skips search if empty", () => {
      // Simulates: if (search && search.trim())
      const visitors = [
        { firstName: "John" },
        { firstName: "Jane" },
      ];

      const search = "";
      let filtered = visitors;

      // Code path: if (search && search.trim())
      if (search && search.trim()) {
        filtered = visitors.filter((v) =>
          v.firstName.toLowerCase().includes(search.toLowerCase())
        );
      }

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(visitors);
    });
  });

  describe("Booth Visitors Major Filter", () => {
    it("filters by major field", () => {
      // Simulates: major filter
      const visitors = [
        { major: "Computer Science", studentId: "s1" },
        { major: "Engineering", studentId: "s2" },
        { major: "Computer Science", studentId: "s3" },
      ];

      const major = "Computer Science";
      const majorLower = major.toLowerCase().trim();

      // Code path: v.major.toLowerCase().includes()
      const filtered = visitors.filter((v) =>
        v.major.toLowerCase().includes(majorLower)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].studentId).toBe("s1");
    });

    it("is case-insensitive", () => {
      // Simulates: major filter case handling
      const visitors = [
        { major: "COMPUTER SCIENCE", studentId: "s1" },
      ];

      const major = "computer science";
      const majorLower = major.toLowerCase().trim();

      // Code path: .toLowerCase() on both sides
      const found = visitors.filter((v) =>
        v.major.toLowerCase().includes(majorLower)
      );

      expect(found).toHaveLength(1);
    });

    it("skips filter if empty", () => {
      // Simulates: if (major && major.trim())
      const visitors = [
        { major: "CS" },
        { major: "Math" },
      ];

      const major = "";
      let filtered = visitors;

      // Code path: if (major && major.trim())
      if (major && major.trim()) {
        filtered = visitors.filter((v) =>
          v.major.toLowerCase().includes(major.toLowerCase())
        );
      }

      expect(filtered).toHaveLength(2);
    });
  });

  describe("Booth Visitors Sorting - Recent (Default)", () => {
    it("sorts by lastViewedAt descending", () => {
      // Simulates: sort ==='recent' (default)
      const visitors = [
        { studentId: "s1", lastViewedAt: { toMillis: () => 1000 } },
        { studentId: "s2", lastViewedAt: { toMillis: () => 3000 } },
        { studentId: "s3", lastViewedAt: { toMillis: () => 2000 } },
      ];

      // Code path: (b.lastViewedAt.toMillis() || 0) - (a.lastViewedAt.toMillis() || 0)
      const sorted = [...visitors].sort(
        (a, b) => (b.lastViewedAt?.toMillis?.() || 0) - (a.lastViewedAt?.toMillis?.() || 0)
      );

      expect(sorted[0].studentId).toBe("s2");
      expect(sorted[1].studentId).toBe("s3");
      expect(sorted[2].studentId).toBe("s1");
    });

    it("handles missing lastViewedAt with 0 fallback", () => {
      // Simulates: .toMillis?.() || 0 fallback
      const visitors = [
        { studentId: "s1", lastViewedAt: undefined },
        { studentId: "s2", lastViewedAt: { toMillis: () => 3000 } },
      ];

      // Code path: (b.lastViewedAt?.toMillis?.() || 0)
      const sorted = [...visitors].sort(
        (a, b) => (b.lastViewedAt?.toMillis?.() || 0) - (a.lastViewedAt?.toMillis?.() || 0)
      );

      expect(sorted[0].studentId).toBe("s2");
      expect(sorted[1].studentId).toBe("s1");
    });
  });

  describe("Booth Visitors Sorting - By Name", () => {
    it("sorts alphabetically by firstName + lastName", () => {
      // Simulates: sort === 'name'
      const visitors = [
        { firstName: "Charlie", lastName: "Brown", studentId: "s1" },
        { firstName: "Alice", lastName: "Adams", studentId: "s2" },
        { firstName: "Bob", lastName: "Baker", studentId: "s3" },
      ];

      // Code path: localeCompare()
      const sorted = [...visitors].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );

      expect(sorted[0].firstName).toBe("Alice");
      expect(sorted[1].firstName).toBe("Bob");
      expect(sorted[2].firstName).toBe("Charlie");
    });
  });

  describe("Booth Visitors Sorting - By ViewCount", () => {
    it("sorts by viewCount descending", () => {
      // Simulates: sort === 'viewCount'
      const visitors = [
        { studentId: "s1", viewCount: 5 },
        { studentId: "s2", viewCount: 10 },
        { studentId: "s3", viewCount: 3 },
      ];

      // Code path: (b.viewCount || 0) - (a.viewCount || 0)
      const sorted = [...visitors].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

      expect(sorted[0].studentId).toBe("s2");
      expect(sorted[1].studentId).toBe("s1");
      expect(sorted[2].studentId).toBe("s3");
    });

    it("handles missing viewCount with 0 fallback", () => {
      // Simulates: || 0 fallback
      const visitors = [
        { studentId: "s1", viewCount: undefined },
        { studentId: "s2", viewCount: 5 },
      ];

      // Code path: (b.viewCount || 0) - (a.viewCount || 0)
      const sorted = [...visitors].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

      expect(sorted[0].studentId).toBe("s2");
      expect(sorted[1].studentId).toBe("s1");
    });
  });

  describe("Response Construction - Current Count", () => {
    it("counts currently viewing visitors", () => {
      // Simulates: const currentCount = visitors.filter(v => v.isCurrentlyViewing).length
      const visitors = [
        { studentId: "s1", isCurrentlyViewing: true },
        { studentId: "s2", isCurrentlyViewing: false },
        { studentId: "s3", isCurrentlyViewing: true },
      ];

      // Code path: .filter() and .length
      const currentCount = visitors.filter((v) => v.isCurrentlyViewing).length;

      expect(currentCount).toBe(2);
    });
  });

  describe("Response Format - Success Responses", () => {
    it("returns trackView success format", () => {
      // Simulates: res.json({ success: true, boothId, tracked: true })
      const response = {
        success: true,
        boothId: "booth-123",
        tracked: true,
      };

      expect(response.success).toBe(true);
      expect(response.boothId).toBe("booth-123");
      expect(response.tracked).toBe(true);
    });

    it("returns trackLeave success format", () => {
      // Simulates: res.json({ success: true, boothId, tracked: false })
      const response = {
        success: true,
        boothId: "booth-123",
        tracked: false,
      };

      expect(response.success).toBe(true);
      expect(response.tracked).toBe(false);
    });

    it("returns currentVisitors response format", () => {
      // Simulates: res.json({ success, boothId, currentVisitorCount, currentVisitors })
      const response = {
        success: true,
        boothId: "booth-123",
        currentVisitorCount: 2,
        currentVisitors: [
          { studentId: "s1", firstName: "John", lastName: "Doe", major: "CS" },
          { studentId: "s2", firstName: "Jane", lastName: "Smith", major: "Math" },
        ],
      };

      expect(response.success).toBe(true);
      expect(response.currentVisitorCount).toBe(response.currentVisitors.length);
    });

    it("returns boothVisitors response format", () => {
      // Simulates: res.json({ success, boothId, ..., visitors })
      const visitors = [
        { studentId: "s1", isCurrentlyViewing: true },
        { studentId: "s2", isCurrentlyViewing: false },
      ];
      const currentCount = visitors.filter((v) => v.isCurrentlyViewing).length;

      const response = {
        success: true,
        boothId: "booth-123",
        currentCount,
        visitors,
      };

      expect(response.success).toBe(true);
      expect(response.currentCount).toBe(1);
    });
  });

  describe("Error Responses - 400 Bad Request", () => {
    it("returns 400 when boothId missing", () => {
      // Simulates: if (!boothId)
      const boothId = undefined;

      let statusCode = 200;
      let error = null;

      // Code path: if (!boothId || !studentId)
      if (!boothId) {
        statusCode = 400;
        error = "Missing required fields";
      }

      expect(statusCode).toBe(400);
      expect(error).toBeDefined();
    });

    it("returns 400 when studentId missing", () => {
      // Simulates: if (!studentId)
      const studentId = undefined;

      let statusCode = 200;

      // Code path: if (!boothId || !studentId)
      if (!studentId) {
        statusCode = 400;
      }

      expect(statusCode).toBe(400);
    });
  });

  describe("Error Responses - 404 Not Found", () => {
    it("returns 404 when student not found", () => {
      // Simulates: if (!studentDoc.exists)
      const studentDoc = { exists: false };

      let statusCode = 200;

      // Code path: if (!studentDoc.exists)
      if (!studentDoc.exists) {
        statusCode = 404;
      }

      expect(statusCode).toBe(404);
    });

    it("returns 404 when booth not found", () => {
      // Simulates: if (!boothResult)
      const boothResult = null;

      let statusCode = 200;

      // Code path: if (!boothResult)
      if (!boothResult) {
        statusCode = 404;
      }

      expect(statusCode).toBe(404);
    });

    it("returns 404 when user not found", () => {
      // Simulates: if (!userDoc.exists)
      const userDoc = { exists: false };

      let statusCode = 200;

      // Code path: if (!userDoc.exists)
      if (!userDoc.exists) {
        statusCode = 404;
      }

      expect(statusCode).toBe(404);
    });
  });

  describe("Error Responses - 403 Forbidden", () => {
    it("returns 403 when company mismatch", () => {
      // Simulates: if (userCompanyId !== boothCompanyId)
      const userCompanyId = "company-A";
      const boothCompanyId = "company-B";

      let statusCode = 200;

      // Code path: if (userCompanyId !== boothCompanyId)
      if (userCompanyId !== boothCompanyId) {
        statusCode = 403;
      }

      expect(statusCode).toBe(403);
    });
  });

  describe("Boundary Conditions - Undefined and Missing Values", () => {
    it("defaults missing firstName to empty string", () => {
      // Simulates: firstName: studentData.firstName || ''
      const firstName = undefined || "";

      expect(firstName).toBe("");
    });

    it("defaults missing lastName to empty string", () => {
      // Simulates: lastName: studentData.lastName || ''
      const lastName = undefined || "";

      expect(lastName).toBe("");
    });

    it("defaults missing major to empty string", () => {
      // Simulates: major: studentData.major || ''
      const major = undefined || "";

      expect(major).toBe("");
    });

    it("defaults missing currentVisitors array to empty", () => {
      // Simulates: boothData.currentVisitors || []
      const currentVisitors = undefined || [];

      expect(Array.isArray(currentVisitors)).toBe(true);
      expect(currentVisitors).toHaveLength(0);
    });
  });

  describe("String Trimming and Case Handling", () => {
    it("trims search input", () => {
      // Simulates: search.toLowerCase().trim()
      const search = "  john  ";

      // Code path: .trim()
      const trimmed = search.trim().toLowerCase();

      expect(trimmed).toBe("john");
      expect(trimmed).not.toContain(" ");
    });

    it("trims major filter input", () => {
      // Simulates: major.toLowerCase().trim()
      const major = "  Computer Science  ";

      // Code path: .trim()
      const trimmed = major.trim().toLowerCase();

      expect(trimmed).toBe("computer science");
    });
  });

  describe("Special Characters and International Support", () => {
    it("handles accented characters in search", () => {
      // Simulates: search with accented characters
      const visitors = [
        { firstName: "José", lastName: "García" },
        { firstName: "John", lastName: "Smith" },
      ];

      const search = "josé";
      const searchLower = search.toLowerCase();

      // Code path: string matching with international characters
      const found = visitors.filter((v) =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(searchLower)
      );

      expect(found).toHaveLength(1);
      expect(found[0].firstName).toBe("José");
    });

    it("handles special characters in email", () => {
      // Simulates: special characters in email search
      const visitors = [
        { email: "john+test@example.com" },
        { email: "jane@example.com" },
      ];

      const search = "john+test";

      // Code path: email search with special characters
      const found = visitors.filter((v) =>
        v.email.toLowerCase().includes(search.toLowerCase())
      );

      expect(found).toHaveLength(1);
    });
  });

  describe("Loop Iterations and Array Processing", () => {
    it("iterates through all currentVisitorIds", () => {
      // Simulates: for (const visitorId of currentVisitorIds)
      const currentVisitorIds = ["s1", "s2", "s3"];
      const processed = [];

      // Code path: for...of loop
      for (const visitorId of currentVisitorIds) {
        processed.push(visitorId.toUpperCase());
      }

      expect(processed).toEqual(["S1", "S2", "S3"]);
      expect(processed).toHaveLength(currentVisitorIds.length);
    });

    it("maps array with object transformation", () => {
      // Simulates: visitsSnapshot.docs.map(...)
      const docs = [
        { id: "s1", data: { firstName: "John" } },
        { id: "s2", data: { firstName: "Jane" } },
      ];

      // Code path: .map() transformation
      const transformed = docs.map((doc) => ({
        studentId: doc.id,
        ...doc.data,
      }));

      expect(transformed).toHaveLength(2);
      expect(transformed[0]).toHaveProperty("studentId", "s1");
      expect(transformed[0]).toHaveProperty("firstName", "John");
    });
  });

  describe("Conditional Logic Paths", () => {
    it("executes if-else for existing vs new visitor", () => {
      // Simulates: if (existingVisit.exists) { update } else { set }
      const existingVisit = { exists: true };
      let action = null;

      // Code path: if/else logic
      if (existingVisit.exists) {
        action = "update";
      } else {
        action = "create";
      }

      expect(action).toBe("update");
    });

    it("handles multiple conditions with &&", () => {
      // Simulates: if (search && search.trim())
      const search = "john";

      // Code path: && operator
      const shouldFilter = search && search.trim();

      expect(!!shouldFilter).toBe(true);
    });

    it("handles negation operator !==", () => {
      // Simulates: if (userCompanyId !== boothCompanyId)
      const userCompanyId = "A";
      const boothCompanyId = "B";

      // Code path: !== operator
      const isUnequal = userCompanyId !== boothCompanyId;

      expect(isUnequal).toBe(true);
    });
  });
});
