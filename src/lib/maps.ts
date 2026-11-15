// Google Maps links for where a mission is. The point is the centre of the mission's neighbourhood, so the organization
// still confirms the exact meeting spot; the link just shows the area on a map and lets the volunteer get directions.
const q = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;
export const mapsView = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${q(lat, lon)}`;
export const mapsDirections = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${q(lat, lon)}`;
