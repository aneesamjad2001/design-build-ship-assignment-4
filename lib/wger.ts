/**
 * The wger exercise database (https://wger.de/api/v2/), trimmed to what Ironlog shows.
 *
 * What the real API does (checked October 2026):
 *  - `exerciseinfo/` returns every language for every exercise, so 16 exercises are about
 *    150 KB. We keep the English name and a plain-text description and drop the rest.
 *  - Free-text search does not work: `exercise/search/` is a 404 and `name__icontains`
 *    is silently ignored (it returns all 932). Browsing by `muscles` and `equipment`
 *    does work, so the library browses by those and narrows by name here.
 *  - Nothing found is `{ count: 0, results: [] }`; an unknown filter id is a 400.
 *  - `description` is HTML written by the public. It is turned into plain text and
 *    never rendered as HTML.
 *  - Content is CC-BY-SA, so the UI shows the license and author.
 *
 * Muscle and equipment ids are the API's own (from `muscle/` and `equipment/`). They are
 * listed here so a request with any other id is refused before it reaches wger.
 */

export const WGER_BASE = "https://wger.de/api/v2";
const ENGLISH = 2;
export const PAGE_LIMIT = 100;

export const MUSCLES = [
  { id: 4, name: "Chest" },
  { id: 12, name: "Lats" },
  { id: 9, name: "Traps" },
  { id: 2, name: "Shoulders" },
  { id: 1, name: "Biceps" },
  { id: 5, name: "Triceps" },
  { id: 13, name: "Brachialis" },
  { id: 6, name: "Abs" },
  { id: 14, name: "Obliques" },
  { id: 3, name: "Serratus" },
  { id: 8, name: "Glutes" },
  { id: 10, name: "Quads" },
  { id: 11, name: "Hamstrings" },
  { id: 7, name: "Calves" },
  { id: 15, name: "Soleus" },
] as const;

export const EQUIPMENT = [
  { id: 7, name: "Bodyweight" },
  { id: 3, name: "Dumbbell" },
  { id: 1, name: "Barbell" },
  { id: 2, name: "EZ bar" },
  { id: 10, name: "Kettlebell" },
  { id: 12, name: "Cable machine" },
  { id: 8, name: "Bench" },
  { id: 9, name: "Incline bench" },
  { id: 6, name: "Pull-up bar" },
  { id: 11, name: "Resistance band" },
  { id: 5, name: "Swiss ball" },
  { id: 4, name: "Gym mat" },
] as const;

export interface WgerExercise {
  id: number;
  name: string;
  description: string;
  category: string;
  muscles: string[];
  musclesSecondary: string[];
  equipment: string[];
  imageUrl: string | null;
  license: string;
  author: string;
}

export interface Filters {
  muscle: number | null;
  equipment: number | null;
}

export type BrowseResult =
  | { ok: true; exercises: WgerExercise[]; total: number }
  | { ok: false; reason: "down" | "bad-filter" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const names = (v: unknown, key = "name") =>
  Array.isArray(v) ? v.filter(isObj).map((m) => str(m[key]) || str(m.name)).filter(Boolean) : [];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML from the API → plain text with paragraph and list breaks kept. Never returns markup. */
export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|ol|ul|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Only https images from wger's own host are shown. */
function safeImage(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const imgs = v.filter(isObj);
  const pick = imgs.find((i) => i.is_main === true) ?? imgs[0];
  const url = pick ? str(pick.image) : "";
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "wger.de" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** One `exerciseinfo` result → what we show, or null when it has no English name. */
export function parseExercise(raw: unknown): WgerExercise | null {
  if (!isObj(raw) || typeof raw.id !== "number" || !Number.isInteger(raw.id)) return null;
  const translations = Array.isArray(raw.translations) ? raw.translations.filter(isObj) : [];
  const en = translations.find((t) => t.language === ENGLISH && str(t.name).trim());
  if (!en) return null;
  const license = isObj(raw.license) ? str(raw.license.short_name) : "";
  return {
    id: raw.id,
    name: str(en.name).trim(),
    description: toPlainText(str(en.description)),
    category: isObj(raw.category) ? str(raw.category.name) : "",
    muscles: names(raw.muscles, "name_en"),
    musclesSecondary: names(raw.muscles_secondary, "name_en"),
    equipment: names(raw.equipment),
    imageUrl: safeImage(raw.images),
    license: license || "CC-BY-SA",
    author: str(en.license_author) || str(raw.license_author),
  };
}

/** Read filters from a query string, refusing anything that isn't one of the known ids. */
export function parseFilters(params: URLSearchParams): Filters | null {
  const pick = (key: string, list: readonly { id: number }[]) => {
    const v = params.get(key);
    if (v === null || v === "") return null;
    if (!/^\d{1,3}$/.test(v)) return undefined;
    const n = Number(v);
    return list.some((x) => x.id === n) ? n : undefined;
  };
  const muscle = pick("muscle", MUSCLES);
  const equipment = pick("equipment", EQUIPMENT);
  if (muscle === undefined || equipment === undefined) return null;
  if (muscle === null && equipment === null) return null;
  return { muscle, equipment };
}

export function browseUrl({ muscle, equipment }: Filters): string {
  const q = new URLSearchParams({ language: String(ENGLISH), limit: String(PAGE_LIMIT) });
  if (muscle !== null) q.set("muscles", String(muscle));
  if (equipment !== null) q.set("equipment", String(equipment));
  return `${WGER_BASE}/exerciseinfo/?${q}`;
}

/** A page of `exerciseinfo` → exercises sorted by name. */
export function parseBrowse(json: unknown): { exercises: WgerExercise[]; total: number } | null {
  if (!isObj(json) || !Array.isArray(json.results) || typeof json.count !== "number") return null;
  const exercises = json.results.map(parseExercise).filter((e): e is WgerExercise => e !== null);
  exercises.sort((a, b) => a.name.localeCompare(b.name));
  return { exercises, total: json.count };
}

/** Narrow a browsed list by name, ignoring case and extra spaces. */
export function matchName(exercises: WgerExercise[], query: string): WgerExercise[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return exercises;
  return exercises.filter((e) => words.every((w) => e.name.toLowerCase().includes(w)));
}
