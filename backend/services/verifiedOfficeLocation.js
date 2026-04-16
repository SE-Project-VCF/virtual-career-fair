const { forwardGeocode } = require("./mapboxGeocode");

const HUB_GEOCODE_QUERY_MAX_LEN = 256;

function trimPart(v) {
  return v == null ? "" : String(v).trim();
}

function virtualFairGeocodeQuery(city, state, zip) {
  const c = trimPart(city);
  const s = trimPart(state);
  const z = trimPart(zip);
  const head = [c, s].filter(Boolean).join(", ");
  if (!head) return z;
  return z ? `${head} ${z}` : head;
}

/**
 * Verify a client-submitted office location (Mapbox), same rules as fair hub.
 * @param {{ id?: string, label?: string, geocodeQuery?: string, city?: string, state?: string, zip?: string }} input
 * @returns {Promise<{ ok: true, value: object } | { ok: false, status: number, error: string }>}
 */
async function verifyOfficeLocationInput(input) {
  const geoQField = trimPart(input.geocodeQuery ?? input.label);
  const city = trimPart(input.city);
  const state = trimPart(input.state);
  const zip = trimPart(input.zip);
  const useGeoQuery = geoQField.length > 0;

  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    return { ok: false, status: 503, error: "Geocoding is not configured" };
  }

  let g;
  if (useGeoQuery) {
    if (geoQField.length > HUB_GEOCODE_QUERY_MAX_LEN) {
      return { ok: false, status: 400, error: "Location search text is too long." };
    }
    g = await forwardGeocode(geoQField);
    if (!g) {
      return {
        ok: false,
        status: 400,
        error: "Could not verify this location. Try search suggestions or a fuller address.",
      };
    }
    const finalCity = g.city || null;
    const finalState = g.state || null;
    const finalZip = g.postcode || null;
    if (!finalCity || !finalState) {
      return {
        ok: false,
        status: 400,
        error:
          "Could not resolve city and state for this location. Pick a suggestion or try a fuller address.",
      };
    }
    if (finalZip && finalZip.length > 20) {
      return { ok: false, status: 400, error: "ZIP or postal code must be 20 characters or less." };
    }
    const id =
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim()
        : `loc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      ok: true,
      value: {
        id,
        label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : g.placeName,
        city: finalCity,
        state: finalState,
        zip: finalZip || null,
        country: g.country || null,
        lat: g.lat,
        lng: g.lng,
        mapboxId: g.mapboxId,
      },
    };
  }

  if (zip.length > 20) {
    return { ok: false, status: 400, error: "ZIP or postal code must be 20 characters or less." };
  }
  const geoQuery = virtualFairGeocodeQuery(city, state, zip);
  if (!trimPart(geoQuery)) {
    return {
      ok: false,
      status: 400,
      error: "Enter a location, ZIP, or place to verify with search.",
    };
  }
  if (geoQuery.length > HUB_GEOCODE_QUERY_MAX_LEN) {
    return { ok: false, status: 400, error: "Location search text is too long." };
  }
  g = await forwardGeocode(geoQuery);
  if (!g) {
    return {
      ok: false,
      status: 400,
      error: "Could not verify this location. Try search suggestions or a fuller address.",
    };
  }
  const finalCity = g.city || city || null;
  const finalState = g.state || state || null;
  const finalZip = zip || g.postcode || null;
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
  const id =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : `loc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    ok: true,
    value: {
      id,
      label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : g.placeName,
      city: finalCity,
      state: finalState,
      zip: zipOut,
      country: g.country || null,
      lat: g.lat,
      lng: g.lng,
      mapboxId: g.mapboxId,
    },
  };
}

module.exports = {
  verifyOfficeLocationInput,
  HUB_GEOCODE_QUERY_MAX_LEN,
  virtualFairGeocodeQuery,
  trimPart,
};
