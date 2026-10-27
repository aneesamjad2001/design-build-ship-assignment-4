"use client";

import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/progress", label: "Progress" },
  { href: "/plan", label: "Plan" },
  { href: "/exercises", label: "Exercises" },
];

function Barbell() {
  return (
    <svg viewBox="0 0 40 20" className="h-5 w-10" aria-hidden>
      <rect x="1" y="5" width="4" height="10" rx="1" fill="currentColor" />
      <rect x="6" y="2" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="10" y="9" width="20" height="2" fill="currentColor" />
      <rect x="30" y="2" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="35" y="5" width="4" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Brand on top; the same four links form a thumb-height tab bar on phones
 *  and sit in the header on larger screens. aria-current marks where you are. */
export function SiteHeader() {
  const pathname = usePathname();
  // gym mode: while lifting the screen is for lifting — the card has its own Exit
  const inWorkout = pathname === "/workout";
  return (
    <header className="border-b border-line bg-bg md:sticky md:top-0 md:z-20">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-display text-2xl font-black">
          <Barbell />
          Ironlog
        </Link>
        <div className="flex items-center gap-2">
          {!inWorkout && (
          <Show when="signed-in">
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:static md:border-0 md:bg-transparent"
          >
            <ul className="mx-auto flex max-w-2xl md:gap-1">
              {LINKS.map((l) => {
                const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
                return (
                  <li key={l.href} className="flex-1 md:flex-none">
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-14 items-center justify-center border-t-4 px-2 text-base font-semibold md:px-4 md:text-lg md:border-b-4 md:border-t-0 ${
                        active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
                      }`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          </Show>
          )}
          <ThemeToggle />
          {/* account menu, including Sign out; only there when someone is signed in */}
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
      <div className="hazard h-1.5" aria-hidden />
    </header>
  );
}
