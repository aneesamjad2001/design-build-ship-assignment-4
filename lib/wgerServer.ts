import "server-only";
import { unstable_cache } from "next/cache";
import { browseUrl, parseBrowse, type BrowseResult, type Filters, type WgerExercise } from "./wger";

class BadFilter extends Error {}

/**
 * Fetch and trim one muscle/equipment page. Only successes are cached (for a day):
 * a failure throws, and unstable_cache never stores a thrown error, so an outage
 * doesn't stick around after wger is back.
 */
const cachedBrowse = unstable_cache(
  async (muscle: number | null, equipment: number | null): Promise<{ exercises: WgerExercise[]; total: number }> => {
    const res = await fetch(browseUrl({ muscle, equipment }), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 400) throw new BadFilter();
    if (!res.ok) throw new Error(`wger ${res.status}`);
    const page = parseBrowse(await res.json());
    if (!page) throw new Error("wger returned something that isn't a page of exercises");
    return page;
  },
  // bump when the trimmed shape changes, so a day-old cache of the old shape isn't served
  ["wger-browse-v2"],
  { revalidate: 60 * 60 * 24 },
);

export async function browse(filters: Filters): Promise<BrowseResult> {
  try {
    return { ok: true, ...(await cachedBrowse(filters.muscle, filters.equipment)) };
  } catch (e) {
    if (e instanceof BadFilter) return { ok: false, reason: "bad-filter" };
    console.error("wger browse failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "down" };
  }
}
