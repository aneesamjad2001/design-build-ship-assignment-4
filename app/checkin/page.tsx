import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { CheckinView } from "@/components/CheckinView";

export const metadata: Metadata = { title: "Body check-in" };

// Signed-out visitors are sent to sign-in before anything renders.
export default async function Page() {
  await auth.protect();
  return <CheckinView />;
}
