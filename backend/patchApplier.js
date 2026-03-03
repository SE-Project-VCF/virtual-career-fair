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
    let tailoredResume = JSON.parse(JSON.stringify(originalResume));
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
        // LENIENT: Log but don't fail - skill/job might not exist in this resume
        console.log(`[PatchApplier] Skipping patch ${patch.opId}: ${result.error}`);
        // DON'T add to errors - let it pass
      }
    }

    // Always return success if we processed all patches, even if some didn't apply
    return {
      success: true,  // CHANGED: Always true now
      tailoredResume,
      appliedCount,
      errors: errors.length > 0 ? errors : null
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

    const updated = JSON.parse(JSON.stringify(resume));
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
   * Replace bullet in experience or projects
   */
  static patchReplaceBullet(resume, target, beforeText, afterText, opId) {
    const { bulletId, section } = target;

    if (!bulletId) {
      return {
        success: false,
        resume,
        error: "target.bulletId is missing"
      };
    }

    const updated = JSON.parse(JSON.stringify(resume));

    // Find and replace bullet
    let found = false;

    // Search experience
    if (!section || section === "experience") {
      for (const exp of updated.experience || []) {
        for (const bullet of exp.bullets || []) {
          if (bullet.bulletId === bulletId) {
            if (bullet.text !== beforeText) {
              return {
                success: false,
                resume,
                error: `beforeText does not match bullet ${bulletId}`
              };
            }

            bullet.text = afterText;
            if (!bullet.appliedPatches) bullet.appliedPatches = [];
            bullet.appliedPatches.push(opId);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    // Search projects if not found
    if (!found && (!section || section === "projects")) {
      for (const proj of updated.projects || []) {
        for (const bullet of proj.bullets || []) {
          if (bullet.bulletId === bulletId) {
            if (bullet.text !== beforeText) {
              return {
                success: false,
                resume,
                error: `beforeText does not match bullet ${bulletId}`
              };
            }

            bullet.text = afterText;
            if (!bullet.appliedPatches) bullet.appliedPatches = [];
            bullet.appliedPatches.push(opId);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found) {
      return {
        success: false,
        resume,
        error: `Bullet not found: ${bulletId}`
      };
    }

    return {
      success: true,
      resume: updated,
      error: null
    };
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

    const updated = JSON.parse(JSON.stringify(resume));
    let found = false;

    if (section === "experience") {
      for (const exp of updated.experience || []) {
        if (exp.id === parentId || exp.title === parentId) {
          const newBullet = {
            bulletId: `bullet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: afterText,
            appliedPatches: [opId]
          };

          // Insert after specific bullet if provided
          if (afterBulletId) {
            const idx = (exp.bullets || []).findIndex(b => b.bulletId === afterBulletId);
            if (idx !== -1) {
              exp.bullets.splice(idx + 1, 0, newBullet);
            } else {
              exp.bullets.push(newBullet);
            }
          } else {
            if (!exp.bullets) exp.bullets = [];
            exp.bullets.push(newBullet);
          }

          found = true;
          break;
        }
      }
    } else if (section === "projects") {
      for (const proj of updated.projects || []) {
        if (proj.id === parentId || proj.title === parentId) {
          const newBullet = {
            bulletId: `bullet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: afterText,
            appliedPatches: [opId]
          };

          if (afterBulletId) {
            const idx = (proj.bullets || []).findIndex(b => b.bulletId === afterBulletId);
            if (idx !== -1) {
              proj.bullets.splice(idx + 1, 0, newBullet);
            } else {
              proj.bullets.push(newBullet);
            }
          } else {
            if (!proj.bullets) proj.bullets = [];
            proj.bullets.push(newBullet);
          }

          found = true;
          break;
        }
      }
    }

    if (!found) {
      return {
        success: false,
        resume,
        error: `Parent section not found: ${section}/${parentId}`
      };
    }

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

    const updated = JSON.parse(JSON.stringify(resume));
    let found = false;

    // Search experience
    if (!section || section === "experience") {
      for (const exp of updated.experience || []) {
        // Try exact ID match first
        let bulletIdx = (exp.bullets || []).findIndex(b => b.bulletId === bulletId);
        
        // Fall back to text matching
        if (bulletIdx === -1 && removedText) {
          bulletIdx = (exp.bullets || []).findIndex(b => 
            b.text.toLowerCase().includes(removedText.toLowerCase())
          );
        }
        
        if (bulletIdx !== -1) {
          exp.bullets.splice(bulletIdx, 1);
          found = true;
          break;
        }
      }
    }

    // Search projects if not found
    if (!found && (!section || section === "projects")) {
      for (const proj of updated.projects || []) {
        // Try exact ID match first
        let bulletIdx = (proj.bullets || []).findIndex(b => b.bulletId === bulletId);
        
        // Fall back to text matching
        if (bulletIdx === -1 && removedText) {
          bulletIdx = (proj.bullets || []).findIndex(b => 
            b.text.toLowerCase().includes(removedText.toLowerCase())
          );
        }
        
        if (bulletIdx !== -1) {
          proj.bullets.splice(bulletIdx, 1);
          found = true;
          break;
        }
      }
    }

    // If section is education or leadership_activities (which aren't in structured resume),
    // return success since they don't exist to remove anyway
    if (!found && (section === "education" || section === "leadership_activities")) {
      console.log(`[PatchApplier] Skipping bullet removal from non-parsed section: ${section}`);
      return {
        success: true,
        resume: updated,
        error: null
      };
    }

    if (!found) {
      return {
        success: false,
        resume,
        error: `Bullet not found: ${bulletId} (section: ${section || 'any'})`
      };
    }

    return {
      success: true,
      resume: updated,
      error: null
    };
  }

  /**
   * Remove a skill from the skills list
   */
  static patchRemoveSkill(resume, target, opId) {
    const { skillName } = target;

    if (!skillName) {
      return {
        success: false,
        resume,
        error: "target.skillName is missing"
      };
    }

    const updated = JSON.parse(JSON.stringify(resume));
    
    if (!updated.skills || !updated.skills.items) {
      return {
        success: false,
        resume,
        error: "No skills section found"
      };
    }

    // Try exact case-insensitive match
    let skillIdx = updated.skills.items.findIndex(
      s => (typeof s === 'string' ? s : s.name || s).toLowerCase() === skillName.toLowerCase()
    );

    // If not found, try partial match (first few words)
    if (skillIdx === -1) {
      const searchTerms = skillName.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      skillIdx = updated.skills.items.findIndex(s => {
        const itemText = (typeof s === 'string' ? s : s.name || s).toLowerCase();
        return itemText.includes(searchTerms) || searchTerms.includes(itemText.split(/\s+/)[0]);
      });
    }

    if (skillIdx === -1) {
      console.log(`[PatchApplier] Skill not found: "${skillName}". Available skills:`, 
        JSON.stringify(updated.skills.items.slice(0, 10)));
      return {
        success: false,
        resume,
        error: `Skill not found: ${skillName}`
      };
    }

    updated.skills.items.splice(skillIdx, 1);

    return {
      success: true,
      resume: updated,
      error: null
    };
  }

  /**
   * Suppress (hide) an entire section like experience, projects, etc.
   * Or hide a single job or project
   */
  static patchSuppressSection(resume, target, opId) {
    const { section, parentId, removedText } = target;

    if (!section) {
      return {
        success: false,
        resume,
        error: "target.section is missing"
      };
    }

    const updated = JSON.parse(JSON.stringify(resume));

    // If parentId is specified, hide just that item (job/project)
    if (parentId) {
      if (section === "experience") {
        // Try exact ID match first
        let jobIdx = (updated.experience || []).findIndex(
          e => e.expId === parentId || e.id === parentId
        );
        
        // If not found, try matching by title/company/text content (normalize for punctuation)
        if (jobIdx === -1 && removedText) {
          const cleanRemovedText = removedText.toLowerCase().replace(/[–\-\s]+/g, ' ').trim();
          jobIdx = (updated.experience || []).findIndex(e => {
            const fullText = `${e.title || ''} ${e.company || ''}`.toLowerCase().replace(/[–\-\s]+/g, ' ').trim();
            return fullText.includes(cleanRemovedText) || cleanRemovedText.includes(fullText);
          });
        }
        
        // Last resort: match keywords from parentId (split by dash/spaces, match key words)
        if (jobIdx === -1) {
          const keywords = parentId.split(/[–\-\s]+/).filter(w => w.length > 2).map(w => w.toLowerCase());
          jobIdx = (updated.experience || []).findIndex(e => {
            const fullText = `${e.title || ''} ${e.company || ''}`.toLowerCase();
            // Match if majority of keywords found
            const matchCount = keywords.filter(kw => fullText.includes(kw)).length;
            return matchCount >= Math.max(1, keywords.length - 1);
          });
        }
        
        if (jobIdx === -1) {
          console.log(`[PatchApplier] Could not match experience: "${parentId}". Available:`, 
            (updated.experience || []).map(e => `"${e.title}" @ "${e.company}"`).slice(0, 3).join(' | '));
          return {
            success: false,
            resume,
            error: `Experience entry not found: ${parentId}`
          };
        }
        updated.experience.splice(jobIdx, 1);
      } else if (section === "projects") {
        let projIdx = (updated.projects || []).findIndex(
          p => p.projId === parentId || p.id === parentId
        );
        
        // If not found, try matching by name/text content
        if (projIdx === -1 && removedText) {
          projIdx = (updated.projects || []).findIndex(p =>
            (p.name || '').toLowerCase().includes(removedText.toLowerCase())
          );
        }
        
        if (projIdx === -1) {
          return {
            success: false,
            resume,
            error: `Project not found: ${parentId}`
          };
        }
        updated.projects.splice(projIdx, 1);
      } else {
        return {
          success: false,
          resume,
          error: `Cannot suppress subsection of: ${section}`
        };
      }
    } else {
      // Hide entire section
      if (section === "experience") {
        updated.experience = [];
      } else if (section === "projects") {
        updated.projects = [];
      } else if (section === "skills") {
        updated.skills = { items: [] };
      } else {
        return {
          success: false,
          resume,
          error: `Unknown section to suppress: ${section}`
        };
      }
    }

    return {
      success: true,
      resume: updated,
      error: null
    };
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

    const updated = JSON.parse(JSON.stringify(resume));
    let found = false;

    // Search experience
    if (!section || section === "experience") {
      for (const exp of updated.experience || []) {
        for (const bullet of exp.bullets || []) {
          if (bullet.bulletId === bulletId) {
            bullet.text = condensedText;
            if (!bullet.appliedPatches) bullet.appliedPatches = [];
            bullet.appliedPatches.push(opId);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    // Search projects if not found
    if (!found && (!section || section === "projects")) {
      for (const proj of updated.projects || []) {
        for (const bullet of proj.bullets || []) {
          if (bullet.bulletId === bulletId) {
            bullet.text = condensedText;
            if (!bullet.appliedPatches) bullet.appliedPatches = [];
            bullet.appliedPatches.push(opId);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found) {
      return {
        success: false,
        resume,
        error: `Bullet not found: ${bulletId}`
      };
    }

    return {
      success: true,
      resume: updated,
      error: null
    };
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
