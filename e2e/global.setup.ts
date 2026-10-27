import { clerkSetup } from "@clerk/testing/playwright";
import { USER_A, USER_B } from "./users";

const CLERK_API = "https://api.clerk.com/v1";

/** Make sure both test users exist. Created through Clerk's backend API with no
 *  password: the test signs them in with a one-time sign-in token instead. */
async function ensureUser(email: string) {
  const headers = { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, "Content-Type": "application/json" };
  const found = await fetch(`${CLERK_API}/users?email_address=${encodeURIComponent(email)}`, { headers });
  if (!found.ok) throw new Error(`Clerk user lookup failed: ${found.status}`);
  if (((await found.json()) as unknown[]).length > 0) return;

  const made = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true }),
  });
  if (!made.ok) throw new Error(`Couldn't create test user ${email}: ${made.status} ${await made.text()}`);
}

export default async function globalSetup() {
  for (const k of ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
    if (!process.env[k]) throw new Error(`${k} is missing: add it to .env.local`);
  }
  if (!process.env.CLERK_SECRET_KEY!.startsWith("sk_test_")) {
    throw new Error("The isolation test only runs against a Clerk development instance (sk_test_ key).");
  }
  // a testing token lets the browser past Clerk's bot protection
  await clerkSetup();
  await ensureUser(USER_A);
  await ensureUser(USER_B);
}
