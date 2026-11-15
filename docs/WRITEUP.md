# KarachAir: turning live air and heat data into missions for Karachi's students

**Live site:** https://karachair.netlify.app  |  **Code:** https://github.com/AyaanBangur/TerraWatchAI  |  **Measured results:** [RESULTS.md](RESULTS.md)

## The problem
Karachi has some of the hottest neighbourhoods and the dirtiest air in the region, and the people who are hit hardest are often the least able to protect themselves. Schools and community groups want to help, but they do not know **where** help is needed most or **what** a student can safely do. Heat and air data exist (NASA satellites, air-quality models) but they sit in dashboards that students never use.

## What we built
KarachAir connects the data to action in one loop:

1. **See it.** An interactive map ranks Karachi's 24 neighbourhoods by extreme-heat risk (NASA satellite surface temperature, population, vegetation, health access) and shows live air quality and weather, refreshed every 10 minutes.
2. **Turn it into missions.** For every neighbourhood the app generates volunteer missions from the data: bad air creates traffic, burning or dust missions; dangerous heat creates shade and hydration missions; thin field coverage creates data-collection missions. The neediest places come first, and each mission says *why* ("PM2.5 140 µg/m³ (live), heat risk #2 of 24").
3. **Guide the student.** A friendly assistant, Hawa, asks three simple questions (where, what kind of activity, indoors or outdoors) and offers the matching missions, with a Google Maps link once one is accepted. Students can also use a mission list and a notifications tab. Organizations can post their own missions too.
4. **Keep it safe.** Outdoor missions lock automatically when the air is hazardous, need an adult's confirmation, and use the air reading of the mission's own town.
5. **Verify and certify.** The organization verifies the hours and writes a description of the student's work, and the student gets a certificate that shows it.
6. **Report.** Organizations get a live report with line graphs, the missions currently being offered, and every source and limit stated.

## What is "AI" here, honestly
- A **trained text classifier** (Naive Bayes on words and letter-triples, trained in the browser) helps Hawa understand which activity a student means. It only steps in when her keyword rules do not understand an answer. On phrases it was not trained on, it raises understanding from **65% to 90%** and stays quiet on off-topic answers.
- The **Heat Risk Index** and the **mission generator** are transparent formulas and rules over measured data, so every number can be explained. We chose this deliberately: a risk score that coordinators cannot explain is a score they should not act on.
- **Voice cleaning** ("Whisper Flow") removes fillers and resolves self-corrections; an optional language-model endpoint is supported, with built-in rules as the default.

## How we tested it
We wrote 55 automated tests and a measured evaluation (`npm test`, `npm run eval`). On our labelled set, Hawa understands 100% of place names and nicknames (all 24 towns, typos included) and 90% of unseen activity wordings; bad air or dangerous heat moves a place up the priority list in 100 of 100 random trials. The test sentences are ours, not real students', and RESULTS.md says so.

## Where it can fail (we looked for it)
- Air quality is an ~11 km model, not street-level sensors.
- Greenery explains only about 2% of surface-temperature differences in our data (R² = 0.019), so we do not promise cooling from planting.
- Only three hot seasons of satellite data are loaded.
- We have not yet run a pilot with real students, and have not checked the risk ranking against ground thermometers.

## Safety and privacy by design
Students use a nickname-free account tied to their organization; the chat refuses phone numbers and emails; outdoor tasks need adult confirmation and safe air; profile photos are optional and can be removed; coordinators can remove any member.

## What's next
A 4-week pilot with one school and one NGO in Karachi: measure mission acceptance and completion, collect ground thermometer readings to validate the ranking, and add Urdu to the guide once we have native-speaker review.
