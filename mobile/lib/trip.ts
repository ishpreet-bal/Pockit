import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';

/** Plan a trip: the saved car, place search and routes — with sample answers in the demo. */

export interface Vehicle {
  id: number; year: number; make: string; model: string; detail: string;
  city: number; highway: number; electric: boolean;
  fuel: 'regular' | 'premium' | 'midgrade' | 'diesel' | 'electric';
  vehicleClass: string;
}
export interface Place { name: string; address: string; lat: number; lon: number }
export interface Route { distanceKm: number; durationMin: number; points: [number, number][]; source: 'google' | 'osm' | 'demo' }

const memory = new Map<string, string>();
async function read(key: string) { return Platform.OS === 'web' ? memory.get(key) ?? null : SecureStore.getItemAsync(`pockit.trip.${key}`); }
async function write(key: string, v: string) { if (Platform.OS === 'web') memory.set(key, v); else await SecureStore.setItemAsync(`pockit.trip.${key}`, v); }

export interface TripSettings { vehicle: Vehicle | null; own: string; price: string; tank: string }
export async function loadSettings(): Promise<TripSettings> {
  try { const raw = await read('settings'); if (raw) return { vehicle: null, own: '', price: '', tank: '', ...JSON.parse(raw) }; } catch { /* first time */ }
  return { vehicle: PREVIEW ? DEMO_CAR : null, own: '', price: '', tank: '' };
}
export async function saveSettings(s: Partial<TripSettings>) {
  const cur = await loadSettings();
  await write('settings', JSON.stringify({ ...cur, ...s }));
}

/* ---------------- the car picker ---------------- */

const DEMO_CAR: Vehicle = { id: 37724, year: 2017, make: 'Toyota', model: 'Camry', detail: '2.5L · 4 cyl · Auto (S6)', city: 9.8, highway: 7.13, electric: false, fuel: 'regular', vehicleClass: 'Midsize Cars' };
const DEMO_MENU: Record<string, string[]> = {
  '': ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'],
  y: ['Chevrolet', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Nissan', 'Tesla', 'Toyota', 'Volkswagen'],
  m: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Tacoma'],
};

export async function vehicleMenu(year?: string, make?: string, model?: string): Promise<{ items?: string[]; versions?: { id: number; detail: string }[] }> {
  if (PREVIEW) {
    if (model) return { versions: [{ id: DEMO_CAR.id, detail: DEMO_CAR.detail }] };
    return { items: DEMO_MENU[make ? 'm' : year ? 'y' : '']! };
  }
  const q = new URLSearchParams();
  if (year) q.set('year', year);
  if (make) q.set('make', make);
  if (model) q.set('model', model);
  return api(`/api/mobile/vehicles?${q.toString()}`);
}

export async function getVehicle(id: number, label?: { year: string; make: string; model: string }): Promise<Vehicle> {
  if (PREVIEW) return label ? { ...DEMO_CAR, year: Number(label.year), make: label.make, model: label.model } : DEMO_CAR;
  return (await api<{ vehicle: Vehicle }>(`/api/mobile/vehicles?id=${id}`)).vehicle;
}

/* ---------------- places and routes ---------------- */

const DEMO_PLACES: Place[] = [
  { name: 'CN Tower', address: '290 Bremner Blvd, Toronto, ON', lat: 43.6426, lon: -79.3871 },
  { name: 'Parliament Hill', address: 'Wellington St, Ottawa, ON', lat: 45.4236, lon: -75.7009 },
  { name: 'Square One', address: '100 City Centre Dr, Mississauga, ON', lat: 43.5931, lon: -79.6424 },
  { name: 'Niagara Falls', address: 'Niagara Falls, ON', lat: 43.0896, lon: -79.0849 },
];

export async function searchPlaces(q: string, near?: { lat: number; lon: number } | null): Promise<Place[]> {
  if (PREVIEW) return DEMO_PLACES.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(q.toLowerCase())).concat(DEMO_PLACES).slice(0, 4);
  const p = new URLSearchParams({ q });
  if (near) { p.set('lat', String(near.lat)); p.set('lon', String(near.lon)); }
  return (await api<{ places: Place[] }>(`/api/mobile/places?${p.toString()}`)).places;
}

export async function nameHere(lat: number, lon: number): Promise<Place> {
  if (PREVIEW) return { name: 'Current location', address: 'Toronto, ON', lat, lon };
  return (await api<{ place: Place }>(`/api/mobile/places?lat=${lat}&lon=${lon}`)).place;
}

export async function route(from: Place, to: Place): Promise<Route> {
  if (PREVIEW) {
    // A straight-ish line is fine for the demo; distance from the real Toronto–Ottawa drive scaled by crow-flies.
    const km = haversine(from, to) * 1.25;
    return { distanceKm: km, durationMin: km / 85 * 60, points: [[from.lat, from.lon], [to.lat, to.lon]], source: 'demo' };
  }
  return (await api<{ route: Route }>(`/api/mobile/route?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`)).route;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A starting price when they haven't set one — roughly the Canadian average, by fuel. */
export function defaultPrice(v: Vehicle | null): number {
  switch (v?.fuel) {
    case 'premium': return 1.85;
    case 'midgrade': return 1.72;
    case 'diesel': return 1.70;
    case 'electric': return 0.15;
    default: return 1.55;
  }
}
