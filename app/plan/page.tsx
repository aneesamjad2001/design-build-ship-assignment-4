import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PlanView } from "@/components/PlanView";

export const metadata: Metadata = { title: "Your plan" };

// Signed-out visitors are sent to sign-in before anything renders.
export default async function Page() {
  await auth.protect();
  return <PlanView />;
}
