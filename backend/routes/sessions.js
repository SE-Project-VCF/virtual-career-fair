const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../helpers");
const { streamServerClient } = require("../streamServerClient");
const {
  tryPutQaSessionAtFairBooth,
  validatePutQaSessionRequestBody,
  sendPutQaSessionOutcomeResponse,
  tryDeleteQaSessionAtFairBooth,
  sendDeleteQaSessionOutcomeResponse,
} = require("../lib/qaSessionMutations");

/**
 * Employer creates Q&A session
 * POST /api/sessions/create-qa
 */
router.post("/sessions/create-qa", verifyFirebaseToken, async (req, res) => {
  try {
    const {
      fairId,
      title,
      description,
      scheduledTime,
      maxDuration,
    } = req.body;
    const employerId = req.user.uid;

    if (!fairId || !title || !scheduledTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const employerDoc = await db.collection("users").doc(employerId).get();
    const employerData = employerDoc.data();

    const sessionRef = db.collection("video_sessions").doc();
    const sessionId = sessionRef.id;
    const jitsiRoom = `qna_session_${sessionId}`;
    const channelId = `qna_session_${sessionId}`;

    try {
      const channel = streamServerClient.channel("messaging", channelId, {
        created_by_id: employerId,
      });
      await channel.create();
    } catch (channelErr) {
      console.error("StreamChat channel creation error:", channelErr);
    }

    const sessionData = {
      sessionId,
      fairId,
      employerId,
      employerName: employerData.name || employerData.firstName || "",
      employerEmail: employerData.email || "",
      title,
      description: description || "",
      scheduledTime: admin.firestore.Timestamp.fromDate(new Date(scheduledTime)),
      maxDuration: maxDuration || 60,
      isLive: false,
      attendees: {},
      jitsiRoom,
      streamChatChannelId: channelId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startedAt: null,
      endedAt: null,
    };

    await sessionRef.set(sessionData);

    return res.json({
      success: true,
      sessionId,
      message: "Q&A session created",
    });
  } catch (err) {
    console.error("POST /api/sessions/create-qa error:", err);
    return res.status(500).json({ error: "Failed to create Q&A session" });
  }
});

/**
 * Get active Q&A sessions for a fair
 * GET /api/sessions/active/{fairId}
 */
router.get("/sessions/active/:fairId", verifyFirebaseToken, async (req, res) => {
  try {
    const { fairId } = req.params;

    const sessionsSnapshot = await db
      .collection("video_sessions")
      .where("fairId", "==", fairId)
      .where("isLive", "==", true)
      .orderBy("scheduledTime", "desc")
      .get();

    const sessions = sessionsSnapshot.docs.map((doc) => ({
      sessionId: doc.id,
      ...doc.data(),
      scheduledTime: doc.data().scheduledTime?.toMillis() || null,
      createdAt: doc.data().createdAt?.toMillis() || null,
      startedAt: doc.data().startedAt?.toMillis() || null,
      endedAt: doc.data().endedAt?.toMillis() || null,
    }));

    return res.json({ success: true, sessions });
  } catch (err) {
    console.error("GET /api/sessions/active/:fairId error:", err);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

/**
 * Join Q&A session
 * POST /api/sessions/{sessionId}/join
 */
router.post("/sessions/:sessionId/join", verifyFirebaseToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.uid;

    const sessionDoc = await db.collection("video_sessions").doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sessionData = sessionDoc.data();
    const userDoc = await db.collection("users").doc(userId).get();
    const userName = userDoc.data().name || userDoc.data().firstName || "";

    await db.collection("video_sessions").doc(sessionId).update({
      [`attendees.${userId}`]: {
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        role: userId === sessionData.employerId ? "employer" : "student",
        isMuted: true,
        isVideoOn: true,
      },
    });

    try {
      const channel = streamServerClient.channel("messaging", sessionData.streamChatChannelId);
      await channel.addMembers([userId]);
    } catch (err) {
      console.error("StreamChat add member error:", err);
    }

    return res.json({
      success: true,
      sessionId,
      jitsiRoom: sessionData.jitsiRoom,
      streamChatChannelId: sessionData.streamChatChannelId,
      userName,
    });
  } catch (err) {
    console.error("POST /api/sessions/:sessionId/join error:", err);
    return res.status(500).json({ error: "Failed to join session" });
  }
});

/* ============================================================
   EMPLOYER BOOTH & QA SESSION ROUTES
============================================================ */

/**
 * Get employer's booths with fair information
 * GET /api/employer/booths
 */
router.get("/employer/booths", verifyFirebaseToken, async (req, res) => {
  try {
    const employerId = req.user.uid;

    const userDoc = await db.collection("users").doc(employerId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const employerCompanyId = userData.companyId;

    if (!employerCompanyId) {
      return res.json({ success: true, booths: [] });
    }

    const fairsSnapshot = await db.collection("fairs").get();
    const booths = [];

    for (const fairDoc of fairsSnapshot.docs) {
      const fairId = fairDoc.id;
      const fairData = fairDoc.data();
      const fairName = fairData.name || "Unknown Fair";

      const boothsSnapshot = await db
        .collection("fairs")
        .doc(fairId)
        .collection("booths")
        .get();

      for (const boothDoc of boothsSnapshot.docs) {
        const boothData = boothDoc.data();
        if (boothData.companyId === employerCompanyId || boothData.employerId === employerId) {
          booths.push({
            id: boothDoc.id,
            name: boothData.name || "Unnamed Booth",
            fairId,
            fairName,
            companyId: boothData.companyId,
            employerId: boothData.employerId,
          });
        }
      }
    }

    return res.json({ success: true, booths });
  } catch (err) {
    console.error("GET /api/employer/booths error:", err);
    return res.status(500).json({ error: "Failed to fetch booths" });
  }
});

function employerCanAccessBooth(boothData, employerId, companyId) {
  return (
    boothData.employerId === employerId ||
    boothData.companyId === employerId ||
    boothData.companyId === companyId
  );
}

function pushEmployerQaSessionsFromBooth(boothDoc, boothData, fairName, sessions) {
  const boothName = boothData.name || "Unnamed Booth";
  if (boothData.qaSessions && Array.isArray(boothData.qaSessions)) {
    for (const qaSession of boothData.qaSessions) {
      sessions.push({
        sessionId: qaSession.id,
        boothId: boothDoc.id,
        boothName,
        fairName,
        title: qaSession.title || "Q&A Session",
        description: qaSession.description,
        scheduledTime: qaSession.scheduledTime?.toMillis?.() || qaSession.scheduledTime || null,
        duration: qaSession.duration || 60,
        createdAt: qaSession.createdAt?.toMillis?.() || qaSession.createdAt || null,
        status: qaSession.status || "scheduled",
      });
    }
    return;
  }
  if (!boothData.qaSession) {
    return;
  }
  const qaSession = boothData.qaSession;
  sessions.push({
    sessionId: boothDoc.id,
    boothId: boothDoc.id,
    boothName,
    fairName,
    title: qaSession.title || "Q&A Session",
    description: qaSession.description,
    scheduledTime: qaSession.scheduledTime?.toMillis?.() || qaSession.scheduledTime || null,
    duration: qaSession.duration || 60,
    createdAt: qaSession.createdAt?.toMillis?.() || qaSession.createdAt || null,
    status: qaSession.status || "scheduled",
  });
}

/**
 * Get all Q&A sessions for employer's company
 * GET /api/employer/qa-sessions
 */
router.get("/employer/qa-sessions", verifyFirebaseToken, async (req, res) => {
  try {
    const employerId = req.user.uid;

    const userDoc = await db.collection("users").doc(employerId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const companyId = userData.companyId;

    if (!companyId) {
      return res.json({ success: true, sessions: [] });
    }

    const sessions = [];
    const fairsSnapshot = await db.collection("fairs").get();

    for (const fairDoc of fairsSnapshot.docs) {
      const fairId = fairDoc.id;
      const fairData = fairDoc.data();
      const fairName = fairData.name || "Unknown Fair";

      const boothsSnapshot = await db.collection("fairs").doc(fairId).collection("booths").get();

      for (const boothDoc of boothsSnapshot.docs) {
        const boothData = boothDoc.data();
        if (!employerCanAccessBooth(boothData, employerId, companyId)) {
          continue;
        }
        pushEmployerQaSessionsFromBooth(boothDoc, boothData, fairName, sessions);
      }
    }

    sessions.sort((a, b) => {
      const timeA = typeof a.scheduledTime === "number" ? a.scheduledTime : new Date(a.scheduledTime).getTime();
      const timeB = typeof b.scheduledTime === "number" ? b.scheduledTime : new Date(b.scheduledTime).getTime();
      return timeB - timeA;
    });

    return res.json({ success: true, sessions });
  } catch (err) {
    console.error("GET /api/employer/qa-sessions error:", err);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

/**
 * Schedule Q&A session for a specific booth
 * POST /api/booth/:boothId/schedule-qa-session
 */
router.post("/booth/:boothId/schedule-qa-session", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const { title, description, scheduledTime, duration } = req.body;
    const employerId = req.user.uid;

    if (!title || !scheduledTime || !duration) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sessionTime = new Date(scheduledTime);
    if (sessionTime <= new Date()) {
      return res.status(400).json({ error: "Scheduled time must be in the future" });
    }

    if (duration <= 0 || duration > 480) {
      return res.status(400).json({ error: "Duration must be between 1 and 480 minutes" });
    }

    let boothRef = null;
    let boothData = null;

    const fairsSnapshot = await db.collection("fairs").get();
    for (const fairDoc of fairsSnapshot.docs) {
      const fairBoothRef = db
        .collection("fairs")
        .doc(fairDoc.id)
        .collection("booths")
        .doc(boothId);
      const fairBoothDoc = await fairBoothRef.get();

      if (fairBoothDoc.exists) {
        boothRef = fairBoothRef;
        boothData = fairBoothDoc.data();
        break;
      }
    }

    if (!boothRef || !boothData) {
      return res.status(404).json({ error: "Booth not found" });
    }

    const userDoc = await db.collection("users").doc(employerId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userDoc.data();
    const employerCompanyId = userData.companyId;

    if (
      boothData.companyId !== employerCompanyId &&
      boothData.employerId !== employerId
    ) {
      return res.status(403).json({ error: "Not authorized to manage this booth" });
    }

    const jitsiRoom = `qa-session-${boothId}-${Date.now()}`;
    const channelId = `qa-session-${boothId}-${Date.now()}`;
    try {
      const channel = streamServerClient.channel("messaging", channelId, {
        created_by_id: employerId,
      });
      await channel.create();
    } catch (channelErr) {
      console.error("StreamChat channel creation error:", channelErr);
    }

    const sessionId = `session-${Date.now()}`;
    const qaSessionData = {
      id: sessionId,
      title,
      description: description || "",
      scheduledTime: admin.firestore.Timestamp.fromDate(sessionTime),
      duration: Number.parseInt(String(duration), 10),
      jitsiRoom,
      streamChatChannelId: channelId,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: employerId,
      status: "scheduled",
    };

    await boothRef.update({
      qaSessions: admin.firestore.FieldValue.arrayUnion(qaSessionData),
    });

    return res.json({
      success: true,
      sessionId: sessionId,
      message: "Q&A session scheduled successfully",
    });
  } catch (err) {
    console.error("POST /api/booth/:boothId/schedule-qa-session error:", err);
    return res.status(500).json({ error: "Failed to schedule session" });
  }
});

/* ============================================================
   BOOTH Q&A SESSION HELPERS
============================================================ */

function qaSessionScheduledTimeMs(s) {
  const st = s?.scheduledTime;
  if (st && typeof st === "object" && typeof st.toMillis === "function") {
    return st.toMillis();
  }
  if (typeof st === "number") {
    return st;
  }
  return new Date(st).getTime();
}

async function ensureQaSessionDocExists(session, boothId) {
  const qaSessionRef = db.collection("qa_sessions").doc(session.id);
  try {
    const qaSessionDoc = await qaSessionRef.get();
    if (qaSessionDoc.exists) {
      return;
    }
    await qaSessionRef.set({
      sessionId: session.id,
      boothId: boothId,
      title: session.title,
      description: session.description,
      scheduledTime: admin.firestore.Timestamp.fromMillis(session.scheduledTime),
      duration: session.duration,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (docErr) {
    console.error("[Q&A Session] Error ensuring Q&A session document:", docErr.message);
  }
}

function mapUpcomingQaSessionsForBooth(boothData, now) {
  return boothData.qaSessions
    .map((s) => ({
      ...s,
      scheduledTimeMs: qaSessionScheduledTimeMs(s),
    }))
    .filter((s) => s.scheduledTimeMs + s.duration * 60 * 1000 > now - 15 * 60 * 1000)
    .sort((a, b) => a.scheduledTimeMs - b.scheduledTimeMs)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      scheduledTime: s.scheduledTimeMs,
      duration: s.duration,
      jitsiRoom: s.jitsiRoom,
      streamChatChannelId: s.streamChatChannelId,
      status: s.status,
    }));
}

async function buildQaSessionsArrayPayload(boothData, boothId, now) {
  const upcomingSessions = mapUpcomingQaSessionsForBooth(boothData, now);
  for (const session of upcomingSessions) {
    await ensureQaSessionDocExists(session, boothId);
  }
  return {
    success: true,
    qaSessions: upcomingSessions,
    qaSession: upcomingSessions.length > 0 ? upcomingSessions[0] : null,
  };
}

async function buildLegacyQaSessionPayload(boothData, boothId) {
  const qaSession = boothData.qaSession;
  const sessionId = qaSession.id || boothId;
  const qaSessionRef = db.collection("qa_sessions").doc(sessionId);
  const qaSessionDoc = await qaSessionRef.get();
  if (!qaSessionDoc.exists) {
    try {
      await qaSessionRef.set(
        {
          sessionId: sessionId,
          boothId: boothId,
          title: qaSession.title,
          description: qaSession.description,
          scheduledTime: qaSession.scheduledTime
            ? admin.firestore.Timestamp.fromDate(new Date(qaSession.scheduledTime))
            : admin.firestore.FieldValue.serverTimestamp(),
          duration: qaSession.duration || 60,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("[Q&A Session] Failed to create Firestore document for legacy session:", err.message);
    }
  }
  const row = {
    id: sessionId,
    title: qaSession.title,
    description: qaSession.description,
    scheduledTime: qaSession.scheduledTime?.toMillis?.() || qaSession.scheduledTime,
    duration: qaSession.duration,
    jitsiRoom: qaSession.jitsiRoom,
    streamChatChannelId: qaSession.streamChatChannelId,
    status: qaSession.status,
  };
  return {
    success: true,
    qaSessions: [row],
    qaSession: {
      title: qaSession.title,
      description: qaSession.description,
      scheduledTime: qaSession.scheduledTime?.toMillis?.() || qaSession.scheduledTime,
      duration: qaSession.duration,
      jitsiRoom: qaSession.jitsiRoom,
      streamChatChannelId: qaSession.streamChatChannelId,
      status: qaSession.status,
    },
  };
}

/**
 * Get booth's Q&A sessions (all upcoming sessions)
 * GET /api/booth/:boothId/qa-session
 */
router.get("/booth/:boothId/qa-session", async (req, res) => {
  try {
    const { boothId } = req.params;

    const fairsSnapshot = await db.collection("fairs").get();
    const now = Date.now();

    for (const fairDoc of fairsSnapshot.docs) {
      const fairBoothRef = db.collection("fairs").doc(fairDoc.id).collection("booths").doc(boothId);
      const fairBoothDoc = await fairBoothRef.get();

      if (!fairBoothDoc.exists) {
        continue;
      }

      const boothData = fairBoothDoc.data();

      if (boothData.qaSessions && Array.isArray(boothData.qaSessions)) {
        const payload = await buildQaSessionsArrayPayload(boothData, boothId, now);
        return res.json(payload);
      }

      if (boothData.qaSession) {
        const payload = await buildLegacyQaSessionPayload(boothData, boothId);
        return res.json(payload);
      }
    }

    return res.json({ success: true, qaSessions: [], qaSession: null });
  } catch (err) {
    console.error("GET /api/booth/:boothId/qa-session error:", err);
    return res.status(500).json({ error: "Failed to fetch booth sessions" });
  }
});

/**
 * Cancel/Delete Q&A session for a booth
 * DELETE /api/booth/:boothId/qa-session/:sessionId
 */
router.delete("/booth/:boothId/qa-session/:sessionId", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId, sessionId } = req.params;
    const employerId = req.user.uid;

    const userDoc = await db.collection("users").doc(employerId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userDoc.data();
    const employerCompanyId = userData.companyId;

    const fairsSnapshot = await db.collection("fairs").get();

    for (const fairDoc of fairsSnapshot.docs) {
      const fairBoothRef = db.collection("fairs").doc(fairDoc.id).collection("booths").doc(boothId);
      const fairBoothDoc = await fairBoothRef.get();

      const outcome = await tryDeleteQaSessionAtFairBooth(
        fairBoothRef,
        fairBoothDoc,
        boothId,
        sessionId,
        employerCompanyId,
        employerId,
        admin
      );
      if (sendDeleteQaSessionOutcomeResponse(res, outcome)) {
        return;
      }
    }

    return res.status(404).json({ error: "Booth not found" });
  } catch (err) {
    console.error("DELETE /api/booth/:boothId/qa-session/:sessionId error:", err);
    return res.status(500).json({ error: "Failed to delete session" });
  }
});

/**
 * Edit Q&A session for a booth
 * PUT /api/booth/:boothId/qa-session/:sessionId
 */
router.put("/booth/:boothId/qa-session/:sessionId", verifyFirebaseToken, async (req, res) => {
  try {
    const validation = validatePutQaSessionRequestBody(req.body);
    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const { boothId, sessionId } = req.params;
    const employerId = req.user.uid;

    const userDoc = await db.collection("users").doc(employerId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const employerCompanyId = userDoc.data().companyId;

    const fairsSnapshot = await db.collection("fairs").get();
    for (const fairDoc of fairsSnapshot.docs) {
      const fairBoothRef = db
        .collection("fairs")
        .doc(fairDoc.id)
        .collection("booths")
        .doc(boothId);
      const fairBoothDoc = await fairBoothRef.get();

      const outcome = await tryPutQaSessionAtFairBooth(
        fairBoothRef,
        fairBoothDoc,
        sessionId,
        employerCompanyId,
        employerId,
        req.body,
        admin
      );

      if (sendPutQaSessionOutcomeResponse(res, outcome)) {
        return;
      }
    }

    return res.status(404).json({ error: "Booth not found" });
  } catch (err) {
    console.error("PUT /api/booth/:boothId/qa-session/:sessionId error:", err);
    return res.status(500).json({ error: "Failed to update session" });
  }
});

module.exports = router;
