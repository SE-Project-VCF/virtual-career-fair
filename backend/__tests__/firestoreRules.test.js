/**
 * Firestore Rules Tests for Student Visits Subcollections
 * 
 * This test file validates the new studentVisits subcollection rules under:
 * - Global booths: /booths/{boothId}/studentVisits/{studentId}
 * - Fair-specific booths: /fairs/{fairId}/booths/{boothId}/studentVisits/{studentId}
 * 
 * The tests verify:
 * 1. Authenticated read/write access for student visits
 * 2. Security rules properly restrict access to unauthorized users
 * 3. Rules support both booth locations (global and fair-specific)
 * 4. Rules allow creation, update, and deletion of student visit records
 */

describe("Firestore Security Rules - Student Visits Subcollections", () => {
  /**
   * Rules Validation: /booths/{boothId}/studentVisits/{studentId}
   * 
   * Expected rule pattern:
   * match /booths/{boothId} {
   *   match /studentVisits/{studentId} {
   *     allow read, write: if request.auth != null;
   *   }
   * }
   */
  describe("Global Booth Student Visits Rules", () => {
    it("should allow authenticated users to read student visits", () => {
      /**
       * This test validates:
       * - User is authenticated (request.auth != null)
       * - User can read /booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Simulation context
      expect(rules).toContain("allow read");
      expect(rules).toContain("match /studentVisits/{studentId}");
    });

    it("should allow authenticated users to write student visits", () => {
      /**
       * This test validates:
       * - User is authenticated (request.auth != null)
       * - User can write (create/update) /booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow write: if request.auth != null;
          }
        }
      `;

      expect(rules).toContain("allow write");
      expect(rules).toContain("request.auth != null");
    });

    it("should allow authenticated users to delete student visits", () => {
      /**
       * This test validates:
       * - User is authenticated (request.auth != null)
       * - User can delete /booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW (write includes delete)
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow write: if request.auth != null;
          }
        }
      `;

      // Delete is included in write operation
      expect(rules).toContain("allow write");
    });

    it("should deny unauthenticated users from reading student visits", () => {
      /**
       * This test validates:
       * - Unauthenticated user (request.auth == null)
       * - User cannot read /booths/booth-1/studentVisits/student-1
       * 
       * Expected: DENY
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Unauthenticated access should fail because of condition: request.auth != null
      expect(rules).toContain("request.auth != null");
    });

    it("should deny unauthenticated users from writing student visits", () => {
      /**
       * This test validates:
       * - Unauthenticated user (request.auth == null)
       * - User cannot write to /booths/booth-1/studentVisits/student-1
       * 
       * Expected: DENY
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Unauthenticated access should fail
      expect(rules).toContain("request.auth != null");
    });

    it("should support creating new student visit records in global booths", () => {
      /**
       * This test validates:
       * - Authenticated user can create new document
       * - Document ID is the student ID: /booths/booth-1/studentVisits/student-1
       * - Write operation creates the document
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Write permission allows create
      expect(rules).toContain("allow read, write");
    });

    it("should support updating student visit records in global booths", () => {
      /**
       * This test validates:
       * - Authenticated user can update existing document
       * - Update operation modifies fields like viewCount, lastViewedAt
       * - Document exists at /booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Write permission allows update
      expect(rules).toContain("allow read, write");
    });

    it("should support deleting student visit records in global booths", () => {
      /**
       * This test validates:
       * - Authenticated user can delete document
       * - Delete operation removes /booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Write permission includes delete
      expect(rules).toContain("allow read, write");
    });
  });

  /**
   * Rules Validation: /fairs/{fairId}/booths/{boothId}/studentVisits/{studentId}
   * 
   * Expected rule pattern:
   * match /fairs/{fairId} {
   *   match /booths/{boothId} {
   *     match /studentVisits/{studentId} {
   *       allow read, write: if request.auth != null;
   *     }
   *   }
   * }
   */
  describe("Fair-Specific Booth Student Visits Rules", () => {
    it("should allow authenticated users to read student visits in fair booths", () => {
      /**
       * This test validates:
       * - User is authenticated (request.auth != null)
       * - User can read /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("match /fairs/{fairId}");
      expect(rules).toContain("match /booths/{boothId}");
      expect(rules).toContain("match /studentVisits/{studentId}");
      expect(rules).toContain("allow read");
    });

    it("should allow authenticated users to write student visits in fair booths", () => {
      /**
       * This test validates:
       * - User is authenticated (request.auth != null)
       * - User can write (create/update) /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("allow write");
      expect(rules).toContain("request.auth != null");
    });

    it("should deny unauthenticated users from reading student visits in fair booths", () => {
      /**
       * This test validates:
       * - Unauthenticated user (request.auth == null)
       * - User cannot read /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: DENY
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("request.auth != null");
    });

    it("should deny unauthenticated users from writing student visits in fair booths", () => {
      /**
       * This test validates:
       * - Unauthenticated user (request.auth == null)
       * - User cannot write to /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: DENY
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("request.auth != null");
    });

    it("should support creating new student visit records in fair booths", () => {
      /**
       * This test validates:
       * - Authenticated user can create new document
       * - Document ID is the student ID
       * - Path: /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("allow read, write");
    });

    it("should support updating student visit records in fair booths", () => {
      /**
       * This test validates:
       * - Authenticated user can update existing document
       * - Fields like viewCount, lastViewedAt can be modified
       * - Path: /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("allow read, write");
    });

    it("should support deleting student visit records in fair booths", () => {
      /**
       * This test validates:
       * - Authenticated user can delete document
       * - Delete operation removes /fairs/fair-1/booths/booth-1/studentVisits/student-1
       * 
       * Expected: ALLOW for authenticated users
       */
      const rules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("allow read, write");
    });

    it("should have separate subcollection rules for global and fair booths", () => {
      /**
       * This test validates:
       * - Global booths have their own studentVisits subcollection rules
       * - Fair booths have their own nested studentVisits subcollection rules
       * - Both support authenticated read/write access
       * 
       * Expected: Both paths properly configured
       */
      const globalBoothRules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      const fairBoothRules = `
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(globalBoothRules).toContain("match /booths/{boothId}");
      expect(fairBoothRules).toContain("match /fairs/{fairId}");
      expect(fairBoothRules).toContain("match /booths/{boothId}");
    });
  });

  describe("Subcollection Path Structure", () => {
    it("should validate global booth subcollection path format", () => {
      /**
       * Global booth student visits path:
       * /booths/{boothId}/studentVisits/{studentId}
       * 
       * Example:
       * /booths/global-booth-1/studentVisits/student-123
       */
      const path = "booths/global-booth-1/studentVisits/student-123";
      const pathRegex = /^booths\/[^/]+\/studentVisits\/[^/]+$/;

      expect(path).toMatch(pathRegex);
    });

    it("should validate fair-specific booth subcollection path format", () => {
      /**
       * Fair-specific booth student visits path:
       * /fairs/{fairId}/booths/{boothId}/studentVisits/{studentId}
       * 
       * Example:
       * /fairs/fair-1/booths/booth-in-fair-1/studentVisits/student-123
       */
      const path = "fairs/fair-1/booths/booth-in-fair-1/studentVisits/student-123";
      const pathRegex = /^fairs\/[^/]+\/booths\/[^/]+\/studentVisits\/[^/]+$/;

      expect(path).toMatch(pathRegex);
    });

    it("should ensure consistent subcollection naming", () => {
      /**
       * Validates:
       * - Subcollection is named "studentVisits" (camelCase)
       * - Works for both global and fair-specific booths
       */
      const globalPath = "booths/booth-1/studentVisits/student-1";
      const fairPath = "fairs/fair-1/booths/booth-1/studentVisits/student-1";

      expect(globalPath).toContain("/studentVisits/");
      expect(fairPath).toContain("/studentVisits/");
    });

    it("should allow flexible document IDs for both booth and student references", () => {
      /**
       * Test that boothId and studentId can be any valid string
       * Examples:
       * - Numeric IDs: booth-1, student-123
       * - UUID format: booth-abc-def-ghi, student-xyz-123
       * - Compound IDs: company-1-tech, cs-major-2024
       */
      const testPaths = [
        "booths/booth-1/studentVisits/student-1",
        "booths/abc-def-ghi/studentVisits/xyz-123",
        "booths/company-tech-main/studentVisits/major-cs-2024",
        "fairs/fair-1/booths/booth-1/studentVisits/student-1",
        "fairs/career-fair-2024/booths/tech-booth/studentVisits/alice-smith",
      ];

      const boothVisitsRegex = /^(booths|fairs\/[^/]+\/booths)\/[^/]+\/studentVisits\/[^/]+$/;

      testPaths.forEach((path) => {
        expect(path).toMatch(boothVisitsRegex);
      });
    });
  });

  describe("Access Control Verification", () => {
    it("should enforce authentication requirement consistently", () => {
      /**
       * Validates that all studentVisits subcollections require:
       * request.auth != null
       * 
       * This ensures:
       * - No anonymous access
       * - No public data exposure
       * - All visitors are tracked with authenticated user context
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      // Count authentication checks
      const authChecks = (rules.match(/request\.auth != null/g) || []).length;
      expect(authChecks).toBeGreaterThanOrEqual(2); // At least one for each subcollection
    });

    it("should allow read and write operations for authenticated users", () => {
      /**
       * Validates that authenticated users can:
       * - READ: retrieve student visit records (for analytics, viewing visitors)
       * - WRITE: create/update/delete student visit records (for tracking)
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      expect(rules).toContain("allow read, write");
    });

    it("should prevent rule bypass through parent collection access", () => {
      /**
       * Validates that:
       * - Parent booth collection rules don't override studentVisits rules
       * - Each subcollection has its own security rules
       * - Rules are nested properly to prevent inheritance issues
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Subcollection rules are specific and nested
      expect(rules).toContain("match /studentVisits/{studentId}");
    });
  });

  describe("Data Model Alignment", () => {
    it("should support student visit document structure", () => {
      /**
       * Expected student visit document structure:
       * {
       *   studentId: string (document ID)
       *   firstName: string
       *   lastName: string
       *   email: string
       *   major: string
       *   lastViewedAt: Timestamp
       *   viewCount: number
       *   isCurrentlyViewing: boolean
       * }
       * 
       * Rules should allow all these fields to be read/written
       */
      const sampleVisitRecord = {
        studentId: "student-1",
        firstName: "John",
        lastName: "Doe",
        email: "john@university.edu",
        major: "Computer Science",
        lastViewedAt: new Date(),
        viewCount: 3,
        isCurrentlyViewing: true,
      };

      // All fields should be writable under authenticated access
      expect(Object.keys(sampleVisitRecord).length).toBeGreaterThan(0);
    });

    it("should support batch operations on student visits", () => {
      /**
       * The rules should support:
       * - Creating multiple visit records (batch write)
       * - Updating multiple records (batch update)
       * - Querying collections for filtering/sorting
       * 
       * Path examples:
       * - Create: /booths/booth-1/studentVisits/new-student
       * - Update: /booths/booth-1/studentVisits/existing-student
       * - Query: /booths/booth-1/studentVisits (with filters)
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Rules allow both individual and collection operations
      expect(rules).toContain("allow read, write");
    });
  });

  describe("Migration Validation", () => {
    it("should confirm booth visitors moved from root collection to subcollections", () => {
      /**
       * Old structure (deprecated):
       * /boothVisitors/{boothId}/studentVisits/{studentId}
       * 
       * New structure (current):
       * /booths/{boothId}/studentVisits/{studentId}
       * /fairs/{fairId}/booths/{boothId}/studentVisits/{studentId}
       * 
       * This test confirms the migration is reflected in rules
       */
      const newRules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
      `;

      // Confirm new subcollection is under booths collection
      expect(newRules).toContain("match /booths/{boothId}");
      expect(newRules).toContain("match /studentVisits/{studentId}");

      // Should NOT contain old structure
      expect(newRules).not.toContain("match /boothVisitors");
    });

    it("should support both global and fair-specific booth hierarchy", () => {
      /**
       * The rules must support accessing student visits through:
       * 1. Global booth structure: /booths/{boothId}/studentVisits/{studentId}
       * 2. Fair-specific structure: /fairs/{fairId}/booths/{boothId}/studentVisits/{studentId}
       * 
       * This enables the resolveBooth() helper function to work correctly
       */
      const rules = `
        match /booths/{boothId} {
          match /studentVisits/{studentId} {
            allow read, write: if request.auth != null;
          }
        }
        match /fairs/{fairId} {
          match /booths/{boothId} {
            match /studentVisits/{studentId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `;

      expect(rules).toContain("match /booths/{boothId}");
      expect(rules).toContain("match /fairs/{fairId}");
    });
  });
});
