const mammoth = require("mammoth");

let _pdfjs; // cached module

async function getPdfJs() {
  if (_pdfjs) return _pdfjs;
  // ESM import for pdfjs-dist (v5+ ships .mjs)
  _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return _pdfjs;
}

// Date detection split into simple patterns to stay under Sonar complexity limit
const shortMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const yearOrStatusPattern = /(?:\b20\d{2}\b|\bPresent\b|\bCurrent\b)/i;
const sectionHeaderTerms = [
  String.raw`Professional\s+Summary`,
  String.raw`Technical\s+Skills`,
  String.raw`Skills\s*(?::|$)`,
  "Experience",
  String.raw`Work\s+Experience`,
  "Employment",
  "Projects?",
  "Education",
  "Leadership",
  "Activities",
];
const sectionHeaderInsertPattern = new RegExp(
  String.raw`([^\n])(${sectionHeaderTerms.join("|")})`,
  "gim"
);

/** Check if text contains a date-like token (month name, year, or "Present"/"Current"). */
function hasDateToken(text) {
  const lower = text.toLowerCase();
  if (shortMonths.some(m => lower.includes(m))) return true;
  return yearOrStatusPattern.test(text);
}

// Job title keywords for better detection
const jobKeywords = /(?:Engineer|Developer|Manager|Architect|Designer|Analyst|Specialist|Consultant|Coordinator|Officer|Administrator|Technician|Associate|Senior|Junior|Lead|Principal)/i;

/**
 * Parse resume text into structured JSON using reliable section detection
 */
function toStructuredResume(rawText) {
  // NORMALIZE: Add newlines and clean up text
  let text = (rawText || "")
    .replaceAll("\r", "")
    // Add newlines before section headers if missing (before any of these keywords)
    .replaceAll(sectionHeaderInsertPattern, "$1\n$2")
    .trim();

  console.log("[PARSER] Input text length:", text.length);
  console.log("[PARSER] After normalization, lines:", text.split('\n').length);

  const structured = {
    summary: { text: "" },
    skills: { items: [] },
    experience: [],
    projects: [],
  };

  // Find all section headers - more flexible regex that handles various formatting
  const headerRegex = /(?:Professional\s+Summary|Technical\s+Skills|Skills|Experience|Work\s+Experience|Employment|Projects?|Core\s+Competencies|Education|Leadership|Activities)/gim;

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
      name: match[0].trim().toLowerCase(),
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
  for (const section of sections) {
    const content = text.substring(section.contentStart, section.endIndex).trim();

    if (content.length === 0) continue;

    console.log(`[PARSER] Processing section: ${section.name} (${content.length} chars)`);

    if (/summary/.test(section.name)) {
      structured.summary.text = extractSummary(content);
    } else if (/skills?|technical|competencies/.test(section.name)) {
      structured.skills.items = extractSkills(content);
      console.log("[PARSER] Found", structured.skills.items.length, "skills:", structured.skills.items.slice(0, 10));
    } else if (/experience|work|employment|career/.test(section.name)) {
      parseExperience(structured, content);
      console.log("[PARSER] After experience parse: found", structured.experience.length, "jobs");
    } else if (/projects?|portfolio/.test(section.name)) {
      parseProjects(structured, content);
      console.log("[PARSER] After projects parse: found", structured.projects.length, "projects");
    }
  }

  // If no sections found or critical sections empty, try fallback
  if (sections.length === 0 || structured.skills.items.length === 0 || structured.experience.length === 0) {
    console.log("[PARSER] Sections missing or empty, attempting fallback parse...");
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
 * Extract and smart-truncate summary text from section content.
 */
function extractSummary(content) {
  let summaryText = content.trim();
  if (summaryText.length > 600) {
    const truncated = summaryText.substring(0, 600);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    summaryText = cutPoint > 300 ? summaryText.substring(0, cutPoint + 1) : truncated;
  }
  return summaryText.trim();
}

/**
 * Extract skills from section content, splitting by common delimiters.
 */
function extractSkills(content) {
  const skillsInput = content
    .split(/[,;•\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 50)
    .map(s => s.replace(/^[-•‣∙*]\s*/, ""));
  return Array.from(new Set(skillsInput)).slice(0, 80);
}

/**
 * FALLBACK: If standard parsing fails, try a very simple approach
 */
function fallbackParse(text, structured) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  console.log(`[PARSER-FALLBACK] Starting with ${lines.length} non-empty lines`);

  // If only 1-3 lines, the text might not have proper newlines. Use regex to extract
  if (lines.length <= 3) {
    fallbackRegexExtract(text, structured);
  } else {
    fallbackLineBasedExtract(lines, structured);
  }

  // Final cleanup: remove duplicates
  structured.skills.items = Array.from(new Set(structured.skills.items)).slice(0, 80);

  // Try to extract summary from first part of text if still empty
  if (structured.summary.text.length === 0) {
    fallbackExtractSummary(text, lines, structured);
  }

  console.log(`[PARSER-FALLBACK] FINAL: ${structured.skills.items.length} skills, ${structured.experience.length} jobs, ${structured.projects.length} projects`);
}

/**
 * Fallback regex-based extraction for text with very few line breaks.
 */
function fallbackRegexExtract(text, structured) {
  console.log(`[PARSER-FALLBACK] Very few lines, using regex extraction...`);

  // Find skills section
  const skillsSection = extractSectionByHeader(
    text,
    ["technical skills", "skills"],
    ["experience", "projects", "education"]
  );
  if (skillsSection) {
    const skillsList = skillsSection.split(/[\n,;•]+/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 60);
    structured.skills.items = Array.from(new Set(skillsList)).slice(0, 80);
    console.log(`[PARSER-FALLBACK] Extracted ${structured.skills.items.length} skills via section scan`);
  }

  // Find experience section
  fallbackExtractExperience(text, structured);

  // Find projects section
  fallbackExtractProjects(text, structured);
}

function findFirstHeader(textLower, headers, startAt = 0) {
  let bestIndex = -1;
  let bestHeader = "";
  for (const header of headers) {
    const idx = textLower.indexOf(header, startAt);
    if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
      bestIndex = idx;
      bestHeader = header;
    }
  }
  return { index: bestIndex, header: bestHeader };
}

function extractSectionByHeader(text, headers, stopHeaders) {
  const lower = text.toLowerCase();
  const startMatch = findFirstHeader(lower, headers);
  if (startMatch.index === -1) return "";

  let start = startMatch.index + startMatch.header.length;
  while (start < text.length && (text[start] === ':' || text[start] === ' ' || text[start] === '\n' || text[start] === '\t')) {
    start += 1;
  }

  const stopMatch = findFirstHeader(lower, stopHeaders, start);
  const end = stopMatch.index === -1 ? text.length : stopMatch.index;

  return text.substring(start, end).trim();
}

function extractDashLines(text) {
  return text
    .split(/[\n;]/)
    .map(line => line.trim())
    .filter(line => line.length > 5 && (line.includes("-") || line.includes("–")));
}

function parseYearsFromText(part) {
  const years = part.match(/\b\d{4}\b/g) || [];
  const lower = part.toLowerCase();
  if (years.length >= 2) return [years[0], years[1]];
  if (years.length === 1 && (lower.includes("present") || lower.includes("current"))) {
    return [years[0], "Present"];
  }
  return [];
}

/**
 * Extract experience entries from text using regex in fallback mode.
 */
function fallbackExtractExperience(text, structured) {
  const sectionText = extractSectionByHeader(
    text,
    ["work experience", "experience"],
    ["projects", "education", "skills"]
  );
  if (!sectionText) return;

  const jobMatches = extractDashLines(sectionText);

  for (const jobLine of jobMatches) {
    if (jobLine.length > 5) {
      const expId = `exp_${String(structured.experience.length + 1).padStart(2, '0')}`;
      const parts = jobLine.split(/[–-]/).map(p => p.trim());
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

/**
 * Extract project entries from text using regex in fallback mode.
 */
function fallbackExtractProjects(text, structured) {
  const sectionText = extractSectionByHeader(
    text,
    ["projects", "project"],
    ["education", "skills", "experience"]
  );
  if (!sectionText) return;

  const projMatches = extractDashLines(sectionText);

  for (const projLine of projMatches) {
    if (projLine.length > 5) {
      const projId = `proj_${String(structured.projects.length + 1).padStart(2, '0')}`;
      structured.projects.push({
        projId,
        name: projLine.split(/[–-]/)[0].trim(),
        bullets: []
      });
      console.log(`[PARSER-FALLBACK] Extracted project: "${projLine.substring(0, 50)}"`);
    }
  }
}

/**
 * Fallback line-based extraction when text has proper line breaks.
 */
function fallbackLineBasedExtract(lines, structured) {
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

/**
 * Fallback summary extraction from raw text when section parsing didn't find one.
 */
function fallbackExtractSummary(text, lines, structured) {
  const textStart = text.substring(0, 600).split(/(?:Professional\s+)?Summary[^.]*\./i)[0];
  if (textStart.length > 50) {
    structured.summary.text = textStart.trim();
    console.log("[PARSER-FALLBACK] Set summary from text");
  } else if (lines.length > 0) {
    structured.summary.text = lines.slice(0, 5).join(' ').substring(0, 600);
    console.log("[PARSER-FALLBACK] Set summary from first lines");
  }
}

/**
 * Detect if a line looks like a job header.
 */
function isJobHeaderLine(line, nextLine) {
  const hasSeparator = (line.includes(" - ") || line.includes(" | ") || line.includes(" , ")) && line.length < 120;
  const hasDateAndKeyword = hasDateToken(line) && jobKeywords.test(line);
  const nextLineHasDate = nextLine != null && hasDateToken(nextLine);
  const looksLikeHeader = line.length < 80 && jobKeywords.test(line) && nextLineHasDate;
  return hasSeparator || hasDateAndKeyword || looksLikeHeader;
}

/**
 * Classify a single part of a job header and assign it to the appropriate field.
 */
function classifyHeaderPart(part, currentExp) {
  if (hasDateToken(part)) {
    const years = parseYearsFromText(part);
    if (years.length === 2) {
      currentExp.start = years[0];
      currentExp.end = years[1];
    }
  } else if (jobKeywords.test(part)) {
    if (!currentExp.title) currentExp.title = part;
  } else if (part.length > 3) {
    if (!currentExp.company) currentExp.company = part;
    else if (!currentExp.title) currentExp.title = part;
  }
}

/**
 * Parse a job header line into title, company, and dates.
 */
function parseJobHeader(line, currentExp) {
  let separator = " , ";
  if (line.includes(" | ")) separator = " | ";
  else if (line.includes(" - ")) separator = " - ";
  const escapedSep = separator.replaceAll("|", String.raw`\|`);
  const parts = line.split(new RegExp(escapedSep));

  for (const rawPart of parts) {
    classifyHeaderPart(rawPart.trim(), currentExp);
  }

  // If we only got one part, treat it as title
  if (parts.length === 1) {
    currentExp.title = line;
  }
}

/**
 * Create a fresh experience entry object.
 */
function createExpEntry(expIndex) {
  return {
    expId: `exp_${String(expIndex).padStart(2, "0")}`,
    company: "",
    title: "",
    start: "",
    end: "",
    bullets: [],
  };
}

/**
 * Parse experience section into job entries with bullets.
 * Better detection: looks for date patterns, short header lines, and separators.
 */
function parseExperience(structured, content) {
  if (!content || content.length === 0) return;

  // Split content into lines, handling both \n and bullet separators
  const lines = content
    .split(/[\n•]/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  console.log("[PARSER] Experience section has", lines.length, "lines");

  let expIndex = 1;
  let currentExp = createExpEntry(expIndex);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
    const isJobHeader = isJobHeaderLine(line, nextLine);

    // If we detect a new job and current has bullets or title, save current job
    if (isJobHeader && (currentExp.bullets.length > 0 || currentExp.title)) {
      structured.experience.push(currentExp);
      expIndex += 1;
      currentExp = createExpEntry(expIndex);
    }

    if (isJobHeader) {
      parseJobHeader(line, currentExp);
    } else if (line.length > 10) {
      // This is a bullet point
      const bulletIndex = currentExp.bullets.length + 1;
      const bulletId = `b_exp_${String(expIndex).padStart(2, "0")}_${String(bulletIndex).padStart(3, "0")}`;
      currentExp.bullets.push({ bulletId, text: line });
    }
  }

  // Don't forget the last job
  if (currentExp.bullets.length > 0 || currentExp.title) {
    structured.experience.push(currentExp);
  }

  console.log("[PARSER] Parsed", structured.experience.length, "experience entries");
}

/**
 * Create a fresh project entry object.
 */
function createProjEntry(projIndex) {
  return {
    projId: `proj_${String(projIndex).padStart(2, "0")}`,
    name: "",
    bullets: [],
  };
}

function isProjectBulletLine(line) {
  return (
    line.length > 20 ||
    /^(?:Built|Developed|Implemented|Designed|Created|Used|Integrated|Wrote|Analyzed|Managed|Led)/i.test(line)
  );
}

function flushProjectTitleBuffer(currentProj, projectTitleBuffer) {
  if (projectTitleBuffer.length > 0) {
    currentProj.name = projectTitleBuffer.join(" ");
  }
  return [];
}

function startNextProject(structured, currentProj, projIndex, nextTitleBuffer = []) {
  structured.projects.push(currentProj);
  return {
    projIndex: projIndex + 1,
    currentProj: createProjEntry(projIndex + 1),
    projectTitleBuffer: nextTitleBuffer,
  };
}

function addProjectBullet(currentProj, projIndex, line) {
  const bulletIndex = currentProj.bullets.length + 1;
  const bulletId = `b_proj_${String(projIndex).padStart(2, "0")}_${String(bulletIndex).padStart(3, "0")}`;
  currentProj.bullets.push({ bulletId, text: line });
}

function handleProjectLine(structured, line, state) {
  const { currentProj, projectTitleBuffer, projIndex } = state;

  if (isProjectBulletLine(line)) {
    state.projectTitleBuffer = flushProjectTitleBuffer(currentProj, projectTitleBuffer);

    if (currentProj.bullets.length > 0 && !currentProj.name) {
      const nextState = startNextProject(structured, currentProj, projIndex);
      state.projIndex = nextState.projIndex;
      state.currentProj = nextState.currentProj;
      state.projectTitleBuffer = nextState.projectTitleBuffer;
    }

    addProjectBullet(state.currentProj, state.projIndex, line);
    return;
  }

  if (!currentProj.name && currentProj.bullets.length === 0) {
    projectTitleBuffer.push(line);
    return;
  }

  if (currentProj.bullets.length > 0) {
    const nextState = startNextProject(structured, currentProj, projIndex, [line]);
    state.projIndex = nextState.projIndex;
    state.currentProj = nextState.currentProj;
    state.projectTitleBuffer = nextState.projectTitleBuffer;
  }
}

/**
 * Parse projects section into project entries with bullets.
 * Extracts project names and associated bullet points.
 */
function parseProjects(structured, content) {
  if (!content || content.length === 0) return;

  const lines = content
    .split(/[\n•]/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  console.log("[PARSER] Projects section has", lines.length, "lines");

  const state = {
    projIndex: 1,
    currentProj: createProjEntry(1),
    projectTitleBuffer: [], // Collect short lines until we hit a longer one (bullet)
  };

  for (const line of lines) {
    handleProjectLine(structured, line, state);
  }

  // Handle any remaining buffered title
  if (state.projectTitleBuffer.length > 0 && !state.currentProj.name) {
    state.currentProj.name = state.projectTitleBuffer.join(" ");
  }

  // Save last project
  if (state.currentProj.name || state.currentProj.bullets.length > 0) {
    structured.projects.push(state.currentProj);
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
