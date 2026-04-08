"use strict";

const admin = require("firebase-admin");
const { removeUndefined } = require("../helpers");
const { forwardGeocode } = require("../services/mapboxGeocode");

function trimVenuePart(v) {
  return v == null ? "" : String(v).trim();
}

const HUB_GEOCODE_QUERY_MAX_LEN = 256;

/** Mapbox query string from city + state + optional ZIP (same as fair hub). */
function virtualLocationGeocodeQuery(city, state, zip) {
  const c = trimVenuePart(city);
  const s = trimVenuePart(state);
  const z = trimVenuePart(zip);
  const head = [c, s].filter(Boolean).join(", ");
  if (!head) return z;
  return z ? `${head} ${z}` : head;
}

/**
 * Resolve normalized venue fields from request body (venueGeocodeQuery and/or city/state/ZIP).
 * Same validation and Mapbox path as POST /api/fairs hub.
 * @returns {Promise<{ ok: true, venueFields: object } | { ok: false, status: number, error: string }>}
 */
async function resolveHubVenueFieldsFromBody(body) {
  const { venueGeocodeQuery, venueCity, venueState, venueZip } = body || {};
  const geoQField = trimVenuePart(venueGeocodeQuery);
  const city = trimVenuePart(venueCity);
  const state = trimVenuePart(venueState);
  const zip = trimVenuePart(venueZip);
  const useGeoQuery = geoQField.length > 0;
  const hasAnyHubPart = Boolean(city || state || zip || useGeoQuery);

  if (!hasAnyHubPart) {
    return {
      ok: false,
      status: 400,
      error: "Provide a location using search or city, state, and ZIP.",
    };
  }

  let geoQuery;
  let fromSingleQuery = false;
  if (useGeoQuery) {
    if (geoQField.length > HUB_GEOCODE_QUERY_MAX_LEN) {
      return { ok: false, status: 400, error: "Location search text is too long." };
    }
    geoQuery = geoQField;
    fromSingleQuery = true;
  } else {
    if (zip.length > 20) {
      return { ok: false, status: 400, error: "ZIP or postal code must be 20 characters or less." };
    }
    geoQuery = virtualLocationGeocodeQuery(city, state, zip);
    if (!trimVenuePart(geoQuery)) {
      return {
        ok: false,
        status: 400,
        error: "Enter a location, ZIP, or place to verify with search.",
      };
    }
    if (geoQuery.length > HUB_GEOCODE_QUERY_MAX_LEN) {
      return { ok: false, status: 400, error: "Location search text is too long." };
    }
  }

  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    return { ok: false, status: 503, error: "Geocoding is not configured" };
  }

  const g = await forwardGeocode(geoQuery);
  if (!g) {
    return {
      ok: false,
      status: 400,
      error: "Could not verify this location. Try search suggestions or a fuller address.",
    };
  }

  const finalCity = fromSingleQuery ? g.city || null : g.city || city || null;
  const finalState = fromSingleQuery ? g.state || null : g.state || state || null;
  const finalZip = fromSingleQuery ? g.postcode || null : zip || g.postcode || null;

  if (!finalCity || !finalState) {
    return {
      ok: false,
      status: 400,
      error:
        "Could not resolve city and state for this location. Pick a suggestion or try a fuller address.",
    };
  }

  const zipOut = finalZip || null;
  if (zipOut && zipOut.length > 20) {
    return { ok: false, status: 400, error: "ZIP or postal code must be 20 characters or less." };
  }

  const venueFields = removeUndefined({
    venueCity: finalCity,
    venueState: finalState,
    venueZip: zipOut,
    venueCountry: g.country,
    venueGeo: new admin.firestore.GeoPoint(g.lat, g.lng),
    venueMapboxId: g.mapboxId,
  });

  return { ok: true, venueFields };
}

module.exports = {
  trimVenuePart,
  virtualLocationGeocodeQuery,
  HUB_GEOCODE_QUERY_MAX_LEN,
  resolveHubVenueFieldsFromBody,
};
