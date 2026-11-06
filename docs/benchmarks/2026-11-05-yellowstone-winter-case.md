# One input SproutRoute gets wrong: Yellowstone in late December

November 5, 2026. Synthetic case from the October 28 model comparison (PR #42). The judge's notes quoted here are an uncalibrated model's readings; the closures are checked against official sources.

## The input

Six days in Yellowstone National Park with kids aged 7 and 10, interested in wildlife and easy hikes. The golden-set case starts 60 days after the run date, so in the October 28 run the trip was December 27 to January 1.

## What every model did

All seven models that produced a plan wrote a summer itinerary. They drove the family to Old Faithful, Grand Prismatic, Canyon, Mud Volcano and Lewis Falls as if those were ordinary drive-to stops. All seven included Tower Fall, the Canyon visitor center and the Brink of Lower Falls trail. Four plans booked dinners at lodges that close in October:

- Haiku 5.5, thinking off: four of six dinners (Canyon Lodge, Grant Village, Lake Lodge, Old Faithful Inn)
- Haiku 5.5, thinking on, and Sonnet 5.5, thinking off: Old Faithful Inn
- Haiku 4.5: Lake Yellowstone Hotel

None of them mentioned Lamar Valley. It sits on the one road open to cars in winter and is the park's main winter wildlife area, and wildlife was the family's stated interest.

Every plan still passed the program checks: complete, the right number of days, and every stop matched to the database. The opening-hours check fixed 0 or 1 stop per plan.

## What is true in winter

- The NPS news release on the 2026 winter closures: most park roads close to regular vehicles on November 1. The road from the North Entrance at Gardiner past Mammoth Hot Springs, Tower Junction and Lamar Valley to Cooke City stays open all year. Snowmobile and snowcoach travel starts December 15.
- The NPS Park Roads page: most roads are closed to regular vehicles from early November to late April, with limited guided oversnow travel from mid-December to mid-March.
- Yellowstone National Park Lodges' opening and closing dates: Old Faithful Inn, Old Faithful Lodge, Canyon Lodge, Lake Lodge, Lake Yellowstone Hotel, Grant Village and Roosevelt Lodge all close between early September and October 31. In winter, Old Faithful Snow Lodge is open from December 16 to March 7 and the Mammoth Hot Springs Hotel until early March.

## Why it failed: fix first, then test

The question to ask before writing an eval: was the agent told what to do, does it have what it needs, and does it fail only some of the time? This miss fails the first two, and it failed in 7 of 7 plans, so it needed a fix before an eval.

- **Told the opposite.** The itinerary prompt said of the shortlist, "Google Maps confirms each one exists and is open." It asked for places that are "currently open" and for 4 to 6 activities every day. Nothing mentioned seasonal closures.
- **Missing the data.** The shortlist holds Google's weekly hours, which say nothing about seasons. The opening-hours check reads the same data, which is why it didn't catch this.

## The fix and its regression test

`src/backend/services/seasonalAccess.js` holds a small, hand-checked season table, so far for Yellowstone only. When a trip falls in a closed season:

- the itinerary prompt gets a seasonal-access note: what is closed to cars, how people get in, which lodges are open, and fewer stops a day
- lodges closed for the season leave the shortlist, so duplicate repair can't add them back
- the prompt no longer says that every shortlisted place is open
- the minimum stops per day drops to 2, so repair doesn't pad short winter days

`checkSeasonalAccess` is the code check. A plan fails if a day in the closed season has a meal or stop at a closed lodge, or an interior stop with no snowcoach or snowmobile access. It runs on every generated plan for a seasonal destination and logs `trip-plan:seasonal-access` with the result. It doesn't block or retry a plan yet.

`tests/unit/seasonalAccess.test.js` keeps two of the recorded plans as fixtures, and they must keep failing the check. A winter plan on the open road, a snowcoach plan and a summer plan must pass.

## Still to do

- Run the Yellowstone case again against the fix. It is a paid run, and it shows whether the fix moves 7 of 7 failing to passing. If plans still fail some of the time, that is when an LLM judge for seasonal plausibility is worth writing.
- Give the golden set a fixed winter date for this case. Today its dates move with the run date, so the season changes from run to run.
- Add other seasonal places (Glacier's Going-to-the-Sun Road, mountain passes, beach towns in the off season) as the golden set grows.
- Check the table each autumn against the park's own pages.
