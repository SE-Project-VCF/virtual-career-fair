/**
 * __tests__/patchApplier.test.js
 * 
 * Tests for the PatchApplier class
 */

const PatchApplier = require("../patchApplier");

describe("PatchApplier", () => {
  const mockResume = {
    summary: {
      text: "Full-stack developer with 5 years of experience"
    },
    experience: [
      {
        id: "exp_0",
        title: "Senior Developer",
        company: "TechCorp",
        bullets: [
          {
            bulletId: "bullet_1",
            text: "Built web applications using React"
          },
          {
            bulletId: "bullet_2",
            text: "Led team of 5 engineers"
          }
        ]
      }
    ],
    projects: [
      {
        id: "proj_0",
        title: "E-commerce Platform",
        bullets: [
          {
            bulletId: "bullet_p1",
            text: "Developed e-commerce solution"
          }
        ]
      }
    ]
  };

  test("should apply replace_summary patch", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_summary",
        beforeText: "Full-stack developer with 5 years of experience",
        afterText: "Full-stack React developer with 5 years of experience building scalable web applications"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.summary.text).toBe(
      "Full-stack React developer with 5 years of experience building scalable web applications"
    );
    expect(result.tailoredResume.summary.appliedPatches).toContain("patch_1");
  });

  test("should apply replace_bullet patch", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React",
        afterText: "Built scalable web applications using React and Node.js backend"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.experience[0].bullets[0].text).toBe(
      "Built scalable web applications using React and Node.js backend"
    );
    expect(result.tailoredResume.experience[0].bullets[0].appliedPatches).toContain("patch_1");
  });

  test("should apply insert_bullet patch", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "insert_bullet",
        target: {
          parentId: "exp_0",
          section: "experience",
          afterBulletId: "bullet_2"
        },
        beforeText: "",
        afterText: "Implemented REST APIs using Node.js"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.experience[0].bullets.length).toBe(3);
    expect(result.tailoredResume.experience[0].bullets[2].text).toBe("Implemented REST APIs using Node.js");
  });

  test("should apply multiple patches in order", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_summary",
        beforeText: "Full-stack developer with 5 years of experience",
        afterText: "Full-stack React developer with 5 years of experience"
      },
      {
        opId: "patch_2",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React",
        afterText: "Built scalable web applications using React"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(2);
    expect(result.tailoredResume.summary.appliedPatches).toContain("patch_1");
    expect(result.tailoredResume.experience[0].bullets[0].appliedPatches).toContain("patch_2");
  });

  test("should not mutate original resume", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_summary",
        beforeText: "Full-stack developer with 5 years of experience",
        afterText: "Modified summary"
      }
    ];

    const originalSummary = mockResume.summary.text;
    PatchApplier.applyPatches(mockResume, patches);

    expect(mockResume.summary.text).toBe(originalSummary);
  });

  test("should fail if beforeText doesn't match", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Wrong text",
        afterText: "New text"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.appliedCount).toBe(0);
  });

  test("should fail if bullet not found", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "nonexistent_id" },
        beforeText: "Some text",
        afterText: "New text"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(false);
    expect(result.appliedCount).toBe(0);
  });

  test("should handle invalid patch type gracefully", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "invalid_type",
        beforeText: "Some text",
        afterText: "New text"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.appliedCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("should generate summary of patches", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_summary",
        beforeText: "Full-stack developer with 5 years of experience",
        afterText: "Full-stack React developer"
      },
      {
        opId: "patch_2",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React",
        afterText: "Built scalable web applications using React"
      }
    ];

    const result = PatchApplier.applyPatches(mockResume, patches);
    const summary = PatchApplier.summarizePatches(mockResume, result.tailoredResume, patches);

    expect(summary.totalPatches).toBe(2);
    expect(summary.patchsByType.replace_summary).toBe(1);
    expect(summary.patchsByType.replace_bullet).toBe(1);
    expect(summary.changes.summaryModified).toBe(true);
  });
});
