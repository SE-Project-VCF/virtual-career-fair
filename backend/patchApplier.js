/**
 * patchApplier.js
 * 
 * Applies accepted patches to a structured resume to create a tailored version.
 * Preserves original resume, creates new structured resume with applied patches.
 */

class PatchApplier {
  /**
   * Apply patches to a structured resume
   * @param {Object} originalResume - Original structured resume
   * @param {Array} acceptedPatches - Patches to apply (with opId, type, target, beforeText, afterText)
   * @returns {Object} { success, tailoredResume, appliedCount, errors }
   */
  static applyPatches(originalResume, acceptedPatches) {
    const errors = [];
    
    // Deep copy to avoid mutating original
    let tailoredResume = structuredClone(originalResume);
    let appliedCount = 0;

    if (!Array.isArray(acceptedPatches)) {
      return {
        success: false,
        tailoredResume: null,
        appliedCount: 0,
        errors: ["acceptedPatches must be an array"]
      };
    }

    // Apply patches in order - LENIENT MODE: skip if item not found instead of failing
    for (const patch of acceptedPatches) {
      const result = this.applyPatch(tailoredResume, patch);
      
      if (result.success) {
        appliedCount++;
        tailoredResume = result.resume;
      } else {
        console.log(`[PatchApplier] Skipping patch ${patch.opId}: ${result.error}`);
        errors.push(`Patch ${patch.opId}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      tailoredResume,
      appliedCount,
      errors
    };
  }

  /**
   * Apply a single patch to the resume
   */
  static applyPatch(resume, patch) {
    try {
      const { type, target, beforeText, afterText, opId } = patch;

      if (type === "replace_summary") {
        return this.patchReplaceSummary(resume, beforeText, afterText, opId);
      } else if (type === "replace_bullet") {
        return this.patchReplaceBullet(resume, target, beforeText, afterText, opId);
      } else if (type === "insert_bullet") {
        return this.patchInsertBullet(resume, target, afterText, opId);
      } else if (type === "remove_bullet") {
        return this.patchRemoveBullet(resume, target, opId);
      } else if (type === "remove_skill") {
        console.log(`[PatchApplier] Applying remove_skill patch:`, { opId, skillName: target.skillName });
        const result = this.patchRemoveSkill(resume, target, opId);
        console.log(`[PatchApplier] Result:`, { success: result.success, error: result.error });
        return result;
      } else if (type === "suppress_section") {
        console.log(`[PatchApplier] Applying suppress_section patch:`, { opId, section: target.section, parentId: target.parentId });
        const result = this.patchSuppressSection(resume, target, opId);
        console.log(`[PatchApplier] Result:`, { success: result.success, error: result.error });
        return result;
      } else if (type === "condense_bullet") {
        return this.patchCondenseBullet(resume, target, afterText, opId);
      } else {
        return {
          success: false,
          resume,
          error: `Unknown patch type: ${type}`
        };
      }
    } catch (err) {
      console.log(`[PatchApplier] Exception in applyPatch:`, err.message);
      return {
        success: false,
        resume,
        error: `Failed to apply patch: ${err.message}`
      };
    }
  }

  /**
   * Replace summary
   */
  static patchReplaceSummary(resume, beforeText, afterText, opId) {
    if (!resume.summary) {
      return {
        success: false,
        resume,
        error: "Resume has no summary section"
      };
    }

    if (resume.summary.text !== beforeText) {
      return {
        success: false,
        resume,
        error: "beforeText does not match current summary"
      };
    }

    const updated = structuredClone(resume);
    updated.summary.text = afterText;
    
    // Track patch if not already tracking
    if (!updated.summary.appliedPatches) {
      updated.summary.appliedPatches = [];
    }
    updated.summary.appliedPatches.push(opId);

    return {
      success: true,
      resume: updated,
      error: null
    };
  }

  /**
   * Find a bullet by ID across section entries (experience or projects)
   * @returns {{ bullet: Object, entryIdx: number, bulletIdx: number }|null}
   */
  static _findBulletById(entries, bulletId) {
    for (let i = 0; i < entries.length; i++) {
      const bullets = entries[i].bullets || [];
      for (let j = 0; j < bullets.length; j++) {
        if (bullets[j].bulletId === bulletId) {
          return { bullet: bullets[j], entryIdx: i, bulletIdx: j };
        }
      }
    }
    return null;
  }

  /**
   * Search for a bullet across experience and/or projects based on section filter
   * @returns {{ bullet: Object }|null}
   */
  static _findBulletAcrossSections(resume, bulletId, section) {
    if (!section || section === "experience") {
      const result = this._findBulletById(resume.experience || [], bulletId);
      if (result) return result;
    }
    if (!section || section === "projects") {
      const result = this._findBulletById(resume.projects || [], bulletId);
      if (result) return result;
    }
    return null;
  }

  /**
   * Insert a bullet into an entry's bullet list at the specified position
   */
  static _insertBulletAtPosition(entry, newBullet, afterBulletId) {
    if (afterBulletId) {
      const idx = (entry.bullets || []).findIndex(b => b.bulletId === afterBulletId);
      if (idx === -1) {
        entry.bullets.push(newBullet);
      } else {
        entry.bullets.splice(idx + 1, 0, newBullet);
      }
    } else {
      entry.bullets ??= [];
      entry.bullets.push(newBullet);
    }
  }

  /**
   * Find bullet index in entry by ID, falling back to text match
   */
  static _findBulletIdx(entry, bulletId, removedText) {
    const bullets = entry.bullets || [];
    let idx = bullets.findIndex(b => b.bulletId === bulletId);
    if (idx === -1 && removedText) {
      idx = bullets.findIndex(b =>
        b.text.toLowerCase().includes(removedText.toLowerCase())
      );
    }
    return idx;
  }

  /**
   * Get skill text from a skill item (string or object)
   */
  static _getSkillText(skill) {
    return (typeof skill === 'string' ? skill : skill.name || skill).toLowerCase();
  }

  /**
   * Find experience entry index by parentId with multi-strategy matching
   */
  static _findExperienceIdx(experience, parentId, removedText) {
    let idx = experience.findIndex(e => e.expId === parentId || e.id === parentId);

    if (idx === -1 && removedText) {
      const cleanText = removedText.toLowerCase().replaceAll(/[–\-\s]+/g, ' ').trim();
      idx = experience.findIndex(e => {
        const fullText = `${e.title || ''} ${e.company || ''}`.toLowerCase().replaceAll(/[–\-\s]+/g, ' ').trim();
        return fullText.includes(cleanText) || cleanText.includes(fullText);
      });
    }

    if (idx === -1) {
      const keywords = parentId.split(/[–\-\s]+/).filter(w => w.length > 2).map(w => w.toLowerCase());
      idx = experience.findIndex(e => {
        const fullText = `${e.title || ''} ${e.company || ''}`.toLowerCase();
        const matchCount = keywords.filter(kw => fullText.includes(kw)).length;
        return matchCount >= Math.max(1, keywords.length - 1);
      });
    }

    return idx;
  }

  /**
   * Replace bullet in experience or projects
   */
  static patchReplaceBullet(resume, target, beforeText, afterText, opId) {
    const { bulletId, section } = target;

    if (!bulletId) {
      return { success: false, resume, error: "target.bulletId is missing" };
    }

    const updated = structuredClone(resume);
    const match = this._findBulletAcrossSections(updated, bulletId, section);

    if (!match) {
      return { success: false, resume, error: `Bullet not found: ${bulletId}` };
    }

    if (match.bullet.text !== beforeText) {
      return { success: false, resume, error: `beforeText does not match bullet ${bulletId}` };
    }

    match.bullet.text = afterText;
    match.bullet.appliedPatches ??= [];
    match.bullet.appliedPatches.push(opId);

    return { success: true, resume: updated, error: null };
  }

  /**
   * Insert new bullet into experience or projects
   */
  static patchInsertBullet(resume, target, afterText, opId) {
    const { parentId, section, afterBulletId } = target;

    if (!parentId || !section) {
      return {
        success: false,
        resume,
        error: "target.parentId and target.section are required for insert_bullet"
      };
    }

    const updated = structuredClone(resume);
    const entries = section === "experience" ? (updated.experience || []) : (updated.projects || []);
    const entry = entries.find(e => e.id === parentId || e.title === parentId);

    if (!entry) {
      return {
        success: false,
        resume,
        error: `Parent section not found: ${section}/${parentId}`
      };
    }

    const crypto = require("crypto");
    const newBullet = {
      bulletId: `bullet_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
      text: afterText,
      appliedPatches: [opId]
    };

    this._insertBulletAtPosition(entry, newBullet, afterBulletId);

    return {
      success: true,
      resume: updated,
      error: null
    };
  }

  /**
   * Remove a bullet point from experience or projects
   */
  static patchRemoveBullet(resume, target, opId) {
    const { bulletId, section, removedText } = target;

    if (!bulletId && !removedText) {
      return {
        success: false,
        resume,
        error: "target.bulletId or removedText is required"
      };
    }

    const updated = structuredClone(resume);
    let found = false;

    const sectionsToSearch = [];
    if (!section || section === "experience") sectionsToSearch.push(...(updated.experience || []));
    if (!found && (!section || section === "projects")) sectionsToSearch.push(...(updated.projects || []));

    for (const entry of sectionsToSearch) {
      const bulletIdx = this._findBulletIdx(entry, bulletId, removedText);
      if (bulletIdx !== -1) {
        entry.bullets.splice(bulletIdx, 1);
        found = true;
        break;
      }
    }

    // Non-parsed sections (education, leadership_activities) don't exist to remove from
    if (!found && (section === "education" || section === "leadership_activities")) {
      console.log(`[PatchApplier] Skipping bullet removal from non-parsed section: ${section}`);
      return { success: true, resume: updated, error: null };
    }

    if (!found) {
      return {
        success: false,
        resume,
        error: `Bullet not found: ${bulletId} (section: ${section || 'any'})`
      };
    }

    return { success: true, resume: updated, error: null };
  }

  /**
   * Remove a skill from the skills list
   */
  static patchRemoveSkill(resume, target, opId) {
    const { skillName } = target;

    if (!skillName) {
      return { success: false, resume, error: "target.skillName is missing" };
    }

    const updated = structuredClone(resume);

    if (!updated.skills?.items) {
      return { success: false, resume, error: "No skills section found" };
    }

    // Try exact case-insensitive match
    let skillIdx = updated.skills.items.findIndex(
      s => this._getSkillText(s) === skillName.toLowerCase()
    );

    // Fall back to partial match
    if (skillIdx === -1) {
      skillIdx = this._findSkillByPartialMatch(updated.skills.items, skillName);
    }

    if (skillIdx === -1) {
      console.log(`[PatchApplier] Skill not found: "${skillName}". Available skills:`,
        JSON.stringify(updated.skills.items.slice(0, 10)));
      return { success: false, resume, error: `Skill not found: ${skillName}` };
    }

    updated.skills.items.splice(skillIdx, 1);
    return { success: true, resume: updated, error: null };
  }

  /**
   * Find skill index by partial match (first few words)
   */
  static _findSkillByPartialMatch(items, skillName) {
    const searchTerms = skillName.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
    return items.findIndex(s => {
      const itemText = this._getSkillText(s);
      return itemText.includes(searchTerms) || searchTerms.includes(itemText.split(/\s+/)[0]);
    });
  }

  /**
   * Suppress (hide) an entire section like experience, projects, etc.
   * Or hide a single job or project
   */
  static patchSuppressSection(resume, target, opId) {
    const { section, parentId, removedText } = target;

    if (!section) {
      return { success: false, resume, error: "target.section is missing" };
    }

    const updated = structuredClone(resume);

    if (parentId) {
      return this._suppressSubsection(updated, resume, section, parentId, removedText);
    }

    return this._suppressEntireSection(updated, section);
  }

  /**
   * Suppress a single item (job/project) within a section
   */
  static _suppressSubsection(updated, originalResume, section, parentId, removedText) {
    if (section === "experience") {
      const jobIdx = this._findExperienceIdx(updated.experience || [], parentId, removedText);
      if (jobIdx === -1) {
        console.log(`[PatchApplier] Could not match experience: "${parentId}". Available:`,
          (updated.experience || []).map(e => `"${e.title}" @ "${e.company}"`).slice(0, 3).join(' | '));
        return { success: false, resume: originalResume, error: `Experience entry not found: ${parentId}` };
      }
      updated.experience.splice(jobIdx, 1);
    } else if (section === "projects") {
      const projIdx = this._findProjectIdx(updated.projects || [], parentId, removedText);
      if (projIdx === -1) {
        return { success: false, resume: originalResume, error: `Project not found: ${parentId}` };
      }
      updated.projects.splice(projIdx, 1);
    } else {
      return { success: false, resume: originalResume, error: `Cannot suppress subsection of: ${section}` };
    }

    return { success: true, resume: updated, error: null };
  }

  /**
   * Suppress an entire section (experience, projects, skills)
   */
  static _suppressEntireSection(updated, section) {
    if (section === "experience") {
      updated.experience = [];
    } else if (section === "projects") {
      updated.projects = [];
    } else if (section === "skills") {
      updated.skills = { items: [] };
    } else {
      return { success: false, resume: updated, error: `Unknown section to suppress: ${section}` };
    }
    return { success: true, resume: updated, error: null };
  }

  /**
   * Find project entry index by parentId with fallback text matching
   */
  static _findProjectIdx(projects, parentId, removedText) {
    let idx = projects.findIndex(p => p.projId === parentId || p.id === parentId);
    if (idx === -1 && removedText) {
      idx = projects.findIndex(p =>
        (p.name || '').toLowerCase().includes(removedText.toLowerCase())
      );
    }
    return idx;
  }

  /**
   * Condense a bullet point (shorten it)
   */
  static patchCondenseBullet(resume, target, condensedText, opId) {
    const { bulletId, section } = target;

    if (!bulletId || !condensedText) {
      return {
        success: false,
        resume,
        error: "target.bulletId and afterText (condensed text) are required for condense_bullet"
      };
    }

    const updated = structuredClone(resume);
    const match = this._findBulletAcrossSections(updated, bulletId, section);

    if (!match) {
      return { success: false, resume, error: `Bullet not found: ${bulletId}` };
    }

    match.bullet.text = condensedText;
    match.bullet.appliedPatches ??= [];
    match.bullet.appliedPatches.push(opId);

    return { success: true, resume: updated, error: null };
  }

  /**
   * Create a summary of applied patches for display
   */
  static summarizePatches(originalResume, tailoredResume, appliedPatches) {
    const summary = {
      totalPatches: appliedPatches.length,
      changes: {
        summaryModified: originalResume.summary?.text !== tailoredResume.summary?.text,
        experienceModified: JSON.stringify(originalResume.experience) !== JSON.stringify(tailoredResume.experience),
        projectsModified: JSON.stringify(originalResume.projects) !== JSON.stringify(tailoredResume.projects),
        skillsModified: JSON.stringify(originalResume.skills) !== JSON.stringify(tailoredResume.skills)
      },
      patchsByType: {
        replace_summary: 0,
        replace_bullet: 0,
        insert_bullet: 0,
        remove_bullet: 0,
        remove_skill: 0,
        suppress_section: 0,
        condense_bullet: 0,
        relabel_experience: 0,
        reorder_bullet: 0
      }
    };

    appliedPatches.forEach(patch => {
      summary.patchsByType[patch.type] = (summary.patchsByType[patch.type] || 0) + 1;
    });

    return summary;
  }
}

module.exports = PatchApplier;
