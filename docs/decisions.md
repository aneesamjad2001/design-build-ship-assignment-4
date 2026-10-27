# Decisions

Who decided what, so it can be explained honestly in class.

## The author decided
- **The tool:** a gym tool that takes a goal ("what kind of body I want") and
  recommends exercises, then tracks days at the gym and exercises done and
  recommends what to do next based on that.
- **Four physique goals** (build muscle / lean & toned / get stronger /
  athletic) rather than three goals or body-part focus.
- **First visit asks only goal + days per week.**
- **All four retention hooks:** next-workout recommendation, weekly target +
  streak, progress on lifts, and a days-at-the-gym calendar.
- **The "Iron" visual direction** (industrial, near-black, safety yellow) over a
  chalkboard or locker-room look.

## The agent proposed (the author has not yet reviewed these in detail)
- Recommendations as **plain rules, not AI** — required by "no external APIs",
  and it keeps the "why" explainable.
- **Weekly (not daily) streaks**, after research showed Fitbod and Nike do the same.
- **A barbell that loads plates** as the week's progress visual.
- Logging rows in a logbook layout (weight | reps per set) instead of stacking
  every input vertically — a deliberate reading of "one column": fields never
  sit in side-by-side *columns of the page*, but a set pairs weight and reps.
- Hiding the stats card on the very first visit (a card of zeros is an empty
  screen in disguise) and putting the workout before the stats on return.
- Dropping the stencil numeral font after seeing it was hard to read.
- `lb` as the default unit with a kg switch that converts saved weights.

## Cut for simplicity
Accounts and sync (next week), equipment and experience questions on first
visit, editing past sessions (delete only), rest timer, exercise videos,
per-set effort ratings, notifications.

## Version 3: rebuilt around the author's own problem (Oct 20)

**The author decided:**
- **The real problem:** "I don't go to the gym often, and when I go I have no plan."
  Logging every set is a chore nobody keeps up; the app should say exactly what to do.
- **Pick a body, not muscles:** "I just want to tell it what kind of body I'm aiming
  for." No shoulder/back talk, no body map.
- **No equipment question:** assume a standard gym.
- **Keep the honest note** (training controls training; food, sleep and time matter;
  "toned" depends on body fat).
- **Build four extras:** food and sleep tips, "How are you feeling?", a monthly body
  check-in, and meal/calorie/weight tracking.
- Build it in small pieces with commits, so the work can be reviewed as it goes.

**The agent proposed (and the author accepted by building on it):**
- Three repeating full-body workouts (A/B/C) not tied to weekdays, so a missed week
  leaves no gap; easing back in after 2+ weeks; repeating a workout less than half done.
- "Finished" as one tap per set, plus remembered weights moved by Easy / Just right /
  Hard, instead of a logbook.
- Guided one-exercise-at-a-time gym mode with figures, how-to text, swap and skip.
- Dropping streaks, which punish the irregular gym-goer the app is for.
- For the fourth extra: an **optional calorie and protein estimate** (ranges, adults
  only, never below resting needs) **instead of meal logging and weight goals** —
  logging needs a food database (an outside service the assignment rules out) and is
  the chore the app removes; weight targets were flagged as risky for body image.
  The author asked for it anyway; this is the agent's call, explained in the README.

**Cut for simplicity:** muscle and equipment questions, streaks, meal logging, weight
goals, daily sleep logs, exercise videos, accounts and sync.

## Version 4: accounts, a database and one external API (Oct 26–27)

**The assignment required:** Clerk sign-in (development keys), Supabase with a
`user_id` and row-level security on every table of someone's data, exactly one
external API, deployed on Vercel's free plan, keys never in code, the agent denied
read access to `.env*` before any keys existed, the data model written into
`AGENTS.md` before building, schema changes as migrations, and `/security-review`
before merging.

**The author decided** (picked from options the agent laid out, in each case the
one the agent recommended):
- **Extend Ironlog** rather than build something new: keep A3's design and tests,
  move its data from the browser into Supabase per person.
- **wger** as the one external API (exercises with muscles, equipment and images),
  over TheMealDB and Open-Meteo from the course list, because it fits a gym app.
- **Four tables** (`profiles`, `workouts`, `checkins`, `saved_exercises`), with the
  weight memory and nutrition kept as JSON on `profiles`, rather than trimming to
  three or splitting into six.
- **Saving an exercise = a "my exercises" list with a note**, not also swapping it
  into the A/B/C plan.
- **Fix all of the TA feedback** on A3 as part of A4 (the feeling picker visibly
  changes the workout, A/B/C selectable on Today, softer type and a light theme).
- Set up the accounts and wrote `.env.local` themself, and checked each step in the
  running app (sign-in, a saved workout, the exercise library, the live site).

**The agent proposed** (and the author accepted by building on it):
- **The browser talks to Supabase directly with the Clerk session token**
  (Supabase third-party auth), so RLS is the one boundary. `user_id` defaults to the
  token's subject in the database and is never sent by the app.
- **wger is called from our own route handler**, not the browser: its answers carry
  every language (~176 KB a page, ~13 KB trimmed), descriptions are public HTML to
  strip to plain text, and the route needs a session and caches for a day. Free-text
  search turned out not to work, so it's browse by muscle and equipment, then filter
  by name in the page.
- **Nothing is read from A3's browser storage**, because it belonged to a browser,
  not a person; old training comes across with A3's backup file. Only a workout in
  progress stays local, under a key with the Clerk user id, cleared on sign-out.
- **Saving through an ordered queue** with a visible "isn't saved yet · Try again"
  instead of silently dropping a failed write.
- **Proving isolation with a test that attacks the database**, not only the screens:
  two dedicated Clerk test users, and B's own token tries to read, change, delete and
  forge A's rows. It passes against the dev server and the live site.
- **Sign-in paths in code, not env vars**, after the first deploy sent people to
  Clerk's hosted page because those paths were only in `.env.local`.

**Cut for simplicity:** swapping saved exercises into the plan, separate tables for
workout exercises and weight memory, any service-role key, and updating A3's scripted
browser checks for sign-in (the isolation test covers what A4 adds).

**A limit worth saying out loud:** the deny rule blocks the agent's file-reading tool,
not the shell; nothing technically stops `cat .env.local`. The agent didn't run it,
and when it needed to confirm a key it gave the author a command to run instead. The
tests load the keys inside their own process and never print them.

**A second reviewer (Oct 27):** at the author's request, OpenAI's Codex reviewed the
whole project and made focused fixes, which Claude then read, tested and kept:
- **Account switch:** an old Supabase client can no longer obtain the next account's token.
- **Saving:**
  - a failed save stays ahead of newer ones until *Try again* succeeds (`lib/writeQueue.ts`);
  - each profile save carries the values from the moment of the change;
  - a refresh never overwrites changes still waiting to save.
- **Units:** a workout keeps the unit it was done in, even if Plan's unit changed mid-workout.
- **Weight box:** + and − no longer throw away mistyped text; the error shows instead.
- **Phone layout:** set buttons wrap on narrow screens.
- **Library:** reopening a note shows the saved text; clearer "no English exercises" wording.

Left as is, and said so: *Reset everything* and backup restore use several requests, so
a connection failure halfway can leave part done. Making them one database
transaction would need a database function, which is more than this pass called for.

**A design pass for first-time users (Oct 27):** the author asked for the app to be
easy to navigate on first use and useful in real life. Three independent reviews ran
in parallel:
- a literature review of gym apps and first-run research (NN/g on onboarding,
  tutorials and progressive disclosure; Hoober on thumb reach; WCAG 2.5.8 target
  size; Lally 2010 on habits; app teardowns of Hevy, Strong, Fitbod and Nike
  Training Club);
- Codex's design review of every screen;
- an agent walking through the live app as a first-time user.

The research mostly confirmed choices already made (one question before a real
workout, eased weights after a gap with the reason shown, no streaks). The changes
that came out of it:
- **Onboarding:** the explainer cards are gone; the look picker follows a two-line intro.
- **Workout:**
  - Next / Skip / Swap come before the long how-to;
  - the rest bar appears only during a rest;
  - "Out of time? Finish now" ends early.
- **Plan:**
  - a tapped look or unit saves at once. This was a real bug: the old Save button was ~2,000 px down, and leaving lost the choice;
  - optional tools and the full workout lists fold into closed sections.
- **Today:** the first-visit message is said once, the links that repeated the tab bar are gone, and the check-in prompt waits below the workout.
- **Progress:** no row of zeros before a first workout.
- **Exercises:** the saved list sits above the results, and the page scrolls to the results.

**Considered, not done before the deadline:** moving the name filter into the results,
a "Use in today's workout" action from the library, and a welcome-back override
("use my usual weights").
