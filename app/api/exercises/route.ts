import { auth } from "@clerk/nextjs/server";
import { parseFilters } from "@/lib/wger";
import { browse } from "@/lib/wgerServer";

/**
 * GET /api/exercises?muscle=<id>&equipment=<id>
 *
 * Our server asks wger, so the browser never downloads every language (a page is
 * ~185 KB untrimmed) and the answer is cached for a day (see wgerServer). Signed-in
 * only, so this isn't an open proxy. Unknown ids are refused before reaching wger.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });

  const filters = parseFilters(new URL(request.url).searchParams);
  if (!filters) return Response.json({ ok: false, reason: "bad-filter" }, { status: 400 });

  const result = await browse(filters);
  if (!result.ok) return Response.json(result, { status: result.reason === "bad-filter" ? 400 : 502 });
  return Response.json(result);
}
