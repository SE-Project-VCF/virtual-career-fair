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
    skills: {
      items: ["JavaScript", "React", "Node.js", "Python"]
    },
    experience: [
      {
        id: "exp_0",
        expId: "exp_0",
        title: "Senior Developer",
        company: "TechCorp",
        bullets: [
          { bulletId: "bullet_1", text: "Built web applications using React" },
          { bulletId: "bullet_2", text: "Led team of 5 engineers" }
        ]
      },
      {
        id: "exp_1",
        expId: "exp_1",
        title: "Junior Developer",
        company: "StartupCo",
        bullets: [
          { bulletId: "bullet_3", text: "Wrote unit tests" }
        ]
      }
    ],
    projects: [
      {
        id: "proj_0",
        projId: "proj_0",
        title: "E-commerce Platform",
        name: "E-commerce Platform",
        bullets: [
          { bulletId: "bullet_p1", text: "Developed e-commerce solution" }
        ]
      }
    ]
  };

  // --- applyPatches ---

  test("should apply replace_summary patch", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_summary",
      beforeText: "Full-stack developer with 5 years of experience",
      afterText: "Full-stack React developer with 5 years of experience building scalable web applications"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.summary.text).toBe(
      "Full-stack React developer with 5 years of experience building scalable web applications"
    );
    expect(result.tailoredResume.summary.appliedPatches).toContain("patch_1");
  });

  test("should return error when acceptedPatches is not an array", () => {
    const result = PatchApplier.applyPatches(mockResume, "not an array");
    expect(result.success).toBe(false);
    expect(result.tailoredResume).toBeNull();
    expect(result.errors).toContain("acceptedPatches must be an array");
  });

  test("should apply replace_bullet patch", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_1" },
      beforeText: "Built web applications using React",
      afterText: "Built scalable web applications using React and Node.js backend"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.experience[0].bullets[0].text).toBe(
      "Built scalable web applications using React and Node.js backend"
    );
    expect(result.tailoredResume.experience[0].bullets[0].appliedPatches).toContain("patch_1");
  });

  test("should replace bullet in projects section", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "bullet_p1", section: "projects" },
      beforeText: "Developed e-commerce solution",
      afterText: "Developed scalable e-commerce solution"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects[0].bullets[0].text).toBe("Developed scalable e-commerce solution");
  });

  test("should fail replace_bullet when bulletId is missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: {},
      beforeText: "text",
      afterText: "new text"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("bulletId is missing");
  });

  test("should apply insert_bullet patch", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "exp_0", section: "experience", afterBulletId: "bullet_2" },
      beforeText: "",
      afterText: "Implemented REST APIs using Node.js"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.tailoredResume.experience[0].bullets.length).toBe(3);
    expect(result.tailoredResume.experience[0].bullets[2].text).toBe("Implemented REST APIs using Node.js");
  });

  test("should insert bullet without afterBulletId (append)", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "exp_0", section: "experience" },
      afterText: "Appended bullet"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience[0].bullets.at(-1).text).toBe("Appended bullet");
  });

  test("should insert bullet by title match", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "E-commerce Platform", section: "projects" },
      afterText: "Added payment integration"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects[0].bullets.length).toBe(2);
  });

  test("should fail insert_bullet when parentId is missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { section: "experience" },
      afterText: "New bullet"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("parentId and target.section are required");
  });

  test("should fail insert_bullet when section is missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "exp_0" },
      afterText: "New bullet"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
  });

  test("should fail insert_bullet when parent not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "nonexistent", section: "experience" },
      afterText: "New bullet"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Parent section not found");
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
    const patches = [{
      opId: "patch_1",
      type: "replace_summary",
      beforeText: "Full-stack developer with 5 years of experience",
      afterText: "Modified summary"
    }];

    const originalSummary = mockResume.summary.text;
    PatchApplier.applyPatches(mockResume, patches);

    expect(mockResume.summary.text).toBe(originalSummary);
  });

  test("should fail if beforeText doesn't match summary", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_summary",
      beforeText: "Wrong text",
      afterText: "New text"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("beforeText does not match");
  });

  test("should fail replace_summary when no summary section", () => {
    const noSummaryResume = { experience: [], projects: [] };
    const patches = [{
      opId: "patch_1",
      type: "replace_summary",
      beforeText: "text",
      afterText: "new text"
    }];

    const result = PatchApplier.applyPatches(noSummaryResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("no summary section");
  });

  test("should fail if bullet not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "replace_bullet",
      target: { bulletId: "nonexistent_id" },
      beforeText: "Some text",
      afterText: "New text"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.appliedCount).toBe(0);
  });

  test("should handle invalid patch type gracefully", () => {
    const patches = [{
      opId: "patch_1",
      type: "invalid_type",
      beforeText: "Some text",
      afterText: "New text"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.appliedCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // --- remove_bullet ---

  test("should remove bullet by bulletId", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "bullet_2", section: "experience" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience[0].bullets.length).toBe(1);
    expect(result.tailoredResume.experience[0].bullets[0].bulletId).toBe("bullet_1");
  });

  test("should remove bullet by removedText fallback", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "wrong_id", section: "experience", removedText: "Led team" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience[0].bullets.length).toBe(1);
  });

  test("should fail remove_bullet when neither bulletId nor removedText provided", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { section: "experience" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("bulletId or removedText is required");
  });

  test("should succeed for remove_bullet from non-parsed section (education)", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "edu_1", section: "education" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
  });

  test("should fail remove_bullet when bullet not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "nonexistent", section: "experience" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
  });

  test("should remove bullet from projects", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "bullet_p1", section: "projects" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects[0].bullets.length).toBe(0);
  });

  // --- remove_skill ---

  test("should remove skill by exact match", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "Python" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.skills.items).not.toContain("Python");
    expect(result.tailoredResume.skills.items.length).toBe(3);
  });

  test("should remove skill case-insensitively", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "python" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.skills.items.length).toBe(3);
  });

  test("should fail remove_skill when skillName missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: {}
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("skillName is missing");
  });

  test("should fail remove_skill when no skills section", () => {
    const noSkillsResume = { summary: { text: "test" }, experience: [], projects: [] };
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "Python" }
    }];

    const result = PatchApplier.applyPatches(noSkillsResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No skills section");
  });

  test("should fail remove_skill when skill not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "Haskell" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Skill not found");
  });

  test("should remove skill by partial match", () => {
    const resumeWithLongSkills = {
      ...mockResume,
      skills: { items: ["JavaScript ES6+", "React Framework", "Node.js Runtime"] }
    };
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "React Framework" }
    }];

    const result = PatchApplier.applyPatches(resumeWithLongSkills, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.skills.items.length).toBe(2);
  });

  // --- suppress_section ---

  test("should suppress entire experience section", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "experience" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience).toEqual([]);
  });

  test("should suppress entire projects section", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "projects" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects).toEqual([]);
  });

  test("should suppress entire skills section", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "skills" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.skills.items).toEqual([]);
  });

  test("should fail suppress_section for unknown section", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "hobbies" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Unknown section to suppress");
  });

  test("should fail suppress_section when section is missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: {}
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("section is missing");
  });

  test("should suppress a single experience entry by parentId", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "experience", parentId: "exp_1" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience.length).toBe(1);
    expect(result.tailoredResume.experience[0].id).toBe("exp_0");
  });

  test("should suppress a single project by parentId", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "projects", parentId: "proj_0" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects.length).toBe(0);
  });

  test("should fail suppress subsection when experience entry not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "experience", parentId: "nonexistent" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Experience entry not found");
  });

  test("should fail suppress subsection when project not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "projects", parentId: "nonexistent" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Project not found");
  });

  test("should fail suppress subsection of unknown section type", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "hobbies", parentId: "hobby_1" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Cannot suppress subsection of");
  });

  // --- condense_bullet ---

  test("should condense bullet in experience", () => {
    const patches = [{
      opId: "patch_1",
      type: "condense_bullet",
      target: { bulletId: "bullet_1", section: "experience" },
      afterText: "Built React apps"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience[0].bullets[0].text).toBe("Built React apps");
    expect(result.tailoredResume.experience[0].bullets[0].appliedPatches).toContain("patch_1");
  });

  test("should condense bullet in projects", () => {
    const patches = [{
      opId: "patch_1",
      type: "condense_bullet",
      target: { bulletId: "bullet_p1", section: "projects" },
      afterText: "E-commerce solution"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects[0].bullets[0].text).toBe("E-commerce solution");
  });

  test("should fail condense_bullet when bulletId missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "condense_bullet",
      target: { section: "experience" },
      afterText: "Condensed text"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("bulletId and afterText");
  });

  test("should fail condense_bullet when afterText missing", () => {
    const patches = [{
      opId: "patch_1",
      type: "condense_bullet",
      target: { bulletId: "bullet_1", section: "experience" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
  });

  test("should fail condense_bullet when bullet not found", () => {
    const patches = [{
      opId: "patch_1",
      type: "condense_bullet",
      target: { bulletId: "nonexistent", section: "experience" },
      afterText: "Condensed"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Bullet not found");
  });

  // --- _findExperienceIdx ---

  test("should find experience by text match when id doesn't match", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "experience", parentId: "no_match", removedText: "Senior Developer" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience.length).toBe(1);
  });

  test("should find experience by keyword match", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "experience", parentId: "Senior Developer TechCorp" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience.length).toBe(1);
  });

  // --- _findProjectIdx by name ---

  test("should find project by name text match", () => {
    const patches = [{
      opId: "patch_1",
      type: "suppress_section",
      target: { section: "projects", parentId: "no_match", removedText: "e-commerce" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects.length).toBe(0);
  });

  // --- _getSkillText with object skills ---

  test("should handle object skills with name property", () => {
    const resumeWithObjSkills = {
      ...mockResume,
      skills: { items: [{ name: "JavaScript" }, { name: "Python" }] }
    };
    const patches = [{
      opId: "patch_1",
      type: "remove_skill",
      target: { skillName: "Python" }
    }];

    const result = PatchApplier.applyPatches(resumeWithObjSkills, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.skills.items.length).toBe(1);
  });

  // --- summarizePatches ---

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

  test("should show no modifications when resumes are identical", () => {
    const summary = PatchApplier.summarizePatches(mockResume, mockResume, []);
    expect(summary.totalPatches).toBe(0);
    expect(summary.changes.summaryModified).toBe(false);
    expect(summary.changes.experienceModified).toBe(false);
    expect(summary.changes.projectsModified).toBe(false);
    expect(summary.changes.skillsModified).toBe(false);
  });

  // --- _insertBulletAtPosition with non-existent afterBulletId ---

  test("should append bullet when afterBulletId does not exist in entry", () => {
    const patches = [{
      opId: "patch_1",
      type: "insert_bullet",
      target: { parentId: "exp_0", section: "experience", afterBulletId: "nonexistent" },
      afterText: "New bullet at end"
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.experience[0].bullets.at(-1).text).toBe("New bullet at end");
  });

  // --- remove_bullet without section filter (search all) ---

  test("should remove bullet without section filter", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "bullet_p1" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
    expect(result.tailoredResume.projects[0].bullets.length).toBe(0);
  });

  // --- leadership_activities section passes through ---

  test("should succeed for remove_bullet from leadership_activities section", () => {
    const patches = [{
      opId: "patch_1",
      type: "remove_bullet",
      target: { bulletId: "la_1", section: "leadership_activities" }
    }];

    const result = PatchApplier.applyPatches(mockResume, patches);
    expect(result.success).toBe(true);
  });
});
