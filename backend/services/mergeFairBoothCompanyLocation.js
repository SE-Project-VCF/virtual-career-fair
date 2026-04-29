const { geoPointToJson } = require("./geo");

function legacyBoothLocationLine(boothData) {
  if (!boothData || typeof boothData !== "object") return "";
  if (boothData.locationIsRemote === true) return "Remote";
  const cs = [boothData.locationCity, boothData.locationState].filter(Boolean).join(", ");
  if (cs) return cs;
  if (boothData.location) return String(boothData.location);
  return "";
}

function geoFromEntry(entry) {
  if (entry == null || typeof entry !== "object") return null;
  if (typeof entry.lat === "number" && typeof entry.lng === "number") {
    return { latitude: entry.lat, longitude: entry.lng };
  }
  return geoPointToJson(entry.venueGeo);
}

/**
 * JSON-safe office location entries from a company Firestore doc.
 * @param {unknown} raw
 * @returns {Array<{ id: string, label: string, city: string, state: string, zip: string|null, country: string|null, lat: number, lng: number, mapboxId: string|null }>}
 */
function officeLocationsFromCompanyDoc(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const label = typeof entry.label === "string" ? entry.label : "";
    const city = typeof entry.city === "string" ? entry.city : "";
    const state = typeof entry.state === "string" ? entry.state : "";
    if (!id || !label) continue;
    const geo = geoFromEntry(entry);
    out.push({
      id,
      label,
      city,
      state,
      zip: entry.zip != null ? String(entry.zip) : null,
      country: entry.country != null ? String(entry.country) : null,
      lat: geo?.latitude ?? (typeof entry.lat === "number" ? entry.lat : NaN),
      lng: geo?.longitude ?? (typeof entry.lng === "number" ? entry.lng : NaN),
      mapboxId: entry.mapboxId != null ? String(entry.mapboxId) : null,
    });
  }
  return out.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

function locationDisplayFromCompany(companyData, boothData) {
  if (companyData && companyData.remoteEmployer === true) return "Remote";
  const offices = officeLocationsFromCompanyDoc(companyData?.officeLocations);
  if (offices.length > 0) {
    return offices
      .map((o) => o.label || [o.city, o.state].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ");
  }
  return legacyBoothLocationLine(boothData);
}

/**
 * @param {object} boothData - raw fair booth fields
 * @param {object|null|undefined} companyData - companies/{id} data or null if missing
 * @returns {object} boothData plus remoteEmployer, officeLocations, locationDisplay; overwrites location for list cards
 */
function mergeFairBoothPayloadWithCompany(boothData, companyData) {
  const remoteEmployer = companyData?.remoteEmployer === true;
  const officeLocations = officeLocationsFromCompanyDoc(companyData?.officeLocations);
  const locationDisplay = locationDisplayFromCompany(companyData || {}, boothData);
  return {
    ...boothData,
    remoteEmployer,
    officeLocations,
    locationDisplay,
    location: locationDisplay || boothData?.location || null,
  };
}

module.exports = {
  mergeFairBoothPayloadWithCompany,
  legacyBoothLocationLine,
  officeLocationsFromCompanyDoc,
  locationDisplayFromCompany,
};
