/**
 * Simple Resume Tailor with Change Tracking
 * Asks Gemini to identify specific changes and explain them
 * Returns: Structured array of changes with reasons for user approval/rejection
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateResumeChanges(resumeRawText, jobDescription, jobTitle = "Software Engineer") {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.6,
    },
  });

  const prompt = `You are a professional resume editor. Analyze the following resume and identify specific changes needed to match the job description.

For each change, provide:
1. The EXACT original text from the resume (or "N/A" if adding new content)
2. The EXACT replacement text (or empty for deletions)
3. The section name (e.g., "Professional Summary", "Experience - Company X", "Skills")
4. WHY this change makes the resume better for the job

Job Title: ${jobTitle}

Job Description:
${jobDescription}

---

Resume to tailor:
${resumeRawText}

---

Return a JSON array of changes. Each change object must have:
{
  "type": "edit|add|remove",
  "section": "section name",
  "original": "exact original text or null for additions",
  "replacement": "exact replacement text or null for removals",
  "reason": "why this change improves the resume for the job"
}

Return ONLY valid JSON array, no other text.`;

  try {
    const response = await model.generateContent(prompt);
    const responseText = response.response.text().trim();
    
    // Extract JSON if it's wrapped in code blocks
    let jsonText = responseText;
    if (responseText.includes('```json')) {
      jsonText = responseText.split('```json')[1].split('```')[0].trim();
    } else if (responseText.includes('```')) {
      jsonText = responseText.split('```')[1].split('```')[0].trim();
    }

    const changes = JSON.parse(jsonText);
    if (!Array.isArray(changes)) {
      throw new Error("Response is not an array");
    }

    return changes;
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    throw new Error(`Failed to generate changes: ${error.message}`);
  }
}

async function applyChanges(resumeRawText, approvedChanges) {
  /**
   * Apply approved changes to the resume
   * approvedChanges: array of change objects from user approvals
   * Returns: modified resume text
   */
  let result = resumeRawText;

  // Sort changes by type: remove first (to avoid offset issues), then edit, then add
  const sortedChanges = approvedChanges.sort((a, b) => {
    const typeOrder = { remove: 0, edit: 1, add: 2 };
    return typeOrder[a.type] - typeOrder[b.type];
  });

  for (const change of sortedChanges) {
    if (change.type === "remove" && change.original) {
      result = result.replace(change.original, "");
    } else if (change.type === "edit" && change.original && change.replacement) {
      result = result.replace(change.original, change.replacement);
    } else if (change.type === "add" && change.replacement) {
      // Add changes are appended or inserted at appropriate section
      result += "\n" + change.replacement;
    }
  }

  // Clean up extra whitespace
  result = result
    .replace(/\n\n\n+/g, "\n\n") // Multiple blank lines to double
    .trim();

  return result;
}

async function reformatResumeWithGemini(resumeText) {
  /**
   * Use Gemini to fully reformat a resume into professional appearance
   * This is the key step - Gemini understands resume structure and can fix malformed text
   */
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
    },
  });

  const prompt = `You are a professional resume formatter. Your task is to take the following resume text and fully reformat it to look like a polished, professional resume document.

CRITICAL: Keep every single piece of content exactly as provided. Do not omit anything, do not add anything, do not change the meaning of anything. Just reformat and organize it beautifully.

Instructions:
- Use clear section headers (PROFESSIONAL SUMMARY, TECHNICAL SKILLS, EDUCATION, EXPERIENCE, PROJECTS, LEADERSHIP & ACTIVITIES, etc.)
- Add appropriate spacing - double blank lines between major sections
- For each job/position: "Job Title - Company Name | Month Year - Month Year" (or similar clear format)
- Each bullet point should start with "• " and be on its own line
- Fix minor spacing issues like "real - world" to "real-world"
- Section headers should be capitalized and on single lines
- Make it visually organized and easy to read
- Keep ALL content from the input

Input resume:
${resumeText}

Output: Return ONLY the reformatted resume text, nothing else.`;

  try {
    console.log("[REFORMAT] Calling Gemini with resume length:", resumeText.length);
    const response = await model.generateContent(prompt);
    const formattedResume = response.response.text().trim();
    console.log("[REFORMAT] Gemini returned formatted resume length:", formattedResume.length);
    console.log("[REFORMAT] First 200 chars:", formattedResume.substring(0, 200));
    return formattedResume;
  } catch (error) {
    console.error("[REFORMAT] Error reformatting resume with Gemini:", error);
    console.log("[REFORMAT] Falling back to original text");
    // If Gemini formatting fails, return original text
    return resumeText;
  }
}

module.exports = { generateResumeChanges, applyChanges, reformatResumeWithGemini };
