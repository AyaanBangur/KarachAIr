# Demo video script: 2 minutes or less (Veritas structure)

**Rules from the Hacker Guide:** up to 2 minutes. A screen recording with your voice over it is enough. Upload to YouTube as **unlisted** (or share from Google Drive with "anyone with the link can view"), then open the link in a private window to check it plays. Put the link in the submission form.

**Length check:** the spoken words below are about 260, which is about 2 minutes at a calm pace. Read it once with a timer before recording. If you run over, cut the sentences marked (optional).

**Before you record:** open https://karachair.netlify.app signed in as a volunteer (create a volunteer account first; the guest button was removed from the homepage). Test your demo phrase first, because missions depend on live data. If "darakht lagao" gives no mission, use "plant trees". On a day with dirty air you can use "gari ka engine band karo" instead.

| Time | On screen | Say |
|---|---|---|
| **0:00 to 0:15** The problem | Login page, then the opening dashboard | "Karachi has some of the hottest, most polluted neighbourhoods in the region. Students want to help, but they can't tell where help is needed or what is safe to do. KarachAir answers one question: where should a student volunteer today, and is it safe?" |
| **0:15 to 1:15** The demo (real input to result) | Volunteer hub, **Chat guide**. Type "New Karachi". Then type "plant trees". Mission cards appear. Point at the **reason line** (heat rank, live PM2.5, green space per person) and the "adult required" / lock label. Click **Accept**, then **Open in Google Maps**. Switch to the organization account: **Org portal** to verify the hours, then **Report** and the **Impact** numbers. | "A student types in their own words. This is free typing, not a button. Hawa, our trained model, understands it and offers missions for that neighbourhood, with the reason from live air, live heat and NASA satellite data. Outdoor missions need an adult and lock if the air is hazardous. The student accepts and gets directions. Then the organization verifies the two hours, the student gets a certificate, and the report shows where help is needed and how many people live there, so an NGO can decide where to send people next." |
| **1:15 to 1:45** How it works | `docs/RESULTS.md` results table | "Our data is NASA satellite heat, live air quality and population. For Hawa we wrote 385 English sentences, and split them so no sentence is in both training and test. We tested on 189 sentences the model never saw. Guessing scores 25 percent. Our old keyword rules score 59. Our trained model scores 86. It is English only for now." |
| **1:45 to 2:00** Next steps | Closing card with the name and link | "One limitation: we wrote those sentences ourselves, so real students will type harder things. Next, we'd pilot with a school and an NGO and test Hawa on real messages. KarachAir: live data turned into safe action." |

## Checklist against the guide
- [ ] 2 minutes or less (time it)
- [ ] The problem: who it is for and why it matters (about 15 seconds)
- [ ] The demo: a real input going in and the result coming out (about 60 seconds)
- [ ] How it works: your data, your model, how it compares to the baseline (about 30 seconds)
- [ ] Next steps: one limitation and what you'd do next (about 15 seconds)
- [ ] Screen recording with your voice over it
- [ ] Uploaded as YouTube unlisted or a Google Drive share, and opened in a private window to confirm
- [ ] Link pasted in the submission form

Tip: say the three numbers (23, 55, 85) clearly. Judges look for a baseline, a result on unseen data, and where it fails.
