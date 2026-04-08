"use strict";

const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../firebase");
const { verifyFirebaseToken, removeUndefined } = require("../helpers");
const { resolveHubVenueFieldsFromBody } = require("../lib/resolveHubVenueFields");

async function checkCompanyAuthorization(companyId, userId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) {
    return { authorized: false, error: "Invalid company ID" };
  }
  const companyData = companyDoc.data();
  const reps = companyData.representativeIDs || [];
  if (companyData.ownerId !== userId && !reps.includes(userId)) {
    return { authorized: false, error: "Not authorized for this company" };
  }
  return { authorized: true, companyData };
}

function locationDocToJson(doc) {
  const d = doc.data();
  const geo = d.venueGeo;
  let venueGeo = null;
  if (geo && typeof geo.latitude === "number" && typeof geo.longitude === "number") {
    venueGeo = { latitude: geo.latitude, longitude: geo.longitude };
  }
  return {
    id: doc.id,
    label: d.label ?? null,
    venueCity: d.venueCity,
    venueState: d.venueState,
    venueZip: d.venueZip ?? null,
    venueCountry: d.venueCountry ?? null,
    venueGeo,
    venueMapboxId: d.venueMapboxId ?? null,
    createdAt: d.createdAt?.toMillis?.() ?? null,
    updatedAt: d.updatedAt?.toMillis?.() ?? null,
  };
}

/** Public: list geocoded office locations for a company */
router.get("/api/companies/:companyId/locations", async (req, res) => {
  const { companyId } = req.params;
  try {
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return res.status(404).json({ error: "Company not found" });
    }
    const companyData = companyDoc.data();
    const snap = await db
      .collection("companies")
      .doc(companyId)
      .collection("locations")
      .orderBy("createdAt", "desc")
      .get();
    const locations = snap.docs.map((doc) => locationDocToJson(doc));
    return res.json({
      companyName: companyData.companyName ?? "",
      locations,
    });
  } catch (err) {
    console.error("GET /api/companies/:companyId/locations error:", err);
    return res.status(500).json({ error: "Failed to list locations" });
  }
});

/** Owner or representative: add a location */
router.post("/api/companies/:companyId/locations", verifyFirebaseToken, async (req, res) => {
  const { companyId } = req.params;
  const uid = req.user.uid;
  const { label } = req.body;

  const authz = await checkCompanyAuthorization(companyId, uid);
  if (!authz.authorized) {
    return res.status(authz.error === "Invalid company ID" ? 404 : 403).json({ error: authz.error });
  }

  const resolved = await resolveHubVenueFieldsFromBody(req.body);
  if (!resolved.ok) {
    return res.status(resolved.status).json({ error: resolved.error });
  }

  try {
    const ref = db.collection("companies").doc(companyId).collection("locations").doc();
    const now = admin.firestore.Timestamp.now();
    const payload = removeUndefined({
      ...resolved.venueFields,
      label: typeof label === "string" && label.trim() ? label.trim() : null,
      createdAt: now,
      updatedAt: now,
    });
    await ref.set(payload);
    const saved = await ref.get();
    return res.status(201).json(locationDocToJson(saved));
  } catch (err) {
    console.error("POST /api/companies/:companyId/locations error:", err);
    return res.status(500).json({ error: "Failed to add location" });
  }
});

/** Owner or representative: update a location */
router.put("/api/companies/:companyId/locations/:locationId", verifyFirebaseToken, async (req, res) => {
  const { companyId, locationId } = req.params;
  const uid = req.user.uid;
  const { label } = req.body;

  const authz = await checkCompanyAuthorization(companyId, uid);
  if (!authz.authorized) {
    return res.status(authz.error === "Invalid company ID" ? 404 : 403).json({ error: authz.error });
  }

  const locRef = db
    .collection("companies")
    .doc(companyId)
    .collection("locations")
    .doc(locationId);
  const existing = await locRef.get();
  if (!existing.exists) {
    return res.status(404).json({ error: "Location not found" });
  }

  const resolved = await resolveHubVenueFieldsFromBody(req.body);
  if (!resolved.ok) {
    return res.status(resolved.status).json({ error: resolved.error });
  }

  try {
    const now = admin.firestore.Timestamp.now();
    const payload = removeUndefined({
      ...resolved.venueFields,
      label: typeof label === "string" && label.trim() ? label.trim() : null,
      updatedAt: now,
    });
    await locRef.update(payload);
    const saved = await locRef.get();
    return res.json(locationDocToJson(saved));
  } catch (err) {
    console.error("PUT /api/companies/:companyId/locations/:locationId error:", err);
    return res.status(500).json({ error: "Failed to update location" });
  }
});

/** Owner or representative: delete a location */
router.delete("/api/companies/:companyId/locations/:locationId", verifyFirebaseToken, async (req, res) => {
  const { companyId, locationId } = req.params;
  const uid = req.user.uid;

  const authz = await checkCompanyAuthorization(companyId, uid);
  if (!authz.authorized) {
    return res.status(authz.error === "Invalid company ID" ? 404 : 403).json({ error: authz.error });
  }

  try {
    const locRef = db
      .collection("companies")
      .doc(companyId)
      .collection("locations")
      .doc(locationId);
    const existing = await locRef.get();
    if (!existing.exists) {
      return res.status(404).json({ error: "Location not found" });
    }
    await locRef.delete();
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/:companyId/locations/:locationId error:", err);
    return res.status(500).json({ error: "Failed to delete location" });
  }
});

module.exports = router;
