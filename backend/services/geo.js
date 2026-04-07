/**
 * Great-circle distance in miles (WGS84 sphere).
 */
function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Firestore GeoPoint or plain { latitude, longitude } → JSON-safe object.
 */
function geoPointToJson(geo) {
  if (!geo) return null;
  if (typeof geo.latitude === "number" && typeof geo.longitude === "number") {
    return { latitude: geo.latitude, longitude: geo.longitude };
  }
  if (typeof geo._latitude === "number" && typeof geo._longitude === "number") {
    return { latitude: geo._latitude, longitude: geo._longitude };
  }
  return null;
}

function venueFieldsFromDoc(data) {
  if (!data) {
    return {
      venueCity: null,
      venueState: null,
      venueZip: null,
      venueCountry: null,
      venueGeo: null,
    };
  }
  return {
    venueCity: data.venueCity ?? null,
    venueState: data.venueState ?? null,
    venueZip: data.venueZip ?? null,
    venueCountry: data.venueCountry ?? null,
    venueGeo: geoPointToJson(data.venueGeo),
  };
}

module.exports = { haversineMiles, geoPointToJson, venueFieldsFromDoc };
