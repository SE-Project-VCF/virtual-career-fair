/**
 * __tests__/patchValidator.test.js
 * 
 * Tests for the PatchValidator class
 */

const PatchValidator = require("../patchValidator");

describe("PatchValidator", () => {
  const mockResume = {
    summary: {
      text: "Experienced full-stack developer with 5 years of experience in web development."
    },
    skills: {
      items: ["JavaScript", "React", "Node.js", "Python", "SQL"]
    },
    experience: [
      {
        id: "exp_0",
        title: "Senior Developer",
        company: "TechCorp",
        bullets: [
          {
            bulletId: "bullet_1",
            text: "Built web applications using React and Node.js"
          },
          {
            bulletId: "bullet_2",
            text: "Led team of 5 engineers to deliver projects on time"
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
            text: "Developed full-stack e-commerce solution with payment integration"
          }
        ]
      }
    ]
  };

  const jobDescription = `
    We are looking for a React developer with experience in building scalable web applications.
    Must have experience with: React, JavaScript, REST APIs, PostgreSQL
    Prefer: TypeScript, Node.js, AWS
  `;

  let validator;

  beforeEach(() => {
    validator = new PatchValidator(mockResume, jobDescription);
  });

  test("should initialize validator with resume and job description", () => {
    expect(validator.resume).toEqual(mockResume);
    expect(validator.jobKeywords.has("react")).toBe(true);
    expect(validator.jobKeywords.has("scalable")).toBe(true);
  });

  test("should build bullet map correctly", () => {
    expect(validator.bulletMap.has("bullet_1")).toBe(true);
    expect(validator.bulletMap.get("bullet_1").text).toBe("Built web applications using React and Node.js");
    expect(validator.bulletMap.get("bullet_1").parentType).toBe("experience");
  });

  test("should validate a good replace_bullet patch", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: {
          bulletId: "bullet_1",
          section: "experience"
        },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built scalable React web applications with Node.js backend APIs",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    
    expect(result.valid).toBe(true);
    expect(result.patches.length).toBe(1);
    expect(result.patches[0].confidence).toBeGreaterThan(0.8);
  });

  test("should reject patch with wrong beforeText", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: {
          bulletId: "bullet_1",
          section: "experience"
        },
        beforeText: "Wrong text that doesn't match",
        afterText: "New text",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.level === "error")).toBe(true);
  });

  test("should detect hallucinated metrics", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: {
          bulletId: "bullet_2",
          section: "experience"
        },
        beforeText: "Led team of 5 engineers to deliver projects on time",
        afterText: "Led team of 5 engineers to deliver 50+ projects on time with 99% on-time delivery",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.message.includes("metric"))).toBe(true);
  });

  test("should flag uncertain skill additions", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: {
          bulletId: "bullet_1",
          section: "experience"
        },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built web applications using React, Node.js, and Kubernetes",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    // Should still be valid but have concerns
    expect(result.issues.some(i => i.message.includes("Kubernetes"))).toBe(true);
  });

  test("should detect conflicting patches", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built web applications using React and Node.js (version 1)",
        confidence: 0.95
      },
      {
        opId: "patch_2",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built web applications using React and Node.js (version 2)",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.issues.some(i => i.message.includes("Multiple patches"))).toBe(true);
  });

  test("should provide confidence summary", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_bullet",
        target: { bulletId: "bullet_1" },
        beforeText: "Built web applications using React and Node.js",
        afterText: "Built scalable React web applications with Node.js backends",
        confidence: 0.95
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.summary).toHaveProperty("averageConfidence");
    expect(result.summary.validPatches).toBe(1);
  });

  test("should validate insert_bullet patches", () => {
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
        afterText: "Implemented REST APIs using Node.js and PostgreSQL",
        confidence: 0.85
      }
    ];

    const result = validator.validatePatches(patches);
    // Insert bullets are more conservative
    expect(result.valid).toBe(true);
  });

  test("should validate replace_summary patches", () => {
    const patches = [
      {
        opId: "patch_1",
        type: "replace_summary",
        target: { section: "summary" },
        beforeText: "Experienced full-stack developer with 5 years of experience in web development.",
        afterText: "Experienced React and Node.js developer with 5 years of expertise building scalable web applications and REST APIs.",
        confidence: 0.9
      }
    ];

    const result = validator.validatePatches(patches);
    expect(result.valid).toBe(true);
    expect(result.patches[0].type).toBe("replace_summary");
  });
});
