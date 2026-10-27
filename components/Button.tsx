import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "danger";

/** One button for the whole app. Yellow (primary) appears once per screen:
 *  the action that moves the person forward. */
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 px-5 py-2.5 text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink ring-1 ring-inset ring-accent-edge hover:bg-accent-hover active:bg-accent-active",
  secondary: "border-2 border-ink text-ink hover:bg-ink hover:text-on-ink active:bg-muted",
  ghost: "px-3 text-muted underline-offset-4 hover:text-ink hover:underline",
  danger: "border-2 border-danger text-danger hover:bg-danger hover:text-on-danger",
};

export function buttonClass(variant: Variant = "secondary", className = ""): string {
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
