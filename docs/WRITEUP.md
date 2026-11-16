# KarachAir

**Track:** Climate  |  **Team:** [add every team member's name here]  |  **Live demo:** https://karachair.netlify.app  |  **Code:** https://github.com/AyaanBangur/KarachAIr  |  **Full results:** [RESULTS.md](RESULTS.md)

*This project is a prototype and is not medical advice.*

## The problem
Karachi has some of the hottest neighbourhoods and dirtiest air in the region. Schools and community groups want to help, but a student or a coordinator cannot tell **where** help is needed most or **what** a student can safely do. The data exists (NASA satellites, air-quality models), but it sits in dashboards that students never use. **Who:** a high-school volunteer in Karachi and the coordinator who places them. **The moment:** the student opens the app after school and asks "what can I do this week?"

## What we built
A student types what they want to do ("ask parents to turn off car engines", "plant more trees"). **Hawa**, a volunteer guide, uses a trained model to work out which of five activities they mean, then offers matching missions for the places that need help most, ranked by live air quality, live heat and a satellite heat-risk ranking, each with the reason and a Google Maps link. Outdoor missions lock when the air is hazardous and need an adult. An organization verifies the hours and issues a certificate. Organizations also get a live report with line graphs and the same mission list.

## What we added
Our own idea (not one of the suggested projects). **Our own question:** *"Where should a student volunteer today, and is it safe to?"* Most tools stop at showing a number. We close the loop from data to action to proof:
- **Our own place and data:** Karachi's 24 neighbourhoods, NASA satellite heat, population, vegetation and live air and weather, not a tutorial dataset.
- **Our own user:** high-school volunteers and the coordinators who place them. The mission list explains itself ("PM2.5 140 µg/m³ (live), heat risk #2 of 24").
- **Need and safety together:** missions are ranked by need, and outdoor ones lock automatically when the air is hazardous. The hub marks the **"Best right now"**: the highest-need mission that is also safe today.
- **Understands how students type in English, typos included.** A trained model maps free-typed English sentences, with typos and reworded requests ("tel neighbours how to stay safe"), to activities. On unseen sentences, the keyword rules got **59%** right and the trained model **86%**. It is English only: Roman Urdu and Urdu script are not understood.
- **An original finding from our own data:** Karachi's hottest neighbourhoods are *not* its most polluted. Only 1 place (Gulberg) is in both top-5 lists, about what chance gives (rank correlation 0.19; snapshot in `docs/FINDINGS.md`). So heat and air need different missions in different places, and the app ranks need from both.
- **Verified outcome:** an organization verifies the hours and the student gets a certificate with a note about what they did.

**How it differs** (from their public descriptions; we cannot promise nothing else exists):

| Existing tool | What it does | What it does not do |
|---|---|---|
| IQAir (air-quality app) | Shows live readings and health advice | No volunteer tasks, no satellite heat |
| OpenAQ (open air-quality data) | Collects and shares monitor data | Data only, no action for students |
| NASA Worldview (satellite viewer) | Shows satellite imagery | No ranking of neighbourhoods, no missions |
| VolunteerMatch (volunteer listings) | Lists volunteer opportunities | Tasks are not tied to live air or heat, no safety lock |
| **KarachAir** | Turns satellite and live air and heat data into explained, safety-gated, verifiable missions for students | |

## Impact
**Who benefits.** Karachi's about 15.6 million modelled residents (WorldPop estimate, not a census) face heat and bad air every year. Students get real, safe, verified service hours and a certificate. Neighbourhoods get help where the data says it is needed most, and organizations get a verified record they can show funders.
**What we measure (and what we do not claim).** The app counts, from real data: (1) *reach*, the residents living in the highest-need neighbourhoods today, and where air or heat is unsafe (shown on the opening screen, live); (2) *verified hours* and *neighbourhoods reached* per student and per organization; (3) *coverage*, how many priority neighbourhoods have at least one verified mission, and which still have none (Org portal, Impact summary). These show where effort goes and whether it reaches the people who need it. As a hackathon prototype we show **how** the impact happens, step by step, and how each step is counted: [EXAMPLE.md](EXAMPLE.md) walks one neighbourhood from live data to a safe mission, a verified record and a report an NGO can act on. We do not claim a measured drop in pollution or temperature; that is what a pilot would measure next.
**Why it can scale.** Missions are generated from public data for all 24 neighbourhoods, so a new school or NGO can start without any setup. The safety lock (outdoor missions locked in hazardous air, adult required) is built in, so growth does not add risk.

## Why this fits the AI + Climate track
- **Climate problem:** extreme heat and air pollution are climate-adaptation problems, and Karachi is one of the places already living with them. Our data is climate data: NASA satellite surface temperature, the ERA5 warming record (+0.17 C per decade in daily maximum temperature in our data), live heat and PM2.5.
- **AI is central, not decoration:** Hawa, the volunteer guide, uses a trained model to understand how students ask for climate actions, in English, and the missions it offers come from the climate data. On unseen sentences the old keyword rules pick the right activity 59% of the time and the trained model 86%.
- **A second trained model, on the climate data itself:** a tomorrow's-air outlook (ridge regression we wrote, trained on 399 real days of Karachi PM2.5 and weather, split in time order, 81 untouched test days). Result, stated plainly: it **matches** the "tomorrow equals today" baseline (average error 3.8 µg/m³ for both, 90% right on unsafe-or-not for both) and beats the training-average baseline (8.7 µg/m³). It does not beat persistence by a meaningful margin, so we show it as a planning aid with that stated, and today's safety lock still uses the live reading. Details and limits: [OUTLOOK.md](OUTLOOK.md).
- **Climate action, not just a dashboard:** the output is a safe action for a person to take, with the data reason attached, and a verified record of it.
- **Honest limits:** the model understands wording, it does not forecast the climate; mission priority is a transparent formula; we have no pilot yet.

## How it works
**Data:** NASA MODIS land-surface temperature (3 hot seasons, 23 composites) and vegetation, WorldPop population, OpenStreetMap health facilities, ERA5-Land, and live Open-Meteo weather and air quality (CAMS model, ~11 km). Mission priority is a transparent formula over these, not a trained model, so every number can be explained.
**Model (the AI):** Hawa's activity understanding. We wrote 385 English sentences students might say (about 65 per activity plus off-topic answers), each with a clean, a typo and a reworded version: 1,155 examples, split **by base sentence** into 699 train / 267 validation / 189 test, so no sentence and none of its copies is on both sides (0 shared). On the validation split, Naive Bayes scored 88% and logistic regression 87%. We then searched how to combine each model with the keyword rules and chose, on validation only, the most accurate setting that does not wrongly accept more off-topic answers than the rules do: **logistic regression, model first (rules answer when the model is not confident), with the rules supplying combinations like "trees and masks"**. Nothing was tuned on the test split.

## Results
Test sentences the model never saw (189):

| Method | Accuracy |
|---|---|
| Always guess the most common label (baseline 1) | 25% |
| Hawa's original keyword rules alone (baseline 2) | 59% |
| **Hawa with the trained model** | **86%** (95% interval 80% to 90%) |

Macro-F1 (fair across activities) rose from 57% to 87%. The model was right on 50 sentences where the rules were wrong, and wrong on 0 where the rules were right (McNemar p < 0.001), and 5-fold cross-validation agrees. By kind of message: clean wording 87%, with typos 86%, reworded 84%, short 87%, long messages 75%. It wrongly accepts 8% of off-topic answers (the rules alone: 8%). English only: Roman Urdu and Hindi are not tested and not supported. **Where it fails:** a few real activities phrased in ways it has not seen get called "not an activity", and some mixed-activity sentences go to one activity. The model learns words and letter patterns, not meaning, and our sentences are ours, not real students', so real typing will be harder. Beyond the model: bad air or dangerous heat moves a place up the mission list in 100 of 100 random trials, and 77 automated tests pass (`npm test`). Weak science we found and report: greenery explains only about 2% of surface-temperature differences in our data (R-squared 0.019), and only 3 hot seasons are loaded. Next-stage work, not done yet: a pilot with real students and checking the heat ranking against thermometers.

## What we'd do next
1. Run a 4-week pilot with one school and one NGO, collect real student messages (with permission), and re-measure Hawa on them, and decide with the partners whether Urdu support is needed.
2. Check the heat-risk ranking against ground thermometer readings, and let the same learning approach help rank missions from what actually gets completed.

## Sources
- **Datasets:** NASA MODIS/Aqua MYD11A2 and Terra MOD13Q1 via ORNL DAAC (https://lpdaac.usgs.gov/products/myd11a2v061/, https://lpdaac.usgs.gov/products/mod13q1v061/); WorldPop 2020 (https://www.worldpop.org/); OpenStreetMap via Overpass (https://www.openstreetmap.org/copyright); geoBoundaries (https://www.geoboundaries.org/); ERA5-Land (https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land); Open-Meteo weather and air-quality API, based on CAMS (https://open-meteo.com/).
- **Models:** none pretrained. Naive Bayes and logistic regression are our own implementations, trained from scratch on our own sentences.
- **Libraries and services:** React, Vite, Leaflet, Recharts, pdf-lib, Vitest, Supabase, Netlify, MyMemory (free translation for Hindi chats).
- **AI tools used:** Claude Code (Anthropic) helped us write and test code; we reviewed and can explain every part.
