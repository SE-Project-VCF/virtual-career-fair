/**
 * Convert structured resume JSON to formatted text for display
 */

export interface StructuredResume {
  summary?: { text: string };
  skills?: { items: string[] };
  experience?: Array<{
    expId: string;
    company: string;
    title: string;
    start: string;
    end: string;
    bullets: Array<{ bulletId: string; text: string }>;
  }>;
  projects?: Array<{
    projId: string;
    name: string;
    bullets: Array<{ bulletId: string; text: string }>;
  }>;
  [key: string]: any;
}

export function formatResumeAsText(resume: StructuredResume): string {
  let text = "";

  // Summary
  if (resume.summary?.text) {
    text += "PROFESSIONAL SUMMARY\n";
    text += resume.summary.text + "\n\n";
  }

  // Skills
  if (resume.skills?.items && resume.skills.items.length > 0) {
    text += "TECHNICAL SKILLS\n";
    text += resume.skills.items.join(" • ") + "\n\n";
  }

  // Experience
  if (resume.experience && resume.experience.length > 0) {
    text += "EXPERIENCE\n";
    resume.experience.forEach((exp) => {
      text += `${exp.title}${exp.company ? " - " + exp.company : ""}${
        exp.start || exp.end ? ` (${exp.start}${exp.end ? " - " + exp.end : ""})` : ""
      }\n`;

      if (exp.bullets && exp.bullets.length > 0) {
        exp.bullets.forEach((bullet) => {
          text += `  • ${bullet.text}\n`;
        });
      }

      text += "\n";
    });
  }

  // Projects
  if (resume.projects && resume.projects.length > 0) {
    text += "PROJECTS\n";
    resume.projects.forEach((proj) => {
      text += `${proj.name}\n`;

      if (proj.bullets && proj.bullets.length > 0) {
        proj.bullets.forEach((bullet) => {
          text += `  • ${bullet.text}\n`;
        });
      }

      text += "\n";
    });
  }

  return text;
}

/**
 * Get a bullet by ID from the resume
 */
export function getBulletById(
  resume: StructuredResume,
  bulletId: string
): { text: string; section: string; parentId: string } | null {
  // Check experience
  for (const exp of resume.experience || []) {
    for (const bullet of exp.bullets || []) {
      if (bullet.bulletId === bulletId) {
        return { text: bullet.text, section: "experience", parentId: exp.expId };
      }
    }
  }

  // Check projects
  for (const proj of resume.projects || []) {
    for (const bullet of proj.bullets || []) {
      if (bullet.bulletId === bulletId) {
        return { text: bullet.text, section: "projects", parentId: proj.projId };
      }
    }
  }

  return null;
}

/**
 * Count changes between two resumes (for diff summary)
 */
export function countChanges(
  original: StructuredResume,
  tailored: StructuredResume
): { removals: number; edits: number; insertions: number } {
  let removals = 0;
  let edits = 0;
  let insertions = 0;

  // Compare experience bullets
  const origExpBullets = new Map<string, string>();
  (original.experience || []).forEach((exp) => {
    (exp.bullets || []).forEach((b) => {
      origExpBullets.set(b.bulletId, b.text);
    });
  });

  const tailExpBullets = new Map<string, string>();
  (tailored.experience || []).forEach((exp) => {
    (exp.bullets || []).forEach((b) => {
      tailExpBullets.set(b.bulletId, b.text);
    });
  });

  // Count changes
  origExpBullets.forEach((text, id) => {
    if (!tailExpBullets.has(id)) {
      removals++;
    } else if (tailExpBullets.get(id) !== text) {
      edits++;
    }
  });

  tailExpBullets.forEach((_text, id) => {
    if (!origExpBullets.has(id)) {
      insertions++;
    }
  });

  // Similar for projects
  const origProjBullets = new Map<string, string>();
  (original.projects || []).forEach((proj) => {
    (proj.bullets || []).forEach((b) => {
      origProjBullets.set(b.bulletId, b.text);
    });
  });

  const tailProjBullets = new Map<string, string>();
  (tailored.projects || []).forEach((proj) => {
    (proj.bullets || []).forEach((b) => {
      tailProjBullets.set(b.bulletId, b.text);
    });
  });

  origProjBullets.forEach((text, id) => {
    if (!tailProjBullets.has(id)) {
      removals++;
    } else if (tailProjBullets.get(id) !== text) {
      edits++;
    }
  });

  tailProjBullets.forEach((_text, id) => {
    if (!origProjBullets.has(id)) {
      insertions++;
    }
  });

  // Summary check
  if (original.summary?.text !== tailored.summary?.text) {
    edits++;
  }

  return { removals, edits, insertions };
}

/**
 * Format plain text resume by detecting sections and adding proper line breaks and spacing
 * This intelligently reformats a resume string to be more readable
 */
export function formatPlainTextResume(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    return rawText;
  }

  // If text is already well-structured (has decent line breaks), return as-is
  const lines = rawText.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  
  if (nonEmptyLines.length > 8) {
    // Already has structure, just normalize excessive blank lines
    const normalized = rawText
      .split("\n")
      .reduce((acc: string[], line) => {
        // Skip excessive blank lines (more than 2 in a row)
        if (line.trim() === "") {
          if (acc.length === 0 || acc[acc.length - 1].trim() === "") {
            if (acc.length > 0) {
              // Only skip if previous line was also blank
              return acc;
            }
          }
          acc.push("");
        } else {
          acc.push(line);
        }
        return acc;
      }, [])
      .join("\n")
      .trim();

    return normalized;
  }

  // If text is just one long paragraph, do minimal cleanup
  // This shouldn't happen anymore with the improved PDF extraction
  return rawText.trim();
}
