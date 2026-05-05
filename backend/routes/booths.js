const { Router } = require("express");
const { db } = require("../firebase");
const admin = require("firebase-admin");
const {
  verifyFirebaseToken,
  checkCompanyAuthorization,
  resolveBooth,
  removeUndefined,
  verifyAdmin,
} = require("../helpers");
const upload = require("../middleware/upload");

const router = Router();

/* ----------------------------------------------------
   ADD BOOTH
---------------------------------------------------- */
router.post("/booths", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId, boothName, location, description, representatives } =
      req.body;

    if (!companyId || !boothName) {
      return res
        .status(400)
        .send({ success: false, error: "Missing required fields" });
    }

    // Validate input lengths
    if (boothName && boothName.length > 200) {
      return res
        .status(400)
        .send({ success: false, error: "Booth name must be 200 characters or less" });
    }

    if (location && location.length > 200) {
      return res
        .status(400)
        .send({ success: false, error: "Location must be 200 characters or less" });
    }

    if (description && description.length > 2000) {
      return res
        .status(400)
        .send({ success: false, error: "Description must be 2000 characters or less" });
    }


    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).send({ success: false, error: authResult.error });
    }


    // Sanitize text inputs (trim whitespace, remove null bytes)
    const sanitizedBoothName = boothName ? boothName.trim().replaceAll('\0', '') : boothName;
    const sanitizedLocation = location ? location.trim().replaceAll('\0', '') : location;
    const sanitizedDescription = description ? description.trim().replaceAll('\0', '') : description;

    const boothRef = await db.collection("booths").add(
      removeUndefined({
        companyId,
        boothName: sanitizedBoothName,
        location: sanitizedLocation,
        description: sanitizedDescription,
        representatives,
        createdAt: admin.firestore.Timestamp.now(),
      })
    );

    res.send({ success: true, boothId: boothRef.id });
  } catch (err) {
    console.error("Error adding booth:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

/* ----------------------------------------------------
   LIST BOOTHS FOR A COMPANY
---------------------------------------------------- */
router.get("/booths", verifyFirebaseToken, async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }

  try {
    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403)
        .json({ error: authResult.error });
    }

    const boothsSnap = await db.collection("booths").where("companyId", "==", companyId).get();
    const booths = boothsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Legacy support: if company.boothId points to a booth not already in the list, include it
    const companyDoc = await db.collection("companies").doc(companyId).get();
    const legacyBoothId = companyDoc.exists ? companyDoc.data().boothId : null;
    if (legacyBoothId && !booths.some((b) => b.id === legacyBoothId)) {
      const legacyBoothDoc = await db.collection("booths").doc(legacyBoothId).get();
      if (legacyBoothDoc.exists) {
        booths.unshift({ id: legacyBoothDoc.id, ...legacyBoothDoc.data() });
      }
    }

    return res.json({ booths });
  } catch (err) {
    console.error("GET /api/booths error:", err);
    return res.status(500).json({ error: "Failed to fetch booths" });
  }
});

/* ----------------------------------------------------
   DELETE A BOOTH
---------------------------------------------------- */
router.delete("/booths/:boothId", verifyFirebaseToken, async (req, res) => {
  const { boothId } = req.params;

  try {
    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) {
      return res.status(404).json({ error: "Booth not found" });
    }

    const boothData = boothDoc.data();
    if (!boothData.companyId) {
      return res.status(400).json({ error: "Booth has no associated company" });
    }

    const authResult = await checkCompanyAuthorization(boothData.companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403).json({ error: authResult.error });
    }

    await db.collection("booths").doc(boothId).delete();
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/booths/:boothId error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete booth" });
  }
});

/* ----------------------------------------------------
   UPLOAD BOOTH LOGO TO FIREBASE STORAGE (via backend)
   Uses Firebase Admin SDK to bypass client-side CORS issues
---------------------------------------------------- */
router.post("/upload-booth-logo", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.uid;
    const { companyId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID required" });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File size must be under 5MB" });
    }

    // Create storage reference using Admin SDK
    const bucket = admin.storage().bucket();
    const fileName = `${Date.now()}-${file.originalname.replaceAll(/[^\w.\-() ]/g, "_")}`;
    const filePath = `boothLogos/${companyId}/${userId}/${fileName}`;
    const fileRef = bucket.file(filePath);

    // Upload the file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Store the file path in response (not a URL)
    // Client will call /api/get-booth-logo-url to get a signed URL when viewing
    return res.json({
      success: true,
      filePath: `boothLogos/${companyId}/${userId}/${fileName}`,
      message: "Logo uploaded successfully",
    });
  } catch (err) {
    console.error("Booth logo upload error:", err);
    return res.status(500).json({ error: err.message || "Failed to upload logo" });
  }
});

/* ----------------------------------------------------
   GET BOOTH LOGO SIGNED URL (for viewing)
   Generates a fresh signed URL valid for 1 hour
   Any authenticated user can view logos
---------------------------------------------------- */
router.get("/get-booth-logo-url/:companyId", verifyFirebaseToken, async (req, res) => {
  try {
    const { companyId } = req.params;

    const bucket = admin.storage().bucket();

    // List files in the company's logo folder to get the most recent one
    const [files] = await bucket.getFiles({ prefix: `boothLogos/${companyId}/` });

    if (files.length === 0) {
      return res.status(404).json({ error: "No logo found" });
    }

    // Get the most recent file
    const latestFile = files.at(-1);

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await latestFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({
      success: true,
      logoUrl: signedUrl,
    });
  } catch (err) {
    console.error("Get logo URL error:", err);
    return res.status(500).json({ error: err.message || "Failed to get logo URL" });
  }
});

/* ============================================================
   BOOTH VISITOR TRACKING
============================================================ */

/**
 * POST /api/booth/:boothId/track-view
 * Track when a student views a booth
 */
router.post("/booth/:boothId/track-view", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    if (!boothId || !studentId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Get student data
    const studentDoc = await db.collection("users").doc(studentId).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    const studentData = studentDoc.data();
    const now = admin.firestore.Timestamp.now();

    // Resolve booth reference - supports both global and fair-specific booths
    const boothResult = await resolveBooth(boothId);
    if (!boothResult) {
      return res.status(404).json({ success: false, error: "Booth not found" });
    }

    const boothRef = boothResult.ref;
    const boothData = boothResult.data;

    // Update or create visitor record in booth's studentVisits subcollection
    const visitorRef = boothRef.collection("studentVisits").doc(studentId);
    const existingVisit = await visitorRef.get();

    if (existingVisit.exists) {
      // Update existing visitor
      await visitorRef.update({
        lastViewedAt: now,
        lastActivityAt: now,
        isCurrentlyViewing: true,
        viewCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      // Create new visitor record
      await visitorRef.set({
        studentId,
        firstName: studentData.firstName || "",
        lastName: studentData.lastName || "",
        email: studentData.email || "",
        major: studentData.major || "",
        firstViewedAt: now,
        lastViewedAt: now,
        lastActivityAt: now,
        viewCount: 1,
        isCurrentlyViewing: true,
      });
    }

    // Update booth's currentVisitors array
    const currentVisitors = boothData.currentVisitors || [];

    // Add to current visitors if not already there
    if (currentVisitors.includes(studentId) === false) {
      await boothRef.update({
        currentVisitors: admin.firestore.FieldValue.arrayUnion(studentId),
        totalVisitorsCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });
    } else {
      // Already viewing, just update timestamp
      await boothRef.update({
        updatedAt: now,
      });
      console.log(`[TRACK-VIEW] Already in currentVisitors, updated timestamp`);
    }

    console.log(`[TRACK-VIEW] Success - returning response`);
    res.json({ success: true, boothId, tracked: true });
  } catch (err) {
    console.error("Error tracking booth view:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/booth/:boothId/track-leave
 * Remove student from current visitors when they leave booth
 */
router.post("/booth/:boothId/track-leave", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    if (!boothId || !studentId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const now = admin.firestore.Timestamp.now();

    // Resolve booth reference - supports both global and fair-specific booths
    const boothResult = await resolveBooth(boothId);
    if (!boothResult) {
      return res.status(404).json({ success: false, error: "Booth not found" });
    }

    const boothRef = boothResult.ref;

    // Mark as not currently viewing
    const visitorRef = boothRef.collection("studentVisits").doc(studentId);
    const visitorExists = await visitorRef.get();

    if (visitorExists.exists) {
      await visitorRef.update({
        isCurrentlyViewing: false,
        lastActivityAt: now,
      });
    }

    // Remove from booth's currentVisitors array
    await boothRef.update({
      currentVisitors: admin.firestore.FieldValue.arrayRemove(studentId),
      updatedAt: now,
    });

    res.json({ success: true, boothId, tracked: false });
  } catch (err) {
    console.error("Error tracking booth leave:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/booth/:boothId/current-visitors
 * Get list of students currently viewing the booth
 */
router.get("/booth/:boothId/current-visitors", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;

    if (!boothId) {
      return res.status(400).json({ success: false, error: "Missing boothId" });
    }

    // Resolve booth reference - supports both global and fair-specific booths
    const boothResult = await resolveBooth(boothId);
    if (!boothResult) {
      return res.status(404).json({ success: false, error: "Booth not found" });
    }

    const boothRef = boothResult.ref;
    const boothData = boothResult.data;
    const currentVisitorIds = boothData.currentVisitors || [];

    // Get details of current visitors
    const visitorDetails = [];
    for (const visitorId of currentVisitorIds) {
      const visitorRef = boothRef.collection("studentVisits").doc(visitorId);
      const visitorDoc = await visitorRef.get();
      if (visitorDoc.exists) {
        const data = visitorDoc.data();
        visitorDetails.push({
          studentId: visitorId,
          firstName: data.firstName,
          lastName: data.lastName,
          major: data.major,
        });
      }
    }

    res.json({
      success: true,
      boothId,
      currentVisitorCount: currentVisitorIds.length,
      currentVisitors: visitorDetails,
    });
  } catch (err) {
    console.error("Error fetching current visitors:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/booth-visitors/:boothId
 * Get all visitors of a booth (with filtering and sorting)
 * Only accessible by company owner or representative
 */
router.get("/booth-visitors/:boothId", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const { filter = "all", search, major, sort = "recent" } = req.query;
    const userId = req.user.uid;

    if (!boothId) {
      return res.status(400).json({ success: false, error: "Missing boothId" });
    }

    // Resolve booth reference - supports both global and fair-specific booths
    const boothResult = await resolveBooth(boothId);
    if (!boothResult) {
      return res.status(404).json({ success: false, error: "Booth not found" });
    }

    const boothRef = boothResult.ref;
    const boothData = boothResult.data;
    const boothCompanyId = boothData.companyId;

    if (!boothCompanyId) {
      return res.status(400).json({ success: false, error: "Booth has no associated company" });
    }

    // Owner or representative for this booth's company (not user.profile companyId alone —
    // users linked to multiple companies often keep a single primary companyId on the user doc)
    const authResult = await checkCompanyAuthorization(boothCompanyId, userId);
    if (!authResult.authorized) {
      console.log(`[GET-VISITORS] Auth failed: ${authResult.error}`);
      return res.status(403).json({ success: false, error: "Not authorized to view booth visitors" });
    }

    console.log(`[GET-VISITORS] Auth passed, fetching visitor records...`);

    // Get all student visits for this booth
    const visitsSnapshot = await boothRef
      .collection("studentVisits")
      .get();

    let visitors = visitsSnapshot.docs.map((doc) => ({
      studentId: doc.id,
      ...doc.data(),
    }));

    console.log(`[GET-VISITORS] Found ${visitors.length} total visitor records`);

    // Apply filter
    if (filter === "current") {
      visitors = visitors.filter((v) => v.isCurrentlyViewing === true);
    } else if (filter === "previous") {
      visitors = visitors.filter((v) => v.isCurrentlyViewing === false);
    }

    // Apply search filter
    if (search?.trim()) {
      const searchLower = search.toLowerCase().trim();
      visitors = visitors.filter((v) => {
        const fullName = `${v.firstName} ${v.lastName}`.toLowerCase();
        return fullName.includes(searchLower) || v.email.toLowerCase().includes(searchLower);
      });
    }

    // Apply major filter
    if (major?.trim()) {
      const majorLower = major.toLowerCase().trim();
      visitors = visitors.filter((v) =>
        v.major.toLowerCase().includes(majorLower)
      );
    }

    // Apply sorting
    if (sort === "name") {
      visitors.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
    } else if (sort === "viewCount") {
      visitors.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else {
      // Default: recent (lastViewedAt descending)
      visitors.sort(
        (a, b) =>
          (b.lastViewedAt?.toMillis?.() || 0) - (a.lastViewedAt?.toMillis?.() || 0)
      );
    }

    const currentCount = visitors.filter((v) => v.isCurrentlyViewing).length;

    console.log(`[GET-VISITORS] Returning ${visitors.length} visitors (${currentCount} currently viewing)`);

    res.json({
      success: true,
      boothId,
      totalVisitors: visitors.length,
      currentlyViewing: currentCount,
      visitors,
    });
  } catch (err) {
    console.error("Error fetching booth visitors:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================================================
   BOOTH RATINGS
============================================================ */
router.get("/test-rating-route", (req, res) => res.json({ ok: true }));

/**
 * POST /api/booths/:boothId/ratings
 * Student submits (or overwrites) a rating for a booth
 */
router.post("/booths/:boothId/ratings", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    const userDoc = await db.collection("users").doc(studentId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "student") return res.status(403).json({ error: "Only students can submit ratings" });

    const { rating, comment, fairId } = req.body;
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be a number between 1 and 5" });
    }

    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    let fairName = null;
    if (fairId && typeof fairId === "string") {
      const fairDoc = await db.collection("fairs").doc(fairId).get();
      if (fairDoc.exists) fairName = fairDoc.data().name || null;
    }

    const ratingData = {
      studentId,
      rating,
      comment: comment?.trim() || null,
      createdAt: admin.firestore.Timestamp.now(),
    };
    if (fairId && typeof fairId === "string") {
      ratingData.fairId = fairId;
      ratingData.fairName = fairName;
    }

    await db.collection("booths").doc(boothId).collection("ratings").doc(studentId).set(ratingData);

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /api/booths/:boothId/ratings error:", err);
    return res.status(500).json({ error: "Failed to submit rating" });
  }
});

/**
 * GET /api/booths/:boothId/ratings/me
 * Get the current student's own rating for a booth
 */
router.get("/booths/:boothId/ratings/me", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    const ratingDoc = await db.collection("booths").doc(boothId).collection("ratings").doc(studentId).get();
    if (!ratingDoc.exists) return res.json({ rating: null });

    const data = ratingDoc.data();
    return res.json({
      rating: {
        rating: data.rating,
        comment: data.comment || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
      },
    });
  } catch (err) {
    console.error("GET /api/booths/:boothId/ratings/me error:", err);
    return res.status(500).json({ error: "Failed to fetch rating" });
  }
});

/**
 * GET /api/booths/:boothId/ratings
 * Get all ratings for a booth — company owner/rep (own booth only) or admin
 * Reviews are returned anonymously (no studentId)
 */
router.get("/booths/:boothId/ratings", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const userId = req.user.uid;

    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    const adminErr = await verifyAdmin(userId);
    if (adminErr) {
      const boothCompanyId = boothDoc.data().companyId;
      if (!boothCompanyId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const authResult = await checkCompanyAuthorization(boothCompanyId, userId);
      if (!authResult.authorized) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    const ratingsSnap = await db.collection("booths").doc(boothId).collection("ratings").get();
    const ratings = ratingsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        rating: data.rating,
        comment: data.comment || null,
        createdAt: data.createdAt ? data.createdAt.toMillis() : null,
        fairId: data.fairId || null,
        fairName: data.fairName || null,
      };
    });

    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : null;

    return res.json({ ratings, totalRatings, averageRating });
  } catch (err) {
    console.error("GET /api/booths/:boothId/ratings error:", err);
    return res.status(500).json({ error: "Failed to fetch ratings" });
  }
});

module.exports = router;
