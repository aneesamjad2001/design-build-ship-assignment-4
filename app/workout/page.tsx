import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { WorkoutView } from "@/components/WorkoutView";

export const metadata: Metadata = { title: "Workout" };

// Signed-out visitors are sent to sign-in before anything renders.
export default async function Page() {
  await auth.protect();
  return <WorkoutView />;
}
