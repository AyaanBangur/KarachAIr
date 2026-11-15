# Finding: heat and bad air do not line up neatly in Karachi

*Snapshot taken 2026-11-15 (air reading time 2026-11-16T00:00) by `npm run findings`. Air quality changes hour to hour, so re-run it for a fresh number.*

**Question.** Are the neighbourhoods with the highest satellite heat risk also the ones with the worst air right now? If yes, one mission type would fix both. If no, volunteers need different missions in different places.

**Method.** Heat = our Heat Risk Index (satellite surface temperature, population and vegetation, a relative ranking). Air = live PM2.5 for each of the 24 neighbourhoods. We compared the two rankings with Spearman rank correlation and counted how many places appear in both top lists.

**Result.**
- Rank correlation between heat risk and PM2.5: **0.19** (1 = identical order, 0 = unrelated, -1 = opposite).
- Top 5 hottest: New Karachi, Liaquatabad, Korangi, Gulberg, SITE.
- Top 5 most polluted now: Gadap, Bin Qasim, Clifton Cantt., Faisal Cantt., Gulberg.
- In **both** top-5 lists: **1** place (Gulberg). By pure chance you would expect about 1.0.
- In both top-8 lists: **3** (chance: about 2.7).

**What it means for volunteers.** The two problems mostly sit in different places, so one kind of mission cannot serve every neighbourhood. This is why KarachAir ranks need from heat and air together and picks the mission type (shade and hydration for heat, no-idling and dust for air) by what is wrong in each place.

**Honest limits.** One snapshot, not a trend. The air values are a ~11 km atmospheric model, so neighbouring units can share a value. The heat index is a relative ranking built from three hot seasons. Treat this as a clear question we asked of our own data, not a final scientific result.
