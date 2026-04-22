"use strict";

const { Router } = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../helpers");
const { parseGeminiJson } = require("../resumeTailorHelpers");
const {
  resolveJobmotherIntents,
  buildIntentCatalogForPrompt,
} = require("../jobmotherIntentResolver");
const {
  buildJobmotherUserStateBlock,
  sanitizeJobmotherTips,
  parseNeedsClarification,
} = require("../jobmotherUserState");

const router = Router();

function extractFairIdFromPathname(pathname) {
  if (!pathname || typeof pathname !== "string") return null;
  const trimmed = pathname.trim();
  const m = trimmed.match(/^\/fair\/([^/]+)/);
  return m ? m[1] : null;
}

function pickFairId(bodyFairId, pathname) {
  if (bodyFairId != null && String(bodyFairId).trim()) {
    return String(bodyFairId).trim();
  }
  return extractFairIdFromPathname(pathname);
}

/**
 * POST /api/jobmother/navigate
 * Body: { message: string, pathname?: string, fairId?: string }
 */
router.post("/jobmother/navigate", verifyFirebaseToken, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ ok: false, error: "GEMINI_API_KEY is not configured" });
    }

    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      return res.status(400).json({ ok: false, error: "message is required" });
    }

    const pathname =
      typeof req.body.pathname === "string" ? req.body.pathname.slice(0, 2048) : "";
    const fairId = pickFairId(req.body.fairId, pathname);

    const userSnap = await db.collection("users").doc(req.user.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const u = userSnap.data() || {};
    const role = typeof u.role === "string" ? u.role : "";
    const companyId =
      u.companyId != null && String(u.companyId).trim() ? String(u.companyId).trim() : null;

    const userContext = { role, companyId, fairId };

    const catalog = buildIntentCatalogForPrompt();
    const contextBlock = [
      `User role: ${role || "(unknown)"}`,
      companyId ? `User companyId: ${companyId}` : "User has no companyId on profile.",
      fairId ? `Active fairId (from client or URL): ${fairId}` : "No fair context (not on a /fair/... page unless client sent fairId).",
      pathname ? `Current pathname: ${pathname}` : "No pathname sent.",
    ].join("\n");

    let userStateBlock = "";
    try {
      userStateBlock = await buildJobmotherUserStateBlock(req.user.uid, u, fairId);
    } catch (stateErr) {
      console.error("[jobmother] user state block:", stateErr);
      userStateBlock = "User state (for context only): unavailable.";
    }

    const prompt = `You are the Fairy Jobmother, a warm, concise guide for the Job Goblin virtual career fair app.

${catalog}

${contextBlock}

${userStateBlock}

User message:
"""
${message.slice(0, 4000)}
"""

Respond with JSON only (no markdown), shape:
{
  "reply": "short friendly message in Fairy Jobmother voice (1-4 sentences)",
  "intents": [ { "id": "INTENT_ID_FROM_LIST" } ],
  "needsClarification": false,
  "tips": []
}

Rules:
- Use only intent ids from the catalog list. Never invent new ids.
- Never include URLs, paths, or route strings in "reply", "tips", or anywhere else.
- "tips": array of 0 to 3 short one-sentence strings with practical career-fair or in-app advice (booths, calls, resumes). Use [] if the user only asked for navigation. Tips should complement "reply", not duplicate it.
- Order "intents" by most helpful first (max about 5; the server will trim).
- If the user is vague, set needsClarification true and use CLARIFY as the only intent or pair with one safe intent like GO_DASHBOARD.
`;

    const modelName = "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.25,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsedResult = parseGeminiJson(text);
    if (parsedResult.error) {
      console.error("[jobmother] Gemini JSON parse error:", parsedResult.error);
      return res.status(502).json({
        ok: false,
        error: "Assistant returned invalid data. Try again.",
      });
    }

    const parsed = parsedResult.parsed || {};
    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim().slice(0, 2000)
        : "I’m not quite sure where to send you—try rephrasing, or open your dashboard from the sidebar.";

    const intents = Array.isArray(parsed.intents) ? parsed.intents : [];
    const { links } = resolveJobmotherIntents(intents, userContext);
    const tips = sanitizeJobmotherTips(parsed);
    const needsClarification = parseNeedsClarification(parsed);

    return res.json({ ok: true, reply, links, tips, needsClarification });
  } catch (err) {
    console.error("[jobmother] navigate error:", err);
    return res.status(500).json({ ok: false, error: "Navigation assistant failed" });
  }
});

module.exports = router;
