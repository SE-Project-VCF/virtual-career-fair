/**
 * patchValidator.js
 * 
 * Enhanced patch validation with:
 * - Confidence scoring (0-1)
 * - Hallucination detection
 * - Skill validation against job description
 * - Patch conflict detection
 * - Detailed validation flags
 */

class PatchValidator {
  constructor(originalResume, jobDescription = "") {
    this.resume = originalResume;
    this.jobDescription = jobDescription.toLowerCase();
    this.bulletMap = this.buildBulletMap();
    this.summaryText = originalResume?.summary?.text || "";
    this.jobKeywords = this.extractJobKeywords();
  }

  /**
   * Build a map of bulletId -> { text, parentId, parentType }
   */
  buildBulletMap() {
    const map = new Map();
    
    // Experience bullets
    (this.resume.experience || []).forEach((exp, expIdx) => {
      (exp.bullets || []).forEach(bullet => {
        map.set(bullet.bulletId, {
          text: bullet.text,
          parentId: exp.id || `exp_${expIdx}`,
          parentType: "experience",
          parentIndex: expIdx
        });
      });
    });

    // Project bullets
    (this.resume.projects || []).forEach((proj, projIdx) => {
      (proj.bullets || []).forEach(bullet => {
        map.set(bullet.bulletId, {
          text: bullet.text,
          parentId: proj.id || `proj_${projIdx}`,
          parentType: "projects",
          parentIndex: projIdx
        });
      });
    });

    return map;
  }

  /**
   * Extract keywords from job description (3+ chars)
   */
  extractJobKeywords() {
    return new Set(
      this.jobDescription
        .split(/\s+/)
        .filter(w => w.length > 3)
        .map(w => w.replace(/[^a-z0-9]/g, ""))
        .filter(Boolean)
    );
  }

  /**
   * Main validation entry point
   * Returns: { valid, patches, issues, summary }
   */
  validatePatches(patches) {
    if (!Array.isArray(patches)) {
      return {
        valid: false,
        patches: [],
        issues: [{ level: "error", message: "Patches is not an array" }],
        summary: null
      };
    }

    const validatedPatches = [];
    const issues = [];
    let totalConfidence = 0;

    // Validate each patch
    for (const patch of patches) {
      const result = this.validatePatch(patch);
      
      if (result.valid) {
        validatedPatches.push({
          ...patch,
          confidence: result.confidence,
          concerns: result.concerns
        });
        totalConfidence += result.confidence;
      }

      // Collect all issues
      result.issues.forEach(issue => {
        issues.push({
          ...issue,
          opId: patch.opId
        });
      });
    }

    // Check for conflicting patches (same target)
    const conflictIssues = this.detectPatchConflicts(validatedPatches);
    issues.push(...conflictIssues);

    const avgConfidence = validatedPatches.length > 0 
      ? totalConfidence / validatedPatches.length 
      : 0;

    return {
      valid: validatedPatches.length > 0 && issues.filter(i => i.level === "error").length === 0,
      patches: validatedPatches,
      issues,
      summary: {
        totalPatches: patches.length,
        validPatches: validatedPatches.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        errorCount: issues.filter(i => i.level === "error").length,
        warningCount: issues.filter(i => i.level === "warning").length,
        flagCount: issues.filter(i => i.level === "flag").length
      }
    };
  }

  /**
   * Validate a single patch with detailed confidence scoring
   */
  validatePatch(patch) {
    const issues = [];
    const concerns = [];
    let confidence = 1.0;

    // 1. Basic structure validation
    if (!patch.opId || !patch.type || !patch.target) {
      issues.push({
        level: "error",
        message: "Patch missing opId, type, or target"
      });
      return { valid: false, confidence: 0, issues, concerns };
    }

    if (!["replace_summary", "replace_bullet", "insert_bullet", "remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
      issues.push({
        level: "error",
        message: `Unknown patch type: ${patch.type}`
      });
      return { valid: false, confidence: 0, issues, concerns };
    }

    // Removal patches don't require afterText
    if (!["remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
      if (typeof patch.afterText !== "string" || patch.afterText.length === 0) {
        issues.push({
          level: "error",
          message: "afterText must be non-empty string"
        });
        return { valid: false, confidence: 0, issues, concerns };
      }
    }

    // 2. Type-specific validation
    const typeValidation = this.validateByType(patch);
    if (!typeValidation.valid) {
      issues.push(...typeValidation.issues);
      return { valid: false, confidence: 0, issues, concerns };
    }
    confidence *= typeValidation.confidence;

    // 3. Hallucination detection
    const hallucination = this.detectHallucinations(patch);
    if (hallucination.detected) {
      issues.push({
        level: hallucination.severity,
        message: hallucination.message,
        details: hallucination.details
      });
      confidence *= hallucination.confidence;

      if (hallucination.severity === "error") {
        return { valid: false, confidence, issues, concerns };
      }
    }

    // 4. Skill alignment check
    if (this.jobDescription) {
      const skillCheck = this.validateSkillAlignment(patch);
      if (skillCheck.concerns) {
        concerns.push(...skillCheck.concerns);
      }
      confidence *= skillCheck.confidence;
    }

    // 5. Length sanity check (only for replace/insert patches)
    const beforeText = patch.beforeText || "";
    const afterText = patch.afterText || "";
    
    if (!["remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
      if (afterText.length > beforeText.length * 2) {
        concerns.push({
          type: "length",
          message: `afterText is ${Math.round((afterText.length / beforeText.length - 1) * 100)}% longer than beforeText`,
          severity: "warning"
        });
        confidence *= 0.9;
      }

      if (afterText.length < beforeText.length * 0.5 && patch.type === "replace_bullet") {
        concerns.push({
          type: "truncation",
          message: "Replacement significantly shorter than original",
          severity: "flag"
        });
        confidence *= 0.85;
      }
    }

    return {
      valid: issues.filter(i => i.level === "error").length === 0,
      confidence: Math.max(0, Math.min(1, confidence)),
      issues,
      concerns
    };
  }

  /**
   * Type-specific validation
   */
  validateByType(patch) {
    const issues = [];
    let confidence = 1.0;

    if (patch.type === "replace_summary") {
      if (patch.beforeText !== this.summaryText) {
        issues.push({
          level: "error",
          message: "beforeText does not match original summary"
        });
        return { valid: false, confidence: 0, issues };
      }
    } else if (patch.type === "replace_bullet") {
      if (!patch.target.bulletId) {
        issues.push({
          level: "error",
          message: "replace_bullet patch missing target.bulletId"
        });
        return { valid: false, confidence: 0, issues };
      }

      const bulletInfo = this.bulletMap.get(patch.target.bulletId);
      if (!bulletInfo) {
        issues.push({
          level: "error",
          message: `Bullet not found: ${patch.target.bulletId}`
        });
        return { valid: false, confidence: 0, issues };
      }

      if (patch.beforeText !== bulletInfo.text) {
        issues.push({
          level: "error",
          message: `beforeText does not match bullet ${patch.target.bulletId}`
        });
        return { valid: false, confidence: 0, issues };
      }
    } else if (patch.type === "insert_bullet") {
      if (!patch.target.parentId) {
        issues.push({
          level: "error",
          message: "insert_bullet patch missing target.parentId (exp/proj id)"
        });
        return { valid: false, confidence: 0, issues };
      }

      // For new bullets, we're more conservative
      confidence *= 0.8;
    } else if (patch.type === "remove_skill") {
      // Removal patches just need target.skillName or target.section
      if (!patch.target || !patch.target.skillName) {
        issues.push({
          level: "error",
          message: "remove_skill patch missing target.skillName"
        });
        return { valid: false, confidence: 0, issues };
      }
      // Verify skill exists in resume
      const skillExists = this.resume?.skills?.items?.some(
        s => s.toLowerCase() === patch.target.skillName.toLowerCase()
      );
      if (!skillExists) {
        issues.push({
          level: "warning",
          message: `Skill "${patch.target.skillName}" not found in resume skills`
        });
        confidence *= 0.7;
      }
    } else if (patch.type === "remove_bullet") {
      // Similar to replace_bullet, but confirms the bullet exists
      if (!patch.target.bulletId) {
        issues.push({
          level: "error",
          message: "remove_bullet patch missing target.bulletId"
        });
        return { valid: false, confidence: 0, issues };
      }

      const bulletInfo = this.bulletMap.get(patch.target.bulletId);
      if (!bulletInfo) {
        issues.push({
          level: "warning",
          message: `Bullet not found: ${patch.target.bulletId}`
        });
        confidence *= 0.7;
      }
    } else if (patch.type === "suppress_section") {
      // Suppressing entire section (experience entry or project)
      if (!patch.target || !patch.target.parentId) {
        issues.push({
          level: "error",
          message: "suppress_section patch missing target.parentId"
        });
        return { valid: false, confidence: 0, issues };
      }
    }

    return { valid: true, confidence, issues };
  }

  /**
   * Detect hallucinated metrics/facts
   */
  detectHallucinations(patch) {
    // Skip hallucination check for removal patches (they don't have afterText)
    if (["remove_skill", "remove_bullet", "suppress_section"].includes(patch.type)) {
      return { detected: false, severity: null, confidence: 1.0 };
    }

    const beforeText = patch.beforeText || "";
    const afterText = patch.afterText || "";

    // Only check replace operations
    if (patch.type === "insert_bullet") {
      // For inserted bullets, we're more cautious
      const newNumbers = this.extractMetrics(afterText);
      if (newNumbers.length > 0) {
        return {
          detected: true,
          severity: "flag",
          confidence: 0.7,
          message: "Inserted bullet contains metrics that can't be verified",
          details: newNumbers
        };
      }
      return { detected: false, severity: null, confidence: 1.0 };
    }

    // For replace operations
    const beforeMetrics = new Set(this.extractMetrics(beforeText));
    const afterMetrics = this.extractMetrics(afterText);

    const newMetrics = afterMetrics.filter(m => !beforeMetrics.has(m));

    if (newMetrics.length > 0) {
      return {
        detected: true,
        severity: "error",
        confidence: 0.3,
        message: `Introduces new metrics/numbers not in original: ${newMetrics.join(", ")}`,
        details: newMetrics
      };
    }

    return { detected: false, severity: null, confidence: 1.0 };
  }

  /**
   * Extract metrics from text: numbers, percentages, years, ranges
   */
  extractMetrics(text) {
    const patterns = [
      /\d{4}(?:-\d{4})?/g,      // Years: 2022, 2022-2023
      /\d+(?:\.\d+)?%/g,        // Percentages: 50%, 99.9%
      /\$\d+(?:K|M)?/g,         // Money: $10K, $5M
      /\d+\+(?:\s*users?|views?)/gi, // Usage counts: 10K+ users
      /\b(?:first|second|top)\s+\d+/gi, // Ordinals: top 10
      /v?\d+\.\d+(?:\.\d+)?/g   // Versions: v3.2.1
    ];

    const matches = new Set();
    patterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) found.forEach(m => matches.add(m));
    });

    return Array.from(matches);
  }

  /**
   * Validate skill alignment with job description
   */
  validateSkillAlignment(patch) {
    let concerns = [];
    let confidence = 1.0;

    // Extract new tokens introduced
    const beforeTokens = new Set(this.tokenize(patch.beforeText || ""));
    const afterTokens = this.tokenize(patch.afterText || "");

    const newTokens = afterTokens
      .filter(t => !beforeTokens.has(t))
      .filter(t => t.length >= 3);

    // Check if new tokens align with job
    const suspiciousTokens = newTokens.filter(t => {
      // Common generic words to ignore
      const generic = ["and", "the", "with", "for", "to", "from", "using", "built", 
                       "created", "worked", "led", "was", "were", "can", "able"];
      if (generic.includes(t)) return false;

      // Check if in job keywords
      if (this.jobKeywords.has(t)) return false;

      return true;
    });

    if (suspiciousTokens.length > 0) {
      concerns.push({
        type: "skill_alignment",
        message: `New terms not found in job description: ${suspiciousTokens.slice(0, 3).join(", ")}`,
        severity: "flag",
        tokens: suspiciousTokens.slice(0, 5)
      });
      confidence *= 0.75;
    }

    return { concerns, confidence };
  }

  /**
   * Simple tokenizer
   */
  tokenize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+.#%/\-\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Detect conflicting patches (multiple patches on same target)
   */
  detectPatchConflicts(patches) {
    const issues = [];
    const targetMap = new Map();

    patches.forEach(patch => {
      let key;
      if (patch.type === "replace_summary") {
        key = "summary";
      } else if (patch.type === "replace_bullet") {
        key = `bullet:${patch.target.bulletId}`;
      } else if (patch.type === "insert_bullet") {
        key = `insert:${patch.target.parentId}`;
      } else if (patch.type === "remove_skill") {
        key = `remove_skill:${patch.target.skillName}`;
      } else if (patch.type === "remove_bullet") {
        key = `remove_bullet:${patch.target.bulletId}`;
      } else if (patch.type === "suppress_section") {
        key = `suppress_section:${patch.target.parentId}`;
      }

      if (!targetMap.has(key)) {
        targetMap.set(key, []);
      }
      targetMap.get(key).push(patch);
    });

    // Check for multiple patches on same target
    targetMap.forEach((patchList, target) => {
      if (patchList.length > 1) {
        issues.push({
          level: "warning",
          message: `Multiple patches target the same ${target} - may cause conflicts`,
          affectedPatches: patchList.map(p => p.opId)
        });
      }
    });

    return issues;
  }
}

module.exports = PatchValidator;
