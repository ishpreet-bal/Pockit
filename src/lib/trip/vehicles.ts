import 'server-only';
import data from './vehicles-data.json';

/**
 * Every car the EPA has rated, by year → make → model → version.
 *
 * 1984–2019 ships with Pockit (scripts/build-vehicles.py). Newer years come
 * live from fueleconomy.gov's free web service, which has the current model
 * year as soon as it's rated; if that site is unreachable the bundled list
 * still works for older cars. Both use the EPA's own vehicle ids.
 */

type Row = [number, number, string, string, string, number | null, number | null, string, number | null, number | null, string];
const ROWS = data as unknown as Row[];
const BUNDLED_TO = Math.max(...ROWS.slice(0, 50).map((r) => r[1]));
const EPA = 'https://www.fueleconomy.gov/ws/rest/vehicle';

export interface Vehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  detail: string;
  /** L/100km, or kWh/100km when electric. */
  city: number;
  highway: number;
  electric: boolean;
  fuel: 'regular' | 'premium' | 'midgrade' | 'diesel' | 'electric';
  vehicleClass: string;
}

const FUEL: Record<string, Vehicle['fuel']> = { R: 'regular', P: 'premium', M: 'midgrade', D: 'diesel', E: 'electric' };
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

function fromRow(r: Row): Vehicle {
  const electric = r[7] === 'E';
  return {
    id: r[0], year: r[1], make: r[2], model: r[3], detail: r[4],
    city: (electric ? r[8] : r[5]) ?? 0, highway: (electric ? r[9] : r[6]) ?? 0,
    electric, fuel: FUEL[r[7]] ?? 'regular', vehicleClass: r[10],
  };
}

async function epa<T>(path: string): Promise<T> {
  const res = await fetch(`${EPA}${path}`, { headers: { accept: 'application/json' }, next: { revalidate: 86_400 } });
  if (!res.ok) throw new Error(`EPA ${res.status}`);
  return res.json() as Promise<T>;
}

interface Menu { menuItem?: { text: string; value: string } | { text: string; value: string }[] }
const items = (m: Menu) => (m.menuItem ? (Array.isArray(m.menuItem) ? m.menuItem : [m.menuItem]) : []);

export async function years(): Promise<number[]> {
  const bundled = [...new Set(ROWS.map((r) => r[1]))];
  try {
    const live = items(await epa<Menu>('/menu/year')).map((i) => Number(i.value));
    return [...new Set([...live, ...bundled])].sort((a, b) => b - a);
  } catch {
    return bundled.sort((a, b) => b - a);
  }
}

export async function makes(year: number): Promise<string[]> {
  if (year <= BUNDLED_TO) return uniq(ROWS.filter((r) => r[1] === year).map((r) => r[2]));
  return uniq(items(await epa<Menu>(`/menu/make?year=${year}`)).map((i) => i.text));
}

export async function models(year: number, make: string): Promise<string[]> {
  if (year <= BUNDLED_TO) return uniq(ROWS.filter((r) => r[1] === year && r[2] === make).map((r) => r[3]));
  return uniq(items(await epa<Menu>(`/menu/model?year=${year}&make=${encodeURIComponent(make)}`)).map((i) => i.text));
}

export async function versions(year: number, make: string, model: string): Promise<{ id: number; detail: string }[]> {
  if (year <= BUNDLED_TO) {
    return ROWS.filter((r) => r[1] === year && r[2] === make && r[3] === model).map((r) => ({ id: r[0], detail: r[4] }));
  }
  return items(await epa<Menu>(`/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`))
    .map((i) => ({ id: Number(i.value), detail: i.text }));
}

interface EpaVehicle {
  id: string; year: string; make: string; model: string; trany?: string; displ?: string; cylinders?: string; atvType?: string;
  city08: string; highway08: string; cityE?: string; highwayE?: string; fuelType1: string; VClass: string;
}

export async function vehicle(id: number): Promise<Vehicle | null> {
  const row = ROWS.find((r) => r[0] === id);
  if (row) return fromRow(row);
  const v = await epa<EpaVehicle>(`/${id}`);
  const electric = v.fuelType1 === 'Electricity';
  const mpgToL = (mpg: string) => (Number(mpg) > 0 ? 235.215 / Number(mpg) : 0);
  const kwh = (x?: string) => (Number(x) > 0 ? Number(x) / 1.609344 : 0);
  const fuel = electric ? 'electric' : v.fuelType1.startsWith('Premium') ? 'premium' : v.fuelType1.startsWith('Midgrade') ? 'midgrade' : v.fuelType1 === 'Diesel' ? 'diesel' : 'regular';
  return {
    id: Number(v.id), year: Number(v.year), make: v.make, model: v.model,
    detail: [v.displ && !electric ? `${Number(v.displ).toFixed(1)}L` : '', v.cylinders && !electric ? `${v.cylinders} cyl` : '', v.trany ?? '', v.atvType && v.atvType !== 'null' ? v.atvType : ''].filter(Boolean).join(' · '),
    city: electric ? kwh(v.cityE) : mpgToL(v.city08),
    highway: electric ? kwh(v.highwayE) : mpgToL(v.highway08),
    electric, fuel, vehicleClass: v.VClass,
  };
}
