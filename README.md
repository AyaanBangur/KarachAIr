# TerraWatch AI — Karachi heat intelligence

Interactive climate-intelligence platform that ranks Karachi's 24 administrative units by extreme-heat risk, built entirely on **open data fetched by a reproducible pipeline**. No keys, no secrets, no backend.

## Run it

```bash
npm install
npm run data      # fetch real data -> public/data/*.json (first run ~25-50 min, cached afterwards)
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
```

`npm run data` caches every API response in `data-cache/` (gitignored), so re-runs are fast. The satellite stage is slow because NASA's ORNL service allows one ~35 s request at a time. For a quick first run: `TW_YEARS=2025,2026 npm run data`.

## Data sources (all open)

| Layer | Source | Notes |
|---|---|---|
| Surface heat (day/night) | NASA MODIS/Aqua MYD11A2 via ORNL DAAC | 1 km, hot-season (1 May–30 Jun) composites, quality-filtered |
| Vegetation | NASA MODIS/Terra MOD13Q1 NDVI | 250 m |
| Population | WorldPop 2020 UN-adjusted 1 km | modelled, not census |
| Health facilities, green space | OpenStreetMap via Overpass | volunteer-mapped; uneven coverage |
| Air-temperature record | ERA5-Land via Open-Meteo | ~9 km model reanalysis (1950–now) |
| Live weather | Open-Meteo forecast API (browser, keyless) | |
| Boundaries | geoBoundaries (PBS 2017) | 18 towns + 6 cantonments |

## Accounts: volunteers and organizations

Everything sits behind a sign-in with two roles (`#/login`):

- **Volunteer (students):** create an account (name, email, password); after signing in they are prompted to join an organization from a list (switchable from the top bar). Logs follow the account across devices. Emails are not verified and there is no automatic password reset. They get the **Volunteer hub**: Gemini-style field logging with auto-detection, team missions, impact stats, and review status on every log.
- **Organization (school/NGO):** register with a name + passcode (min 8 chars; 5 wrong attempts lock sign-in for 15 min). They get the **Org console** (roster with emails, coverage-gap map, missions, review queue with field-vs-satellite checks) and the **Report builder**.

Data lives in Supabase behind token-checked Postgres functions; the tables are closed to the public API, and each organization sees only its own volunteers' logs. Setup: copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the *publishable* key). Without them the app runs in a local demo mode. Logs are saved on-device first and uploaded when online. Locations are rounded to ~100 m. Anyone with an account can join any listed organization, so coordinators should remove people who shouldn't be on the roster; 5 wrong passwords lock an account for 15 minutes. There is no automatic passcode reset.

The **Report** follows the dashboard: weights, scope, the Scenario lab's current settings, and the organization's field logs (verified/awaiting).

## What the "AI" is — and is not

The Heat Risk Index is a **transparent, explainable composite** (hazard + exposure + vulnerability), not a trained ML model. Insights are rule-generated from measured values; each shows evidence, confidence and method. No AI model specification was supplied, so none is claimed. See the in-app **Methodology** page for limits.

## Layout

```
scripts/pipeline/   data pipeline (stages: boundaries, worldpop, osm, climate, modis, build)
public/data/        generated datasets served to the app
src/lib/            risk model, scenario engine, insights, colours, data context
src/components/     map, charts, dashboard panels, UI primitives
src/pages/          Dashboard (the only page; tabs: map, compare, trends, scenarios, report, volunteer)
```
