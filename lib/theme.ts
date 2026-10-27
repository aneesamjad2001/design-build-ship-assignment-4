/** Light, dark, or whatever the device prefers. A per-device display setting
 *  (not someone's data), kept in localStorage and applied before first paint by
 *  THEME_SCRIPT in app/layout.tsx. "system" means no data-theme attribute, so
 *  the CSS follows prefers-color-scheme. */

export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "ironlog:theme";
export const THEME_PREFS: ThemePref[] = ["system", "light", "dark"];

export function parseThemePref(v: unknown): ThemePref {
  return v === "light" || v === "dark" ? v : "system";
}

/** The header button cycles System → Light → Dark → System. */
export function nextThemePref(p: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(p) + 1) % THEME_PREFS.length];
}

export const THEME_LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

/** Runs in <head> before the body is parsed, so a saved choice never flashes the other theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
