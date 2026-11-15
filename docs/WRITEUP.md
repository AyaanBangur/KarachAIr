# KarachAir

**Track:** Climate  |  **Team:** [add every team member's name here]  |  **Live demo:** https://karachair.netlify.app  |  **Code:** https://github.com/AyaanBangur/KarachAIr  |  **Full results:** [RESULTS.md](RESULTS.md)

*This project is a prototype and is not medical advice.*

## The problem
Karachi has some of the hottest neighbourhoods and dirtiest air in the region. Schools and community groups want to help, but a student or a coordinator cannot tell **where** help is needed most or **what** a student can safely do. The data exists (NASA satellites, air-quality models), but it sits in dashboards that students never use. **Who:** a high-school volunteer in Karachi and the coordinator who places them. **The moment:** the student opens the app after school and asks "what can I do this week?"

## What we built
A student types what they want to do ("ask parents to turn off car engines", "plant more trees"). **Hawa**, a volunteer guide, uses a trained model to work out which of five activities they mean, then offers matching missions for the places that need help most, ranked by live air quality, live heat and a satellite heat-risk ranking, each with the reason and a Google Maps link. Outdoor missions lock when the air is hazardous and need an adult. An organization verifies the hours and issues a certificate. Organizations also get a live report with line graphs and the same mission list.

## What we added
Our own idea (not one of the suggested projects): our own place (Karachi, 24 neighbourhoods), our own data (satellite heat, population, live air), and our own user (students and coordinators).

## How it works
**Data:** NASA MODIS land-surface temperature (3 hot seasons, 23 composites) and vegetation, WorldPop population, OpenStreetMap health facilities, ERA5-Land, and live Open-Meteo weather and air quality (CAMS model, ~11 km). Mission priority is a transparent formula over these, not a trained model, so every number can be explained.
**Model (the AI):** Hawa's activity understanding. We wrote 313 sentences students might say (50 per activity plus off-topic answers), each with a clean, a typo and a reworded version: 939 examples, split **by base sentence** into 582 train / 219 validation / 138 test, so no sentence and none of its copies is on both sides (0 shared). We compared two models on the validation split (multinomial logistic regression 81%, **Naive Bayes 86%**) and chose Naive Bayes, with the keyword rules first and the model as the confident fallback (threshold 0.7, also chosen on validation). Nothing was tuned on the test split.

## Results
Test sentences the model never saw (138):

| Method | Accuracy |
|---|---|
| Always guess the most common label (baseline 1) | 26% |
| Hawa's original keyword rules alone (baseline 2) | 59% |
| **Hawa with the trained model** | **86%** (95% interval 79% to 91%) |

Macro-F1 (fair across activities) rose from 55% to 88%. Accuracy was similar across clean wording (87%), typos (87%), reworded (85%) and short messages (87%). **Where it fails:** long messages (73%), and it sometimes says "not an activity" for real ones it has not seen the wording of (for example "stop sand blowing", "monitor traffic fumes"). It also wrongly accepted 6% of off-topic answers (the rules alone: 3%). The model learns words and letter patterns, not meaning, and our sentences are our own English, so real students' typing and Roman Urdu will be harder. Beyond the model: bad air or dangerous heat moves a place up the mission list in 100 of 100 random trials, and 57 automated tests pass (`npm test`). Weak science we found and report: greenery explains only about 2% of surface-temperature differences in our data (R-squared 0.019), and only 3 hot seasons are loaded. We have not piloted with real students or checked the heat ranking against thermometers.

## What we'd do next
1. Run a 4-week pilot with one school and one NGO, collect real student messages (with permission), and re-measure Hawa on them, including Roman Urdu.
2. Check the heat-risk ranking against ground thermometer readings, and let the same learning approach help rank missions from what actually gets completed.

## Sources
- **Datasets:** NASA MODIS/Aqua MYD11A2 and Terra MOD13Q1 via ORNL DAAC (https://lpdaac.usgs.gov/products/myd11a2v061/, https://lpdaac.usgs.gov/products/mod13q1v061/); WorldPop 2020 (https://www.worldpop.org/); OpenStreetMap via Overpass (https://www.openstreetmap.org/copyright); geoBoundaries (https://www.geoboundaries.org/); ERA5-Land (https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land); Open-Meteo weather and air-quality API, based on CAMS (https://open-meteo.com/).
- **Models:** none pretrained. Naive Bayes and logistic regression are our own implementations, trained from scratch on our own sentences.
- **Libraries and services:** React, Vite, Leaflet, Recharts, pdf-lib, Vitest, Supabase, Netlify, MyMemory (free translation for Hindi chats).
- **AI tools used:** Claude Code (Anthropic) helped us write and test code; we reviewed and can explain every part.
