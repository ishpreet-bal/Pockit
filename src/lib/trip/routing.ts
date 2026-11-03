import 'server-only';

/**
 * Finding places and driving routes.
 *
 * With GOOGLE_MAPS_API_KEY set this uses Google (Places text search + the
 * Routes API) — the most accurate distances, and traffic-aware times. Without
 * a key it falls back to free OpenStreetMap services (Photon for search, the
 * public OSRM server for routes), which are good for trying the feature but
 * have no uptime promise, so production should set the key.
 */

export interface Place { name: string; address: string; lat: number; lon: number }
export interface Route { distanceKm: number; durationMin: number; points: [number, number][]; source: 'google' | 'osm' }

const KEY = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
const UA = { 'user-agent': 'Pockit/1.0 (personal finance app)' };

export async function searchPlaces(q: string, near?: { lat: number; lon: number }): Promise<Place[]> {
  const key = KEY();
  if (key) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location' },
      body: JSON.stringify({
        textQuery: q, pageSize: 6,
        ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 50_000 } } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`places ${res.status}`);
    const j = (await res.json()) as { places?: { displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }[] };
    return (j.places ?? []).map((p) => ({ name: p.displayName?.text ?? p.formattedAddress ?? q, address: p.formattedAddress ?? '', lat: p.location.latitude, lon: p.location.longitude }));
  }
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q); url.searchParams.set('limit', '6');
  if (near) { url.searchParams.set('lat', String(near.lat)); url.searchParams.set('lon', String(near.lon)); }
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const j = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
  return j.features.map((f) => {
    const p = f.properties;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || q;
    const address = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.city, p.state, p.country].filter((x) => x && x !== name).join(', ');
    return { name, address, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  });
}

export async function reverse(lat: number, lon: number): Promise<Place> {
  const fallback = { name: 'Current location', address: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { features: { properties: Record<string, string | undefined> }[] };
    const p = j.features[0]?.properties;
    if (!p) return fallback;
    return { name: 'Current location', address: [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.name, p.city].filter(Boolean).join(', '), lat, lon };
  } catch { return fallback; }
}

export async function drivingRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<Route> {
  const key = KEY();
  if (key) {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
        travelMode: 'DRIVE',
      }),
    });
    if (!res.ok) throw new Error(`routes ${res.status}`);
    const j = (await res.json()) as { routes?: { distanceMeters: number; duration: string; staticDuration?: string; polyline: { encodedPolyline: string } }[] };
    const r = j.routes?.[0];
    if (!r) throw new Error('no route');
    // Free-flow time judges city vs highway better than a traffic-jammed one.
    const secs = parseInt(r.staticDuration ?? r.duration, 10);
    return { distanceKm: r.distanceMeters / 1000, durationMin: secs / 60, points: decodePolyline(r.polyline.encodedPolyline), source: 'google' };
  }
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=polyline`, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  const j = (await res.json()) as { code: string; routes: { distance: number; duration: number; geometry: string }[] };
  const r = j.routes?.[0];
  if (j.code !== 'Ok' || !r) throw new Error('no route');
  return { distanceKm: r.distance / 1000, durationMin: r.duration / 60, points: decodePolyline(r.geometry), source: 'osm' };
}

/** Google's encoded polyline format (precision 5), used by both Google and OSRM. */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / 1e5, lon / 1e5]);
  }
  // A map line doesn't need thousands of points.
  const step = Math.max(1, Math.ceil(out.length / 400));
  return out.filter((_, k) => k % step === 0 || k === out.length - 1);
}
