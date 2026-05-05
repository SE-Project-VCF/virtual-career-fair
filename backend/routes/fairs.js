const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const {
  removeUndefined,
  generateInviteCode,
  parseUTCToTimestamp,
  verifyAdmin,
  evaluateFairStatusForFair,
  verifyFirebaseToken,
} = require("../helpers");
const { streamServerClient } = require("../streamServerClient");
const { forwardGeocode } = require("../services/mapboxGeocode");
const { haversineMiles, venueFieldsFromDoc } = require("../services/geo");
const { mergeFairBoothPayloadWithCompany } = require("../services/mergeFairBoothCompanyLocation");

async function companyDataMapForBoothCompanyIds(boothRows) {
  const ids = [...new Set(boothRows.map((b) => b.companyId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const snaps = await Promise.all(ids.map((id) => db.collection("companies").doc(id).get()));
  const m = new Map();
  snaps.forEach((s) => {
    if (s.exists) m.set(s.id, s.data());
  });
  return m;
}

function normFairBoothField(v) {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

/**
 * Fair booth docs normally store originalBoothId (root /booths doc) for ratings and tracking.
 * Legacy rows may omit it; resolve from company booths (+ boothName / hiringFor / industry when multiple).
 */
async function resolveOriginalBoothIdForFairSnapshot(raw) {
  if (!raw || raw.originalBoothId) return raw?.originalBoothId ?? null;
  if (!raw.companyId) return null;
  try {
    const snap = await db.collection("booths").where("companyId", "==", raw.companyId).get();
    const docs = snap.docs;

    if (docs.length === 0) {
      const cDoc = await db.collection("companies").doc(raw.companyId).get();
      if (!cDoc.exists) return null;
      const legacyBid = cDoc.data().boothId;
      if (!legacyBid) return null;
      const bDoc = await db.collection("booths").doc(legacyBid).get();
      return bDoc.exists ? bDoc.id : null;
    }

    if (docs.length === 1) return docs[0].id;

    const wantedBoothName = normFairBoothField(raw.boothName);
    const wantedCompanyName = normFairBoothField(raw.companyName);
    const fairLabel = wantedBoothName || wantedCompanyName;
    if (fairLabel) {
      const match = docs.find((d) => {
        const data = d.data();
        const bn = normFairBoothField(data.boothName);
        const cn = normFairBoothField(data.companyName);
        return bn === fairLabel || cn === fairLabel || bn === wantedCompanyName;
      });
      if (match) return match.id;
    }

    const wantedHiring = normFairBoothField(raw.hiringFor);
    if (wantedHiring) {
      const hfMatches = docs.filter((d) => normFairBoothField(d.data().hiringFor) === wantedHiring);
      if (hfMatches.length === 1) return hfMatches[0].id;
    }

    const wantedIndustry = normFairBoothField(raw.industry);
    if (wantedIndustry) {
      const indMatches = docs.filter((d) => normFairBoothField(d.data().industry) === wantedIndustry);
      if (indMatches.length === 1) return indMatches[0].id;
    }

    return null;
  } catch (err) {
    console.warn("resolveOriginalBoothIdForFairSnapshot:", err.message);
  }
  return null;
}

// Rate limiter for enrollment endpoint (prevent brute force on invite codes)
const enrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 enrollment attempts per window
  message: "Too many enrollment attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test environment
  skip: (req) => process.env.NODE_ENV === "test",
});


async function getRequestingRoleFromAuthHeader(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const decoded = await auth.verifyIdToken(authHeader.split("Bearer ")[1]);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (userDoc.exists) return userDoc.data().role;
  } catch (err) {
    console.warn("getRequestingRoleFromAuthHeader: invalid token", err);
  }

  return null;
}

function buildHttpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function trimVenuePart(v) {
  return v == null ? "" : String(v).trim();
}

const HUB_GEOCODE_QUERY_MAX_LEN = 256;

/** Mapbox query for a fair location (city + state + optional ZIP). */
function virtualFairGeocodeQuery(city, state, zip) {
  const c = trimVenuePart(city);
  const s = trimVenuePart(state);
  const z = trimVenuePart(zip);
  const head = [c, s].filter(Boolean).join(", ");
  if (!head) return z;
  return z ? `${head} ${z}` : head;
}

/** Pick a venue part: use the incoming value if provided, otherwise fall back to previous. */
function pickVenuePart(incoming, fallback) {
  return incoming === undefined ? trimVenuePart(fallback) : trimVenuePart(incoming);
}

/**
 * Resolve all venue update fields for PUT /api/fairs/:fairId.
 * Returns { fields } on success, or { error, status } on validation failure.
 */
async function resolveVenueUpdates(prev, { venueCity, venueState, venueZip, venueGeocodeQuery }) {
  const FieldValue = admin.firestore.FieldValue;
  const sentGeo = venueGeocodeQuery === undefined ? null : trimVenuePart(venueGeocodeQuery);
  const useGeoQuery = Boolean(sentGeo && sentGeo.length > 0);

  if (useGeoQuery) {
    const result = await resolveVenueFromGeoQuery(sentGeo, true, null, null, null);
    if (result.error) return result;
    return { fields: { ...result.venueFields, venueAddress: FieldValue.delete() } };
  }

  const city = pickVenuePart(venueCity, prev.venueCity);
  const state = pickVenuePart(venueState, prev.venueState);
  const zip = pickVenuePart(venueZip, prev.venueZip);

  if (!city && !state && !zip) {
    return {
      fields: {
        venueAddress: FieldValue.delete(),
        venueCity: FieldValue.delete(),
        venueState: FieldValue.delete(),
        venueZip: FieldValue.delete(),
        venueCountry: FieldValue.delete(),
        venueGeo: FieldValue.delete(),
        venueMapboxId: FieldValue.delete(),
      },
    };
  }

  if (zip.length > 20) {
    return { error: "ZIP or postal code must be 20 characters or less.", status: 400 };
  }
  const geoQuery = virtualFairGeocodeQuery(city, state, zip);
  if (!trimVenuePart(geoQuery)) {
    return { error: "Enter a location, ZIP, or place to verify with search.", status: 400 };
  }
  const result = await resolveVenueFromGeoQuery(geoQuery, false, city, state, zip);
  if (result.error) return result;
  return { fields: { ...result.venueFields, venueAddress: FieldValue.delete() } };
}

/**
 * Resolve venue fields from geocoding input.
 * Used by both POST and PUT /api/fairs to avoid duplicated geocoding logic.
 * Returns { venueFields } on success, or { error, status } on validation failure.
 */
async function resolveVenueFromGeoQuery(geoQuery, fromSingleQuery, city, state, zip) {
  if (geoQuery.length > HUB_GEOCODE_QUERY_MAX_LEN) {
    return { error: "Location search text is too long.", status: 400 };
  }
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    return { error: "Geocoding is not configured", status: 503 };
  }
  const g = await forwardGeocode(geoQuery);
  if (!g) {
    return { error: "Could not verify this location. Try search suggestions or a fuller address.", status: 400 };
  }
  const finalCity = fromSingleQuery ? g.city || null : g.city || city || null;
  const finalState = fromSingleQuery ? g.state || null : g.state || state || null;
  const finalZip = fromSingleQuery ? g.postcode || null : zip || g.postcode || null;
  if (!finalCity || !finalState) {
    return { error: "Could not resolve city and state for this location. Pick a suggestion or try a fuller address.", status: 400 };
  }
  const zipOut = finalZip || null;
  if (zipOut && zipOut.length > 20) {
    return { error: "ZIP or postal code must be 20 characters or less.", status: 400 };
  }
  return {
    venueFields: removeUndefined({
      venueCity: finalCity,
      venueState: finalState,
      venueZip: zipOut,
      venueCountry: g.country,
      venueGeo: new admin.firestore.GeoPoint(g.lat, g.lng),
      venueMapboxId: g.mapboxId,
    }),
  };
}

async function resolveFairIdFromInviteCode(fairId, inviteCode) {
  if (inviteCode) {
    const fairSnap = await db.collection("fairs").where("inviteCode", "==", inviteCode.toUpperCase()).get();
    if (fairSnap.empty) throw buildHttpError(400, "Invalid invite code");
    return fairSnap.docs[0].id;
  }
  return fairId;
}

async function ensureFairExists(fairId) {
  const fairDoc = await db.collection("fairs").doc(fairId).get();
  if (!fairDoc.exists) throw buildHttpError(404, "Fair not found");
}

/** Millisecond fair window for clients (e.g. “past fair” badges). Omit or pass null fields when unknown. */
function fairScheduleFromFairData(fairData) {
  if (!fairData) return {};
  return {
    fairStartTime: fairData.startTime ? fairData.startTime.toMillis() : null,
    fairEndTime: fairData.endTime ? fairData.endTime.toMillis() : null,
  };
}

/** Serialize a fair announcement Firestore doc for JSON responses (title + optional description; sorted by createdAt elsewhere). */
function serializeAnnouncementDoc(doc, fairId, fairName, fairSchedule) {
  const d = doc.data() || {};
  const title = d.title != null ? String(d.title).trim() : "";
  const description = d.description != null ? String(d.description).trim() : "";
  const sched = fairSchedule && typeof fairSchedule === "object" ? fairSchedule : {};
  return {
    id: doc.id,
    fairId,
    fairName: fairName ?? null,
    title,
    description,
    published: Boolean(d.published),
    publishedAt: d.publishedAt ? d.publishedAt.toMillis() : null,
    createdAt: d.createdAt ? d.createdAt.toMillis() : null,
    updatedAt: d.updatedAt ? d.updatedAt.toMillis() : null,
    createdBy: d.createdBy || null,
    fairStartTime: sched.fairStartTime ?? null,
    fairEndTime: sched.fairEndTime ?? null,
  };
}

async function resolveCompanyIdForEnrollment(requestingUid, companyId) {
  if (companyId) return companyId;

  const userDoc = await db.collection("users").doc(requestingUid).get();
  if (!userDoc.exists) throw buildHttpError(404, "User not found");
  const userData = userDoc.data();
  const role = userData.role;
  const profileCompanyId = userData.companyId || null;

  if (role === "companyOwner") {
    const ownedSnap = await db.collection("companies").where("ownerId", "==", requestingUid).get();
    const ownedIds = ownedSnap.docs.map((d) => d.id);
    if (ownedIds.length > 1) {
      throw buildHttpError(
        400,
        "You manage multiple companies. Select which company to enroll in this fair.",
        "COMPANY_ID_REQUIRED",
      );
    }
    if (ownedIds.length === 1) {
      return ownedIds[0];
    }
    if (profileCompanyId) return profileCompanyId;
    throw buildHttpError(400, "User is not associated with a company");
  }

  if (!profileCompanyId) throw buildHttpError(400, "User is not associated with a company");
  return profileCompanyId;
}


// Helper to check if user is admin or company owner/rep
async function ensureAdminOrCompanyAccess(requestingUid, companyId) {
  const adminError = await verifyAdmin(requestingUid);
  if (!adminError) return null;
  const accessError = await verifyCompanyAccess(requestingUid, companyId);
  if (!accessError) return null;
  return { error: "Unauthorized: must be admin or company owner/rep", status: 403 };
}

async function getCompanyAndBoothSnapshot(companyId, boothId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) throw buildHttpError(404, "Company not found");

  const company = companyDoc.data();
  let boothSnapshot = {
    companyId,
    companyName: company.companyName || "",
    industry: null,
    companySize: null,
    location: null,
    locationIsRemote: false,
    locationCity: null,
    locationState: null,
    description: null,
    logoUrl: null,
    website: null,
    careersPage: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    hiringFor: null,
  };

  // Use explicit boothId if provided, otherwise fall back to company.boothId
  const resolvedBoothId = boothId || company.boothId;
  if (resolvedBoothId) {
    const boothDoc = await db.collection("booths").doc(resolvedBoothId).get();
    if (boothDoc.exists) {
      const bData = boothDoc.data();
      boothSnapshot = {
        companyId,
        originalBoothId: resolvedBoothId,
        boothName: bData.boothName || null,
        companyName: bData.companyName || company.companyName || "",
        industry: bData.industry || null,
        companySize: bData.companySize || null,
        location: bData.location || null,
        locationIsRemote: bData.locationIsRemote === true,
        locationCity: bData.locationCity ?? null,
        locationState: bData.locationState ?? null,
        description: bData.description || null,
        logoUrl: bData.logoUrl || null,
        website: bData.website || null,
        careersPage: bData.careersPage || null,
        contactName: bData.contactName || null,
        contactEmail: bData.contactEmail || null,
        contactPhone: bData.contactPhone || null,
        hiringFor: bData.hiringFor || null,
      };
    }
  }

  return { company, boothSnapshot };
}

async function createEnrollmentWithBooths({
  fairId,
  companyId,
  companyName,
  boothSnapshots,
  enrolledBy,
  enrollmentMethod,
}) {
  const batch = db.batch();
  const fairBoothIds = [];

  for (const snapshot of boothSnapshots) {
    const fairBoothRef = db.collection("fairs").doc(fairId).collection("booths").doc();
    batch.set(fairBoothRef, {
      ...removeUndefined(snapshot),
      enrolledAt: admin.firestore.Timestamp.now(),
      enrolledBy,
    });
    fairBoothIds.push(fairBoothRef.id);
  }

  batch.set(db.collection("fairs").doc(fairId).collection("enrollments").doc(companyId), {
    companyId,
    companyName,
    enrolledAt: admin.firestore.Timestamp.now(),
    enrolledBy,
    enrollmentMethod,
    boothIds: fairBoothIds,
  });

  await batch.commit();
  return fairBoothIds;
}

async function snapshotCompanyJobsToFair(fairId, companyId) {
  const jobsSnap = await db.collection("jobs").where("companyId", "==", companyId).get();
  if (jobsSnap.empty) return;

  const jobBatch = db.batch();
  jobsSnap.docs.forEach((jobDoc) => {
    const jobRef = db.collection("fairs").doc(fairId).collection("jobs").doc();
    jobBatch.set(jobRef, {
      ...jobDoc.data(),
      sourceJobId: jobDoc.id,
      companyId,
      createdAt: admin.firestore.Timestamp.now(),
    });
  });

  await jobBatch.commit();
}

/* -------------------------------------------------------
   HELPER: Check if authenticated user is authorized
   to edit a booth in a fair (owner or rep of that company)
------------------------------------------------------- */
async function verifyCompanyAccess(userId, companyId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) return { error: "Company not found", status: 404 };
  const company = companyDoc.data();
  const isOwner = company.ownerId === userId;
  const isRep = Array.isArray(company.representativeIDs) && company.representativeIDs.includes(userId);
  if (!isOwner && !isRep) {
    return { error: "Unauthorized: not an owner or representative of this company", status: 403 };
  }
  return null;
}

function fairVenueGeoCoords(venueGeo) {
  if (!venueGeo) return null;
  if (typeof venueGeo.latitude === "number" && typeof venueGeo.longitude === "number") {
    return { lat: venueGeo.latitude, lng: venueGeo.longitude };
  }
  if (typeof venueGeo._latitude === "number" && typeof venueGeo._longitude === "number") {
    return { lat: venueGeo._latitude, lng: venueGeo._longitude };
  }
  return null;
}

function buildFairListItem(doc, data, now, searchOrigin) {
  const startMs = data.startTime ? data.startTime.toMillis() : null;
  const endMs = data.endTime ? data.endTime.toMillis() : null;
  const isScheduledLive = startMs !== null && endMs !== null && now >= startMs && now <= endMs;
  const isLive = data.isLive === true || isScheduledLive;
  const item = {
    id: doc.id,
    name: data.name,
    description: data.description || null,
    isLive,
    startTime: startMs,
    endTime: endMs,
    createdAt: data.createdAt ? data.createdAt.toMillis() : null,
    ...venueFieldsFromDoc(data),
  };
  if (searchOrigin && data.venueGeo) {
    const coords = fairVenueGeoCoords(data.venueGeo);
    if (coords) {
      const miles = haversineMiles(searchOrigin.lat, searchOrigin.lng, coords.lat, coords.lng);
      item.distanceMiles = Math.round(miles * 10) / 10;
    }
  }
  return item;
}

async function resolveSearchOriginFromQuery(query) {
  const radiusMiles = query.radiusMiles === undefined || query.radiusMiles === ""
    ? Number.NaN
    : Number.parseFloat(String(query.radiusMiles));
  if (Number.isNaN(radiusMiles) || radiusMiles <= 0) return null;

  const address = query.address == null ? "" : String(query.address).trim();
  if (address) {
    const g = await forwardGeocode(address);
    if (!g) {
      const err = new Error("Could not find that location. Try a more specific address or city.");
      err.status = 400;
      throw err;
    }
    return { lat: g.lat, lng: g.lng, radiusMiles };
  }

  const lat = Number.parseFloat(String(query.lat ?? ""));
  const lng = Number.parseFloat(String(query.lng ?? ""));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const err = new Error("Provide lat, lng, and radiusMiles, or address and radiusMiles");
    err.status = 400;
    throw err;
  }
  return { lat, lng, radiusMiles };
}

/* =======================================================
   FAIR CRUD
======================================================= */

/* GET /api/fairs - public: list fairs; optional geo filter: lat,lng,radiusMiles or address,radiusMiles */
router.get("/fairs", async (req, res) => {
  try {
    const hasRadius = req.query.radiusMiles != null && String(req.query.radiusMiles).trim().length > 0;
    let search = null;
    if (hasRadius) {
      try {
        search = await resolveSearchOriginFromQuery(req.query);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        throw e;
      }
      if (!search) {
        return res.status(400).json({
          error: "Provide a positive radiusMiles together with lat and lng, or with address.",
        });
      }
    }

    const snap = await db.collection("fairs").orderBy("createdAt", "desc").get();
    const now = Date.now();
    let fairs = snap.docs.map((doc) => buildFairListItem(doc, doc.data(), now, search));

    if (search) {
      fairs = fairs.filter((f) => {
        if (!f.venueGeo) return false;
        if (f.distanceMiles === undefined) return false;
        return f.distanceMiles <= search.radiusMiles;
      });
      fairs.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
    }

    return res.json({ fairs });
  } catch (err) {
    console.error("GET /api/fairs error:", err);
    return res.status(500).json({ error: "Failed to list fairs" });
  }
});

/* GET /api/fairs/my-enrollments - auth required: returns fairs the current user's company is enrolled in */
router.get("/fairs/my-enrollments", verifyFirebaseToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    const userData = userDoc.data();
    const role = userData.role;
    const profileCompanyId = userData.companyId || null;

    const companyIds = new Set();
    if (profileCompanyId) companyIds.add(profileCompanyId);
    if (role === "companyOwner") {
      const ownedSnap = await db.collection("companies").where("ownerId", "==", req.user.uid).get();
      ownedSnap.docs.forEach((d) => companyIds.add(d.id));
    } else if (role === "representative" && profileCompanyId) {
      companyIds.clear();
      companyIds.add(profileCompanyId);
    }

    if (companyIds.size === 0) return res.json({ enrollments: [] });

    const fairsSnap = await db.collection("fairs").get();
    const enrollments = [];

    for (const fairDoc of fairsSnap.docs) {
      for (const cid of companyIds) {
        const enrollDoc = await db
          .collection("fairs")
          .doc(fairDoc.id)
          .collection("enrollments")
          .doc(cid)
          .get();
        if (enrollDoc.exists) {
          enrollments.push({
            fairId: fairDoc.id,
            companyId: cid,
            boothId: enrollDoc.data().boothId || null,
            enrolledAt: enrollDoc.data().enrolledAt ? enrollDoc.data().enrolledAt.toMillis() : null,
          });
        }
      }
    }

    return res.json({ enrollments });
  } catch (err) {
    console.error("GET /api/fairs/my-enrollments error:", err);
    return res.status(500).json({ error: "Failed to fetch enrollments" });
  }
});

/* GET /api/fairs/my-announcements — company owner / rep: published announcements for enrolled fairs */
router.get("/fairs/my-announcements", verifyFirebaseToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    const userData = userDoc.data();
    const role = userData.role;
    const profileCompanyId = userData.companyId || null;

    if (role !== "companyOwner" && role !== "representative") {
      return res.json({ announcements: [] });
    }

    const companyIds = new Set();
    if (profileCompanyId) companyIds.add(profileCompanyId);
    if (role === "companyOwner") {
      const ownedSnap = await db.collection("companies").where("ownerId", "==", req.user.uid).get();
      ownedSnap.docs.forEach((d) => companyIds.add(d.id));
    } else if (role === "representative" && profileCompanyId) {
      companyIds.clear();
      companyIds.add(profileCompanyId);
    }

    if (companyIds.size === 0) return res.json({ announcements: [] });

    const fairsSnap = await db.collection("fairs").get();
    const perFair = await Promise.all(
      fairsSnap.docs.map(async (fairDoc) => {
        let isEnrolled = false;
        for (const cid of companyIds) {
          const enrollDoc = await db
            .collection("fairs")
            .doc(fairDoc.id)
            .collection("enrollments")
            .doc(cid)
            .get();
          if (enrollDoc.exists) {
            isEnrolled = true;
            break;
          }
        }
        if (!isEnrolled) return [];

        const fairData = fairDoc.data() || {};
        const fairName = fairData.name || null;
        const fairSchedule = fairScheduleFromFairData(fairData);
        const annSnap = await db.collection("fairs").doc(fairDoc.id).collection("announcements").get();
        const items = [];
        annSnap.docs.forEach((annDoc) => {
          const ann = annDoc.data() || {};
          if (!ann.published) return;
          items.push(serializeAnnouncementDoc(annDoc, fairDoc.id, fairName, fairSchedule));
        });
        return items;
      })
    );

    const announcements = perFair.flat();
    announcements.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return res.json({ announcements });
  } catch (err) {
    console.error("GET /api/fairs/my-announcements error:", err);
    return res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

/* GET /api/fairs/:fairId - public: single fair detail (invite code only returned to admins) */
router.get("/fairs/:fairId", async (req, res) => {
  const { fairId } = req.params;
  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });
    const data = fairDoc.data();

    const requestingRole = await getRequestingRoleFromAuthHeader(req.headers.authorization);
    const isAdmin = requestingRole === "administrator";

    let inviteCode;
    if (isAdmin && data.inviteCode) {
      inviteCode = data.inviteCode;
    }

    const response = {
      id: fairDoc.id,
      name: data.name,
      description: data.description || null,
      isLive: data.isLive || false,
      startTime: data.startTime ? data.startTime.toMillis() : null,
      endTime: data.endTime ? data.endTime.toMillis() : null,
      createdAt: data.createdAt ? data.createdAt.toMillis() : null,
      updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null,
      ...venueFieldsFromDoc(data),
    };
    if (inviteCode !== undefined) response.inviteCode = inviteCode;

    return res.json(response);
  } catch (err) {
    console.error("GET /api/fairs/:fairId error:", err);
    return res.status(500).json({ error: "Failed to get fair" });
  }
});

/* GET /api/fairs/:fairId/status - public: live status */
router.get("/fairs/:fairId/status", async (req, res) => {
  const { fairId } = req.params;
  try {
    const status = await evaluateFairStatusForFair(fairId);
    return res.json(status);
  } catch (err) {
    if (err.message === "Fair not found") return res.status(404).json({ error: "Fair not found" });
    console.error("GET /api/fairs/:fairId/status error:", err);
    return res.status(500).json({ error: "Failed to get fair status" });
  }
});

/* GET /api/fairs/:fairId/announcements — admin: list announcements (drafts + published) */
router.get("/fairs/:fairId/announcements", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const adminError = await verifyAdmin(req.user.uid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    await ensureFairExists(fairId);
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    const fairData = fairDoc.data() || {};
    const fairName = fairData.name || null;
    const fairSchedule = fairScheduleFromFairData(fairData);
    const snap = await db.collection("fairs").doc(fairId).collection("announcements").get();
    const announcements = snap.docs.map((doc) => serializeAnnouncementDoc(doc, fairId, fairName, fairSchedule));
    announcements.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return res.json({ announcements });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error("GET /api/fairs/:fairId/announcements error:", err);
    return res.status(500).json({ error: "Failed to list announcements" });
  }
});

/* POST /api/fairs/:fairId/announcements — admin: create announcement */
router.post("/fairs/:fairId/announcements", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const adminError = await verifyAdmin(req.user.uid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  const { title, description, published } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    await ensureFairExists(fairId);

    const now = admin.firestore.Timestamp.now();
    const isPublished = Boolean(published);
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    const fairDataPost = fairDoc.data() || {};
    const fairName = fairDataPost.name || null;
    const fairSchedulePost = fairScheduleFromFairData(fairDataPost);

    const descTrim = description != null ? String(description).trim() : "";
    const payload = removeUndefined({
      title: String(title).trim(),
      ...(descTrim ? { description: descTrim } : {}),
      published: isPublished,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user.uid,
      ...(isPublished ? { publishedAt: now } : {}),
    });

    const colRef = db.collection("fairs").doc(fairId).collection("announcements");
    const docRef = await colRef.add(payload);
    const created = await docRef.get();
    return res.status(201).json(serializeAnnouncementDoc(created, fairId, fairName, fairSchedulePost));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error("POST /api/fairs/:fairId/announcements error:", err);
    return res.status(500).json({ error: "Failed to create announcement" });
  }
});

/* PUT /api/fairs/:fairId/announcements/:announcementId — admin: update announcement */
router.put("/fairs/:fairId/announcements/:announcementId", verifyFirebaseToken, async (req, res) => {
  const { fairId, announcementId } = req.params;
  const adminError = await verifyAdmin(req.user.uid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    await ensureFairExists(fairId);
    const annRef = db.collection("fairs").doc(fairId).collection("announcements").doc(announcementId);
    const annDoc = await annRef.get();
    if (!annDoc.exists) return res.status(404).json({ error: "Announcement not found" });

    const prev = annDoc.data() || {};
    const updates = { updatedAt: admin.firestore.Timestamp.now() };

    if (req.body.title !== undefined) {
      if (!String(req.body.title).trim()) {
        return res.status(400).json({ error: "title cannot be empty" });
      }
      updates.title = String(req.body.title).trim();
    }
    if (req.body.description !== undefined) {
      const t = req.body.description === null || req.body.description === "" ? "" : String(req.body.description).trim();
      updates.description = t;
    }
    if (req.body.published !== undefined) {
      const nextPub = Boolean(req.body.published);
      updates.published = nextPub;
      if (nextPub && !prev.published) {
        updates.publishedAt = admin.firestore.Timestamp.now();
      }
    }

    await annRef.update(removeUndefined(updates));
    const after = await annRef.get();
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    const fairDataPut = fairDoc.data() || {};
    const fairName = fairDataPut.name || null;
    const fairSchedulePut = fairScheduleFromFairData(fairDataPut);
    return res.json(serializeAnnouncementDoc(after, fairId, fairName, fairSchedulePut));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error("PUT /api/fairs/:fairId/announcements/:announcementId error:", err);
    return res.status(500).json({ error: "Failed to update announcement" });
  }
});

/* DELETE /api/fairs/:fairId/announcements/:announcementId — admin: delete announcement */
router.delete("/fairs/:fairId/announcements/:announcementId", verifyFirebaseToken, async (req, res) => {
  const { fairId, announcementId } = req.params;
  const adminError = await verifyAdmin(req.user.uid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    await ensureFairExists(fairId);
    const annRef = db.collection("fairs").doc(fairId).collection("announcements").doc(announcementId);
    const annDoc = await annRef.get();
    if (!annDoc.exists) return res.status(404).json({ error: "Announcement not found" });
    await annRef.delete();
    return res.status(204).send();
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error("DELETE /api/fairs/:fairId/announcements/:announcementId error:", err);
    return res.status(500).json({ error: "Failed to delete announcement" });
  }
});

/* POST /api/fairs - admin: create fair */
router.post("/fairs", verifyFirebaseToken, async (req, res) => {
  const { name, description, startTime, endTime, venueCity, venueState, venueZip, venueGeocodeQuery } = req.body;
  const adminUid = req.user.uid;

  // Admin check
  const adminError = await verifyAdmin(adminUid);
  if (adminError) {
    return res.status(adminError.status).json({ error: adminError.error });
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: "Fair name is required" });
  }

  try {
    let parsedStart = null;
    let parsedEnd = null;
    if (startTime) parsedStart = parseUTCToTimestamp(startTime);
    if (endTime) parsedEnd = parseUTCToTimestamp(endTime);
    if (parsedStart && parsedEnd && parsedStart.toMillis() >= parsedEnd.toMillis()) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    const geoQField = trimVenuePart(venueGeocodeQuery);
    const city = trimVenuePart(venueCity);
    const state = trimVenuePart(venueState);
    const zip = trimVenuePart(venueZip);
    const useGeoQuery = geoQField.length > 0;
    const hasAnyHubPart = Boolean(city || state || zip || useGeoQuery);
    let venueFields = {};
    if (hasAnyHubPart) {
      let geoQuery;
      let fromSingleQuery = false;
      if (useGeoQuery) {
        geoQuery = geoQField;
        fromSingleQuery = true;
      } else {
        if (zip.length > 20) {
          return res.status(400).json({ error: "ZIP or postal code must be 20 characters or less." });
        }
        geoQuery = virtualFairGeocodeQuery(city, state, zip);
        if (!trimVenuePart(geoQuery)) {
          return res.status(400).json({
            error: "Enter a location, ZIP, or place to verify with search.",
          });
        }
      }
      const result = await resolveVenueFromGeoQuery(geoQuery, fromSingleQuery, city, state, zip);
      if (result.error) return res.status(result.status).json({ error: result.error });
      venueFields = result.venueFields;
    }

    const rawCode = generateInviteCode();
    const fairData = removeUndefined({
      name: name.trim(),
      description: description ? description.trim() : null,
      isLive: false,
      startTime: parsedStart,
      endTime: parsedEnd,
      inviteCode: rawCode,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: adminUid,
      updatedAt: admin.firestore.Timestamp.now(),
      ...venueFields,
    });

    const fairRef = await db.collection("fairs").add(fairData);
    return res.status(201).json({
      id: fairRef.id,
      name: fairData.name,
      description: fairData.description ?? null,
      ...venueFieldsFromDoc(fairData),
    });
  } catch (err) {
    console.error("POST /api/fairs error:", err);
    return res.status(500).json({ error: "Failed to create fair" });
  }
});

/* PUT /api/fairs/:fairId - admin: update fair metadata/schedule */
router.put("/fairs/:fairId", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { userId, name, description, startTime, endTime, venueCity, venueState, venueZip, venueGeocodeQuery } =
    req.body;
  const adminUid = req.user.uid;
  const FieldValue = admin.firestore.FieldValue;

  const adminError = await verifyAdmin(userId || adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (startTime !== undefined) updates.startTime = startTime ? parseUTCToTimestamp(startTime) : null;
    if (endTime !== undefined) updates.endTime = endTime ? parseUTCToTimestamp(endTime) : null;

    const hubTouched = [venueCity, venueState, venueZip, venueGeocodeQuery].some((v) => v !== undefined);
    if (hubTouched) {
      const venueResult = await resolveVenueUpdates(fairDoc.data() || {}, { venueCity, venueState, venueZip, venueGeocodeQuery });
      if (venueResult.error) return res.status(venueResult.status).json({ error: venueResult.error });
      Object.assign(updates, venueResult.fields);
    }

    if (updates.startTime && updates.endTime && updates.startTime.toMillis() >= updates.endTime.toMillis()) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    updates.updatedAt = admin.firestore.Timestamp.now();
    updates.updatedBy = adminUid;

    await db.collection("fairs").doc(fairId).update(updates);
    return res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/fairs/:fairId error:", err);
    return res.status(500).json({ error: "Failed to update fair" });
  }
});

/* DELETE /api/fairs/:fairId - admin: delete fair */
router.delete("/fairs/:fairId", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { userId } = req.body;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(userId || adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    // Delete subcollections: booths, jobs, enrollments
    const subcollections = ["booths", "jobs", "enrollments"];
    for (const sub of subcollections) {
      const snap = await db.collection("fairs").doc(fairId).collection(sub).get();
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      if (snap.docs.length > 0) await batch.commit();
    }

    await db.collection("fairs").doc(fairId).delete();
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/fairs/:fairId error:", err);
    return res.status(500).json({ error: "Failed to delete fair" });
  }
});

/* POST /api/fairs/:fairId/toggle-status - admin: manual live toggle */
router.post("/fairs/:fairId/toggle-status", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { userId } = req.body;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(userId || adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    const currentIsLive = fairDoc.data().isLive || false;
    const newIsLive = !currentIsLive;

    await db.collection("fairs").doc(fairId).update({
      isLive: newIsLive,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: adminUid,
    });

    return res.json({ isLive: newIsLive });
  } catch (err) {
    console.error("POST /api/fairs/:fairId/toggle-status error:", err);
    return res.status(500).json({ error: "Failed to toggle fair status" });
  }
});

// Refresh invite code endpoint
router.post("/fairs/:fairId/refresh-invite-code", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { userId } = req.body;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(userId || adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    const rawCode = generateInviteCode();

    await db.collection("fairs").doc(fairId).update({
      inviteCode: rawCode,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: adminUid,
    });

    return res.json({ inviteCode: rawCode });
  } catch (err) {
    console.error("POST /api/fairs/:fairId/refresh-code error:", err);
    return res.status(500).json({ error: "Failed to refresh invite code" });
  }
});

/* =======================================================
   ENROLLMENT
======================================================= */

/* POST /api/fairs/:fairId/enroll - enroll company in fair */
router.post("/fairs/:fairId/enroll", enrollmentLimiter, verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { companyId, inviteCode, boothIds } = req.body;
  const requestingUid = req.user.uid;

  if (!companyId && !inviteCode) {
    return res.status(400).json({ error: "Either companyId or inviteCode is required" });
  }

  // Validate boothIds if provided
  if (boothIds !== undefined) {
    if (!Array.isArray(boothIds) || boothIds.length === 0) {
      return res.status(400).json({ error: "boothIds must be a non-empty array" });
    }
  }

  try {
    const resolvedFairId = await resolveFairIdFromInviteCode(fairId, inviteCode);
    await ensureFairExists(resolvedFairId);

    const resolvedCompanyId = await resolveCompanyIdForEnrollment(requestingUid, companyId);

    const accessError = await ensureAdminOrCompanyAccess(requestingUid, resolvedCompanyId);
    if (accessError) return res.status(accessError.status).json({ error: accessError.error });

    const enrollmentDoc = await db
      .collection("fairs")
      .doc(resolvedFairId)
      .collection("enrollments")
      .doc(resolvedCompanyId)
      .get();
    if (enrollmentDoc.exists) return res.status(400).json({ error: "Company is already enrolled in this fair" });

    const companyDoc = await db.collection("companies").doc(resolvedCompanyId).get();
    if (!companyDoc.exists) throw buildHttpError(404, "Company not found");
    const company = companyDoc.data();

    const enrollmentMethod = inviteCode ? "inviteCode" : "admin";
    let boothSnapshots = [];

    if (boothIds && boothIds.length > 0) {
      // Multi-booth: validate and snapshot each selected booth
      for (const bid of boothIds) {
        const boothDoc = await db.collection("booths").doc(bid).get();
        if (!boothDoc.exists) {
          return res.status(400).json({ error: `Booth ${bid} not found` });
        }
        if (boothDoc.data().companyId !== resolvedCompanyId) {
          return res.status(403).json({ error: `Booth ${bid} does not belong to this company` });
        }
        const { boothSnapshot } = await getCompanyAndBoothSnapshot(resolvedCompanyId, bid);
        boothSnapshots.push(boothSnapshot);
      }
    } else {
      // Legacy single-booth: use company.boothId fallback
      const { boothSnapshot } = await getCompanyAndBoothSnapshot(resolvedCompanyId);
      boothSnapshots.push(boothSnapshot);
    }

    const fairBoothIds = await createEnrollmentWithBooths({
      fairId: resolvedFairId,
      companyId: resolvedCompanyId,
      companyName: company.companyName || "",
      boothSnapshots,
      enrolledBy: requestingUid,
      enrollmentMethod,
    });

    await snapshotCompanyJobsToFair(resolvedFairId, resolvedCompanyId);

    return res.status(201).json({ boothIds: fairBoothIds, fairId: resolvedFairId });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      });
    }
    console.error("POST /api/fairs/:fairId/enroll error:", err);
    return res.status(500).json({ error: "Failed to enroll company" });
  }
});

/* GET /api/fairs/:fairId/enrollments - admin: list enrolled companies */
router.get("/fairs/:fairId/enrollments", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const snap = await db
      .collection("fairs")
      .doc(fairId)
      .collection("enrollments")
      .get();
    const enrollments = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        enrolledAt: data.enrolledAt ? { seconds: data.enrolledAt.seconds, nanoseconds: data.enrolledAt.nanoseconds } : null,
      };
    });
    return res.json({ enrollments });
  } catch (err) {
    console.error("GET /api/fairs/:fairId/enrollments error:", err);
    return res.status(500).json({ error: "Failed to list enrollments" });
  }
});

/* DELETE /api/fairs/:fairId/enrollments/:companyId - admin: remove company from fair */
router.delete("/fairs/:fairId/enrollments/:companyId", verifyFirebaseToken, async (req, res) => {
  const { fairId, companyId } = req.params;
  const adminUid = req.user.uid;

  const adminError = await verifyAdmin(adminUid);
  if (adminError) return res.status(adminError.status).json({ error: adminError.error });

  try {
    const enrollmentDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("enrollments")
      .doc(companyId)
      .get();
    if (!enrollmentDoc.exists) return res.status(404).json({ error: "Enrollment not found" });

    const { boothId } = enrollmentDoc.data();
    const batch = db.batch();

    // Remove enrollment
    batch.delete(db.collection("fairs").doc(fairId).collection("enrollments").doc(companyId));

    // Remove fair-scoped booth
    if (boothId) {
      batch.delete(db.collection("fairs").doc(fairId).collection("booths").doc(boothId));
    }

    await batch.commit();

    // Remove company's jobs from fair
    const jobsSnap = await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .where("companyId", "==", companyId)
      .get();
    if (!jobsSnap.empty) {
      const jobBatch = db.batch();
      jobsSnap.docs.forEach((doc) => jobBatch.delete(doc.ref));
      await jobBatch.commit();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/fairs/:fairId/enrollments/:companyId error:", err);
    return res.status(500).json({ error: "Failed to remove enrollment" });
  }
});

/* =======================================================
   FAIR-SCOPED BOOTHS
======================================================= */

/* GET /api/fairs/:fairId/booths - public (gated on isLive for students)
   For admin: returns FairData shape with ratings aggregated per booth */
router.get("/fairs/:fairId/booths", async (req, res) => {
  const { fairId } = req.params;
  try {
    const status = await evaluateFairStatusForFair(fairId);

    // Check if request has auth token - if not, require fair to be live
    const requestingRole = await getRequestingRoleFromAuthHeader(req.headers.authorization);

    const isAdmin = requestingRole === "administrator";
    if (!status.isLive && !isAdmin) {
      return res.status(403).json({ error: "Fair is not currently live" });
    }

    const snap = await db
      .collection("fairs")
      .doc(fairId)
      .collection("booths")
      .orderBy("companyName")
      .get();

    // For admin: return FairData shape with ratings
    if (isAdmin) {
      const fairDoc = await db.collection("fairs").doc(fairId).get();
      const fairData = fairDoc.data();

      const boothsWithRatings = await Promise.all(
        snap.docs.map(async (doc) => {
          const booth = doc.data();
          const originalBoothId = booth.originalBoothId;

          let ratings = [];
          if (originalBoothId) {
            const ratingsSnap = await db
              .collection("booths")
              .doc(originalBoothId)
              .collection("ratings")
              .get();
            ratings = ratingsSnap.docs.map((r) => {
              const d = r.data();
              return {
                studentId: r.id,
                rating: d.rating,
                comment: d.comment || null,
                createdAt: d.createdAt ? d.createdAt.toMillis() : null,
              };
            });
          }

          const totalRatings = ratings.length;
          const averageRating = totalRatings > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
            : null;

          return {
            boothId: doc.id,
            companyName: booth.companyName || "",
            averageRating,
            totalRatings,
            ratings,
          };
        })
      );

      return res.json({
        fairName: fairData.name || "",
        startTime: fairData.startTime ? fairData.startTime.toMillis() : null,
        endTime: fairData.endTime ? fairData.endTime.toMillis() : null,
        booths: boothsWithRatings,
      });
    }

    const booths = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const companyMap = await companyDataMapForBoothCompanyIds(booths);
    const merged = booths.map((b) =>
      mergeFairBoothPayloadWithCompany(b, b.companyId ? companyMap.get(b.companyId) : null),
    );
    return res.json({ booths: merged });
  } catch (err) {
    if (err.message === "Fair not found") return res.status(404).json({ error: "Fair not found" });
    console.error("GET /api/fairs/:fairId/booths error:", err);
    return res.status(500).json({ error: "Failed to list booths" });
  }
});

/* GET /api/fairs/:fairId/booths/:boothId - public (gated on isLive) */
router.get("/fairs/:fairId/booths/:boothId", async (req, res) => {
  const { fairId, boothId } = req.params;
  try {
    const status = await evaluateFairStatusForFair(fairId);

    const requestingRole = await getRequestingRoleFromAuthHeader(req.headers.authorization);

    const isAdmin = requestingRole === "administrator";
    if (!status.isLive && !isAdmin) {
      return res.status(403).json({ error: "Fair is not currently live" });
    }

    const boothDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("booths")
      .doc(boothId)
      .get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    const raw = boothDoc.data();
    const resolvedOriginalBoothId = await resolveOriginalBoothIdForFairSnapshot(raw);
    const mergedRaw = {
      ...raw,
      ...(resolvedOriginalBoothId ? { originalBoothId: resolvedOriginalBoothId } : {}),
    };
    let companyData = null;
    if (raw.companyId) {
      const cDoc = await db.collection("companies").doc(raw.companyId).get();
      if (cDoc.exists) companyData = cDoc.data();
    }
    const payload = mergeFairBoothPayloadWithCompany({ id: boothDoc.id, ...mergedRaw }, companyData);
    return res.json(payload);
  } catch (err) {
    if (err.message === "Fair not found") return res.status(404).json({ error: "Fair not found" });
    console.error("GET /api/fairs/:fairId/booths/:boothId error:", err);
    return res.status(500).json({ error: "Failed to get booth" });
  }
});

/* PUT /api/fairs/:fairId/booths/:boothId - company owner/rep: edit fair-scoped booth */
router.put("/fairs/:fairId/booths/:boothId", verifyFirebaseToken, async (req, res) => {
  const { fairId, boothId } = req.params;
  const requestingUid = req.user.uid;

  try {
    const boothDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("booths")
      .doc(boothId)
      .get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    const { companyId } = boothDoc.data();

    // Must be admin or company owner/rep
    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(accessError.status).json({ error: accessError.error });
    }

    const allowedFields = [
      "companyName", "industry", "companySize", "description",
      "logoUrl", "website", "careersPage", "contactName", "contactEmail",
      "contactPhone", "hiringFor",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updatedAt = admin.firestore.Timestamp.now();

    await db
      .collection("fairs")
      .doc(fairId)
      .collection("booths")
      .doc(boothId)
      .update(removeUndefined(updates));

    return res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/fairs/:fairId/booths/:boothId error:", err);
    return res.status(500).json({ error: "Failed to update booth" });
  }
});

/* =======================================================
   FAIR-SCOPED JOBS
======================================================= */

/* GET /api/fairs/:fairId/jobs - public (gated on isLive) */
router.get("/fairs/:fairId/jobs", async (req, res) => {
  const { fairId } = req.params;
  const { companyId } = req.query;
  try {
    const status = await evaluateFairStatusForFair(fairId);

    const requestingRole = await getRequestingRoleFromAuthHeader(req.headers.authorization);

    const isAdmin = requestingRole === "administrator";
    if (!status.isLive && !isAdmin) {
      return res.status(403).json({ error: "Fair is not currently live" });
    }

    let query = db.collection("fairs").doc(fairId).collection("jobs");
    if (companyId) {
      query = query.where("companyId", "==", companyId);
    }
    const snap = await query.get();
    const jobs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ jobs });
  } catch (err) {
    if (err.message === "Fair not found") return res.status(404).json({ error: "Fair not found" });
    console.error("GET /api/fairs/:fairId/jobs error:", err);
    return res.status(500).json({ error: "Failed to list jobs" });
  }
});

/* POST /api/fairs/:fairId/jobs - company owner/rep: add job to fair */
router.post("/fairs/:fairId/jobs", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { companyId, name, description, majorsAssociated, applicationLink } = req.body;
  const requestingUid = req.user.uid;

  if (!companyId) return res.status(400).json({ error: "companyId is required" });
  if (!name?.trim()) return res.status(400).json({ error: "Job name is required" });

  try {
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    // Must be admin or company owner/rep
    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(accessError.status).json({ error: accessError.error });
    }

    const jobData = removeUndefined({
      companyId,
      name: name.trim(),
      description: description ? description.trim() : null,
      majorsAssociated: majorsAssociated || null,
      applicationLink: applicationLink || null,
      createdAt: admin.firestore.Timestamp.now(),
    });

    const jobRef = await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .add(jobData);

    return res.status(201).json({ id: jobRef.id, ...jobData });
  } catch (err) {
    console.error("POST /api/fairs/:fairId/jobs error:", err);
    return res.status(500).json({ error: "Failed to add job" });
  }
});

/* PUT /api/fairs/:fairId/jobs/:jobId - company owner/rep: edit fair job */
router.put("/fairs/:fairId/jobs/:jobId", verifyFirebaseToken, async (req, res) => {
  const { fairId, jobId } = req.params;
  const requestingUid = req.user.uid;

  try {
    const jobDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .doc(jobId)
      .get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });

    const { companyId } = jobDoc.data();

    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(accessError.status).json({ error: accessError.error });
    }

    const allowedFields = ["name", "description", "majorsAssociated", "applicationLink"];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updatedAt = admin.firestore.Timestamp.now();

    await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .doc(jobId)
      .update(updates);

    return res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/fairs/:fairId/jobs/:jobId error:", err);
    return res.status(500).json({ error: "Failed to update job" });
  }
});

/* DELETE /api/fairs/:fairId/jobs/:jobId - company owner/rep: remove job from fair */
router.delete("/fairs/:fairId/jobs/:jobId", verifyFirebaseToken, async (req, res) => {
  const { fairId, jobId } = req.params;
  const requestingUid = req.user.uid;

  try {
    const jobDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .doc(jobId)
      .get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });

    const { companyId } = jobDoc.data();

    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(accessError.status).json({ error: accessError.error });
    }

    await db.collection("fairs").doc(fairId).collection("jobs").doc(jobId).delete();
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/fairs/:fairId/jobs/:jobId error:", err);
    return res.status(500).json({ error: "Failed to delete job" });
  }
});

/* =======================================================
   COMPANY FAIRS LOOKUP
======================================================= */

/* GET /api/companies/:companyId/fairs - list fairs a company is enrolled in */
router.get("/companies/:companyId/fairs", verifyFirebaseToken, async (req, res) => {
  const { companyId } = req.params;
  const requestingUid = req.user.uid;

  try {
    // Must be admin or member of the company
    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(403).json({ error: "Unauthorized" });
    }

    // Collection group query on all enrollments subcollections
    const enrollmentsSnap = await db
      .collectionGroup("enrollments")
      .where("companyId", "==", companyId)
      .get();

    const fairs = await Promise.all(
      enrollmentsSnap.docs.map(async (enrollDoc) => {
        // Path: fairs/{fairId}/enrollments/{companyId}
        const fairId = enrollDoc.ref.parent.parent.id;
        const fairDoc = await db.collection("fairs").doc(fairId).get();
        if (!fairDoc.exists) return null;
        const fairData = fairDoc.data();
        return {
          id: fairId,
          name: fairData.name,
          description: fairData.description || null,
          isLive: fairData.isLive || false,
          startTime: fairData.startTime ? fairData.startTime.toMillis() : null,
          endTime: fairData.endTime ? fairData.endTime.toMillis() : null,
          boothId: enrollDoc.data().boothId,
          enrolledAt: enrollDoc.data().enrolledAt,
        };
      })
    );

    return res.json({ fairs: fairs.filter(Boolean) });
  } catch (err) {
    console.error("GET /api/companies/:companyId/fairs error:", err);
    return res.status(500).json({ error: "Failed to list company fairs" });
  }
});

/* DELETE /api/fairs/:fairId/leave - company owner/rep: leave (unenroll from) a fair */
router.delete("/fairs/:fairId/leave", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const requestingUid = req.user.uid;
  const bodyCompanyId =
    req.body && typeof req.body.companyId === "string" ? req.body.companyId.trim() : null;

  try {
    const userDoc = await db.collection("users").doc(requestingUid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    const userData = userDoc.data();
    const role = userData.role;
    const profileCompanyId = userData.companyId || null;

    let companyId = bodyCompanyId || null;

    if (!companyId && role === "companyOwner") {
      const ownedSnap = await db.collection("companies").where("ownerId", "==", requestingUid).get();
      const ownedIds = ownedSnap.docs.map((d) => d.id);
      const enrolledIds = [];
      for (const cid of ownedIds) {
        const ed = await db
          .collection("fairs")
          .doc(fairId)
          .collection("enrollments")
          .doc(cid)
          .get();
        if (ed.exists) enrolledIds.push(cid);
      }
      if (enrolledIds.length === 1) {
        companyId = enrolledIds[0];
      } else if (enrolledIds.length > 1) {
        return res.status(400).json({
          error: "You have multiple companies enrolled in this fair. Choose which company to remove.",
          code: "COMPANY_ID_REQUIRED",
        });
      }
    }

    if (!companyId) {
      companyId = profileCompanyId;
    }

    if (!companyId) return res.status(400).json({ error: "You are not associated with a company" });

    // Must be owner or rep of the company
    const accessError = await verifyCompanyAccess(requestingUid, companyId);
    if (accessError) return res.status(accessError.status).json({ error: accessError.error });

    const enrollmentDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("enrollments")
      .doc(companyId)
      .get();
    if (!enrollmentDoc.exists) return res.status(404).json({ error: "Your company is not enrolled in this fair" });

    const { boothId } = enrollmentDoc.data();
    const batch = db.batch();

    batch.delete(db.collection("fairs").doc(fairId).collection("enrollments").doc(companyId));

    if (boothId) {
      batch.delete(db.collection("fairs").doc(fairId).collection("booths").doc(boothId));
    }

    await batch.commit();

    // Remove company's jobs from the fair
    const jobsSnap = await db
      .collection("fairs")
      .doc(fairId)
      .collection("jobs")
      .where("companyId", "==", companyId)
      .get();
    if (!jobsSnap.empty) {
      const jobBatch = db.batch();
      jobsSnap.docs.forEach((doc) => jobBatch.delete(doc.ref));
      await jobBatch.commit();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/fairs/:fairId/leave error:", err);
    return res.status(500).json({ error: "Failed to leave fair" });
  }
});

/* GET /api/fairs/:fairId/company/:companyId/booth - get the fair-scoped booth for an enrolled company */
router.get("/fairs/:fairId/company/:companyId/booth", verifyFirebaseToken, async (req, res) => {
  const { fairId, companyId } = req.params;
  const requestingUid = req.user.uid;

  try {
    // Must be admin or member of the company
    const adminError = await verifyAdmin(requestingUid);
    if (adminError) {
      const accessError = await verifyCompanyAccess(requestingUid, companyId);
      if (accessError) return res.status(403).json({ error: "Unauthorized" });
    }

    const enrollmentDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("enrollments")
      .doc(companyId)
      .get();

    if (!enrollmentDoc.exists) {
      return res.status(404).json({ error: "Company is not enrolled in this fair" });
    }

    const { boothId } = enrollmentDoc.data();
    if (!boothId) {
      return res.status(404).json({ error: "No booth found for this enrollment" });
    }

    const boothDoc = await db
      .collection("fairs")
      .doc(fairId)
      .collection("booths")
      .doc(boothId)
      .get();

    if (!boothDoc.exists) {
      return res.status(404).json({ error: "Booth not found" });
    }

    const raw = boothDoc.data();
    const companyDoc = await db.collection("companies").doc(companyId).get();
    const companyData = companyDoc.exists ? companyDoc.data() : null;
    return res.json(mergeFairBoothPayloadWithCompany({ boothId, ...raw }, companyData));
  } catch (err) {
    console.error("GET /api/fairs/:fairId/company/:companyId/booth error:", err);
    return res.status(500).json({ error: "Failed to load fair booth" });
  }
});

/* =======================================================
   NETWORKING LOUNGE
======================================================= */

/* POST /api/fairs/:fairId/lounge/join - student: join the fair's networking lounge */
router.post("/fairs/:fairId/lounge/join", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const uid = req.user.uid;

  try {
    // Verify user is a student
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "student") {
      return res.status(403).json({ error: "Only students can join the networking lounge" });
    }

    // Verify fair exists
    const fairDoc = await db.collection("fairs").doc(fairId).get();
    if (!fairDoc.exists) return res.status(404).json({ error: "Fair not found" });

    const fairName = fairDoc.data().name || "Career Fair";
    const channelId = `lounge-${fairId}`;

    // Get or create the lounge channel and add the student as a member
    // created_by_id must be a real Stream user — use the joining student
    const channel = streamServerClient.channel("messaging", channelId, {
      name: `${fairName} Networking Lounge`,
      created_by_id: uid,
    });
    await channel.create();
    await channel.addMembers([uid]);

    return res.json({ success: true, channelId });
  } catch (err) {
    console.error("POST /api/fairs/:fairId/lounge/join error:", err);
    return res.status(500).json({ error: "Failed to join networking lounge" });
  }
});

/* GET /api/fairs/:fairId/lounge/attendees - student: list students in the lounge */
router.get("/fairs/:fairId/lounge/attendees", verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const uid = req.user.uid;

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "student") {
      return res.status(403).json({ error: "Only students can view lounge attendees" });
    }

    const channelId = `lounge-${fairId}`;
    const channel = streamServerClient.channel("messaging", channelId);
    const channelState = await channel.query({ members: { limit: 100 } });

    const memberUids = (channelState.members || [])
      .map((m) => m.user_id)
      .filter((id) => id && id !== "system");

    if (memberUids.length === 0) return res.json({ attendees: [] });

    const profileDocs = await Promise.all(
      memberUids.map((id) => db.collection("users").doc(id).get())
    );

    const attendees = profileDocs
      .filter(
        (doc) =>
          doc.exists &&
          doc.id !== uid &&
          doc.data().role === "student" &&
          doc.data().ghostMode !== true
      )
      .map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          email: data.email || "",
          major: data.major || "",
          expectedGradYear: data.expectedGradYear || null,
          skills: data.skills || "",
          linkedinUrl: data.linkedinUrl || null,
        };
      });

    return res.json({ attendees });
  } catch (err) {
    console.error("GET /api/fairs/:fairId/lounge/attendees error:", err);
    return res.status(500).json({ error: "Failed to fetch lounge attendees" });
  }
});

if (process.env.NODE_ENV === "test") {
  router.testHelpers = {
    fairScheduleFromFairData,
    serializeAnnouncementDoc,
    getCompanyAndBoothSnapshot,
  };
}

module.exports = router;
