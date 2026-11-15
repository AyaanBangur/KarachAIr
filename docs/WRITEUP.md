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
**Model (the AI):** Hawa's activity understanding. We wrote 385 sentences students might say (about 63 per activity plus off-topic answers), each with a clean, a typo and a reworded version: 1,155 examples, split **by base sentence** into 699 train / 267 validation / 189 test, so no sentence and none of its copies is on both sides (0 shared). On the validation split, Naive Bayes scored 88% and logistic regression 87%. We then searched how to combine each model with the keyword rules and chose, on validation only, the most accurate setting that does not wrongly accept more off-topic answers than the rules do: **logistic regression, model first, confidence 0.5**. Nothing was tuned on the test split.

## Results
Test sentences the model never saw (189):

| Method | Accuracy |
|---|---|
| Always guess the most common label (baseline 1) | 25% |
| Hawa's original keyword rules alone (baseline 2) | 59% |
| **Hawa with the trained model** | **86%** (95% interval 80% to 90%) |

Macro-F1 (fair across activities) rose from 57% to 87%. The model was right on 50 sentences where the rules were wrong and wrong on none where the rules were right (McNemar p < 0.001), and 5-fold cross-validation agrees (86.3% +/- 4.2%, against 60.9% for the rules). Accuracy was similar across clean wording (87%), typos (86%), reworded (84%) and short messages (87%). **Where it fails:** long messages (75%), and it sometimes says "not an activity" for real ones whose wording it has not seen (for example "stop sand blowing"). It wrongly accepts 8% of off-topic answers, the same as the rules. The model learns words and letter patterns, not meaning, and our sentences are our own English, so real students' typing and Roman Urdu will be harder. Beyond the model: bad air or dangerous heat moves a place up the mission list in 100 of 100 random trials, and 67 automated tests pass (`npm test`). Weak science we found and report: greenery explains only about 2% of surface-temperature differences in our data (R-squared 0.019), and only 3 hot seasons are loaded. We have not piloted with real students or checked the heat ranking against thermometers.

## What we'd do next
1. Run a 4-week pilot with one school and one NGO, collect real student messages (with permission), and re-measure Hawa on them, including Roman Urdu.
2. Check the heat-risk ranking against ground thermometer readings, and let the same learning approach help rank missions from what actually gets completed.

## Sources
- **Datasets:** NASA MODIS/Aqua MYD11A2 and Terra MOD13Q1 via ORNL DAAC (https://lpdaac.usgs.gov/products/myd11a2v061/, https://lpdaac.usgs.gov/products/mod13q1v061/); WorldPop 2020 (https://www.worldpop.org/); OpenStreetMap via Overpass (https://www.openstreetmap.org/copyright); geoBoundaries (https://www.geoboundaries.org/); ERA5-Land (https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land); Open-Meteo weather and air-quality API, based on CAMS (https://open-meteo.com/).
- **Models:** none pretrained. Naive Bayes and logistic regression are our own implementations, trained from scratch on our own sentences.
- **Libraries and services:** React, Vite, Leaflet, Recharts, pdf-lib, Vitest, Supabase, Netlify, MyMemory (free translation for Hindi chats).
- **AI tools used:** Claude Code (Anthropic) helped us write and test code; we reviewed and can explain every part.
