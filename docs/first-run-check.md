# First-run checks

## Assignment 4: accounts, the database and the exercise library, Oct 27

After deploying, a subagent played a **brand-new user** of the live site
(`https://design-build-ship-assignment-4.vercel.app`). It was told not to read any
code, only to judge what a person sees, and drove a real browser (Playwright) on a
phone (390×844), with a desktop browser (1440×900) as the "other device". Persona:
goes to the gym irregularly, no plan, no muscle jargon, hates logbooks. Goal: *"make
an account, tell it the body I want, do my first workout and save it, look up a couple
of exercises and save one with a note, then come back later on another device and see
whether it remembers me."*

It signed up with a Clerk test address (`+clerk_test`, no real email). **Faked, and
said so:** a Clerk testing token, because headless Chromium stayed stuck on Clerk's bot
check ("Verifying your request…"), so that check wasn't tested; and it moved its one
workout 35 days back through Supabase's API with its own session to fake time away.
It finished with *Plan → Reset everything*, which erased all its data.

**What worked:**
- **Signed out:** only the welcome page shows. Every other page goes to sign-in.
- **Onboarding:** with no look picked, the error appears and focus moves to the looks. The keyboard-only pass works, and the focus ring is visible.
- **Feeling and length visibly change the workout:** for example *"Tired: 8–10 reps instead of 8–12, skips Plank"*, and 4 / 8 / 9 exercises for short / standard / long.
- **The workout:** weight errors appear next to the field, and swap, skip and resume all work. *"3 of 5 exercises finished, 1 partly done"* is accurate, and remembered weights go down after *Hard*.
- **The library:**
  - Searching with nothing picked shows an error.
  - It shows a loading message, then *"21 exercises for Chest + Dumbbell"*, and filtering by name works.
  - Cards without a photo say *"No photo on wger"*, every card has its CC-BY-SA credit, and descriptions show as plain text.
  - A 281+ character note is refused, and Undo restores the exercise with its note.
- **Another device:** the look, next workout, remembered weight, saved exercise and note, check-in and estimate were all there.
- **Coming back after the faked 5 weeks:** *"Welcome back after 5 weeks — easing in with two sets and lighter weights"*, with the workout cut from 65 to 45 minutes.
- **Sign-out:** goes back to the welcome page and clears the workout in progress kept in the browser.

**What it found, and what changed** (the bug was reproduced in a browser before and
after the fix):

| Finding | Change |
|---|---|
| **Bug:** removing a saved exercise showed "… removed · Undo" at the top of the page, off-screen (about 6,000 px up with results listed) | The undo notice sits right under *Your saved exercises*, where the Remove was; checked at 390 px that Undo is on screen and works |
| Switching to kg said entries were "kept exactly as typed", but Progress showed them converted (25 lb as 11.5 kg) | Says entries are converted and rounded for display, and what was typed comes back if you switch back |
| Reminders said Ironlog "has no server" (old A3 wording) | "Ironlog doesn't send notifications, so your calendar does the reminding" |
| "Your plan has 3 days a week" never changed and clashed with "no schedule to keep" | Counts the days actually ticked and says they're only nudges |
| The backup text implied saved exercises were in the file; they aren't | Says the file has your plan, workouts and check-ins, and saved exercises stay in your account |
| Muscle list used jargon (Lats, Traps, Brachialis, Serratus, Soleus) | Each has plain words: "Lats (sides of the back)", "Soleus (lower calf)" |
| wger steps showed each "•" alone on a line above its text | The bullet stays with its step (new unit test) |
| "0 workouts in the last four weeks" after a break reads like guilt | That line only shows when there's at least one |
| *Reset everything* went to onboarding without a word | "Everything erased. Your account is empty now. Pick a look to start again." |
| "Theme: System" wrapped onto two lines in the desktop header | Kept on one line |

**Left as is:**
- *The second workout jumps from ~30 to ~65 minutes.* The first workout is a deliberately light intro, and the length picker is right there.
- *"Translated with DeepL.com"* in some descriptions. That is wger's own text, shown as published.
- *Tapping + after typing "20kg" reset the box to 5.* The agent saw this once and didn't re-check it. The "20kg" error already appears next to the box.

**Limits:**
- Headless Chromium with phone emulation, not a real phone, Safari or a screen reader.
- The bot check was skipped and the gap was faked.
- wger failures (down, bad filter) weren't caused. The unit tests and the route's own states cover those.

## Assignment 3, v3: pick a body, guided workout, Oct 20

After deploying, a subagent played a **brand-new user** of the live site. It was told
not to read any code, only to judge what a person sees, and drove a real browser
(Playwright) on a phone (390×844) with a short desktop check (1440×900). Persona: goes
to the gym irregularly, no plan, no muscle jargon, hates logbooks. Goal: *"tell it the
body I want, get a workout, do my first workout, save it, then come back later and see
whether it remembers me and tells me what to do next."* It tried mistakes on purpose
(continuing without a choice, "abc" and "20kg" as weights, saving with nothing done,
keyboard only). To fake weeks away it edited the saved workout dates (and said so).

**What worked:** understood it in 5 seconds ("plain words, no jargon"); one scroll and
3 taps to a real workout; keyboard-only onboarding worked with a visible focus ring;
each exercise was "very clear for a beginner" (moving figure, set-up steps, common
mistake, how to pick a first weight); rest timer, feel buttons, skip, swap, exit and
resume all worked; every error was next to the problem and kept what was typed; and
coming back after 5 weeks said *"Welcome back after 5 weeks — easing in with two sets
and lighter weights"*, moved on to Workout B with the reason, brought back the skipped
exercise ("Skipped last time"), and lowered the remembered weights.

**What it found, and what changed** (each finding was reproduced before fixing):

| Finding | Change |
|---|---|
| **Bug:** on a phone, "Pick the look you're aiming for…" appeared below all six cards, off-screen, after the page jumped to the first card | The error now sits above the cards and the page scrolls to the question; the journey check now asserts the error is on screen |
| **Bug:** plank said "2 sets × 30–45 sec" but its tip said "start with 3 holds of 10 to 20 seconds" | Holds are 20–30 sec and the tip says "hold for the time shown… if your hips sag sooner, stop there" |
| Second visit jumped from a 5-exercise intro to 9 exercises, ~70 min | Only one skipped exercise is added back on a standard day (two on a long day) |
| Empty save screen still said "Nice work" | Says "Finish workout" until a set is done |
| "4 of 5 exercises done" counted half-done ones | "2 of 5 exercises finished, 2 partly done" |
| "20kg" rejected without saying why | "Enter just the number — weights are in lb (you can switch units on the Plan page)." |
| Open how-to pushed the weight box and set buttons two screens down | Weight and sets come first; the how-to (still open for a new exercise) sits under them |
| "Lighter weights" promised, but a 20 lb goblet squat stayed 20 lb (rounding) | After a gap, every weight drops at least one step |
| +/− moved a goblet squat dumbbell 10 lb at a time | Single-dumbbell lower-body moves step 5 lb (2.5 kg); machines and barbells keep 10 |

It also said the six body figures looked almost the same; they were redrawn just before
(separate legs, stronger shoulder and hip differences).

**Limits:** headless Chromium, not a real phone (no touch keyboard, no Safari); time
away was faked; no screen reader; backup, calendar file, check-ins and kg weren't tried
by the agent (the scripted checks cover check-ins and the estimate).

## Earlier release (version 1: goals, days per week, logbook)

After deploying, a subagent played a **brand-new user** of the live site
(`https://design-build-ship-assignment-3.vercel.app`). It was told not to read
any code, only to judge what a person sees. It drove a real browser (Playwright)
on a phone-sized screen (390×844) and a desktop (1440×900), with the goal:
*"pick a goal, get a workout, log my first session, then come back later and see
that it remembers me and tells me what to do next."* It tried to make mistakes on
purpose, simulated coming back 3 and 6 days later, explored Progress and Plan, and
tried a keyboard-only pass.

**This is agent feedback, not human testing.** It could not test screen readers,
other browsers, or real devices.

## What worked (the agent's words, condensed)

- After 5 seconds it understood the app: "your gym coach", pick a goal and days,
  "no sign-up", "stays on this device".
- Two taps from a cold start to a workout; days default to 4, so no dead end.
- The log form was "the strongest part": a top summary ("1 thing needs fixing…
  Everything you typed is still here"), each message under the offending set
  saying what to do, typed values kept, invalid fields marked, focus moved to
  the first problem, and future dates blocked.
- After saving it saw "Upper body saved, 6 sets logged" and the next workout with
  a plain-language "Why".
- Coming back worked: "Welcome back, last session lower body, 3 days ago",
  Upper body recommended because it was last trained 6 days ago, and last-time
  numbers on each lift.

## Problems found, and what was done

| # | Finding | Severity | Verified? | Decision |
|---|---|---|---|---|
| 1 | Pressing Save with nothing entered: the message sat ~2,500px below the field that got focus, so on a phone only a focused box and no explanation was visible | medium-high | **Yes** — measured at 2,561px off-screen | **Fixed.** The message now appears in the alert at the top of the form, and focus moves to that alert. |
| 2 | "Last 115 × 10 → try 120 × 6" looked like a bug (why do reps drop?) | medium | Yes | **Fixed.** It now says "(top of the range, so add weight)". |
| 3 | Keyboard: focus reset to the top after navigating; ~66 Tab presses to reach Save; goal-card focus ring looked thin and white | medium | Partly: the ring really did start white — my own color transition faded it in over ~150ms | **Fixed.** Focus moves to the new page's heading after navigation and after onboarding; a "Skip to Save session" link; focus styles no longer transition, so the yellow ring shows instantly. |
| 4 | After onboarding on mobile, the page stayed scrolled to the bottom | low-medium | Yes | **Fixed** with the same focus-and-scroll-to-top. |
| 5 | After the very first save: "Welcome back" and "1 days at the gym" | low | Yes | **Fixed.** "Nice work today" right after a session; correct singular/plural. |
| 6 | Progress is thin after one session (best = last, no trend) | low | Yes | **Not changed.** It fills in as you train; a trend chart is out of scope for "keep it simple". |
| 7 | Fixed bottom nav overlaps content; shows during onboarding | low | Content has room to scroll past it; showing the nav during onboarding is deliberate (never a dead end — Log/Progress explain "Pick a goal first") | **Not changed.** |
| 8 | Plan: button label flips between "Save plan"/"Save changes"; message below the button; rotation preview "didn't change" when switching goal | low | Label/placement yes. The preview is **not a bug**: Build muscle and Get stronger have the *same* 4-day rotation (Upper·Lower·Upper·Lower) — they differ in sets and reps, which the preview didn't show | **Fixed:** constant "Save changes", message above the button, and the goal's rep scheme now shown under the rotation. |
| — | "Reset everything" may not confirm | — | **Wrong** — it opens a confirm dialog (an existing test covers it) | No change. |

## Bugs my own fixes introduced — caught by re-running the checks

Re-running the browser suite after the fixes found two real problems in the fixes
themselves (one passed on the deployed site but failed on the dev server, which
is how it surfaced):

1. **The "saved" message vanished in development.** It was cleared in an unmount
   cleanup, and React's dev-mode StrictMode runs that cleanup right after mounting.
   The deployed site happened to work, but depending on that was fragile. It is now
   cleared when you navigate to any page other than Today.
2. **The new focus-to-heading code could misfire.** (a) It could steal focus from a
   field you had already started using, if the heading rendered late. (b) After a
   route change it compared against a heading that was already the new page's, so a
   nav click never moved focus. It now never takes focus once you're inside the
   page, and treats route changes and same-page swaps (onboarding to Today)
   differently.

The browser test script also stopped throwing on slow navigations and now reports
where it actually ended up, and waits for focus to land instead of guessing a delay.

## Questions a new user would still have (noted, not built)

Export/move data to another phone; swapping an exercise you can't do; why these
exact exercises for the goal. The first two are deliberately out of scope
(accounts and sync come next week; simplicity). "What counts toward the streak?"
and "what if I train on a different day?" are now answered in one line each on
the Today screen.

## Evidence

- `before-empty-save.jpg` / `after-empty-save.jpg` — where the empty-save message
  was, and where it is now (390px wide).
- `before-first-save-mobile.jpg` — the screen right after the first save, before
  the "Nice work today" and singular/plural fixes.
