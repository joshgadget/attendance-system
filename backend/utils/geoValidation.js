const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const toDegrees = (value) => (Number(value) * 180) / Math.PI;

const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const pointInPolygon = (latitude, longitude, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [lngI, latI] = polygon[i];
    const [lngJ, latJ] = polygon[j];

    if (
      (latI > latitude) !== (latJ > latitude) &&
      longitude < ((lngJ - lngI) * (latitude - latI)) / (latJ - latI) + lngI
    ) {
      inside = !inside;
    }
  }

  return inside;
};

const pointNearPolygon = (latitude, longitude, polygon, toleranceMeters) => {
  if (pointInPolygon(latitude, longitude, polygon)) return true;
  if (!toleranceMeters || toleranceMeters <= 0) return false;

  const toleranceDegrees = toleranceMeters / 111320;
  for (let i = 0; i < polygon.length; i++) {
    const [lng, lat] = polygon[i];
    if (haversineDistance(latitude, longitude, lat, lng) <= toleranceMeters) return true;
  }

  for (let i = 0; i < polygon.length; i++) {
    const [lngA, latA] = polygon[i];
    const [lngB, latB] = polygon[(i + 1) % polygon.length];
    const dist = distanceToSegment(latitude, longitude, latA, lngA, latB, lngB);
    if (dist <= toleranceMeters) return true;
  }

  return false;
};

const distanceToSegment = (lat, lng, latA, lngA, latB, lngB) => {
  const d = haversineDistance(latA, lngA, latB, lngB);
  if (d === 0) return haversineDistance(lat, lng, latA, lngA);

  const xRatio = ((lat - latA) * (latB - latA) + (lng - lngA) * (lngB - lngA)) / (d * d);
  if (xRatio < 0) return haversineDistance(lat, lng, latA, lngA);
  if (xRatio > 1) return haversineDistance(lat, lng, latB, lngB);

  const projLat = latA + xRatio * (latB - latA);
  const projLng = lngA + xRatio * (lngB - lngA);
  return haversineDistance(lat, lng, projLat, projLng);
};

const isInsideNigeriaBounds = (latitude, longitude) =>
  latitude >= 4.0 && latitude <= 14.0 &&
  longitude >= 2.5 && longitude <= 15.0;

const validateGpsAccuracy = (accuracy) => {
  if (accuracy === null || accuracy === undefined) {
    return { valid: false, reason: 'GPS accuracy not available. Enable high-accuracy location and try again.' };
  }

  const parsed = Number(accuracy);
  if (Number.isNaN(parsed)) {
    return { valid: false, reason: 'Invalid GPS accuracy value.' };
  }

  if (parsed < 0) {
    return { valid: false, reason: 'Your location accuracy is too low. Move to an open area and try again.' };
  }

  if (parsed > 100) {
    return { valid: false, reason: `Your location accuracy is too low (${Math.round(parsed)}m). Move to an open area and try again.` };
  }

  return { valid: true, accuracy: parsed };
};

const validateLocationTimestamp = (timestamp, maxAgeMs = 60000) => {
  if (!timestamp) return { valid: true };
  const age = Date.now() - new Date(timestamp).getTime();
  if (age > maxAgeMs) {
    return { valid: false, reason: 'Your location is outdated. Refresh your location and try again.' };
  }
  return { valid: true };
};

const isMockedLocation = (latitude, longitude, accuracy, timestamp, deviceInfo) => {
  if (latitude === 0 && longitude === 0) return true;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return true;

  const suspiciousPrecise = String(latitude).length > 12 || String(longitude).length > 12;
  const accuracyTooPerfect = accuracy !== null && accuracy !== undefined && Number(accuracy) < 1;
  const mockIndicators = ['mock', 'fake', 'emulator', 'simulator'];

  if (deviceInfo) {
    const info = String(deviceInfo).toLowerCase();
    if (mockIndicators.some((indicator) => info.includes(indicator))) return true;
  }

  return suspiciousPrecise && accuracyTooPerfect;
};

module.exports = {
  haversineDistance,
  pointInPolygon,
  pointNearPolygon,
  isInsideNigeriaBounds,
  validateGpsAccuracy,
  validateLocationTimestamp,
  isMockedLocation,
};
