# Top-10 reorder report — Agent A

- **Date:** 2026-11-17
- **Scope:** Q108, Q109, Q110, Q176, Q177, Q178, Q179 only. No other question touched. No code files touched. No commit, push, or deploy — edits are in the working tree of `data/bank.json` for the coordinator to integrate.
- **Method:** Read `data/bank.json`, the `VERIFICATION.md` audit-table rows for these questions, and `expansion/group-{a,b,e}.json` (those files only contain the old lists, no new evidence). Verified each claim with fresh web research (see sources per question). Applied reorders by script (`/tmp/reorder.py`, not in the repo): entries keep all their variants unless noted; ranks renumbered contiguously from 1; `top1` updated to the new rank-1 `texts[0]` wherever it changed; `source`/`sourceUrl` updated where the source changed. No scoring or tier changes. No frozen daily sets exist in this repo, so nothing frozen was touched.
- **Validity smoke check (passed):** `node -e` loading `bank.json` and asserting, for all 7 questions, contiguous ranks from 1, `top1 == rank 1 texts[0]`, unique first texts, and ≥ 75 ranks:
  - Q110 n=87, Q179 n=100, Q176 n=79, Q178 n=76, Q177 n=80, Q108 n=88, Q109 n=88 — all pass.
  - Cross-check vs the pre-edit file: only the 7 questions differ; `meta` unchanged; 142 questions total. A canonical re-serialisation round-trip confirms the file format matches the repo exactly (the ~1,100 diff lines are the moved/renumbered entries themselves, not formatting churn).
- **Full `npm run verify` NOT run as a gate**, per instructions — the suite has stale checks asserting the old orders, which the coordinator will update at integration.

## Q110 — superpower ("Name the superpower most people say they'd want")

**Source switch (documented):** the old #1 (Invisibility) came from a **YouGov UK** open-ended poll, 12–13 Mar 2025 (n=2,223 GB adults, free-text). This game is US-facing. Two independent recent **US** polls agree healing is #1, so the source is switched to them:
- **PixlParade**, Jul–Aug 2026 (n=2,405 US adults, chose from 42 superpowers): 1. Healing Others 10.81% (260 votes), 2. Teleportation 9.60%, 3. Flight 9.06%, 4. Time Travel 8.02%, 5. Invisibility 6.94%, 6. Animal Communication 6.15%, 7. Magic 4.99%, 8. Immortality 4.95%, 9. Time Manipulation 3.74%, 10. Super Intelligence 3.04%. <https://pixlparade.com/poll-what-is-the-best-superpower/>
- **Morning Consult** (reported on Freakonomics): heal others #1, heal yourself #2 — corroborates healing at the top. Invisibility/flying ~17%/16% on a different (multi-pick-style) cut, not used for ordering.
- `top1`: Invisibility → **Healing others**. `sourceUrl` updated to the PixlParade page.

| Answer | Old → New |
|---|---|
| Healing (renamed to **Healing others**; "Healing" kept as a variant, so old variants intact) | #5 → **#1** |
| Teleportation | #3 → #2 |
| Flying | #2 → #3 |
| Time travel | #4 → #4 |
| Invisibility | #1 → #5 |
| Talking to animals (renamed to **Animal communication** to match the source label; all old variants kept) | #31 → #6 |
| **Magic — NEW entry** (texts: Magic, Magical powers, Being able to do magic, Wielding magic, Casting spells, Doing magic) | — → #7 |
| Immortality | #10 → #8 |
| **Time manipulation — NEW entry** (texts: Time manipulation, Manipulating time, Controlling time, Time control, Manipulate time) | — → #9 |
| Super intelligence | #14 → #10 |

Everything below #10 keeps its old relative order and shifts down by 2 (e.g. Mind reading #6 → #11, Super strength #7 → #12, Seeing the future #8 → #13, Super speed #9 → #14, Telekinesis #11 → #15, … Dimension travel #85 → #87). List grows 85 → 87.
Notes: the bank's old Healing entry already covered both "healing others" and "healing yourself" in its variants, so it collapses Morning Consult's #1 + #2 cleanly. Time Manipulation is a new entry rather than a rename of "Freezing time" (#16 → #19): PixlParade lists Time Travel and Time Manipulation as separate options, and freezing time is only one form of time manipulation. "Regeneration" (#29 → #32, self-healing) was left where it fell in the old relative order.

## Q179 — dog breeds ("Name the most popular dog breed in America")

**Source:** AKC registration statistics, **2025 rankings, released 18 Mar 2026** (202 breeds). The `VERIFICATION.md` source text already described the 2025 top 10 correctly, but the list itself was still the 2024 order and `sourceUrl` pointed at the 2024 AKC page — both fixed (`sourceUrl` now <https://www.akc.org/expert-advice/dog-breeds/most-popular-dog-breeds-2025/>). Verified against the AKC full list on that page. `top1` unchanged (French Bulldog).

| Breed | Old → New |
|---|---|
| French Bulldog | #1 → #1 |
| Labrador Retriever | #2 → #2 |
| Golden Retriever | #3 → #3 |
| German Shepherd | #4 → #4 |
| Dachshund | #5 → #5 (was #6) |
| Poodle | #6 → #6 (was #5) |
| Beagle | #7 → #7 |
| Rottweiler | #8 → #8 |
| German Shorthaired Pointer | #9 → #9 (was #10) |
| Bulldog | #10 → #10 (was #9) |
| Cane Corso | #36 → #11 |
| Cavalier King Charles Spaniel | #37 → #12 |
| Yorkshire Terrier | #11 → #13 |
| Australian Shepherd | #21 → #14 |
| Doberman | #23 → #15 |
| Corgi (Pembroke Welsh Corgi) | #14 → #16 |
| Miniature Schnauzer | #38 → #17 |
| Boxer | #12 → #18 |
| Pomeranian | #18 → #19 |
| Bernese Mountain Dog | #27 → #20 |
| Shih Tzu | #16 → #21 |
| Great Dane | #19 → #22 |
| Boston Terrier | #39 → #23 |
| Chihuahua | #15 → #24 |
| Havanese | #40 → #25 |
| Border Collie | #20 → #26 |
| English Springer Spaniel | #41 → #27 |
| Miniature American Shepherd | #42 → #28 |
| Shetland Sheepdog | #43 → #29 |
| Siberian Husky | #13 → #30 |
| Brittany | #44 → #31 |
| Belgian Malinois | #45 → #32 |

Ranks 33–100 keep their previous relative order (Pug #17 → #33, Dalmatian #22 → #34, Cocker Spaniel #24 → #35, Maltese #25 → #36, Shiba Inu #26 → #37, Pit Bull #28 → #38, Jack Russell Terrier #29 → #39, Basset Hound #30 → #40, Akita #31 → #41, Saint Bernard #32 → #42, Goldendoodle #33 → #43, Labradoodle #34 → #44, Mixed breed #35 → #45, then the rest unchanged in relative order). **Not re-sorted to AKC 33–96 in this pass** (task scope was 11–32); the AKC 2025 ranks 33–96 are listed in the Appendix below if the coordinator wants the full re-sort. Note the bank's ranks 33+ include non-AKC entries (Goldendoodle, Labradoodle, Mixed breed, Pit Bull) that have no AKC rank, so a full re-sort would need a decision on where those go.

## Q176 — ice cream ("What's America's favorite ice cream flavor?")

**Source:** IDFA National Ice Cream & Frozen Novelty Trends Survey, Apr 2026 (Morning Consult, 2,205 US adults), via IDFA's own published top-10 list and Stacker's analysis of the same survey (published Jul–Aug 2026, single-favourite %). The two IDFA-derived metrics agree on the top-10 **set**; the strict order below follows IDFA's own top-10 list, with the Stacker tie flagged. `top1` unchanged (Chocolate). `sourceUrl` kept (IDFA news release).

| Flavour | Old → New | Evidence |
|---|---|---|
| Chocolate | #1 → #1 | 38% single-favourite |
| Butter pecan | #2 → #2 | 27% |
| Vanilla | #3 → #3 | 25% |
| Cookies and cream | #4 → #4 | 23% |
| Caramel | #5 → #5 | 22% — tied #5 (see below) |
| Brownie | #34 → **#6** | 22% — tied #5; was missing from the top 10 entirely |
| Chocolate chip | #13 → **#7** | 22% — tied #5 |
| Cookie dough | #7 → #8 | 21% |
| Birthday cake | #14 → #9 | 19% |
| Mint chocolate chip | #6 → #10 | 18% |
| Strawberry | #8 → #11 | 16% (tied #11) |
| Banana | #28 → #12 | 16% (tied #11) |
| Coffee | #9 → **#13** | 14% — was wrongly in the top 10 |
| Black cherry | #18 → #14 | 13% (Stacker: Cherry/Black Cherry) |
| Peanut butter | #15 → #15 | 11% |
| Rocky road | #12 → #16 | 9% (tied #16) |
| Moose tracks | #33 → #17 | 9% (tied #16) |
| Fudge | #26 → #18 | 9% (tied #16; Stacker: Fudge swirl/Fudge royal) |
| Mango | #16 → #19 | Filler — no published rank (see note) |
| Neapolitan | #11 → #20 | 8% |
| **Pistachio** | #10 → **#21** | **Not in the IDFA/Stacker top 20 at all** — dropped out of the top 10 |

Below #21 the rest keeps old relative order (Rainbow sherbet #17 → #22, Coconut #19 → #23, Lemon #20 → #24, Bubblegum #21 → #25, Cotton candy #22 → #26, Pumpkin spice #23 → #27, Maple walnut #24 → #28, Rum raisin #25 → #29, Toffee #27 → #30, Blueberry #29 → #31, Key lime pie #30 → #32, S'mores #31 → #33, Green tea #32 → #34, then unchanged in relative order). List stays at 79.
Notes: (1) The 22% three-way tie at #5 (Caramel / Chocolate Chip / Brownie) means any order among those three is within the data; IDFA's own top-10 list breaks it Caramel #5, Brownie #6, Chocolate Chip #7, and that is the order used. (2) Slot #19 (Mango) has no published rank — Stacker jumps from the #16 tie to #20 Neapolitan, so #19 is filled with the highest-ranked remaining old entry (Mango, old #16) excluding Pistachio, which must sit below 20. Flagged as filler, not sourced. (3) Pistachio is **demoted, not deleted**: it stays in the list at #21, the first slot outside the published top 20, as a plausible flavour with no published rank.

## Q178 — Thanksgiving sides ("What's the most popular Thanksgiving side dish?")

**Top 5 unchanged.** The conflict is resolved in favour of the source already cited — see the Q178 conflict section below. `top1` unchanged (Stuffing). Only change: the pies entry is removed and refilled.

- **REMOVED (was #16):** Sweet potato pie — texts were Sweet potato pie, Pumpkin pie, Pecan pie, Apple pie. All four are desserts, not sides. Every entry below it shifts up one (Collard greens #17 → #16, Rice #18 → #17, Asparagus #19 → #18, … Grape salad #76 → #75).
- **REFILL (new #76):** Sautéed mushrooms — texts: Sautéed mushrooms, Sauteed mushrooms, Fried mushrooms, Mushrooms sautéed. A real Thanksgiving side not previously in the list (distinct from Stuffed mushrooms at #36). Placed at the bottom (rank 76) as an unsourced filler so the list stays at 76 ranks.
- `source` updated with the conflict note (below); `sourceUrl` kept (Campbell's coverage).

### Q178 conflict resolution — Campbell's kept over YouGov

Verified fresh (2026-11-17):
- **Campbell's State of the Sides Report 2026** (Reputation Leaders, Aug–Sep 2026, n=5,017 US adults who celebrate Thanksgiving, 100/state): 1. Stuffing/dressing (favourite in 38 states), 2. Mashed potatoes, 3. Sweet potatoes, 4. Mac and cheese, 5. Green bean casserole.
- **YouGov 2020 head-to-head dish poll** (~1,300 US adults, pairwise win rates, summarised 2026-10-27 by TheHypeMenu): 1. Mashed potatoes 78%, 2. Stuffing/dressing 77%, 3. Bread/rolls 74%, 4. Scalloped potatoes 66%, 5. Sweet potatoes/yams 65%, 6=. Green beans 64%, 6=. Gravy 64%, 8. Mac and cheese 62%, 9. Corn 60%, 10=. Cornbread / Green bean casserole / Potato salad 57%.
- **YouGov Nov 2025 expect-to-eat poll** (n=1,120): mashed potatoes and stuffing **tied at 61%** each. YouGov's own 2019 write-up says Midwesterners put mashed potatoes first (59%) while the rest of the country puts stuffing/dressing first.

**Pick: Campbell's.** It is newer (2026 vs 2020), ~4× larger (5,017 vs ~1,300), and asks directly for the *favourite side*, which is what the question asks ("most popular side dish"); YouGov's lead is a single point (78% vs 77%) on a derived pairwise win rate, and YouGov's own most recent poll ties the two at 61/61. The bank's top 5 already matched Campbell's, so no top-5 change. The YouGov numbers are recorded in the new `source` field so a future reviewer can see the dissent. Rolls stays at #8 (YouGov's #3 is a head-to-head artefact; Campbell's does not rank rolls in its top 5, and no Campbell's rank for rolls was published). **This is a judgement call on a near-tie** — if the owner prefers the head-to-head measure, the YouGov order would be Mashed potatoes #1, Stuffing #2, Rolls #3, Scalloped potatoes #4, Sweet potatoes #5, Green beans/Gravy #6, Mac and cheese #8, Corn #9, Cornbread/Green bean casserole/Potato salad #10 — but that would mean demoting a 2026 n=5,017 direct-favourite poll for a 2020 derived 1-point margin, which I do not recommend.

## Q177 — pets ("Name the most common pet people have")

**One swap only.** `top1` unchanged (Dog).

| Pet | Old → New |
|---|---|
| Dog | #1 → #1 |
| Cat | #2 → #2 |
| Fish | #3 → #3 |
| Reptile | #6 → **#4** |
| Small mammal | #5 → #5 |
| Bird | #4 → **#6** |
| Horse, Guinea pig, Hamster, Turtle, Rabbit, … (all below) | unchanged |

### Q177 conflict resolution — flagging researchers were right about the order, for the latest release

Two different APPA vintages were in play, and the contradiction is real — it is a **release/metric** difference, not a typo:
- **Previously cited (VERIFICATION.md):** "APPA 2025-2026 National Pet Owners Survey": Dog 69.8m households, Cat 49.2m, Fish 11.9m, **Bird 6.9m #4, Small mammal 6.7m #5, Reptile 6.1m #6**, Horse 3.5m, Guinea pig 2.4m, Hamster 2.3m, Turtle 1.9m. On re-check (2026-11-17) these exact decimals trace **only to a Facebook infographic** (posted 2026-10-26) claiming the APPA 2025-2026 survey. No APPA primary page and no reputable secondary I could find confirms 69.8 / 6.9 / 6.7 / 6.1, and APPA's own survey-wave history (Review42) puts dog households at 65.1m (2023-24), 68m (2025 survey), 71m (latest) — 69.8m matches no wave cleanly. Older APPA-flavoured charts floating around disagree with each other too (e.g. one APPA pie chart: Small animal 6.7m > Bird 6.1m > Reptile 6.0m; FinanceBuzz's older APPA figures: Bird 6.1m / 9.9m in different versions).
- **Latest APPA release (followed): APPA 2026 State of the Industry Report, released 26 Mar 2026**, based on the 2025 National Pet Owners Survey — APPA's own press release (<https://americanpetproducts.org/news/u.s.-pet-industry-reaches-158-billion-in-2025-poised-for-continued-growth-in-2026?hs_amp=true>) confirms 95m pet-owning households, Dog 71m (53%, up from 51% in 2024), Cat 53m (39%). The species breakdown for the same report — Freshwater fish 9m, **Reptile 6m, Small animal 5m, Bird 5m**, Horse 2m, Saltwater fish 1m — is as presented by APPA itself (APPA Instagram reel, May 2026) and corroborated by multiple independent summaries of the same report (Spots, World Animal Foundation, PeggiesPets), all converging on exactly those rounded numbers. That is the order the flagging researchers claimed: **Reptile #4, Small mammal #5, Bird #6**.

**Pick: the 2026 State of the Industry figures.** It is APPA's latest published release, from APPA itself, with convergent secondaries; the VERIFICATION decimals rest on a single social-media infographic. Fish stays #3 (freshwater 9m + saltwater 1m ≈ 10m, still clearly third). **Caveat, stated plainly:** Bird and Small animal are effectively **tied at ~5m rounded** in the latest release — the #5/#6 split between them is not a measured gap, it follows APPA's own presentation order (small animal listed before bird in APPA's reel; Spots lists birds before small animals in prose, so the tie-break is presentation-only). If APPA publishes unrounded figures, revisit. Horse (#7, 2m), Guinea pig (#8), Hamster (#9) and Turtle (#10) are not separately reported in the 2026 summary and are left as they were. `source` rewritten with the new figures and the supersession note; `sourceUrl` changed from the old YouGov dog/cat article to the APPA press release above.

## Q108 — fears ("What's the most common fear people have?")

**Top 1 unchanged (Snakes) — and the flag was based on a misread poll.** `top1` unchanged (Snakes).

| Fear | Old → New |
|---|---|
| Snakes | #1 → #1 |
| Heights | #2 → #2 |
| Public speaking | #4 → **#3** |
| Spiders | #3 → **#4** |
| Everything below #4 | unchanged |

Why: the n=2,088 poll that puts Heights #1 is **YouGov GB, 18–19 Mar 2014** — a British sample (Heights 58% total afraid, Public speaking 56%, Snakes 52%; YouGov's own US article states the UK order as heights, public speaking, snakes). The task's framing ("Heights #1 ahead of Snakes #2") is itself slightly off even for the UK poll, where public speaking is #2. The **US** YouGov poll (2014, n=1,000 US adults) is explicit: "Snakes, heights and public speaking are the top three fears in the Home of the Brave" — Snakes 64% at least a little afraid, Heights 57%, Public speaking 56%. Gallup (2001, n=1,016) agrees Snakes is #1 in the US (51%). Chapman Wave 9 (2023) also ranks public speaking (28.7% afraid/very afraid) above insects/spiders (25.3%) among personal fears. So for this US-facing game the US poll governs: Snakes stays #1, and the #3/#4 swap follows the US top three (two US sources agree Public speaking > Spiders — not a coin flip). `source` rewritten to record the GB/US distinction; `sourceUrl` changed from the Chapman PDF to the YouGov US article (<https://yougov.com/en-us/articles/8983-argh-snakes>).
**Still disputed / not verified:** no full published US ranking for ranks #5+ could be verified — the YouGov US article does not publish an overall spider % (only age splits) or the full 13-item list, and the bank's #5–#10 (Flying, The dark, Dying, Dogs, Needles, Clowns) rest on the old blended sourcing. In particular the US article says Americans are *least* afraid of clowns (13%) and dogs (17%), which sits oddly with Dogs #8 / Clowns #10 in the bank — but without the full US table I did not churn those ranks. A future pass with the full YouGov US crosstabs (linked from the article) could settle #5+.

## Q109 — dream cars ("Name the car most people dream of owning")

**Source:** MoneySuperMarket global dream-car study (Dec 2025 data; 5-year Google search volume + 4,000-driver survey). Verified against the MoneySuperMarket top-20 table. `top1` unchanged (Ford Mustang). `sourceUrl` kept (already the MSM page).

| Car | Old → New | MSM search volume (5 yr) |
|---|---|---|
| Ford Mustang | #1 → #1 | 116,686,707 |
| Porsche 911 | #2 → #2 | 91,616,454 |
| Dodge Charger | #4 → **#3** | 87,045,992 |
| Tesla Model 3 | #3 → **#4** | 82,352,518 |
| Ford Bronco | #33 → **#5** | 66,679,533 |
| Tesla Model Y | #6 → #6 | 64,254,969 |
| BMW M3 | #5 → **#7** | 64,253,540 |
| Porsche Cayenne | #35 → **#8** | 54,514,477 |
| Toyota Supra | #15 → **#9** | 48,073,643 |
| Audi R8 | #10 → #10 | 40,949,539 |

Below #10 everything keeps its old relative order and shifts down by 2 (Lamborghini #7 → #11, Ferrari #8 → #12, Chevrolet Corvette #9 → #13, Mercedes-Benz #11 → #14, Range Rover #12 → #15, Ford F-150 #13 → #16, Jeep Wrangler #14 → #17, Nissan GT-R #16 → #18, McLaren #17 → #19, Bugatti #18 → #20, Rolls-Royce #19 → #21, Bentley #20 → #22, Aston Martin #21 → #23, Maserati #22 → #24, Cadillac Escalade #23 → #25, Tesla Model S #24 → #26, Lamborghini Urus #25 → #27, Chevrolet Camaro #26 → #28, Dodge Challenger #27 → #29, Ford GT #28 → #30, Koenigsegg #29 → #31, Pagani #30 → #32, Lexus #31 → #33, Jaguar #32 → #34, Mercedes G-Wagon #34 → #35, then unchanged in relative order).
Notes: Model Y vs M3 is effectively tied — separated by 1,429 searches in 64.25m — the MSM order (Y #6, M3 #7) is used as published. The MSM top 20 also ranks Ford GT #11, Cadillac Escalade #12, Porsche Macan #13, Land Rover Defender #14, Lamborghini Urus #15, Mitsubishi Lancer #16, Audi Quattro #17, Tesla Model S #18, Nissan Skyline #19, Land Rover Discovery #20 — **the tail was NOT re-sorted to that in this pass** (task scope was the top 10, and MSM is a search-volume metric while the tail was built from survey/family-feud material); recorded in the `source` field for a future pass.

## Removals / refills summary

| Question | Removed | Refilled with | Net length |
|---|---|---|---|
| Q110 | — (none) | 2 NEW entries: Magic (#7), Time manipulation (#9) | 85 → 87 |
| Q179 | — (none) | — | 100 → 100 |
| Q176 | Pistachio demoted out of top 10 (#10 → #21), not deleted | — (list kept whole; no new entry needed) | 79 → 79 |
| Q178 | Sweet potato pie entry (#16: sweet potato / pumpkin / pecan / apple pie — desserts, not sides) | Sautéed mushrooms (#76) | 76 → 76 |
| Q177 | — (none) | — | 80 → 80 |
| Q108 | — (none) | — | 88 → 88 |
| Q109 | — (none) | — | 88 → 88 |

No list shrank below 75 ranks. No variants were dropped except the Q178 pies entry (all four pie variants went with it, correctly — they are the removed answer) and the two Q110 first-text renames, where the old first text was kept as a variant.

## Still disputed / open (for the coordinator / owner)

1. **Q178 is a judgement call on a near-tie** (Campbell's Stuffing #1 vs YouGov head-to-head Mashed potatoes #1, 78% vs 77% in 2020). Documented above with the full alternative order. Reversible in one edit if the owner prefers the head-to-head measure.
2. **Q177 Bird vs Small mammal is a tie** at ~5m rounded in the latest APPA release; #5/#6 follows APPA's own presentation order only. Unrounded APPA figures would settle it.
3. **Q108 ranks #5+ unverified** (see above); Dogs/Clowns sit oddly against the US article's "least afraid" line. Needs the full YouGov US crosstabs.
4. **Q109 tail not re-sorted** to the MSM top 20 (#11–20 listed above); **Q179 ranks 33+ not re-sorted** to AKC 2025 #33–96 (Appendix below). Both are one further pass each if wanted.
5. **Q176 slot #19 (Mango) is filler** with no published rank; Pistachio at #21 likewise has no published rank beyond "outside the top 20".
6. **Q110 Time Manipulation** is a new entry mapped to PixlParade's option of that name; "Freezing time" was kept as a separate answer (#19). If the owner considers them the same answer, they should be merged, not kept apart.
7. The `npm run verify` suite is expected to fail on stale old-order assertions until the coordinator updates it — that was not run as a gate, per instructions.

## Appendix — AKC 2025 ranks 33–96 (for a possible Q179 full re-sort)

From the AKC full list (<https://www.akc.org/expert-advice/dog-breeds/most-popular-dog-breeds-2025/>): 33. Cocker Spaniel, 34. Basset Hound, 35. English Cocker Spaniel, 36. Vizsla, 37. Maltese, 38. Pug, 39. Collie, 40. Mastiff, 41. Rhodesian Ridgeback, 42. Papillon, 43. Portuguese Water Dog, 44. Shiba Inu, 45. West Highland White Terrier, 46. Newfoundland, 47. Australian Cattle Dog, 48. Whippet, 49. Bichon Frise, 50. Dalmatian, 51. Wirehaired Pointing Griffon, 52. Giant Schnauzer, 53. Italian Greyhound, 54. Weimaraner, 55. Samoyed, 56. Chesapeake Bay Retriever, 57. Scottish Terrier, 58. German Wirehaired Pointer, 59. Bloodhound, 60. Russell Terrier, 61. Staffordshire Bull Terrier, 62. Akita, 63. Saint Bernard, 64. Boykin Spaniel, 65. Cardigan Welsh Corgi, 66. Great Pyrenees, 67. Miniature Pinscher, 68. Cairn Terrier, 69. Nova Scotia Duck Tolling Retriever, 70. Airedale Terrier, 71. Greater Swiss Mountain Dog, 72. Chinese Crested, 73. Irish Setter, 74. Biewer Terrier, 75. Irish Wolfhound, 76. Soft Coated Wheaten Terrier, 77. Lagotto Romagnolo, 78. Bullmastiff, 79. Coton de Tulear, 80. Chinese Shar-Pei, 81. Alaskan Malamute, 82. Brussels Griffon, 83. Lhasa Apso, 84. Rat Terrier, 85. Keeshond, 86. Bull Terrier, 87. Old English Sheepdog, 88. Anatolian Shepherd Dog, 89. English Setter, 90. Pekingese, 91. Border Terrier, 92. Basenji, 93. Standard Schnauzer, 94. Chow Chow, 95. Dogue de Bordeaux, 96. Leonberger. All of these except the non-AKC entries are already in the bank at ranks 33–100 in approximately the old (2024) relative order.
