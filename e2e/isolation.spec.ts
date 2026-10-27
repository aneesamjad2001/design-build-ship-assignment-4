import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { TABLES, USER_A, USER_B } from "./users";

/**
 * Two people can't see each other's data.
 *
 * Person A uses the app normally (picks a look, saves an exercise from wger with a note).
 * Person B then checks twice: through the app, which must show none of it, and straight
 * against Supabase with B's own session token, where row-level security must refuse to
 * read, change, delete or forge A's rows. A signed-out visitor gets nothing at all.
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
// unique per run, so an old run's leftovers can never make this pass
const MARKER = `e2e note ${Date.now()}`;

interface Person {
  context: BrowserContext;
  page: Page;
  id: string;
  /** A fresh Clerk session token (they last a minute). */
  token: () => Promise<string>;
}

async function signIn(browser: Browser, email: string): Promise<Person> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/"); // the welcome page loads Clerk without needing a session
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await clerk.loaded({ page });
  const id = await page.evaluate(() => window.Clerk.user?.id ?? "");
  expect(id).toMatch(/^user_/);
  const token = async () => {
    const t = await page.evaluate(() => window.Clerk.session?.getToken());
    if (!t) throw new Error(`no session token for ${email}`);
    return t;
  };
  return { context, page, id, token };
}

/** PostgREST as whoever holds the token (or as nobody). */
async function rest(token: string | null, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}

type Row = Record<string, unknown>;
const rows = (r: { body: unknown }) => (Array.isArray(r.body) ? (r.body as Row[]) : []);

/** Start and finish from nothing. RLS limits this to the test user's own rows. */
async function wipe(p: Person) {
  const t = await p.token();
  for (const table of TABLES) {
    const r = await rest(t, `${table}?user_id=not.is.null`, { method: "DELETE" });
    expect(r.status, `wipe ${table}`).toBe(200);
  }
}

test.describe.configure({ mode: "serial" });

let a: Person;
let b: Person;
let savedWgerId: number;

test.beforeAll(async ({ browser }) => {
  a = await signIn(browser, USER_A);
  b = await signIn(browser, USER_B);
  expect(a.id).not.toBe(b.id);
  await wipe(a);
  await wipe(b);
});

test.afterAll(async () => {
  for (const p of [a, b]) {
    if (!p) continue;
    await wipe(p).catch(() => {});
    await p.context.close();
  }
});

test("a signed-out visitor sees no one's data", async ({ page, request }) => {
  await page.goto("/exercises");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/progress");
  await expect(page).toHaveURL(/\/sign-in/);

  expect((await request.get("/api/exercises?muscle=4")).status()).toBe(401);

  // the publishable key alone (no session) is refused by the database itself
  for (const table of TABLES) {
    const r = await rest(null, `${table}?select=user_id`);
    expect(r.status, `${table} without a session`).not.toBe(200);
  }
});

test("A picks a look and saves an exercise with a note", async () => {
  const { page } = a;

  await page.goto("/");
  // the radio is visually hidden inside its tile; click the tile like a person would
  await page.locator("label", { has: page.getByRole("radio") }).first().click();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page.getByRole("button", { name: "Show my plan" }).click();
  await expect.poll(async () => rows(await rest(await a.token(), "profiles?select=user_id")).length).toBe(1);

  await page.goto("/exercises");
  await page.getByLabel("Muscle", { exact: true }).selectOption({ label: "Chest" });
  await page.getByLabel("Equipment", { exact: true }).selectOption({ label: "Dumbbell" });
  await page.getByRole("button", { name: "Show exercises" }).click();
  await expect(page.getByRole("status").filter({ hasText: /exercises? for/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^Save / }).first().click();
  const saved = page.locator("#saved");
  await saved.getByRole("button", { name: /^Add a note/ }).click();
  await saved.getByRole("textbox").fill(MARKER);
  await saved.getByRole("button", { name: "Save note" }).click();
  await expect(saved.getByText(`Your note: ${MARKER}`)).toBeVisible();

  // wait until it's really in the database, under A
  await expect
    .poll(async () => rows(await rest(await a.token(), "saved_exercises?select=user_id,wger_id,note")).find((r) => r.note === MARKER))
    .toMatchObject({ user_id: a.id });
  savedWgerId = rows(await rest(await a.token(), "saved_exercises?select=wger_id,note")).find((r) => r.note === MARKER)!.wger_id as number;
});

test("B's app shows none of A's data", async () => {
  const { page } = b;

  await page.goto("/");
  // no profile of B's own, so B is asked to pick a look; A's choice isn't carried over
  await expect(page.getByRole("heading", { name: "Never walk into the gym without a plan" })).toBeVisible();

  await page.goto("/exercises");
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();
  await expect(page.getByText(MARKER)).toHaveCount(0);
});

test("B can't read, change, delete or forge A's rows in Supabase", async () => {
  const t = await b.token();

  for (const table of TABLES) {
    const all = await rest(t, `${table}?select=user_id`);
    expect(all.status).toBe(200);
    expect(rows(all).every((r) => r.user_id === b.id), `${table}: only B's rows come back`).toBe(true);

    const asked = await rest(t, `${table}?select=user_id&user_id=eq.${a.id}`);
    expect(rows(asked), `${table}: asking for A's rows by id`).toEqual([]);
  }

  const changed = await rest(t, `saved_exercises?user_id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ note: "changed by B" }) });
  expect(rows(changed), "update A's saved exercise").toEqual([]);

  const deleted = await rest(t, `saved_exercises?user_id=eq.${a.id}`, { method: "DELETE" });
  expect(rows(deleted), "delete A's saved exercise").toEqual([]);

  const deletedProfile = await rest(t, `profiles?user_id=eq.${a.id}`, { method: "DELETE" });
  expect(rows(deletedProfile), "delete A's profile").toEqual([]);

  // writing a row that claims to be A's is refused outright
  const forged = await rest(t, "saved_exercises", {
    method: "POST",
    body: JSON.stringify({ user_id: a.id, wger_id: 1, name: "Forged by B", muscles: [], equipment: [], note: "" }),
  });
  expect(forged.status, "insert a row as A").toBe(403);

  const forgedWorkout = await rest(t, "workouts", {
    method: "POST",
    body: JSON.stringify({ user_id: a.id, date: "2026-10-27", key: "A", unit: "kg", note: "", exercises: [] }),
  });
  expect(forgedWorkout.status, "insert a workout as A").toBe(403);
});

test("A's data is untouched afterwards", async () => {
  const t = await a.token();
  const mine = rows(await rest(t, "saved_exercises?select=user_id,wger_id,note,name"));
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ user_id: a.id, wger_id: savedWgerId, note: MARKER });
  expect(rows(await rest(t, "profiles?select=user_id"))).toHaveLength(1);

  await a.page.goto("/exercises");
  await expect(a.page.getByText(`Your note: ${MARKER}`)).toBeVisible();
});
