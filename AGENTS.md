# Ironlog — project context

A gym coach for someone who goes to the gym irregularly and arrives with no plan: pick
the kind of body you're aiming for, get an exact workout right away, do it one exercise at
a time, and come back whenever to be told what's next. Assignment 4 (Full Stack App) turns
the Assignment 3 prototype into a multi-user app: sign-in with Clerk, data in Supabase,
and an exercise library from the wger API.

## Hard constraints (from the assignment)
- Next.js + Tailwind, **Clerk** for sign-in (development keys), **Supabase** for data,
  **one** external API (wger). Deployed on Vercel's free Hobby plan. Free tiers only.
- A signed-out visitor sees **no one's data**: every page except the landing/sign-in
  pages requires a session.
- Every table that holds someone's data has a `user_id` column and **row-level security**,
  so each person reads and writes only their own rows.
- Keys live in `.env.local` / Vercel env vars, never in code or commits. The agent is
  denied read access to `.env*` (`.claude/settings.json`); the author writes that file.
- Supabase schema changes are **migrations** (`supabase/migrations/`), never ad hoc edits.
- Work on a branch; run `/security-review` before merging.

## Data model
Clerk owns identity. Supabase trusts Clerk's session token (third-party auth), and RLS
compares `user_id` with the token's subject: `user_id = (auth.jwt() ->> 'sub')`.
`user_id` is `text` (Clerk IDs look like `user_2abc…`), defaults to the token's `sub`,
and is never taken from the request body.

| Table | One row per | Columns |
|---|---|---|
| `profiles` | person | `user_id` PK, `look_id`, `time`, `unit`, `weights` jsonb (weight memory per exercise), `nutrition` jsonb null, `created_at` |
| `workouts` | finished workout | `id` uuid PK, `user_id`, `date`, `key` (A/B/C), `unit`, `note`, `exercises` jsonb, `created_at` |
| `checkins` | monthly check-in | `id` uuid PK, `user_id`, `date`, `answers` jsonb, `created_at` |
| `saved_exercises` | exercise saved from wger | `id` uuid PK, `user_id`, `wger_id` int, `name`, `muscles` text[], `equipment` text[], `image_url` null, `note`, `saved_at`; unique (`user_id`, `wger_id`) |

RLS on all four: select / insert / update / delete only where `user_id` is the caller's.
jsonb columns are checked with the existing validators in `lib/data.ts` before use.

**localStorage is per browser, not per person.** Nothing user-owned is read from the old
`ironlog:v2` key. Only the in-progress workout stays local, under a key that includes the
Clerk user id, and it is cleared on sign-out.

## External API: wger (https://wger.de/api/v2/)
- Called **from our server** (a route handler), not the browser: responses include every
  language (16 exercises ≈ 150 KB), so the server trims them to what the UI needs and
  caches for a day. No key is needed.
- Free-text search does **not** work (`/exercise/search/` is 404; `name__icontains` is
  ignored and returns all 932). Browse with `exerciseinfo/?muscles=<id>&equipment=<id>`,
  then filter by name on our side.
- English is `language == 2` in `translations[]`. `description` is **HTML from the
  public**: strip it to plain text, never render it as HTML.
- `images[]` is often empty: show a fallback. Content is CC-BY-SA: show attribution.
- States to design: loading, nothing found (`count: 0`), API down (timeout / 5xx), bad
  filter (400).

## Product rules (from the author)
- The person picks a **look in plain words**. The plan never asks them to pick muscles;
  muscle/equipment filters exist only in the exercise library.
- No streaks, no "you missed" guilt. A gap leads to an easier workout, not a warning.
- Be honest: training builds toward a look, it never promises one (`LOOK_NOTE`,
  `CAN_AND_CANT` in `lib/looks.ts`).
- Every control that looks clickable does something, and every choice visibly changes
  what it says it changes (TA feedback on A3).
- Every form: one column, a real label on every field, errors next to the field, keep
  what was typed.
- Everything works with a keyboard; contrast is checked, not assumed.

## Design: "Iron"
Concrete and safety-yellow accent used **only** for the primary action and the focus
ring. Light and dark themes. Sentence case for headings and labels; uppercase only for
tiny tags, never for body text; no text under 14px. Big Shoulders for display, Barlow for
body. Tokens live in `app/globals.css`; use the shared components in `components/`.

## Layout
- `app/` — routes: `/` Today (also onboarding), `/workout`, `/progress`, `/checkin`,
  `/plan`, `/exercises` (wger library + saved)
- `lib/` — pure, tested logic (`looks`, `library`, `workouts`, `adapt`, `data`, …)
- `components/` — shared UI
- `supabase/migrations/` — schema and RLS
- `e2e/` — Playwright test: two users can't see each other's data
- `docs/` — research, decisions, first-run checks

## Commands
`npm run dev` · `npm run build` · `npm run lint` · `npm test` (Node's built-in test runner)

## Gotchas
- Keep `cacheComponents` / `partialPrefetching` **off** in `next.config.ts`: they keep
  old screens alive with stale form state.
- `react-hooks/purity` flags `Date.now()` in components; use `nowMs()` from `lib/clock.ts`
  in handlers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
