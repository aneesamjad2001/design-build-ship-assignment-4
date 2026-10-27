/** The two people in the isolation test. They exist only in the Clerk development
 *  instance: `+clerk_test` addresses are Clerk's reserved test emails, so no mail is sent. */
export const USER_A = "ironlog-e2e-a+clerk_test@example.com";
export const USER_B = "ironlog-e2e-b+clerk_test@example.com";

export const TABLES = ["saved_exercises", "workouts", "checkins", "profiles"] as const;
