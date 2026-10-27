import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ExercisesView } from "@/components/ExercisesView";

export const metadata: Metadata = { title: "Exercise library" };

// Signed-out visitors are sent to sign-in before anything renders.
export default async function Page() {
  await auth.protect();
  return <ExercisesView />;
}
