# Trip planner and investing improvements

## Vehicle coverage

The bundled catalogue was refreshed on November 3, 2026 from the
[official EPA vehicle CSV](https://www.fueleconomy.gov/feg/epadata/vehicles.csv).
It includes 50,303 gasoline, diesel and battery-electric configurations, model
years 1984–2027. Current bundled cars work even when the live EPA service is down.
The year/make/model/version picker includes drivetrain information to distinguish
similar configurations. Its retry and manual-entry options remain available when
a selection is empty or the provider fails.

The EPA covers US-market vehicles, so Canadian model names and trims can differ.
Manual entry accepts a car name, fuel type and the user's own L/100 km or
kWh/100 km figure. This also supports cars outside EPA coverage without guessing
their consumption. Browser settings survive reloads, and demo settings are
separate from real settings.

Refresh the snapshot from the repository root:

```sh
npm run vehicles:update
# Or build from an already downloaded official CSV:
npm run vehicles:update -- path/to/vehicles.csv
```

The command validates IDs, consumption and coverage before replacing the existing
snapshot. `src/lib/trip/vehicles-meta.json` records the source, checksum, retrieval
time and coverage. See the [EPA field definitions](https://www.fueleconomy.gov/feg/ws/index.shtml)
for US MPG and kWh/100 miles conversions. Unsupported hydrogen and natural-gas
ratings are not treated as gasoline.

## Trip behavior

- Stale place-search and route responses cannot replace newer choices.
- Bad numerical inputs show an error; they do not silently become a plausible price.
- Prices are editable estimates in the workspace currency. The starting Canadian
  prices are illustrative; other currencies require an entered local price. Saved
  prices are tagged with their currency, and zero-decimal currencies are respected.
- One-way, return and weekly commute calculations use the existing fuel engine.
- Saving chooses an account in the same currency and uses the user's calendar
  date. Demo saves explicitly say that nothing was recorded.
- Browser app pages can request location permission. Permission is still granted
  by the user; native location permissions are unchanged.

Google Maps remains optional for local development. Without its key, the existing
Photon/OSRM services handle search and driving routes. Public services have no
uptime guarantee; requests now have timeouts and the UI offers recovery. See
[INTEGRATIONS.md](INTEGRATIONS.md) for production Google configuration.

This estimates fuel or charging costs, not tolls, parking or maintenance. The
city/highway split is inferred from route speed. Tank sizes are class estimates
unless entered. Plug-in hybrids use gasoline-mode consumption; their charging
costs are not included. EV charging stops are not modeled.

## Investing behavior

Web portfolio and mobile valuation share one exact calculation. Real holdings use
real quotes only when symbol and currency match. Sample prices, missing quotes
and mismatched currencies leave recorded holding values intact. Multiplication
uses the decimal quantity and integer minor units, rounding once.

Portfolio totals and gains are grouped by currency. The web portfolio lets a
reviewer switch the currency used for mix and concentration; mobile shows each
total separately. There is no invented FX rate and no addition of USD and CAD into
one number. Recorded values and quote sources are labeled. No database values are
overwritten by viewing the portfolio.

Beginners can see their watchlist before owning investments. A symbol followed on
multiple named lists appears once on mobile, and the arbitrary five-row truncation
is removed. Search and chart requests discard stale responses. Watchlist failures
show a message and preserve the previous state. Sample charts and prices are
labeled; real quotes include their source and date.

This remains a learning and tracking feature. It does not place trades, connect
brokerage accounts, add tax-lot accounting, or promise live prices on every provider
plan. Holdings can now be added, edited and removed on the web Portfolio page and
mobile Manage holdings screen. Values and cost basis are recorded in the chosen
currency; these records do not change cash balances or the Accounts net-worth
calculation. The API scopes each operation to the authenticated workspace and
audits mutations. Market-data quotas and exchange entitlements still apply; see
[INTEGRATIONS.md](INTEGRATIONS.md).

## Review and verification

Run `npm run e2e:trip-investing` against a local production server to exercise the
committed `/app` bundle, catalogue API, manual car persistence, exact trip cost,
ledger save, beginner watchlist and visible watchlist failure. Place/route UI
responses are fixed in that suite so it does not depend on public map services.
Unit tests separately cover catalogue integrity and valuation boundaries.
During local iteration, `npm run e2e:trip-investing -- --reuse` signs in to the
suite's last test accounts instead of exhausting the sign-up rate limit. It uses
only the throwaway account names saved under ignored `out/` and clears their
holding fixtures. Do not use this option with real accounts.

The large catalogue and browser bundle diffs are generated artifacts. Review the
source, metadata, generator and tests alongside them. Credentials and local
environment files must remain excluded from commits.

Verified on November 3, 2026: 360 unit tests passed (one opt-in bank integration
test skipped), lint and web/mobile type checks passed, the production build and
Expo web export succeeded, all 29 focused browser checks and all 30 original smoke
checks passed, and the existing investing browser suite passed. Tests ran against
local PostgreSQL with sample market data. Provider-backed production flows and
native device/store builds were not exercised.
