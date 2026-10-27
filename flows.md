# Flows

**The main task, as a sentence:**
I pick the body I want → I see my first workout right away → I do it, one exercise
at a time, ticking off sets → I come back whenever, and the app remembers me and
tells me what's next.

## The three flows

### 1. First visit, useful right away

```mermaid
flowchart TD
    S([Open Ironlog, signed out]) --> T["Welcome: what it is ·<br/>Create an account / Sign in"]
    T --> A([Signed in, nothing saved yet])
    A --> B["Home: 3-step explainer +<br/>'What body are you aiming for?'"]
    B --> C["6 looks, each a figure + plain words<br/>(honest note underneath)"]
    C --> D[Tap 'Show my plan']
    D --> E{Picked a look?}
    E -- "No" --> F["Error beside the looks,<br/>focus moves to the first one"]
    F --> C
    E -- Yes --> G["Home becomes Today:<br/>'Your first workout', a light intro, and why"]
    G --> H{Ready to lift?}
    H -- Yes --> I[Start workout]
    H -- Not now --> J["Look around: Progress shows the plan,<br/>Plan shows the three workouts"]
```

One sign-up screen (Clerk), then no tour and no empty screen: one question from a new account to a real workout.

### 2. The main task: do the workout

```mermaid
flowchart TD
    A["Today: How long do you have?<br/>How are you feeling?"] --> B[Start workout]
    B --> C["Exercise card: figure, how-to,<br/>weight box (−/+), one button per set"]
    C --> D[Tap a set → rest timer starts]
    D --> E{"How did that feel?"}
    E --> F{Next exercise}
    F -- "Weight isn't a number" --> G["Error next to the box,<br/>typed text kept, focus on it"]
    G --> C
    F -- "Machine busy" --> H["Swap dialog → same slot,<br/>right sets/reps for the new move"]
    H --> C
    F -- "Skip" --> I[Marked skipped, comes back next time]
    I --> C
    F -- "Last one done" --> J["Finish: summary, Change any, note"]
    J --> K{Save}
    K -- "No sets done / bad weight" --> L["Error summary at the top,<br/>'Fix …' buttons jump back"]
    L --> C
    K -- OK --> M["Today: 'Workout A saved,<br/>next time: Workout B'"]
```

Every tap is saved as you go, so a locked phone, a reload or a stray tap never loses
your place; Today offers "Resume workout".

### 3. Coming back, it remembers

```mermaid
flowchart TD
    A([Return days or weeks later, any device]) --> B[Ironlog loads your rows from Supabase]
    B --> C{Anything saved?}
    C -- Nothing --> D[First-visit flow]
    C -- Yes --> E["Welcome back · last workout, N days ago"]
    E --> F{Last workout less than half done?}
    F -- Yes --> G[Repeat it]
    F -- No --> H["Next in the rotation, plus anything skipped"]
    G --> I{Away 2+ weeks?}
    H --> I
    I -- Yes --> J["Easing back in: fewer sets, lighter weights"]
    I -- No --> K["Weights from last time,<br/>up after 'Easy', down after 'Hard'"]
    J --> L[Start workout]
    K --> L
    E --> M["Monthly check-in prompt (only if you've done one before, 28+ days ago)"]
```

## Screens and states (what the agent proposed, and what was kept)

The agent proposed these screens, states and errors from the flow sentence; the author
chose what to keep. Kept from the agent: resume a workout in progress, swap when a
machine is busy, repeat a mostly-unfinished workout, easing back in after a gap, undo
after delete. Cut by the author: muscle and equipment questions, streaks, a
set-by-set logbook. The full record of who decided what is in
[`docs/decisions.md`](./docs/decisions.md).


| Screen | Route | States | Errors |
|---|---|---|---|
| Welcome | `/` signed out | what Ironlog is, Create an account / Sign in | — |
| Today | `/` | loading, first visit (look picker), first workout, returning, back after a gap, tired, workout in progress | no look picked; couldn't load → banner with Try again; a change not saved → banner with Try again; unreadable rows → keep what's readable, say so |
| Workout | `/workout` | no workout in progress, exercise card (new / done before), set done + rest, skipped, swap dialog, finish, exit confirm, discard confirm | weight not a number / over 1000; no sets done |
| Progress | `/progress` | plan-only (never blank), has workouts, has check-ins, deleted (undo) | — |
| Check-in | `/checkin` | empty, saved, history, deleted (undo) | no measurement; not a number; implausible value; future date |
| Plan | `/plan` | look + live preview, units, estimate (form / result), reminders, backup, reset confirm | estimate: age (adults only), formula version, height, weight, activity |
| Exercises | `/exercises` | find form, loading, results, nothing found, no names match, saved list (empty / items), note form, removed (undo) | no muscle or equipment picked; wger down (Try again); bad filter; signed out; note too long |

Considered and **cut**: muscle or equipment questions, streaks and weekly targets,
meal logging, weight goals, daily sleep logs. (Accounts and sync were cut in Assignment 3
and added in Assignment 4.)
