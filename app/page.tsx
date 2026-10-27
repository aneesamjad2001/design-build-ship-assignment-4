import { auth } from "@clerk/nextjs/server";
import { TodayView } from "@/components/TodayView";
import { Welcome } from "@/components/Welcome";

// Signed out: a welcome screen and nothing else, so no one's data can render.
export default async function Page() {
  const { userId } = await auth();
  if (!userId) return <Welcome />;
  return <TodayView />;
}
