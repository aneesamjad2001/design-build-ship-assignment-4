import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ProgressView } from "@/components/ProgressView";

export const metadata: Metadata = { title: "Progress" };

// Signed-out visitors are sent to sign-in before anything renders.
export default async function Page() {
  await auth.protect();
  return <ProgressView />;
}
