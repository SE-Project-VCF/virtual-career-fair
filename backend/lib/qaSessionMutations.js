/**
 * Shared Q&A booth session mutation logic (Firestore array updates, auth checks).
 * Extracted for testability and lower cognitive complexity in server routes.
 */

function employerAuthorizedForQaBooth(boothData, employerCompanyId, employerId) {
  return boothData.companyId === employerCompanyId || boothData.employerId === employerId;
}

async function deleteQaSessionAtBooth(fairBoothRef, boothData, boothId, sessionId, admin) {
  if (boothData.qaSessions && Array.isArray(boothData.qaSessions)) {
    const sessionToDelete = boothData.qaSessions.find((s) => s.id === sessionId);
    if (sessionToDelete) {
      await fairBoothRef.update({
        qaSessions: admin.firestore.FieldValue.arrayRemove(sessionToDelete),
      });
      return "deleted";
    }
    return "missing_in_array";
  }
  if (boothData.qaSession && boothId === sessionId) {
    await fairBoothRef.update({
      qaSession: admin.firestore.FieldValue.delete(),
    });
    return "deleted";
  }
  return "not_found";
}

function applyQaSessionArrayItemUpdates(existingSession, body, admin) {
  const { title, description, scheduledTime, duration } = body;
  return {
    ...existingSession,
    title: title !== undefined ? title : existingSession.title,
    description: description !== undefined ? description : existingSession.description,
    scheduledTime: scheduledTime
      ? admin.firestore.Timestamp.fromDate(new Date(scheduledTime))
      : existingSession.scheduledTime,
    duration:
      duration !== undefined
        ? Number.parseInt(String(duration), 10)
        : existingSession.duration,
    updatedAt: admin.firestore.Timestamp.now(),
  };
}

async function tryPutQaSessionAtFairBooth(
  fairBoothRef,
  fairBoothDoc,
  sessionId,
  employerCompanyId,
  employerId,
  body,
  admin
) {
  if (!fairBoothDoc.exists) {
    return { code: "skip" };
  }
  const boothData = fairBoothDoc.data();
  if (!employerAuthorizedForQaBooth(boothData, employerCompanyId, employerId)) {
    return { code: "forbidden" };
  }
  if (!boothData.qaSessions || !Array.isArray(boothData.qaSessions)) {
    return { code: "session_not_found" };
  }
  const sessionIndex = boothData.qaSessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex === -1) {
    return { code: "session_not_found" };
  }
  const updatedSession = applyQaSessionArrayItemUpdates(
    boothData.qaSessions[sessionIndex],
    body,
    admin
  );
  const newSessions = [
    ...boothData.qaSessions.slice(0, sessionIndex),
    updatedSession,
    ...boothData.qaSessions.slice(sessionIndex + 1),
  ];
  await fairBoothRef.update({ qaSessions: newSessions });
  return { code: "updated", session: updatedSession };
}

function validatePutQaSessionRequestBody(body) {
  const { title, description, scheduledTime, duration } = body;
  if (!title && !description && !scheduledTime && !duration) {
    return { ok: false, status: 400, error: "No fields to update" };
  }
  if (scheduledTime) {
    const sessionTime = new Date(scheduledTime);
    if (sessionTime <= new Date()) {
      return { ok: false, status: 400, error: "Scheduled time must be in the future" };
    }
  }
  if (duration && (duration <= 0 || duration > 480)) {
    return { ok: false, status: 400, error: "Duration must be between 1 and 480 minutes" };
  }
  return { ok: true };
}

function sendPutQaSessionOutcomeResponse(res, outcome) {
  if (outcome.code === "skip") {
    return false;
  }
  if (outcome.code === "forbidden") {
    res.status(403).json({ error: "Not authorized to manage this booth" });
    return true;
  }
  if (outcome.code === "updated") {
    console.log("[Q&A Edit] Q&A session updated");
    res.json({
      success: true,
      message: "Q&A session updated successfully",
      session: outcome.session,
    });
    return true;
  }
  res.status(404).json({ error: "No Q&A session found with that ID" });
  return true;
}

async function tryDeleteQaSessionAtFairBooth(
  fairBoothRef,
  fairBoothDoc,
  boothId,
  sessionId,
  employerCompanyId,
  employerId,
  admin
) {
  if (!fairBoothDoc.exists) {
    return { code: "skip" };
  }
  const boothData = fairBoothDoc.data();
  if (!employerAuthorizedForQaBooth(boothData, employerCompanyId, employerId)) {
    return { code: "forbidden" };
  }
  const outcome = await deleteQaSessionAtBooth(fairBoothRef, boothData, boothId, sessionId, admin);
  if (outcome === "deleted") {
    return { code: "deleted" };
  }
  return { code: "session_not_found" };
}

function sendDeleteQaSessionOutcomeResponse(res, outcome) {
  if (outcome.code === "skip") {
    return false;
  }
  if (outcome.code === "forbidden") {
    res.status(403).json({ error: "Not authorized to manage this booth" });
    return true;
  }
  if (outcome.code === "deleted") {
    res.json({
      success: true,
      message: "Q&A session deleted successfully",
    });
    return true;
  }
  res.status(404).json({ error: "No Q&A session found with that ID" });
  return true;
}

module.exports = {
  employerAuthorizedForQaBooth,
  deleteQaSessionAtBooth,
  applyQaSessionArrayItemUpdates,
  tryPutQaSessionAtFairBooth,
  validatePutQaSessionRequestBody,
  sendPutQaSessionOutcomeResponse,
  tryDeleteQaSessionAtFairBooth,
  sendDeleteQaSessionOutcomeResponse,
};
