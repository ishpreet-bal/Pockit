"""Turn the EPA's vehicles.csv into the compact list Pockit ships.

Run: python3 scripts/build-vehicles.py path/to/vehicles.csv
Each row: [id, year, make, model, detail, cityL100, hwyL100, fuel, cityKwh100, hwyKwh100, class]
Fuel use is stored in litres per 100 km (EPA gives US mpg), electricity in kWh per 100 km.
"""
import csv, json, sys

FUEL = {'Regular Gasoline': 'R', 'Premium Gasoline': 'P', 'Midgrade Gasoline': 'M', 'Diesel': 'D', 'Electricity': 'E', 'Natural Gas': 'N'}
L = lambda mpg: round(235.215 / mpg, 2) if mpg and mpg > 0 else None
K = lambda kwh_per_100mi: round(kwh_per_100mi / 1.609344, 2) if kwh_per_100mi and kwh_per_100mi > 0 else None

rows = []
for r in csv.DictReader(open(sys.argv[1], newline='')):
    r = {k: ('' if v == 'NA' else v) for k, v in r.items()}
    fuel = FUEL.get(r['fuelType1'])
    if not fuel or fuel == 'N':
        continue
    f = lambda k: float(r[k] or 0)
    parts = []
    if r['displ'] and fuel != 'E': parts.append(f"{float(r['displ']):.1f}L")
    if r['cylinders'] and fuel != 'E': parts.append(f"{r['cylinders']} cyl")
    if r['trany']: parts.append(r['trany'].replace('Automatic', 'Auto').replace('Manual', 'Manual'))
    if r['atvType'] in ('Hybrid', 'Plug-in Hybrid', 'EV'): parts.append(r['atvType'].replace('EV', 'Electric'))
    rows.append([int(r['id']), int(r['year']), r['make'].strip(), r['model'].strip(), ' · '.join(parts),
                 None if fuel == 'E' else L(f('city08')), None if fuel == 'E' else L(f('highway08')), fuel,
                 K(f('cityE')) if fuel == 'E' else None, K(f('highwayE')) if fuel == 'E' else None, r['VClass']])
rows.sort(key=lambda x: (-x[1], x[2], x[3], x[4]))
json.dump(rows, open('src/lib/trip/vehicles-data.json', 'w'), separators=(',', ':'))
print(len(rows), 'vehicles')
