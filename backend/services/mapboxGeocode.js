/**
 * Forward geocode via Mapbox Geocoding API v5.
 * @param {string} address
 * @returns {Promise<{
 *   lat: number,
 *   lng: number,
 *   placeName: string,
 *   city: string | null,
 *   state: string | null,
 *   country: string | null,
 *   postcode: string | null,
 *   mapboxId: string | null
 * } | null>}
 */
async function forwardGeocode(address) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token || !String(address).trim()) return null;

  const encoded = encodeURIComponent(String(address).trim());
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
    `?access_token=${encodeURIComponent(token)}&limit=1`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Mapbox geocoding failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const f = data.features && data.features[0];
  if (!f || !f.center || f.center.length < 2) return null;

  const [lng, lat] = f.center;
  let city = null;
  let state = null;
  let country = null;
  let postcode = null;

  if (Array.isArray(f.context)) {
    for (const c of f.context) {
      if (typeof c.id !== "string") continue;
      if (c.id.startsWith("place.")) city = c.text || city;
      if (c.id.startsWith("locality.") && !city) city = c.text || city;
      if (c.id.startsWith("region.")) {
        const sc = c.short_code;
        state = typeof sc === "string" && sc.includes("-") ? sc.split("-").pop() : c.text || null;
      }
      if (c.id.startsWith("country.")) {
        country = c.short_code || c.text || null;
      }
      if (c.id.startsWith("postcode.")) postcode = c.text || postcode;
    }
  }

  const pt = f.place_type;
  if (Array.isArray(pt)) {
    if ((pt.includes("place") || pt.includes("locality")) && !city && typeof f.text === "string") {
      city = f.text;
    }
    if (pt.includes("postcode") && !postcode && typeof f.text === "string") postcode = f.text;
    if (pt.includes("region") && !state && typeof f.text === "string") state = f.text;
  }

  return {
    lat,
    lng,
    placeName: f.place_name || String(address).trim(),
    city,
    state,
    country,
    postcode,
    mapboxId: f.id || null,
  };
}

/** City / state / ZIP hints from a Geocoding API feature (for autocomplete). */
function placePartsFromFeature(f) {
  let city = null;
  let state = null;
  let zip = null;
  if (Array.isArray(f.context)) {
    for (const c of f.context) {
      if (typeof c.id !== "string") continue;
      if (c.id.startsWith("place.")) city = c.text || city;
      if (c.id.startsWith("locality.") && !city) city = c.text || city;
      if (c.id.startsWith("region.")) {
        const sc = c.short_code;
        state = typeof sc === "string" && sc.includes("-") ? sc.split("-").pop() : c.text || state;
      }
      if (c.id.startsWith("postcode.")) zip = c.text || zip;
    }
  }
  const pt = f.place_type;
  if (Array.isArray(pt)) {
    if ((pt.includes("place") || pt.includes("locality")) && !city && typeof f.text === "string") {
      city = f.text;
    }
    if (pt.includes("postcode") && !zip && typeof f.text === "string") zip = f.text;
    if (pt.includes("region") && !state && typeof f.text === "string") state = f.text;
  }
  return { city, state, zip };
}

/**
 * Location autocomplete suggestions (Mapbox Geocoding API v5).
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ id: string, label: string, lat: number, lng: number, city: string|null, state: string|null, zip: string|null }[]>}
 */
async function suggestPlaces(query, opts = {}) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const q = String(query || "").trim();
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 10);
  if (!token || q.length < 2) return [];

  const encoded = encodeURIComponent(q);
  const types = "place,locality,region,postcode,address,neighborhood,district";
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
    `?access_token=${encodeURIComponent(token)}&limit=${limit}&types=${encodeURIComponent(types)}&autocomplete=true`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Mapbox suggest failed:", res.status, errText.slice(0, 200));
    return [];
  }

  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];

  return features
    .map((f) => {
      const [lng, lat] = f.center || [];
      const { city, state, zip } = placePartsFromFeature(f);
      return {
        id: String(f.id || ""),
        label: typeof f.place_name === "string" ? f.place_name : "",
        lat,
        lng,
        city,
        state,
        zip,
      };
    })
    .filter((x) => x.label && Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

module.exports = { forwardGeocode, suggestPlaces };
