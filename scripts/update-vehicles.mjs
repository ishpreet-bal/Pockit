/** Refresh the bundled EPA catalogue: npm run vehicles:update [-- path/to/vehicles.csv]. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';

const source = 'https://www.fueleconomy.gov/feg/epadata/vehicles.csv';
const local = process.argv[2];
let csv;
if (local) csv = await readFile(local, 'utf8');
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`EPA download failed (${response.status}); the existing catalogue was not changed.`);
  csv = await response.text();
}
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
if (parsed.errors.length) throw new Error('Invalid EPA CSV; the existing catalogue was not changed.');
const fuelCodes = { 'Regular Gasoline': 'R', 'Premium Gasoline': 'P', 'Midgrade Gasoline': 'M', Diesel: 'D', Electricity: 'E' };
const rows = [];
const excluded = new Set();
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const round = (n) => Math.round(n * 100) / 100;
for (const row of parsed.data) {
  const fuel = fuelCodes[row.fuelType1];
  if (!fuel) { excluded.add(row.fuelType1); continue; }
  const electric = fuel === 'E';
  const city = electric ? Number(row.cityE) / 1.609344 : 235.215 / Number(row.city08);
  const highway = electric ? Number(row.highwayE) / 1.609344 : 235.215 / Number(row.highway08);
  if (!positive(row.id) || !positive(row.year) || !positive(city) || !positive(highway) || !row.make || !row.model) continue;
  const detail = [
    !electric && positive(row.displ) ? `${Number(row.displ).toFixed(1)}L` : '',
    !electric && positive(row.cylinders) ? `${row.cylinders} cyl` : '',
    row.trany?.replace('Automatic', 'Auto'), row.drive,
    ['Hybrid', 'Plug-in Hybrid', 'EV'].includes(row.atvType) ? row.atvType.replace('EV', 'Electric') : '',
  ].filter(Boolean).join(' · ');
  rows.push([Number(row.id), Number(row.year), row.make.trim(), row.model.trim(), detail,
    electric ? null : round(city), electric ? null : round(highway), fuel,
    electric ? round(city) : null, electric ? round(highway) : null, row.VClass]);
}
const target = new URL('../src/lib/trip/vehicles-data.json', import.meta.url);
const previous = JSON.parse(await readFile(target, 'utf8'));
const maxYear = Math.max(...rows.map((r) => r[1]));
if (rows.length < previous.length || maxYear < Math.max(...previous.map((r) => r[1])) || new Set(rows.map((r) => r[0])).size !== rows.length) {
  throw new Error('The downloaded catalogue is incomplete or contains duplicate IDs; the existing catalogue was not changed.');
}
rows.sort((a, b) => b[1] - a[1] || a[2].localeCompare(b[2], 'en') || a[3].localeCompare(b[3], 'en') || a[4].localeCompare(b[4], 'en') || a[0] - b[0]);
const metadata = {
  source, documentation: 'https://www.fueleconomy.gov/feg/ws/index.shtml',
  retrievedAt: new Date().toISOString(), csvSha256: createHash('sha256').update(csv).digest('hex'),
  count: rows.length, minYear: Math.min(...rows.map((r) => r[1])), maxYear,
  excludedFuels: [...excluded].sort(),
};
await writeFile(target, JSON.stringify(rows));
await writeFile(new URL('../src/lib/trip/vehicles-meta.json', import.meta.url), JSON.stringify(metadata, null, 2) + '\n');
console.log(`Bundled ${rows.length} EPA vehicles (${metadata.minYear}–${maxYear}).`);
