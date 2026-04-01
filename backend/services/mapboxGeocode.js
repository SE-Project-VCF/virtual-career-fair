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
    }
  }

  return {
    lat,
    lng,
    placeName: f.place_name || String(address).trim(),
    city,
    state,
    country,
    mapboxId: f.id || null,
  };
}

module.exports = { forwardGeocode };
