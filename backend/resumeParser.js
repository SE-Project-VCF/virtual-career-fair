const mammoth = require("mammoth");

let _pdfjs; // cached module

async function getPdfJs() {
  if (_pdfjs) return _pdfjs;
  // ESM import for pdfjs-dist (v5+ ships .mjs)
  _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return _pdfjs;
}

/**
 * Parse resume text into structured JSON using reliable section detection
 */
function toStructuredResume(rawText) {
  // NORMALIZE: Add newlines and clean up text
  let text = (rawText || "")
    .replace(/\r/g, "")
    // Add newlines before section headers if missing (before any of these keywords)
    .replace(/([^\n])(Professional\s+Summary|Technical\s+Skills|Skills\s*(?::|$)|Experience|Work\s+Experience|Employment|Projects?|Education|Leadership|Activities)/gim, "$1\n$2")
    .trim();
  
  console.log("[PARSER] Input text length:", text.length);
  console.log("[PARSER] After normalization, lines:", text.split('\n').length);
  
  const structured = {
    summary: { text: "" },
    skills: { items: [] },
    experience: [],
    projects: [],
  };

  // Define section headers and their aliases
  const sectionPatterns = {
    summary: ['Professional Summary', 'Summary', 'Professional Summary'],
    skills: ['Technical Skills', 'Skills', 'Core Competencies'],
    experience: ['Experience', 'Work Experience', 'Employment', 'Career'],
    projects: ['Projects', 'Project Experience', 'Portfolio']
  };

  // Find all section headers - more flexible regex that handles various formatting
  const headerRegex = /(Professional\s+Summary|Technical\s+Skills|Skills|Experience|Work\s+Experience|Employment|Projects?|Core\s+Competencies|Education|Leadership|Activities)/gim;
  
  const sections = [];
  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    // Find the start of content (after the header line)
    let contentStart = match.index + match[0].length;
    const nextNewline = text.indexOf('\n', contentStart);
    if (nextNewline !== -1) {
      contentStart = nextNewline + 1;
    }
    
    sections.push({
      name: match[1].trim().toLowerCase(),
      startIndex: match.index,
      contentStart: contentStart,
      endIndex: null
    });
  }

  // Calculate end indices (next section start or end of text)
  for (let i = 0; i < sections.length; i++) {
    sections[i].endIndex = (i + 1 < sections.length) ? sections[i + 1].startIndex : text.length;
  }

  console.log("[PARSER] Found", sections.length, "sections");

  // Extract content for each section
  sections.forEach(section => {
    const content = text.substring(section.contentStart, section.endIndex).trim();
    
    if (content.length === 0) return;
    
    console.log(`[PARSER] Processing section: ${section.name} (${content.length} chars)`);

    if (/summary/.test(section.name)) {
      // For summary, capture full sentences (smart truncation to 600 chars)
      let summaryText = content.trim();
      if (summaryText.length > 600) {
        const truncated = summaryText.substring(0, 600);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastNewline = truncated.lastIndexOf('\n');
        const cutPoint = Math.max(lastPeriod, lastNewline);
        if (cutPoint > 300) {
          summaryText = summaryText.substring(0, cutPoint + 1);
        } else {
          summaryText = truncated;
        }
      }
      structured.summary.text = summaryText.trim();
    } 
    else if (/skills?|technical|competencies/.test(section.name)) {
      // Split skills by common delimiters
      const skillsInput = content
        .split(/[,;•\n]/g)
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 50)
        .map(s => s.replace(/^[-•‣∙*]\s*/, ""));
      
      structured.skills.items = Array.from(new Set(skillsInput)).slice(0, 80);
      console.log("[PARSER] Found", structured.skills.items.length, "skills:", structured.skills.items.slice(0, 10));
    } 
    else if (/experience|work|employment|career/.test(section.name)) {
      parseExperience(structured, content);
      console.log("[PARSER] After experience parse: found", structured.experience.length, "jobs");
    } 
    else if (/projects?|portfolio/.test(section.name)) {
      parseProjects(structured, content);
      console.log("[PARSER] After projects parse: found", structured.projects.length, "projects");
    }
  });

  // If no sections found or critical sections empty, try fallback
  if (sections.length === 0 || structured.skills.items.length === 0 || structured.experience.length === 0) {
    console.log("[PARSER] ⚠️ Sections missing or empty, attempting fallback parse...");
    fallbackParse(text, structured);
    console.log("[PARSER] After fallback: skills=", structured.skills.items.length, "experience=", structured.experience.length);
  }

  console.log("[PARSER] Final structured resume:", {
    summaryLength: structured.summary.text.length,
    skillsCount: structured.skills.items.length,
    experienceCount: structured.experience.length,
    projectsCount: structured.projects.length
  });

  return structured;
}

/**
 * FALLBACK: If standard parsing fails, try a very simple approach
 */
function fallbackParse(text, structured) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  
  console.log(`[PARSER-FALLBACK] Starting with ${lines.length} non-empty lines`);
  
  // If only 1-3 lines, the text might not have proper newlines. Use regex to extract
  if (lines.length <= 3) {
    console.log(`[PARSER-FALLBACK] ⚠️ Very few lines detected (${lines.length}), using regex extraction...`);
    
    // Find skills section - look for "Skills:" or "Technical Skills:" followed by comma-separated items
    const skillsMatch = text.match(/(?:Technical\s+)?Skills?[:\s]+([^\n]*?)(?:Experience|Projects?|Education|$)/i);
    if (skillsMatch) {
      const skillsText = skillsMatch[1];
      const skillsList = skillsText.split(/[,;•]+/)
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 60);
      structured.skills.items = Array.from(new Set(skillsList)).slice(0, 80);
      console.log(`[PARSER-FALLBACK] Extracted ${structured.skills.items.length} skills via regex`);
    }
    
    // Find experience section
    const expMatch = text.match(/(?:Work\s+)?Experience[:\s]+([\s\S]*?)(?:Projects?|Education|Skills?|$)/i);
    if (expMatch) {
      const expText = expMatch[1];
      // Look for job titles (typically: "Title - Company" or "Title @ Company")
      const jobMatches = expText.match(/([A-Z][^–-]*?(?:–|-)[\s]*[A-Z][^,\n]*)/g) || [];
      
      for (const jobLine of jobMatches) {
        if (jobLine.length > 5) {
          const expId = `exp_${String(structured.experience.length + 1).padStart(2, '0')}`;
          const parts = jobLine.split(/[–\-]/).map(p => p.trim());
          structured.experience.push({
            expId,
            title: parts[0] || 'Experience',
            company: parts[1] || '',
            start: '',
            end: '',
            bullets: []
          });
          console.log(`[PARSER-FALLBACK] Extracted job: "${parts[0]}"`);
        }
      }
    }
    
    // Find projects section
    const projMatch = text.match(/Projects?[:\s]+([\s\S]*?)(?:Education|Skills?|Experience|$)/i);
    if (projMatch) {
      const projText = projMatch[1];
      const projMatches = projText.match(/([A-Z][^,\n]*?(?:–|-)[^,\n]*)/g) || [];
      
      for (const projLine of projMatches) {
        if (projLine.length > 5) {
          const projId = `proj_${String(structured.projects.length + 1).padStart(2, '0')}`;
          structured.projects.push({
            projId,
            name: projLine.split(/[–\-]/)[0].trim(),
            bullets: []
          });
          console.log(`[PARSER-FALLBACK] Extracted project: "${projLine.substring(0, 50)}"`);
        }
      }
    }
  } else {
    console.log(`[PARSER-FALLBACK] Text has proper line breaks (${lines.length} lines), using line-based parsing`);
    
    // AGGRESSIVE: Any comma-separated line with 3+ items could be skills
    for (const line of lines) {
      if (line.includes(',') && !line.includes('://') && !line.includes('@')) {
        const items = line.split(',')
          .map(s => s.trim())
          .filter(s => s.length > 1 && s.length < 60 && !s.includes('\n'));
        
        if (items.length >= 3) {
          const newSkills = items.filter(s => !structured.skills.items.includes(s));
          structured.skills.items.push(...newSkills);
          console.log(`[PARSER-FALLBACK] Found ${newSkills.length} potential skills in line: "${line.substring(0, 80)}"`);
        }
      }
    }
    
    // Remove duplicates and limit for line-based parsing
    if (structured.skills.items.length > 0) {
      structured.skills.items = Array.from(new Set(structured.skills.items)).slice(0, 80);
      console.log(`[PARSER-FALLBACK] Total unique skills: ${structured.skills.items.length}`);
    }
  }
  
  // Final cleanup: remove duplicates
  structured.skills.items = Array.from(new Set(structured.skills.items)).slice(0, 80);
  
  // Try to extract summary from first part of text if still empty
  if (structured.summary.text.length === 0) {
    const textStart = text.substring(0, 600).split(/(?:Professional\s+)?Summary[^.]*\./i)[0];
    if (textStart.length > 50) {
      structured.summary.text = textStart.trim();
      console.log("[PARSER-FALLBACK] Set summary from text");
    } else if (lines.length > 0) {
      structured.summary.text = lines.slice(0, 5).join(' ').substring(0, 600);
      console.log("[PARSER-FALLBACK] Set summary from first lines");
    }
  }
  
  console.log(`[PARSER-FALLBACK] FINAL: ${structured.skills.items.length} skills, ${structured.experience.length} jobs, ${structured.projects.length} projects`);
}

/**
 * Parse experience section into job entries with bullets.
 * Better detection: looks for date patterns, short header lines, and separators.
 */
function parseExperience(structured, content) {
  if (!content || content.length === 0) return;
  
  // Split content into lines, handling both \n and bullet separators
  const lines = content
    .split(/[\n•]/g)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  console.log("[PARSER] Experience section has", lines.length, "lines");
  
  // Date pattern: months, years, "Present", ranges like "Jan 2023 - Dec 2024"
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December|\b20\d{2}\b|\bPresent\b|\bCurrent\b)/i;
  
  // Job title keywords for better detection
  const jobKeywords = /(Engineer|Developer|Manager|Architect|Designer|Analyst|Specialist|Consultant|Coordinator|Officer|Administrator|Technician|Associate|Senior|Junior|Lead|Principal)/i;
  
  let expIndex = 1;
  let currentExp = {
    expId: `exp_${String(expIndex).padStart(2, "0")}`,
    company: "",
    title: "",
    start: "",
    end: "",
    bullets: [],
  };
  let bulletIndex = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect job header: 
    // 1) Contains separators (-, |, ,) and is relatively short, OR
    // 2) Contains date pattern and keywords, OR
    // 3) Is short (< 80 chars) and continues with a date line
    const hasSeparator = (line.includes(" - ") || line.includes(" | ") || line.includes(" , ")) && line.length < 120;
    const hasDateAndKeyword = datePattern.test(line) && jobKeywords.test(line);
    const nextLineHasDate = i + 1 < lines.length && datePattern.test(lines[i + 1]);
    const looksLikeHeader = line.length < 80 && jobKeywords.test(line) && nextLineHasDate;
    
    const isJobHeader = hasSeparator || hasDateAndKeyword || looksLikeHeader;
    
    // If we detect a new job and current has bullets or title, save current job
    if (isJobHeader && (currentExp.bullets.length > 0 || currentExp.title)) {
      structured.experience.push(currentExp);
      expIndex += 1;
      bulletIndex = 1;
      currentExp = {
        expId: `exp_${String(expIndex).padStart(2, "0")}`,
        company: "",
        title: "",
        start: "",
        end: "",
        bullets: [],
      };
    }
    
    if (isJobHeader) {
      // Parse job header line(s)
      // Try to extract: "Title - Company - Dates" or "Company | Title | Dates"
      const separator = line.includes(" | ") ? " | " : (line.includes(" - ") ? " - " : " , ");
      const parts = line.split(new RegExp(separator.replace(/[|]/g, "\\|")));
      
      // Heuristic: Longer parts are likely company names, shorter are titles
      // Or: Parts with dates should be dates
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j].trim();
        if (datePattern.test(part)) {
          // Extract dates
          const dateMatch = part.match(/(\w+ \d{4}|\d{4})/g);
          if (dateMatch && dateMatch.length === 2) {
            currentExp.start = dateMatch[0];
            currentExp.end = dateMatch[1];
          }
        } else if (jobKeywords.test(part)) {
          // Likely a title
          if (!currentExp.title) currentExp.title = part;
        } else if (part.length > 3) {
          // Company or additional title info
          if (!currentExp.company) currentExp.company = part;
          else if (!currentExp.title) currentExp.title = part;
        }
      }
      
      // If we only got one part, treat it as title
      if (parts.length === 1) {
        currentExp.title = line;
      }
    } else if (line.length > 10) {
      // This is a bullet point
      const bulletId = `b_exp_${String(expIndex).padStart(2, "0")}_${String(bulletIndex).padStart(3, "0")}`;
      currentExp.bullets.push({ bulletId, text: line });
      bulletIndex += 1;
    }
  }
  
  // Don't forget the last job
  if (currentExp.bullets.length > 0 || currentExp.title) {
    structured.experience.push(currentExp);
  }
  
  console.log("[PARSER] Parsed", structured.experience.length, "experience entries");
}

/**
 * Parse projects section into project entries with bullets.
 * Extracts project names and associated bullet points.
 */
function parseProjects(structured, content) {
  if (!content || content.length === 0) return;
  
  const lines = content
    .split(/[\n•]/g)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  console.log("[PARSER] Projects section has", lines.length, "lines");
  
  let projIndex = 1;
  let currentProj = {
    projId: `proj_${String(projIndex).padStart(2, "0")}`,
    name: "",
    bullets: [],
  };
  let bulletIndex = 1;
  let projectTitleBuffer = []; // Collect short lines until we hit a longer one (bullet)
  
  for (const line of lines) {
    // Bullets are typically longer (> 20 chars) and start with action verbs
    const looksLikeBullet = line.length > 20 || 
                           /^(Built|Developed|Implemented|Designed|Created|Used|Integrated|Wrote|Analyzed|Managed|Led)/i.test(line);
    
    if (looksLikeBullet) {
      // If we have buffered title parts, join them
      if (projectTitleBuffer.length > 0) {
        currentProj.name = projectTitleBuffer.join(" ");
        projectTitleBuffer = [];
      }
      
      // If current project already has bullets, save it and start new one
      if (currentProj.bullets.length > 0 && !currentProj.name) {
        structured.projects.push(currentProj);
        projIndex += 1;
        bulletIndex = 1;
        currentProj = {
          projId: `proj_${String(projIndex).padStart(2, "0")}`,
          name: "",
          bullets: [],
        };
      }
      
      // Add as bullet
      const bulletId = `b_proj_${String(projIndex).padStart(2, "0")}_${String(bulletIndex).padStart(3, "0")}`;
      currentProj.bullets.push({ bulletId, text: line });
      bulletIndex += 1;
    } else {
      // Short line - could be part of project title
      if (!currentProj.name && currentProj.bullets.length === 0) {
        projectTitleBuffer.push(line); // Buffer it - might be multi-word title
      } else if (currentProj.bullets.length > 0) {
        // We have bullets already, so this short line is a new project
        structured.projects.push(currentProj);
        projIndex += 1;
        bulletIndex = 1;
        projectTitleBuffer = [line];
        currentProj = {
          projId: `proj_${String(projIndex).padStart(2, "0")}`,
          name: "",
          bullets: [],
        };
      }
    }
  }
  
  // Handle any remaining buffered title
  if (projectTitleBuffer.length > 0 && !currentProj.name) {
    currentProj.name = projectTitleBuffer.join(" ");
  }
  
  // Save last project
  if (currentProj.name || currentProj.bullets.length > 0) {
    structured.projects.push(currentProj);
  }
  
  console.log("[PARSER] Parsed", structured.projects.length, "projects");
}

/**
 * Extract text content from PDF buffer.
 * Simple extraction - formatting will be handled by Gemini on save
 */
async function extractTextFromPdfBuffer(buffer) {
  const pdfjsLib = await getPdfJs();

  // Ensure we have proper Uint8Array for pdfjs
  let uint8 = buffer;
  if (Buffer.isBuffer(buffer)) {
    uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  } else if (!(buffer instanceof Uint8Array)) {
    uint8 = new Uint8Array(buffer);
  }

  const loadingTask = pdfjsLib.getDocument({ data: uint8 });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str);
    fullText += strings.join(" ") + "\n";
  }

  return fullText;
}

/**
 * Extract text from buffer based on file type.
 * Supports PDF and DOCX formats with fallback to PDF extraction.
 */
async function extractTextFromBuffer(buffer, fileNameOrPath) {
  const lower = (fileNameOrPath || "").toLowerCase();

  if (lower.endsWith(".pdf")) {
    return await extractTextFromPdfBuffer(buffer);
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  // fallback
  try {
    return await extractTextFromPdfBuffer(buffer);
  } catch {
    return "";
  }
}

module.exports = { extractTextFromBuffer, toStructuredResume };
