# KarachAir — Karachi heat & clean-air intelligence

Interactive climate-intelligence platform for Karachi's 24 administrative units. It ranks neighbourhoods by extreme-heat risk, shows live air quality, and connects student volunteers with community-service missions that an organization verifies and certifies. The heat and air analysis is built on **open data fetched by a reproducible pipeline**; the volunteer and organization features use an optional shared database.

## Run it

```bash
npm install
npm run data      # fetch real data -> public/data/*.json (first run ~25-50 min, cached afterwards)
npm run dev       # http://localhost:5173
npm run build     # type-check + static site in dist/
npm run typecheck # type-check only
```

`npm run data` caches every API response in `data-cache/` (gitignored), so re-runs are fast. The satellite stage is slow because NASA's ORNL service allows one ~35 s request at a time. For a quick first run: `TW_YEARS=2025,2026 npm run data`.

## Data sources

| Layer | Source | Notes |
|---|---|---|
| Surface heat (day/night) | NASA MODIS/Aqua MYD11A2 via ORNL DAAC | 1 km, hot-season (1 May–30 Jun) composites, quality-filtered |
| Vegetation | NASA MODIS/Terra MOD13Q1 NDVI | 250 m |
| Population | WorldPop 2020 UN-adjusted 1 km | modelled, not census |
| Health facilities, green space | OpenStreetMap via Overpass | volunteer-mapped; uneven coverage |
| Air-temperature record | ERA5-Land via Open-Meteo | ~9 km model reanalysis (1950–now) |
| Live weather | Open-Meteo forecast API (browser, keyless) | |
| Live air quality | Open-Meteo air-quality API (CAMS model: PM2.5, PM10, NO₂, US AQI) | ~11 km model, **not** street-level sensors |
| Boundaries | geoBoundaries (PBS 2017) | 18 towns + 6 cantonments |

## Air quality tab

- **Traffic-light status** from live PM2.5: Good ≤ 35, Moderate ≤ 150, Hazardous > 150 µg/m³ (a simple app scale, looser than the WHO 24-hour guideline of 15 µg/m³).
- **"Why is the air dirty?"** one-line source guess from the hour, NO₂, wind and the PM2.5/PM10 ratio (school-gate traffic, blowing dust, trash-burning smoke, general smog). A rule of thumb with its evidence shown, not source attribution science.
- **English/Urdu alert** built from a template, with a checker that audits every number in the message against the readings shown.
- **Under-18 air-safety gate**: outdoor missions lock automatically when the air is hazardous (or live air data is unavailable). Indoor missions stay open.

## Accounts: volunteers and organizations

Everything sits behind a sign-in with two roles (`#/login`):

- **Volunteer (students):** create an account (name, email, password); after signing in they join an organization from a list. They see **Map explorer**, **Air quality** and the **Volunteer hub**. Emails are not verified and there is no automatic password reset.
- **Organization (school/NGO):** register with a name + passcode (min 8 chars; 5 wrong attempts lock sign-in for 15 min). They see Map explorer, Air quality, Compare & rank, Climate trends, Scenario lab, the **Org portal** and the **Report** builder.

Data lives in Supabase behind token-checked Postgres functions; the tables are closed to the public API, and each organization sees only its own volunteers' records. Setup: copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the *publishable* key). Without them the app runs in a local demo mode (saved on this device only, so no organization can verify anything). A volunteer joins an organization by choosing it from the list. Anyone with an account can join any listed organization, so coordinators should remove people who shouldn't be on the roster.

## Volunteer profile photo

After signing up, a volunteer adds a profile photo, either with the webcam or by uploading a picture from a computer or phone. It is saved to their account, so they are only asked once and it is still there when they sign back in on any device. It shows as a round avatar in the top right; pressing it changes or removes the photo. Saying "No thanks" offers **Don't ask me again** or **Ask me next time**. The camera needs a secure page (https or localhost).

## Forgot password

"Forgot your password?" (volunteers) and "Forgot your passcode?" (organizations) send a one-hour, single-use reset link by email. Organizations give an email when they register, and reset with their name plus that email. The database part is in `supabase/migrations` and the email part is the Edge Function in `supabase/functions/request-password-reset` (deployed with JWT verification off, since nobody is signed in yet). To switch emails on, add the `RESEND_API_KEY` secret to the function (plus `RESET_FROM` for a verified sender domain). Until then, the page says reset emails are not switched on yet.

## Volunteer hub

1. **Chat guide ("Hawa")** — a friendly assistant that asks a few questions (area, the kind of activity, indoor/outdoor; every example task is 2 hours) and suggests volunteering tasks generated from live data to accept or decline. Type or talk (browser speech, optional hands-free mode), in 18 languages. After a student accepts a task it asks whether they want more choices, and stops when they say they're done.
2. **Find a mission** — filter by neighbourhood, indoor/outdoor and focus (clean air or heat), then accept or skip the missions offered. Every mission is 2 hours and is generated from the data: heat-risk ranking, live air quality, live feels-like temperature, green space and field-log coverage (`src/lib/needs.ts`). Nothing is preset, and the places with the worst conditions come first. The Notifications tab also lists the highest-need places. Each mission's trigger comes from that neighbourhood's real data (live PM2.5, green space, heat risk).
3. **My record** — accepted missions with their status, verified hours, and a **Download PDF** certificate once the organization has verified the work.

Volunteers never submit or see the proof of work.

## Organization portal

- **Team** — join link, roster, and tiles counting volunteers, accepted/verified missions and neighbourhoods reached.
- **Verification queue** — missions volunteers have accepted. When the work is done, the organization records the proof, confirms the hours and signs off, which issues the certificate. Entries can also be marked not verified, reopened or deleted.
- **Impact summary** — verified hours, volunteers and neighbourhoods reached, by mission type and neighbourhood, with CSV/JSON export.
- **Coverage** — map of units against heat risk using legacy field logs.

The **Report** follows the dashboard: weights, scope, the Scenario lab's current settings and the organization's records.

### How hours become a certificate

Accepted missions are stored as ordinary records (kind `other`, tagged `volunteer-mission`) so the shared database needs no schema change. The organization's verification (signer, role, date, verified hours, proof) is stored in the record's review note. The certificate is a one-page "Certificate of Completion" PDF generated in the browser (`pdf-lib`).

## What the "AI" is, and is not

- **Hawa is the AI that matches students to missions.** A trained text classifier (logistic regression on words and letter-triples, trained in the browser from `src/lib/intentCorpus.ts`; the keyword rules are the fallback) works out which activity a student means. On 189 sentences it never saw it reaches **86%** (95% interval 80% to 90%) against 25% for always guessing the most common label and 59% for the keyword rules alone (McNemar p < 0.001; 5-fold cross-validation 86.3%). Method, per-activity results, confusion matrix, group checks and failures are in `docs/RESULTS.md`.
- The **Heat Risk Index** and the **mission generator** are transparent formulas and rules over measured data, not trained models, so every number can be explained. Insights are rule-generated and show their evidence, confidence and method.
- **Hawa is a guided script plus the classifier above, not a large language model**, and she says so.
- **Voice**: speech output and recognition use the browser's own speech features (Chrome/Edge send audio to their speech service). "Whisper Flow" cleans voice input with built-in rules; an optional language-model endpoint (`GROQ_API_KEY`, dev server) is supported.
- **Translation**: for Hindi chats the student's messages and the guide's replies go through the free MyMemory translation service. The app warns users not to type personal details. Translation can be wrong.

## What is original here

Our own question: *"Where should a student volunteer today, and is it safe to?"* Most tools stop at a number; KarachAir closes the loop from live satellite, air and heat data to an **explained** mission, a **safety lock** for outdoor work, a **"Best right now"** pick (highest need that is also safe today), a free-text guide that understands how students really type, and a **verified certificate**. See `docs/WRITEUP.md`.

## Reproduce it

```bash
npm ci            # install
npm test          # 67 automated tests (guide, model, mission generator, report, certificate)
npm run eval      # re-measure Hawa and rewrite docs/RESULTS.md (baselines, held-out test, cross-validation, failures)
npm run build     # type check + production build
```

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs the type check, the tests and the build on every push.

## Tests and results

`npm test` runs 67 automated tests (guide, mission generator, air-alert checker, voice cleaner, map extents, certificate PDF, report). `npm run eval` measures the guide and the mission generator on a labelled set and rewrites [`docs/RESULTS.md`](docs/RESULTS.md). The one-page write-up is [`docs/WRITEUP.md`](docs/WRITEUP.md) and the demo-video script is [`docs/VIDEO_SCRIPT.md`](docs/VIDEO_SCRIPT.md).

## Known limits

- Air readings are a ~11 km model, so neighbouring units can share the same value, and the source tag can be wrong.
- Greenery explains only about 2% of the surface-temperature differences in our data (R-squared 0.019), and only three hot seasons are loaded. Treat greening effects as small and uncertain.
- The Heat Risk Index is a relative ranking and has not yet been checked against ground thermometer readings. There has been no pilot with real students yet.
- The description an organization writes for a certificate is stored in the review note, which the shared database's existing functions return to every member of the organization.
- Joining an organization needs no invite code, so coordinators should remove people who should not be on the roster.
- Prototype: not medical advice.

## Layout

```
scripts/pipeline/        data pipeline (stages: boundaries, worldpop, osm, climate, modis, build)
public/data/             generated datasets served to the app
src/lib/                 risk model, scenario engine, insights, air quality, volunteer chat engine,
                         mission & verification logic (service.ts), certificate PDF, data context
src/components/          map, charts, dashboard panels, air, volunteer, org, certificates, UI primitives
src/pages/               Dashboard (tabs depend on role) and Login
```
